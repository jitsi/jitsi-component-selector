import { Request, Response } from 'express';

import SessionsService from '../service/sessions_service';

export interface SessionsHandlerOptions {
  sessionsService: SessionsService;
}

/**
 * Handles requests for managing (recording, dial-out etc) sessions for meetings
 */
export default class SessionsHandler {
    private sessionsService: SessionsService;

    /**
     * Constructor
     * @param options sessions handler options
     */
    constructor(options: SessionsHandlerOptions) {
        this.sessionsService = options.sessionsService;
    }

    /**
     * Starts a (recording, dial-out etc) session for a meeting
     * @param req request
     * @param res response
     */
    async startSession(req: Request, res: Response): Promise<void> {
        await this.sessionsService.startSession(req.context);
        res.status(200);
        res.send();
    }

    /**
     * Stops a (recording, dial-out etc) session for a meeting
     * @param req request
     * @param res response
     */
    async stopSession(req: Request, res: Response): Promise<void> {
        await this.sessionsService.stopSession(req.context);
        res.status(200);
        res.send();
    }

    /**
     * Gets the details of a (recording, dial-out etc) session
     * @param req request
     * @param res response
     */
    async getSession(req: Request, res: Response): Promise<void> {
        await this.sessionsService.getSession(req.context);
        res.status(200);
        res.send();
    }
}
