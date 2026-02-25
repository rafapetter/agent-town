import type {
  AgentConfig, AgentUpdate, TownConfig, TownEventMap,
  ThemeId, OfficeSize, EnvironmentId, ActivityEvent, Task, TaskStage, ReviewItem,
} from './types';
import { Agent, resetPaletteCounter } from './agent';
import { World } from './world';
import { Renderer } from './renderer';
import { Engine } from './engine';

type EventKey = keyof TownEventMap;
type EventCb<K extends EventKey> = (...args: TownEventMap[K]) => void;

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
    const ws = this.world.getAvailableWorkstation();
    if (ws) {
      agent.workstationId = ws.id;
      this.world.assignWorkstation(ws.id, cfg.id);
      const path = this.world.findPath(this.world.spawnPoint, ws.chairPosition);
      if (path.length > 1) agent.walkTo(path);
      else this.teleport(agent, ws.chairPosition);
    }
    if (cfg.status) agent.setStatus(cfg.status, cfg.message);
    this.agents.set(cfg.id, agent);
    this.logActivity(cfg.id, 'system', `${cfg.name} joined the office`);
    this.emit('agentAdded', cfg.id);
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
    this.world.freeWorkstation(id);
    this.agents.delete(id);
    this.emit('agentRemoved', id);
  }

  removeAllAgents(): void {
    for (const id of [...this.agents.keys()]) this.removeAgent(id);
  }

  getAgent(id: string): Agent | undefined { return this.agents.get(id); }
  getAgents(): Agent[] { return [...this.agents.values()]; }

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
  }

  private syncSize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr, h = rect.height * dpr;
    this.renderer.resize(w, h);
    const worldW = this.world.gridWidth * this.tileSize;
    const worldH = this.world.gridHeight * this.tileSize;
    this.scale = Math.max(1, Math.floor(Math.min(w / worldW, h / worldH) * 0.9));
    this.renderer.setScale(this.scale);
  }

  private update(dt: number): void {
    for (const agent of this.agents.values()) {
      const was = agent.isWalking;
      agent.update(dt);
      if (was && !agent.isWalking && agent.workstationId !== null) {
        agent.isAtDesk = true;
        agent.direction = 'up';
      }
    }
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
