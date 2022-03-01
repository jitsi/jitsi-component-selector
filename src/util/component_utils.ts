import { ComponentType } from '../handlers/session_handler';
import { ComponentState } from '../service/component_tracker';

/**
 * Component utils
 */
export default class ComponentUtils {

    /**
     * Return the score based on the component state
     * @param componentState
     */
    public static calculateScore(componentState: ComponentState): number {
        if (this.singleUse(componentState.type)) {
            return ComponentUtils.computeScore(componentState.timestamp);
        }

        return ComponentUtils.computeScore(
                componentState.timestamp, componentState.stats.jigasiStatus.stressLevel);
    }

    /**
     * Decide if the component has a single session at a time
     * @param type
     */
    public static singleUse(type: ComponentType) : boolean {
        switch (type) {
        case ComponentType.Jibri:
        case ComponentType.SipJibri:
            return true;
        case ComponentType.Jigasi:
            return false;
        default:
            return true;
        }
    }

    /**
     * Compute score from weight and timestamp
     * @param stressLevel optional component stress level
     * @param timestamp latest timestamp
     */
    private static computeScore(timestamp: number, stressLevel?: number) : number {
        let score: string = timestamp ? String(timestamp) : String(Date.now());

        if (stressLevel) {
            score = String(ComponentUtils.computeWeightPercentage(stressLevel)).concat('.')
                .concat(String(timestamp));
        }

        return Number(score);
    }

    /**
     * Compute weight from stress level
     * @param stressLevel
     */
    private static computeWeightPercentage(stressLevel: number) :number {
        let weight = Math.floor((1 - stressLevel) * 100);

        // if we go over to 0 or below, set weight to 1 (lowest non-drained state)
        if (weight <= 0) {
            weight = 1;
        }

        return weight;
    }

}
