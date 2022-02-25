import { Request, Response } from 'express';

import SessionsService, { Session, SessionStatus } from '../service/session_service';

export enum ComponentType {
    Jibri = 'JIBRI',
    SipJibri = 'SIP-JIBRI',
    Jigasi = 'JIGASI',
}

export interface CallUrlInfo {
    baseUrl: string;
    callName: string;
    urlParams?: string[];
}

export interface CallParams {

    /**
     * Jibri uses the call url info to join the meeting
     */
    callUrlInfo?: CallUrlInfo;

    /**
     * Jigasi does not use the url info, but instead relies on the room
     * //TODO perhaps we can refactor Jibri to use the room as well
     */
    room?: string;

    /**
     * Email to populate on the xmpp join message
     */
    email?: string;

    /**
     * This will be used by jitsi-meet to send the conference password to prosody
     * and bypass the password prompt
     */
    passcode?: string;

    /**
     * This value will be the component identifier in callStats app
     * Use it only to override the callStatsUsername set by default by the component
     */
    callStatsUsernameOverride?: string;

    /**
     * Display name which is used by the component when joining the web conference.
     */
    displayName?: string;
}

export enum JibriSinkType {
    FILE = 'FILE',
    STREAM = 'STREAM'
}

export interface SipClientParams {

    /**
     * The SIP address we'll be connecting to
     */
    sipAddress: string;

    /**
     * The display name used by pjsua as identity when listening for or sending an invite
     * For sending an invite, this should be the name of the entity initiating the invite
     */
    displayName: string;

    /**
     * Whether auto-answer is enabled, if it is, the client will listen for
     * incoming invites and will auto answer the first one.
     */
    autoAnswer: boolean;
}

/**
 * Parameters specific to a sip audio only call handled by Jigasi
 */
export interface SipCallParams {
    from: string;
    to: string;
    headers: any;
}

export interface JibriAppData {

    /**
     * A JSON map representing arbitrary data to be written
     * to the metadata file when doing a recording.
     */
    fileRecordingMetadata: any;
}

export interface JibriServiceParams {
    appData?: JibriAppData;

    // TODO decide how this should be passed on and supported
    usageTimeoutMinutes?: number;
}

export interface JibriMetadata {
    sinkType: JibriSinkType;
    youTubeStreamKey?: string;
    serviceParams?: JibriServiceParams;
}

export interface SipJibriMetadata {
    sipClientParams: SipClientParams;
}

export interface JigasiMetadata {
    sipCallParams: SipCallParams;
}

export interface ComponentParams {
    type: ComponentType;
    region: string;
    environment: string;
    excludedComponentKeys?: string[];
    metadata?: JibriMetadata | SipJibriMetadata | JigasiMetadata;
}

export interface CallLoginParams {
    domain?: string;
    username?: string;
    password?: string;
    token?: string;
}

export interface StartSessionRequest {
    callParams: CallParams;
    callLoginParams: CallLoginParams
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
        const stopSessionRequest: StopSessionRequest = req.body;

        const responsePayload = await this.sessionsService.stopSession(req.context, stopSessionRequest);

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
