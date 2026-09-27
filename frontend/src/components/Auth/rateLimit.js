// Helpers for the auth rate limit: the server answers 429 { message, code: "RATE_LIMITED" }
// plus a Retry-After header. No imports on purpose, so a plain node script can test them.

// Used when the server gives no usable wait time, so the button still unlocks by itself.
export const DEFAULT_RETRY_SECONDS = 60;

// Retry-After can be a number of seconds or an HTTP date. Returns whole seconds, or null.
export const parseRetryAfter = (value, nowMs = Date.now()) => {
    if (value === undefined || value === null || String(value).trim() === "") return null;
    const n = Number(value);
    if (Number.isFinite(n)) return n > 0 ? Math.ceil(n) : null;
    const date = Date.parse(value);
    if (Number.isNaN(date)) return null;
    const seconds = Math.ceil((date - nowMs) / 1000);
    return seconds > 0 ? seconds : null;
};

// Turns an axios error into { message, code, retryAfter } when it is a RATE_LIMITED 429.
// Any other error returns null, so callers keep their normal error handling.
export const getRateLimit = (error, nowMs = Date.now()) => {
    const res = error?.response;
    if (!res || res.status !== 429 || res.data?.code !== "RATE_LIMITED") return null;
    // axios headers may be an AxiosHeaders object (case-insensitive get) or a plain object.
    const header = typeof res.headers?.get === "function"
        ? res.headers.get("retry-after")
        : res.headers?.["retry-after"];
    let retryAfter = parseRetryAfter(header, nowMs);
    if (!retryAfter) {
        // No header: the message still says "N minutes", so use that before the default.
        const m = /(\d+)\s*minute/i.exec(res.data?.message || "");
        retryAfter = m ? Number(m[1]) * 60 : DEFAULT_RETRY_SECONDS;
    }
    return {
        message: res.data?.message || "Too many attempts. Please try again later.",
        code: "RATE_LIMITED",
        retryAfter,
    };
};

// 872 -> "14:32", 5 -> "0:05", 3725 -> "1:02:05".
export const formatCountdown = (seconds) => {
    const s = Math.max(0, Math.ceil(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
