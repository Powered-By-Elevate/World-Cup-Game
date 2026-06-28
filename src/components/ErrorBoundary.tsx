import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/* App-wide safety net. A render exception anywhere below this boundary would
   otherwise white-screen the WHOLE app for that user — and recur on every
   refresh, since their data reproduces it (e.g. a half-resolved knockout
   fixture). Instead we catch it, keep the app usable, and offer a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(err: Error) { return { err }; }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // Surface in the console for debugging; never blocks the user.
    console.error('App render error:', err, info?.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', background: 'var(--paper, #F4EEE1)', color: 'var(--ink, #15120C)' }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 28, lineHeight: 1.05 }}>Something hiccuped</div>
          <p style={{ fontSize: 14, marginTop: 10, opacity: 0.8 }}>
            The app hit a snag rendering this screen. Your data is safe — a reload usually clears it.
          </p>
          <button
            onClick={() => { this.setState({ err: null }); location.reload(); }}
            style={{ marginTop: 16, padding: '11px 20px', borderRadius: 12, border: '2px solid var(--ink, #15120C)', background: 'var(--lime, #C8F23C)', fontWeight: 800, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
