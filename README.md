# jitsi-component-selector
Selector Service for Jitsi components

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
		"environment": "someenv",
		"metadata": {
			"sinkType": "FILE"
		}
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
		"environment": "someenv",
		"metadata": {
			"sipClientParams": {
				 "autoAnswer": true,
				 "sipAddress": "sip:caller@callersipprovider.com",
				 "displayName": "Caller"
			}
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
		},
		"displayName": "Callee"
	},
	"componentParams": {
		"type": "SIP-JIBRI",
		"region": "someregion",
		"environment": "someenv",
		"metadata": {
			"sipClientParams": {
				 "autoAnswer": false,
				 "sipAddress": "sip:callee@calleesipprovider.com",
				 "displayName": "Caller"
			}
		}
	}
}'
```