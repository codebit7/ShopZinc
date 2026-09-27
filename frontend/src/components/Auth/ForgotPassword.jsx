import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { LuCircleAlert, LuLoaderCircle, LuMail, LuMailCheck } from "react-icons/lu";
import api from "../../api/client";
import { clearAuthError } from "../../Store/slices/authSlice";
import { formatCountdown, getRateLimit } from "./rateLimit";
import { useRetryCountdown } from "./useRetryCountdown";

const ForgotPassword = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    // Login passes what the user already typed, so they do not type it twice.
    const [email, setEmail] = useState(location.state?.email || "");
    const [fieldError, setFieldError] = useState("");
    const [error, setError] = useState("");
    const [sentMessage, setSentMessage] = useState("");
    const [loading, setLoading] = useState(false);
    // Seconds left on a RATE_LIMITED 429; the button stays disabled until it reaches 0.
    const [retryWait, startRetryWait] = useRetryCountdown();

    // Clear on enter and leave, so an old login error does not show up again on the login tab.
    useEffect(() => {
        dispatch(clearAuthError());
        return () => dispatch(clearAuthError());
    }, [dispatch]);

    // Keep "from" but drop the email, so login still returns the user to their page.
    const backToLogin = () => {
        const { email: _email, ...rest } = location.state || {};
        navigate("/auth/login", { state: Object.keys(rest).length ? rest : undefined });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const value = email.trim();
        if (!value) {
            setFieldError("Please enter your email.");
            return;
        }
        if (!/\S+@\S+\.\S+/.test(value)) {
            setFieldError("This email doesn't look right. Check for typos.");
            return;
        }

        setLoading(true);
        setError("");
        try {
            // The server answers the same way whether or not the account exists,
            // so we just show its message.
            const res = await api.post("/users/forgot-password", { email: value });
            setSentMessage(res.data?.message || "If an account exists for that email, we sent a reset link.");
        } catch (err) {
            // 429 is the cooldown; anything else is a server or network problem.
            // setError(err.response?.data?.message || "Could not send the email. Try again.");
            // The only 429 now is RATE_LIMITED (no per-account cooldown any more); lock the
            // button for its Retry-After so the user does not keep hitting the limit.
            const limited = getRateLimit(err);
            if (limited) startRetryWait(limited.retryAfter);
            setError(limited?.message || err.response?.data?.message || "Could not send the email. Try again.");
        } finally {
            setLoading(false);
        }
    };

    if (sentMessage) {
        return (
            <div className="auth-form auth-done" role="status">
                <span className="auth-done__icon" aria-hidden="true"><LuMailCheck /></span>
                <h2 className="auth-done__title">Check your email</h2>
                <p className="auth-done__text">{sentMessage}</p>
                <p className="auth-done__hint">Can't find it? Check your spam or promotions folder.</p>
                <button type="button" className="auth-submit auth-submit--secondary" onClick={backToLogin}>
                    Back to log in
                </button>
            </div>
        );
    }

    return (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
                <label htmlFor="forgot-email">Email</label>
                <div className="auth-input">
                    <LuMail className="auth-input__icon" aria-hidden="true" />
                    <input
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        aria-invalid={fieldError ? "true" : "false"}
                        aria-describedby={fieldError ? "forgot-email-error" : undefined}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setFieldError("");
                        }}
                    />
                </div>
                {fieldError && <p id="forgot-email-error" className="auth-field__error">{fieldError}</p>}
            </div>

            {error && (
                <div className="auth-alert auth-alert--error" role="alert">
                    <LuCircleAlert aria-hidden="true" />
                    <p>{error}</p>
                </div>
            )}

            <button type="submit" className="auth-submit" disabled={loading || retryWait > 0}>
                {loading && <LuLoaderCircle className="auth-spinner" aria-hidden="true" />}
                {loading ? "Sending…" : "Send reset link"}
            </button>
            {retryWait > 0 && <p className="auth-retry">Try again in {formatCountdown(retryWait)}</p>}

            <p className="auth-switch">
                Remembered it?{" "}
                <button type="button" className="auth-switch__link" onClick={backToLogin}>
                    Back to log in
                </button>
            </p>
        </form>
    );
};

export default ForgotPassword;
