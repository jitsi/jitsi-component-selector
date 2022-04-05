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
    CommandResponseType,
    ErrorType
} from './command_service';
import ComponentService from './component_service';
import SessionRequestsMapper from './mapper/session_request_mapper';
import SessionResponseMapper from './mapper/session_response_mapper';
import SelectionService, { Component } from './selection_service';

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
    failure?: any;
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
            const session = await this.handleStartFailure(ctx, startSessionRequest, commandErrorResponse, component);

            return SessionResponseMapper.mapToFailedSessionResponse(session);
        }

        if (commandResponse && commandResponse.responseType === CommandResponseType.SUCCESS) {
            ctx.logger.info(`Done, started component ${component.key} for session ${sessionId}`);
            const commandResponsePayload: CommandResponsePayload = commandResponse.payload as CommandResponsePayload;

            const session = await this.handleStartSuccess(ctx, startSessionRequest, commandResponsePayload);

            sessionResponsePayload = SessionResponseMapper
                .mapToSessionResponse(session, commandResponsePayload.metadata);
        } else {
            ctx.logger.info(`Failed to start component ${component.key} for session ${sessionId}`);
            const commandErrorResponse = commandResponse.payload as CommandErrorResponsePayload;

            const session = await this.handleStartFailure(ctx, startSessionRequest, commandErrorResponse, component);

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
     * Handles a successful start session result, by updating session info
     * @param ctx
     * @param startSessionRequest
     * @param commandResponsePayload
     * @private
     */
    private async handleStartSuccess(ctx: Context,
            startSessionRequest: StartSessionRequest,
            commandResponsePayload: CommandResponsePayload): Promise<Session> {
        const session = <Session>{
            sessionId: commandResponsePayload.sessionId,
            baseUrl: startSessionRequest.callParams.callUrlInfo.baseUrl,
            callName: startSessionRequest.callParams.callUrlInfo.callName,
            componentKey: commandResponsePayload.componentKey,
            componentType: startSessionRequest.componentParams.type,
            environment: startSessionRequest.componentParams.environment,
            region: startSessionRequest.componentParams.region,
            status: SessionStatus.PENDING,
            updatedAt: Date.now()
        };

        await this.sessionRepository.upsertSession(ctx, session);

        return session;
    }

    /**
     * Handles a failed start session result, by updating session info
     * @param ctx
     * @param startSessionRequest
     * @param commandResponse
     * @param component
     * @private
     */
    private async handleStartFailure(ctx: Context,
            startSessionRequest: StartSessionRequest,
            commandResponse: CommandErrorResponsePayload,
            component : Component): Promise<Session> {
        const session = <Session>{
            sessionId: commandResponse.sessionId,
            baseUrl: startSessionRequest.callParams.callUrlInfo.baseUrl,
            callName: startSessionRequest.callParams.callUrlInfo.callName,
            componentKey: commandResponse.componentKey,
            componentType: startSessionRequest.componentParams.type,
            environment: startSessionRequest.componentParams.environment,
            region: startSessionRequest.componentParams.region,
            status: commandResponse.errorKey === ErrorType.TIMEOUT ? SessionStatus.PENDING : SessionStatus.OFF,
            updatedAt: Date.now(),
            errorKey: commandResponse.errorKey,
            errorMessage: commandResponse.errorMessage
        };

        await this.componentService.removeFromInProgress(ctx, component);
        await this.sessionRepository.upsertSession(ctx, session);

        return session;
    }

    /**
     * Stops a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     * @param stopSessionRequest
     */
    async stopSession(ctx: Context,
            stopSessionRequest: StopSessionRequest
    ): Promise<SessionResponsePayload | SessionErrorResponsePayload> {
        ctx.logger.info(`Stopping session ${stopSessionRequest.sessionId}`);
        let sessionResponsePayload;

        const session: Session = await this.sessionRepository.getSession(ctx, stopSessionRequest.sessionId);

        if (!session) {
            return null;
        }

        // todo check if customer's domain == session.domain
        const commandResponse: CommandResponse = await this.componentService.stop(ctx,
            session.sessionId,
            session.componentKey);

        if (commandResponse && commandResponse.responseType === CommandResponseType.SUCCESS) {
            ctx.logger.info(`Done, stopped component ${session.componentKey} for session ${session.sessionId}`);
            const commandResponsePayload: CommandResponsePayload = commandResponse.payload as CommandResponsePayload;

            // TODO handle stop success

            sessionResponsePayload = {
                sessionId: session.sessionId,
                type: session.componentType,
                environment: session.environment,
                region: session.region,
                componentKey: session.componentKey,
                status: SessionStatus.OFF,
                metadata: commandResponsePayload.metadata
            };
        } else {
            ctx.logger.info(`Failed to stop component ${session.componentKey} for session ${session.sessionId}`);

            // TODO handle stop failure

            const commandErrorResponse = commandResponse.payload as CommandErrorResponsePayload;

            sessionResponsePayload = {
                sessionId: session.sessionId,
                type: session.componentType,
                environment: session.environment,
                region: session.region,
                componentKey: session.componentKey,
                status: session.status,
                errorKey: commandErrorResponse.errorKey as unknown as SessionErrorType,
                errorMessage: commandErrorResponse.errorMessage
            }
        }

        return sessionResponsePayload;
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
