import * as express from "express";
import * as context from "./util/context";
import * as stats from "./middleware/stats";
import * as error_handler from "./middleware/error_handler";
import { Application, Express } from "express";
import SessionsHandler from "./handlers/sessions_handler";

export interface RestServerOptions {
  app: express.Express;
  protectedApi: boolean;
  sessionsHandler: SessionsHandler;
}

export default class RestServer {
  private readonly app: express.Express;
  private readonly sessionsHandler: SessionsHandler;

  constructor(options: RestServerOptions) {
    this.app = options.app;
    this.sessionsHandler = options.sessionsHandler;
  }

  public init(): void {
    this.config(this.app);
    this.configRoutes(this.app);
  }

  private config(app: Express): void {
    app.use(express.json());
    app.use("/", context.injectContext);

    const loggedPaths = ["/jitsi-component-selector/*"];
    app.use(loggedPaths, stats.middleware);
    app.use(loggedPaths, context.accessLogger);
    stats.registerHandler(app, "/metrics");

    // This is placed last in the middleware chain and is our default error handler.
    app.use(error_handler.middleware);
  }

  private configRoutes(app: Application): void {
    app.get("/health", (req: express.Request, res: express.Response) => {
      res.send("healthy!");
    });

    app.post(
      "/jitsi-component-selector/sessions/start",
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
      "/jitsi-component-selector/sessions/stop",
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
      "/jitsi-component-selector/sessions/:sessionId",
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
