import * as dotenv from 'dotenv';
import envalid from 'envalid';

const result = dotenv.config();

if (result.error) {
    const err = <NodeJS.ErrnoException>result.error;

    switch (err.code) {
    case 'ENOENT':
        // skip if only error is missing file, this isn't fatal
        console.debug('Missing .env file, not loading environment file disk');
        break;
    default:
        throw result.error;
    }
}

const env = envalid.cleanEnv(process.env, {
    PORT: envalid.num({ default: 8015 }),
    WS_SERVER_PATH: envalid.str({ default: '/jitsi-component-selector/ws' }),
    LOG_LEVEL: envalid.str({ default: 'info' }),
    REDIS_HOST: envalid.str({ default: '127.0.0.1' }),
    REDIS_PORT: envalid.num({ default: 6379 }),
    REDIS_PASSWORD: envalid.str({ default: '' }),
    REDIS_TLS: envalid.bool({ default: false }),
    REDIS_DB: envalid.num({ default: 0 }),
    REDIS_SCAN_COUNT: envalid.num({ default: 100 }),
    PROTECTED_API: envalid.bool({ default: true }),
    COMPONENT_TTL_SEC: envalid.num({ default: 3600 }),
    ASAP_PUB_KEY_TTL: envalid.num({ default: 3600 }),
    SYSTEM_ASAP_PUB_KEY_BASE_URL: envalid.str(),
    SYSTEM_ASAP_JWT_AUD: envalid.str(),
    SYSTEM_ASAP_JWT_ACCEPTED_HOOK_ISS: envalid.str(),
    JITSI_ASAP_PUB_KEY_BASE_URL: envalid.str(),
    JITSI_ASAP_JWT_AUD: envalid.str(),
    JITSI_ASAP_JWT_ACCEPTED_HOOK_ISS: envalid.str(),
    SIP_ADDRESS_PATTERN: envalid.str({ default: '(^sips?:)?(.*)(@.*)' }),
    SIP_JIBRI_INBOUND_EMAIL: envalid.str({ default: 'inbound-sip-jibri@jitsi.net' }),
    SIP_JIBRI_OUTBOUND_EMAIL: envalid.str({ default: 'outbound-sip-jibri@jitsi.net' }),
    SIP_CALL_DESTINATION_PATTERN: envalid.str({ default: 'jitsi_meet_transcriber|^[0-9()-]+$' }),
    CANDIDATE_TTL_SEC: envalid.num({ default: 120 }),
    TRIM_COMPONENTS_INTERVAL_SEC: envalid.num({ default: 60 }),
    DEFAULT_REGION: envalid.str(),
    DEFAULT_ENVIRONMENT: envalid.str()
});

export default {
    HTTPServerPort: env.PORT,
    WSServerPath: env.WS_SERVER_PATH,
    LogLevel: env.LOG_LEVEL,
    RedisHost: env.REDIS_HOST,
    RedisPort: env.REDIS_PORT,
    RedisPassword: env.REDIS_PASSWORD,
    RedisTLS: env.REDIS_TLS,
    RedisDb: env.REDIS_DB,
    RedisScanCount: env.REDIS_SCAN_COUNT,
    ProtectedApi: env.PROTECTED_API,
    ComponentTtlSec: env.COMPONENT_TTL_SEC,
    AsapPubKeyTTL: env.ASAP_PUB_KEY_TTL,
    SystemAsapPubKeyBaseUrl: env.SYSTEM_ASAP_PUB_KEY_BASE_URL,
    SystemAsapJwtAcceptedAud: env.SYSTEM_ASAP_JWT_AUD,
    SystemAsapJwtAcceptedHookIss: env.SYSTEM_ASAP_JWT_ACCEPTED_HOOK_ISS.split(','),
    JitsiAsapPubKeyBaseUrl: env.JITSI_ASAP_PUB_KEY_BASE_URL,
    JitsiAsapJwtAcceptedAud: env.JITSI_ASAP_JWT_AUD,
    JitsiAsapJwtAcceptedHookIss: env.JITSI_ASAP_JWT_ACCEPTED_HOOK_ISS.split(','),
    SipAddressPattern: env.SIP_ADDRESS_PATTERN,
    SipJibriInboundEmail: env.SIP_JIBRI_INBOUND_EMAIL,
    SipJibriOutboundEmail: env.SIP_JIBRI_OUTBOUND_EMAIL,
    SipCallDestinationPattern: env.SIP_CALL_DESTINATION_PATTERN,
    CandidateTTLSec: env.CANDIDATE_TTL_SEC,
    TrimComponentsIntervalSec: env.TRIM_COMPONENTS_INTERVAL_SEC,
    DefaultRegion: env.DEFAULT_REGION,
    DefaultEnvironment: env.DEFAULT_ENVIRONMENT
};
