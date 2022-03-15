import { ComponentType, JibriSinkType } from '../handlers/session_handler';

/**
 * Returns valid jibri sink types
 */
export function jibriSinkTypes(): string[] {
    return Object.keys(JibriSinkType)
        .filter(item => isNaN(Number(item)))
        .map(item => JibriSinkType[item as keyof typeof JibriSinkType])
}


/**
 * Returns valid component types
 */
export function componentTypes(): string[] {
    return Object.keys(ComponentType)

        // keep only string identifier, e.g. SipJibri
        .filter(item => isNaN(Number(item)))

        // map to string values, e.g. SIP-JIBRI
        .map(item => ComponentType[item as keyof typeof ComponentType])
}
