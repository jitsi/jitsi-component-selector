import * as http from 'http';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { Room, SocketId } from 'socket.io-adapter';

import { JwtClaims, systemTokenValidationForWs } from './middleware/authorization';
import { ComponentTracker } from './service/component_tracker';
import { ASAPPubKeyFetcher } from './util/asap';
import { Context } from './util/context';

export interface WsServerOptions {
    httpServer: http.Server;
    pubClient: Redis;
    subClient: Redis;
    wsPath: string;
    componentTracker: ComponentTracker;
    asapFetcher: ASAPPubKeyFetcher;
    systemJwtClaims: JwtClaims;
    protectedApi: boolean;
}

interface QueryObject {
    componentKey: string;
}

/**
 * Configures the web socket server behavior
 */
export default class WsServer {
    private readonly io: Server;
    private componentTracker: ComponentTracker;
    private asapFetcher: ASAPPubKeyFetcher;
    private systemJwtClaims: JwtClaims;
    private protectedApi: boolean;

    /**
     * Constructor
     * @param options WsServerOptions
     */
    constructor(options: WsServerOptions) {
        this.io = new Server(options.httpServer, { path: options.wsPath });
        this.componentTracker = options.componentTracker;
        this.asapFetcher = options.asapFetcher;
        this.systemJwtClaims = options.systemJwtClaims;
        this.protectedApi = options.protectedApi;
    }

    /**
     * Initializes middleware and routes
     * @param ctx
     */
    public init(ctx: Context): void {
        // stats.hookToServer(this.io);
        this.config(ctx);
        this.configRoutes(ctx);
    }

    /**
     * Configures the system token validation
     */
    private config(ctx: Context) {
        this.io.use(
            systemTokenValidationForWs(
                ctx,
                this.asapFetcher,
                this.systemJwtClaims,
                this.protectedApi
            )
        );
    }

    /**
     * Configures websocket routes and behavior
     * @param ctx Context
     * @private
     */
    private configRoutes(ctx: Context): void {
        this.io.on('connection', async (socket: Socket) => {
            ctx.logger.info(`[${socket.id}] Client connected`);
            const queryObject = socket.handshake.query as unknown as QueryObject;

            if (!queryObject.componentKey || queryObject.componentKey.length === 0) {
                ctx.logger.error(`[${socket.id}] Client connected without a componentKey, disconnecting it`);
                socket.disconnect(true);
            } else {
                ctx.logger.info(`[${socket.id}] Joining room ${queryObject.componentKey}`);
                await socket.join(queryObject.componentKey);

                socket.on('status-updates', (report: any) => {
                    ctx.logger.info(`[${socket.id}] Got status updates from client. `, {
                        report
                    });
                    this.componentTracker.track(ctx, report);
                });

                socket.on('disconnecting', () => {
                    ctx.logger.info(`[${socket.id}] Disconnecting client from rooms`, { rooms: socket.rooms });
                });

                socket.on('disconnect', () => {
                    ctx.logger.info(`[${socket.id}] Client disconnected`);
                });
            }
        });
    }

    /**
     * Get a map of the local rooms and associated sockets
     */
    public getLocalRooms(): Map<Room, Set<SocketId>> {
        return this.io.of('/').adapter.rooms;
    }

    /**
     * Get the socket connected to the local server
     * @param socketId
     */
    public getLocalSocket(socketId: string): Socket {
        return this.io.of('/').sockets.get(socketId);
    }
}
