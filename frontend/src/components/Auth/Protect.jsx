import { useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

const Protect = ({ requiredRole }) => {
  // Reads redux, never localStorage. The old version trusted
  // localStorage.user.role, which any visitor could edit to reach /admin.
  const { user, bootstrapped } = useSelector((state) => state.auth);
  const location = useLocation();
  // Set once a user was seen here. If the user then disappears, it was a logout (or an expired
  // session), not a guest arriving: skip `from`, or the next account to log in lands on this page.
  const hadUser = useRef(false);
  if (user) hadUser.current = true;

  // Without this gate a page refresh flashes the login screen before
  // /users/me has answered.
  if (!bootstrapped) {
    return <div style={{ padding: "4rem", textAlign: "center" }}>Loading…</div>;
  }

  // `from` lets Login send the user back here instead of always to "/".
  // if (!user) return <Navigate to="/auth/login" replace />;
  if (!user) return <Navigate to="/auth/login" replace state={hadUser.current ? undefined : { from: location }} />;

  // Admins may use the storefront too; only block a plain user reaching admin.
  if (requiredRole === "admin" && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default Protect;
