import express from "express";
import logger from "../util/logger";

export function middleware(
  err: Error,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  // If the headers have already been sent then we must use
  // the built-in default error handler according to
  // https://expressjs.com/en/guide/error-handling.html
  if (res.headersSent) {
    return next(err);
  }

  let l = logger;

  if (req.context && req.context.logger) {
    l = req.context.logger;
  }

  if (err.name === "UnauthorizedError" && err.message === "forbidden") {
    l.info(`unauthorized token ${err}`);
    res.status(403).send({
      timestamp: Date.now(),
      status: 403,
      message: "Forbidden",
      messageKey: "forbidden",
      path: req.path,
    });
  } else if (
    // HTTPError: Response code 403 (Forbidden) is thrown in case of an invalid kid
    (err.name == "HTTPError" &&
      err.message == "Response code 403 (Forbidden)") ||
    err.name === "UnauthorizedError" ||
    err.message === "invalid issuer or kid" ||
    err.message === "kid is required in header" ||
    err.message === "invalid kid format for VpaaS" ||
    err.message === "error obtaining asap pub key"
  ) {
    l.info(`unauthorized token ${err}`);
    res.status(401).send();
  } else {
    l.error(`internal error ${err}`, { stack: err.stack });
    res.status(500).send({
      timestamp: Date.now(),
      status: 500,
      message: "Internal Server Error",
      messageKey: "internal.server.errors",
      path: req.path,
    });
  }
}
