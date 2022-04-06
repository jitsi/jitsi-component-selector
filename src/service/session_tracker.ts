import SessionRepository from '../repository/session_repository';
import { Context } from '../util/context';

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
}
