import { ComponentType } from '../handlers/session_handler';
import ComponentRepository from '../repository/component_repository';
import ComponentUtils from '../util/component_utils';
import { Context } from '../util/context';

import { Component } from './selection_service';

export enum JibriStatusState {
    Idle = 'IDLE',
    Busy = 'BUSY',
    Expired = 'EXPIRED',
    SidecarRunning = 'SIDECAR_RUNNING',
}

export enum JibriHealthState {
    Healthy = 'HEALTHY',
    Unhealthy = 'UNHEALTHY',
    Unknown = 'UNKNOWN',
}

export interface JibriStatus {
    busyStatus: JibriStatusState;
    health: JibriHealthState;
}

export interface JigasiStatus {
    stressLevel: number;

    // muc_clients_configured: number;
    // muc_clients_connected: number;
    conferences: number;
    participants: number;

    // largest_conference: number;
    gracefulShutdown: boolean;
}

export interface ComponentDetails {
    componentId: string;
    hostname: string;
    componentKey: string;
    componentType: any;
    cloud?: string;
    region: string;
    environment: string;
    group: string;
    name?: string;
    version?: string;
    publicIp?: string;
    privateIp?: string;
}

/**
 "report": {
     "component": {
        "componentId": "10.42.183.93",
        "componentKey": "jibri-42-183-93",
        "componentType": "JIBRI",
        "environment": "stage-8x8",
        "region": "us-phoenix-1",
        "hostname": "jibri-42-183-93"
        },
        "status": {
            "busyStatus": "IDLE",
            "health": {
                "healthStatus": "HEALTHY",
                "details": {
                 }
            }
        },
        "timestamp": 1647001413776
 }
 */
export interface StatsReport {
    component: ComponentDetails;
    status?: JibriStatus | JigasiStatus;
    timestamp?: number;
}

export interface ComponentMetadata {
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
    type: ComponentType;
    region: string;
    environment: string;
    status: JibriStatus | JigasiStatus;
    timestamp?: number;
    metadata: ComponentMetadata;
}

export interface ComponentTrackerOptions {
    componentRepository: ComponentRepository,
}

/**
 * Service which tracks component status updates
 */
export class ComponentTracker {
    private componentRepository: ComponentRepository;

    /**
     * Constructor
     * @param options
     */
    constructor(options: ComponentTrackerOptions) {
        this.componentRepository = options.componentRepository;
        this.track = this.track.bind(this);
    }

    /**
     * Tracker method
     * @param ctx
     * @param report
     */
    async track(ctx: Context, report: StatsReport): Promise<void> {
        ctx.logger.debug(`Received report ${JSON.stringify(report)}`);
        const componentState = <ComponentState>{
            componentId: report.component.componentId,
            hostname: report.component.hostname,
            componentKey: report.component.componentKey,
            timestamp: report.timestamp,
            environment: report.component.environment,
            region: report.component.region,
            type: report.component.componentType,
            status: report.status,
            metadata: <ComponentMetadata>{ ...report.component }
        };

        if (!componentState.status) {
            // this can happen either at provisioning when the component is not yet up,
            // or when the sidecar does not see the component
            ctx.logger.info(`Empty stats report, as it does not include component stats: ${JSON.stringify(report)}`);

            switch (report.component.componentType) {
            case ComponentType.Jibri:
            case ComponentType.SipJibri:
                componentState.status = {
                    busyStatus: JibriStatusState.SidecarRunning,
                    health: JibriHealthState.Unknown
                };
                break;
            case ComponentType.Jigasi:
                break;
            }
        }

        const componentStateTimestamp = Number(componentState.timestamp);

        if (!componentStateTimestamp) {
            componentState.timestamp = Date.now();
        }

        await this.handleComponentState(ctx, componentState);

        // Store latest component status
        await this.componentRepository.saveComponentState(ctx, componentState);
    }

    /**
     * Handle component state
     * @param ctx
     * @param componentState
     */
    private async handleComponentState(ctx: Context, componentState: ComponentState): Promise<void> {
        const component: Component = {
            key: componentState.componentKey,
            type: componentState.type,
            region: componentState.region,
            environment: componentState.environment
        }

        switch (component.type) {
        case ComponentType.Jibri:
        case ComponentType.SipJibri:
            await this.handleJibriState(ctx, component, componentState);
            break;
        case ComponentType.Jigasi:
            await this.handleJigasiState(ctx, component, componentState);
            break;
        }
    }

    /**
     * Handle Jibri state
     * @param ctx
     * @param component
     * @param componentState
     */
    private async handleJibriState(
            ctx: Context, component: Component, componentState: ComponentState): Promise<void> {
        if (componentState.status
            && 'busyStatus' in componentState.status && componentState.status.busyStatus) {
            switch (componentState.status.busyStatus) {
            case JibriStatusState.Idle:
                await this.markAsCandidate(ctx, component, componentState);
                break;
            case JibriStatusState.Busy:
            case JibriStatusState.Expired:
            case JibriStatusState.SidecarRunning:
                await this.removeCandidate(ctx, component);
                break;
            }
        }
    }

    /**
     * Handle Jigasi state
     * @param ctx
     * @param component
     * @param componentState
     */
    private async handleJigasiState(
            ctx: Context, component: Component, componentState: ComponentState): Promise<void> {
        const status = componentState.status as JigasiStatus;

        if (status.gracefulShutdown) {
            await this.removeCandidate(ctx, component);
        } else {
            await this.markAsCandidate(ctx, component, componentState);
        }
    }

    /**
     * Mark component as a candidate for selection
     * @param ctx request context
     * @param component
     * @param componentState
     */
    async markAsCandidate(ctx: Context, component: Component, componentState: ComponentState): Promise<void> {
        if (!component || !component.key) {
            ctx.logger.error(`Component ${JSON.stringify(component)} was not marked as a candidate, as it has no key `);

            return;
        }
        const componentScore = ComponentUtils.calculateScore(componentState);

        const response = await this.componentRepository.updateCandidate(
            ctx, componentScore, component);

        if (response && response === 1) {
            ctx.logger.info(`Component ${JSON.stringify(component)} was added to the candidates pool`);
        } else if (response === 0) {
            ctx.logger.info(
                `Candidate ${JSON.stringify(component)} was updated with the ${componentScore} score `);
        } else {
            ctx.logger.info(`Component ${JSON.stringify(component)} was not added to the candidates pool.'
                + 'Either the script had an error or the component is part of the 'in progress' pool `);
        }
    }

    /**
     * Remove component from the candidates
     * @param ctx request context
     * @param component
     */
    async removeCandidate(ctx: Context, component: Component): Promise<void> {
        const result = await this.componentRepository.removeCandidate(ctx, component);

        if (result && result.length > 0 && (result[0] !== 0 || result[1] !== 0)) {
            ctx.logger.info(`Component ${component.key} was removed from one of the pools`, {
                removedFromCandidatesPool: result[0] !== 0,
                removedFromInProgressPool: result[1] !== 0
            });
            if (result[0] === 1 && result[1] === 1) {
                // TODO poolErrorTotalCounter.inc({ error: COMPONENT_IN_BOTH_POOLS });
                // This should never happen
                // A component can be in only one pool at a time, it is either a candidate
                // or is marked as 'in progress' - this is the case of jibri for example that is of type 'singleUse'
                ctx.logger.error(
                    `Component was part of both pools 'candidates & in progress' 
                           + 'in the same time ${JSON.stringify(component)}`
                );
            }
        }
    }
}
