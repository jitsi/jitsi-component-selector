import { Request, Response } from 'express';

import ComponentService from '../service/component_service';

export interface ComponentHandlerOptions {
    componentService: ComponentService;
}

/**
 * Handles requests for managing components
 */
export default class ComponentHandler {
    private componentService: ComponentService;

    /**
     * Constructor
     * @param options component handler options
     */
    constructor(options: ComponentHandlerOptions) {
        this.componentService = options.componentService;
    }

    /**
     * Gets details about the components in a group
     * @param req request
     * @param res response
     */
    async getComponentsInfo(req: Request, res: Response): Promise<void> {
        const ctx = req.context;
        const report = await this.componentService.getComponentsInfo(ctx, req.params.group);

        res.status(200);
        res.send({ components: report });
    }
}
