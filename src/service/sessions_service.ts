import { Context } from '../util/context';

/**
 * Service which handles session-based requests
 */
export default class SessionsService {

    /**
     * Starts a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     */
    async startSession(ctx: Context): Promise<void> {
        ctx.logger.info('[session_serv] Starting session');
    }

    /**
     * Stops a (recording, dial-out etc) session for a meeting
     * @param ctx request context
     */
    async stopSession(ctx: Context): Promise<void> {
        ctx.logger.info('[session_serv] Stopping session');
    }

    /**
     * Gets the details of a (recording, dial-out etc) session
     * @param ctx request context
     */
    async getSession(ctx: Context): Promise<void> {
        ctx.logger.info('[session_serv] Get session');
    }
}
