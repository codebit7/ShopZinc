// Why: login / register / reset endpoints had no attempt limit, so passwords and
// reset links could be brute-forced (BUG-35). Written by hand, no new dependency.
//
// ponytail: this store is in-memory and per-process. It resets on every restart
// and each instance counts on its own. If the app ever runs on several instances
// (cluster, several containers), move the counters to Redis or the limit is
// effectively multiplied by the number of instances.
//
// Note on IPs: in dev every request comes through the Vite proxy, so req.ip is
// 127.0.0.1 for everyone and they all share one IP bucket. Behind a real reverse
// proxy in production, set TRUST_PROXY (see index.js) so req.ip is the client IP.

// Fixed-window counter. `now` is injectable so tests can use a fake clock.
function createLimiterStore({ now = Date.now } = {}) {
    const hits = new Map() // key -> { count, resetAt }

    return {
        // Count one attempt for `key`; returns the count and when the window ends.
        hit(key, windowMs) {
            const t = now()
            let entry = hits.get(key)
            if (!entry || entry.resetAt <= t) {
                entry = { count: 0, resetAt: t + windowMs }
                hits.set(key, entry)
            }
            entry.count++
            return { count: entry.count, resetAt: entry.resetAt }
        },
        // Drop finished windows so the Map does not grow forever.
        prune() {
            const t = now()
            for (const [key, entry] of hits) {
                if (entry.resetAt <= t) hits.delete(key)
            }
        },
        size() {
            return hits.size
        },
    }
}

function rateLimit({ windowMs, max, keyFn = (req) => req.ip, message, now = Date.now, store } = {}) {
    const limiterStore = store || createLimiterStore({ now })

    // unref() so this timer never keeps the process (or a test script) alive.
    const timer = setInterval(() => limiterStore.prune(), windowMs)
    if (timer.unref) timer.unref()

    return function rateLimitMiddleware(req, res, next) {
        const key = keyFn(req)
        // No key (e.g. login without an email) -> nothing to count; the
        // controller rejects the request anyway.
        if (!key) return next()

        const { count, resetAt } = limiterStore.hit(key, windowMs)
        if (count <= max) return next()

        const retryAfterSec = Math.max(1, Math.ceil((resetAt - now()) / 1000))
        const minutes = Math.max(1, Math.ceil(retryAfterSec / 60))
        res.set('Retry-After', String(retryAfterSec))
        return res.status(429).json({
            message: message || `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
            code: 'RATE_LIMITED',
        })
    }
}

module.exports = { rateLimit, createLimiterStore }
