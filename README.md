# jitsi-component-selector
Selector Service for Jitsi components

# ARCHIVED
IMPORTANT NOTE:
This repository is no longer being maintained, and is out of scope for the jitsi project at the moment.
It may be revisited in the future but for now it is being archived.

## Build
---
**NOTE**
Node.js >= 16 and npm >= 8 are required.
---

```
npm install
npm run build
```

## Start
First make sure you have redis running next to the selector (by default connection is to 127.0.0.1:6379).
 * Macosx
    ```
    brew install redis
    brew services start redis
   ```
 * Linux (Debian/Ubuntu)
   ```
      apt install redis
   ```
Then start the node process.
```
npm run start
```


## Component authentication

Components connect to the selector through a sidecar, over a Socket.IO connection.
When `PROTECTED_API` is enabled, the sidecar has to present a system JWT in the Socket.IO `auth.token`,
signed by one of the `SYSTEM_ASAP_JWT_ACCEPTED_HOOK_ISS` issuers, for the `SYSTEM_ASAP_JWT_AUD` audience.

The verified token is bound to exactly one component identity:

* if the token carries the componentKey claim (`SYSTEM_ASAP_JWT_COMPONENT_KEY_CLAIM`, `sub` by default),
  the socket is bound to that componentKey and the `componentKey` from the handshake query, if present, must match it,
  otherwise the connection is rejected;
* if the token has no such claim and `WS_REQUIRE_COMPONENT_KEY_CLAIM` is `true`, the connection is rejected;
* if the token has no such claim and `WS_REQUIRE_COMPONENT_KEY_CLAIM` is `false` (the default, for backwards
  compatibility), the socket is bound to the `componentKey` from the handshake query.

Everything received on the socket is validated against the bound identity: status reports and session reports
for a different component are ignored and command responses are attributed to the bound component.
To fully prevent a component from impersonating another one, issue each sidecar a token with the componentKey
claim set to its own `componentKey` and enable `WS_REQUIRE_COMPONENT_KEY_CLAIM`.

## Starting a Session on a Component

### Start a Jibri Session

```
curl --request POST \
--url http://localhost:8015/jitsi-component-selector/sessions/start \
--header 'Content-Type: application/json' \
--data '{
	"callParams": {
		"callUrlInfo": {
			"baseUrl": "https://somedomain.com",
			"callName": "somemeeting"
		}
	},
	"componentParams": {
		"type": "JIBRI",
		"region": "someregion",
		"environment": "someenv"
	},
	"metadata": {
        "sinkType": "FILE"
    },
	"callLoginParams": {...}
}'
```

### Start a SIP-Jibri Inbound Session

```
curl --request POST \
--url http://localhost:8015/jitsi-component-selector/sessions/start \
--header 'Content-Type: application/json' \
--data '{
	"callParams": {
		"callUrlInfo": {
			"baseUrl": "https://somedomain.com",
			"callName": "somemeeting"
		}
	},
	"componentParams": {
		"type": "SIP-JIBRI",
		"region": "someregion",
		"environment": "someenv"
	},
	"metadata": {
        "sipClientParams": {
             "autoAnswer": true,
             "sipAddress": "sip:caller@callersipprovider.com",
             "displayName": "Caller"
        }
    }
}'
```

### Start a SIP-Jibri Outbound Session


```
curl --request POST \
--url http://localhost:8015/jitsi-component-selector/sessions/start \
--header 'Content-Type: application/json' \
--data '{
	"callParams": {
		"callUrlInfo": {
			"baseUrl": "https://somedomain.com",
			"callName": "somemeeting"
		}
	},
	"componentParams": {
		"type": "SIP-JIBRI",
		"region": "someregion",
		"environment": "someenv",
	},
	"metadata": {
        "sipClientParams": {
             "autoAnswer": false,
             "sipAddress": "sip:callee@calleesipprovider.com",
             "displayName": "Caller"
        }
    }
}'
```

### Send a bulk invite for SIP-Jibris

```
curl --request POST \
--url http://localhost:8015/jitsi-component-selector/sessions/start \
--header 'Content-Type: application/json' \
--data '{
	"callParams": {
		"callUrlInfo": {
			"baseUrl": "https://somedomain.com",
			"callName": "somemeeting"
		}
	},
	"sipClientParams": {
         "sipAddress": ["sip:callee@calleesipprovider.com", "sip:secondcallee@calleesipprovider.com"],
         "displayName": "Caller"
    }
}'
```
