import { StartSessionRequest } from '../handlers/session_handler';
import SessionRepository from '../repository/session_repository';
import { Context } from '../util/context';

import { CommandErrorResponsePayload, CommandResponsePayload, ErrorType } from './command_service';
import { Session, SessionStatus } from './session_service';

export enum FailureReason {
    BUSY='BUSY',
    ERROR ='ERROR',
    UNDEFINED = 'UNDEFINED'
}

export enum ErrorScope {
    SESSION='SESSION',
    SYSTEM='SYSTEM'
}

export interface JibriError {
    scope: ErrorScope,
    detail: String
}

export interface JibriFailure {
    reason?: FailureReason,
    error?: JibriError
}

export interface SessionReport {
    sessionId: string;
    status: SessionStatus,
    sipAddress?: string,
    failure?: JibriFailure,
    shouldRetry?: boolean
    timestamp?: number;
}

export interface SessionTrackerOptions {
    sessionRepository: SessionRepository
}

/**
 * Service which tracks session status updates
 */
export class SessionTracker {
    private sessionRepository: SessionRepository;

    /**
     * Constructor
     * @param options
     */
    constructor(options: SessionTrackerOptions) {
        this.sessionRepository = options.sessionRepository;
        this.track = this.track.bind(this);
        this.trackStartPending = this.trackStartPending.bind(this);
        this.trackStartFailure = this.trackStartFailure.bind(this);
        this.trackStopSuccess = this.trackStopSuccess.bind(this);
        this.trackStopFailure = this.trackStopFailure.bind(this);
    }

    /**
     * Track status updates for a (recording, dial-out etc) session
     * @param ctx request context
     * @param report
     */
    async track(ctx: Context, report: SessionReport): Promise<void> {
        ctx.logger.debug(`Received session report ${JSON.stringify(report)}`);

        const session: Session = await this.sessionRepository.getSession(ctx, report.sessionId);

        if (!session) {
            ctx.logger.info(`No session was found with this id ${report.sessionId
            } ,ignoring updates`);

            return;
        }

        session.failure = report.failure;
        session.shouldRetry = report.shouldRetry;
        session.status = report.status;

        const sessionReportTimestamp = Number(report.timestamp);

        session.updatedAt = sessionReportTimestamp ? report.timestamp : Date.now();

        await this.sessionRepository.upsertSession(ctx, session);
    }

    /**
     * Handles a successful start session result, by updating session info
     * @param ctx
     * @param startSessionRequest
     * @param commandResponsePayload
     * @private
     */
    async trackStartPending(ctx: Context,
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
    async trackStartFailure(ctx: Context,
            startSessionRequest: StartSessionRequest,
            commandResponse: CommandErrorResponsePayload): Promise<Session> {
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

        await this.sessionRepository.upsertSession(ctx, session);

        return session;
    }

    /**
     * Save session state as successfully stopped
     * @param ctx
     * @param session
     */
    async trackStopSuccess(ctx: Context, session:Session): Promise<Session> {
        session.status = SessionStatus.OFF;
        session.errorKey = null;
        session.errorMessage = null;
        session.failure = null;
        session.shouldRetry = false;
        session.updatedAt = Date.now();

        await this.sessionRepository.upsertSession(ctx, session);

        return session;
    }

    /**
     * Save session state as stopped unsuccessfully
     * @param ctx
     * @param session
     * @param commandResponsePayload
     */
    async trackStopFailure(ctx: Context, session: Session,
            commandResponsePayload: CommandErrorResponsePayload): Promise<Session> {
        session.status = SessionStatus.OFF;

        // TODO merge errorKey/errorMessage into failure field
        session.errorKey = commandResponsePayload.errorKey;
        session.errorMessage = commandResponsePayload.errorMessage;
        session.failure = { reason: FailureReason.ERROR,
            error: { scope: ErrorScope.SESSION,
                detail: commandResponsePayload.errorMessage } };
        session.shouldRetry = true;
        session.updatedAt = Date.now();

        await this.sessionRepository.upsertSession(ctx, session);

        return session;
    }
}
