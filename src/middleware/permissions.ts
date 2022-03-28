import express from 'express';
import { UnauthorizedError } from 'express-jwt';

export interface SelectorPermissionsOptions {
    protectedApi: boolean,
    jitsiSipJibriFeature: string,
    jitsiJigasiFeature: string
}

/**
 * Middleware to enforce permissions
 */
export class SelectorPermissions {
    private readonly protectedApi: boolean;
    private readonly featureMap: {[id: string]: string};
    private readonly jitsiSipJibriFeature: string;
    private readonly jitsiJigasiFeature: string;

    /**
     * Constructor
     * @param options
     */
    constructor(options: SelectorPermissionsOptions) {
        this.protectedApi = options.protectedApi;
        this.featureMap = {};
        this.jitsiSipJibriFeature = options.jitsiSipJibriFeature;
        this.jitsiJigasiFeature = options.jitsiJigasiFeature;
        this.jitsiPermissions = this.jitsiPermissions.bind(this);
        this.signalStartPermissions = this.signalStartPermissions.bind(this);
        this.signalStopPermissions = this.signalStopPermissions.bind(this);
    }

    /**
     * Check the feature exists on the incoming JWT
     * @param req
     * @param res
     * @param next
     */
    public jitsiPermissions(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!this.protectedApi) {
            return next();
        }

        let feature;

        if (req.body.sipClientParams) {
            feature = this.jitsiSipJibriFeature;
        } else if (req.body.sipCallParams) {
            feature = this.jitsiJigasiFeature;
        } else {
            req.context.logger.error('Could not locate the feature for this type of call');
            next(new UnauthorizedError('invalid_token', { message: 'forbidden' }));
        }

        SelectorPermissions.checkJitsiFeature(feature, req, res, next);
    }

    /**
     * Checks that a feature is part of the jitsi JWT
     * @param feature
     * @param req
     * @param res
     * @param next
     * @private
     */
    private static checkJitsiFeature(feature: string,
            req: express.Request, res: express.Response, next: express.NextFunction) {
        // The decoded JWT payload is available on the request via the user property
        const reqAsAny = req as any;
        const payload = reqAsAny.user;

        let featureEnabled = false;

        if (payload && payload.context && payload.context.features) {
            const features: { [feature: string]: boolean } = payload.context.features;

            featureEnabled = features[feature];
        }

        if (featureEnabled) {
            return next();
        }
        let userId: string;

        if (payload && payload.context && payload.context.user && payload.context.user.id) {
            userId = payload.context.user.id;
        }
        req.context.logger.error(`${feature} feature is not enabled for user ${userId} `);
        next(new UnauthorizedError('invalid_token', { message: 'forbidden' }));
    }

    /**
     * Check permissions to start a session from signalling component
     * @param req
     * @param res
     * @param next
     */
    public signalStartPermissions(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!this.protectedApi) {
            return next();
        }

        // TODO check that domain of the baseUrl matches the signal JWT domain
        next();
    }

    /**
     * Check permissions to stop a session from signalling component
     * @param req
     * @param res
     * @param next
     */
    public signalStopPermissions(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!this.protectedApi) {
            return next();
        }

        // TODO check that the current session domain matched the JWT domain
        next();
    }
}
