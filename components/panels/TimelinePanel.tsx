'use client';

import { useMemo } from 'react';
import type { AgentTown } from '../../src/index';

interface Props {
  town: AgentTown;
}

const COLORS = {
  sprint: '#8E44AD',
  objective: '#E67E22',
  story: '#3498DB',
  task: '#27AE60',
  onTrack: '#27AE60',
  atRisk: '#F39C12',
  behind: '#E74C3C',
  bg: 'rgba(255,255,255,0.03)',
};

const progressColor = (pct: number, expected: number) => {
  if (pct >= expected * 0.9) return COLORS.onTrack;
  if (pct >= expected * 0.6) return COLORS.atRisk;
  return COLORS.behind;
};

type ScheduleStatus = 'on_track' | 'at_risk' | 'behind';

const getScheduleStatus = (pct: number, expected: number): ScheduleStatus => {
  if (pct >= expected * 0.9) return 'on_track';
  if (pct >= expected * 0.6) return 'at_risk';
  return 'behind';
};

const SCHEDULE_BADGE: Record<ScheduleStatus, { label: string; icon: string; color: string }> = {
  on_track: { label: 'On Track', icon: '\u2705', color: COLORS.onTrack },
  at_risk:  { label: 'At Risk',  icon: '\u26A0\uFE0F', color: COLORS.atRisk },
  behind:   { label: 'Behind',   icon: '\uD83D\uDD34', color: COLORS.behind },
};

export function TimelinePanel({ town }: Props) {
  const sprints = town.getSprints();
  const objectives = town.getObjectives();
  const stories = town.getStories();
  const tasks = town.getTasks();

  const storyProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const story of stories) {
      const storyTasks = tasks.filter(t => t.storyId === story.id);
      const done = storyTasks.filter(t => t.stage === 'done').length;
      map.set(story.id, { total: storyTasks.length, done });
    }
    return map;
  }, [stories, tasks]);

  const objectiveProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const obj of objectives) {
      const objStories = stories.filter(s => s.objectiveId === obj.id);
      let total = 0, done = 0;
      for (const s of objStories) {
        const sp = storyProgress.get(s.id);
        if (sp) { total += sp.total; done += sp.done; }
      }
      map.set(obj.id, { total, done });
    }
    return map;
  }, [objectives, stories, storyProgress]);

  const sprintProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const sprint of sprints) {
      const sprintObjectives = objectives.filter(o => o.sprintId === sprint.id);
      let total = 0, done = 0;
      for (const o of sprintObjectives) {
        const op = objectiveProgress.get(o.id);
        if (op) { total += op.total; done += op.done; }
      }
      map.set(sprint.id, { total, done });
    }
    return map;
  }, [sprints, objectives, objectiveProgress]);

  // Overall stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.stage === 'done').length;
  const overallPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const overallStatus = totalTasks > 0 ? getScheduleStatus(overallPct, 50) : 'on_track';

  return (
    <div>
      {/* Overall progress header */}
      <div style={{
        padding: 12, marginBottom: 12, borderRadius: 8,
        background: COLORS.bg, border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
            Overall Progress
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {overallPct}%
          </span>
        </div>
        <div style={{
          height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${overallPct}%`, height: '100%', borderRadius: 4,
            background: `linear-gradient(90deg, ${COLORS.onTrack}, ${COLORS.story})`,
            transition: 'width 300ms ease',
          }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          {doneTasks} of {totalTasks} tasks completed
        </div>
        {totalTasks > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
            padding: '4px 8px', borderRadius: 4,
            background: `${SCHEDULE_BADGE[overallStatus].color}15`,
          }}>
            <span style={{ fontSize: 12 }}>{SCHEDULE_BADGE[overallStatus].icon}</span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: SCHEDULE_BADGE[overallStatus].color,
            }}>
              Schedule: {SCHEDULE_BADGE[overallStatus].label}
            </span>
          </div>
        )}
      </div>

      {/* Sprint timeline */}
      {sprints.map(sprint => {
        const sp = sprintProgress.get(sprint.id);
        const pct = sp && sp.total > 0 ? Math.round((sp.done / sp.total) * 100) : 0;
        const sprintObjectives = objectives.filter(o => o.sprintId === sprint.id);

        return (
          <div key={sprint.id} style={{
            marginBottom: 16, borderRadius: 8,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            {/* Sprint header */}
            <div style={{
              padding: '10px 12px',
              background: `${COLORS.sprint}15`,
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: COLORS.sprint,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>Sprint</span>
                    {(() => {
                      const spStatus = getScheduleStatus(pct, 50);
                      if (spStatus === 'on_track') return null;
                      const info = SCHEDULE_BADGE[spStatus];
                      return (
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: '1px 6px',
                          borderRadius: 8, background: `${info.color}20`, color: info.color,
                        }}>
                          {info.icon} {info.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                    {sprint.name}
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: progressColor(pct, 50) }}>
                  {pct}%
                </span>
              </div>
              <div style={{
                height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)',
                marginTop: 6, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 2,
                  background: COLORS.sprint,
                  transition: 'width 300ms ease',
                }} />
              </div>
            </div>

            {/* Objectives within sprint */}
            <div style={{ padding: '0 8px' }}>
              {sprintObjectives.map(obj => {
                const op = objectiveProgress.get(obj.id);
                const objPct = op && op.total > 0 ? Math.round((op.done / op.total) * 100) : 0;
                const objStories = stories.filter(s => s.objectiveId === obj.id);

                return (
                  <div key={obj.id} style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                    {/* Objective row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: COLORS.objective, display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                          {obj.title}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: progressColor(objPct, 50) }}>
                        {objPct}%
                      </span>
                    </div>

                    {/* Stories within objective */}
                    {objStories.map(story => {
                      const sp2 = storyProgress.get(story.id);
                      const stPct = sp2 && sp2.total > 0 ? Math.round((sp2.done / sp2.total) * 100) : 0;
                      const storyTasks = tasks.filter(t => t.storyId === story.id);

                      return (
                        <div key={story.id} style={{ marginLeft: 20, marginBottom: 4 }}>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: 2,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{
                                width: 6, height: 6, borderRadius: 2,
                                background: COLORS.story, display: 'inline-block',
                              }} />
                              <span style={{ fontSize: 10, color: 'var(--text)' }}>
                                {story.title}
                              </span>
                            </div>
                            <span style={{ fontSize: 9, color: 'var(--muted)' }}>
                              {sp2?.done ?? 0}/{sp2?.total ?? 0}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div style={{
                            height: 3, borderRadius: 2,
                            background: 'rgba(255,255,255,0.05)',
                            marginLeft: 11, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${stPct}%`, height: '100%',
                              borderRadius: 2,
                              background: progressColor(stPct, 50),
                              transition: 'width 300ms ease',
                            }} />
                          </div>
                          {/* Task dots */}
                          <div style={{ display: 'flex', gap: 2, marginLeft: 11, marginTop: 3, flexWrap: 'wrap' }}>
                            {storyTasks.map(task => (
                              <span
                                key={task.id}
                                title={`${task.title} (${task.stage})`}
                                style={{
                                  width: 5, height: 5, borderRadius: 1,
                                  background: task.stage === 'done' ? COLORS.onTrack
                                    : task.stage === 'in_progress' ? COLORS.story
                                    : task.stage === 'review' ? COLORS.objective
                                    : 'rgba(255,255,255,0.15)',
                                  display: 'inline-block',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {sprints.length === 0 && (
        <div className="empty" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            No sprints yet. Start a simulation to see the timeline.
          </div>
        </div>
      )}
    </div>
  );
}
