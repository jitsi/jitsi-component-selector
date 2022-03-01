local candidatesPoolKey = KEYS[1]
local inProgressPoolKey = KEYS[2]

local component = ARGV[1]

local removedFromCandidatesPool = redis.call('ZREM', candidatesPoolKey, component)
local removedFromInProgressPool = redis.call('ZREM', inProgressPoolKey, component)

local response = {}
response[1] = removedFromCandidatesPool
response[2] = removedFromInProgressPool
return response
