import express from 'express';
import http from 'http';
import Redis from 'ioredis';

import config, { AsapBaseUrlMapping } from './config/config';
import ComponentHandler from './handlers/component_handler';
import SessionsHandler from './handlers/session_handler';
import { SelectorAuthorization } from './middleware/authorization';
import { SelectorPermissions } from './middleware/permissions';
import ComponentRepository from './repository/component_repository';
import SessionRepository from './repository/session_repository';
import RestServer from './rest_server';
import CommandService, { CommandType } from './service/command_service';
import ComponentService from './service/component_service';
import { ComponentTracker } from './service/component_tracker';
import ComponentRequestMapper from './service/mapper/component_request_mapper';
import SelectionService from './service/selection_service';
import SessionsService from './service/session_service';
import { SessionTracker } from './service/session_tracker';
import { ASAPPubKeyFetcher } from './util/asap';
import { generateNewContext } from './util/context';
import logger from './util/logger';
import WsServer from './ws_server';

logger.info(`Starting up jitsi-component-selector service with config: ${JSON.stringify(config)}`);

// configure Redis
const redisOptions = <Redis.RedisOptions>{
    host: config.RedisHost,
    port: config.RedisPort
};

if (config.RedisPassword) {
    redisOptions.password = config.RedisPassword;
}

if (config.RedisTLS) {
    redisOptions.tls = {};
}

if (config.RedisDb) {
    redisOptions.db = config.RedisDb;
}

const pubClient = new Redis(redisOptions);
const subClient = pubClient.duplicate();

const redisClient = new Redis(redisOptions);
const sessionRepository = new SessionRepository({
    redisClient,
    redisScanCount: config.RedisScanCount,
    sessionTtlSec: config.SessionTtlSec
});

const componentRepository = new ComponentRepository({
    redisClient,
    redisScanCount: config.RedisScanCount,
    componentTtlSec: config.ComponentTtlSec,
    candidateTtlSec: config.CandidateTTLSec
});

componentRepository.defineRedisCustomCommands();

// create the http server
const app = express();
const httpServer = http.createServer(app);

// configure the web socket server dependencies
const issToBaseUrlMapping = new Map();

for (const issuer of config.SystemAsapJwtAcceptedHookIss.values()) {
    issToBaseUrlMapping.set(issuer, config.SystemAsapBaseUrlMappings as AsapBaseUrlMapping[]);
}

for (const issuer of config.JitsiAsapJwtAcceptedHookIss.values()) {
    issToBaseUrlMapping.set(issuer, config.JitsiAsapBaseUrlMappings as AsapBaseUrlMapping[]);
}

const asapFetcher = new ASAPPubKeyFetcher(
    issToBaseUrlMapping,
    new RegExp(config.KidPrefixPattern),
    config.AsapPubKeyTTL
);

const componentTracker = new ComponentTracker({
    componentRepository
});

const sessionTracker = new SessionTracker({
    sessionRepository
});

const signalJwtClaims = {
    asapJwtAcceptedAud: config.SignalAsapJwtAcceptedAud,
    asapJwtAcceptedHookIss: config.SignalAsapJwtAcceptedHookIss
}

const systemJwtClaims = {
    asapJwtAcceptedAud: config.SystemAsapJwtAcceptedAud,
    asapJwtAcceptedHookIss: config.SystemAsapJwtAcceptedHookIss
}

const jitsiJwtClaims = {
    asapJwtAcceptedAud: config.JitsiAsapJwtAcceptedAud,
    asapJwtAcceptedHookIss: config.JitsiAsapJwtAcceptedHookIss
}

const selectorAuthorization = new SelectorAuthorization({
    asapFetcher,
    protectedApi: config.ProtectedApi,
    systemJwtClaims,
    jitsiJwtClaims
})

const selectorPermissions = new SelectorPermissions({
    protectedApi: config.ProtectedApi,
    jitsiJigasiFeature: config.JitsiJigasiFeature,
    jitsiSipJibriFeature: config.JitsiSipJibriFeature
});

// create the websocket server
const websocketServer = new WsServer({
    httpServer,
    pubClient,
    subClient,
    wsPath: config.WSServerPath,
    componentTracker,
    sessionTracker,
    selectorAuthorization
});

// configure the rest server dependencies
const commandService = new CommandService(websocketServer, pubClient, subClient,
    {
        defaultCommandTimeout: config.CommandTimeoutDefaultMs
    });
const componentRequestMapper = new ComponentRequestMapper({
    sipAddressPattern: config.SipAddressPattern,
    sipJibriInboundEmail: config.SipJibriInboundEmail,
    sipJibriOutboundEmail: config.SipJibriOutboundEmail
})
const componentService = new ComponentService({ componentRepository,
    commandService,
    componentRequestMapper,
    commandTimeoutMap: { [CommandType.START.toLowerCase()]: config.CommandTimeoutStartMs,
        [CommandType.STOP.toLowerCase()]: config.CommandTimeoutStopMs },
    componentRequestTimeoutMap: { [CommandType.START.toLowerCase()]: config.ComponentReqTimeoutStartMs,
        [CommandType.STOP.toLowerCase()]: config.ComponentReqTimeoutStopMs }
});
const selectionService = new SelectionService({ componentRepository,
    candidateTTLSec: config.CandidateTTLSec });
const sessionsService = new SessionsService({ sessionRepository,
    sessionTracker,
    selectionService,
    componentService });

const restServer = new RestServer({
    app,
    sessionsHandler: new SessionsHandler({
        sessionsService,
        defaultRegion: config.DefaultRegion,
        defaultEnvironment: config.DefaultEnvironment
    }),
    componentHandler: new ComponentHandler({
        componentService
    }),
    selectorAuthorization,
    selectorPermissions
});

// initialize the rest routes and the websocket routes
restServer.init();

const wsServerCtx = generateNewContext('ws-server');

websocketServer.init(wsServerCtx);

// start background jobs

/**
 * Cleanup expired components
 */
async function cleanupComponents() {
    const ctx = generateNewContext('cleanup-job');

    try {
        await componentService.cleanupComponents(ctx);
    } catch (err) {
        ctx.logger.error(`Error while cleaning up expired components: ${err}`, { err });
    }
    setTimeout(cleanupComponents, config.CleanupComponentsIntervalSec * 1000);
}
cleanupComponents();

/**
 * Cleanup sessions
 */
async function cleanupSessions() {
    const ctx = generateNewContext('cleanup-job');

    try {
        await sessionsService.cleanupSessions(ctx);
    } catch (err) {
        ctx.logger.error(`Error while cleaning up sessions: ${err}`, { err });
    }
    setTimeout(cleanupSessions, config.CleanupSessionsIntervalSec * 1000);
}
cleanupSessions();


// start the http server
if (config.ProtectedApi) {
    logger.debug('Starting in protected api mode');
} else {
    logger.warn('Starting in unprotected api mode');
}

if (config.ProtectedSignalApi) {
    logger.debug('Starting in protected signal api mode');
} else {
    logger.warn('Starting in unprotected signal api mode');
}

httpServer.listen(config.HTTPServerPort, () => {
    logger.info(`Running http server on port ${config.HTTPServerPort}`);
});
