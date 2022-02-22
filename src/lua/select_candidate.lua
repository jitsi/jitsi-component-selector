local candidatesPoolKey = KEYS[1]
local inProgressPoolKey = KEYS[2]

local score = ARGV[1]

local candidate = redis.call('ZPOPMAX', candidatesPoolKey)
if candidate and candidate[1] then
    redis.call('ZADD', inProgressPoolKey, score, tostring(candidate[1]))
end

return candidate
