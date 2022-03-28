import { StartSessionRequest } from '../../handlers/session_handler';
import {
    Session,
    SessionErrorResponsePayload, SessionErrorType,
    SessionResponsePayload, SessionStatus
} from '../session_service';

/**
 * Maps session to SessionResponsePayload response
 */
export default class SessionResponseMapper {

    /**
     * Maps the session to a session response
     * @param session
     * @param metadata
     */
    public static mapToSessionResponse(
            session: Session, metadata?: any): SessionResponsePayload {
        return {
            sessionId: session.sessionId,
            type: session.componentType,
            environment: session.environment,
            region: session.region,
            status: session.status,
            componentKey: session.componentKey,
            metadata
        }
    }

    /**
     * Maps the session to a failed session response
     * @param session
     */
    public static mapToFailedSessionResponse(session: Session): SessionErrorResponsePayload {
        return {
            sessionId: session.sessionId,
            type: session.componentType,
            environment: session.environment,
            region: session.region,
            status: session.status,
            componentKey: session.componentKey,
            errorKey: session.errorKey,
            errorMessage: session.errorMessage
        }
    }

    /**
     * Maps the session to a failed session response, if no available candidates
     * @param sessionId
     * @param startSessionRequest
     */
    public static mapToUnavailableSessionResponse(
            sessionId: string, startSessionRequest: StartSessionRequest): SessionErrorResponsePayload {
        return {
            sessionId,
            environment: startSessionRequest.componentParams.environment,
            region: startSessionRequest.componentParams.region,
            type: startSessionRequest.componentParams.type,
            status: SessionStatus.UNDEFINED,
            errorKey: SessionErrorType.UNAVAILABLE_COMPONENTS,
            errorMessage: 'No available candidates, please try again'
        };
    }
}
