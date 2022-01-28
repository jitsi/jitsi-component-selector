import { createAdapter } from '@socket.io/redis-adapter';
import * as http from 'http';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { Room, SocketId } from 'socket.io-adapter';

import { Context } from './util/context';

export interface WsServerOptions {
    httpServer: http.Server;
    pubClient: Redis;
    subClient: Redis;
    wsPath: string;
}

interface QueryObject {
    instanceKey: string;
}

/**
 * Configures the web socket server behavior
 */
export default class WsServer {
    private readonly io: Server;

    /**
     * Constructor
     * @param options WsServerOptions
     */
    constructor(options: WsServerOptions) {
        this.io = new Server(options.httpServer, { path: options.wsPath });
        this.io.adapter(createAdapter(options.pubClient, options.subClient));
    }

    /**
     * Initializes middleware and routes
     * @param ctx
     */
    public init(ctx: Context): void {
        // stats.hookToServer(this.io);
        this.configRoutes(ctx);
    }

    /**
     * Configures websocket routes and behavior
     * @param ctx Context
     * @private
     */
    private configRoutes(ctx: Context): void {
        this.io.on('connection', async (socket: Socket) => {
            ctx.logger.info(`[ws][${socket.id}] Client connected`);
            const queryObject = socket.handshake.query as unknown as QueryObject;

            if (!queryObject.instanceKey || queryObject.instanceKey.length === 0) {
                ctx.logger.error(`[ws][${socket.id}] Client connected without an instanceKey, disconnecting it`);
                socket.disconnect(true);
            } else {
                ctx.logger.info(`[ws][${socket.id}] Joining room ${queryObject.instanceKey}`);
                await socket.join(queryObject.instanceKey);

                socket.on('status-updates', (report: any) => {
                    ctx.logger.info(`[ws][${socket.id}] Got status updates from client. `, {
                        report
                    });
                });

                socket.on('disconnecting', () => {
                    ctx.logger.info(`[ws][${socket.id}] Disconnecting client from rooms`, { rooms: socket.rooms });
                });

                socket.on('disconnect', () => {
                    ctx.logger.info(`[ws][${socket.id}] Client disconnected`);
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
    public getLocalSocket(socketId:string): Socket {
        return this.io.of('/').sockets.get(socketId);
    }
}
