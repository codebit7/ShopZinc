import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LuArrowLeft, LuBanknote, LuRotateCcw, LuShieldCheck, LuShoppingBag } from "react-icons/lu";
import { SITE } from "../config/site";
import "./../components/Auth/auth.css";

// Same mark as the navbar logo, so the auth page feels like part of the shop.
const Logo = ({ className = "" }) => (
    <Link to="/" className={`auth-logo ${className}`} aria-label="ShopZinc home">
        <span className="auth-logo__mark" aria-hidden="true"><LuShoppingBag /></span>
        <span className="auth-logo__text">ShopZinc</span>
    </Link>
);

// Return days come from site config, so this never disagrees with the Returns page.
const TRUST_POINTS = [
    { icon: LuBanknote, title: "Cash on Delivery", text: "Pay when your order reaches your door." },
    { icon: LuShieldCheck, title: "Secure checkout", text: "Your account and details stay protected." },
    { icon: LuRotateCcw, title: `${SITE.policy.returnDays}-day returns`, text: "Changed your mind? Send it back easily." },
];

const AuthenticationPage = () => {
    // Title follows the URL, so it stays right on refresh and on direct links.
    const location = useLocation();
    const isSignup = location.pathname.startsWith("/auth/signup");
    // Neither tab fits the password pages, so hide the switch there instead of showing a wrong active tab.
    const isForgot = location.pathname.startsWith("/auth/forgot-password");
    const isReset = location.pathname.startsWith("/auth/reset-password");

    // const title = isSignup ? "Create your account" : "Welcome back";
    let title = "Welcome back";
    let subtitle = "Log in to see your cart, wishlist and orders.";
    if (isSignup) {
        title = "Create your account";
        subtitle = "Save your cart and wishlist, and track your orders.";
    } else if (isForgot) {
        title = "Reset your password";
        subtitle = "Enter your account email and we'll send you a link to set a new password.";
    } else if (isReset) {
        title = "Set a new password";
        subtitle = "Choose a new password for your account.";
    }

    return (
        <div className="auth-page">
            {/* Brand half: desktop only (hidden under 960px by CSS). */}
            <aside className="auth-brand">
                <Logo className="auth-logo--light" />

                <div className="auth-brand__body">
                    <p className="auth-brand__headline">Everyday shopping, made simple.</p>
                    <p className="auth-brand__lead">{SITE.tagline}</p>

                    <ul className="auth-trust">
                        {TRUST_POINTS.map(({ icon: Icon, title, text }) => (
                            <li key={title} className="auth-trust__item">
                                <span className="auth-trust__icon" aria-hidden="true"><Icon /></span>
                                <span>
                                    <strong>{title}</strong>
                                    <span className="auth-trust__text">{text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </aside>

            <main className="auth-main">
                <div className="auth-panel">
                    <div className="auth-topbar">
                        {/* Brand half is hidden on mobile, so show a small logo here instead. */}
                        <Logo className="auth-logo--compact" />
                        {/* Guests can browse now, so give them a way out of the auth page. */}
                        <Link to="/" className="auth-back">
                            <LuArrowLeft aria-hidden="true" /> Back to shop
                        </Link>
                    </div>

                    {/* <h1 className="auth-title">{isSignup ? "Create your account" : "Welcome back"}</h1> */}
                    <h1 className="auth-title">{title}</h1>
                    <p className="auth-subtitle">{subtitle}</p>

                    {/* Navbar only has "Join Us" -> /auth/login, so both options must be visible here. */}
                    {!isForgot && !isReset && (
                    <nav className="auth-tabs" aria-label="Log in or sign up">
                        {/* state: keeps the login "from" when switching tabs, so login still returns the user to their page. */}
                        <NavLink to="/auth/login" state={location.state} className={({ isActive }) => `auth-tab${isActive ? " active" : ""}`}>
                            Log in
                        </NavLink>
                        <NavLink to="/auth/signup" state={location.state} className={({ isActive }) => `auth-tab${isActive ? " active" : ""}`}>
                            Sign up
                        </NavLink>
                    </nav>
                    )}

                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AuthenticationPage;
