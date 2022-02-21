import { v4 as uuidv4 } from 'uuid';

import {
    ComponentType,
    StartSessionRequest,
    StopSessionRequest,
    UpdateSessionRequest
} from '../handlers/session_handler';
import SessionRepository from '../repository/session_repository';
import { Context } from '../util/context';

import ComponentService from './component_service';
import SelectionService, { Component } from './selection_service';

export enum SessionStatus {
    On = 'ON',
    Off = 'OFF',
    Error = 'ERROR',
}

export interface Session {
    sessionId: string;
    baseUrl: string;
    callName: string;
    componentKey: string;
    componentType: ComponentType;
    region: string;
    status: SessionStatus;
}

// TO BE MOVED
export interface ResponsePayload {
    sessionId: string;
    region: string;
    type: ComponentType;
    componentKey: string;
    metadata?: any;
}

// TO BE MOVED
export enum ErrorType {
    UNAVAILABLE_COMPONENTS = 'unavailable.components',
    COMPONENT_NOT_STARTED = 'component.not.started',
    TIMEOUT = 'timeout',
    CONNECTION_ERROR = 'connection.error',
    INTERNAL_ERROR = 'internal.error',
}

// TO BE MOVED
export interface ErrorResponsePayload {
    sessionId: string;
    region: string;
    type: ComponentType;
    componentKey: string;
    errorKey: ErrorType;
    errorMessage: string;
}

export interface SessionsServiceOptions {
    selectionService: SelectionService;
    sessionRepository: SessionRepository;
    componentService: ComponentService;
}

/**
 * Service which handles session-based requests
 */
export default class SessionsService {

    private sessionRepository: SessionRepository;
    private selectionService: SelectionService;
    private componentService: ComponentService;

    /**
     * Constructor
     * @param options options
     */
    constructor(options: SessionsServiceOptions) {
        this.sessionRepository = options.sessionRepository;
        this.selectionService = options.selectionService;
        this.componentService = options.componentService;
    }

    /**
     * Starts a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     * @param requestPayload
     */
    async startSession(ctx: Context,
            requestPayload: StartSessionRequest
    ): Promise<ResponsePayload | ErrorResponsePayload> {
        const sessionId = uuidv4();

        ctx.logger.info(`Starting session ${sessionId}`);

        const component : Component = await this.selectionService.selectComponent(
            ctx,
            requestPayload
        );

        // todo component not found
        ctx.logger.info(`Selected component ${JSON.stringify(component)} for session ${sessionId}`);
        const responsePayload = await this.componentService.start(ctx, sessionId, requestPayload, component);

        if (requestPayload && responsePayload.hasOwnProperty('errorKey')) {
            return responsePayload;
        }

        const session = <Session>{
            sessionId,
            baseUrl: requestPayload.callParams.callUrlInfo.baseUrl,
            callName: requestPayload.callParams.callUrlInfo.callName,
            componentKey: responsePayload.componentKey,
            componentType: requestPayload.componentParams.type,
            region: requestPayload.componentParams.region
        };

        await this.sessionRepository.upsertSession(ctx, session);

        return responsePayload;
    }

    /**
     * Stops a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     * @param stopSessionRequest
     */
    async stopSession(ctx: Context,
            stopSessionRequest: StopSessionRequest
    ): Promise<ResponsePayload | ErrorResponsePayload> {
        ctx.logger.info(`Stopping session ${stopSessionRequest.sessionId}`);

        const session: Session = await this.sessionRepository.getSession(ctx, stopSessionRequest.sessionId);

        if (session) {
            // todo check if customer's domain == session.domain
            return await this.componentService.stop(
                    ctx,
                    session
            );
        }

        return null;
    }

    /**
     * Gets the details of a (recording, dial-out etc) session
     * @param ctx request context
     * @param sessionId
     */
    async getSession(ctx: Context, sessionId: string): Promise<Session> {
        ctx.logger.info('Get session');

        // todo check if customer's domain == session.domain
        return await this.sessionRepository.getSession(ctx, sessionId);
    }

    /**
     * Status updates for a (recording, dial-out etc) session
     * @param ctx request context
     * @param updateSessionRequest
     * @param sessionId
     */
    async updateSession(ctx: Context, updateSessionRequest: UpdateSessionRequest, sessionId: string): Promise<Session> {
        const session: Session = await this.sessionRepository.getSession(ctx, sessionId);

        if (session) {
            session.status = updateSessionRequest.status;
            await this.sessionRepository.upsertSession(ctx, session);

            return session;
        }

        return null;
    }
}
