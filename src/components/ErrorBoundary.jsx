import { Component } from 'react';

// If a rendering bug slips past validation, the user gets a message and a way
// out instead of a blank page. A class because React has no hook for this.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="panel status status--error" role="alert">
        <h2 className="status__title">This study set could not be displayed</h2>
        <p className="status__text">Something in it broke the page. Your other saved sets are fine.</p>
        <button type="button" className="btn btn--primary" onClick={this.props.onReset}>
          Start again
        </button>
      </section>
    );
  }
}
