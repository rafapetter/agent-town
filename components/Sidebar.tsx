'use client';

import { useState, type ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface SidebarProps {
  title: string;
  subtitle: string;
  headerExtra?: ReactNode;
  subtitleExtra?: ReactNode;
  controls?: ReactNode;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  title, subtitle, headerExtra, subtitleExtra, controls, tabs, activeTab, onTabChange, children,
  collapsed = false, onToggleCollapse,
}: SidebarProps) {
  return (
    <div style={{
      width: collapsed ? 44 : 480,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      transition: 'width 200ms ease',
      position: 'relative',
    }}>
      {/* Collapse/Expand toggle button */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            position: 'absolute',
            left: collapsed ? 8 : 4,
            top: 18,
            zIndex: 20,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '1.5px solid var(--accent)',
            color: 'var(--accent)',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'left 200ms ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {collapsed ? '\u00BB' : '\u00AB'}
        </button>
      )}

      {collapsed ? (
        /* Collapsed: show vertical strip */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 54, gap: 8,
        }}>
          {/* Vertical text label */}
          <div style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: 10,
            color: 'var(--muted)',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
        </div>
      ) : (
        /* Expanded: full sidebar */
        <>
          {/* Header */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingLeft: onToggleCollapse ? 44 : 20,
          }}>
            <div>
              <h1 style={{
                fontSize: 17, fontWeight: 700,
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>{title}</h1>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>{subtitle}</p>
              {subtitleExtra}
            </div>
            {headerExtra}
          </div>

          {/* Controls */}
          {controls && (
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap',
            }}>
              {controls}
            </div>
          )}

          {/* Tab bar */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border)',
            overflowX: 'auto', flexShrink: 0,
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  background: 'transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                  padding: '8px 12px',
                  fontSize: 11,
                  borderRadius: 0,
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="badge-count">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '12px 16px' }}>
              {children}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ControlProps {
  label: string;
  children: ReactNode;
}

export function Control({ label, children }: ControlProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
