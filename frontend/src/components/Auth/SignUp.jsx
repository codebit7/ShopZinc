import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
// import { LuCheck, LuCircle, LuCircleAlert, LuEye, LuEyeOff, LuLoaderCircle, LuLock, LuMail, LuMailCheck, LuUser } from "react-icons/lu";
// LuCheck / LuCircle moved into PasswordStrength with the meter.
import { LuCircleAlert, LuEye, LuEyeOff, LuLoaderCircle, LuLock, LuMail, LuMailCheck, LuUser } from "react-icons/lu";
import api from "../../api/client";
import { clearAuthError } from "../../Store/slices/authSlice";
// import PasswordStrength from "./PasswordStrength";
import PasswordStrength, { validateNewPassword } from "./PasswordStrength";
import { formatCountdown, getRateLimit } from "./rateLimit";
import { useRetryCountdown } from "./useRetryCountdown";

// PASSWORD_CHECKS and getStrength moved to PasswordStrength.jsx, so ResetPassword can use
// the same meter. Kept here commented in case the pages ever need different rules.
// const PASSWORD_CHECKS = [
//     { key: "length", label: "8 or more characters", test: (p) => p.length >= 8 },
//     { key: "number", label: "A number", test: (p) => /\d/.test(p) },
//     { key: "letter", label: "A letter", test: (p) => /[a-zA-Z]/.test(p) },
// ];
//
// const getStrength = (p) => {
//     if (!p) return null;
//     let score = PASSWORD_CHECKS.filter((c) => c.test(p)).length;
//     if (/[^A-Za-z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score++;
//     if (p.length >= 12) score++;
//     if (p.length < 6 || score <= 2) return { level: 1, label: "Weak" };
//     if (score === 3) return { level: 2, label: "Fair" };
//     return { level: 3, label: "Strong" };
// };

const SignUp = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [done, setDone] = useState(false);
    // Turns missing checklist items red after a blocked submit, so the user sees what to fix.
    const [showUnmet, setShowUnmet] = useState(false);
    // Seconds left on a RATE_LIMITED 429; the button stays disabled until it reaches 0.
    const [retryWait, startRetryWait] = useRetryCountdown();
    const navigate = useNavigate();
    // Pass the login "from" through, so switching to signup and back still returns the user to their page.
    const location = useLocation();
    const dispatch = useDispatch();

    // Clear on enter and leave, so an old login error does not show up again after switching tabs.
    useEffect(() => {
        dispatch(clearAuthError());
        return () => dispatch(clearAuthError());
    }, [dispatch]);

    // No `role` field. The old form offered an "admin" option, which let
    // anyone create an admin account for themselves.
    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
    const [errors, setErrors] = useState({});

    const validateForm = () => {
        let valid = true;
        let newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = "Please enter your full name.";
            valid = false;
        }
        if (!formData.email.trim()) {
            newErrors.email = "Please enter your email.";
            valid = false;
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = "This email doesn't look right. Check for typos.";
            valid = false;
        }
        // Same rule as the server (8-128 chars, a letter and a number), so the user
        // finds out here instead of from a 400 after submitting.
        const passwordError = validateNewPassword(formData.password);
        if (!formData.password) {
            newErrors.password = "Please choose a password.";
            valid = false;
        } else if (passwordError) {
            newErrors.password = passwordError;
            valid = false;
        }
        // else if (formData.password.length < 6) {
        //     newErrors.password = "Password must be at least 6 characters.";
        //     valid = false;
        // }
        if (!formData.password || passwordError) setShowUnmet(true);

        setErrors(newErrors);
        return valid;
    };

    const onChangeHandle = (key, value) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => ({ ...prev, [key]: "" }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsLoading(true);
        try {
            await api.post("/users/register", formData);
            setDone(true);
        } catch (error) {
            // A duplicate email no longer fails (the server answers like a new signup, so
            // it cannot be used to find accounts), so there is no 409 case to handle here.
            const limited = getRateLimit(error);
            if (limited) startRetryWait(limited.retryAfter);
            setErrors((prev) => ({
                ...prev,
                general: limited?.message || error.response?.data?.message || "Registration failed. Try again.",
            }));
        } finally {
            setIsLoading(false);
        }
    };

    // The account exists but cannot log in until the link is clicked, so send
    // the user to their inbox rather than to the login form.
    if (done) {
        return (
            <div className="auth-form auth-done" role="status">
                <span className="auth-done__icon" aria-hidden="true"><LuMailCheck /></span>
                <h2 className="auth-done__title">Check your email</h2>
                <p className="auth-done__text">
                    We sent a verification link to <strong>{formData.email}</strong>.
                    Click it to finish creating your account.
                </p>
                <p className="auth-done__hint">Can't find it? Check your spam or promotions folder.</p>
                <button type="button" className="auth-submit auth-submit--secondary" onClick={() => navigate("/auth/login", { state: location.state })}>
                    Back to login
                </button>
            </div>
        );
    }

    return (
        <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
                <label htmlFor="signup-name">Full name</label>
                <div className="auth-input">
                    <LuUser className="auth-input__icon" aria-hidden="true" />
                    <input
                        id="signup-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Jane Doe"
                        value={formData.name}
                        aria-invalid={errors.name ? "true" : "false"}
                        aria-describedby={errors.name ? "signup-name-error" : undefined}
                        onChange={(e) => onChangeHandle("name", e.target.value)}
                    />
                </div>
                {errors.name && <p id="signup-name-error" className="auth-field__error">{errors.name}</p>}
            </div>

            <div className="auth-field">
                <label htmlFor="signup-email">Email</label>
                <div className="auth-input">
                    <LuMail className="auth-input__icon" aria-hidden="true" />
                    <input
                        id="signup-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        aria-invalid={errors.email ? "true" : "false"}
                        aria-describedby={errors.email ? "signup-email-error" : undefined}
                        onChange={(e) => onChangeHandle("email", e.target.value)}
                    />
                </div>
                {errors.email && <p id="signup-email-error" className="auth-field__error">{errors.email}</p>}
            </div>

            <div className="auth-field">
                <label htmlFor="signup-password">Password</label>
                <div className="auth-input">
                    <LuLock className="auth-input__icon" aria-hidden="true" />
                    <input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={formData.password}
                        aria-invalid={errors.password ? "true" : "false"}
                        aria-describedby={`${errors.password ? "signup-password-error " : ""}signup-password-hint`}
                        onChange={(e) => onChangeHandle("password", e.target.value)}
                    />
                    {/* A real button (was a clickable span), so keyboard and screen-reader users can use it. */}
                    <button
                        type="button"
                        className="auth-input__toggle"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-controls="signup-password"
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
                    </button>
                </div>
                {errors.password && <p id="signup-password-error" className="auth-field__error">{errors.password}</p>}

                <PasswordStrength id="signup-password-hint" password={formData.password} showUnmet={showUnmet} />
            </div>

            <label className="auth-terms">
                <input type="checkbox" required />
                {/* <span>I agree to the terms of service</span> */}
                {/* New tab, so opening the policy does not throw away what the user typed. */}
                <span>
                    I agree to the{" "}
                    <Link to="/terms" target="_blank" rel="noopener" className="auth-terms__link">terms of service</Link>
                    {" "}and{" "}
                    <Link to="/privacy" target="_blank" rel="noopener" className="auth-terms__link">privacy policy</Link>
                </span>
            </label>

            {errors.general && (
                <div className="auth-alert auth-alert--error" role="alert">
                    <LuCircleAlert aria-hidden="true" />
                    <p>{errors.general}</p>
                </div>
            )}

            <button type="submit" className="auth-submit" disabled={isLoading || retryWait > 0}>
                {isLoading && <LuLoaderCircle className="auth-spinner" aria-hidden="true" />}
                {isLoading ? "Creating account…" : "Create account"}
            </button>
            {retryWait > 0 && <p className="auth-retry">Try again in {formatCountdown(retryWait)}</p>}

            <p className="auth-switch">
                Already have an account?{" "}
                <button type="button" className="auth-switch__link" onClick={() => navigate("/auth/login", { state: location.state })}>
                    Log in
                </button>
            </p>
        </form>
    );
};

export default SignUp;
