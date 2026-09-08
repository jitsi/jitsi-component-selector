/* eslint-disable */
// Regression tests for JIT-16349: a valid system JWT must not allow a client to act as a different component.
// Run with `npm test`, the tests exercise the compiled output in dist/.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it } = require('node:test');

const jsonwebtoken = require('jsonwebtoken');

const { SelectorAuthorization } = require('../dist/middleware/authorization');
const CommandService = require('../dist/service/command_service').default;
const { SessionTracker } = require('../dist/service/session_tracker');

const AUDIENCE = 'jitsi-component-selector';
const ISSUER = 'jitsi-component-sidecar';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const otherPrivateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const ctx = { logger: noopLogger, start: Date.now(), requestId: 'test' };

const asapFetcher = {
    pubKeyCallbackForJsonWebToken(_ctx, header, _payload, done) {
        done(null, header.kid === 'jitsi/test' ? publicKeyPem : null);
    }
};

function signSystemToken(claims = {}, key = privateKey, options = {}) {
    return jsonwebtoken.sign(claims, key, {
        algorithm: 'RS256',
        keyid: 'jitsi/test',
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: 60,
        ...options
    });
}

function makeSocket(token, componentKey) {
    const query = {};

    if (componentKey !== undefined) {
        query.componentKey = componentKey;
    }

    return {
        id: 'socket-under-test',
        handshake: { auth: token ? { token } : {}, query },
        data: {}
    };
}

function makeAuthorization(overrides = {}) {
    return new SelectorAuthorization({
        asapFetcher,
        protectedApi: true,
        protectedSignalApi: true,
        signalJwtClaims: { asapJwtAcceptedAud: AUDIENCE, asapJwtAcceptedHookIss: [ 'signal' ] },
        systemJwtClaims: { asapJwtAcceptedAud: AUDIENCE, asapJwtAcceptedHookIss: [ ISSUER ] },
        jitsiJwtClaims: { asapJwtAcceptedAud: '*', asapJwtAcceptedHookIss: [ 'jitsi' ] },
        ...overrides
    });
}

function runMiddleware(authorization, socket) {
    return new Promise(resolve => {
        authorization.getWsAuthSystemMiddleware(ctx)(socket, err => resolve(err));
    });
}

describe('websocket system authorization binds the socket to one component identity', () => {
    it('rejects a socket without a token', async () => {
        const err = await runMiddleware(makeAuthorization(), makeSocket(undefined, 'component-b'));

        assert.ok(err instanceof Error);
        assert.equal(makeSocket().data.componentKey, undefined);
    });

    it('rejects a token signed with an unknown key', async () => {
        const token = signSystemToken({ sub: 'component-b' }, otherPrivateKey);
        const err = await runMiddleware(makeAuthorization(), makeSocket(token, 'component-b'));

        assert.ok(err instanceof Error);
    });

    it('accepts JWT(B) claiming componentKey B and binds the socket to B', async () => {
        const socket = makeSocket(signSystemToken({ sub: 'component-b' }), 'component-b');
        const err = await runMiddleware(makeAuthorization(), socket);

        assert.equal(err, undefined);
        assert.equal(socket.data.componentKey, 'component-b');
        assert.equal(socket.data.jwtPayload.sub, 'component-b');
    });

    it('rejects JWT(A) claiming componentKey B before any room is joined', async () => {
        const socket = makeSocket(signSystemToken({ sub: 'component-a' }), 'component-b');
        const err = await runMiddleware(makeAuthorization(), socket);

        assert.ok(err instanceof Error);
        assert.match(err.message, /does not match the token identity/);
        assert.equal(socket.data.componentKey, undefined);
    });

    it('binds the socket to the token identity when the handshake has no componentKey', async () => {
        const socket = makeSocket(signSystemToken({ sub: 'component-a' }));
        const err = await runMiddleware(makeAuthorization(), socket);

        assert.equal(err, undefined);
        assert.equal(socket.data.componentKey, 'component-a');
    });

    it('supports a custom componentKey claim', async () => {
        const authorization = makeAuthorization({ systemJwtComponentKeyClaim: 'componentKey' });
        const spoofing = makeSocket(signSystemToken({ componentKey: 'component-a' }), 'component-b');
        const legit = makeSocket(signSystemToken({ componentKey: 'component-b' }), 'component-b');

        assert.ok((await runMiddleware(authorization, spoofing)) instanceof Error);
        assert.equal(await runMiddleware(authorization, legit), undefined);
        assert.equal(legit.data.componentKey, 'component-b');
    });

    it('rejects a token with an empty componentKey claim', async () => {
        const socket = makeSocket(signSystemToken({ sub: '' }), 'component-b');
        const err = await runMiddleware(makeAuthorization(), socket);

        assert.ok(err instanceof Error);
    });

    it('trusts the handshake componentKey for legacy tokens when the claim is not required', async () => {
        const socket = makeSocket(signSystemToken(), 'component-b');
        const err = await runMiddleware(makeAuthorization({ wsRequireComponentKeyClaim: false }), socket);

        assert.equal(err, undefined);
        assert.equal(socket.data.componentKey, 'component-b');
    });

    it('rejects legacy tokens without the claim when the claim is required', async () => {
        const socket = makeSocket(signSystemToken(), 'component-b');
        const err = await runMiddleware(makeAuthorization({ wsRequireComponentKeyClaim: true }), socket);

        assert.ok(err instanceof Error);
        assert.match(err.message, /has no 'sub' claim/);
    });

    it('rejects legacy tokens without a handshake componentKey', async () => {
        const err = await runMiddleware(makeAuthorization(), makeSocket(signSystemToken()));

        assert.ok(err instanceof Error);
    });

    it('binds the socket to the handshake componentKey when the api is unprotected', async () => {
        const socket = makeSocket(undefined, 'component-b');
        const err = await runMiddleware(makeAuthorization({ protectedApi: false }), socket);

        assert.equal(err, undefined);
        assert.equal(socket.data.componentKey, 'component-b');
    });
});

describe('session updates are only accepted from the component owning the session', () => {
    function makeTracker(session) {
        const upserted = [];
        const tracker = new SessionTracker({
            sessionRepository: {
                async getSession() {
                    return session;
                },
                async upsertSession(_ctx, updated) {
                    upserted.push(updated);
                }
            }
        });

        return { tracker, upserted };
    }

    it('ignores a session update sent by a different component', async () => {
        const { tracker, upserted } = makeTracker({ sessionId: 's1', componentKey: 'component-b', status: 'PENDING' });

        await tracker.track(ctx, { sessionId: 's1', status: 'OFF' }, 'component-a');

        assert.equal(upserted.length, 0);
    });

    it('applies a session update sent by the owning component', async () => {
        const { tracker, upserted } = makeTracker({ sessionId: 's1', componentKey: 'component-b', status: 'PENDING' });

        await tracker.track(ctx, { sessionId: 's1', status: 'OFF' }, 'component-b');

        assert.equal(upserted.length, 1);
        assert.equal(upserted[0].status, 'OFF');
    });
});

describe('command responses are attributed to the authenticated component', () => {
    it('overrides a spoofed componentKey in the response payload', () => {
        const socket = { id: 's', data: { componentKey: 'component-a' } };
        const response = CommandService.enforceResponseIdentity(ctx, socket, {
            cmdId: 'c1',
            type: 'START',
            responseType: 'SUCCESS',
            payload: { componentKey: 'component-b', sessionId: 's1' }
        });

        assert.equal(response.payload.componentKey, 'component-a');
    });
});
