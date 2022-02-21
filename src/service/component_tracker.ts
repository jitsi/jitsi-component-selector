import ComponentRepository from '../repository/component_repository';
import { Context } from '../util/context';

import ComponentService from './component_service';

export enum InstanceStatusState {
    Idle = 'IDLE',
    Busy = 'BUSY',
    Expired = 'EXPIRED',
    SidecarRunning = 'SIDECAR_RUNNING',
}

export enum InstanceHealthState {
    Healthy = 'HEALTHY',
    Unhealthy = 'UNHEALTHY',
    Unknown = 'UNKNOWN',
}

export interface ComponentStatus {
    busyStatus: InstanceStatusState;
    health: InstanceHealthState;
}

export interface ComponentDetails {
    componentId: string;
    hostname: string;
    componentKey: string;
    cloud?: string;
    region: string;
    group: string;
    name?: string;
    version?: string;
    publicIp?: string;
    privateIp?: string;
}

/**
 "report": {
     "component": {
        "componentId": "10.42.183.97",
        "hostname": "sip-jibri-42-183-97"
      },
     "stats": {
        "status": {
          "busyStatus": "IDLE",
          "health": {
            "healthStatus": "HEALTHY",
            "details": {}
          }
        }
     },
     "timestamp": 1612521271901
 }
 */
export interface StatsReport {
    component: ComponentDetails;
    timestamp?: number;
    stats?: {
        status: ComponentStatus;
    };
}

export interface ComponentMetadata {
    group: string;
    publicIp?: string;
    privateIp?: string;
    version?: string;
    name?: string;
    [key: string]: string;
}

export interface ComponentState {
    componentId: string;
    hostname: string;
    componentKey: string;
    region: string;
    group:string;
    status: ComponentStatus;
    timestamp?: number;
    metadata: ComponentMetadata;
}

export interface ComponentTrackerOptions {
    componentService: ComponentService,
    componentRepository: ComponentRepository
}

/**
 */
export class ComponentTracker {
    private componentService: ComponentService;
    private componentRepository: ComponentRepository;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentTrackerOptions) {
        this.componentService = options.componentService;
        this.componentRepository = options.componentRepository;
        this.track = this.track.bind(this);
    }

    /**
     * Tracker method
     * @param ctx
     * @param report
     */
    async track(ctx: Context, report: StatsReport): Promise<boolean> {
        ctx.logger.debug(`Received report ${JSON.stringify(report)}`);
        const componentState = <ComponentState>{
            componentId: report.component.componentId,
            hostname: report.component.hostname,
            componentKey: report.component.componentKey,
            timestamp: report.timestamp,
            region: report.component.region,
            group: report.component.group,
            status: <ComponentStatus>report.stats.status,
            metadata: <ComponentMetadata>{ ...report.component }
        };

        if (!componentState.status) {
            // this can happen either at provisioning when the component is not yet up,
            // or when the sidecar does not see the component
            ctx.logger.info(`Empty stats report, as it does not include component stats: ${JSON.stringify(report)}`);

            componentState.status = {
                busyStatus: InstanceStatusState.SidecarRunning,
                health: InstanceHealthState.Unknown
            };
        }

        const componentStateTimestamp = Number(componentState.timestamp);

        if (!componentStateTimestamp) {
            componentState.timestamp = Date.now();
        }

        await this.handleComponentState(ctx, componentState);

        // Store latest component status
        await this.componentRepository.saveComponentState(ctx, componentState);

        return true;
    }

    /**
     * Handle component state
     * @param ctx
     * @param componentState
     */
    private async handleComponentState(ctx: Context, componentState: ComponentState) : Promise<void> {
        // const instanceKey = componentState.instanceKey;

        switch (componentState.status.busyStatus) {
        case InstanceStatusState.Idle:
            //   await this.componentRepository.candidate(ctx, { instanceKey }, componentState.timestamp);
            break;
        case InstanceStatusState.Busy:
        case InstanceStatusState.Expired:
        case InstanceStatusState.SidecarRunning:
            //  await this.componentRepository.remove(ctx, { instanceKey });
            break;
        }
    }
}
