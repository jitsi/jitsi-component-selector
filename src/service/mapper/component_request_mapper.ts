import {
    JibriMetadata,
    JibriSinkType,
    JigasiMetadata,
    SipJibriMetadata,
    StartSessionRequest
} from '../../handlers/session_handler';
import { JibriRequest, JigasiRequest, SipJibriRequest } from '../command_service';

export interface ComponentRequestMapperOptions {
    sipJibriInboundEmail: string;
    sipJibriOutboundEmail: string;
    sipAddressPattern: string;
}

/**
 * Maps start/stop session requests to a specific request to send to the component
 */
export default class ComponentRequestMapper {

    private readonly sipJibriInboundEmail: string;
    private readonly sipJibriOutboundEmail: string;
    private readonly sipAddressPattern: string;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentRequestMapperOptions) {
        this.sipJibriInboundEmail = options.sipJibriOutboundEmail;
        this.sipJibriOutboundEmail = options.sipJibriOutboundEmail;
        this.sipAddressPattern = options.sipAddressPattern;
    }

    /**
     * Maps the start session request to a basic component request
     * @param sessionId
     * @param startSessionRequest
     * @private
     */
    private static mapToBasicComponentRequest(sessionId: string,
            startSessionRequest:StartSessionRequest): any {
        return {
            sessionId,
            callParams: startSessionRequest.callParams,
            callLoginParams: startSessionRequest.callLoginParams
        }
    }

    /**
     * Maps the startSessionRequest to a jibri (recorder, streamer) request
     * @param sessionId
     * @param startSessionRequest
     * @private
     */
    public mapToJibriComponentRequest(sessionId: string,
            startSessionRequest: StartSessionRequest): JibriRequest {
        const componentMetadata = startSessionRequest.metadata as JibriMetadata;
        const componentRequest: JibriRequest = ComponentRequestMapper
            .mapToBasicComponentRequest(sessionId, startSessionRequest) as JibriRequest;

        componentRequest.sinkType = componentMetadata.sinkType;
        if (componentMetadata.sinkType === JibriSinkType.FILE) {
            componentRequest.serviceParams = componentMetadata.serviceParams;
        } else if (componentMetadata.sinkType === JibriSinkType.STREAM) {
            componentRequest.youTubeStreamKey = componentMetadata.youTubeStreamKey;
        }

        return componentRequest;
    }

    /**
     * Maps the startSessionRequest to a sip jibri request
     * @param sessionId
     * @param startSessionRequest
     * @private
     */
    public mapToSipJibriComponentRequest(sessionId: string,
            startSessionRequest: StartSessionRequest): SipJibriRequest {
        const componentRequest:SipJibriRequest = ComponentRequestMapper
            .mapToBasicComponentRequest(sessionId, startSessionRequest) as SipJibriRequest;
        const componentMetadata = startSessionRequest.metadata as SipJibriMetadata;

        if (!componentMetadata.sipClientParams) {
            return componentRequest;
        }

        componentRequest.sinkType = 'GATEWAY';
        if (componentMetadata.sipClientParams.autoAnswer) {
            // Inbound
            const callerDisplayName = componentMetadata.sipClientParams.displayName;

            // SIPJibri will join the web conference using as display name the name of the caller
            componentRequest.callParams.displayName = callerDisplayName;
            componentRequest.callParams.email = this.sipJibriInboundEmail;
            componentRequest.callParams.callStatsUsernameOverride = `${callerDisplayName} (inbound)`;
            componentRequest.sipClientParams = componentMetadata.sipClientParams;
        } else {
            // Outbound
            let calleeDisplayName = componentMetadata.sipClientParams.sipAddress;

            if (new RegExp(this.sipAddressPattern).test(calleeDisplayName)) {
                calleeDisplayName = calleeDisplayName.match(this.sipAddressPattern)[2];
            }

            // SIPJibri will join the web conference using as display name
            // the name of the person invited to join the meeting
            componentRequest.callParams.displayName = calleeDisplayName;
            componentRequest.callParams.email = this.sipJibriOutboundEmail;
            componentRequest.callParams.callStatsUsernameOverride = `${calleeDisplayName} (outbound)`;
            componentRequest.sipClientParams = componentMetadata.sipClientParams;
        }

        return componentRequest;
    }

    /**
     * Maps the startSessionRequest to a jigasi request
     * @param sessionId
     * @param startSessionRequest
     * @private
     */
    public mapToJigasiComponentRequest(sessionId: string,
            startSessionRequest: StartSessionRequest): JigasiRequest {
        const componentRequest: JigasiRequest = ComponentRequestMapper
            .mapToBasicComponentRequest(sessionId, startSessionRequest) as JigasiRequest;
        const componentMetadata = startSessionRequest.metadata as JigasiMetadata;

        componentRequest.sipCallParams = componentMetadata.sipCallParams;

        return componentRequest;
    }
}
