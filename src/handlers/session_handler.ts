import { Request, Response } from 'express';

import SessionsService, { Session, SessionStatus } from '../service/session_service';

export enum ComponentType {
    Jibri = 'JIBRI',
    Jigasi = 'JIGASI',
}

export interface CallUrlInfo {
    baseUrl: string;
    callName: string;
    urlParams?: string[];
}

export interface CallParams {
    callUrlInfo: CallUrlInfo;
    passcode?: string;
}

export interface ComponentParams {
    type: ComponentType;
    region: string;
    metadata?: any;
}

export interface StartSessionRequest {
    callParams: CallParams;
    componentParams: ComponentParams;
}

export interface StopSessionRequest {
    sessionId: string;
}

export interface UpdateSessionRequest {
    sessionId: string;
    status: SessionStatus;
    message?: string;
}

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
        const requestPayload: StartSessionRequest = req.body;

        const responsePayload = await this.sessionsService.startSession(req.context, requestPayload);

        if (requestPayload) {
            res.status(200);
            res.send({ responsePayload });
        } else {
            res.status(400);
        }
    }

    /**
     * Stops a (recording, dial-out etc) session for a meeting
     * @param req request
     * @param res response
     */
    async stopSession(req: Request, res: Response): Promise<void> {
        const requestPayload: StopSessionRequest = req.body;

        const responsePayload = await this.sessionsService.stopSession(req.context, requestPayload);

        if (responsePayload.hasOwnProperty('errorKey')) {
            res.status(400);
            res.send(responsePayload);
        } else {
            res.status(200);
            res.send(responsePayload);
        }
    }

    /**
     * Gets the details of a (recording, dial-out etc) session
     * @param req request
     * @param res response
     */
    async getSession(req: Request, res: Response): Promise<void> {
        const session: Session = await this.sessionsService.getSession(req.context, req.params.sessionId);

        if (session) {
            res.status(200);
            res.send(session);
        } else {
            res.sendStatus(404);
        }
    }

}
