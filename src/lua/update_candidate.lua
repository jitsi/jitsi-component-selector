local candidatesPoolKey = KEYS[1]
local inProgressPoolKey = KEYS[2]

local score = ARGV[1]
local component = ARGV[2]

local inProgressComponents = redis.call('ZSCORE', inProgressPoolKey, component);

if not inProgressComponents then
    return redis.call('ZADD', candidatesPoolKey, score, component)
end


