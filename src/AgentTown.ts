import type {
  AgentConfig, AgentUpdate, TownConfig, TownEventMap, TownSettings, Workspace,
  ThemeId, OfficeSize, EnvironmentId, ActivityEvent, Task, TaskStage, ReviewItem,
  ZoneType, AgentActivity, WorkPhase, ParticleEventType,
  Objective, ObjectiveStatus, Story, StoryStatus, Sprint, Milestone,
  StageConfig, RoomMode, Position, FlyingTask,
  TaskVisualizationData, TaskItemRenderData, CompletionBagRenderData, RoomOverflow, RoomTaskCount,
} from './types';
import { DEFAULT_STAGES } from './types';
import { Agent, resetPaletteCounter } from './agent';
import { World } from './world';
import { Renderer } from './renderer';
import { Engine } from './engine';
import { getAutoSize } from './themes';

type EventKey = keyof TownEventMap;
type EventCb<K extends EventKey> = (...args: TownEventMap[K]) => void;

/** Activity → WorkPhase mapping */
const ACTIVITY_PHASE: Partial<Record<AgentActivity, WorkPhase>> = {
  planning: 'planning', analyzing: 'planning', decomposing: 'planning',
  searching: 'planning', reading: 'planning', grepping: 'planning',
  coding: 'execution', generating: 'execution', refactoring: 'execution',
  testing: 'validation', linting: 'validation', validating: 'validation',
  committing: 'validation', pushing: 'validation', deploying: 'validation',
  reviewing: 'review', waiting_approval: 'review', blocked: 'review',
};

/** WorkPhase → room index (all environments use the same 4-room order) */
const PHASE_ROOM: Record<WorkPhase, number> = {
  planning: 0, execution: 1, validation: 2, review: 3,
};

/** WorkPhase → preferred zone types per environment */
const PHASE_ZONE_PREFS: Record<EnvironmentId, Record<WorkPhase, ZoneType[]>> = {
  office: {
    planning: ['planning_board', 'whiteboard_area'],
    execution: ['coding_desk'],
    validation: ['test_station', 'ci_monitor'],
    review: ['review_desk', 'pair_station'],
  },
  rocket: {
    planning: ['control_panel', 'planning_board'],
    execution: ['tool_bench', 'engine_bay', 'fuselage_work', 'fuel_station'],
    validation: ['launch_check', 'ci_monitor'],
    review: ['control_tower', 'comms'],
  },
  space_station: {
    planning: ['bridge_console'],
    execution: ['science_lab', 'engineering'],
    validation: ['test_station', 'engineering'],
    review: ['comms', 'observation', 'review_desk'],
  },
  farm: {
    planning: ['planning_board'],
    execution: ['crop_field', 'tractor_seat', 'animal_pen', 'water_station'],
    validation: ['harvest_check', 'water_station'],
    review: ['market_stand'],
  },
  hospital: {
    planning: ['patient_station', 'surgery_room'],
    execution: ['lab_bench'],
    validation: ['testing_bench', 'ci_monitor'],
    review: ['pharmacy', 'pharmacy_review', 'review_desk'],
  },
  pirate_ship: {
    planning: ['nav_table', 'planning_board'],
    execution: ['helm', 'rigging'],
    validation: ['cannon_post', 'lookout'],
    review: ['war_room', 'cargo_hold'],
  },
  town: {
    planning: ['planning_board', 'whiteboard_area', 'town_square'],
    execution: ['coding_desk', 'workshop_bench', 'shop_counter'],
    validation: ['test_station', 'ci_monitor', 'town_bench_zone'],
    review: ['review_desk', 'pair_station', 'tavern_seat'],
  },
};

/** Random messages for idle agents wandering in the common area */
const IDLE_MESSAGES = [
  'Just five more minutes...',
  'Organizing my desk...',
  'Reading the wiki...',
  'Thinking about lunch...',
  'Waiting for inspiration...',
  'Is it Friday yet?',
  'Almost ready to start...',
  'Looking for snacks...',
  'Contemplating existence...',
  'Pretending to be busy...',
  'Where was that file?',
  'Browsing the docs...',
  'Doodling in my notebook...',
  'Sharpening my pencil...',
  'Checking the weather...',
  'Reviewing old emails...',
  'Refilling my coffee...',
  'Taking a mental break...',
  'Reading patch notes...',
  'Stretching my legs...',
];

export class AgentTown {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private world: World;
  private renderer: Renderer;
  private engine: Engine;
  private agents = new Map<string, Agent>();
  private events = new Map<string, Set<EventCb<any>>>();
  private readonly tileSize = 16;
  private scale: number;
  private resizeObserver: ResizeObserver | null = null;
  private onAgentClickCb: ((id: string) => void) | null;

  private currentTheme: ThemeId;
  private currentSize: OfficeSize;
  private currentEnv: EnvironmentId;
  private autoSizeEnabled: boolean;
  private stageConfigs: StageConfig[];
  private currentRoomMode: RoomMode;

  private activityLog: ActivityEvent[] = [];
  private taskMap = new Map<string, Task>();
  private reviewMap = new Map<string, ReviewItem>();
  private objectiveMap = new Map<string, Objective>();
  private storyMap = new Map<string, Story>();
  private sprintMap = new Map<string, Sprint>();
  private milestoneMap = new Map<string, Milestone>();
  private nextEvtId = 0;
  private taskVizCache: TaskVisualizationData | null = null;
  private taskVizDirty = true;
  private flyingTasks: FlyingTask[] = [];
  private settings: TownSettings = {
    particleDensity: 'medium',
    animationSpeed: 1,
  };
  private workspaces = new Map<string, Workspace>();
  private activeWorkspaceId: string | null = null;

  constructor(config: TownConfig) {
    this.container = config.container;
    this.scale = config.scale ?? 3;
    this.onAgentClickCb = config.onAgentClick ?? null;
    this.currentTheme = config.theme ?? 'hybrid';
    this.currentSize = config.officeSize ?? 'small';
    this.currentEnv = config.environment ?? 'office';
    this.autoSizeEnabled = config.autoSize ?? false;
    this.stageConfigs = config.stages ? [...config.stages] : [...DEFAULT_STAGES];
    this.currentRoomMode = config.roomMode ?? 'environment';

    resetPaletteCounter();

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    this.container.appendChild(this.canvas);

    this.world = new World(this.currentSize, this.currentTheme, this.currentEnv, this.currentRoomMode, this.stageConfigs);
    this.renderer = new Renderer(
      this.canvas, this.world, this.scale, this.tileSize,
      this.currentTheme, this.currentEnv,
    );

    this.syncSize();
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(this.container);

    this.engine = new Engine();
    this.engine.onUpdate = dt => this.update(dt);
    this.engine.onRender = () => this.render();

    this.canvas.addEventListener('click', this.onClick);
    this.engine.start();
    this.emit('ready');
  }

  /* ── theme, size & environment ──────────────── */

  get theme(): ThemeId { return this.currentTheme; }
  get officeSize(): OfficeSize { return this.currentSize; }
  get environment(): EnvironmentId { return this.currentEnv; }

  setTheme(theme: ThemeId): void {
    this.currentTheme = theme;
    this.renderer.setTheme(theme);
    this.world.rebuild(this.currentSize, theme, this.currentEnv, this.currentRoomMode, this.stageConfigs);
    this.reassignAgents();
    this.syncSize();
    this.emit('themeChanged', theme);
  }

  setOfficeSize(size: OfficeSize): void {
    if (size === this.currentSize) return;
    this.currentSize = size;
    this.world.rebuild(size, this.currentTheme, this.currentEnv, this.currentRoomMode, this.stageConfigs);
    this.reassignAgents();
    this.syncSize();
  }

  setEnvironment(env: EnvironmentId): void {
    this.currentEnv = env;
    this.taskVizDirty = true;
    this.renderer.setEnvironment(env, this.currentTheme);
    this.world.rebuild(this.currentSize, this.currentTheme, env, this.currentRoomMode, this.stageConfigs);
    this.reassignAgents();
    this.syncSize();
  }

  /* ── stages & room mode (v0.3) ───────────────── */

  /** Get the current stage configurations */
  getStages(): StageConfig[] { return [...this.stageConfigs]; }

  /** Set custom kanban stages. Rebuilds world layout. @since 0.3.0 */
  setStages(stages: StageConfig[]): void {
    this.stageConfigs = [...stages];
    this.taskVizDirty = true;
    this.world.rebuild(this.currentSize, this.currentTheme, this.currentEnv, this.currentRoomMode, this.stageConfigs);
    this.reassignAgents();
    this.syncSize();
    this.emit('stagesChanged', this.stageConfigs);
  }

  /** Get the current room layout mode */
  getRoomMode(): RoomMode { return this.currentRoomMode; }

  /** Toggle between 'environment' (standard rooms) and 'kanban' (stage-based rooms). @since 0.3.0 */
  setRoomMode(mode: RoomMode): void {
    if (mode === this.currentRoomMode) return;
    this.currentRoomMode = mode;
    this.taskVizDirty = true;
    this.world.rebuild(this.currentSize, this.currentTheme, this.currentEnv, mode, this.stageConfigs);
    this.reassignAgents();
    this.syncSize();
    this.emit('roomModeChanged', mode);
  }

  /** Update visual/simulation settings */
  updateSettings(update: Partial<TownSettings>): void {
    Object.assign(this.settings, update);
  }

  getSettings(): TownSettings { return { ...this.settings }; }

  /* ── workspaces ───────────────────────────────── */

  addWorkspace(ws: Workspace): void {
    this.workspaces.set(ws.id, ws);
    this.emit('workspaceAdded', ws);
  }

  removeWorkspace(id: string): void {
    this.workspaces.delete(id);
    if (this.activeWorkspaceId === id) {
      this.activeWorkspaceId = null;
      this.applyWorkspaceFilter();
      this.emit('workspaceChanged', null);
    }
    this.emit('workspaceRemoved', id);
  }

  updateWorkspace(id: string, update: Partial<Workspace>): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    Object.assign(ws, update);
    if (this.activeWorkspaceId === id) this.applyWorkspaceFilter();
  }

  getWorkspaces(): Workspace[] { return [...this.workspaces.values()]; }
  getActiveWorkspaceId(): string | null { return this.activeWorkspaceId; }

  setActiveWorkspace(id: string | null): void {
    this.activeWorkspaceId = id;
    this.applyWorkspaceFilter();
    this.taskVizDirty = true;
    this.emit('workspaceChanged', id);
  }

  private applyWorkspaceFilter(): void {
    if (!this.activeWorkspaceId) {
      // Show all agents
      for (const agent of this.agents.values()) agent.visible = true;
      return;
    }
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) return;
    // Show only workspace agents
    const agentSet = new Set(ws.agentIds);
    for (const agent of this.agents.values()) {
      agent.visible = agentSet.has(agent.id);
    }
  }

  private reassignAgents(): void {
    resetPaletteCounter();
    const saved = [...this.agents.values()].map(a => ({
      id: a.id, name: a.name, status: a.userStatus, message: a.message ?? undefined, role: a.role, team: a.team,
    }));
    this.agents.clear();
    for (const cfg of saved) this.addAgent(cfg);
  }

  /* ── agents ─────────────────────────────────── */

  addAgent(cfg: AgentConfig): void {
    if (this.agents.has(cfg.id)) throw new Error(`Agent "${cfg.id}" already exists`);
    const agent = new Agent(cfg.id, cfg.name, this.world.spawnPoint, cfg.role, cfg.team);

    // Manager roles → prefer orchestrator corridor zones
    let zone: ReturnType<typeof this.world.getAvailableZone> = null;
    if (this.isManagerRole(agent)) {
      zone = this.world.zones.find(z => !z.assignedAgentId && z.roomId === AgentTown.ORCHESTRATOR_ROOM_ID) ?? null;
    }
    if (!zone) {
      zone = this.world.getAvailableZone();
    }

    if (zone) {
      agent.currentZoneId = zone.id;
      agent.currentZoneType = zone.type;
      this.world.assignZone(zone.id, cfg.id);
      const path = this.world.findPath(this.world.spawnPoint, zone.position);
      if (path.length > 10) {
        agent.portalTo(zone.position);
      } else if (path.length > 1) {
        agent.walkTo(path);
      } else {
        this.teleport(agent, zone.position);
      }
    }
    if (cfg.status) agent.setStatus(cfg.status, cfg.message);
    if (cfg.skills) agent.skills = cfg.skills;
    this.agents.set(cfg.id, agent);
    this.logActivity(cfg.id, 'system', `${cfg.name} joined the office`);
    this.emit('agentAdded', cfg.id);

    if (this.autoSizeEnabled) this.autoResize();
  }

  /**
   * Updates an agent's status, message, name, or hierarchy context.
   * Status changes trigger activity logging, particle effects, and room movement.
   *
   * @param id - Agent ID
   * @param update - Fields to update (all optional)
   * @since 0.1.0
   */
  updateAgent(id: string, update: AgentUpdate): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent "${id}" not found`);
    if (update.name !== undefined) agent.name = update.name;
    if (update.currentObjectiveId !== undefined) agent.currentObjectiveId = update.currentObjectiveId;
    if (update.currentStoryId !== undefined) agent.currentStoryId = update.currentStoryId;
    if (update.status !== undefined) {
      const oldActivity = agent.resolvedActivity;
      agent.setStatus(update.status, update.message);
      if (oldActivity !== agent.resolvedActivity) {
        this.logActivity(id, 'status_change',
          `${agent.name} → ${update.status}${update.message ? ': ' + update.message : ''}`);
        // Trigger particles on key transitions
        if (agent.resolvedActivity === 'success') {
          this.spawnEventParticles(agent, 'task_completed');
        } else if (agent.resolvedActivity === 'error') {
          this.spawnEventParticles(agent, 'error_burst');
        } else if (agent.resolvedActivity === 'waiting_approval') {
          this.spawnEventParticles(agent, 'review_submitted');
        } else if (oldActivity === 'idle' && agent.resolvedActivity !== 'idle') {
          this.spawnEventParticles(agent, 'task_picked');
        }
        // Trigger movement on activity change
        this.scheduleMovement(agent);
      }
    } else if (update.message !== undefined) {
      agent.message = update.message;
      agent.messageTimer = update.message ? 6 : 0;
      if (update.message) this.logActivity(id, 'message', `${agent.name}: ${update.message}`);
    }
    this.emit('agentUpdated', id);
  }

  removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    this.logActivity(id, 'system', `${agent.name} left the office`);
    this.world.freeZone(id);
    this.agents.delete(id);
    this.emit('agentRemoved', id);

    if (this.autoSizeEnabled) this.autoResize();
  }

  removeAllAgents(): void {
    for (const id of [...this.agents.keys()]) this.removeAgent(id);
  }

  getAgent(id: string): Agent | undefined { return this.agents.get(id); }
  getAgents(): Agent[] { return [...this.agents.values()]; }

  /* ── movement system ─────────────────────────── */

  /** Default mapping from activity to kanban stage ID for kanban room mode */
  private static readonly ACTIVITY_STAGE: Partial<Record<AgentActivity, string>> = {
    planning: 'todo', analyzing: 'todo', decomposing: 'todo',
    searching: 'todo', reading: 'todo', grepping: 'todo',
    coding: 'in_progress', generating: 'in_progress', refactoring: 'in_progress',
    testing: 'review', linting: 'review', validating: 'review',
    committing: 'review', pushing: 'review', deploying: 'review',
    reviewing: 'review', waiting_approval: 'review', blocked: 'review',
    success: 'done', idle: 'backlog',
  };

  /** Orchestrator room ID (matches world.ts corridor) */
  private static readonly ORCHESTRATOR_ROOM_ID = 9000;

  /** Manager roles are routed to the orchestrator corridor */
  private static readonly MANAGER_ROLES = /\b(lead|manager|director|architect|pm|scrum\s*master|cto|vp|head)\b/i;

  /** Check if an agent has a manager/leadership role */
  private isManagerRole(agent: Agent): boolean {
    if (!agent.role) return false;
    return AgentTown.MANAGER_ROLES.test(agent.role);
  }

  private getPreferredZoneTypes(_agent: Agent): ZoneType[] {
    return []; // kanban uses room index only
  }

  private getPhaseRoom(agent: Agent): number | null {
    // Manager agents → orchestrator corridor
    if (this.isManagerRole(agent)) {
      return AgentTown.ORCHESTRATOR_ROOM_ID;
    }

    const stageId = AgentTown.ACTIVITY_STAGE[agent.resolvedActivity];
    if (!stageId) return null;
    const idx = this.stageConfigs.findIndex(s => s.id === stageId);
    if (idx < 0) return null;
    // Town has room 0 = Town Square, stage rooms start at 1
    return this.currentEnv === 'town' ? idx + 1 : idx;
  }

  private scheduleMovement(agent: Agent): void {
    if (agent.isWalking) return;

    const preferred = this.getPreferredZoneTypes(agent);
    const targetRoom = this.getPhaseRoom(agent);
    const currentZone = agent.currentZoneId !== null
      ? this.world.zones.find(z => z.id === agent.currentZoneId)
      : null;
    const currentRoom = currentZone?.roomId ?? -1;

    // Priority 1: phase room + preferred zone type
    let target = targetRoom !== null
      ? this.world.zones.find(z =>
          !z.assignedAgentId && z.roomId === targetRoom &&
          preferred.includes(z.type),
        )
      : undefined;
    // Priority 2: any room + preferred zone type
    if (!target) {
      target = this.world.zones.find(z =>
        !z.assignedAgentId && z.id !== agent.currentZoneId &&
        preferred.includes(z.type),
      );
    }
    // Priority 3: phase room + any zone type
    if (!target && targetRoom !== null) {
      target = this.world.zones.find(z =>
        !z.assignedAgentId && z.roomId === targetRoom,
      );
    }
    // Priority 4: different room + any zone
    if (!target) {
      target = this.world.zones.find(z =>
        !z.assignedAgentId && z.roomId !== currentRoom,
      );
    }
    // Last resort: any available zone
    if (!target) {
      target = this.world.zones.find(z =>
        !z.assignedAgentId && z.id !== agent.currentZoneId,
      );
    }

    if (!target) return;

    if (agent.currentZoneId !== null) {
      this.world.freeZone(agent.id);
    }

    agent.currentZoneId = target.id;
    agent.currentZoneType = target.type;
    this.world.assignZone(target.id, agent.id);

    const start = { x: Math.round(agent.gridX), y: Math.round(agent.gridY) };
    const path = this.world.findPath(start, target.position);
    if (path.length > 10) {
      // Long distance — use portal teleportation
      agent.isAtDesk = false;
      agent.isRoaming = true;
      agent.portalTo(target.position);
      this.spawnEventParticles(agent, 'task_picked');
    } else if (path.length > 1) {
      agent.isAtDesk = false;
      agent.isRoaming = true;
      agent.walkTo(path);
    } else {
      this.teleport(agent, target.position);
    }

    agent.movementTimer = 8 + Math.random() * 7;
  }

  private autoResize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const ideal = getAutoSize(this.agents.size, rect.width * dpr, rect.height * dpr, this.tileSize);
    if (ideal !== this.currentSize) {
      this.setOfficeSize(ideal);
    }
  }

  /* ── activity log ───────────────────────────── */

  logActivity(agentId: string, type: ActivityEvent['type'], description: string): void {
    const agent = this.agents.get(agentId);
    const evt: ActivityEvent = {
      id: `evt-${this.nextEvtId++}`,
      timestamp: Date.now(),
      agentId,
      agentName: agent?.name ?? agentId,
      type,
      description,
    };
    this.activityLog.push(evt);
    if (this.activityLog.length > 500) this.activityLog.shift();
    this.emit('activity', evt);
  }

  getActivityLog(): ActivityEvent[] { return [...this.activityLog]; }
  clearActivityLog(): void { this.activityLog = []; }

  /* ── tasks / kanban ─────────────────────────── */

  /**
   * Creates a new task. Tasks can optionally belong to a story via `storyId`.
   * Orphan tasks (no storyId) are fully supported for backward compatibility.
   *
   * @param task - Task data (createdAt/updatedAt are auto-set)
   * @since 0.1.0
   */
  addTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): void {
    const full: Task = { ...task, createdAt: Date.now(), updatedAt: Date.now() };
    this.taskMap.set(task.id, full);
    this.taskVizDirty = true;
    this.logActivity(task.assigneeId ?? 'system', 'task_update', `Task created: ${task.title}`);
    this.emit('taskAdded', full);
    this.emit('taskUpdated', full);
    if (full.storyId) this.recomputeStoryProgress(full.storyId);
    if (full.assigneeId) this.recomputeAgentWorkload(full.assigneeId);
  }

  /**
   * Updates a task's fields. If stage changes, progress cascades upward
   * through story → objective → milestone automatically.
   *
   * @param id - Task ID
   * @param update - Partial fields to update
   * @since 0.1.0
   */
  updateTask(id: string, update: Partial<Task>): void {
    const task = this.taskMap.get(id);
    if (!task) return;
    const oldStage = task.stage;
    const oldAssignee = task.assigneeId;
    Object.assign(task, update, { updatedAt: Date.now() });
    this.taskVizDirty = true;
    this.logActivity(task.assigneeId ?? 'system', 'task_update',
      `Task "${task.title}" → ${task.stage}`);
    this.emit('taskUpdated', task);
    // Spawn flying task animation when stage changes
    if (oldStage !== task.stage) {
      this.spawnFlyingTask(task, oldStage);
    }
    // Cascade progress if stage changed and task belongs to a story
    if (task.storyId && oldStage !== task.stage) {
      this.recomputeStoryProgress(task.storyId);
    }
    if (oldAssignee && oldAssignee !== task.assigneeId) this.recomputeAgentWorkload(oldAssignee);
    if (task.assigneeId) this.recomputeAgentWorkload(task.assigneeId);
  }

  /**
   * Removes a task by ID. Cascades progress recomputation if task had a storyId.
   * @param id - Task ID
   * @since 0.2.0
   */
  removeTask(id: string): void {
    const task = this.taskMap.get(id);
    if (!task) return;
    this.taskMap.delete(id);
    this.taskVizDirty = true;
    this.emit('taskRemoved', id);
    if (task.storyId) this.recomputeStoryProgress(task.storyId);
    if (task.assigneeId) this.recomputeAgentWorkload(task.assigneeId);
  }

  getTasks(): Task[] { return [...this.taskMap.values()]; }
  getTasksByStage(stage: TaskStage): Task[] { return this.getTasks().filter(t => t.stage === stage); }

  /**
   * Returns all tasks belonging to a story.
   * @param storyId - Story ID
   * @since 0.2.0
   */
  getTasksByStory(storyId: string): Task[] {
    return this.getTasks().filter(t => t.storyId === storyId);
  }

  clearTasks(): void { this.taskMap.clear(); this.taskVizDirty = true; }

  /* ── objectives ──────────────────────────────── */

  /**
   * Creates a new objective. Progress is auto-computed from child stories.
   *
   * @param obj - Objective data (progress/createdAt/updatedAt are auto-set)
   * @since 0.2.0
   *
   * @example
   * ```ts
   * town.addObjective({
   *   id: 'obj-1',
   *   title: 'User Authentication',
   *   description: 'Complete auth flow with login, signup, and OAuth',
   *   status: 'active',
   *   priority: 'critical',
   *   sprintId: 'sprint-1',
   * });
   * ```
   */
  addObjective(obj: Omit<Objective, 'progress' | 'createdAt' | 'updatedAt'>): void {
    const full: Objective = { ...obj, progress: 0, createdAt: Date.now(), updatedAt: Date.now() };
    this.objectiveMap.set(obj.id, full);
    this.logActivity('system', 'system', `Objective created: ${obj.title}`);
    this.emit('objectiveAdded', full);
  }

  /**
   * Updates an objective's fields.
   * @param id - Objective ID
   * @param update - Partial fields to update
   * @since 0.2.0
   */
  updateObjective(id: string, update: Partial<Objective>): void {
    const obj = this.objectiveMap.get(id);
    if (!obj) return;
    Object.assign(obj, update, { updatedAt: Date.now() });
    this.emit('objectiveUpdated', obj);
  }

  /** Removes an objective by ID. @since 0.2.0 */
  removeObjective(id: string): void {
    if (!this.objectiveMap.has(id)) return;
    this.objectiveMap.delete(id);
    this.emit('objectiveRemoved', id);
  }

  getObjective(id: string): Objective | undefined { return this.objectiveMap.get(id); }
  getObjectives(): Objective[] { return [...this.objectiveMap.values()]; }

  /** Returns objectives filtered by status. @since 0.2.0 */
  getObjectivesByStatus(status: ObjectiveStatus): Objective[] {
    return this.getObjectives().filter(o => o.status === status);
  }

  clearObjectives(): void { this.objectiveMap.clear(); }

  /* ── stories ─────────────────────────────────── */

  /**
   * Creates a new story under an objective. Progress is auto-computed from child tasks.
   *
   * @param story - Story data (progress/createdAt/updatedAt are auto-set)
   * @since 0.2.0
   *
   * @example
   * ```ts
   * town.addStory({
   *   id: 'st-1',
   *   objectiveId: 'obj-1',
   *   title: 'Login/Signup Flow',
   *   description: 'Design and implement login form with validation',
   *   status: 'ready',
   *   priority: 'high',
   *   points: 5,
   * });
   * ```
   */
  addStory(story: Omit<Story, 'progress' | 'createdAt' | 'updatedAt'>): void {
    const full: Story = { ...story, progress: 0, createdAt: Date.now(), updatedAt: Date.now() };
    this.storyMap.set(story.id, full);
    this.logActivity('system', 'system', `Story created: ${story.title}`);
    this.emit('storyAdded', full);
    this.recomputeObjectiveProgress(story.objectiveId);
  }

  /**
   * Updates a story's fields.
   * @param id - Story ID
   * @param update - Partial fields to update
   * @since 0.2.0
   */
  updateStory(id: string, update: Partial<Story>): void {
    const story = this.storyMap.get(id);
    if (!story) return;
    Object.assign(story, update, { updatedAt: Date.now() });
    this.emit('storyUpdated', story);
    this.recomputeObjectiveProgress(story.objectiveId);
  }

  /** Removes a story by ID. @since 0.2.0 */
  removeStory(id: string): void {
    const story = this.storyMap.get(id);
    if (!story) return;
    this.storyMap.delete(id);
    this.emit('storyRemoved', id);
    this.recomputeObjectiveProgress(story.objectiveId);
  }

  getStory(id: string): Story | undefined { return this.storyMap.get(id); }
  getStories(): Story[] { return [...this.storyMap.values()]; }

  /** Returns all stories belonging to an objective. @since 0.2.0 */
  getStoriesByObjective(objectiveId: string): Story[] {
    return this.getStories().filter(s => s.objectiveId === objectiveId);
  }

  /** Returns stories filtered by status. @since 0.2.0 */
  getStoriesByStatus(status: StoryStatus): Story[] {
    return this.getStories().filter(s => s.status === status);
  }

  clearStories(): void { this.storyMap.clear(); }

  /* ── sprints ─────────────────────────────────── */

  /**
   * Creates a new sprint for time-boxed iteration grouping.
   *
   * @param sprint - Sprint data (createdAt is auto-set)
   * @since 0.2.0
   *
   * @example
   * ```ts
   * town.addSprint({
   *   id: 'sprint-1',
   *   name: 'Sprint 1 — MVP',
   *   goal: 'Ship authentication and dashboard',
   *   status: 'active',
   * });
   * ```
   */
  addSprint(sprint: Omit<Sprint, 'createdAt'>): void {
    const full: Sprint = { ...sprint, createdAt: Date.now() };
    this.sprintMap.set(sprint.id, full);
    this.logActivity('system', 'system', `Sprint created: ${sprint.name}`);
    this.emit('sprintAdded', full);
  }

  /** Updates a sprint's fields. @since 0.2.0 */
  updateSprint(id: string, update: Partial<Sprint>): void {
    const sprint = this.sprintMap.get(id);
    if (!sprint) return;
    Object.assign(sprint, update);
    this.emit('sprintUpdated', sprint);
  }

  /** Removes a sprint by ID. @since 0.2.0 */
  removeSprint(id: string): void { this.sprintMap.delete(id); }

  getSprint(id: string): Sprint | undefined { return this.sprintMap.get(id); }
  getSprints(): Sprint[] { return [...this.sprintMap.values()]; }

  /** Returns the first sprint with status 'active'. @since 0.2.0 */
  getActiveSprint(): Sprint | undefined {
    return this.getSprints().find(s => s.status === 'active');
  }

  clearSprints(): void { this.sprintMap.clear(); }

  /* ── milestones ──────────────────────────────── */

  /**
   * Creates a new milestone linking objectives to a deliverable target.
   *
   * @param ms - Milestone data (progress is auto-computed from linked objectives)
   * @since 0.2.0
   */
  addMilestone(ms: Omit<Milestone, 'progress'>): void {
    const full: Milestone = { ...ms, progress: 0 };
    this.milestoneMap.set(ms.id, full);
    this.recomputeMilestoneProgress(ms.id);
  }

  /** Updates a milestone's fields. @since 0.2.0 */
  updateMilestone(id: string, update: Partial<Milestone>): void {
    const ms = this.milestoneMap.get(id);
    if (!ms) return;
    Object.assign(ms, update);
    this.recomputeMilestoneProgress(id);
    this.emit('milestoneUpdated', ms);
  }

  /** Removes a milestone by ID. @since 0.2.0 */
  removeMilestone(id: string): void { this.milestoneMap.delete(id); }

  getMilestone(id: string): Milestone | undefined { return this.milestoneMap.get(id); }
  getMilestones(): Milestone[] { return [...this.milestoneMap.values()]; }
  clearMilestones(): void { this.milestoneMap.clear(); }

  /* ── aggregate queries ───────────────────────── */

  /**
   * Returns the full hierarchy tree for an objective: the objective itself,
   * its stories, and all tasks within each story.
   *
   * @param objectiveId - Objective ID
   * @since 0.2.0
   */
  getObjectiveTree(objectiveId: string): {
    objective: Objective;
    stories: Array<{ story: Story; tasks: Task[] }>;
  } | undefined {
    const objective = this.objectiveMap.get(objectiveId);
    if (!objective) return undefined;
    const stories = this.getStoriesByObjective(objectiveId).map(story => ({
      story,
      tasks: this.getTasksByStory(story.id),
    }));
    return { objective, stories };
  }

  /**
   * Returns burndown data for a sprint: total, completed, remaining tasks,
   * and overall progress percentage.
   *
   * @param sprintId - Sprint ID
   * @since 0.2.0
   */
  getSprintBurndown(sprintId: string): {
    totalTasks: number;
    completedTasks: number;
    remainingTasks: number;
    progressPercent: number;
  } {
    const objectives = this.getObjectives().filter(o => o.sprintId === sprintId);
    const storyIds = new Set<string>();
    for (const obj of objectives) {
      for (const story of this.getStoriesByObjective(obj.id)) {
        storyIds.add(story.id);
      }
    }
    const tasks = this.getTasks().filter(t => t.storyId && storyIds.has(t.storyId));
    const completedTasks = tasks.filter(t => t.stage === 'done').length;
    const totalTasks = tasks.length;
    return {
      totalTasks,
      completedTasks,
      remainingTasks: totalTasks - completedTasks,
      progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }

  /* ── progress computation (private) ──────────── */

  private recomputeStoryProgress(storyId: string): void {
    const story = this.storyMap.get(storyId);
    if (!story) return;
    const tasks = this.getTasksByStory(storyId);
    if (tasks.length === 0) { story.progress = 0; return; }
    const done = tasks.filter(t => t.stage === 'done').length;
    story.progress = done / tasks.length;
    story.updatedAt = Date.now();
    this.emit('storyUpdated', story);
    this.emit('progressChanged', 'story', storyId, story.progress);
    // Auto-complete story when all tasks done
    if (story.progress >= 1 && story.status !== 'done') {
      story.status = 'done';
      this.logActivity('system', 'system', `Story completed: ${story.title}`);
    }
    // Cascade to objective
    this.recomputeObjectiveProgress(story.objectiveId);
  }

  private recomputeObjectiveProgress(objectiveId: string): void {
    const obj = this.objectiveMap.get(objectiveId);
    if (!obj) return;
    const stories = this.getStoriesByObjective(objectiveId);
    if (stories.length === 0) { obj.progress = 0; return; }
    // Weight by story points if available
    const hasPoints = stories.some(s => s.points !== undefined);
    if (hasPoints) {
      const totalPoints = stories.reduce((sum, s) => sum + (s.points ?? 1), 0);
      const donePoints = stories.reduce((sum, s) => sum + (s.progress * (s.points ?? 1)), 0);
      obj.progress = totalPoints > 0 ? donePoints / totalPoints : 0;
    } else {
      obj.progress = stories.reduce((sum, s) => sum + s.progress, 0) / stories.length;
    }
    obj.updatedAt = Date.now();
    this.emit('objectiveUpdated', obj);
    this.emit('progressChanged', 'objective', objectiveId, obj.progress);
    // Auto-complete objective when all stories done
    if (obj.progress >= 1 && obj.status !== 'completed') {
      obj.status = 'completed';
      this.logActivity('system', 'system', `Objective completed: ${obj.title}`);
    }
    // Cascade to milestones
    for (const ms of this.milestoneMap.values()) {
      if (ms.objectiveIds.includes(objectiveId)) {
        this.recomputeMilestoneProgress(ms.id);
      }
    }
  }

  private recomputeMilestoneProgress(milestoneId: string): void {
    const ms = this.milestoneMap.get(milestoneId);
    if (!ms || ms.objectiveIds.length === 0) return;
    let total = 0;
    for (const objId of ms.objectiveIds) {
      const obj = this.objectiveMap.get(objId);
      total += obj?.progress ?? 0;
    }
    ms.progress = total / ms.objectiveIds.length;
    this.emit('milestoneUpdated', ms);
    this.emit('progressChanged', 'milestone', milestoneId, ms.progress);
  }

  private recomputeAgentWorkload(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const tasks = this.getTasks().filter(t => t.assigneeId === agentId);
    agent.activeTaskCount = tasks.filter(t => t.stage !== 'done' && t.stage !== 'backlog').length;
    agent.completedTaskCount = tasks.filter(t => t.stage === 'done').length;
  }

  /* ── reviews ────────────────────────────────── */

  addReview(review: Omit<ReviewItem, 'status' | 'createdAt'>): void {
    const full: ReviewItem = { ...review, status: 'pending', createdAt: Date.now() };
    this.reviewMap.set(review.id, full);
    this.logActivity(review.agentId, 'review_request', review.title);
    this.emit('reviewAdded', full);
  }

  resolveReview(id: string, status: 'approved' | 'rejected'): void {
    const r = this.reviewMap.get(id);
    if (r) {
      r.status = status;
      this.logActivity(r.agentId, 'system', `Review "${r.title}" ${status}`);
      const agent = this.agents.get(r.agentId);
      if (agent) {
        this.spawnEventParticles(agent, status === 'approved' ? 'review_approved' : 'review_rejected');
      }
    }
  }

  getReviews(): ReviewItem[] { return [...this.reviewMap.values()]; }
  getPendingReviews(): ReviewItem[] { return this.getReviews().filter(r => r.status === 'pending'); }
  clearReviews(): void { this.reviewMap.clear(); }

  /* ── events ─────────────────────────────────── */

  on<K extends EventKey>(event: K, cb: EventCb<K>): void {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event)!.add(cb);
  }
  off<K extends EventKey>(event: K, cb: EventCb<K>): void {
    this.events.get(event)?.delete(cb);
  }
  private emit<K extends EventKey>(event: K, ...args: TownEventMap[K]): void {
    this.events.get(event)?.forEach(cb => (cb as (...a: unknown[]) => void)(...args));
  }

  /* ── lifecycle ──────────────────────────────── */

  destroy(): void {
    this.engine.stop();
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.remove();
    this.agents.clear();
    this.events.clear();
  }

  /* ── internals ──────────────────────────────── */

  private spawnEventParticles(agent: Agent, eventType: ParticleEventType): void {
    this.renderer.spawnEventParticles(agent.gridX, agent.gridY, eventType);
  }

  private teleport(agent: Agent, pos: { x: number; y: number }): void {
    agent.x = pos.x; agent.y = pos.y;
    agent.gridX = pos.x; agent.gridY = pos.y;
    agent.isAtDesk = true;
    // Face the zone's direction
    const zone = this.world.zones.find(z => z.id === agent.currentZoneId);
    if (zone) agent.direction = zone.facingDirection;
  }

  /** Force a resize recalculation (e.g. after sidebar toggle) */
  resize(): void { this.syncSize(); }

  private syncSize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr, h = rect.height * dpr;
    this.renderer.resize(w, h);
    // Fractional scale — fill the container edge-to-edge (minus 4px padding per side)
    const worldW = this.world.gridWidth * this.tileSize;
    const worldH = this.world.gridHeight * this.tileSize;
    this.scale = Math.max(1, Math.min((w - 8) / worldW, (h - 8) / worldH));
    this.renderer.setScale(this.scale);
  }

  private update(dt: number): void {
    for (const agent of this.agents.values()) {
      const was = agent.isWalking;
      const wasPortaling = agent.portalState !== 'none';
      agent.update(dt);

      // Agent arrived at destination (from walking)
      if (was && !agent.isWalking && agent.currentZoneId !== null) {
        agent.isAtDesk = true;
        agent.isRoaming = false;
        const zone = this.world.zones.find(z => z.id === agent.currentZoneId);
        if (zone) agent.direction = zone.facingDirection;
      }

      // Agent arrived at destination (from portal)
      if (wasPortaling && agent.portalState === 'none' && agent.currentZoneId !== null) {
        agent.isAtDesk = true;
        agent.isRoaming = false;
        const zone = this.world.zones.find(z => z.id === agent.currentZoneId);
        if (zone) agent.direction = zone.facingDirection;
        this.spawnEventParticles(agent, 'task_picked');
      }

      // Tick social action timers
      if (agent.socialAction !== 'none') {
        agent.socialTimer -= dt;
        if (agent.socialTimer <= 0) {
          this.endSocialAction(agent);
        }
      }

      // Periodic roaming — idle agents move much more frequently
      if (!agent.isWalking && agent.portalState === 'none' && agent.isAtDesk && agent.socialAction === 'none') {
        agent.movementTimer -= dt;
        if (agent.movementTimer <= 0) {
          this.scheduleMovement(agent);
          // Idle agents roam quickly (3-6s), working agents roam slowly (8-15s)
          if (agent.resolvedActivity === 'idle') {
            agent.movementTimer = 3 + Math.random() * 3;
          }
        }
      }

      // Coffee break timer (only for agents at desks doing work)
      if (!agent.isWalking && agent.portalState === 'none' && agent.isAtDesk && agent.socialAction === 'none') {
        agent.coffeeBreakTimer -= dt;
        if (agent.coffeeBreakTimer <= 0) {
          this.startCoffeeBreak(agent);
          agent.coffeeBreakTimer = 30 + Math.random() * 20;
        }
      }

      // Try to start pair conversation (any at-desk agent, not just idle)
      if (!agent.isWalking && agent.portalState === 'none' && agent.isAtDesk && agent.socialAction === 'none'
          && Math.random() < dt * 0.08) {
        this.tryStartConversation(agent);
      }

      // Auto high-five: small chance per frame for at-desk agents near others
      if (!agent.isWalking && agent.portalState === 'none' && agent.isAtDesk
          && agent.socialAction === 'none' && Math.random() < dt * 0.01) {
        for (const other of this.agents.values()) {
          if (other.id === agent.id || other.isWalking || other.socialAction !== 'none') continue;
          const dist = Math.abs(other.gridX - agent.gridX) + Math.abs(other.gridY - agent.gridY);
          if (dist <= 4) {
            this.triggerHighFive(agent);
            break;
          }
        }
      }

      // Random stretching at desk
      if (!agent.isWalking && agent.portalState === 'none' && agent.isAtDesk
          && agent.socialAction === 'none' && Math.random() < dt * 0.005) {
        agent.socialAction = 'stretching';
        agent.socialTimer = 2 + Math.random() * 1;
        agent.message = 'Stretching...';
        agent.messageTimer = 2;
      }

      // Welding sparks for rocket assembly agents
      if (this.currentEnv === 'rocket' && !agent.isWalking && agent.isAtDesk
          && agent.socialAction === 'none') {
        const zt = agent.currentZoneType;
        if ((zt === 'engine_bay' || zt === 'fuselage_work' || zt === 'tool_bench')
            && Math.random() < dt * 0.5) {
          this.renderer.spawnWeldingSparks(agent.gridX, agent.gridY);
        }
      }

      // Idle agent procrastination messages
      if (agent.resolvedActivity === 'idle' && !agent.isWalking
          && agent.portalState === 'none' && agent.socialAction === 'none') {
        agent.idleMessageTimer -= dt;
        if (agent.idleMessageTimer <= 0) {
          agent.message = IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)];
          agent.messageTimer = 3 + Math.random() * 2;
          agent.idleMessageTimer = 5 + Math.random() * 8;
        }
      }

      // Multi-task agents periodically portal-jump between rooms
      if (!agent.isWalking && agent.portalState === 'none' && agent.isAtDesk
          && agent.socialAction === 'none' && agent.activeTaskCount > 1) {
        if (Math.random() < dt * 0.08) { // ~8% per second → roughly every 12s
          this.checkMultiTaskPortal(agent);
        }
      }
    }
    this.renderer.updateParticles(dt);

    // Update flying task animations
    for (let i = this.flyingTasks.length - 1; i >= 0; i--) {
      const ft = this.flyingTasks[i];
      ft.progress += dt / ft.duration;
      if (ft.progress >= 1) {
        this.renderer.spawnEventParticles(Math.round(ft.toGX), Math.round(ft.toGY), 'task_picked');
        this.flyingTasks.splice(i, 1);
      }
    }

  }

  private endSocialAction(agent: Agent): void {
    const wasAction = agent.socialAction;
    agent.socialAction = 'none';
    agent.socialTimer = 0;
    agent.message = null;

    // If partner exists, end their social action too
    if (agent.socialPartnerId) {
      const partner = this.agents.get(agent.socialPartnerId);
      if (partner && partner.socialAction !== 'none') {
        partner.socialAction = 'none';
        partner.socialTimer = 0;
        partner.socialPartnerId = null;
        partner.message = null;
      }
      agent.socialPartnerId = null;
    }

    // Reset movement timer to avoid immediate re-trigger
    agent.movementTimer = 4 + Math.random() * 5;

    // High-five confetti burst
    if (wasAction === 'high_five') {
      this.renderer.spawnEventParticles(agent.gridX, agent.gridY, 'task_completed');
    }
  }

  private startCoffeeBreak(agent: Agent): void {
    // Find a coffee or water_cooler zone
    const coffeeZones = this.world.zones.filter(z =>
      (z.type === 'break_area' || z.type === 'town_bench_zone' || z.type === 'town_square')
      && !z.assignedAgentId
    );
    if (coffeeZones.length === 0) {
      // Just do an in-place stretch instead
      agent.socialAction = 'stretching';
      agent.socialTimer = 2;
      agent.message = 'Stretching...';
      agent.messageTimer = 2;
      return;
    }
    agent.socialAction = 'coffee_break';
    agent.socialTimer = 4 + Math.random() * 2;
    agent.message = 'Coffee break ☕';
    agent.messageTimer = 5;
  }

  private tryStartConversation(agent: Agent): void {
    // Find nearby agents (any team) for spontaneous conversation
    const nearby: Agent[] = [];
    for (const other of this.agents.values()) {
      if (other.id === agent.id) continue;
      if (other.isWalking || other.socialAction !== 'none') continue;
      const dist = Math.abs(other.gridX - agent.gridX) + Math.abs(other.gridY - agent.gridY);
      if (dist <= 8) nearby.push(other);
    }
    if (nearby.length === 0) return;

    const partner = nearby[Math.floor(Math.random() * nearby.length)];
    const duration = 4 + Math.random() * 4;

    // Both agents start chatting
    agent.socialAction = 'chatting';
    agent.socialTimer = duration;
    agent.socialPartnerId = partner.id;
    agent.message = `Discussing ${agent.currentObjectiveId ? 'sprint' : 'ideas'}...`;
    agent.messageTimer = duration;

    partner.socialAction = 'chatting';
    partner.socialTimer = duration;
    partner.socialPartnerId = agent.id;
    partner.message = 'Chatting...';
    partner.messageTimer = duration;

    // Face each other
    if (partner.gridX > agent.gridX) {
      agent.direction = 'right';
      partner.direction = 'left';
    } else if (partner.gridX < agent.gridX) {
      agent.direction = 'left';
      partner.direction = 'right';
    } else if (partner.gridY > agent.gridY) {
      agent.direction = 'down';
      partner.direction = 'up';
    } else {
      agent.direction = 'up';
      partner.direction = 'down';
    }
  }

  /** Called when a task completes — triggers high-five between agents */
  private triggerHighFive(agent: Agent): void {
    // Find nearest teammate
    let closest: Agent | null = null;
    let closestDist = Infinity;
    for (const other of this.agents.values()) {
      if (other.id === agent.id || other.isWalking || other.socialAction !== 'none') continue;
      const dist = Math.abs(other.gridX - agent.gridX) + Math.abs(other.gridY - agent.gridY);
      if (dist < closestDist && dist <= 6) {
        closestDist = dist;
        closest = other;
      }
    }

    agent.socialAction = 'high_five';
    agent.socialTimer = 2;
    agent.message = 'Task done! 🎉';
    agent.messageTimer = 3;

    if (closest) {
      closest.socialAction = 'high_five';
      closest.socialTimer = 2;
      closest.socialPartnerId = agent.id;
      closest.message = 'Nice work!';
      closest.messageTimer = 3;
      agent.socialPartnerId = closest.id;
    }

    this.renderer.spawnEventParticles(agent.gridX, agent.gridY, 'task_completed');
  }

  /* ── task visualization ────────────────────── */

  private spawnFlyingTask(task: Task, oldStage: TaskStage): void {
    // Find source and destination room centers
    const srcIdx = this.stageConfigs.findIndex(s => s.id === oldStage);
    const dstIdx = this.stageConfigs.findIndex(s => s.id === task.stage);
    if (srcIdx < 0 || dstIdx < 0) return;

    const srcRoomIdx = this.currentEnv === 'town' ? srcIdx + 1 : srcIdx;
    const dstRoomIdx = this.currentEnv === 'town' ? dstIdx + 1 : dstIdx;
    const srcRoom = this.world.rooms.find(r => r.id === srcRoomIdx);
    const dstRoom = this.world.rooms.find(r => r.id === dstRoomIdx);
    if (!srcRoom || !dstRoom) return;

    const fromGX = srcRoom.bounds.x + srcRoom.bounds.w / 2;
    const fromGY = srcRoom.bounds.y + srcRoom.bounds.h / 2;
    const toGX = dstRoom.bounds.x + dstRoom.bounds.w / 2;
    const toGY = dstRoom.bounds.y + dstRoom.bounds.h / 2;

    this.flyingTasks.push({
      taskId: task.id,
      title: task.title,
      priority: task.priority,
      fromGX, fromGY,
      toGX, toGY,
      progress: 0,
      duration: 1.5,
    });
  }

  private computeTaskVisualization(): TaskVisualizationData {
    if (this.taskVizCache && !this.taskVizDirty) return this.taskVizCache;

    const items: TaskItemRenderData[] = [];
    const overflows: RoomOverflow[] = [];
    const stageCounts: RoomTaskCount[] = [];
    let completionBag: CompletionBagRenderData | null = null;

    // Filter tasks by active workspace if set
    const ws = this.activeWorkspaceId ? this.workspaces.get(this.activeWorkspaceId) : null;
    const wsAgentSet = ws ? new Set(ws.agentIds) : null;
    const wsStorySet = ws?.taskFilter?.storyIds ? new Set(ws.taskFilter.storyIds) : null;

    for (let si = 0; si < this.stageConfigs.length; si++) {
      const stage = this.stageConfigs[si];
      let stageTasks = this.getTasksByStage(stage.id);
      // Apply workspace filter
      if (wsAgentSet || wsStorySet) {
        stageTasks = stageTasks.filter(t => {
          if (wsStorySet && t.storyId && wsStorySet.has(t.storyId)) return true;
          if (wsAgentSet && t.assigneeId && wsAgentSet.has(t.assigneeId)) return true;
          return !wsAgentSet && !wsStorySet;
        });
      }
      // Room index: town env has +1 offset for Town Square (room 0)
      const roomIdx = this.currentEnv === 'town' ? si + 1 : si;
      const room = this.world.rooms.find(r => r.id === roomIdx);
      if (!room) continue;

      // Track task count for background display (all rooms including done)
      stageCounts.push({
        roomId: roomIdx,
        count: stageTasks.length,
        bounds: room.bounds,
      });

      // Always set completionBag for done stage (even with 0 tasks)
      // Position at bottom-center so pixel art grows upward
      if (stage.id === 'done') {
        completionBag = {
          count: stageTasks.length,
          gridX: room.bounds.x + Math.floor(room.bounds.w / 2),
          gridY: room.bounds.y + room.bounds.h - 2,
          roomH: room.bounds.h,
          roomX: room.bounds.x,
          roomW: room.bounds.w,
        };
        // Fall through to also render task items in the top half
      }

      if (stageTasks.length === 0) continue;

      const positions = this.computeItemPositions(room, stageTasks.length);
      const hasOverflow = stageTasks.length > positions.length;
      // If overflow, reserve the last slot for the "+" marker
      const renderCount = hasOverflow ? positions.length - 1 : positions.length;

      for (let i = 0; i < renderCount; i++) {
        const task = stageTasks[i];
        const pos = positions[i];

        const isBeingWorked = !!(task.assigneeId && this.isAgentInRoom(task.assigneeId, roomIdx));

        items.push({
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          assigneeId: task.assigneeId,
          stage: task.stage,
          gridX: pos.x,
          gridY: pos.y,
          isBeingWorked,
        });
      }

      if (hasOverflow) {
        const lastPos = positions[positions.length - 1];
        overflows.push({
          roomId: roomIdx,
          count: stageTasks.length - renderCount,
          gridX: lastPos.x,
          gridY: lastPos.y,
        });
      }
    }

    this.taskVizCache = { items, completionBag, flyingTasks: this.flyingTasks, overflows, stageCounts };
    this.taskVizDirty = false;
    return this.taskVizCache;
  }

  private computeItemPositions(room: { id: number; bounds: { x: number; y: number; w: number; h: number } }, count: number): Position[] {
    const positions: Position[] = [];
    const occupied = new Set<string>();

    // Mark zone positions and desk positions as occupied
    for (const zone of this.world.zones) {
      if (zone.roomId === room.id) {
        occupied.add(`${zone.position.x},${zone.position.y}`);
        // Mark desk tiles (above the zone)
        occupied.add(`${zone.position.x},${zone.position.y - 1}`);
        occupied.add(`${zone.position.x + 1},${zone.position.y - 1}`);
      }
    }

    // Tasks fill the top half of the room, stopping 1 row before the corridor.
    const endY = room.bounds.y + Math.floor(room.bounds.h / 2) - 1;
    for (let y = room.bounds.y; y < endY && positions.length < count; y++) {
      for (let x = room.bounds.x; x < room.bounds.x + room.bounds.w && positions.length < count; x++) {
        const key = `${x},${y}`;
        if (occupied.has(key)) continue;
        if (!this.world.tiles[y]?.[x]?.walkable) continue;
        positions.push({ x, y });
      }
    }
    return positions;
  }

  private isAgentInRoom(agentId: string, roomId: number): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    const zone = agent.currentZoneId !== null
      ? this.world.zones.find(z => z.id === agent.currentZoneId)
      : null;
    return zone?.roomId === roomId;
  }

  /** Multi-task agents portal-jump between rooms with different tasks */
  private checkMultiTaskPortal(agent: Agent): void {
    if (this.currentRoomMode !== 'kanban') return;
    if (agent.isWalking || agent.portalState !== 'none') return;
    if (agent.resolvedActivity === 'idle') return;

    const agentTasks = this.getTasks().filter(t =>
      t.assigneeId === agent.id && t.stage !== 'done' && t.stage !== 'backlog',
    );
    if (agentTasks.length <= 1) return;

    // Determine which rooms these tasks are in
    const taskRooms = new Set<number>();
    for (const task of agentTasks) {
      const stageIdx = this.stageConfigs.findIndex(s => s.id === task.stage);
      if (stageIdx < 0) continue;
      const roomIdx = this.currentEnv === 'town' ? stageIdx + 1 : stageIdx;
      taskRooms.add(roomIdx);
    }
    if (taskRooms.size <= 1) return;

    // Pick a different room from current
    const currentZone = agent.currentZoneId !== null
      ? this.world.zones.find(z => z.id === agent.currentZoneId) : null;
    const currentRoom = currentZone?.roomId ?? -1;
    const roomArr = [...taskRooms].filter(r => r !== currentRoom);
    if (roomArr.length === 0) return;

    const targetRoom = roomArr[Math.floor(Math.random() * roomArr.length)];
    const target = this.world.zones.find(z => !z.assignedAgentId && z.roomId === targetRoom);
    if (!target) return;

    // Free current zone and portal to new one
    if (agent.currentZoneId !== null) this.world.freeZone(agent.id);
    agent.currentZoneId = target.id;
    agent.currentZoneType = target.type;
    this.world.assignZone(target.id, agent.id);
    agent.isAtDesk = false;
    agent.isRoaming = true;
    agent.portalTo(target.position);
    this.taskVizDirty = true;
    this.spawnEventParticles(agent, 'task_picked');
  }

  private render(): void {
    const taskViz = this.computeTaskVisualization();
    this.renderer.render([...this.agents.values()], taskViz);
  }

  private onClick = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const agent = this.renderer.getAgentAt(x, y, [...this.agents.values()]);
    if (agent) {
      this.onAgentClickCb?.(agent.id);
      this.emit('agentClick', agent.id);
    }
  };
}
