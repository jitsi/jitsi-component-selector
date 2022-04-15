import { v4 as uuidv4 } from 'uuid';

import {
    BulkInviteRequest,
    ComponentType,
    JigasiMetadata,
    SipJibriMetadata,
    StartSessionRequest,
    StopSessionRequest
} from '../handlers/session_handler';
import SessionRepository from '../repository/session_repository';
import { Context } from '../util/context';

import {
    CommandErrorResponsePayload,
    CommandResponse,
    CommandResponsePayload,
    CommandResponseType
} from './command_service';
import ComponentService from './component_service';
import SessionRequestsMapper from './mapper/session_request_mapper';
import SessionResponseMapper from './mapper/session_response_mapper';
import SelectionService, { Component } from './selection_service';
import { JibriFailure, SessionTracker } from './session_tracker';

export enum SessionStatus {
    ON = 'ON',
    OFF = 'OFF',
    PENDING = 'PENDING',
    UNDEFINED = 'UNDEFINED'
}

export interface Session {
    sessionId: string;
    baseUrl: string;
    callName: string;
    componentKey: string;
    componentType: ComponentType;
    region: string;
    environment: string;
    status: SessionStatus;
    updatedAt: number;
    errorKey?: any;
    errorMessage?: any;
    failure?: JibriFailure;
    shouldRetry?: boolean;
}

export interface SessionResponsePayload {
    sessionId: string;
    environment: string;
    region: string;
    type: ComponentType;
    componentKey: string;
    status: SessionStatus;
    metadata?: any;
}

export enum SessionErrorType {
    UNAVAILABLE_COMPONENTS = 'unavailable.components',
    COMPONENT_NOT_STARTED = 'component.not.started',
    INTERNAL_ERROR = 'internal.error',
    TIMEOUT = 'timeout',
    CONNECTION_ERROR = 'connection.error'
}

export interface SessionErrorResponsePayload {
    sessionId: string;
    environment: string;
    region: string;
    type: ComponentType;
    componentKey?: string;
    status: SessionStatus;
    errorKey: SessionErrorType;
    errorMessage: string;
}

export interface SessionsServiceOptions {
    selectionService: SelectionService;
    sessionRepository: SessionRepository;
    sessionTracker: SessionTracker;
    componentService: ComponentService;
}

/**
 * Service which handles session-based requests
 */
export default class SessionsService {

    private sessionRepository: SessionRepository;
    private sessionTracker: SessionTracker;
    private selectionService: SelectionService;
    private componentService: ComponentService;

    /**
     * Constructor
     * @param options options
     */
    constructor(options: SessionsServiceOptions) {
        this.sessionRepository = options.sessionRepository;
        this.sessionTracker = options.sessionTracker;
        this.selectionService = options.selectionService;
        this.componentService = options.componentService;
        this.startSession = this.startSession.bind(this);
        this.bulkInvite = this.bulkInvite.bind(this);
        this.stopSession = this.stopSession.bind(this);
        this.getSession = this.getSession.bind(this);
        this.cleanupSessions = this.cleanupSessions.bind(this);
    }

    /**
     * Starts a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     * @param startSessionRequest
     */
    async startSession(ctx: Context,
            startSessionRequest: StartSessionRequest
    ): Promise<SessionResponsePayload | SessionErrorResponsePayload> {
        let sessionResponsePayload;
        const sessionId = uuidv4();

        ctx.logger.info(`Starting session ${sessionId}`);

        const component : Component = await this.selectionService.selectComponent(
            ctx,
            startSessionRequest.componentParams
        );

        if (!component || !component.key) {
            return SessionResponseMapper.mapToUnavailableSessionResponse(sessionId, startSessionRequest);
        }

        ctx.logger.info(`Selected component ${JSON.stringify(component)} for session ${sessionId}`);
        let commandResponse: CommandResponse;

        try {
            commandResponse = await this.componentService.start(ctx,
                sessionId, startSessionRequest, component.key);
        } catch (error) {
            ctx.logger.error(`Unexpected error for ${component.key}: ${JSON.stringify(error)}`);

            const commandErrorResponse : CommandErrorResponsePayload = {
                componentKey: component.key,
                sessionId,
                errorKey: error.name ? error.name : SessionErrorType.INTERNAL_ERROR,
                errorMessage: error.message
            }

            await this.componentService.removeFromInProgress(ctx, component);
            const session = await this.sessionTracker.trackStartFailure(ctx, startSessionRequest,
                commandErrorResponse);

            return SessionResponseMapper.mapToFailedSessionResponse(session);
        }

        if (commandResponse && commandResponse.responseType === CommandResponseType.SUCCESS) {
            ctx.logger.info(`Done, started component ${component.key} for session ${sessionId}`);
            const commandResponsePayload: CommandResponsePayload = commandResponse.payload as CommandResponsePayload;

            const session = await this.sessionTracker.trackStartPending(ctx, startSessionRequest,
                commandResponsePayload);

            sessionResponsePayload = SessionResponseMapper
                .mapToSessionResponse(session, commandResponsePayload.metadata);
        } else {
            ctx.logger.info(`Failed to start component ${component.key} for session ${sessionId}`);
            const commandErrorResponse = commandResponse.payload as CommandErrorResponsePayload;

            await this.componentService.removeFromInProgress(ctx, component);
            const session = await this.sessionTracker.trackStartFailure(ctx, startSessionRequest,
                commandErrorResponse);

            sessionResponsePayload = SessionResponseMapper.mapToFailedSessionResponse(session);
        }

        return sessionResponsePayload;

    }

    /**
     * Invites multiple destinations to join the meeting.
     * This results in multiple sessions being started, one for each destination.
     * @param ctx
     * @param bulkInviteRequest
     */
    async bulkInvite(ctx: Context,
            bulkInviteRequest: BulkInviteRequest
    ): Promise<any> {
        const requests: StartSessionRequest[] = SessionRequestsMapper.mapToStartSessionRequests(bulkInviteRequest);
        const successfulInvites = [];
        const failedInvites = [];

        for (const request of requests) {
            let destination;

            if (request.componentParams.type === ComponentType.SipJibri) {
                const metadata = request.metadata as SipJibriMetadata;

                destination = metadata.sipClientParams.sipAddress;
            } else if (request.componentParams.type === ComponentType.Jigasi) {
                const metadata = request.metadata as JigasiMetadata;

                destination = metadata.sipCallParams.to;
            }

            const response = await this.startSession(ctx, request);

            if (response.hasOwnProperty('errorKey')) {
                const errorResponse = response as SessionErrorResponsePayload;

                failedInvites.push({
                    destination,
                    sessionId: errorResponse.sessionId,
                    error: {
                        errorKey: errorResponse.errorKey,
                        errorMessage: errorResponse.errorMessage
                    }
                });
            } else {
                const successfulResponse = response as SessionResponsePayload;

                successfulInvites.push({
                    destination,
                    sessionId: successfulResponse.sessionId
                });
            }
        }

        return {
            successfulInvites,
            failedInvites
        };
    }


    /**
     * Stops a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     * @param stopSessionRequest
     */
    async stopSession(ctx: Context,
            stopSessionRequest: StopSessionRequest
    ): Promise<void> {
        ctx.logger.info(`Stopping session ${stopSessionRequest.sessionId}`);

        const session: Session = await this.sessionRepository.getSession(ctx, stopSessionRequest.sessionId);

        if (!session) {
            return null;
        }

        // todo check if customer's domain == session.domain

        this.componentService.stop(ctx, session.sessionId, session.componentKey)
            .then(commandResponse => {
                if (commandResponse && commandResponse.responseType === CommandResponseType.SUCCESS) {
                    ctx.logger.info(`Done, stopped component ${session.componentKey} for session ${session.sessionId}`);
                    this.sessionTracker.trackStopSuccess(ctx, session);
                } else {
                    ctx.logger.info(`Failed to stop component ${session.componentKey} `
                        + `for session ${session.sessionId}`);
                    const commandErrorResponsePayload = commandResponse.payload as CommandErrorResponsePayload;

                    this.sessionTracker.trackStopFailure(ctx, session, commandErrorResponsePayload);
                }
            })
    }


    /**
     * Gets the details of a (recording, dial-out etc) session
     * @param ctx request context
     * @param sessionId
     */
    async getSession(ctx: Context, sessionId: string): Promise<Session> {
        ctx.logger.info(`Get session by id ${sessionId}`);

        // todo check if customer's domain == session.domain
        return await this.sessionRepository.getSession(ctx, sessionId);
    }

    /**
     * Cleanup older sessions
     * @param ctx request context
     */
    async cleanupSessions(ctx: Context):Promise<void> {
        ctx.logger.info('Cleanup expired sessions');

        return await this.sessionRepository.cleanupExpired(ctx);
    }
}
