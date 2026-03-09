'use client';

import { type ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface DashboardViewProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onSwitchToCanvas: () => void;
  controls: ReactNode;
  simStatus: 'stopped' | 'running' | 'paused';
  subtitleExtra?: ReactNode;
  children: ReactNode;
}

export function DashboardView({
  tabs, activeTab, onTabChange, onSwitchToCanvas,
  controls, simStatus, subtitleExtra, children,
}: DashboardViewProps) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 28px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 16,
      }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{
            fontSize: 20, fontWeight: 700,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Agent Town
          </h1>
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>Dashboard</p>
          {subtitleExtra}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Sim status */}
          <div className={`sim-status ${simStatus}`}>
            <span className="pulse-dot" />
            <span>{simStatus.charAt(0).toUpperCase() + simStatus.slice(1)}</span>
          </div>

          {/* Inline controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            {controls}
          </div>

          {/* Switch to canvas */}
          <button
            onClick={onSwitchToCanvas}
            title="Switch to Pixel Art view"
            className="btn-p"
            style={{ fontSize: 11, padding: '6px 14px', flexShrink: 0 }}
          >
            Pixel Art View
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        padding: '0 28px',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              background: 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
              padding: '10px 16px',
              fontSize: 12,
              borderRadius: 0,
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="badge-count">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0,
          overflowY: 'auto',
          padding: '20px 28px',
        }}>
          <div className="dashboard-mode" style={{ maxWidth: 960, margin: '0 auto' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
