import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiPause, FiPlay, FiArrowRight } from "react-icons/fi";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import "./heroCarousel.css";

// Why: the home hero used to be CategoryBanner (a static image + hardcoded copy). This one is built
// from what the admin marked for the home page plus the current best deal, so it is never stale.
const AUTOPLAY_MS = 6000;

const reducedMotionQuery = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

const HeroCarousel = () => {
  const [slides, setSlides] = useState(null); // null = loading, [] = nothing to show
  const [index, setIndex] = useState(0);
  // User-controlled play state (the APG pause/play button). Starts off for reduced-motion users.
  const [playing, setPlaying] = useState(() => !reducedMotionQuery()?.matches);
  const [reduced, setReduced] = useState(() => !!reducedMotionQuery()?.matches);
  // Temporary pauses: hover, keyboard focus inside, hidden tab. They do not flip the button.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tabHidden, setTabHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const trackRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    let alive = true;
    // allSettled: one failing call must not hide the slides the other one produced.
    Promise.allSettled([
      api.get("/category", { params: { home: 1 } }),
      api.get("/productDeals", { params: { minDiscount: 10, limit: 1 } }),
      // Slides the admin made in Admin → Carousel (+ whether to keep the automatic ones).
      api.get("/carousel"),
    ]).then(([cats, deals, carousel]) => {
      if (!alive) return;
      const catList = cats.status === "fulfilled" && Array.isArray(cats.value.data) ? cats.value.data : [];
      const deal = deals.status === "fulfilled" ? deals.value.data?.data?.[0] : null;
      const list = catList.map((c) => ({ kind: "category", key: `c-${c._id}`, item: c }));
      // Deal goes second so the first thing people see is still a category.
      if (deal) list.splice(Math.min(1, list.length), 0, { kind: "deal", key: `d-${deal._id}`, item: deal });
      // setSlides(list);
      const admin = carousel.status === "fulfilled" ? carousel.value.data : null;
      const custom = (admin?.slides || []).map((s) => ({ kind: "custom", key: `s-${s._id}`, item: s }));
      // Admin slides first. Automatic ones follow when the admin keeps them on — and always when there
      // are no admin slides, so the home page is never left without a hero.
      const showAuto = admin ? admin.showAuto !== false : true;
      setSlides(custom.length ? (showAuto ? [...custom, ...list] : custom) : list);
    });
    return () => { alive = false; };
  }, []);

  // Keep in step with the OS setting if it changes while the page is open.
  useEffect(() => {
    const mq = reducedMotionQuery();
    if (!mq) return undefined;
    const onChange = (e) => {
      setReduced(e.matches);
      if (e.matches) setPlaying(false);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const count = slides ? slides.length : 0;

  const goTo = useCallback((i) => {
    const track = trackRef.current;
    if (!track || !count) return;
    const next = ((i % count) + count) % count; // wraps both ways: last -> first, first -> last
    track.scrollTo({ left: next * track.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setIndex(next);
  }, [count, reduced]);

  // One timer. Re-armed on every slide change, so a manual move also restarts the 6s wait.
  const rotating = playing && !hovered && !focused && !tabHidden && count > 1;
  useEffect(() => {
    if (!rotating) return undefined;
    const t = setTimeout(() => goTo(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [rotating, index, goTo]);

  // Swipe/trackpad scroll moves the track natively; read the snapped slide back once per frame.
  const onScroll = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track || !track.clientWidth) return;
      const i = Math.round(track.scrollLeft / track.clientWidth);
      setIndex((prev) => (prev === i ? prev : Math.max(0, Math.min(count - 1, i))));
    });
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
  };

  // focusout fires when moving between two buttons inside too; only clear when focus really leaves.
  const onFocusOut = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };

  if (slides === null) {
    return (
      <div className="container hc-wrap">
        <div className="hc-skeleton" aria-hidden="true" />
      </div>
    );
  }
  // Both calls empty: show nothing rather than an empty box on the home page.
  if (!count) return null;

  return (
    <div className="container hc-wrap">
      <section
        className="hc"
        aria-roledescription="carousel"
        aria-label="Featured"
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusIn={() => setFocused(true)}
        onFocusOut={onFocusOut}
      >
        {/* APG: the rotation control is first in the tab order inside the carousel. */}
        {count > 1 && (
          <div className="hc-controls">
            <button
              type="button"
              className="hc-btn hc-toggle"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Stop automatic slide show" : "Start automatic slide show"}
            >
              {playing ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}
            </button>
            <div className="hc-dots" role="group" aria-label="Choose slide">
              {slides.map((s, i) => (
                <button
                  type="button"
                  key={s.key}
                  className={`hc-dot${i === index ? " active" : ""}`}
                  aria-label={`Slide ${i + 1} of ${count}`}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
          </div>
        )}
        {count > 1 && (
          <>
            <button type="button" className="hc-btn hc-arrow hc-prev" aria-label="Previous slide" onClick={() => goTo(index - 1)}>
              <FiChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="hc-btn hc-arrow hc-next" aria-label="Next slide" onClick={() => goTo(index + 1)}>
              <FiChevronRight aria-hidden="true" />
            </button>
          </>
        )}

        {/* APG: "off" while it rotates on its own, so screen readers are not interrupted every 6s. */}
        <div className="hc-track" ref={trackRef} onScroll={onScroll} aria-live={rotating ? "off" : "polite"} aria-atomic="false">
          {slides.map((s, i) => {
            const hidden = i !== index;
            return (
              <div
                key={s.key}
                className={`hc-slide hc-slide--${s.kind}${s.kind === "category" && !s.item.coverImage?.url ? " hc-slide--plain" : ""}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                // Off-screen slides must not take Tab focus or be read out of order.
                inert={hidden ? true : undefined}
                aria-hidden={hidden ? "true" : undefined}
              >
                {s.kind === "custom"
                  ? <CustomSlide slide={s.item} first={i === 0} hidden={hidden} />
                  : s.kind === "category"
                  ? <CategorySlide cat={s.item} first={i === 0} hidden={hidden} />
                  : <DealSlide product={s.item} first={i === 0} hidden={hidden} />}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

// Admin-made slide: full image, text on the left, optional button. Exported for the admin preview.
export const CustomSlide = ({ slide, first, hidden }) => {
  const external = /^https?:\/\//i.test(slide.href || "");
  const cta = slide.href && (
    external ? (
      <a className="hc-cta" href={slide.href} target="_blank" rel="noopener noreferrer" tabIndex={hidden ? -1 : undefined}>
        {slide.buttonText || "Shop now"} <FiArrowRight aria-hidden="true" />
      </a>
    ) : (
      <Link className="hc-cta" to={slide.href} tabIndex={hidden ? -1 : undefined}>
        {slide.buttonText || "Shop now"} <FiArrowRight aria-hidden="true" />
      </Link>
    )
  );
  return (
    <>
      {slide.image?.url && (
        <img
          className="hc-cover"
          src={slide.image.url}
          alt=""
          loading={first ? "eager" : "lazy"}
          fetchpriority={first ? "high" : undefined}
        />
      )}
      <div className="hc-copy">
        {slide.eyebrow && <p className="hc-eyebrow">{slide.eyebrow}</p>}
        <h2 className="hc-title">{slide.title}</h2>
        {slide.subtitle && <p className="hc-desc">{slide.subtitle}</p>}
        {cta}
      </div>
    </>
  );
};

const CategorySlide = ({ cat, first, hidden }) => {
  const cover = cat.coverImage?.url;
  return (
    <>
      {cover && (
        <img
          className="hc-cover"
          src={cover}
          alt={`${cat.name} category`}
          loading={first ? "eager" : "lazy"}
          fetchpriority={first ? "high" : undefined}
        />
      )}
      <div className="hc-copy">
        <p className="hc-eyebrow">Shop by category</p>
        <h2 className="hc-title">{cat.name}</h2>
        {cat.description && <p className="hc-desc">{cat.description}</p>}
        <Link className="hc-cta" to={`/filter?category=${cat._id}`} tabIndex={hidden ? -1 : undefined}>
          Shop now <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
    </>
  );
};

const DealSlide = ({ product, first, hidden }) => {
  const discount = Number(product.discount) || 0;
  const price = Number(product.price) || 0;
  // discount is a percent (see productDeals / minDiscount).
  const now = price * (1 - discount / 100);
  const img = product.images?.[0]?.url;
  return (
    <>
      <div className="hc-copy">
        <p className="hc-eyebrow">Deal of the day</p>
        <h2 className="hc-title">{product.name}</h2>
        <p className="hc-price">
          <span className="hc-now">{formatPrice(now)}</span>
          {discount > 0 && <s className="hc-was"><span className="hc-sr">Was </span>{formatPrice(price)}</s>}
        </p>
        <Link className="hc-cta" to={`/product/${product._id}`} tabIndex={hidden ? -1 : undefined}>
          View deal <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
      <div className="hc-media">
        {discount > 0 && <span className="hc-badge">-{Math.round(discount)}%</span>} {/* rounded: Rs discounts save as e.g. 33.33% */}
        {img && (
          <img
            src={img}
            alt={product.name}
            loading={first ? "eager" : "lazy"}
            fetchpriority={first ? "high" : undefined}
          />
        )}
      </div>
    </>
  );
};

export default HeroCarousel;
