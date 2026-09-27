import React, { useEffect, useState } from "react";
// Buttons are the shared .adm-btn now, and table styles come from adminlayout.css.
// import { Button } from "react-bootstrap";
// import "./../Styles/viewProducts.css";
import { FaEdit, FaTrash, FaPlus, FaCheck, FaTimes } from "react-icons/fa";
import "./../Styles/categories.css";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../../Store/slices/productSlice";
import api from "../../api/client";

// Admin category CRUD. The API existed but had no UI; calls go straight to `api` and the
// redux list is refreshed with fetchCategories so the product form's dropdown stays in sync.
const Categories = () => {
  const dispatch = useDispatch();
  const { categories, loading } = useSelector((state) => state.products);
  const [form, setForm] = useState({ name: "", description: "" });
  const [edit, setEdit] = useState(null); // { id, name, description } while a row is being edited
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Product count per category id. Read-only extra: if it fails the column just shows "—".
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  // useEffect(() => {
  //   // ponytail: one big page fetch, fine for a small catalog; add a count endpoint if it grows past 1000.
  //   api.get("/products?page=1&limit=1000")
  //     .then((res) => {
  //       const c = {};
  //       for (const p of res.data.data || []) {
  //         const cid = p.category?._id ?? p.category;
  //         if (cid) c[cid] = (c[cid] || 0) + 1;
  //       }
  //       setCounts(c);
  //     })
  //     .catch(() => setCounts(null));
  // }, []);
  // /products/facets counts the whole catalog on the server; counting a limit=1000 page undercounted past 1000.
  useEffect(() => {
    api.get("/products/facets")
      .then((res) => setCounts(Object.fromEntries((res.data?.categories || []).map((c) => [c._id, c.count]))))
      .catch(() => setCounts(null));
  }, []);

  // One wrapper so every action shows the server's own message (e.g. the 409 "still used by products").
  const run = async (request) => {
    setError("");
    setBusy(true);
    try {
      await request();
      dispatch(fetchCategories());
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (await run(() => api.post("/category", form))) setForm({ name: "", description: "" });
  };

  const handleSave = async () => {
    const { id, name, description } = edit;
    if (await run(() => api.put(`/category/${id}`, { name, description }))) setEdit(null);
  };

  const handleDelete = (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    run(() => api.delete(`/category/${cat._id}`));
  };

  const list = Array.isArray(categories) ? categories : [];

  return (
    <div className="cat">
      <div className="adm-page-head">
        <div>
          <h2>Categories</h2>
          <p>{list.length} categories. A category still used by products cannot be deleted.</p>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-header"><h4>Add a category</h4></div>
        <form className="adm-toolbar cat-form" onSubmit={handleAdd}>
          <input
            className="adm-input"
            placeholder="Name"
            aria-label="Category name"
            value={form.name}
            onInput={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="adm-input"
            placeholder="Description"
            aria-label="Category description"
            value={form.description}
            onInput={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" className="adm-btn primary" disabled={busy}>
            <FaPlus aria-hidden="true" /> Add Category
          </button>
        </form>
      </div>

      {error && (
        <div className="adm-error cat-error" role="alert">
          <span>{error}</span>
          <button type="button" className="adm-btn ghost sm icon" aria-label="Dismiss" onClick={() => setError("")}>
            <FaTimes />
          </button>
        </div>
      )}

      <div className="adm-card">
        <div className="adm-card-header"><h4>All categories</h4></div>
        <div className="adm-table-wrap">
          <table className="adm-table cat-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th className="num">Products</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && list.length === 0 ? (
                <tr><td colSpan={4}><div className="adm-empty">Loading...</div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={4}><div className="adm-empty">No categories yet. Add the first one above.</div></td></tr>
              ) : (
                list.map((cat) =>
                  edit?.id === cat._id ? (
                    <tr key={cat._id}>
                      <td>
                        <input
                          className="adm-input"
                          aria-label="Name"
                          value={edit.name}
                          onInput={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="adm-input"
                          aria-label="Description"
                          value={edit.description}
                          onInput={(e) => setEdit({ ...edit, description: e.target.value })}
                        />
                      </td>
                      <td className="num">{counts ? counts[cat._id] || 0 : "—"}</td>
                      <td className="actions">
                        <button type="button" className="adm-btn primary sm icon" aria-label="Save" disabled={busy} onClick={handleSave}>
                          <FaCheck />
                        </button>
                        <button type="button" className="adm-btn ghost sm icon" aria-label="Cancel" onClick={() => setEdit(null)}>
                          <FaTimes />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={cat._id}>
                      <td className="cat-name">{cat.name}</td>
                      <td className="adm-muted cat-desc">{cat.description || "—"}</td>
                      <td className="num">{counts ? counts[cat._id] || 0 : "—"}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="adm-btn ghost sm icon"
                          aria-label="Edit"
                          onClick={() => setEdit({ id: cat._id, name: cat.name, description: cat.description || "" })}
                        >
                          <FaEdit />
                        </button>
                        <button type="button" className="adm-btn danger sm icon" aria-label="Delete" disabled={busy} onClick={() => handleDelete(cat)}>
                          <FaTrash />
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Categories;
