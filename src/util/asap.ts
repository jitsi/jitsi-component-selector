
import express from 'express';
import { secretType } from 'express-jwt';
import got from 'got';
import { Secret } from 'jsonwebtoken';
import NodeCache from 'node-cache';
import sha256 from 'sha256';

import { Context } from './context';

/**
 * Public key fetcher
 */
export class ASAPPubKeyFetcher {
    private issToBaseUrl: Map<string, string>;
    private cache: NodeCache;

    /**
     * Constructor
     * @param issToBaseUrl
     * @param ttl
     */
    constructor(
            issToBaseUrl: Map<string, string>,
            ttl: number
    ) {
        this.issToBaseUrl = issToBaseUrl;
        this.cache = new NodeCache({ stdTTL: ttl });
        this.pubKeyCallback = this.pubKeyCallback.bind(this);
        this.pubKeyCallbackForJsonWebToken = this.pubKeyCallbackForJsonWebToken.bind(this);
    }

    /**
     * Method for getting the public key
     * @param ctx
     * @param header
     * @param payload
     * @param done
     */
    pubKeyCallbackForJsonWebToken(ctx: Context,
            header: any,
            payload: any,
            done: (err: any, secret?: secretType | Secret) => void): void {
        try {
            if (!header || !header.kid) {
                done(new Error('kid is required in header'), null);

                return;
            }
            const kid = header.kid;
            const pubKey: string = this.cache.get(kid);

            if (pubKey) {
                ctx.logger.debug('Using pub key from cache');
                done(null, pubKey);

                return;
            }

            const issuer = payload.iss;
            const baseUrl = this.issToBaseUrl.get(issuer);

            if (typeof baseUrl === 'undefined') {
                done(new Error('invalid issuer or kid'), null);

                return;
            }

            ctx.logger.debug('Fetching pub key from key server');
            fetchPublicKey(baseUrl, kid)
                .then(key => {
                    this.cache.set(kid, key);
                    done(null, key);
                })
                .catch(err => {
                    ctx.logger.error(`Obtaining asap pub ${err}`);
                    done(err);
                });
        } catch (err) {
            done(err);
        }
    }

    /**
     * Method for getting the public key, using a signature
     * specific to express-jwt
     * @param req
     * @param header
     * @param payload
     * @param done
     */
    pubKeyCallback(req: express.Request,
            header: any,
            payload: any,
            done: (err: any, secret?: secretType) => void): void {
        return this.pubKeyCallbackForJsonWebToken(req.context, header, payload, done);
    }
}

/**
 * Method for getting the public key from server
 * @param baseUrl
 * @param kid
 */
async function fetchPublicKey(baseUrl: string, kid: string): Promise<string> {
    const hashedKid = sha256(kid);
    const reqUrl = `${baseUrl}/${hashedKid}.pem`;
    const response = await got(reqUrl);

    return response.body;
}
