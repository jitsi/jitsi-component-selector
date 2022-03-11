import { body } from 'express-validator';

import config from '../../config/config';
import { ComponentType, JibriSinkType, SipCallParams, SipClientParams } from '../../handlers/session_handler';
import { componentTypes, jibriSinkTypes } from '../../util/enum_utils';

const MSG_NOT_EMPTY = 'Value must be set';
const MSG_VALID = 'Value must be valid';
const MSG_NOT_EMPTY_AND_VALID = 'Value must be set and valid';

export const callUrlInfoRuleArray = [
    body('callParams.callUrlInfo.baseUrl')
        .notEmpty()
        .withMessage(MSG_NOT_EMPTY)
        .bail()
        .isURL({ protocols: [ 'http', 'https' ],
            /* eslint-disable camelcase */
            require_protocol: true,
            /* eslint-disable camelcase */
            allow_fragments: false,
            /* eslint-disable camelcase */
            allow_query_components: false })
        .withMessage(MSG_NOT_EMPTY_AND_VALID),
    body('callParams.callUrlInfo.callName')
        .notEmpty()
        .withMessage(MSG_NOT_EMPTY)
]

const sipClientParamsValidator = (sipClientParams: SipClientParams) => {
    if (!sipClientParams) {
        throw new Error(MSG_NOT_EMPTY);
    }

    if (sipClientParams.autoAnswer === undefined || sipClientParams.autoAnswer === null) {
        throw new Error(`${MSG_NOT_EMPTY} for: autoAnswer`);
    }

    if (!sipClientParams.displayName) {
        throw new Error(`${MSG_NOT_EMPTY} for: displayName`);
    }

    if (!sipClientParams.sipAddress) {
        throw new Error(`${MSG_NOT_EMPTY} for: sipAddress`);
    }

    if (!sipClientParams.sipAddress.match(config.SipAddressPattern)) {
        throw new Error(`${MSG_VALID} for: sipAddress`)
    }

    return true;
}

const sipCallParamsValidator = (sipCallParams: SipCallParams) => {
    if (!sipCallParams) {
        throw new Error(MSG_NOT_EMPTY);
    }

    if (!sipCallParams.to) {
        throw new Error(`${MSG_NOT_EMPTY} for: to`)
    }

    if (!sipCallParams.to.match(config.SipCallDestinationPattern)) {
        throw new Error(`${MSG_VALID} for: to`);
    }

    return true;
}

export const getStartSessionRules = () => {
    const specificRules = [
        body('componentParams.type')
            .isIn(componentTypes())
            .withMessage(MSG_NOT_EMPTY_AND_VALID),
        body('componentParams.region')
            .notEmpty()
            .withMessage(MSG_NOT_EMPTY),
        body('componentParams.environment')
            .notEmpty()
            .withMessage(MSG_NOT_EMPTY),
        body('metadata')
            .notEmpty()
            .withMessage(MSG_NOT_EMPTY),
        body('metadata.sinkType')
            .if(body('componentParams.type').equals(ComponentType.Jibri))
            .isIn(jibriSinkTypes())
            .withMessage(MSG_NOT_EMPTY_AND_VALID),
        body('metadata.youTubeStreamKey')
            .if(body('componentParams.type').equals(ComponentType.Jibri))
            .if(body('metadata.sinkType').equals(JibriSinkType.STREAM))
            .notEmpty()
            .withMessage(MSG_NOT_EMPTY),
        body('metadata.sipClientParams')
            .if(body('componentParams.type').equals(ComponentType.SipJibri))
            .custom(sipClientParamsValidator),
        body('metadata.sipCallParams')
            .if(body('componentParams.type').equals(ComponentType.Jigasi))
            .custom(sipCallParamsValidator)
    ];

    return [ ...callUrlInfoRuleArray, ...specificRules ]
}

const sipAddressArrayValidator = (sipAddresses: string[]) => {
    sipAddresses.forEach(sipAddress => {
        if (!sipAddress.match(config.SipAddressPattern)) {
            throw new Error(`${MSG_VALID}: ${sipAddress}`)
        }
    });

    return true;
}

export const getInviteSessionRules = () => {
    const callUrlInfoRules = callUrlInfoRuleArray;
    const specificRules = [
        body('componentParams.type')
            .optional()
            .isIn(componentTypes())
            .withMessage(MSG_VALID),
        body('sipClientParams.displayName')
            .notEmpty()
            .withMessage(MSG_NOT_EMPTY),
        body('sipClientParams.sipAddress')
            .notEmpty()
            .withMessage(MSG_NOT_EMPTY)
            .bail()
            .isArray()
            .withMessage('Value must be an array')
            .bail()
            .custom(sipAddressArrayValidator)
    ]

    return [ ...callUrlInfoRules, ...specificRules ];
}

export const getStopSessionRules = () => {
    const specificRules = [
        body('sessionId')
            .notEmpty()
.withMessage(MSG_NOT_EMPTY)
    ]

    return [ ...callUrlInfoRuleArray, ...specificRules ];
}


