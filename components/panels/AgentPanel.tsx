'use client';

import { useState, useMemo } from 'react';
import type { AgentTown } from '../../src/index';
import { AgentSimulation, PIPELINE_STEPS, PIPELINE_LABELS } from '../../lib/simulation';

interface Props {
  town: AgentTown;
  sim: AgentSimulation;
}

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

const PRIO_BADGE: Record<string, string> = {
  low: 'badge-lo',
  medium: 'badge-med',
  high: 'badge-hi',
  critical: 'badge-crit',
};

export function AgentPanel({ town, sim }: Props) {
  const agents = town.getAgents();
  const stories = town.getStories();

  if (agents.length === 0) {
    return <div className="empty">No agents in the town yet.</div>;
  }

  return (
    <div>
      <div className="section-h">
        <span>Agents</span>
        <span className="cnt">{agents.length}</span>
      </div>

      {agents.map((agent) => {
        const status = agent.resolvedActivity;
        const color = SC[status] ?? '#95A5A6';
        const simState = sim.agentStates.get(agent.id);
        const pipelineStep = sim.getAgentPipelineStep(agent.id);

        const storyTitle = agent.currentStoryId
          ? stories.find((s) => s.id === agent.currentStoryId)?.title
          : null;

        const completed = simState?.tasksCompleted ?? 0;
        const failed = simState?.tasksFailed ?? 0;

        return (
          <div key={agent.id} className="card">
            {/* Header row: dot + name + role */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="dot" style={{ background: color }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{agent.name}</span>
              {agent.role && (
                <span className="badge">{agent.role}</span>
              )}
            </div>

            {/* Activity pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className={`pill on`}>{status.replace(/_/g, ' ')}</span>
            </div>

            {/* Stats */}
            <div className="agent-stats" style={{ marginBottom: 3 }}>
              {completed} done / {failed} errors
            </div>

            {/* Current story */}
            {storyTitle && (
              <div className="agent-task" title={storyTitle}>
                {storyTitle}
              </div>
            )}

            {/* Pipeline visualization */}
            <div className="pipeline">
              {PIPELINE_STEPS.map((step, i) => {
                let cls = 'pipeline-step';
                if (pipelineStep >= 0) {
                  if (i < pipelineStep) cls += ' done';
                  else if (i === pipelineStep) cls += ' active';
                }
                return (
                  <div
                    key={step}
                    className={cls}
                    title={PIPELINE_LABELS[i]}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
