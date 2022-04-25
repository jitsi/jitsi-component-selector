# jitsi-component-selector
Selector Service for Jitsi components

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
