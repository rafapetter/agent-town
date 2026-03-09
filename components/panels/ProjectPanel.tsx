'use client';

import { useState } from 'react';
import type { AgentTown } from '../../src/index';

const PRIO_BADGE: Record<string, string> = {
  low: 'badge-lo',
  medium: 'badge-med',
  high: 'badge-hi',
  critical: 'badge-crit',
};

const OBJ_STATUS_COLOR: Record<string, string> = {
  draft: '#95A5A6',
  active: '#3498DB',
  completed: '#27AE60',
  cancelled: '#E74C3C',
};

const STORY_STATUS_COLOR: Record<string, string> = {
  draft: '#95A5A6',
  ready: '#3498DB',
  in_progress: '#F39C12',
  done: '#27AE60',
  blocked: '#E74C3C',
};

const STAGE_COLOR: Record<string, string> = {
  backlog: '#95A5A6',
  todo: '#3498DB',
  in_progress: '#F39C12',
  review: '#9B59B6',
  done: '#27AE60',
};

interface Props {
  town: AgentTown;
}

export function ProjectPanel({ town }: Props) {
  const sprints = town.getSprints();
  const activeSprint = town.getActiveSprint();
  const objectives = town.getObjectives();
  const stories = town.getStories();
  const tasks = town.getTasks();

  // Track expanded objectives and stories
  const [expandedObjs, setExpandedObjs] = useState<Set<string>>(() => {
    return new Set(objectives.map((o) => o.id));
  });
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());

  const toggleObj = (id: string) => {
    setExpandedObjs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStory = (id: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute overall sprint progress
  const sprintProgress = activeSprint
    ? (() => {
        const sprintObjs = objectives.filter((o) => o.sprintId === activeSprint.id);
        if (sprintObjs.length === 0) return 0;
        return sprintObjs.reduce((sum, o) => sum + o.progress, 0) / sprintObjs.length;
      })()
    : 0;

  if (objectives.length === 0) {
    return <div className="empty">No objectives defined yet.</div>;
  }

  return (
    <div>
      {/* Sprint header */}
      {activeSprint && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{activeSprint.name}</span>
            <span className="badge" style={{ background: '#3498DB33', color: '#3498DB' }}>
              {activeSprint.status}
            </span>
          </div>
          {activeSprint.goal && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              {activeSprint.goal}
            </div>
          )}
          <div className="progress-bar">
            <div
              className="fill"
              style={{ width: `${Math.round(sprintProgress * 100)}%` }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textAlign: 'right' }}>
            {Math.round(sprintProgress * 100)}%
          </div>
        </div>
      )}

      {/* Objectives */}
      {objectives.map((obj) => {
        const isExpanded = expandedObjs.has(obj.id);
        const objStories = stories.filter((s) => s.objectiveId === obj.id);
        const statusColor = OBJ_STATUS_COLOR[obj.status] ?? '#95A5A6';

        return (
          <div key={obj.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Objective header */}
            <div
              className="collapsible-header"
              onClick={() => toggleObj(obj.id)}
              style={{ padding: '10px 10px 6px' }}
            >
              <span className={`collapse-icon${isExpanded ? '' : ' collapsed'}`}>
                &#9660;
              </span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{obj.title}</span>
              <span
                className="badge"
                style={{
                  background: statusColor + '33',
                  color: statusColor,
                }}
              >
                {obj.status}
              </span>
              <span className={`badge ${PRIO_BADGE[obj.priority] ?? ''}`}>
                {obj.priority}
              </span>
            </div>

            {/* Objective progress bar */}
            <div style={{ padding: '0 10px 8px' }}>
              <div className="progress-bar">
                <div
                  className="fill"
                  style={{ width: `${Math.round(obj.progress * 100)}%` }}
                />
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
                {Math.round(obj.progress * 100)}% &middot; {objStories.length} stories
              </div>
            </div>

            {/* Stories */}
            {isExpanded && (
              <div style={{ padding: '0 10px 10px', paddingLeft: 20 }}>
                {objStories.length === 0 && (
                  <div style={{ fontSize: 11, color: '#555', padding: '6px 0' }}>
                    No stories yet.
                  </div>
                )}
                {objStories.map((story) => {
                  const storyExpanded = expandedStories.has(story.id);
                  const storyTasks = tasks.filter((t) => t.storyId === story.id);
                  const storyColor = STORY_STATUS_COLOR[story.status] ?? '#95A5A6';

                  return (
                    <div
                      key={story.id}
                      style={{
                        background: '#151535',
                        border: '1px solid var(--border)',
                        borderRadius: 5,
                        marginBottom: 6,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Story header */}
                      <div
                        className="collapsible-header"
                        onClick={() => toggleStory(story.id)}
                        style={{ padding: '8px 8px 4px' }}
                      >
                        <span className={`collapse-icon${storyExpanded ? '' : ' collapsed'}`}>
                          &#9660;
                        </span>
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>
                          {story.title}
                        </span>
                        {story.points !== undefined && (
                          <span className="badge">{story.points}pt</span>
                        )}
                        {story.assigneeName && (
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {story.assigneeName}
                          </span>
                        )}
                        <span
                          className="badge"
                          style={{
                            background: storyColor + '33',
                            color: storyColor,
                          }}
                        >
                          {story.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Story progress bar */}
                      <div style={{ padding: '0 8px 6px' }}>
                        <div className="progress-bar">
                          <div
                            className="fill"
                            style={{ width: `${Math.round(story.progress * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Tasks under this story */}
                      {storyExpanded && (
                        <div style={{ padding: '0 8px 8px', paddingLeft: 16 }}>
                          {storyTasks.length === 0 && (
                            <div style={{ fontSize: 10, color: '#555', padding: '4px 0' }}>
                              No tasks yet.
                            </div>
                          )}
                          {storyTasks.map((task) => {
                            const stageColor = STAGE_COLOR[task.stage] ?? '#95A5A6';
                            return (
                              <div
                                key={task.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 0',
                                  borderBottom: '1px solid #1a1a30',
                                  fontSize: 11,
                                }}
                              >
                                <span
                                  className="dot"
                                  style={{ background: stageColor }}
                                />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {task.title}
                                </span>
                                <span
                                  className="badge"
                                  style={{
                                    background: stageColor + '33',
                                    color: stageColor,
                                  }}
                                >
                                  {task.stage.replace(/_/g, ' ')}
                                </span>
                                <span className={`badge ${PRIO_BADGE[task.priority] ?? ''}`}>
                                  {task.priority}
                                </span>
                                {task.assigneeName && (
                                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                                    {task.assigneeName}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
