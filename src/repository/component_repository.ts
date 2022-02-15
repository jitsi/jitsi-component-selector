import Redis from 'ioredis';

import { ComponentState } from '../service/component_tracker';
import { Context } from '../util/context';

export interface ComponentServiceOptions {
    redisClient: Redis.Redis;
    redisScanCount: number;
    componentTtlSec: number;
}

/**
 * Service which handles redis requests
 */
export default class ComponentRepository {
    private redisClient: Redis.Redis;
    private readonly redisScanCount: number;
    private readonly componentTtlSec: number;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentServiceOptions) {
        this.redisClient = options.redisClient;
        this.redisScanCount = options.redisScanCount;
        this.componentTtlSec = options.componentTtlSec;
    }

    /**
     * Get group component states key
     * @param group name
     */
    private static getGroupComponentStatesKey(group: string) : string {
        return `components:status:${group}`;
    }

    /**
     * Save latest component status
     * @param ctx
     * @param componentState
     */
    async saveComponentState(ctx: Context, componentState: ComponentState) {
        if (componentState && componentState.componentId && componentState.timestamp) {

            await this.redisClient.hset(
                ComponentRepository.getGroupComponentStatesKey(componentState.group),
                `${componentState.componentId}`,
                JSON.stringify(componentState)
            );
        } else {
            ctx.logger.error('Skipped saving latest status, due to invalid component state', { componentState });
        }
    }

    /**
     * Return valid component states, deleting expired
     * @param ctx
     * @param group name
     */
    async trimComponentStates(ctx: Context, group: string): Promise<Array<ComponentState>> {
        let states: Array<ComponentState> = [];
        const start = process.hrtime();

        let cursor = '0';
        let scanCounts = 0;

        do {
            const result = await this.redisClient.hscan(
                ComponentRepository.getGroupComponentStatesKey(group),
                cursor,
                'match',
                '*',
                'count',
                this.redisScanCount
            );

            cursor = result[0];
            if (result[1].length > 0) {
                const componentStates = await this.getComponentStates(group, result[1]);
                const validComponentsStates = await this.filterOutAndTrimExpiredStates(ctx, componentStates);

                states = states.concat(validComponentsStates);
            }
            scanCounts++;
        } while (cursor !== '0');
        ctx.logger.debug(`Valid components states: ${states}`);

        const end = process.hrtime(start);

        ctx.logger.info(
            `Scanned ${states.length} components in ${scanCounts} scans and ${(end[0] * 1000) + (end[1] / 1000000)} ms`
        );

        //  componentStatesGauge.set(states.length);

        return states;
    }

    /**
     * Get component states
     * @param group name
     * @param componentIds
     */
    private async getComponentStates(group: string, componentIds: string[]): Promise<Array<ComponentState>> {
        const componentStatesResponse: Array<ComponentState> = [];
        const pipeline = this.redisClient.pipeline();

        componentIds.forEach((componentId: string) => {
            pipeline.hget(ComponentRepository.getGroupComponentStatesKey(group), componentId);
        });
        const componentStates = await pipeline.exec();

        for (const state of componentStates) {
            if (state[1]) {
                componentStatesResponse.push(JSON.parse(state[1]));
            }
        }

        return componentStatesResponse;
    }

    /**
     * Delete expired states
     * @param ctx
     * @param componentStates
     */
    private async filterOutAndTrimExpiredStates(
            ctx: Context,
            componentStates: Array<ComponentState>
    ): Promise<Array<ComponentState>> {
        const start = process.hrtime();
        const componentsStateResponse: Array<ComponentState> = [];
        const deletePipeline = this.redisClient.pipeline();

        for (let i = 0; i < componentStates.length; i++) {
            const state = componentStates[i];

            const expiresAt = new Date(state.timestamp + (1000 * this.componentTtlSec));
            const isValidState: boolean = expiresAt >= new Date();

            if (isValidState) {
                componentsStateResponse.push(state);
            } else {
                deletePipeline.hdel(ComponentRepository.getGroupComponentStatesKey(state.group), state.componentId);
                ctx.logger.debug('Will delete expired state:', {
                    expiresAt,
                    state
                });
            }
        }
        await deletePipeline.exec();
        const end = process.hrtime(start);

        ctx.logger.info(
            `Cleaned up ${deletePipeline.length} components state in ${(end[0] * 1000) + (end[1] / 1000000)} ms`
        );

        return componentsStateResponse;
    }
}
