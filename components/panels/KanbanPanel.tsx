'use client';

import type { AgentTown, TaskStage } from '../../src/index';

const PRIO_BADGE: Record<string, string> = {
  low: 'badge-lo',
  medium: 'badge-med',
  high: 'badge-hi',
  critical: 'badge-crit',
};

interface Props {
  town: AgentTown;
}

export function KanbanPanel({ town }: Props) {
  const tasks = town.getTasks();
  const stages = town.getStages();

  if (tasks.length === 0) {
    return <div className="empty">No tasks created yet.</div>;
  }

  return (
    <div>
      {stages.map((stage) => {
        const colTasks = tasks.filter((t) => t.stage === stage.id);

        return (
          <div key={stage.id} style={{ marginBottom: 14 }}>
            {/* Column header */}
            <div className="section-h">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="dot"
                  style={{ background: stage.color }}
                />
                {stage.name}
              </span>
              <span className="cnt">{colTasks.length}</span>
            </div>

            {/* Task cards */}
            {colTasks.length === 0 && (
              <div style={{ fontSize: 10, color: '#555', padding: '4px 0' }}>
                No tasks
              </div>
            )}
            {colTasks.map((task) => (
              <div
                key={task.id}
                className="task-card"
                style={{ borderLeftColor: stage.color }}
              >
                <div className="tc-title">{task.title}</div>
                <div className="tc-meta">
                  <span className={`badge ${PRIO_BADGE[task.priority] ?? ''}`}>
                    {task.priority}
                  </span>
                  {task.assigneeName && (
                    <span>{task.assigneeName}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
