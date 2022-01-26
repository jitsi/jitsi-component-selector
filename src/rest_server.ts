import bodyParser from 'body-parser';
import * as express from 'express';
import { Application, Express } from 'express';
import { body, validationResult } from 'express-validator';

import SessionsHandler from './handlers/session_handler';
import * as errorHandler from './middleware/error_handler';
import * as stats from './middleware/stats';
import * as context from './util/context';

export interface RestServerOptions {
  app: express.Express;
  protectedApi: boolean;
  sessionsHandler: SessionsHandler;
}

/**
 * Class for configuring the express routes and middleware
 */
export default class RestServer {
    private readonly app: express.Express;
    private readonly protectedApi: boolean;
    private readonly sessionsHandler: SessionsHandler;

    /**
     * Constructor
     * @param options options
     */
    constructor(options: RestServerOptions) {
        this.app = options.app;
        this.protectedApi = options.protectedApi;
        this.sessionsHandler = options.sessionsHandler;
    }

    /**
     * Initializes the express configs
     */
    public init(): void {
        this.config(this.app);
        this.configRoutes(this.app);
    }

    /**
     * Configures express middlewares
     * @param app express app
     * @private
     */
    private config(app: Express): void {
        app.use(bodyParser.json());
        app.use(express.json());
        app.use('/', context.injectContext);

        const loggedPaths = [ '/jitsi-component-selector/*' ];

        app.use(loggedPaths, stats.middleware);
        app.use(loggedPaths, context.accessLogger);
        stats.registerHandler(app, '/metrics');

        app.use(
            [ '/jitsi-component-selector/sessions/start' ],
            body('callParams.callUrlInfo.baseUrl').notEmpty()
                .withMessage('Value must be set'),
            body('callParams.callUrlInfo.callName').notEmpty()
                .withMessage('Value must be set'),
            body('componentParams.type').notEmpty()
                .withMessage('Value must be set'),
            body('componentParams.region').notEmpty()
                .withMessage('Value must be set'),
            async (req, res, next) => {
                try {
                    const errors = validationResult(req);

                    if (!errors.isEmpty()) {
                        return res.status(400).json({ errors: errors.array() });
                    }
                    next();
                } catch (err) {
                    next(err);
                }
            }
        );

        app.use(
            [ '/jitsi-component-selector/sessions/stop' ],
            body('callParams.callUrlInfo.baseUrl').notEmpty()
                .withMessage('Value must be set'),
            body('callParams.callUrlInfo.callName').notEmpty()
                .withMessage('Value must be set'),
            body('sessionId').notEmpty()
                .withMessage('Value must be set'),
            async (req, res, next) => {
                try {
                    const errors = validationResult(req);

                    if (!errors.isEmpty()) {
                        return res.status(400).json({ errors: errors.array() });
                    }
                    next();
                } catch (err) {
                    next(err);
                }
            }
        );

        // This is placed last in the middleware chain and is our default error handler.
        app.use(errorHandler.middleware);
    }

    /**
     * Configures express routes
     * @param app express app
     * @private
     */
    private configRoutes(app: Application): void {
        app.get('/health', (req: express.Request, res: express.Response) => {
            res.send('healthy!');
        });

        app.post(
      '/jitsi-component-selector/sessions/start',
      async (
              req: express.Request,
              res: express.Response,
              next: express.NextFunction
      ) => {
          try {
              await this.sessionsHandler.startSession(req, res);
          } catch (err) {
              next(err);
          }
      }
        );

        app.post(
      '/jitsi-component-selector/sessions/stop',
      async (
              req: express.Request,
              res: express.Response,
              next: express.NextFunction
      ) => {
          try {
              await this.sessionsHandler.stopSession(req, res);
          } catch (err) {
              next(err);
          }
      }
        );

        app.get(
      '/jitsi-component-selector/sessions/:sessionId',
      async (
              req: express.Request,
              res: express.Response,
              next: express.NextFunction
      ) => {
          try {
              await this.sessionsHandler.getSession(req, res);
          } catch (err) {
              next(err);
          }
      }
        );
    }
}
