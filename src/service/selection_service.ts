import { ComponentParams, ComponentType } from '../handlers/session_handler';
import ComponentRepository from '../repository/component_repository';
import ComponentUtils from '../util/component_utils';
import { Context } from '../util/context';

export interface Component {
    key: string;
    type: ComponentType;
    region: string;
    environment: string;
}

export interface Candidate {
    component: Component;
    score: number;
}

export interface SelectionServiceOptions {
    componentRepository: ComponentRepository;
    candidateTTLSec: number;
}

/**
 * Service which handles selection
 */
export default class SelectionService {

    private componentRepository: ComponentRepository;
    private readonly candidateTTLSec: number;

    /**
     * Constructor
     * @param options options
     */
    constructor(options: SelectionServiceOptions) {
        this.componentRepository = options.componentRepository;
        this.candidateTTLSec = options.candidateTTLSec;
    }

    /**
     * Selects an available component (jibri, jigasi etc)
     * @param ctx request context
     * @param componentParams
     */
    async selectComponent(ctx: Context,
            componentParams: ComponentParams
    ): Promise<Component> {
        ctx.logger.info(`Select available ${componentParams.type} from environment ${componentParams.environment}, 
            region ${componentParams.region}, excluding ${componentParams.excludedComponentKeys}`);

        if (ComponentUtils.singleUse(componentParams.type) === true) {
            return await this.selectComponentForSingleUse(ctx, componentParams);
        }

        return await this.selectComponentForPartialUse(ctx, componentParams);
    }

    /**
     * Selects a single-use, available candidate (e.g Jibri, SipJibri)
     * @param ctx request context
     * @param componentParams
     */
    private async selectComponentForSingleUse(
            ctx: Context, componentParams: ComponentParams): Promise<Component> {
        const currentTime = Date.now();
        const score = currentTime.valueOf();

        const candidate = await this.componentRepository.selectCandidate(ctx, componentParams, score);

        if (candidate) {
            if (!this.isExpired(candidate)) {
                return candidate.component;
            }
            ctx.logger.info('All the candidates are expired');
        }
        ctx.logger.info('No available candidates in pool');

        return null;
    }

    /**
     * Selects a multi-use candidate (e.g. Jigasi)
     * @param ctx request context
     * @param componentParams
     */
    private async selectComponentForPartialUse(ctx: Context,
            componentParams: ComponentParams): Promise<Component> {
        const candidates = await this.componentRepository.getAllCandidatesSorted(
            ctx, componentParams
        );

        for (const candidate of candidates) {
            if (!componentParams.excludedComponentKeys.includes(candidate.component.key)
                && !this.isExpired(candidate)) {
                return candidate.component;
            }
            ctx.logger.info('All the candidates are excluded or expired');
        }
        ctx.logger.info('No available candidates in pool');

        return null;
    }

    /**
     * Check if the candidate is expired
     * @param candidate
     */
    private isExpired(candidate: Candidate): boolean {
        const score: string = candidate.score.toString();
        const componentTimestamp = score.split('.')[1];

        const expirationDate = new Date(Date.now() - (this.candidateTTLSec * 1000)).getTime();

        return Date.parse(componentTimestamp) < expirationDate;
    }

}
