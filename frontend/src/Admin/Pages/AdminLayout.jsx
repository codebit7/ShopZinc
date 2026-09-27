import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
import Sidebar from "../Components/Sidebar";
import Navbar from "../Components/Navbar";
import './../Styles/adminlayout.css'

// localStorage can throw (private mode, blocked storage); the panel must still work without it.
const load = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not saved, still works */ } };
const DESKTOP = "(min-width: 1024px)";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const AdminLayout = () => {
  // One flag for both small layouts: tablet = rail expanded, phone = drawer open. Desktop ignores it (CSS).
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // First visit follows the OS setting; after that the admin's own choice wins.
  // const [dark, setDark] = useState(() => (load("admin-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark");
  // Theme is now a mode: "light" | "dark" | "system" (Settings page). "system" follows the OS live.
  // Old saved values ("light"/"dark") still work; no saved value = "system", same as before.
  const [themeMode, setThemeMode] = useState(() => {
    const saved = load("admin-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [osDark, setOsDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  const dark = themeMode === "system" ? osDark : themeMode === "dark";
  // Desktop-only collapse to the icon rail; small screens keep using menuOpen.
  const [collapsed, setCollapsed] = useState(() => load("admin-sidebar") === "collapsed");
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP).matches);

  // useEffect(() => save("admin-theme", dark ? "dark" : "light"), [dark]);
  useEffect(() => save("admin-theme", themeMode), [themeMode]);
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setOsDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => save("admin-sidebar", collapsed ? "collapsed" : "open"), [collapsed]);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Close the drawer after navigating, otherwise it stays over the new page on phones.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    // data-bs-theme: switches bootstrap's own components to dark inside the admin only.
    <div
      className={`admin-layout${menuOpen ? " menu-open" : ""}${collapsed ? " sidebar-collapsed" : ""}${dark ? " theme-dark" : ""}`}
      data-bs-theme={dark ? "dark" : "light"}
    >
      <Sidebar
        open={menuOpen}
        expanded={isDesktop ? !collapsed : menuOpen}
        onToggle={() => (isDesktop ? setCollapsed(!collapsed) : setMenuOpen(!menuOpen))}
      />
      {/* Click-outside target for the drawer / expanded rail; hidden on desktop. */}
      <div className="adm-overlay" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      <div className="adm-main">
        {/* <Navbar onMenu={() => setMenuOpen(true)} dark={dark} onToggleTheme={() => setDark(!dark)} /> */}
        {/* The quick toggle picks the opposite of what is showing, leaving "system" mode. */}
        <Navbar onMenu={() => setMenuOpen(true)} dark={dark} onToggleTheme={() => setThemeMode(dark ? "light" : "dark")} />
        <main className="adm-page">
          {/* Settings page reads and changes these; every other page ignores the context. */}
          <Outlet context={{ themeMode, setThemeMode, collapsed, setCollapsed }} />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
