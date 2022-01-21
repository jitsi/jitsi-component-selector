import { Logger } from "winston";
import logger from "./logger";
import { Request, Response, NextFunction } from "express";
import shortid from "shortid";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context: Context;
    }
  }
}

export class Context {
  constructor(
    public logger: Logger,
    public start: number,
    public requestId: string
  ) {}
}

export function generateNewContext(contextId?: string): Context {
  const start = Date.now();
  if (!contextId) {
    contextId = shortid.generate();
  }
  const ctxLogger = logger.child({
    id: contextId,
  });
  return new Context(ctxLogger, start, contextId);
}

// injectContext adds context to the express request object. The context
// includes the start date, a request id and a handler specific logger.
// This middleware should be registered before any middleware that make use of
// context or anything it contains.
export function injectContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestIdHeader = req.header("X-Request-Id");
  const start = Date.now();
  const reqId = requestIdHeader ? requestIdHeader : shortid.generate();
  const reqLogger = logger.child({
    rid: reqId,
    ref: req.get("referer"),
    ip: req.ip,
    ua: req.get("user-agent"),
  });
  req.context = new Context(reqLogger, start, reqId);
  res.header("X-Request-Id", reqId);
  next();
}

// accessLogger logs summary data for each http api call. It makes use of the
// context logger.
export function accessLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let logged = false;
  const accessLog = function () {
    if (!logged) {
      logged = true;
      req.context.logger.info("", {
        m: req.method,
        u: req.originalUrl,
        s: res.statusCode,
        d: Math.abs(Date.now() - req.context.start),
      });
    }
  };

  res.on("finish", accessLog);
  res.on("close", accessLog);
  next();
}
