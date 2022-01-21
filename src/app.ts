import express from 'express';
import http from 'http';

import config from './config/config';
import SessionsHandler from './handlers/sessions_handler';
import RestServer from './rest_server';
import SessionsService from './service/sessions_service';
import logger from './util/logger';

logger.info('Starting up jitsi-component-selector service with config', {
    config
});

// configure the server
const app = express();
const httpServer = http.createServer(app);

const sessionsService = new SessionsService();
const restServer = new RestServer({
    app,
    protectedApi: config.ProtectedApi,
    sessionsHandler: new SessionsHandler({
        sessionsService
    })
});

restServer.init();

// start server

if (config.ProtectedApi) {
    logger.debug('Starting in protected api mode');
} else {
    logger.warn('Starting in unprotected api mode');
}

httpServer.listen(config.HTTPServerPort, () => {
    logger.info(`Running http server on port ${config.HTTPServerPort}`);
});
