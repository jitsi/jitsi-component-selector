import { Request, Response } from "express";
import SessionsService from "../service/sessions_service";

export interface SessionsHandlerOptions {
  sessionsService: SessionsService;
}

export default class SessionsHandler {
  private sessionsService: SessionsService;

  constructor(options: SessionsHandlerOptions) {
    this.sessionsService = options.sessionsService;
  }

  async startSession(req: Request, res: Response): Promise<void> {
    await this.sessionsService.startSession(req.context);
    res.status(200);
    res.send();
  }

  async stopSession(req: Request, res: Response): Promise<void> {
    await this.sessionsService.stopSession(req.context);
    res.status(200);
    res.send();
  }

  async getSession(req: Request, res: Response): Promise<void> {
    await this.sessionsService.getSession(req.context);
    res.status(200);
    res.send();
  }
}
