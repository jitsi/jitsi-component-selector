import * as express from 'express';
import { validationResult } from 'express-validator';

/**
 * Express validator middleware
 * @param req
 * @param res
 * @param next
 * @private
 */
export function validate(req: express.Request, res: express.Response, next: express.NextFunction) {
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
