import jitsiLogger from '@jitsi/logger';

/**
 * An instantiated and configured {@code jitsi logger} instance.
 */
export default jitsiLogger.getUntrackedLogger('jitsi-component-selector', undefined, {
    disableCallerInfo: true
});
