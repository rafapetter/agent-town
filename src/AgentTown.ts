import type {
  AgentConfig, AgentUpdate, TownConfig, TownEventMap,
  ThemeId, OfficeSize, EnvironmentId, ActivityEvent, Task, TaskStage, ReviewItem,
  ZoneType,
} from './types';
import { Agent, resetPaletteCounter } from './agent';
import { World } from './world';
import { Renderer } from './renderer';
import { Engine } from './engine';
import { getAutoSize } from './themes';

type EventKey = keyof TownEventMap;
type EventCb<K extends EventKey> = (...args: TownEventMap[K]) => void;

/** Status → preferred zone type per environment */
const ZONE_PREFS: Record<EnvironmentId, Record<string, ZoneType[]>> = {
  office: {
    typing: ['desk'],
    thinking: ['whiteboard_area', 'meeting'],
    reading: ['break_area', 'meeting'],
    idle: ['break_area', 'whiteboard_area', 'desk'],
  },
  rocket: {
    typing: ['control_panel', 'tool_bench'],
    thinking: ['control_panel', 'fuel_station'],
    reading: ['tool_bench', 'fuel_station'],
    idle: ['engine_bay', 'fuselage_work', 'tool_bench'],
  },
  space_station: {
    typing: ['bridge_console', 'science_lab'],
    thinking: ['observation', 'science_lab'],
    reading: ['science_lab', 'engineering'],
    idle: ['comms', 'observation', 'bridge_console'],
  },
  farm: {
    typing: ['barn_workshop'],
    thinking: ['crop_field', 'water_station'],
    reading: ['barn_workshop', 'water_station'],
    idle: ['tractor_seat', 'animal_pen', 'crop_field'],
  },
  hospital: {
    typing: ['reception', 'lab_bench'],
    thinking: ['lab_bench', 'pharmacy'],
    reading: ['pharmacy', 'lab_bench'],
    idle: ['patient_station', 'surgery_room', 'reception'],
  },
  pirate_ship: {
    typing: ['nav_table', 'helm'],
    thinking: ['helm', 'nav_table'],
    reading: ['cargo_hold', 'nav_table'],
    idle: ['rigging', 'cannon_post', 'cargo_hold'],
  },
};

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

  private activityLog: ActivityEvent[] = [];
  private taskMap = new Map<string, Task>();
  private reviewMap = new Map<string, ReviewItem>();
  private nextEvtId = 0;

  constructor(config: TownConfig) {
    this.container = config.container;
    this.scale = config.scale ?? 3;
    this.onAgentClickCb = config.onAgentClick ?? null;
    this.currentTheme = config.theme ?? 'hybrid';
    this.currentSize = config.officeSize ?? 'small';
    this.currentEnv = config.environment ?? 'office';
    this.autoSizeEnabled = config.autoSize ?? false;

    resetPaletteCounter();

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    this.container.appendChild(this.canvas);

    this.world = new World(this.currentSize, this.currentTheme, this.currentEnv);
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
    this.world.rebuild(this.currentSize, theme, this.currentEnv);
    this.reassignAgents();
    this.syncSize();
    this.emit('themeChanged', theme);
  }

  setOfficeSize(size: OfficeSize): void {
    if (size === this.currentSize) return;
    this.currentSize = size;
    this.world.rebuild(size, this.currentTheme, this.currentEnv);
    this.reassignAgents();
    this.syncSize();
  }

  setEnvironment(env: EnvironmentId): void {
    this.currentEnv = env;
    this.renderer.setEnvironment(env, this.currentTheme);
    this.world.rebuild(this.currentSize, this.currentTheme, env);
    this.reassignAgents();
    this.syncSize();
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
    const zone = this.world.getAvailableZone();
    if (zone) {
      agent.currentZoneId = zone.id;
      agent.currentZoneType = zone.type;
      this.world.assignZone(zone.id, cfg.id);
      const path = this.world.findPath(this.world.spawnPoint, zone.position);
      if (path.length > 1) agent.walkTo(path);
      else this.teleport(agent, zone.position);
    }
    if (cfg.status) agent.setStatus(cfg.status, cfg.message);
    this.agents.set(cfg.id, agent);
    this.logActivity(cfg.id, 'system', `${cfg.name} joined the office`);
    this.emit('agentAdded', cfg.id);

    if (this.autoSizeEnabled) this.autoResize();
  }

  updateAgent(id: string, update: AgentUpdate): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent "${id}" not found`);
    if (update.name !== undefined) agent.name = update.name;
    if (update.status !== undefined) {
      const old = agent.userStatus;
      agent.setStatus(update.status, update.message);
      if (old !== update.status) {
        this.logActivity(id, 'status_change',
          `${agent.name} → ${update.status}${update.message ? ': ' + update.message : ''}`);
        // Trigger movement on status change
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

  private getPreferredZoneTypes(agent: Agent): ZoneType[] {
    const prefs = ZONE_PREFS[this.currentEnv];
    return prefs[agent.userStatus] ?? prefs.idle ?? [];
  }

  private scheduleMovement(agent: Agent): void {
    if (agent.isWalking) return;

    const preferred = this.getPreferredZoneTypes(agent);
    // Try to find an available zone of a preferred type, ideally in a different room
    const currentZone = agent.currentZoneId !== null
      ? this.world.zones.find(z => z.id === agent.currentZoneId)
      : null;
    const currentRoom = currentZone?.roomId ?? -1;

    // First try: different room, preferred type
    let target = this.world.zones.find(z =>
      !z.assignedAgentId && z.roomId !== currentRoom &&
      preferred.includes(z.type),
    );
    // Second try: any room, preferred type
    if (!target) {
      target = this.world.zones.find(z =>
        !z.assignedAgentId && z.id !== agent.currentZoneId &&
        preferred.includes(z.type),
      );
    }
    // Third try: any available zone in different room
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

    // Free current zone
    if (agent.currentZoneId !== null) {
      this.world.freeZone(agent.id);
    }

    // Assign new zone
    agent.currentZoneId = target.id;
    agent.currentZoneType = target.type;
    this.world.assignZone(target.id, agent.id);

    const start = { x: Math.round(agent.gridX), y: Math.round(agent.gridY) };
    const path = this.world.findPath(start, target.position);
    if (path.length > 1) {
      agent.isAtDesk = false;
      agent.isRoaming = true;
      agent.walkTo(path);
    } else {
      this.teleport(agent, target.position);
    }

    agent.movementTimer = 15 + Math.random() * 20;
  }

  private autoResize(): void {
    const ideal = getAutoSize(this.agents.size);
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

  addTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): void {
    const full: Task = { ...task, createdAt: Date.now(), updatedAt: Date.now() };
    this.taskMap.set(task.id, full);
    this.logActivity(task.assigneeId ?? 'system', 'task_update', `Task created: ${task.title}`);
    this.emit('taskUpdated', full);
  }

  updateTask(id: string, update: Partial<Task>): void {
    const task = this.taskMap.get(id);
    if (!task) return;
    Object.assign(task, update, { updatedAt: Date.now() });
    this.logActivity(task.assigneeId ?? 'system', 'task_update',
      `Task "${task.title}" → ${task.stage}`);
    this.emit('taskUpdated', task);
  }

  getTasks(): Task[] { return [...this.taskMap.values()]; }
  getTasksByStage(stage: TaskStage): Task[] { return this.getTasks().filter(t => t.stage === stage); }
  clearTasks(): void { this.taskMap.clear(); }

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

  private teleport(agent: Agent, pos: { x: number; y: number }): void {
    agent.x = pos.x; agent.y = pos.y;
    agent.gridX = pos.x; agent.gridY = pos.y;
    agent.isAtDesk = true;
    // Face the zone's direction
    const zone = this.world.zones.find(z => z.id === agent.currentZoneId);
    if (zone) agent.direction = zone.facingDirection;
  }

  private syncSize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr, h = rect.height * dpr;
    this.renderer.resize(w, h);
    // Use the small grid as reference so scale stays constant across all sizes
    const refW = 24 * this.tileSize; // small grid width
    const refH = 16 * this.tileSize; // small grid height
    this.scale = Math.max(1, Math.floor(Math.min(w / refW, h / refH) * 0.9));
    this.renderer.setScale(this.scale);
  }

  private update(dt: number): void {
    for (const agent of this.agents.values()) {
      const was = agent.isWalking;
      agent.update(dt);

      // Agent arrived at destination
      if (was && !agent.isWalking && agent.currentZoneId !== null) {
        agent.isAtDesk = true;
        agent.isRoaming = false;
        const zone = this.world.zones.find(z => z.id === agent.currentZoneId);
        if (zone) agent.direction = zone.facingDirection;
      }

      // Periodic roaming for idle agents
      if (!agent.isWalking && agent.isAtDesk) {
        agent.movementTimer -= dt;
        if (agent.movementTimer <= 0) {
          this.scheduleMovement(agent);
        }
      }
    }
    this.renderer.updateParticles(dt);
  }

  private render(): void {
    this.renderer.render([...this.agents.values()]);
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
