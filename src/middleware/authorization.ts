import express from 'express';
import jwt, { UnauthorizedError } from 'express-jwt';
import jsonwebtoken from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';

import { ASAPPubKeyFetcher } from '../util/asap';
import { Context } from '../util/context';

interface AuthObject {
    token: string;
}

export interface JwtClaims {
    asapJwtAcceptedAud: string;
    asapJwtAcceptedHookIss: string[];
}

export interface TokenAuthorizationOptions {
    asapFetcher: ASAPPubKeyFetcher,
    protectedApi: boolean,
    protectedSignalApi: boolean,
    signalJwtClaims: JwtClaims,
    systemJwtClaims: JwtClaims,
    jitsiJwtClaims: JwtClaims,

    /**
     * The claim of the system token which carries the componentKey the token is authorized for.
     * Defaults to 'sub'.
     */
    systemJwtComponentKeyClaim?: string,

    /**
     * When true, websocket connections whose system token does not carry the componentKey claim are rejected.
     * When false, such connections fall back to trusting the componentKey from the handshake query.
     */
    wsRequireComponentKeyClaim?: boolean
}

/**
 * Server-side identity of an authenticated websocket, stored on socket.data.
 * Everything received on the socket must be validated against it.
 */
export interface WsSocketData {

    /**
     * The componentKey this socket is authorized to act as.
     * It is derived from the verified system token when the token carries the componentKey claim.
     */
    componentKey: string;

    /**
     * The verified payload of the system token, if any
     */
    jwtPayload?: { [claim: string]: any };
}

const DEFAULT_COMPONENT_KEY_CLAIM = 'sub';

/**
 * Provider of authorization middlewares
 */
export class SelectorAuthorization {
    private asapFetcher: ASAPPubKeyFetcher;
    private readonly protectedApi: boolean;
    private readonly protectedSignalApi: boolean;
    private readonly signalJwtClaims: JwtClaims;
    private readonly systemJwtClaims: JwtClaims;
    private readonly jitsiJwtClaims: JwtClaims;
    private readonly systemJwtComponentKeyClaim: string;
    private readonly wsRequireComponentKeyClaim: boolean;

    /**
     * Constructor
     * @param options
     */
    constructor(options: TokenAuthorizationOptions) {
        this.asapFetcher = options.asapFetcher;
        this.protectedApi = options.protectedApi;
        this.protectedSignalApi = options.protectedSignalApi;
        this.jitsiJwtClaims = options.jitsiJwtClaims;
        this.signalJwtClaims = options.signalJwtClaims;
        this.systemJwtClaims = options.systemJwtClaims;
        this.systemJwtComponentKeyClaim = options.systemJwtComponentKeyClaim || DEFAULT_COMPONENT_KEY_CLAIM;
        this.wsRequireComponentKeyClaim = Boolean(options.wsRequireComponentKeyClaim);
        this.jitsiAuthMiddleware = this.jitsiAuthMiddleware.bind(this);
        this.signalAuthMiddleware = this.signalAuthMiddleware.bind(this);
        this.systemAuthMiddleware = this.systemAuthMiddleware.bind(this);
        this.authorize = this.authorize.bind(this);
        this.getWsAuthSystemMiddleware = this.getWsAuthSystemMiddleware.bind(this);
    }

    /**
     * Express authorization middleware for jitsi meeting tokens
     * @param req
     * @param res
     * @param next
     */
    public jitsiAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (req.context) {
            req.context.logger.debug('Trying jitsi authorization');
        }
        this.authorize(req, res, next, this.protectedApi, this.jitsiJwtClaims);
    }

    /**
     * Express authorization middleware for signaling tokens
     * @param req
     * @param res
     * @param next
     */
    public signalAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (req.context) {
            req.context.logger.debug('Trying signal authorization');
        }
        this.authorize(req, res, next, this.protectedSignalApi, this.signalJwtClaims);
    }

    /**
     * Express authorization middleware for system tokens
     * @param req
     * @param res
     * @param next
     */
    public systemAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (req.context) {
            req.context.logger.info('Trying system authorization');
        }
        this.authorize(req, res, next, this.protectedApi, this.systemJwtClaims);
    }

    /* eslint-disable max-params */
    /**
     * Express-jwt authorization of tokens, taking into consideration the expected jwtClaims.
     * The public key is retrieved from the pre-configured callback associated to the issuer.
     * @param req
     * @param res
     * @param next
     * @param isProtected
     * @param jwtClaims
     * @private
     */
    private authorize(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
      isProtected: boolean,
      jwtClaims: JwtClaims,
    ) {
        try {
            jwt({
                secret: this.asapFetcher.pubKeyCallback,
                audience: jwtClaims.asapJwtAcceptedAud,
                issuer: jwtClaims.asapJwtAcceptedHookIss,
                algorithms: [ 'RS256' ]
            })
                .unless(() => {
                    if (!isProtected) {
                        return true;
                    }

                    // check for jwt
                    return false;
                })
                .apply(this, [ req, res, next ]);
        } catch (err) {
            // if the token has no kid, a TypeError will be thrown. This should be mapped to invalid token
            next(new UnauthorizedError('invalid_token', err));
        }
    }

    /**
     * Returns a Socket.io authorization middleware.
     * On success the socket is bound to a single component identity, see WsSocketData.
     * @param ctx
     */
    public getWsAuthSystemMiddleware(ctx: Context) {
        return (socket: Socket, next: (err?: ExtendedError) => void): void => {
            const requestedComponentKey = SelectorAuthorization.getRequestedComponentKey(socket);

            if (!this.protectedApi) {
                // Unprotected mode, the identity is whatever the client claims in the handshake
                return next(this.bindComponentIdentity(ctx, socket, requestedComponentKey, undefined));
            }

            const authObject = socket.handshake.auth as AuthObject;
            const token = authObject ? authObject.token : undefined;
            const audience = this.systemJwtClaims.asapJwtAcceptedAud;
            const issuer = this.systemJwtClaims.asapJwtAcceptedHookIss;

            if (token) {
                let decodedToken: any;

                try {
                    decodedToken = jsonwebtoken.decode(token, { complete: true }) || {};
                } catch (err) {
                    return next(new UnauthorizedError('invalid_token', err));
                }

                jsonwebtoken.verify(
                    token,
                    (header, callback) =>
                        this.asapFetcher.pubKeyCallbackForJsonWebToken(ctx, header, decodedToken.payload, callback),
                    {
                        audience,
                        issuer,
                        algorithms: [ 'RS256' ]
                    },
                    (err, verifiedPayload) => {
                        if (err) {
                            ctx.logger.info(`Authentication error, for socket ${socket.id}: ${err}`);

                            return next(err);
                        }
                        ctx.logger.info(`Authentication succeeded, for socket ${socket.id}`);

                        // Only the verified payload is trusted from here on
                        next(this.bindComponentIdentity(
                            ctx, socket, requestedComponentKey, verifiedPayload as { [claim: string]: any }));
                    }
                );
            } else {
                ctx.logger.info(`Authentication error, for socket ${socket.id}: no token was found`);
                next(new Error('Authentication error, no token found'));
            }
        }
    }

    /**
     * Binds the socket to exactly one component identity and stores it on socket.data.
     * When the verified token carries the componentKey claim, that claim is authoritative
     * and the handshake componentKey, if present, must match it.
     * @param ctx
     * @param socket
     * @param requestedComponentKey the componentKey claimed by the client in the handshake query
     * @param verifiedPayload the verified token payload, undefined when the API is unprotected
     * @returns an Error when the socket must be rejected, undefined otherwise
     * @private
     */
    private bindComponentIdentity(
            ctx: Context,
            socket: Socket,
            requestedComponentKey: string,
            verifiedPayload: { [claim: string]: any }
    ): Error | undefined {
        let componentKey: string;

        if (verifiedPayload) {
            const claimName = this.systemJwtComponentKeyClaim;
            const claimedComponentKey = verifiedPayload[claimName];

            if (claimedComponentKey !== undefined && claimedComponentKey !== null) {
                if (typeof claimedComponentKey !== 'string' || claimedComponentKey.length === 0) {
                    ctx.logger.error(`Authorization error, for socket ${socket.id}: `
                        + `the '${claimName}' claim is not a valid componentKey`);

                    return new Error(`Authorization error, invalid '${claimName}' claim`);
                }

                if (requestedComponentKey && requestedComponentKey !== claimedComponentKey) {
                    ctx.logger.error(`Authorization error, for socket ${socket.id}: `
                        + `requested componentKey ${requestedComponentKey} does not match `
                        + `the token identity ${claimedComponentKey}`);

                    return new Error('Authorization error, componentKey does not match the token identity');
                }

                componentKey = claimedComponentKey;
            } else if (this.wsRequireComponentKeyClaim) {
                ctx.logger.error(`Authorization error, for socket ${socket.id}: `
                    + `the token has no '${claimName}' claim`);

                return new Error(`Authorization error, the token has no '${claimName}' claim`);
            } else {
                // Legacy tokens without a component identity, the handshake componentKey has to be trusted
                ctx.logger.warn(`Token for socket ${socket.id} has no '${claimName}' claim, `
                    + `trusting the requested componentKey ${requestedComponentKey}`);
                componentKey = requestedComponentKey;
            }
        } else {
            componentKey = requestedComponentKey;
        }

        if (!componentKey) {
            ctx.logger.error(`Authorization error, for socket ${socket.id}: no componentKey was found`);

            return new Error('Authorization error, no componentKey found');
        }

        const socketData = socket.data as WsSocketData;

        socketData.componentKey = componentKey;
        socketData.jwtPayload = verifiedPayload;

        ctx.logger.info(`Socket ${socket.id} is bound to component ${componentKey}`);

        return undefined;
    }

    /**
     * Reads the componentKey claimed by the client in the handshake query
     * @param socket
     * @private
     */
    private static getRequestedComponentKey(socket: Socket): string {
        const query = socket.handshake.query as { [key: string]: string | string[] };
        const componentKey = query ? query.componentKey : undefined;

        if (typeof componentKey !== 'string' || componentKey.length === 0) {
            return undefined;
        }

        return componentKey;
    }
}
