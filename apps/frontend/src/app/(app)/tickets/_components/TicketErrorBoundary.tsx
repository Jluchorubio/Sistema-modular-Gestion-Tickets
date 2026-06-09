'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State { hasError: boolean; message: string }

export class TicketErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Error inesperado',
    };
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, gap: 16, padding: 40, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #fecaca',
        }}>
          <AlertTriangle size={24} style={{ color: '#ef4444' }} />
        </div>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#0e2235', margin: '0 0 6px' }}>
            Error al cargar el ticket
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, maxWidth: 320 }}>
            {this.state.message}
          </p>
        </div>
        <button
          type="button"
          onClick={this.handleRetry}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: '#0e2235', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    );
  }
}
