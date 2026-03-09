'use client';

import { useState } from 'react';
import type { AgentTown, EnvironmentId, ThemeId } from '../../src/index';

interface Props {
  town: AgentTown;
  env: EnvironmentId;
  theme: ThemeId;
  speed: number;
  onEnvChange: (env: EnvironmentId) => void;
  onThemeChange: (theme: ThemeId) => void;
  onSpeedChange: (speed: number) => void;
}

const SECTION: React.CSSProperties = {
  marginBottom: 20,
  padding: 12,
  background: 'rgba(255,255,255,0.03)',
  borderRadius: 8,
  border: '1px solid var(--border)',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--accent)',
  marginBottom: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const ROW: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text)',
};

const SUBLABEL: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--muted)',
  marginTop: 2,
};

export function SettingsPanel({
  town, env, theme, speed,
  onEnvChange, onThemeChange, onSpeedChange,
}: Props) {
  const [particleDensity, setParticleDensity] = useState<'low' | 'medium' | 'high'>('medium');

  return (
    <div>
      {/* Environment */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Environment</div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Theme Set</div>
            <div style={SUBLABEL}>Visual environment for the simulation</div>
          </div>
          <select
            value={env}
            onChange={(e) => onEnvChange(e.target.value as EnvironmentId)}
            style={{ width: 130 }}
          >
            <option value="office">Office</option>
            <option value="rocket">Rocket Launch</option>
            <option value="space_station">Space Station</option>
            <option value="farm">Farm & Ranch</option>
            <option value="hospital">Hospital</option>
            <option value="pirate_ship">Pirate Ship</option>
            <option value="town">Town</option>
          </select>
        </div>

        {env === 'office' && (
          <div style={ROW}>
            <div>
              <div style={LABEL}>Color Theme</div>
              <div style={SUBLABEL}>Office color palette</div>
            </div>
            <select
              value={theme}
              onChange={(e) => onThemeChange(e.target.value as ThemeId)}
              style={{ width: 130 }}
            >
              <option value="casual">Casual</option>
              <option value="business">Business</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        )}
      </div>

      {/* Visual Effects */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Visual Effects</div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Particle Density</div>
            <div style={SUBLABEL}>Amount of ambient particles</div>
          </div>
          <select
            value={particleDensity}
            onChange={(e) => {
              const v = e.target.value as 'low' | 'medium' | 'high';
              setParticleDensity(v);
              town.updateSettings?.({ particleDensity: v });
            }}
            style={{ width: 130 }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {/* Simulation */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Simulation</div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Speed</div>
            <div style={SUBLABEL}>Simulation speed multiplier</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={speed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text)', minWidth: 30, textAlign: 'right' }}>
              {speed.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Info</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
          <p style={{ marginBottom: 6 }}>
            <strong>Particles:</strong> Ambient effects like dust, leaves, or sparks
            depending on the environment.
          </p>
          <p>
            <strong>Rooms:</strong> Each room represents a kanban stage. Tasks and agents
            move between rooms as work progresses.
          </p>
        </div>
      </div>
    </div>
  );
}
