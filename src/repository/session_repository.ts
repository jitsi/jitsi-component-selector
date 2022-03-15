import Redis from 'ioredis';

import { Session } from '../service/session_service';
import ComponentUtils from '../util/component_utils';
import { Context } from '../util/context';


export interface SessionRepositoryOptions {
    redisClient: Redis.Redis;
    redisScanCount: number;
    sessionTtlSec: number;
}

/**
 * Service which handles redis requests
 */
export default class SessionRepository {

    private redisClient: any;
    private readonly SESSIONS_HASH_NAME = 'sessions';
    private readonly redisScanCount: number;
    private readonly sessionTtlSec: number;

    /**
     * Constructor
     * @param options
     */
    constructor(options: SessionRepositoryOptions) {
        this.redisClient = options.redisClient;
        this.redisScanCount = options.redisScanCount;
        this.sessionTtlSec = options.sessionTtlSec;
    }

    /**
     * Saves the details of a (recording, dial-out etc) session
     * @param ctx request context
     * @param session
     */
    async upsertSession(ctx: Context, session: Session): Promise<boolean> {
        ctx.logger.info(`Storing session details ${JSON.stringify(session)}`);
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

    /**
     * Get all the sessions
     * @param ctx
     */
    async getSessions(ctx: Context): Promise<Array<Session>> {
        const sessions: Array<Session> = [];
        const start = process.hrtime();

        let cursor = '0';
        let scanCounts = 0;

        do {
            const result = await this.redisClient.hscan(
                this.SESSIONS_HASH_NAME,
                cursor,
                'match',
                '*',
                'count',
                this.redisScanCount
            );

            cursor = result[0];
            const sessionsResponse = result[1];

            if (sessionsResponse.length > 0) {
                for (let i = 1; i < sessionsResponse.length; i += 2) {
                    sessions.push(JSON.parse(sessionsResponse[i]));
                }
            }
            scanCounts++;
        } while (cursor !== '0');
        const end = process.hrtime(start);

        ctx.logger.info(
            `Returned ${sessions.length} sessions in ${scanCounts} scans
            and ${(end[0] * 1000) + (end[1] / 1000000)} ms`
        );

        return sessions;
    }

    /**
     * Delete expired sessions
     * @param ctx
     */
    async cleanupExpired(ctx: Context): Promise<void> {
        const start = process.hrtime();

        const sessions = await this.getSessions(ctx);
        const pipeline = this.redisClient.pipeline();

        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];

            if (ComponentUtils.isExpired(session.updatedAt, this.sessionTtlSec)) {
                pipeline.hdel(this.SESSIONS_HASH_NAME, session.sessionId);
            }

        }
        await pipeline.exec();
        const end = process.hrtime(start);

        ctx.logger.info(
            `Cleaned up ${pipeline.length} expired sessions in ${(end[0] * 1000) + (end[1] / 1000000)} ms.`
        );
    }
}
