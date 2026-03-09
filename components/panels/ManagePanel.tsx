'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentTown, StageConfig, RoomMode, Priority, ObjectiveStatus, StoryStatus, TaskStage, BuildingStyle } from '../../src/index';

/* ── constants ─────────────────────────────────── */

const PRIO_BADGE: Record<string, string> = {
  low: 'badge-lo',
  medium: 'badge-med',
  high: 'badge-hi',
  critical: 'badge-crit',
};

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];
const OBJ_STATUSES: ObjectiveStatus[] = ['draft', 'active', 'completed', 'cancelled'];
const STORY_STATUSES: StoryStatus[] = ['draft', 'ready', 'in_progress', 'done', 'blocked'];
const BUILDING_STYLES: BuildingStyle[] = ['warehouse', 'workshop', 'lab', 'office', 'depot', 'tavern'];

const OBJ_STATUS_COLOR: Record<string, string> = {
  draft: '#95A5A6', active: '#3498DB', completed: '#27AE60', cancelled: '#E74C3C',
};
const STORY_STATUS_COLOR: Record<string, string> = {
  draft: '#95A5A6', ready: '#3498DB', in_progress: '#F39C12', done: '#27AE60', blocked: '#E74C3C',
};

/* ── InlineEdit helper ─────────────────────────── */

function InlineEdit({
  value, onSave, style, placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{ cursor: 'pointer', borderBottom: '1px dashed #555', ...style }}
        title="Click to edit"
      >
        {value || placeholder || '(empty)'}
      </span>
    );
  }

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onSave(draft.trim()); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onSave(draft.trim()); setEditing(false); }
        if (e.key === 'Escape') setEditing(false);
      }}
      style={{ width: '100%', fontSize: 'inherit', ...style }}
      placeholder={placeholder}
    />
  );
}

/* ── Manage Panel ──────────────────────────────── */

interface Props {
  town: AgentTown;
  onUpdate?: () => void;
}

type ManageTab = 'items' | 'stages';

let nextId = 1000;
function uid(prefix: string): string { return `${prefix}-${nextId++}`; }

export function ManagePanel({ town, onUpdate }: Props) {
  const [tab, setTab] = useState<ManageTab>('items');
  const fire = useCallback(() => onUpdate?.(), [onUpdate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <button
          className={tab === 'items' ? 'btn-p' : 'btn-s'}
          style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
          onClick={() => setTab('items')}
        >
          Work Items
        </button>
        <button
          className={tab === 'stages' ? 'btn-p' : 'btn-s'}
          style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
          onClick={() => setTab('stages')}
        >
          Stages
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'items'
          ? <HierarchyManager town={town} onUpdate={fire} />
          : <StageConfigPanel town={town} onUpdate={fire} />}
      </div>
    </div>
  );
}

/* ── Work Items (Hierarchy Manager) ────────────── */

function HierarchyManager({ town, onUpdate }: { town: AgentTown; onUpdate: () => void }) {
  const [, setTick] = useState(0);
  const refresh = useCallback(() => { setTick((t) => t + 1); onUpdate(); }, [onUpdate]);

  const sprints = town.getSprints();
  const activeSprint = town.getActiveSprint();
  const objectives = town.getObjectives();
  const stories = town.getStories();
  const tasks = town.getTasks();
  const agents = town.getAgents();
  const stages = town.getStages();

  const [expandedObjs, setExpandedObjs] = useState<Set<string>>(
    () => new Set(objectives.map((o) => o.id)),
  );
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());

  const toggleObj = (id: string) =>
    setExpandedObjs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleStory = (id: string) =>
    setExpandedStories((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /* ── Sprint section ────────────────────────── */
  const handleAddSprint = () => {
    const id = uid('sprint');
    town.addSprint({ id, name: 'New Sprint', goal: '', status: 'active' });
    refresh();
  };

  /* ── Objective CRUD ───────────────────────── */
  const handleAddObjective = () => {
    const id = uid('obj');
    town.addObjective({
      id, title: 'New Objective', description: '', status: 'draft',
      priority: 'medium', sprintId: activeSprint?.id,
    });
    setExpandedObjs((prev) => new Set(prev).add(id));
    refresh();
  };

  const handleDeleteObjective = (id: string) => {
    // Also remove child stories + tasks
    const childStories = stories.filter((s) => s.objectiveId === id);
    for (const st of childStories) {
      const childTasks = tasks.filter((t) => t.storyId === st.id);
      for (const t of childTasks) town.removeTask(t.id);
      town.removeStory(st.id);
    }
    town.removeObjective(id);
    refresh();
  };

  /* ── Story CRUD ───────────────────────────── */
  const handleAddStory = (objectiveId: string) => {
    const id = uid('st');
    town.addStory({
      id, objectiveId, title: 'New Story', description: '',
      status: 'draft', priority: 'medium',
    });
    setExpandedStories((prev) => new Set(prev).add(id));
    refresh();
  };

  const handleDeleteStory = (id: string) => {
    const childTasks = tasks.filter((t) => t.storyId === id);
    for (const t of childTasks) town.removeTask(t.id);
    town.removeStory(id);
    refresh();
  };

  /* ── Task CRUD ────────────────────────────── */
  const handleAddTask = (storyId: string) => {
    const id = uid('task');
    town.addTask({
      id, storyId, title: 'New Task', description: '',
      stage: 'backlog', priority: 'medium',
    });
    refresh();
  };

  const handleAddOrphanTask = () => {
    const id = uid('task');
    town.addTask({
      id, title: 'New Task', description: '',
      stage: 'backlog', priority: 'medium',
    });
    refresh();
  };

  const handleDeleteTask = (id: string) => {
    town.removeTask(id);
    refresh();
  };

  return (
    <div>
      {/* Sprint header */}
      {activeSprint ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sprint:</span>
            <InlineEdit
              value={activeSprint.name}
              onSave={(v) => { town.updateSprint(activeSprint.id, { name: v }); refresh(); }}
              style={{ fontSize: 12, fontWeight: 600 }}
            />
          </div>
          <InlineEdit
            value={activeSprint.goal ?? ''}
            onSave={(v) => { town.updateSprint(activeSprint.id, { goal: v }); refresh(); }}
            style={{ fontSize: 11, color: 'var(--muted)' }}
            placeholder="Sprint goal..."
          />
        </div>
      ) : (
        <button className="btn-s" onClick={handleAddSprint} style={{ marginBottom: 10, width: '100%', fontSize: 11 }}>
          + Add Sprint
        </button>
      )}

      {/* Objectives list */}
      {objectives.map((obj) => {
        const isExpanded = expandedObjs.has(obj.id);
        const objStories = stories.filter((s) => s.objectiveId === obj.id);
        const statusColor = OBJ_STATUS_COLOR[obj.status] ?? '#95A5A6';

        return (
          <div key={obj.id} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
            {/* Objective header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 8px 4px' }}>
              <span
                className={`collapse-icon${isExpanded ? '' : ' collapsed'}`}
                onClick={() => toggleObj(obj.id)}
                style={{ cursor: 'pointer' }}
              >
                &#9660;
              </span>
              <InlineEdit
                value={obj.title}
                onSave={(v) => { town.updateObjective(obj.id, { title: v }); refresh(); }}
                style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
              />
              <select
                value={obj.status}
                onChange={(e) => { town.updateObjective(obj.id, { status: e.target.value as ObjectiveStatus }); refresh(); }}
                style={{ fontSize: 10, background: statusColor + '33', color: statusColor, border: 'none', borderRadius: 3, padding: '2px 4px' }}
              >
                {OBJ_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={obj.priority}
                onChange={(e) => { town.updateObjective(obj.id, { priority: e.target.value as Priority }); refresh(); }}
                className={`badge ${PRIO_BADGE[obj.priority] ?? ''}`}
                style={{ fontSize: 10, border: 'none', borderRadius: 3, padding: '2px 4px' }}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={() => handleDeleteObjective(obj.id)}
                style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                title="Delete objective"
              >
                &#x2715;
              </button>
            </div>

            {/* Progress */}
            <div style={{ padding: '0 8px 6px' }}>
              <div className="progress-bar">
                <div className="fill" style={{ width: `${Math.round(obj.progress * 100)}%` }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
                {Math.round(obj.progress * 100)}% &middot; {objStories.length} stories
              </div>
            </div>

            {/* Stories */}
            {isExpanded && (
              <div style={{ padding: '0 8px 8px', paddingLeft: 16 }}>
                {objStories.map((story) => {
                  const storyExpanded = expandedStories.has(story.id);
                  const storyTasks = tasks.filter((t) => t.storyId === story.id);
                  const stColor = STORY_STATUS_COLOR[story.status] ?? '#95A5A6';

                  return (
                    <div
                      key={story.id}
                      style={{ background: '#151535', border: '1px solid var(--border)', borderRadius: 5, marginBottom: 6, overflow: 'hidden' }}
                    >
                      {/* Story header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 6px 3px' }}>
                        <span
                          className={`collapse-icon${storyExpanded ? '' : ' collapsed'}`}
                          onClick={() => toggleStory(story.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          &#9660;
                        </span>
                        <InlineEdit
                          value={story.title}
                          onSave={(v) => { town.updateStory(story.id, { title: v }); refresh(); }}
                          style={{ flex: 1, fontSize: 11, fontWeight: 500 }}
                        />
                        <input
                          type="number"
                          value={story.points ?? ''}
                          placeholder="pts"
                          onChange={(e) => {
                            const pts = e.target.value ? parseInt(e.target.value, 10) : undefined;
                            town.updateStory(story.id, { points: pts });
                            refresh();
                          }}
                          style={{ width: 32, fontSize: 10, textAlign: 'center' }}
                          title="Story points"
                        />
                        <select
                          value={story.status}
                          onChange={(e) => { town.updateStory(story.id, { status: e.target.value as StoryStatus }); refresh(); }}
                          style={{ fontSize: 10, background: stColor + '33', color: stColor, border: 'none', borderRadius: 3, padding: '2px 3px' }}
                        >
                          {STORY_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                        <select
                          value={story.assigneeId ?? ''}
                          onChange={(e) => {
                            const aid = e.target.value || undefined;
                            const aname = aid ? agents.find((a) => a.id === aid)?.name : undefined;
                            town.updateStory(story.id, { assigneeId: aid, assigneeName: aname });
                            refresh();
                          }}
                          style={{ fontSize: 10, maxWidth: 60 }}
                          title="Assignee"
                        >
                          <option value="">--</option>
                          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button
                          onClick={() => handleDeleteStory(story.id)}
                          style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: 11, padding: '0 3px' }}
                          title="Delete story"
                        >
                          &#x2715;
                        </button>
                      </div>

                      {/* Story progress */}
                      <div style={{ padding: '0 6px 4px' }}>
                        <div className="progress-bar">
                          <div className="fill" style={{ width: `${Math.round(story.progress * 100)}%` }} />
                        </div>
                      </div>

                      {/* Tasks */}
                      {storyExpanded && (
                        <div style={{ padding: '0 6px 6px', paddingLeft: 14 }}>
                          {storyTasks.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              town={town}
                              stages={stages}
                              agents={agents}
                              onDelete={() => handleDeleteTask(task.id)}
                              onUpdate={refresh}
                            />
                          ))}
                          <button
                            className="btn-s"
                            onClick={() => handleAddTask(story.id)}
                            style={{ width: '100%', fontSize: 10, marginTop: 4, padding: '3px 0' }}
                          >
                            + Task
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  className="btn-s"
                  onClick={() => handleAddStory(obj.id)}
                  style={{ width: '100%', fontSize: 10, marginTop: 2, padding: '3px 0' }}
                >
                  + Story
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Bottom buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn-p" onClick={handleAddObjective} style={{ flex: 1, fontSize: 11 }}>
          + Objective
        </button>
        <button className="btn-s" onClick={handleAddOrphanTask} style={{ flex: 1, fontSize: 11 }}>
          + Orphan Task
        </button>
      </div>

      {/* Orphan tasks (no storyId) */}
      {(() => {
        const orphans = tasks.filter((t) => !t.storyId);
        if (orphans.length === 0) return null;
        return (
          <div style={{ marginTop: 12 }}>
            <div className="section-h">
              <span>Orphan Tasks</span>
              <span className="cnt">{orphans.length}</span>
            </div>
            {orphans.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                town={town}
                stages={stages}
                agents={agents}
                onDelete={() => handleDeleteTask(task.id)}
                onUpdate={refresh}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Task Row (reusable) ───────────────────────── */

function TaskRow({
  task, town, stages, agents, onDelete, onUpdate,
}: {
  task: { id: string; title: string; stage: string; priority: string; assigneeId?: string; assigneeName?: string };
  town: AgentTown;
  stages: StageConfig[];
  agents: Array<{ id: string; name: string }>;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const stageColor = stages.find((s) => s.id === task.stage)?.color ?? '#95A5A6';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 0', borderBottom: '1px solid #1a1a30', fontSize: 11,
      }}
    >
      <InlineEdit
        value={task.title}
        onSave={(v) => { town.updateTask(task.id, { title: v }); onUpdate(); }}
        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      />
      <select
        value={task.stage}
        onChange={(e) => { town.updateTask(task.id, { stage: e.target.value as TaskStage }); onUpdate(); }}
        style={{ fontSize: 10, background: stageColor + '33', color: stageColor, border: 'none', borderRadius: 3, padding: '2px 3px' }}
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select
        value={task.priority}
        onChange={(e) => { town.updateTask(task.id, { priority: e.target.value as Priority }); onUpdate(); }}
        className={`badge ${PRIO_BADGE[task.priority] ?? ''}`}
        style={{ fontSize: 10, border: 'none', borderRadius: 3, padding: '2px 3px' }}
      >
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select
        value={task.assigneeId ?? ''}
        onChange={(e) => {
          const aid = e.target.value || undefined;
          const aname = aid ? agents.find((a) => a.id === aid)?.name : undefined;
          town.updateTask(task.id, { assigneeId: aid, assigneeName: aname });
          onUpdate();
        }}
        style={{ fontSize: 10, maxWidth: 55 }}
        title="Assignee"
      >
        <option value="">--</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button
        onClick={onDelete}
        style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: 11, padding: '0 3px' }}
        title="Delete task"
      >
        &#x2715;
      </button>
    </div>
  );
}

/* ── Stage Configuration Panel ─────────────────── */

function StageConfigPanel({ town, onUpdate }: { town: AgentTown; onUpdate: () => void }) {
  const [localStages, setLocalStages] = useState<StageConfig[]>(() => town.getStages());
  const [roomMode, setRoomMode] = useState<RoomMode>(() => town.getRoomMode());
  const [dirty, setDirty] = useState(false);

  const handleRoomModeChange = (mode: RoomMode) => {
    setRoomMode(mode);
    town.setRoomMode(mode);
    onUpdate();
  };

  const updateStage = (index: number, patch: Partial<StageConfig>) => {
    setLocalStages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDirty(true);
  };

  const moveStage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= localStages.length) return;
    setLocalStages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const addStage = () => {
    const id = `stage_${Date.now()}`;
    setLocalStages((prev) => [
      ...prev,
      { id, name: 'New Stage', color: '#95A5A6', buildingStyle: 'office' as BuildingStyle },
    ]);
    setDirty(true);
  };

  const removeStage = (index: number) => {
    if (localStages.length <= 2) return; // minimum 2 stages
    setLocalStages((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const applyStages = () => {
    town.setStages(localStages);
    setDirty(false);
    onUpdate();
  };

  return (
    <div>
      {/* Room Mode toggle */}
      <div className="section-h" style={{ marginBottom: 8 }}>
        <span>Room Layout</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        <button
          className={roomMode === 'environment' ? 'btn-p' : 'btn-s'}
          style={{ flex: 1, fontSize: 10, padding: '4px 0' }}
          onClick={() => handleRoomModeChange('environment')}
        >
          Standard
        </button>
        <button
          className={roomMode === 'kanban' ? 'btn-p' : 'btn-s'}
          style={{ flex: 1, fontSize: 10, padding: '4px 0' }}
          onClick={() => handleRoomModeChange('kanban')}
        >
          Kanban Stages
        </button>
      </div>

      {/* Stage list */}
      <div className="section-h" style={{ marginBottom: 8 }}>
        <span>Kanban Stages</span>
        <span className="cnt">{localStages.length}</span>
      </div>

      {localStages.map((stage, i) => (
        <div
          key={stage.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 6px', marginBottom: 4,
            background: '#151535', border: '1px solid var(--border)', borderRadius: 5,
          }}
        >
          {/* Color picker */}
          <input
            type="color"
            value={stage.color}
            onChange={(e) => updateStage(i, { color: e.target.value })}
            style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer' }}
            title="Stage color"
          />

          {/* Name */}
          <input
            type="text"
            value={stage.name}
            onChange={(e) => updateStage(i, { name: e.target.value })}
            style={{ flex: 1, fontSize: 11 }}
          />

          {/* Building style */}
          <select
            value={stage.buildingStyle ?? 'office'}
            onChange={(e) => updateStage(i, { buildingStyle: e.target.value as BuildingStyle })}
            style={{ fontSize: 10, maxWidth: 70 }}
            title="Building style (town env)"
          >
            {BUILDING_STYLES.map((bs) => (
              <option key={bs} value={bs}>{bs}</option>
            ))}
          </select>

          {/* Reorder */}
          <button
            onClick={() => moveStage(i, -1)}
            disabled={i === 0}
            style={{ background: 'none', border: 'none', color: i === 0 ? '#333' : 'var(--fg)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
            title="Move up"
          >
            &#x25B2;
          </button>
          <button
            onClick={() => moveStage(i, 1)}
            disabled={i === localStages.length - 1}
            style={{ background: 'none', border: 'none', color: i === localStages.length - 1 ? '#333' : 'var(--fg)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
            title="Move down"
          >
            &#x25BC;
          </button>

          {/* Remove */}
          <button
            onClick={() => removeStage(i)}
            disabled={localStages.length <= 2}
            style={{ background: 'none', border: 'none', color: localStages.length <= 2 ? '#333' : '#E74C3C', cursor: 'pointer', fontSize: 11, padding: '0 3px' }}
            title="Remove stage"
          >
            &#x2715;
          </button>
        </div>
      ))}

      {/* Add + Apply buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn-s" onClick={addStage} style={{ flex: 1, fontSize: 11 }}>
          + Stage
        </button>
        {dirty && (
          <button className="btn-p" onClick={applyStages} style={{ flex: 1, fontSize: 11 }}>
            Apply
          </button>
        )}
      </div>

      {/* Info text */}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10, lineHeight: 1.4 }}>
        <strong>Standard</strong> mode uses the environment&apos;s built-in room layout.
        <br />
        <strong>Kanban Stages</strong> mode creates one room/building per stage, and agents move between them based on their activity.
      </div>
    </div>
  );
}
