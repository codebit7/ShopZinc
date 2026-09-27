import React from "react";
import { LuCheck, LuCircle, LuCircleX } from "react-icons/lu";

// Shared by SignUp and ResetPassword, so both pages judge a password the same way.
// These checks are now the real rule: the server rejects signup/reset passwords that fail
// them (400 "Password must be at least 8 characters and include a letter and a number.").
// Must stay in step with the backend rule, or users see a green checklist and still get a 400.
// Old comment: "Client-side hint only. The backend only needs 6+ characters (BUG-35)".
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PASSWORD_RULE_MESSAGE = "Password must be at least 8 characters and include a letter and a number.";

// export const PASSWORD_CHECKS = [
//     { key: "length", label: "8 or more characters", test: (p) => p.length >= 8 },
//     { key: "number", label: "A number", test: (p) => /\d/.test(p) },
//     { key: "letter", label: "A letter", test: (p) => /[a-zA-Z]/.test(p) },
// ];
export const PASSWORD_CHECKS = [
    { key: "length", label: "At least 8 characters", test: (p) => p.length >= PASSWORD_MIN },
    { key: "letter", label: "At least one letter", test: (p) => /[a-zA-Z]/.test(p) },
    { key: "number", label: "At least one number", test: (p) => /\d/.test(p) },
];

// Returns the error text to show, or "" when the password is allowed.
export const validateNewPassword = (p) => {
    if (!p) return "";
    if (p.length > PASSWORD_MAX) return `Password must be ${PASSWORD_MAX} characters or fewer.`;
    if (!PASSWORD_CHECKS.every((c) => c.test(p))) return PASSWORD_RULE_MESSAGE;
    return "";
};

export const getStrength = (p) => {
    if (!p) return null;
    let score = PASSWORD_CHECKS.filter((c) => c.test(p)).length;
    // Extra credit for a symbol or mixed case, and for real length.
    if (/[^A-Za-z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score++;
    if (p.length >= 12) score++;
    // if (p.length < 6 || score <= 2) return { level: 1, label: "Weak" };
    // A password the server will reject is always "Weak", or a long no-number
    // password would show "Strong" and then fail on submit.
    if (validateNewPassword(p) || score <= 2) return { level: 1, label: "Weak" };
    if (score === 3) return { level: 2, label: "Fair" };
    return { level: 3, label: "Strong" };
};

// `id` is what the password input points at with aria-describedby.
// `showUnmet` is set after a blocked submit, so missing items turn red instead of grey.
const PasswordStrength = ({ id, password, showUnmet = false }) => {
    const strength = getStrength(password);
    return (
        <div id={id} className="auth-strength">
            <div className="auth-strength__row">
                <div className={`auth-strength__bar${strength ? ` is-${strength.level}` : ""}`} aria-hidden="true">
                    <span /><span /><span />
                </div>
                {/* Live, so screen readers hear the strength change without re-reading the field. */}
                <span className="auth-strength__label" aria-live="polite">
                    {strength ? `${strength.label} password` : "Password strength"}
                </span>
            </div>
            <p className="auth-checklist__title">Your password needs:</p>
            <ul className="auth-checklist">
                {PASSWORD_CHECKS.map((c) => {
                    const ok = c.test(password);
                    const unmet = !ok && showUnmet;
                    return (
                        <li key={c.key} className={ok ? "is-met" : unmet ? "is-unmet" : ""}>
                            {ok ? <LuCheck aria-hidden="true" /> : unmet ? <LuCircleX aria-hidden="true" /> : <LuCircle aria-hidden="true" />}
                            {c.label}
                            <span className="auth-sr-only">{ok ? " (done)" : " (missing)"}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default PasswordStrength;
