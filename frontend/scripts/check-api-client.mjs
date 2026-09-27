// Offline behavioural check for src/api/client.js.
//
// A static grep (the old Step 3) stays green even if the single-flight
// mechanism or the .finally() reset is deleted — it only checks for
// substrings, not behaviour. This swaps the real axios instance's adapter
// for a fake one and asserts the interceptor's actual logic end to end,
// with no server and no network call.
import assert from "node:assert/strict";
import api, { setAuthFailureHandler } from "../src/api/client.js";

let refreshCalls = 0;
let refreshShouldFail = false;
let authFailureCalls = 0;

setAuthFailureHandler(() => {
  authFailureCalls += 1;
});

function ok(config, data = {}) {
  return { data, status: 200, statusText: "OK", headers: {}, config };
}

function fail(config, status, data = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.config = config;
  err.response = { data, status, statusText: "", headers: {}, config };
  return err;
}

function networkError(config) {
  const err = new Error("Network Error");
  err.isAxiosError = true;
  err.config = config;
  // Deliberately no .response — this is what a dropped connection looks like.
  return err;
}

// Fake routes, keyed by URL:
//  /users/refresh  -> counted; fails only while refreshShouldFail is true
//  /users/login    -> always 401, must never trigger a refresh
//  /protected      -> 401 on first try, 200 once retried (single-flight + recovery)
//  /protected2     -> 401 always, even after retry (session truly dead post-refresh)
//  /server-error   -> 500, must pass through untouched
//  /network-fail   -> rejects with no .response at all
api.defaults.adapter = async (config) => {
  const { url } = config;

  if (url === "/users/refresh") {
    refreshCalls += 1;
    if (refreshShouldFail) throw fail(config, 401);
    return ok(config);
  }
  if (url === "/users/login") {
    throw fail(config, 401);
  }
  if (url === "/protected") {
    if (config._retried) return ok(config);
    throw fail(config, 401);
  }
  if (url === "/protected2") {
    throw fail(config, 401);
  }
  if (url === "/server-error") {
    throw fail(config, 500);
  }
  if (url === "/network-fail") {
    throw networkError(config);
  }
  throw new Error(`unexpected url in fake adapter: ${url}`);
};

// ---- 1. Shape ----
assert.equal(typeof api.get, "function", "default export must be the axios instance");
assert.equal(api.defaults.baseURL, "/api/v1", "baseURL must be /api/v1");
assert.equal(api.defaults.withCredentials, true, "withCredentials must be true");
assert.equal(typeof setAuthFailureHandler, "function", "setAuthFailureHandler must be exported");
console.log("PASS shape: default export is the instance, baseURL, withCredentials, setAuthFailureHandler");

// ---- 2. Single-flight refresh ----
{
  refreshCalls = 0;
  const results = await Promise.all(Array.from({ length: 5 }, () => api.get("/protected")));
  assert.equal(refreshCalls, 1, `expected exactly 1 refresh call for 5 concurrent 401s, got ${refreshCalls}`);
  assert.equal(results.length, 5);
  for (const r of results) assert.equal(r.status, 200);
  console.log("PASS single-flight: 5 concurrent 401s share exactly 1 refresh call, all 5 retried to 200");
}

// ---- 3. Refreshing promise is cleared after it settles ----
{
  const before = refreshCalls;
  const r = await api.get("/protected");
  assert.equal(r.status, 200);
  assert.equal(refreshCalls, before + 1, "a later 401 must trigger a fresh refresh, not reuse a stale promise");
  console.log("PASS promise-cleared: a later 401 triggers a new refresh call (count now 2)");
}

// ---- 4. No infinite loop when the refresh call itself 401s ----
{
  refreshShouldFail = true;
  const beforeRefresh = refreshCalls;
  await assert.rejects(
    () => api.get("/protected"),
    (err) => {
      assert.equal(err.response?.status, 401, "the original error must surface, not a wrapped one");
      return true;
    }
  );
  assert.equal(refreshCalls, beforeRefresh + 1, "refresh must be attempted exactly once, never recursively");
  refreshShouldFail = false;
  console.log("PASS no-loop: a 401 from /users/refresh surfaces the original error with no recursion");
}

// ---- 5. A 401 from /users/login must never trigger a refresh ----
{
  const before = refreshCalls;
  await assert.rejects(
    () => api.post("/users/login", { email: "a@b.com", password: "x" }),
    (err) => {
      assert.equal(err.response?.status, 401);
      return true;
    }
  );
  assert.equal(refreshCalls, before, "a login 401 must not call refresh");
  console.log("PASS login-401: no refresh attempted for a failed login");
}

// ---- 6. skipAuthRedirect opts out of the handler; its absence does not ----
{
  refreshShouldFail = true;

  authFailureCalls = 0;
  await assert.rejects(() => api.get("/protected", { skipAuthRedirect: true }));
  assert.equal(authFailureCalls, 0, "handler must NOT fire when skipAuthRedirect is set");

  authFailureCalls = 0;
  await assert.rejects(() => api.get("/protected"));
  assert.equal(authFailureCalls, 1, "handler must fire when skipAuthRedirect is absent");

  refreshShouldFail = false;
  console.log("PASS skipAuthRedirect: suppresses the handler only when explicitly set");
}

// ---- 6b. One failed shared refresh calls the handler ONCE, not once per waiting request ----
{
  refreshShouldFail = true;
  authFailureCalls = 0;
  const before = refreshCalls;
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => api.get("/protected")));
  for (const r of results) assert.equal(r.status, "rejected", "all 3 requests must fail when refresh fails");
  assert.equal(refreshCalls, before + 1, "3 concurrent 401s must share one refresh call");
  assert.equal(authFailureCalls, 1, `expected onAuthFailure exactly once for one failed refresh, got ${authFailureCalls}`);
  refreshShouldFail = false;
  console.log("PASS auth-failure-once: 3 concurrent 401s + failed refresh call the handler exactly once");
}

// ---- Finding 2 regression: a 401 surviving a SUCCESSFUL refresh must still call the handler ----
{
  authFailureCalls = 0;
  await assert.rejects(() => api.get("/protected2"));
  assert.equal(
    authFailureCalls,
    1,
    "a 401 on the retried request (after a successful refresh) must call the handler exactly once"
  );
  console.log("PASS post-refresh-401: handler fires exactly once when the session is still dead after refresh");
}

// ---- 7. Pass-through: non-401 and network errors are untouched, no refresh triggered ----
{
  const before = refreshCalls;
  await assert.rejects(
    () => api.get("/server-error"),
    (err) => {
      assert.equal(err.response?.status, 500);
      return true;
    }
  );
  await assert.rejects(
    () => api.get("/network-fail"),
    (err) => {
      assert.equal(err.response, undefined, "a network failure must have no .response");
      return true;
    }
  );
  assert.equal(refreshCalls, before, "a 500 or a network error must never trigger a refresh");
  console.log("PASS pass-through: 500 and network errors rethrown untouched, no refresh attempted");
}

console.log("OK api client interceptor");
