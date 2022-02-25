import shortid from 'shortid';

import {
    ComponentType,
    JibriMetadata,
    JibriSinkType,
    JigasiMetadata, SipJibriMetadata,
    StartSessionRequest
} from '../handlers/session_handler';
import ComponentRepository from '../repository/component_repository';
import { Context } from '../util/context';

import CommandService, {
    Command,
    CommandResponse,
    CommandType,
    JibriRequest,
    JigasiRequest, SipJibriRequest
} from './command_service';
import { ComponentMetadata, ComponentState, ComponentStatus } from './component_tracker';
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
    sipJibriInboundEmail: string,
    sipJibriOutboundEmail: string,
    sipAddressPattern: string
}

/**
 * Service which handles sidecar requests
 */
export default class ComponentService {

    private componentRepository: ComponentRepository;
    private commandService: CommandService;
    private readonly sipJibriInboundEmail: string;
    private readonly sipJibriOutboundEmail: string;
    private readonly sipAddressPattern: string;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentServiceOptions) {
        this.componentRepository = options.componentRepository;
        this.commandService = options.commandService;
        this.sipJibriInboundEmail = options.sipJibriInboundEmail;
        this.sipJibriOutboundEmail = options.sipJibriOutboundEmail;
        this.sipAddressPattern = options.sipAddressPattern;
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
            const componentMetadata = startSessionRequest.componentParams.metadata as JibriMetadata;
            let componentRequest: JibriRequest;

            if (componentMetadata.sinkType === JibriSinkType.FILE) {
                componentRequest = ComponentService
                    .mapToBasicComponentRequest(sessionId, startSessionRequest) as JibriRequest;
                componentRequest.sinkType = JibriSinkType.FILE;
                componentRequest.serviceParams = componentMetadata.serviceParams;
            } else if (componentMetadata.sinkType === JibriSinkType.STREAM) {
                componentRequest = ComponentService
                    .mapToBasicComponentRequest(sessionId, startSessionRequest) as JibriRequest;
                componentRequest.sinkType = JibriSinkType.STREAM;
                componentRequest.youTubeStreamKey = componentMetadata.youTubeStreamKey;
            }
            componentCommand.payload.componentRequest = componentRequest;

        } else if (startSessionRequest.componentParams.type === ComponentType.SipJibri) {
            componentCommand.payload.componentRequest = this.mapToSipJibriComponentRequest(sessionId, componentKey,
                startSessionRequest);
        } else {
            const componentMetadata = startSessionRequest.componentParams.metadata as JigasiMetadata;
            const componentRequest: JigasiRequest = ComponentService
                .mapToBasicComponentRequest(sessionId, startSessionRequest) as JigasiRequest;

            componentRequest.sipCallParams = componentMetadata.sipCallParams;
            componentCommand.payload.componentRequest = componentRequest;
        }

        return await this.commandService.sendCommand(ctx, componentKey, componentCommand);
    }

    /**
     * Maps the start session request to a basic component request
     * @param sessionId
     * @param startSessionRequest
     * @private
     */
    private static mapToBasicComponentRequest(sessionId: string,
            startSessionRequest:StartSessionRequest): any {
        return {
            sessionId,
            callParams: startSessionRequest.callParams,
            callLoginParams: startSessionRequest.callLoginParams
        }
    }

    /**
     * Maps the startSessionRequest to a sip jibri request
     * @param sessionId
     * @param componentKey
     * @param startSessionRequest
     * @private
     */
    private mapToSipJibriComponentRequest(sessionId: string,
            componentKey: string,
            startSessionRequest: StartSessionRequest): SipJibriRequest {
        const componentRequest:SipJibriRequest = ComponentService
            .mapToBasicComponentRequest(sessionId, startSessionRequest) as SipJibriRequest;
        const componentMetadata = startSessionRequest.componentParams.metadata as SipJibriMetadata;

        if (!componentMetadata.sipClientParams) {
            return componentRequest;
        }

        componentRequest.sinkType = 'GATEWAY';
        if (componentMetadata.sipClientParams.autoAnswer) {
            // Inbound
            const callerDisplayName = componentMetadata.sipClientParams.displayName;

            // SIPJibri will join the web conference using as display name the name of the caller
            componentRequest.callParams.displayName = callerDisplayName;
            componentRequest.callParams.email = this.sipJibriInboundEmail;
            componentRequest.callParams.callStatsUsernameOverride = `${callerDisplayName} (inbound)`;
            componentRequest.sipClientParams = componentMetadata.sipClientParams;
        } else {
            // Outbound
            let calleeDisplayName = componentMetadata.sipClientParams.sipAddress;

            if (new RegExp(this.sipAddressPattern).test(calleeDisplayName)) {
                calleeDisplayName = calleeDisplayName.match(this.sipAddressPattern)[2];
            }

            // SIPJibri will join the web conference using as display name
            // the name of the person invited to join the meeting
            componentRequest.callParams.displayName = calleeDisplayName;
            componentRequest.callParams.email = this.sipJibriOutboundEmail;
            componentRequest.callParams.callStatsUsernameOverride = `${calleeDisplayName} (outbound)`;
            componentRequest.sipClientParams = componentMetadata.sipClientParams;
        }

        return componentRequest;
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
}
