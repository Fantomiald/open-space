import { Component, type ReactNode } from 'react';
import { t } from '../i18n/index.ts';

/** A rendering error shows a way out instead of a blank page. The sessions keep running on the server. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const words = t.common.errorBoundary;
    return (
      <section className="cp-empty-state" role="alert">
        <h2>{words.title}</h2>
        <p>{words.body}</p>
        <p className="cp-muted">{this.state.error.message}</p>
        <button type="button" className="cp-button" data-variant="primary" onClick={() => location.reload()}>{words.reload}</button>
      </section>
    );
  }
}
