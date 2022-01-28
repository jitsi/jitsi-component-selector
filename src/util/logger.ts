import logger from '@jitsi/logger';

/**
 * An instantiated and configured {@code jitsi logger} instance.
 */
export default logger.getLogger('components-selector', undefined, {
    disableCallerInfo: true
});

/* import winston from 'winston';

import config from '../config/config';

const sensitiveInfo = [ 'passcode' ];
const customFormatter = winston.format.json({
    replacer: (key, value) => {
        if (sensitiveInfo.includes(key)) {
            return '*****';
        }

        return value;
    }
});

const options: winston.LoggerOptions = {
    format: winston.format.combine(winston.format.timestamp(), customFormatter),
    transports: [
        new winston.transports.Console({
            level: config.LogLevel
        })
    ]
};

const logger = winston.createLogger(options);

export default logger;*/


