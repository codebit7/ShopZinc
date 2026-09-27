import React, { useState, useEffect } from "react";
import "./pagination.css";

// Page numbers to show: first, last, and one on each side of the current page, "…" for the gaps.
// e.g. page 6 of 20 → 1 … 5 6 7 … 20. Up to 7 pages are all shown.
export const pageItems = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  // Near an edge, show 5 in a row so the row does not shrink (1 2 3 4 5 … 20).
  if (current <= 3) [2, 3, 4, 5].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 4, total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
};

// Two modes:
// - Controlled (FilterPage): pass `page`, `limit`, `onChange({ page, limit })`. The parent owns the
//   page, so a filter change can set page 1 in the same update. The old way (remount via `key`, then
//   report page 1 from an effect) fired a second fetch, and a late page-2 reply could show an empty page.
// - Uncontrolled (admin ViewProducts): internal state reported through `setSetting`, as before.
//   initialLimit keeps a chosen "Show 20/50" when the parent remounts it.
const Pagination = ({ totalPages = 3, setSetting, initialLimit = 10, page, limit, onChange }) => {
  const controlled = typeof onChange === "function";
  const [innerPage, setInnerPage] = useState(1);
  const [innerLimit, setInnerLimit] = useState(initialLimit);
  const currentPage = controlled ? page : innerPage;
  const itemsPerPage = controlled ? limit : innerLimit;

  // useEffect(() => {
  //   setSetting({ limit: itemsPerPage, page: currentPage });
  // }, [itemsPerPage, currentPage, setSetting]);
  // Functional update returns the old object when nothing changed: a new {page:1,limit:10} on mount
  // made the admin list fetch the same page twice.
  useEffect(() => {
    if (controlled || !setSetting) return;
    setSetting((prev) =>
      prev && prev.page === innerPage && prev.limit === innerLimit ? prev : { ...prev, limit: innerLimit, page: innerPage }
    );
  }, [innerLimit, innerPage, setSetting, controlled]);

  const changePage = (next) => {
    if (next >= 1 && next <= totalPages && next !== currentPage) {
      if (controlled) onChange({ page: next, limit: itemsPerPage });
      else setInnerPage(next);
    }
  };

  const changeLimit = (nextLimit) => {
    // A new page size starts again at page 1; page 3 of 50-per-page may not exist.
    if (controlled) onChange({ page: 1, limit: nextLimit });
    else { setInnerLimit(nextLimit); setInnerPage(1); }
  };

  return (
    <div className="pagination-container">

      <div className="items-per-page">
        Show{" "}
        <select
          value={itemsPerPage}
          onChange={(e) => changeLimit(Number(e.target.value))}
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
      </div>


      <div className="pagination-buttons">
        <button
          className="pagination-btn"
          onClick={() => changePage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &lt;
        </button>

        {/* {[...Array(totalPages)].map((_, index) => (
          <button
            key={index + 1}
            className={`pagination-btn ${currentPage === index + 1 ? "active" : ""}`}
            onClick={() => changePage(index + 1)}
          >
            {index + 1}
          </button>
        ))} */}
        {/* Why: one button per page overflowed the row once there were many pages (BUG-79). */}
        {pageItems(currentPage, totalPages).map((item, i) =>
          item === "…" ? (
            <span key={`gap-${i}`} className="pagination-ellipsis" aria-hidden="true">…</span>
          ) : (
            <button
              key={item}
              className={`pagination-btn ${currentPage === item ? "active" : ""}`}
              onClick={() => changePage(item)}
            >
              {item}
            </button>
          )
        )}

        <button
          className="pagination-btn"
          onClick={() => changePage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          &gt;
        </button>
      </div>
    </div>
  );
};

export default Pagination;
