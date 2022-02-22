import shortid from 'shortid';
import { SocketId } from 'socket.io-adapter';

import { Context, generateNewContext } from '../util/context';
import logger from '../util/logger';
import WsServer from '../ws_server';

enum RequestType {
    REMOTE_COMMAND = 0
}

interface Request {
    type: RequestType;
    resolve: Function;
    timeout: NodeJS.Timeout;
    [other: string]: any;
}

export enum CommandType {
    START = 'START',
    STOP = 'STOP'
}

export interface CommandPayload {
    componentKey: string;
    componentRequest: any;
}

export interface Command {
    cmdId: string;
    type: CommandType;
    payload: CommandPayload;
}

export enum ErrorType {
    TIMEOUT = 'timeout',
    CONNECTION_ERROR = 'connection.error',
}

export interface CommandErrorResponsePayload {
    componentKey: string;
    errorKey: ErrorType;
    errorMessage: string;
}

export enum CommandResponseType {
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR',
}

export interface CommandResponsePayload {
    componentKey: string;
    metadata?: any;
}

export interface CommandResponse {
    cmdId: string;
    type: CommandType;
    responseType: CommandResponseType;
    payload?: CommandResponsePayload | CommandErrorResponsePayload;
}

export interface CommandServiceOptions {
    key: string;
    requestsTimeout: number;
}

/**
 * Service which enables sending commands to Components and receiving the response
 * This code is adapted from the socket.io adapter: https://github.com/socketio/socket.io-redis-adapter,
 * but contains a more specific functionality: sending a command to only one member in a room and waiting for a reply
 */
export default class CommandService {
    private wsServer:WsServer;
    public readonly requestsTimeout: number;

    private readonly requestChannel: string;
    private readonly responseChannel: string;
    private requests: Map<string, Request> = new Map();

    /**
     * Constructor
     * @param wsServer
     * @param pubClient
     * @param subClient
     * @param opts
     */
    constructor(
            wsServer: WsServer,
        readonly pubClient: any,
        readonly subClient: any,
        opts: Partial<CommandServiceOptions> = {}
    ) {
        this.wsServer = wsServer;
        this.requestsTimeout = opts.requestsTimeout || 10000;

        const prefix = opts.key || 'jitsi-commands';

        this.requestChannel = `${prefix}-request#/#`;
        this.responseChannel = `${prefix}-response#/#`;

        const isRedisV4 = typeof this.pubClient.pSubscribe === 'function';

        if (isRedisV4) {
            this.subClient.subscribe(
                [ this.requestChannel, this.responseChannel ],
                (msg:any, channel: any) => {
                    this.onRequest(channel, msg);
                }
            );
        } else {
            this.subClient.subscribe([
                this.requestChannel,
                this.responseChannel
            ]);
            this.subClient.on('messageBuffer', this.onRequest.bind(this));
        }

        const registerFriendlyErrorHandler = (redisClient: any) => {
            redisClient.on('error', () => {
                if (redisClient.listenerCount('error') === 1) {
                    console.warn('missing \'error\' handler on this Redis client');
                }
            });
        };

        registerFriendlyErrorHandler(this.pubClient);
        registerFriendlyErrorHandler(this.subClient);
    }

    /**
     * This ia helper method for waiting
     * @param onSuccess
     * @param onTimeout
     * @param timeout
     */
    private withTimeout = (onSuccess: any, onTimeout: any, timeout: number) => {
        let called = false;

        const timer = setTimeout(() => {
            if (called) {
                return;
            }
            called = true;
            onTimeout();
        }, timeout);

        return (...args: any[]) => {
            if (called) {
                return;
            }
            called = true;
            clearTimeout(timer);
            onSuccess.apply(this, args);
        };
    };

    /**
     * Called on request from another node
     *
     * @private
     */
    private async onRequest(channel: string, msg: any) {
        if (channel.toString().startsWith(this.responseChannel)) {
            return this.onResponse(channel, msg);
        } else if (!channel.toString().startsWith(this.requestChannel)) {
            return logger.debug('Ignore different channel');
        }

        let request;

        try {
            request = JSON.parse(msg);
        } catch (err) {
            logger.error('Error parsing message', { err,
                msg })


            // this.emit('error', err);
            return;
        }

        const ctx = generateNewContext(request.requestId);

        ctx.logger.debug(`Received request ${JSON.stringify(request)}`);

        let response;

        switch (request.type) {
        case RequestType.REMOTE_COMMAND: {
            const requestId = request.requestId;
            const roomName = request.roomName;

            if (roomName && this.wsServer.getLocalRooms().has(roomName)) {
                ctx.logger.info(`Handling remote command request ${JSON.stringify(request)}`);
                const socketIds = this.wsServer.getLocalRooms().get(roomName);

                if (socketIds && socketIds.size > 0) {
                    const firstSocketId = socketIds.values().next().value;

                    await this.sendCommandToLocalSocket(ctx, firstSocketId, request.socketCommand, commandResponse => {
                        response = JSON.stringify({
                            requestId,
                            commandResponse,
                            ctx
                        });
                        ctx.logger.info(`Publishing remote command response ${JSON.stringify(response)}`);
                        this.pubClient.publish(this.responseChannel, response);
                    });
                }
            } else {
                ctx.logger.debug('Remote command room does not exist here, nothing to be done, request is '
                    + `${JSON.stringify(request)}`);
            }
            break;
        }
        default:
            ctx.logger.warn(`Ignoring unknown request type: ${request.type}`);
        }
    }

    /**
     * Called on response from another node
     *
     * @private
     */
    private onResponse(channel: string, msg: any) {
        let response;

        try {
            response = JSON.parse(msg);
        } catch (err) {
            logger.error(`Error parsing response msg ${msg}, err ${err}`, { err })

            // this.emit('error', err);
            return;
        }

        const requestId = response.requestId;
        const ctx = generateNewContext(requestId);

        if (!requestId || !this.requests.has(requestId)) {
            ctx.logger.debug('Ignoring unknown request');

            return;
        }

        ctx.logger.debug(`Received response ${JSON.stringify(response)}`);

        const request = this.requests.get(requestId);

        switch (request.type) {
        case RequestType.REMOTE_COMMAND: {
            ctx.logger.info(`Received remote response ${JSON.stringify(response)}`);
            clearTimeout(request.timeout);
            if (request.resolve) {
                request.resolve(response.commandResponse);
            }
            this.requests.delete(requestId);
            break;
        }
        default:
            ctx.logger.warn(`Ignoring unknown request type: ${request.type}`);
        }
    }

    /**
     * Sends a command to a socket which is connected to this server
     * @param ctx
     * @param socketId
     * @param command
     * @param onSuccess
     * @private
     */
    private async sendCommandToLocalSocket(
            ctx: Context,
            socketId: SocketId,
            command: any,
            onSuccess: (response: any) => any
    ): Promise<any> {
        ctx.logger.info(`Send local command ${command.type} to socket ${socketId}`);

        return new Promise(
            (
                    resolve: (value?: CommandResponse | PromiseLike<CommandResponse>) => void,
                    reject: (reason?: unknown) => void
            ) => {
                const socket = this.wsServer.getLocalSocket(socketId);

                // fail fast if socket is not connected
                // checking that the socket is connected also helps avoid the buffering of the requests
                if (!socket || !socket.connected) {
                    ctx.logger.error(`Connection error while sending local command ${command.type} `
                        + `to socket ${socket}, command ${JSON.stringify(command)}`);

                    reject({
                        name: ErrorType.CONNECTION_ERROR,
                        message: 'Connection error while sending local command'
                    });

                    return;
                }

                // if socket is connected, send command and wait for the response
                socket.emit(
                    'command',
                    command,
                    this.withTimeout(
                        (response: CommandResponse) => {
                            ctx.logger.info(`Got response for local command ${command.type} from socket `
                                + `${socket.id}, response ${JSON.stringify(response)}`);
                            resolve(onSuccess(response));
                        },
                        () => {
                            ctx.logger.error(`Timeout while sending local command ${command.type} to socket `
                                + `${socket.id}, command ${JSON.stringify(command)}`);
                            reject({
                                name: ErrorType.TIMEOUT,
                                message: `Timeout while sending local command, after ${this.requestsTimeout} ms`
                            });
                        },
                        this.requestsTimeout
                    )
                );
            }
        );
    }

    /**
     * Sends a command to the first node containing that room with a connected socket.
     * Responds with the command response.
     * Useful when the room with a connected socket exists on only one node.
     * @param ctx Context logging context
     * @param componentRoom the room where the component joined
     * @param command command to send
     */
    public async sendCommand(
            ctx: Context,
            componentRoom: string,
            command: Command
    ): Promise<CommandResponse> {
        let requestId: string;

        if (command.cmdId) {
            requestId = command.cmdId;
        } else {
            requestId = shortid.generate();
        }

        ctx.logger.info(`Send command ${command.type} to component ${componentRoom}, `
            + `command ${JSON.stringify(command)}`);

        // If room is local, send it to its connected socket
        if (this.wsServer.getLocalRooms().has(componentRoom)) {
            const socketIds = this.wsServer.getLocalRooms().get(componentRoom);

            if (socketIds && socketIds.size > 0) {
                const firstSocketId = socketIds.values().next().value;

                return this.sendCommandToLocalSocket(ctx, firstSocketId, command, response => response);
            }
            ctx.logger.warn(`Found multiple sockets in room ${componentRoom}`);

        }

        // Otherwise publish the request to other nodes
        const request = JSON.stringify({
            requestId,
            type: RequestType.REMOTE_COMMAND,
            roomName: componentRoom,
            socketCommand: command
        });

        return new Promise(
            (
                    resolve: (value?: CommandResponse | PromiseLike<CommandResponse>) => void,
                    reject: (reason?: unknown) => void
            ) => {
                const timeout = setTimeout(() => {
                    if (this.requests.has(requestId)) {
                        reject({
                            name: ErrorType.TIMEOUT,
                            message: `Timeout while sending remote command, after ${this.requestsTimeout} ms`
                        });
                        this.requests.delete(requestId);
                    }
                }, this.requestsTimeout);

                this.requests.set(requestId, {
                    type: RequestType.REMOTE_COMMAND,
                    resolve,
                    timeout
                });

                ctx.logger.info(`Send remote command ${command.type} to room ${componentRoom}`);
                this.pubClient.publish(this.requestChannel, request);
            }
        );
    }
}
