'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error:    Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Production: replace with Sentry.captureException(error, { extra: info })
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '40vh', padding: 32, textAlign: 'center',
      }}>
        <AlertTriangle size={48} color="#f59e0b" strokeWidth={1.5} style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Algo salió mal
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 0 24px', lineHeight: 1.6 }}>
          {this.state.error?.message ?? 'Error inesperado. Recarga la página o intenta de nuevo.'}
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', background: '#0e2235', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} />
          Intentar de nuevo
        </button>
      </div>
    );
  }
}
