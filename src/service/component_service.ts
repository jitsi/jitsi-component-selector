import shortid from 'shortid';

import {
    ComponentType,
    StartSessionRequest
} from '../handlers/session_handler';
import ComponentRepository from '../repository/component_repository';
import { Context } from '../util/context';

import CommandService, {
    Command,
    CommandResponse,
    CommandType
} from './command_service';
import { ComponentMetadata, ComponentState, ComponentStatus } from './component_tracker';
import ComponentRequestMapper from './mapper/component_request_mapper';
import { Component } from './selection_service';

export interface ComponentInfo {
    componentKey: string;
    lastStatusTimestamp?: Date;
    isAvailable: boolean;
    lastAvailableTimestamp?: Date;
    isInProgress: boolean;
    lastInProgressTimestamp?: Date;
    componentId?: string;
    hostname?: string;
    lastStatus?: ComponentStatus;
    metadata?: ComponentMetadata;
}

export interface ComponentServiceOptions {
    componentRepository: ComponentRepository,
    commandService: CommandService,
    componentRequestMapper: ComponentRequestMapper
}

/**
 * Service which handles sidecar requests
 */
export default class ComponentService {

    private componentRepository: ComponentRepository;
    private commandService: CommandService;
    private componentRequestMapper: ComponentRequestMapper;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentServiceOptions) {
        this.componentRepository = options.componentRepository;
        this.commandService = options.commandService;
        this.componentRequestMapper = options.componentRequestMapper;
    }

    /**
     * Starts the (jibri, jigasi etc) session
     * @param ctx request context
     * @param sessionId session identifier
     * @param startSessionRequest
     * @param componentKey component key
     */
    async start(
            ctx: Context,
            sessionId: string,
            startSessionRequest: StartSessionRequest,
            componentKey: string
    ): Promise<CommandResponse> {
        ctx.logger.info(`Start component ${componentKey} session ${sessionId}`);

        const componentCommand = <Command>{
            cmdId: ComponentService.generateCommandId(sessionId),
            type: CommandType.START,
            payload: {
                componentKey,
                componentRequest: {}
            }
        };

        if (startSessionRequest.componentParams.type === ComponentType.Jibri) {
            componentCommand.payload.componentRequest = this.componentRequestMapper
            .mapToJibriComponentRequest(sessionId, startSessionRequest);
        } else if (startSessionRequest.componentParams.type === ComponentType.SipJibri) {
            componentCommand.payload.componentRequest = this.componentRequestMapper
            .mapToSipJibriComponentRequest(sessionId, startSessionRequest);
        } else if (startSessionRequest.componentParams.type === ComponentType.Jigasi) {
            componentCommand.payload.componentRequest = this.componentRequestMapper
            .mapToJigasiComponentRequest(sessionId, startSessionRequest);
        } else {
            throw Error(`Unsupported component type ${startSessionRequest.componentParams.type}`)
        }

        return await this.commandService.sendCommand(ctx, componentKey, componentCommand);
    }


    /**
     * Stops the (jibri, jigasi etc) session
     * @param ctx request context
     * @param sessionId session identifier
     * @param componentKey component key
     */
    async stop(
            ctx: Context,
            sessionId: string,
            componentKey: string
    ): Promise<CommandResponse> {
        ctx.logger.info(`Stop component ${componentKey} session ${sessionId}`);

        const componentCommand = <Command>{
            cmdId: ComponentService.generateCommandId(sessionId),
            type: CommandType.STOP,
            payload: {
                componentKey
            }
        };

        return await this.commandService.sendCommand(ctx, componentKey, componentCommand);
    }

    /**
     * Generates an unique command id, which incorporates the session id, for easier debugging
     * @param sessionId
     * @private
     */
    private static generateCommandId(sessionId: string): string {
        return `${sessionId}_${shortid()}`;
    }

    /**
     * Gets details about the components in a group
     * @param ctx request context
     * @param group name
     */
    async getComponentsInfo(ctx: Context, group:string): Promise<Array<ComponentInfo>> {
        const componentsInfo: Array<ComponentInfo> = [];
        const componentStates: Array<ComponentState> = await this.componentRepository.trimComponentStates(ctx, group);

        componentStates.forEach(componentState => {
            const componentInfo: ComponentInfo = {
                // TODO decide values for isAvailable, isInProgress
                isAvailable: true,
                isInProgress: false,
                componentId: componentState.componentId,
                hostname: componentState.hostname,
                componentKey: componentState.componentKey,
                lastStatusTimestamp: new Date(componentState.timestamp),
                lastStatus: componentState.stats,
                metadata: componentState.metadata
            };

            componentsInfo.push(componentInfo);
        });

        return componentsInfo;
    }

    /**
     * Remove component from the in progress pool
     * @param ctx
     * @param component
     */
    async removeFromInProgress(ctx: Context, component: Component) : Promise<void> {
        ctx.logger.info(`Removing component ${JSON.stringify(component)} from the in progress pool`);

        return await this.componentRepository.removeFromInProgress(ctx, component);
    }

    /**
     * Cleanup expired components from the candidates and in progress pools
     * @param ctx
     */
    async cleanupComponents(ctx: Context) {
        const componentKeys = await this.componentRepository.getComponentsPoolKeys(ctx);

        for (const key of componentKeys) {
            ctx.logger.info(` Cleanup components pool ${key}`);
            await this.componentRepository.cleanupExpired(ctx, key);
        }
    }
}
