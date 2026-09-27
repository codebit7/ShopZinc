import React from "react";
import { useOutletContext } from "react-router-dom";
import { FiSun, FiMoon, FiMonitor, FiSidebar, FiMinimize2, FiCheck } from "react-icons/fi";
import "./../Styles/adminSettings.css";

// Admin panel settings (the gear in the top bar). Only "Appearance" for now, as asked.
// State lives in AdminLayout (it paints the theme class on the layout root) and is shared through
// the Outlet context; AdminLayout also saves it in this browser (localStorage).

const THEMES = [
  { id: "light", label: "Light", icon: FiSun },
  { id: "dark", label: "Dark", icon: FiMoon },
  { id: "system", label: "System", icon: FiMonitor, note: "Follows your device" },
];

const SIDEBAR = [
  { id: false, label: "Expanded", icon: FiSidebar, note: "Icons and names" },
  { id: true, label: "Collapsed", icon: FiMinimize2, note: "Icons only" },
];

// Small picture of the panel in each theme, so the choice is visual, not just a word.
const ThemePreview = ({ mode }) => (
  <span className={`as-preview as-preview--${mode}`} aria-hidden="true">
    {mode === "system" ? (
      <>
        <span className="as-preview-half as-preview--light"><span className="as-p-side" /><span className="as-p-body"><span className="as-p-line" /><span className="as-p-line short" /></span></span>
        <span className="as-preview-half as-preview--dark"><span className="as-p-side" /><span className="as-p-body"><span className="as-p-line" /><span className="as-p-line short" /></span></span>
      </>
    ) : (
      <>
        <span className="as-p-side" />
        <span className="as-p-body"><span className="as-p-line" /><span className="as-p-line short" /></span>
      </>
    )}
  </span>
);

const AdminSettings = () => {
  const { themeMode, setThemeMode, collapsed, setCollapsed } = useOutletContext() || {};

  return (
    <div className="as">
      <div className="adm-page-head">
        <div>
          <h2>Settings</h2>
          <p>Choose how the admin panel looks. Changes apply right away and are saved in this browser.</p>
        </div>
      </div>

      <section className="adm-card">
        <div className="adm-card-header"><h4>Appearance</h4></div>

        <div className="as-group">
          <div className="as-group-text">
            <strong id="as-theme-label">Theme</strong>
            <span>Light, dark, or match your device.</span>
          </div>
          <div className="as-options as-options--theme" role="radiogroup" aria-labelledby="as-theme-label">
            {THEMES.map(({ id, label, icon: Icon, note }) => {
              const on = themeMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`as-option${on ? " on" : ""}`}
                  onClick={() => setThemeMode(id)}
                >
                  <ThemePreview mode={id} />
                  <span className="as-option-label">
                    <Icon aria-hidden="true" /> {label}
                    {on && <FiCheck className="as-check" aria-hidden="true" />}
                  </span>
                  {note && <span className="as-option-note">{note}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="as-group">
          <div className="as-group-text">
            <strong id="as-sidebar-label">Sidebar</strong>
            <span>How the menu shows on a computer screen. Phones always use the slide-out menu.</span>
          </div>
          <div className="as-options as-options--sidebar" role="radiogroup" aria-labelledby="as-sidebar-label">
            {SIDEBAR.map(({ id, label, icon: Icon, note }) => {
              const on = Boolean(collapsed) === id;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`as-option as-option--row${on ? " on" : ""}`}
                  onClick={() => setCollapsed(id)}
                >
                  <span className="as-option-icon" aria-hidden="true"><Icon /></span>
                  <span className="as-option-text">
                    <span className="as-option-label">{label}</span>
                    <span className="as-option-note">{note}</span>
                  </span>
                  {on && <FiCheck className="as-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminSettings;
