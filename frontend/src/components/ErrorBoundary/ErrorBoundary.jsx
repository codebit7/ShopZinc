import { Component } from "preact";
import { useLocation } from "react-router-dom";
import "./errorBoundary.css";

// Without a boundary, one render crash anywhere unmounts the whole app and leaves a blank page.
class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App crashed while rendering:", error, info);
  }

  // Clear the error when the route changes, so the user can navigate away from a broken page.
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sz-error" role="alert">
        <h1 className="sz-error__title">Something went wrong</h1>
        <p className="sz-error__text">Please reload the page. If it keeps happening, go back to the home page.</p>
        <div className="sz-error__actions">
          <button type="button" className="sz-error__btn sz-error__btn--primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
          {/* Plain <a>, not <Link>: a full page load still works even if the router state is broken. */}
          <a className="sz-error__btn" href="/">Go to home</a>
        </div>
      </div>
    );
  }
}

// Must render inside <BrowserRouter>: it reads the current path to reset the boundary.
const ErrorBoundary = ({ children }) => {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
};

export default ErrorBoundary;
