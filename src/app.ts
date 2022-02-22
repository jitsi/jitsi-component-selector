import express from 'express';
import http from 'http';
import Redis from 'ioredis';

import config from './config/config';
import ComponentHandler from './handlers/component_handler';
import SessionsHandler from './handlers/session_handler';
import ComponentRepository from './repository/component_repository';
import SessionRepository from './repository/session_repository';
import RestServer from './rest_server';
import CommandService from './service/command_service';
import ComponentService from './service/component_service';
import { ComponentTracker } from './service/component_tracker';
import SelectionService from './service/selection_service';
import SessionsService from './service/session_service';
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
    redisClient
});

const componentRepository = new ComponentRepository({
    redisClient,
    redisScanCount: config.RedisScanCount,
    componentTtlSec: config.ComponentTtlSec
});

// create the http server
const app = express();
const httpServer = http.createServer(app);

// configure the web socket server dependencies
const issToBaseUrl = new Map();

for (const issuer of config.SystemAsapJwtAcceptedHookIss.values()) {
    issToBaseUrl.set(issuer, config.SystemAsapPubKeyBaseUrl);
}

const asapFetcher = new ASAPPubKeyFetcher(
    issToBaseUrl,
    config.AsapPubKeyTTL
);

const componentTracker = new ComponentTracker({
    componentRepository
});

// create the websocket server
const websocketServer = new WsServer({
    httpServer,
    pubClient,
    subClient,
    wsPath: config.WSServerPath,
    componentTracker,
    asapFetcher,
    systemJwtClaims: {
        asapJwtAcceptedAud: config.SystemAsapJwtAcceptedAud,
        asapJwtAcceptedHookIss: config.SystemAsapJwtAcceptedHookIss
    },
    protectedApi: config.ProtectedApi
});

// configure the rest server dependencies
const commandService = new CommandService(websocketServer, pubClient, subClient);
const componentService = new ComponentService({ componentRepository,
    commandService });
const selectionService = new SelectionService({ sessionRepository });
const sessionsService = new SessionsService({ sessionRepository,
    selectionService,
    componentService });
const restServer = new RestServer({
    app,
    protectedApi: config.ProtectedApi,
    sessionsHandler: new SessionsHandler({
        sessionsService
    }),
    componentHandler: new ComponentHandler({
        componentService
    })
});

// initialize the rest routes and the websocket routes
restServer.init();

const wsServerCtx = generateNewContext('ws-server');

websocketServer.init(wsServerCtx);


// start the http server
if (config.ProtectedApi) {
    logger.debug('Starting in protected api mode');
} else {
    logger.warn('Starting in unprotected api mode');
}

httpServer.listen(config.HTTPServerPort, () => {
    logger.info(`Running http server on port ${config.HTTPServerPort}`);
});
