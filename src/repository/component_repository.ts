import fs from 'fs';
import Redis from 'ioredis';
import path from 'path';

import { ComponentParams, ComponentType } from '../handlers/session_handler';
import { ComponentState } from '../service/component_tracker';
import { Candidate, Component } from '../service/selection_service';
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
     * Define redis custom commands
     */
    public defineRedisCustomCommands(): void {
        this.defineUpdateCandidateCommand();
        this.defineSelectCandidatesCommand();
        this.defineRemoveCandidateCommand();
    }

    /**
     * Define update_candidate command
     */
    private defineUpdateCandidateCommand(): void {
        this.redisClient.defineCommand('update_candidate', {
            numberOfKeys: 2,
            lua: fs.readFileSync(path.resolve('./src/lua/update_candidate.lua'), { encoding: 'utf8' })
        });
    }

    /**
     * Define pop_candidate command
     */
    private defineSelectCandidatesCommand(): void {
        this.redisClient.defineCommand('select_candidate', {
            numberOfKeys: 2,
            lua: fs.readFileSync(path.resolve('./src/lua/select_candidate.lua'), { encoding: 'utf8' })
        });
    }

    /**
     * Define remove_candidate command
     */
    private defineRemoveCandidateCommand() {
        this.redisClient.defineCommand('remove_candidate', {
            numberOfKeys: 2,
            lua: fs.readFileSync(path.resolve('./src/lua/remove_candidate.lua'), { encoding: 'utf8' })
        });
    }

    /**
     * Update candidates
     * @param ctx
     * @param score component score
     * @param component component data
     */
    public async updateCandidate(ctx: Context, score: number, component: Component): Promise<number> {
        const candidatesPoolKey = this.getCandidatesPoolKey(component);
        const inProgressPoolKey = this.getInProgressPoolKey(component);

        const start = process.hrtime();

        let response;

        try {
            // @ts-ignore
            response = await this.redisClient.update_candidate(candidatesPoolKey,
                inProgressPoolKey, score, JSON.stringify(component));
            ctx.logger.info(`Result from running lua script 'update_candidate' ${JSON.stringify(response)}`);
        } catch (err) {
            ctx.logger.error(`Error while running lua script 'update_candidate': ${err}`, { err });
        }

        const end = process.hrtime(start);

        ctx.logger.info(`Took ${(end[0] * 1000) + (end[1] / 1000000)} ms
        to run 'update_candidates' script`);

        return response;
    }

    /**
     * Select component from the candidates
     * @param ctx
     * @param componentParams
     * @param score component score
     */
    public async selectCandidate(ctx: Context, componentParams: ComponentParams,
            score: number): Promise<Candidate> {
        const candidatesPoolKey = this.getCandidatesPoolKey(componentParams);
        const inProgressPoolKey = this.getInProgressPoolKey(componentParams);

        const start = process.hrtime();

        let response;

        try {
            // @ts-ignore
            response = await this.redisClient.select_candidate(candidatesPoolKey, inProgressPoolKey, score);
            ctx.logger.info(`Result from running lua script 'select_candidate' ${JSON.stringify(response)}`);
        } catch (err) {
            ctx.logger.error(`Error while running lua script 'select_candidate': ${err}`, { err });
        }

        const end = process.hrtime(start);

        ctx.logger.info(`Took ${(end[0] * 1000) + (end[1] / 1000000)} ms to run 'select_candidate' script`);

        if (response && response[0] && response[1]) {
            return { component: JSON.parse(response[0]),
                score: Number(response[1]) }
        }

        return null;
    }

    /**
     * Remove component from pool
     * @param ctx
     * @param component component data
     */
    public async removeCandidate(ctx: Context, component: Component): Promise<Array<number>> {
        const candidatesPoolKey = this.getCandidatesPoolKey(component);
        const inProgressPoolKey = this.getInProgressPoolKey(component);

        const start = process.hrtime();

        let response;

        try {
            // @ts-ignore
            response = await this.redisClient.remove_candidate(candidatesPoolKey,
                inProgressPoolKey, JSON.stringify(component));
            ctx.logger.info(`Result from running lua script 'remove_candidate' ${JSON.stringify(response)}`);
        } catch (err) {
            ctx.logger.error(`Error while running lua script 'remove_candidate': ${err}`, { err });
        }

        const end = process.hrtime(start);

        ctx.logger.info(`Took ${(end[0] * 1000) + (end[1] / 1000000)} ms to
        run 'remove_component_from_pool' script`);

        return response;
    }

    /**
     * Return all the candidates from the candidates pool, ordered from the highest to the lowest score
     * @param ctx
     * @param componentParams
     */
    public async getAllCandidatesSorted(ctx: Context, componentParams: ComponentParams): Promise<Array<Candidate>> {
        const candidates: Array<Candidate> = [];
        const candidatesPoolKey = this.getCandidatesPoolKey(componentParams);

        const start = process.hrtime();

        const items = await this.redisClient.zrevrange(candidatesPoolKey, 0, -1, 'WITHSCORES');

        for (let i = 0; i < items.length; i += 2) {
            candidates.push({ component: JSON.parse(items[i]),
                score: Number(items[i + 1]) });
        }

        const end = process.hrtime(start);

        const candidatesSize = items.length > 0 ? items.length / 2 : 0;

        ctx.logger.info(`Returned ${candidatesSize} candidates in ${(end[0] * 1000) + (end[1] / 1000000)} ms`);

        return candidates;
    }

    /**
     * Remove component from the in progress pool
     * @param ctx
     * @param component
     */
    async removeFromInProgress(ctx: Context, component: Component) : Promise<void> {
        const inProgressPoolKey = this.getInProgressPoolKey(component);

        ctx.logger.info(`Removing component ${component.key} from the in progress pool ${inProgressPoolKey}`);
        await this.redisClient.zrem(inProgressPoolKey, JSON.stringify(component));
    }

    /**
     * Return the group name
     * @param environment
     * @param region
     * @param type
     */
    private getGroupIdentifier(environment: string, region: string, type: ComponentType) {
        return environment
            .concat('-')
            .concat(region)
            .concat('-')
            .concat(type);
    }

    /**
     * Get candidates pool key
     * @param component
     */
    private getCandidatesPoolKey(component: ComponentParams | Component) : string {
        const group = this.getGroupIdentifier(component.environment, component.region, component.type);

        return `candidates:${group}`;
    }

    /**
     * Get in progress pool key
     * @param component
     */
    private getInProgressPoolKey(component: ComponentParams | Component) : string {
        const group = this.getGroupIdentifier(component.environment, component.region, component.type);

        return `inProgress:${group}`;
    }

    /**
     * Get components state pool key
     * @param group
     */
    public getComponentsStatePoolKeyBy(group: string) : string {
        return `components:state:${group}`;
    }

    /**
     * Get components state pool key
     * @param component
     */
    private getComponentsStatePoolKey(component: Component| ComponentParams | ComponentState) : string {
        const group = this.getGroupIdentifier(component.environment, component.region, component.type);

        return this.getComponentsStatePoolKeyBy(group);
    }

    /**
     * Save latest component state
     * @param ctx
     * @param componentState
     */
    async saveComponentState(ctx: Context, componentState: ComponentState) {
        if (componentState && componentState.componentId && componentState.timestamp) {

            await this.redisClient.hset(
                this.getComponentsStatePoolKey(componentState),
                `${componentState.componentId}`,
                JSON.stringify(componentState)
            );
        } else {
            ctx.logger.error('Skipped saving latest status, due to invalid component state: '
                + `${JSON.stringify(componentState)}`);
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

        const componentsPoolKey = this.getComponentsStatePoolKeyBy(group);

        do {
            const result = await this.redisClient.hscan(
                componentsPoolKey,
                cursor,
                'match',
                '*',
                'count',
                this.redisScanCount
            );

            cursor = result[0];
            if (result[1].length > 0) {
                const componentStates = await this.getComponentStates(componentsPoolKey, result[1]);
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
     * @param componentsKey
     * @param componentIds
     */
    private async getComponentStates(componentsKey: string, componentIds: string[]): Promise<Array<ComponentState>> {
        const componentStatesResponse: Array<ComponentState> = [];
        const pipeline = this.redisClient.pipeline();

        componentIds.forEach((componentId: string) => {
            pipeline.hget(componentsKey, componentId);
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
                const componentsPoolKey = this.getComponentsStatePoolKey(state);

                deletePipeline.hdel(componentsPoolKey, state.componentId);
                ctx.logger.debug(`Will delete expired state: expiredAt ${expiresAt}, state ${JSON.stringify(state)}`);
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
