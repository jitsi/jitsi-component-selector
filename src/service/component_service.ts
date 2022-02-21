import { StartSessionRequest } from '../handlers/session_handler';
import ComponentRepository from '../repository/component_repository';
import { Context } from '../util/context';

import { ComponentMetadata, ComponentState, ComponentStatus } from './component_tracker';
import { Component } from './selection_service';
import { ErrorResponsePayload, ResponsePayload, Session } from './session_service';

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
    componentRepository: ComponentRepository
}

/**
 * Service which handles sidecar requests
 */
export default class ComponentService {

    private componentRepository: ComponentRepository;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentServiceOptions) {
        this.componentRepository = options.componentRepository;
    }

    /**
     * Starts the (jibri, jigasi etc) session
     * @param ctx request context
     * @param sessionId
     * @param requestPayload
     * @param component
     */
    async start(
            ctx: Context,
            sessionId: string,
            requestPayload: StartSessionRequest,
            component: Component
    ): Promise<ResponsePayload | ErrorResponsePayload> {
        ctx.logger.info(`Start component ${JSON.stringify(component)} session ${sessionId}`);

        return {
            sessionId,
            region: requestPayload.componentParams.region,
            type: requestPayload.componentParams.type,
            componentKey: 'componentKeyValue'
        };
    }

    /**
     * Stops the (jibri, jigasi etc) session
     * @param ctx request context
     * @param session
     */
    async stop(
            ctx: Context,
            session: Session
    ): Promise<ResponsePayload | ErrorResponsePayload> {
        ctx.logger.info(`Stop component ${session.componentType} session ${session.sessionId}`);

        return {
            sessionId: session.sessionId,
            region: session.region,
            type: session.componentType,
            componentKey: session.componentKey
        };
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
                lastStatus: componentState.status,
                metadata: componentState.metadata
            };

            componentsInfo.push(componentInfo);
        });

        return componentsInfo;
    }


}
