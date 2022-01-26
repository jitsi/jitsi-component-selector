import express from 'express';
import http from 'http';
import Redis from 'ioredis';

import config from './config/config';
import SessionsHandler from './handlers/sessions_handler';
import RestServer from './rest_server';
import SessionsService from './service/sessions_service';
import { generateNewContext } from './util/context';
import logger from './util/logger';
import WsServer from './ws_server';

logger.info('Starting up jitsi-component-selector service with config', {
    config
});

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

// configure the http server
const app = express();
const httpServer = http.createServer(app);

// configure the rest server
const sessionsService = new SessionsService();
const restServer = new RestServer({
    app,
    protectedApi: config.ProtectedApi,
    sessionsHandler: new SessionsHandler({
        sessionsService
    })
});

restServer.init();

// configure the web socket server
const websocketServer = new WsServer({
    httpServer,
    pubClient,
    subClient,
    wsPath: config.WSServerPath
});

const initCtx = generateNewContext();

websocketServer.init(initCtx);


// start server

if (config.ProtectedApi) {
    logger.debug('Starting in protected api mode');
} else {
    logger.warn('Starting in unprotected api mode');
}

httpServer.listen(config.HTTPServerPort, () => {
    logger.info(`Running http server on port ${config.HTTPServerPort}`);
});
