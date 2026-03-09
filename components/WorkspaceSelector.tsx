'use client';

import { useState } from 'react';
import type { AgentTown, Workspace } from '../src/index';

interface Props {
  town: AgentTown;
  onWorkspaceChange: () => void;
}

const COLORS = ['#E74C3C', '#3498DB', '#27AE60', '#F39C12', '#8E44AD', '#1ABC9C'];

export function WorkspaceSelector({ town, onWorkspaceChange }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const workspaces = town.getWorkspaces();
  const activeId = town.getActiveWorkspaceId();

  const handleSelect = (id: string | null) => {
    town.setActiveWorkspace(id);
    onWorkspaceChange();
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = `ws_${Date.now()}`;
    const color = COLORS[workspaces.length % COLORS.length];
    const agents = town.getAgents();
    town.addWorkspace({
      id,
      name: newName.trim(),
      color,
      agentIds: agents.map(a => a.id), // default: all agents
    });
    setNewName('');
    setShowCreate(false);
    onWorkspaceChange();
  };

  if (workspaces.length === 0 && !showCreate) {
    return (
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>No workspaces</span>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontSize: 10, color: 'var(--accent)', background: 'transparent',
            padding: '2px 6px', cursor: 'pointer',
          }}
        >
          + New
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: '6px 12px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    }}>
      {/* All button */}
      <button
        onClick={() => handleSelect(null)}
        style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 12,
          background: activeId === null ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
          color: activeId === null ? '#fff' : 'var(--muted)',
          border: 'none', cursor: 'pointer',
          fontWeight: activeId === null ? 600 : 400,
        }}
      >
        All
      </button>

      {/* Workspace pills */}
      {workspaces.map(ws => (
        <button
          key={ws.id}
          onClick={() => handleSelect(ws.id)}
          style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 12,
            background: activeId === ws.id ? ws.color : 'rgba(255,255,255,0.06)',
            color: activeId === ws.id ? '#fff' : 'var(--muted)',
            border: `1px solid ${activeId === ws.id ? ws.color : 'transparent'}`,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            fontWeight: activeId === ws.id ? 600 : 400,
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: ws.color, display: 'inline-block',
          }} />
          {ws.name}
        </button>
      ))}

      {/* Create button */}
      {showCreate ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Name..."
            autoFocus
            style={{
              width: 80, fontSize: 10, padding: '2px 6px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)',
            }}
          />
          <button
            onClick={handleCreate}
            style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', cursor: 'pointer' }}
          >
            Add
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewName(''); }}
            style={{ fontSize: 10, color: 'var(--muted)', background: 'transparent', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 12,
            background: 'transparent', color: 'var(--muted)',
            border: '1px dashed var(--border)', cursor: 'pointer',
          }}
        >
          +
        </button>
      )}
    </div>
  );
}
