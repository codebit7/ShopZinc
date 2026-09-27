import React from 'react'
import { FaChevronRight } from "react-icons/fa";
import { Link } from "react-router-dom";

import './path.css'
// Callers pass the real trail; the default is the generic store path. The last item is the
// current page (not a link). Link, not <a>: a plain href reloaded the whole app.
const DEFAULT_ITEMS = [{ label: "Home", href: "/" }, { label: "Products" }];

const Path = ({ items = DEFAULT_ITEMS }) => {

    /* const items = [
        { label: "Home", href: "/" },
        { label: "Clothings", href: "/clothings" },
        { label: "Men's wear", href: "/mens-wear" },
        { label: "Summer clothing", href: "/summer-clothing" },
      ]; */
  return (
    <nav className="path container">
      <ol className="path-list">
        {items.map((item, index) => (
          <li key={index} className="path-item">
            {item.href && index < items.length - 1 ? (
              <Link to={item.href} className="path-link">{item.label}</Link>
            ) : (
              <span className="path-link" aria-current="page">{item.label}</span>
            )}
            {index < items.length - 1 && <FaChevronRight className="path-separator" />}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export default Path
