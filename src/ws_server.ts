import * as http from 'http';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { Room, SocketId } from 'socket.io-adapter';

import { SelectorAuthorization, WsSocketData } from './middleware/authorization';
import { ComponentTracker, StatsReport } from './service/component_tracker';
import { SessionReport, SessionTracker } from './service/session_tracker';
import { Context } from './util/context';

export interface WsServerOptions {
    httpServer: http.Server;
    pubClient: Redis;
    subClient: Redis;
    wsPath: string;
    componentTracker: ComponentTracker;
    sessionTracker: SessionTracker;
    selectorAuthorization: SelectorAuthorization;
}

/**
 * Configures the web socket server behavior
 */
export default class WsServer {
    private readonly io: Server;
    private componentTracker: ComponentTracker;
    private sessionTracker: SessionTracker;
    private selectorAuthorization: SelectorAuthorization;

    /**
     * Constructor
     * @param options WsServerOptions
     */
    constructor(options: WsServerOptions) {
        this.io = new Server(options.httpServer, { path: options.wsPath });
        this.componentTracker = options.componentTracker;
        this.sessionTracker = options.sessionTracker;
        this.selectorAuthorization = options.selectorAuthorization;
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
            this.selectorAuthorization.getWsAuthSystemMiddleware(ctx)
        );
    }

    /**
     * Configures websocket routes and behavior
     * @param ctx Context
     * @private
     */
    private configRoutes(ctx: Context): void {
        this.io.on('connection', async (socket: Socket) => {
            ctx.logger.info(`Client connected. socket=${socket.id}`);

            // The component identity was bound to the socket by the authorization middleware
            // and is the only identity trusted for anything received on this socket
            const socketData = socket.data as WsSocketData;
            const componentKey = socketData ? socketData.componentKey : undefined;

            if (!componentKey) {
                ctx.logger.error(`Client connected without a componentKey, disconnecting it, socket=${socket.id}`);
                socket.disconnect(true);

                return;
            }

            const roomSockets = this.getLocalRooms().get(componentKey);

            if (roomSockets && roomSockets.size > 0) {
                ctx.logger.warn(`Room ${componentKey} already has ${roomSockets.size} connected socket(s) `
                    + `on this node, socket=${socket.id}`);
            }

            ctx.logger.info(`Joining room ${componentKey}, socket=${socket.id}`);
            await socket.join(componentKey);

            socket.on('status-updates', (report: StatsReport) => {
                ctx.logger.info(`Got status updates from client. ${JSON.stringify(report)}, socket=${socket.id}`);

                if (!WsServer.isReportFromComponent(report, componentKey)) {
                    ctx.logger.error('Ignoring status updates for a different component, '
                        + `socket=${socket.id} is bound to component ${componentKey}`);

                    return;
                }
                this.componentTracker.track(ctx, report);
            });

            socket.on('session-updates', (report: SessionReport) => {
                ctx.logger.info(`Got session updates from client. ${JSON.stringify(report)}, socket=${socket.id}`);
                this.sessionTracker.track(ctx, report, componentKey);
            });

            socket.on('disconnecting', () => {
                ctx.logger.info(`Disconnecting client from rooms ${JSON.stringify(socket.rooms)}, `
                    + `socket=${socket.id}`);
            });

            socket.on('disconnect', () => {
                ctx.logger.info(`Client disconnected, socket=${socket.id}`);
            });
        });
    }

    /**
     * Checks that a stats report describes the component the socket is bound to
     * @param report
     * @param componentKey the component identity bound to the socket
     * @private
     */
    private static isReportFromComponent(report: StatsReport, componentKey: string): boolean {
        return Boolean(report && report.component && report.component.componentKey === componentKey);
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
