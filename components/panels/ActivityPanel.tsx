'use client';

import { useState, useMemo } from 'react';
import type { AgentTown } from '../../src/index';

const EVENT_COLOR: Record<string, string> = {
  status_change: '#3498DB',
  task_update: '#F39C12',
  message: '#27AE60',
  review_request: '#E67E22',
  system: '#95A5A6',
};

const MAX_EVENTS = 150;

interface Props {
  town: AgentTown;
}

export function ActivityPanel({ town }: Props) {
  const [search, setSearch] = useState('');
  const log = town.getActivityLog();

  // Show most recent events first, capped at MAX_EVENTS
  const filtered = useMemo(() => {
    const reversed = [...log].reverse();
    const capped = reversed.slice(0, MAX_EVENTS);
    if (!search.trim()) return capped;
    const q = search.toLowerCase();
    return capped.filter(
      (evt) =>
        evt.description.toLowerCase().includes(q) ||
        evt.agentName.toLowerCase().includes(q)
    );
  }, [log, search]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div>
      <div className="section-h">
        <span>Activity Log</span>
        <span className="cnt">{log.length}</span>
      </div>

      {/* Search input */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {/* Event list */}
      {filtered.length === 0 && (
        <div className="empty">
          {search ? 'No matching events found.' : 'No activity yet.'}
        </div>
      )}

      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {filtered.map((evt) => {
          const color = EVENT_COLOR[evt.type] ?? '#95A5A6';
          return (
            <div key={evt.id} className="evt-item">
              <span className="evt-time">{formatTime(evt.timestamp)}</span>
              <span className="evt-dot" style={{ background: color }} />
              <span className="evt-desc">{evt.description}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
