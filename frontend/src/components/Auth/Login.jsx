import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { LuCircleAlert, LuCircleCheck, LuEye, LuEyeOff, LuInfo, LuLoaderCircle, LuLock, LuMail } from "react-icons/lu";
import { clearAuthError, login, resendVerification } from "../../Store/slices/authSlice";
import { formatCountdown } from "./rateLimit";
import { useRetryCountdown } from "./useRetryCountdown";

const Login = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    // The slice puts both success and failure (e.g. a RATE_LIMITED 429) into resendMessage,
    // so remember locally which one it was — otherwise "please wait" would show as a green success.
    const [resendFailed, setResendFailed] = useState(false);
    const [resending, setResending] = useState(false);
    // Separate timers: a rate limit on login must not lock the resend link, and the other way round.
    const [loginWait, startLoginWait] = useRetryCountdown();
    const [resendWait, startResendWait] = useRetryCountdown();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const location = useLocation();
    // Set by whatever sent the user here (Protect, cart/wishlist buttons, navbar).
    const from = location.state?.from;

    const dispatch = useDispatch();
    // status, not a "loading" field — the old code read state.auth.loading,
    // which never existed, so the button never disabled.
    const { status, isAuthenticated, error, code, user, resendMessage } =
        useSelector((state) => state.auth);
    const loading = status === "loading";

    // Clear on enter and leave, so an old login error does not show up again after switching tabs.
    useEffect(() => {
        dispatch(clearAuthError());
        return () => dispatch(clearAuthError());
    }, [dispatch]);

    useEffect(() => {
        // No localStorage write: the session lives in httpOnly cookies now.
        if (isAuthenticated && user) {
            // Return to the page that sent them here, instead of always "/".
            // A plain user must never be sent to an /admin path; /auth paths would just loop back here.
            const isAdmin = user.role === "admin";
            const path = from?.pathname;
            const isAdminPath = path === "/admin" || path?.startsWith("/admin/");
            // if (path && !path.startsWith("/auth") && (isAdmin || !isAdminPath)) {
            // Admin: only back to an admin page. The store "Log in" button passes the store page as
            // `from`, which sent admins to the store instead of the admin panel.
            if (path && !path.startsWith("/auth") && (isAdmin ? isAdminPath : !isAdminPath)) {
                navigate(path + (from.search || "") + (from.hash || ""), { replace: true });
                return;
            }
            navigate(isAdmin ? "/admin" : "/");
        }
    }, [isAuthenticated, user, navigate, from]);

    const verified = params.get("verified");
    // Set by ResetPassword after a successful reset.
    const reset = params.get("reset");

    const validateForm = () => {
        let valid = true;
        let newErrors = {};

        if (!formData.email.trim()) {
            newErrors.email = "Please enter your email.";
            valid = false;
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = "This email doesn't look right. Check for typos.";
            valid = false;
        }
        // Only "required" here. Length rules belong to signup/reset; accounts made before
        // the 8-character rule (or before any rule) must still be able to log in.
        if (!formData.password) {
            newErrors.password = "Please enter your password.";
            valid = false;
        }
        // else if (formData.password.length < 6) {
        //     newErrors.password = "Password must be at least 6 characters.";
        //     valid = false;
        // }
        setErrors(newErrors);
        return valid;
    };

    const onChangeHandle = (key, value) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => ({ ...prev, [key]: "" }));
    };

    const handleLogin = (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        // dispatch(login(formData));
        // Lock the button for the server's Retry-After, so the user is not tempted to keep
        // clicking into the same 429.
        dispatch(login(formData)).then((action) => {
            if (login.rejected.match(action) && action.payload?.code === "RATE_LIMITED") {
                startLoginWait(action.payload.retryAfter);
            }
        });
    };

    const handleResend = () => {
        setResending(true);
        dispatch(resendVerification(formData.email)).then((action) => {
            const failed = resendVerification.rejected.match(action);
            setResendFailed(failed);
            // code/retryAfter come in action.meta (see authSlice), the payload is just the message.
            if (failed && action.meta?.code === "RATE_LIMITED") startResendWait(action.meta.retryAfter);
            setResending(false);
        });
    };

    return (
        <form className="auth-form" onSubmit={handleLogin}>
            {verified === "1" && (
                <div className="auth-alert auth-alert--success" role="status">
                    <LuCircleCheck aria-hidden="true" />
                    <p><strong>Email verified.</strong> You can log in now.</p>
                </div>
            )}
            {reset === "1" && (
                <div className="auth-alert auth-alert--success" role="status">
                    <LuCircleCheck aria-hidden="true" />
                    <p><strong>Password updated</strong> — log in with your new password.</p>
                </div>
            )}
            {verified === "0" && (
                <div className="auth-alert auth-alert--error" role="alert">
                    <LuCircleAlert aria-hidden="true" />
                    <p>
                        <strong>That verification link is {params.get("reason") === "expired" ? "expired" : "invalid"}.</strong>{" "}
                        Log in below and we'll offer to send you a new one.
                    </p>
                </div>
            )}

            <div className="auth-field">
                <label htmlFor="login-email">Email</label>
                <div className="auth-input">
                    <LuMail className="auth-input__icon" aria-hidden="true" />
                    <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        aria-invalid={errors.email ? "true" : "false"}
                        aria-describedby={errors.email ? "login-email-error" : undefined}
                        onChange={(e) => onChangeHandle("email", e.target.value)}
                    />
                </div>
                {errors.email && <p id="login-email-error" className="auth-field__error">{errors.email}</p>}
            </div>

            <div className="auth-field">
                <label htmlFor="login-password">Password</label>
                <div className="auth-input">
                    <LuLock className="auth-input__icon" aria-hidden="true" />
                    <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Your password"
                        value={formData.password}
                        aria-invalid={errors.password ? "true" : "false"}
                        aria-describedby={errors.password ? "login-password-error" : undefined}
                        onChange={(e) => onChangeHandle("password", e.target.value)}
                    />
                    {/* A real button (was a clickable span), so keyboard and screen-reader users can use it. */}
                    <button
                        type="button"
                        className="auth-input__toggle"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-controls="login-password"
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
                    </button>
                </div>
                {errors.password && <p id="login-password-error" className="auth-field__error">{errors.password}</p>}
                {/* Pass the typed email so the user does not have to type it twice; keep "from" too. */}
                <Link
                    to="/auth/forgot-password"
                    state={{ ...(location.state || {}), email: formData.email.trim() }}
                    className="auth-forgot"
                >
                    Forgot password?
                </Link>
            </div>

            {error && (
                <div className="auth-alert auth-alert--error" role="alert">
                    <LuCircleAlert aria-hidden="true" />
                    <div>
                        <p>{error}</p>
                        {/* Only an unverified account gets the resend option. */}
                        {code === "EMAIL_NOT_VERIFIED" && (
                            <button type="button" className="auth-link-btn" onClick={handleResend} disabled={resending || resendWait > 0}>
                                {resending
                                    ? "Sending…"
                                    : resendWait > 0
                                        ? `Resend again in ${formatCountdown(resendWait)}`
                                        : "Resend verification email"}
                            </button>
                        )}
                    </div>
                </div>
            )}
            {resendMessage && (
                <div className={`auth-alert ${resendFailed ? "auth-alert--error" : "auth-alert--info"}`} role="status">
                    {resendFailed ? <LuCircleAlert aria-hidden="true" /> : <LuInfo aria-hidden="true" />}
                    <p>{resendMessage}</p>
                </div>
            )}

            <button type="submit" className="auth-submit" disabled={loading || loginWait > 0}>
                {loading && <LuLoaderCircle className="auth-spinner" aria-hidden="true" />}
                {loading ? "Logging in…" : "Log in"}
            </button>
            {loginWait > 0 && <p className="auth-retry">Try again in {formatCountdown(loginWait)}</p>}

            <p className="auth-switch">
                New to ShopZinc?{" "}
                <button type="button" className="auth-switch__link" onClick={() => navigate("/auth/signup", { state: location.state })}>
                    Create an account
                </button>
            </p>
        </form>
    );
};

export default Login;
