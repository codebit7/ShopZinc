import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiCheckCircle, FiLogOut, FiUser, FiLock } from "react-icons/fi";
import api from "../../api/client";
import { logout, updateMe } from "../../Store/slices/authSlice";
import "./../Styles/adminProfile.css";

// The admin's own profile, inside the admin panel. The store's /profile is built for shoppers
// (orders, addresses), so admins are redirected here from it (see Pages/ProfilePage.jsx).
// Layout chosen by the user: settings page with a tab menu on the left (Profile, Security) and the
// form on the right. Earlier cover-banner and plain-cards versions were rejected.

const TABS = [
  { id: "profile", label: "Profile", icon: FiUser },
  { id: "security", label: "Security", icon: FiLock },
];

const formatSince = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—";
};

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "A";

const ProfileTab = ({ user }) => {
  const dispatch = useDispatch();
  const [name, setName] = useState(user.name || "");
  const [status, setStatus] = useState({ saving: false, error: "", ok: false });

  // Keep the field in sync if the user object is refreshed (e.g. boot /users/me finishes late).
  useEffect(() => { setName(user.name || ""); }, [user.name]);

  // Hide "Saved" after a moment so it does not look stale on the next edit.
  useEffect(() => {
    if (!status.ok) return;
    const t = setTimeout(() => setStatus((s) => ({ ...s, ok: false })), 2500);
    return () => clearTimeout(t);
  }, [status.ok]);

  const trimmed = name.trim();
  const changed = trimmed !== (user.name || "");

  const save = async (e) => {
    e.preventDefault();
    if (!trimmed) {
      setStatus({ saving: false, error: "Name can't be empty.", ok: false });
      return;
    }
    setStatus({ saving: true, error: "", ok: false });
    const res = await dispatch(updateMe({ name: trimmed }));
    if (updateMe.fulfilled.match(res)) setStatus({ saving: false, error: "", ok: true });
    else setStatus({ saving: false, error: res.payload || "Could not save", ok: false });
  };

  return (
    <>
      <div className="ap-panel-head">
        <h3>Profile</h3>
        <p>Your name and account details.</p>
      </div>

      <div className="ap-identity">
        <span className="ap-avatar" aria-hidden="true">{initials(user.name)}</span>
        <div className="ap-identity-text">
          <strong>{user.name}</strong>
          <span>{user.role === "admin" ? "Administrator" : user.role} · Member since {formatSince(user.createdAt)}</span>
        </div>
      </div>

      <form className="ap-form" onSubmit={save}>
        <div className="ap-row">
          <label className="ap-row-label" htmlFor="ap-name">Full name</label>
          <input id="ap-name" type="text" className="adm-input" value={name} onInput={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="ap-row">
          <label className="ap-row-label" htmlFor="ap-email">Email</label>
          <div className="ap-row-field">
            {/* Read-only: the API only lets a user change their name. */}
            <input id="ap-email" type="email" className="adm-input" value={user.email || ""} readOnly disabled />
            <span className="ap-hint">
              {user.isVerified !== false ? <><FiCheckCircle aria-hidden="true" /> Verified · </> : null}
              Email can't be changed here.
            </span>
          </div>
        </div>

        {status.error && <div className="adm-error" role="alert">{status.error}</div>}

        <div className="ap-form-foot">
          {status.ok && <span className="ap-saved" role="status"><FiCheckCircle aria-hidden="true" /> Saved</span>}
          <button type="submit" className="adm-btn primary" disabled={status.saving || !changed}>
            {status.saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </>
  );
};

const SecurityTab = ({ user }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  // idle | sending | sent | error
  const [reset, setReset] = useState({ state: "idle", message: "" });

  // No "change password" API for a logged-in user, so reuse forgot-password: it emails a reset link
  // to this account. The server answers the same generic message either way (no enumeration).
  const sendResetLink = async () => {
    setReset({ state: "sending", message: "" });
    try {
      await api.post("/users/forgot-password", { email: user.email });
      setReset({ state: "sent", message: `Reset link sent to ${user.email}.` });
    } catch (err) {
      setReset({ state: "error", message: err.response?.data?.message || "Could not send the link. Try again." });
    }
  };

  const handleLogout = async () => {
    await dispatch(logout()); // thunk clears the session even if the server call fails
    navigate("/auth/login");
  };

  return (
    <>
      <div className="ap-panel-head">
        <h3>Security</h3>
        <p>Password and sign-in.</p>
      </div>

      <div className="ap-setting">
        <div className="ap-setting-text">
          <strong>Password</strong>
          <span>We'll email you a link to set a new password.</span>
          {reset.message && (
            <span className={`ap-setting-msg${reset.state === "error" ? " err" : ""}`} role="status">{reset.message}</span>
          )}
        </div>
        <button
          type="button"
          className="adm-btn secondary"
          onClick={sendResetLink}
          disabled={reset.state === "sending" || reset.state === "sent"}
        >
          {reset.state === "sending" ? "Sending..." : reset.state === "sent" ? "Link sent" : "Send reset link"}
        </button>
      </div>

      <div className="ap-setting">
        <div className="ap-setting-text">
          <strong>Log out</strong>
          <span>End your session on this device.</span>
        </div>
        <button type="button" className="adm-btn danger" onClick={handleLogout}>
          <FiLogOut aria-hidden="true" /> Log out
        </button>
      </div>
    </>
  );
};

const AdminProfile = () => {
  const user = useSelector((state) => state.auth.user);
  // Tab lives in ?tab= so a refresh or a shared link opens the same tab.
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "profile";

  if (!user) return <div className="adm-empty">Loading…</div>;

  return (
    <div className="ap">
      <div className="adm-page-head">
        <div>
          {/* Was "Settings"; admin panel settings have their own page now (/admin/settings). */}
          <h2>My profile</h2>
          <p>Manage your admin account.</p>
        </div>
      </div>

      <div className="adm-card ap-layout">
        <nav className="ap-tabs" aria-label="Profile sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`ap-tab${tab === id ? " active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setParams(id === "profile" ? {} : { tab: id }, { replace: true })}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <section className="ap-panel">
          {tab === "security" ? <SecurityTab user={user} /> : <ProfileTab user={user} />}
        </section>
      </div>
    </div>
  );
};

export default AdminProfile;
