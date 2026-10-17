import { Component, type ReactNode } from 'react';

/** A rendering error shows a way out instead of a blank page. The sessions keep running on the server. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="cp-empty-state" role="alert">
        <h2>L’affichage a planté</h2>
        <p>Les sessions continuent sur le serveur. Recharge la page pour les retrouver.</p>
        <p className="cp-muted">{this.state.error.message}</p>
        <button type="button" className="cp-button" data-variant="primary" onClick={() => location.reload()}>Recharger</button>
      </section>
    );
  }
}
