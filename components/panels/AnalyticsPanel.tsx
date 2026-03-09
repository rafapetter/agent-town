'use client';

import { useMemo } from 'react';
import type { AgentTown } from '../../src/index';
import type { AgentSimulation } from '../../lib/simulation';

const SC: Record<string, string> = {
  idle: '#95A5A6',
  planning: '#F39C12',
  analyzing: '#E67E22',
  decomposing: '#D35400',
  searching: '#8E44AD',
  reading: '#9B59B6',
  grepping: '#7D3C98',
  coding: '#3498DB',
  generating: '#2980B9',
  refactoring: '#2471A3',
  testing: '#1ABC9C',
  linting: '#16A085',
  validating: '#148F77',
  committing: '#5B5EA6',
  pushing: '#6C5CE7',
  deploying: '#4834D4',
  reviewing: '#E67E22',
  waiting_approval: '#F39C12',
  success: '#27AE60',
  error: '#E74C3C',
  paused: '#BDC3C7',
  blocked: '#C0392B',
};

interface Props {
  town: AgentTown;
  sim: AgentSimulation;
}

export function AnalyticsPanel({ town, sim }: Props) {
  const agents = town.getAgents();
  const tasks = town.getTasks();
  const objectives = town.getObjectives();
  const activeSprint = town.getActiveSprint();

  // Stats grid values
  const activeAgents = agents.filter(
    (a) => a.resolvedActivity !== 'idle' && a.resolvedActivity !== 'paused'
  ).length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.stage === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.stage === 'in_progress').length;

  // Sprint progress
  const sprintProgress = useMemo(() => {
    if (!activeSprint) return 0;
    const burndown = town.getSprintBurndown(activeSprint.id);
    return burndown.progressPercent;
  }, [activeSprint, town, tasks]);

  // Agent status distribution
  const statusDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const agent of agents) {
      const status = agent.resolvedActivity;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [agents]);

  // Agent performance (completed task count via sim states)
  const agentPerformance = useMemo(() => {
    return agents
      .map((agent) => {
        const simState = sim.agentStates.get(agent.id);
        return {
          name: agent.name,
          completed: simState?.tasksCompleted ?? 0,
        };
      })
      .sort((a, b) => b.completed - a.completed);
  }, [agents, sim]);

  const maxPerformance = Math.max(1, ...agentPerformance.map((a) => a.completed));

  return (
    <div>
      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="sv" style={{ color: '#3498DB' }}>{activeAgents}</div>
          <div className="sl">Active Agents</div>
        </div>
        <div className="stat-card">
          <div className="sv" style={{ color: 'var(--text)' }}>{totalTasks}</div>
          <div className="sl">Total Tasks</div>
        </div>
        <div className="stat-card">
          <div className="sv" style={{ color: '#27AE60' }}>{completedTasks}</div>
          <div className="sl">Completed</div>
        </div>
        <div className="stat-card">
          <div className="sv" style={{ color: '#F39C12' }}>{inProgressTasks}</div>
          <div className="sl">In Progress</div>
        </div>
      </div>

      {/* Sprint progress */}
      {activeSprint && (
        <>
          <div className="section-h">
            <span>Sprint Progress</span>
            <span className="cnt">{sprintProgress}%</span>
          </div>
          <div className="progress-bar" style={{ height: 8 }}>
            <div className="fill" style={{ width: `${sprintProgress}%` }} />
          </div>
        </>
      )}

      {/* Objective progress */}
      {objectives.length > 0 && (
        <>
          <div className="section-h">
            <span>Objectives</span>
            <span className="cnt">{objectives.length}</span>
          </div>
          {objectives.map((obj) => {
            const pct = Math.round(obj.progress * 100);
            return (
              <div key={obj.id} className="stat-row">
                <span className="stat-label" title={obj.title}>
                  {obj.title}
                </span>
                <div className="stat-bar-bg">
                  <div
                    className="stat-bar"
                    style={{
                      width: `${pct}%`,
                      background: obj.progress >= 1 ? '#27AE60' : 'var(--accent)',
                    }}
                  />
                </div>
                <span className="stat-val">{pct}%</span>
              </div>
            );
          })}
        </>
      )}

      {/* Agent status distribution */}
      {statusDist.length > 0 && (
        <>
          <div className="section-h">
            <span>Agent Status Distribution</span>
          </div>
          {statusDist.map(([status, count]) => {
            const pct = agents.length > 0 ? Math.round((count / agents.length) * 100) : 0;
            const color = SC[status] ?? '#95A5A6';
            return (
              <div key={status} className="stat-row">
                <span className="stat-label" title={status}>
                  {status.replace(/_/g, ' ')}
                </span>
                <div className="stat-bar-bg">
                  <div
                    className="stat-bar"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="stat-val">{count}</span>
              </div>
            );
          })}
        </>
      )}

      {/* Agent performance */}
      {agentPerformance.length > 0 && (
        <>
          <div className="section-h">
            <span>Agent Performance</span>
          </div>
          {agentPerformance.map(({ name, completed }) => {
            const pct = Math.round((completed / maxPerformance) * 100);
            return (
              <div key={name} className="stat-row">
                <span className="stat-label" title={name}>
                  {name}
                </span>
                <div className="stat-bar-bg">
                  <div
                    className="stat-bar"
                    style={{ width: `${pct}%`, background: '#27AE60' }}
                  />
                </div>
                <span className="stat-val">{completed}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
