import { Component } from 'react';

// The last line of defence. Validation should mean the study components never
// receive data they cannot render - but if a bug slips through, the user gets
// a message and a way out instead of a blank page.
//
// This is the one class component in the app: React only supports error
// boundaries as classes (there is no hook equivalent).
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
        <h2>This study set could not be displayed</h2>
        <p>Something in it broke the page. Your other saved sets are fine.</p>
        <button type="button" className="btn btn--primary" onClick={this.props.onReset}>
          Start again
        </button>
      </section>
    );
  }
}
