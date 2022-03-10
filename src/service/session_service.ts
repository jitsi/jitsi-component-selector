import { v4 as uuidv4 } from 'uuid';

import {
    ComponentType,
    SipClientParams,
    SipJibriMetadata,
    BulkInviteRequest,
    StartSessionRequest,
    StopSessionRequest,
    UpdateSessionRequest, SipCallParams, JigasiMetadata
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
    environment: string;
    status: SessionStatus;
    errorKey?: any;
    errorMessage?: any;
}

export interface SessionResponsePayload {
    sessionId: string;
    environment: string;
    region: string;
    type: ComponentType;
    componentKey: string;
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
            return {
                sessionId,
                environment: startSessionRequest.componentParams.environment,
                region: startSessionRequest.componentParams.region,
                type: startSessionRequest.componentParams.type,
                errorKey: SessionErrorType.UNAVAILABLE_COMPONENTS,
                errorMessage: 'No available candidates, please try again'
            };
        }

        ctx.logger.info(`Selected component ${JSON.stringify(component)} for session ${sessionId}`);
        let commandResponse: CommandResponse;

        try {
            commandResponse = await this.componentService.start(ctx,
                sessionId, startSessionRequest, component.key);
        } catch (error) {
            ctx.logger.info(`Unexpected error for ${component.key}`, {
                error
            });
            sessionResponsePayload = {
                sessionId,
                type: startSessionRequest.componentParams.type,
                environment: startSessionRequest.componentParams.environment,
                region: startSessionRequest.componentParams.region,
                errorKey: error.name ? error.name : SessionErrorType.INTERNAL_ERROR,
                errorMessage: error.message
            }

            return sessionResponsePayload;
        }

        if (commandResponse && commandResponse.responseType === CommandResponseType.SUCCESS) {
            ctx.logger.info(`Done, started component ${component.key} for session ${sessionId}`);
            const commandResponsePayload: CommandResponsePayload = commandResponse.payload as CommandResponsePayload;

            await this.handleStartSuccess(ctx, sessionId, startSessionRequest, commandResponsePayload);

            sessionResponsePayload = {
                sessionId,
                type: startSessionRequest.componentParams.type,
                environment: startSessionRequest.componentParams.environment,
                region: startSessionRequest.componentParams.region,
                componentKey: component.key,
                metadata: commandResponsePayload.metadata
            }
        } else {
            ctx.logger.info(`Failed to start component ${component.key} for session ${sessionId}`);

            const commandErrorResponse = commandResponse.payload as CommandErrorResponsePayload;

            // TODO handle removeFromInProgress inside handleStartFailure method
            // the method would have more then 4 params - not allowed right now
            await this.handleStartFailure(ctx, sessionId, startSessionRequest, commandErrorResponse);
            await this.componentService.removeFromInProgress(ctx, component);

            sessionResponsePayload = {
                sessionId,
                type: startSessionRequest.componentParams.type,
                environment: startSessionRequest.componentParams.environment,
                region: startSessionRequest.componentParams.region,
                componentKey: commandErrorResponse.componentKey,
                errorKey: commandErrorResponse.errorKey as unknown as SessionErrorType,
                errorMessage: commandErrorResponse.errorMessage
            }
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
        const requests: StartSessionRequest[] = this.extractStartSessionRequests(bulkInviteRequest);
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
     * Maps the BulkInviteRequest into a list of StartSessionRequest entries
     * @param bulkInviteRequest
     * @private
     */
    private extractStartSessionRequests(bulkInviteRequest: BulkInviteRequest): StartSessionRequest[] {
        const requests: StartSessionRequest[] = [];

        if (bulkInviteRequest.componentParams.type === ComponentType.SipJibri) {
            bulkInviteRequest.sipClientParams.sipAddress.forEach((sipAddress: string) => {
                const sipClientParams: SipClientParams = {
                    displayName: bulkInviteRequest.sipClientParams.displayName,
                    sipAddress,
                    autoAnswer: false
                }
                const startSessionRequest: StartSessionRequest = {
                    callParams: bulkInviteRequest.callParams,
                    componentParams: bulkInviteRequest.componentParams,
                    metadata: <SipJibriMetadata>{
                        sipClientParams
                    }
                }

                requests.push(startSessionRequest);
            })
        } else if (bulkInviteRequest.componentParams.type === ComponentType.Jigasi) {
            bulkInviteRequest.sipCallParams.to.forEach((to: string) => {
                const sipCallParams: SipCallParams = {
                    from: bulkInviteRequest.sipCallParams.from,
                    to,
                    headers: bulkInviteRequest.sipCallParams.headers
                }
                const startSessionRequest: StartSessionRequest = {
                    callParams: bulkInviteRequest.callParams,
                    componentParams: bulkInviteRequest.componentParams,
                    metadata: <JigasiMetadata>{
                        sipCallParams
                    }
                }

                requests.push(startSessionRequest);
            })
        }

        return requests;
    }

    /**
     * Handles a successful start session result, by updating session info
     * @param ctx
     * @param sessionId
     * @param startSessionRequest
     * @param commandResponsePayload
     * @private
     */
    private async handleStartSuccess(ctx: Context,
            sessionId: string,
            startSessionRequest: StartSessionRequest,
            commandResponsePayload: CommandResponsePayload) {
        const session = <Session>{
            sessionId,
            baseUrl: startSessionRequest.callParams.callUrlInfo.baseUrl,
            callName: startSessionRequest.callParams.callUrlInfo.callName,
            componentKey: commandResponsePayload.componentKey,
            componentType: startSessionRequest.componentParams.type,
            environment: startSessionRequest.componentParams.environment,
            region: startSessionRequest.componentParams.region
        };

        await this.sessionRepository.upsertSession(ctx, session);
    }

    /**
     * Handles a failed start session result, by updating session info
     * @param ctx
     * @param sessionId
     * @param startSessionRequest
     * @param commandResponse
     * @private
     */
    private async handleStartFailure(ctx: Context,
            sessionId: string,
            startSessionRequest: StartSessionRequest,
            commandResponse : CommandErrorResponsePayload) {
        const session = <Session>{
            sessionId,
            baseUrl: startSessionRequest.callParams.callUrlInfo.baseUrl,
            callName: startSessionRequest.callParams.callUrlInfo.callName,
            componentKey: commandResponse.componentKey,
            componentType: startSessionRequest.componentParams.type,
            environment: startSessionRequest.componentParams.environment,
            region: startSessionRequest.componentParams.region,
            errorKey: commandResponse.errorKey,
            errorMessage: commandResponse.errorMessage
        };

        await this.sessionRepository.upsertSession(ctx, session);
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
