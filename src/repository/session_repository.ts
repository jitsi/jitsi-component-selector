import Redis from 'ioredis';

import { Session } from '../service/session_service';
import { Context } from '../util/context';


export interface SessionRepositoryOptions {
    redisClient: Redis.Redis;
}

/**
 * Service which handles redis requests
 */
export default class SessionRepository {

    private redisClient: any;
    private readonly SESSIONS_HASH_NAME = 'sessions';

    /**
     * Constructor
     * @param options
     */
    constructor(options: SessionRepositoryOptions) {
        this.redisClient = options.redisClient;
    }

    /**
     * Saves the details of a (recording, dial-out etc) session
     * @param ctx request context
     * @param session
     */
    async upsertSession(ctx: Context, session: Session): Promise<boolean> {
        ctx.logger.info(`Storing session details for ${session.sessionId}`);
        await this.redisClient.hset(
            this.SESSIONS_HASH_NAME,
            `${session.sessionId}`,
            JSON.stringify(session)
        );

        return true;
    }

    /**
     * Gets the details of a (recording, dial-out etc) session
     * @param ctx request context
     * @param sessionId
     */
    async getSession(ctx: Context, sessionId: string): Promise<Session> {
        const result = await this.redisClient.hget(this.SESSIONS_HASH_NAME, sessionId);

        if (result !== null && result.length > 0) {
            return JSON.parse(result);
        }

        return null;
    }

}
