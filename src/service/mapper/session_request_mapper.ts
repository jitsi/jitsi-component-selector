import {
    BulkInviteRequest,
    ComponentType, JigasiMetadata, SipCallParams,
    SipClientParams,
    SipJibriMetadata,
    StartSessionRequest
} from '../../handlers/session_handler';

/**
 * Maps requests (e.g. bulk invite) to Start/Stop session request
 */
export default class SessionRequestsMapper {

    /**
     * Maps the BulkInviteRequest into a list of StartSessionRequest entries
     * @param bulkInviteRequest
     * @private
     */
    public static mapToStartSessionRequests(bulkInviteRequest: BulkInviteRequest): StartSessionRequest[] {
        const requests: StartSessionRequest[] = [];

        if (bulkInviteRequest.componentParams.type === ComponentType.SipJibri) {
            bulkInviteRequest.sipClientParams.sipAddress.forEach((sipAddress: string) => {
                requests.push(this.mapToSipJibriStartSessionRequest(sipAddress, bulkInviteRequest));
            })
        } else if (bulkInviteRequest.componentParams.type === ComponentType.Jigasi) {
            bulkInviteRequest.sipCallParams.to.forEach((to: string) => {
                requests.push(this.mapToJigasiStartSessionRequest(to, bulkInviteRequest));
            })
        }

        return requests;
    }

    /**
     * Map to a single start session request for SIP-Jibri
     * @param sipAddress
     * @param bulkInviteRequest
     * @private
     */
    private static mapToSipJibriStartSessionRequest(sipAddress: string, bulkInviteRequest: BulkInviteRequest):
        StartSessionRequest {
        const sipClientParams: SipClientParams = {
            displayName: bulkInviteRequest.sipClientParams.displayName,
            sipAddress,
            autoAnswer: false
        }

        return <StartSessionRequest>{
            callParams: bulkInviteRequest.callParams,
            componentParams: bulkInviteRequest.componentParams,
            metadata: <SipJibriMetadata>{
                sipClientParams
            }
        }
    }

    /**
     * Map to a single start session request for Jigasi
     * @param to
     * @param bulkInviteRequest
     * @private
     */
    private static mapToJigasiStartSessionRequest(to: string, bulkInviteRequest: BulkInviteRequest):
        StartSessionRequest {
        const sipCallParams: SipCallParams = {
            from: bulkInviteRequest.sipCallParams.from,
            to,
            headers: bulkInviteRequest.sipCallParams.headers
        }

        return <StartSessionRequest> {
            callParams: bulkInviteRequest.callParams,
            componentParams: bulkInviteRequest.componentParams,
            metadata: <JigasiMetadata>{
                sipCallParams
            }
        }
    }
}
