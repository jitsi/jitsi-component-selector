import { StartSessionRequest } from '../handlers/session_handler';
import { Context } from '../util/context';

import { Component } from './selection_service';
import { ErrorResponsePayload, ResponsePayload, Session } from './session_service';

/**
 * Service which handles sidecar requests
 */
export default class ComponentService {

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
        ctx.logger.info(`Start component ${component} session ${sessionId}`);

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

}
