import { ComponentType, StartSessionRequest } from '../handlers/session_handler';
import SessionRepository from '../repository/session_repository';
import { Context } from '../util/context';

export interface Component {
    key: string;
    type: ComponentType;
    region: string;
}

export interface SelectionServiceOptions {
    redisManager: SessionRepository;
}

/**
 * Service which handles selection
 */
export default class SelectionService {

    private redisManager: SessionRepository;

    /**
     * Constructor
     * @param options options
     */
    constructor(options: SelectionServiceOptions) {
        this.redisManager = options.redisManager;
    }

    /**
     * Selects an available component (jibri, jigasi etc)
     * @param ctx request context
     * @param startSessionRequest
     */
    async selectComponent(ctx: Context,
            startSessionRequest: StartSessionRequest
    ): Promise<Component> {
        ctx.logger.info(`Select available ${startSessionRequest.componentParams.type}`);

        return {
            key: 'componentKeyValue',
            type: startSessionRequest.componentParams.type,
            region: startSessionRequest.componentParams.region };
    }

}
