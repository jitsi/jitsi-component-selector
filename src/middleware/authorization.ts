import { UnauthorizedError } from 'express-jwt';
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

/**
 * Middleware for system token validation for web sockets
 * @param ctx
 * @param asapFetcher
 * @param jwtClaims
 * @param protectedApi
 */
export function systemTokenValidationForWs(
        ctx: Context,
        asapFetcher: ASAPPubKeyFetcher,
        jwtClaims: JwtClaims,
        protectedApi: boolean
) {
    return (socket: Socket, next: (err?: ExtendedError) => void): void => {
        if (!protectedApi) {
            return next();
        }

        const authObject = socket.handshake.auth as AuthObject;
        const token = authObject.token;
        const audience = jwtClaims.asapJwtAcceptedAud;
        const issuer = jwtClaims.asapJwtAcceptedHookIss;

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
                    asapFetcher.pubKeyCallbackForJsonWebToken(ctx, header, decodedToken.payload, callback),
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
    };
}
