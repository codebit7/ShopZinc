// Product ids this visitor opened, newest first. Kept in this browser only (not on the server):
// it is a convenience, and guests have no account to save it to.
// Every access is wrapped: storage can be blocked (private mode, site data off) and must never break a page.
const KEY = "sz-recently-viewed";
const MAX = 12;

export const readRecent = () => {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export const addRecent = (id) => {
  if (!id) return;
  try {
    const ids = [id, ...readRecent().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch { /* not saved, page still works */ }
};

export const clearRecent = () => {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
};
