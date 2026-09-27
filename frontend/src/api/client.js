import axios from "axios";

// Relative baseURL: the Vite dev proxy forwards /api to the backend, so the
// browser stays on one origin and the auth cookies are sent automatically.
const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

// Single-flight refresh: five requests failing at once share ONE refresh call
// instead of firing five and rotating the token out from under each other.
let refreshing = null;

let onAuthFailure = () => {};
// Set once from app.jsx. Keeping it injectable avoids a circular import
// between this file and the redux store.
export const setAuthFailureHandler = (fn) => {
  onAuthFailure = fn;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response || response.status !== 401 || !config) {
      throw error;
    }
    if (config._retried) {
      // A 401 that survives a successful refresh means the session is genuinely
      // gone. Without this the UI keeps believing the user is signed in while
      // every request fails silently.
      if (!config.skipAuthRedirect) onAuthFailure();
      throw error;
    }
    // Never try to refresh the refresh call or the login call themselves.
    if (config.url?.includes("/users/refresh") || config.url?.includes("/users/login")) {
      throw error;
    }

    config._retried = true;
    // Keep our own handle: `refreshing` is reset to null in .finally(), before the waiters' catch runs.
    let current;
    try {
      refreshing =
        refreshing ||
        api.post("/users/refresh").finally(() => {
          refreshing = null;
        });
      current = refreshing;
      await current;
      return api(config);
    } catch {
      // skipAuthRedirect lets the boot /users/me call fail quietly. Without it
      // the interceptor and <Protect/> both try to navigate and fight.
      // if (!config.skipAuthRedirect) onAuthFailure();
      // Once per failed refresh: every request waiting on it lands here, and without the flag
      // N waiters meant N logout dispatches and N POST /users/logout.
      if (!config.skipAuthRedirect && !current.authFailureReported) {
        current.authFailureReported = true;
        onAuthFailure();
      }
      throw error;
    }
  }
);

export default api;
