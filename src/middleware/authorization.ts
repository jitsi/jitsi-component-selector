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
    jitsiJwtClaims: JwtClaims
}

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
     * Returns a Socket.io authorization middleware
     * @param ctx
     */
    public getWsAuthSystemMiddleware(ctx: Context) {
        return (socket: Socket, next: (err?: ExtendedError) => void): void => {
            if (!this.protectedApi) {
                return next();
            }

            const authObject = socket.handshake.auth as AuthObject;
            const token = authObject.token;
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
                    err => {
                        if (err) {
                            ctx.logger.info(`Authentication error, for socket ${socket.id}: ${err}`);

                            return next(err);
                        }
                        ctx.logger.info(`Authentication succeeded, for socket ${socket.id}`);
                        next();

                    }
                );
            } else {
                ctx.logger.info(`Authentication error, for socket ${socket.id}: no token was found`);
                next(new Error('Authentication error, no token found'));
            }
        }
    }
}
