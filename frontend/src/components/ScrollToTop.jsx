import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Without this, a new page opens at the old page's scroll position (e.g. halfway down the footer).
// Keyed on pathname only, so filter/query changes on /filter do not jump to the top.
// Skips POP (browser back/forward) so going back keeps the user's place.
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType !== "POP") window.scrollTo(0, 0);
    // navType is left out on purpose: it must not trigger a scroll by itself.
  }, [pathname]);

  return null;
};

export default ScrollToTop;
