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
    CANDIDATE_TTL_SEC: envalid.num({ default: 120 }),
    SESSION_TTL_SEC: envalid.num({ default: 86400 }),
    ASAP_PUB_KEY_TTL: envalid.num({ default: 3600 }),
    SYSTEM_ASAP_BASE_URL_MAPPINGS: envalid.json({ example: '[{"kid": "kidPattern", baseUrl": "https://asap.org"}]' }),
    SYSTEM_ASAP_JWT_AUD: envalid.str(),
    SYSTEM_ASAP_JWT_ACCEPTED_HOOK_ISS: envalid.str(),
    JITSI_ASAP_BASE_URL_MAPPINGS: envalid.json({ example: '[{"kid":"kidPattern","baseUrl":"https://asap.org"]' }),
    JITSI_ASAP_JWT_AUD: envalid.str(),
    JITSI_ASAP_JWT_ACCEPTED_HOOK_ISS: envalid.str(),
    KEY_PREFIX_PATTERN: envalid.str({ default: '^(.*)/(.*)$' }),
    SIP_ADDRESS_PATTERN: envalid.str({ default: '(^sips?:)?(.*)(@.*)' }),
    SIP_JIBRI_INBOUND_EMAIL: envalid.str({ default: 'inbound-sip-jibri@jitsi.net' }),
    SIP_JIBRI_OUTBOUND_EMAIL: envalid.str({ default: 'outbound-sip-jibri@jitsi.net' }),
    SIP_CALL_DESTINATION_PATTERN: envalid.str({ default: 'jitsi_meet_transcriber|^[0-9()-]+$' }),
    CLEANUP_COMPONENTS_INTERVAL_SEC: envalid.num({ default: 60 }),
    CLEANUP_SESSIONS_INTERVAL_SEC: envalid.num({ default: 3600 }),
    DEFAULT_REGION: envalid.str(),
    DEFAULT_ENVIRONMENT: envalid.str(),
    JITSI_JIGASI_FEATURE: envalid.str({ default: 'outbound-call' }),
    JITSI_SIP_JIBRI_FEATURE: envalid.str({ default: 'sip-outbound-call' }),
    CMD_TIMEOUT_DEFAULT_MS: envalid.num({ default: 10000 }),
    CMD_TIMEOUT_STOP_MS: envalid.num({ default: 90000 })
});

/**
 * Maps a public key base URL to a kidPattern, if any
 */
export interface AsapBaseUrlMapping {
    kid?: string,
    baseUrl: string;
    appendKidPrefix: boolean;
}

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
    CandidateTTLSec: env.CANDIDATE_TTL_SEC,
    SessionTtlSec: env.SESSION_TTL_SEC,
    AsapPubKeyTTL: env.ASAP_PUB_KEY_TTL,
    SystemAsapBaseUrlMappings: env.SYSTEM_ASAP_BASE_URL_MAPPINGS,
    SystemAsapJwtAcceptedAud: env.SYSTEM_ASAP_JWT_AUD,
    SystemAsapJwtAcceptedHookIss: env.SYSTEM_ASAP_JWT_ACCEPTED_HOOK_ISS.split(','),
    JitsiAsapBaseUrlMappings: env.JITSI_ASAP_BASE_URL_MAPPINGS,
    JitsiAsapJwtAcceptedAud: env.JITSI_ASAP_JWT_AUD,
    JitsiAsapJwtAcceptedHookIss: env.JITSI_ASAP_JWT_ACCEPTED_HOOK_ISS.split(','),
    KidPrefixPattern: env.KEY_PREFIX_PATTERN,
    SipAddressPattern: env.SIP_ADDRESS_PATTERN,
    SipJibriInboundEmail: env.SIP_JIBRI_INBOUND_EMAIL,
    SipJibriOutboundEmail: env.SIP_JIBRI_OUTBOUND_EMAIL,
    SipCallDestinationPattern: env.SIP_CALL_DESTINATION_PATTERN,
    CleanupComponentsIntervalSec: env.CLEANUP_COMPONENTS_INTERVAL_SEC,
    CleanupSessionsIntervalSec: env.CLEANUP_SESSIONS_INTERVAL_SEC,
    DefaultRegion: env.DEFAULT_REGION,
    DefaultEnvironment: env.DEFAULT_ENVIRONMENT,
    JitsiJigasiFeature: env.JITSI_JIGASI_FEATURE,
    JitsiSipJibriFeature: env.JITSI_SIP_JIBRI_FEATURE,
    CommandTimeoutDefaultMs: env.CMD_TIMEOUT_DEFAULT_MS,
    CommandTimeoutStopMs: env.CMD_TIMEOUT_STOP_MS
};
