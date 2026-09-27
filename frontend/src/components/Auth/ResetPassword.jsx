import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { LuCircleAlert, LuEye, LuEyeOff, LuLoaderCircle, LuLock } from "react-icons/lu";
import api from "../../api/client";
import { clearAuthError } from "../../Store/slices/authSlice";
// import PasswordStrength from "./PasswordStrength";
import PasswordStrength, { validateNewPassword } from "./PasswordStrength";
import { formatCountdown, getRateLimit } from "./rateLimit";
import { useRetryCountdown } from "./useRetryCountdown";

const ResetPassword = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [formData, setFormData] = useState({ password: "", confirm: "" });
    const [show, setShow] = useState({ password: false, confirm: false });
    const [errors, setErrors] = useState({});
    // true when the server says the link is bad or expired, so we can offer a new one.
    const [linkInvalid, setLinkInvalid] = useState(false);
    const [loading, setLoading] = useState(false);
    // Turns missing checklist items red after a blocked submit, so the user sees what to fix.
    const [showUnmet, setShowUnmet] = useState(false);
    // Seconds left on a RATE_LIMITED 429; the button stays disabled until it reaches 0.
    const [retryWait, startRetryWait] = useRetryCountdown();

    // Clear on enter and leave, so an old login error does not show up again on the login tab.
    useEffect(() => {
        dispatch(clearAuthError());
        return () => dispatch(clearAuthError());
    }, [dispatch]);

    const onChangeHandle = (key, value) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => ({ ...prev, [key]: "", general: "" }));
    };

    const validateForm = () => {
        const newErrors = {};
        // Same rule as the server (8-128 chars, a letter and a number), so the user sees it before submitting.
        // if (!formData.password) newErrors.password = "Please choose a new password.";
        // else if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters.";
        const passwordError = validateNewPassword(formData.password);
        if (!formData.password) newErrors.password = "Please choose a new password.";
        else if (passwordError) newErrors.password = passwordError;
        if (newErrors.password) setShowUnmet(true);
        if (!formData.confirm) newErrors.confirm = "Please type the password again.";
        else if (formData.confirm !== formData.password) newErrors.confirm = "Passwords don't match.";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);
        setLinkInvalid(false);
        try {
            await api.post("/users/reset-password", { token, password: formData.password });
            // Every session is revoked on success, so the user must log in again.
            navigate("/auth/login?reset=1", { replace: true });
        } catch (err) {
            const data = err.response?.data;
            if (data?.code === "RESET_INVALID") setLinkInvalid(true);
            const limited = getRateLimit(err);
            if (limited) startRetryWait(limited.retryAfter);
            setErrors((prev) => ({
                ...prev,
                general: limited?.message || data?.message || "Could not reset your password. Try again.",
            }));
            setLoading(false);
        }
    };

    const toggle = (key) => setShow((prev) => ({ ...prev, [key]: !prev[key] }));

    const renderPasswordField = (key, label, placeholder, describedBy) => {
        const id = `reset-${key}`;
        return (
            <div className="auth-input">
                <LuLock className="auth-input__icon" aria-hidden="true" />
                <input
                    id={id}
                    type={show[key] ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={placeholder}
                    value={formData[key]}
                    aria-invalid={errors[key] ? "true" : "false"}
                    aria-describedby={describedBy}
                    onChange={(e) => onChangeHandle(key, e.target.value)}
                />
                <button
                    type="button"
                    className="auth-input__toggle"
                    aria-label={show[key] ? `Hide ${label}` : `Show ${label}`}
                    aria-controls={id}
                    aria-pressed={show[key]}
                    onClick={() => toggle(key)}
                >
                    {show[key] ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
                </button>
            </div>
        );
    };

    return (
        <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
                <label htmlFor="reset-password">New password</label>
                {renderPasswordField(
                    "password",
                    "new password",
                    "At least 8 characters",
                    `${errors.password ? "reset-password-error " : ""}reset-password-hint`
                )}
                {errors.password && <p id="reset-password-error" className="auth-field__error">{errors.password}</p>}
                <PasswordStrength id="reset-password-hint" password={formData.password} showUnmet={showUnmet} />
            </div>

            <div className="auth-field">
                <label htmlFor="reset-confirm">Confirm new password</label>
                {renderPasswordField(
                    "confirm",
                    "confirmed password",
                    "Type it again",
                    errors.confirm ? "reset-confirm-error" : undefined
                )}
                {errors.confirm && <p id="reset-confirm-error" className="auth-field__error">{errors.confirm}</p>}
            </div>

            {errors.general && (
                <div className="auth-alert auth-alert--error" role="alert">
                    <LuCircleAlert aria-hidden="true" />
                    <div>
                        <p>{errors.general}</p>
                        {/* A bad or expired link cannot be fixed on this page; send them for a new one. */}
                        {linkInvalid && (
                            <Link to="/auth/forgot-password" className="auth-link-btn">
                                Request a new link
                            </Link>
                        )}
                    </div>
                </div>
            )}

            <button type="submit" className="auth-submit" disabled={loading || retryWait > 0}>
                {loading && <LuLoaderCircle className="auth-spinner" aria-hidden="true" />}
                {loading ? "Saving…" : "Set new password"}
            </button>
            {retryWait > 0 && <p className="auth-retry">Try again in {formatCountdown(retryWait)}</p>}

            <p className="auth-switch">
                Remembered it?{" "}
                <button type="button" className="auth-switch__link" onClick={() => navigate("/auth/login")}>
                    Back to log in
                </button>
            </p>
        </form>
    );
};

export default ResetPassword;
