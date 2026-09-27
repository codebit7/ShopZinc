import { useCallback, useEffect, useState } from "react";

// Counts down the seconds from a RATE_LIMITED 429, so the form can keep its submit
// button disabled until the server will accept the request again.
// Kept apart from rateLimit.js so those helpers stay testable without Preact.
// Returns [secondsLeft, start(seconds)].
export const useRetryCountdown = () => {
    // An end time, not a counter, so a slow or paused tab still unlocks on time.
    const [until, setUntil] = useState(0);
    const [left, setLeft] = useState(0);

    useEffect(() => {
        if (!until) return undefined;
        const tick = () => {
            const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
            setLeft(s);
            if (s === 0) setUntil(0);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [until]);

    const start = useCallback((seconds) => {
        if (seconds > 0) setUntil(Date.now() + seconds * 1000);
    }, []);

    return [left, start];
};

export default useRetryCountdown;
