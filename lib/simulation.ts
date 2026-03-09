import type { AgentTown } from '../src/index';

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const PRIO_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const PLANNING_MSGS = [
  'Planning approach...', 'Analyzing requirements...', 'Evaluating architecture...',
  'Breaking down subtasks...', 'Designing solution...',
];
const SEARCHING_MSGS = [
  'Searching codebase...', 'Grepping for patterns...', 'Reading documentation...',
  'Researching best practices...', 'Checking dependencies...',
];
const CODING_MSGS = [
  'Writing implementation...', 'Coding solution...', 'Building module...',
  'Generating code...', 'Refactoring module...',
];
const TESTING_MSGS = [
  'Running test suite...', 'Validating output...', 'Linting codebase...',
  'Checking assertions...', 'Testing edge cases...',
];
const ERROR_MSGS = [
  'Type error found', 'Test failure detected', 'Build error', 'Linting issues', 'Dependency conflict',
];

export type SimState =
  | 'idle' | 'pick_task' | 'planning' | 'searching' | 'coding'
  | 'testing' | 'error' | 'committing' | 'submit_review' | 'waiting_review'
  | 'success' | 'fix_rejected';

export const PIPELINE_STEPS = ['planning', 'searching', 'coding', 'testing', 'review', 'done'] as const;
export const PIPELINE_LABELS = ['Plan', 'Research', 'Code', 'Test', 'Review', 'Done'] as const;

export class AgentSimState {
  agentId: string;
  currentState: SimState = 'idle';
  currentTaskId: string | null = null;
  currentReviewId: string | null = null;
  stateTimer: number;
  baseSpeed: number;
  errorProbability: number;
  thoroughness: number;
  tasksCompleted = 0;
  tasksFailed = 0;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.stateTimer = 2 + Math.random() * 3;
    this.baseSpeed = 0.8 + Math.random() * 0.5;
    this.errorProbability = 0.05 + Math.random() * 0.1;
    this.thoroughness = 0.7 + Math.random() * 0.6;
  }
}

export class AgentSimulation {
  town: AgentTown;
  agentStates = new Map<string, AgentSimState>();
  speed = 1.0;
  paused = false;
  running = false;
  taskCounter = 0;
  agentCounter = 0;
  onUIUpdate: (() => void) | null = null;

  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(town: AgentTown) {
    this.town = town;
  }

  start(): void {
    this.running = true;
    this.paused = false;
    this.tickInterval = setInterval(() => this.tick(), 100);
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.agentStates.clear();
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  setSpeed(s: number): void { this.speed = s; }

  addAgent(agentId: string): void {
    this.agentStates.set(agentId, new AgentSimState(agentId));
  }

  removeAgent(agentId: string): void {
    const state = this.agentStates.get(agentId);
    if (state?.currentTaskId) {
      this.town.updateTask(state.currentTaskId, { stage: 'backlog', assigneeId: undefined, assigneeName: undefined });
    }
    this.agentStates.delete(agentId);
    this.town.removeAgent(agentId);
  }

  /** Pick next task, preferring tasks from same story for locality */
  getNextTask(currentStoryId?: string | null): ReturnType<typeof this.town.getTasks>[number] | null {
    const assignedIds = new Set<string>();
    for (const s of this.agentStates.values()) {
      if (s.currentTaskId) assignedIds.add(s.currentTaskId);
    }
    const available = this.town.getTasks()
      .filter(t => (t.stage === 'backlog' || t.stage === 'todo') && !assignedIds.has(t.id))
      .sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]);

    if (!available.length) return null;

    // Prefer tasks from same story
    if (currentStoryId) {
      const sameStory = available.find(t => t.storyId === currentStoryId);
      if (sameStory) return sameStory;
    }

    return available[0];
  }

  tick(): void {
    if (this.paused || !this.running) return;
    const dt = 0.1 * this.speed;
    let needsUpdate = false;

    for (const [agentId, state] of this.agentStates) {
      if (state.currentState === 'waiting_review') continue;
      state.stateTimer -= dt / state.baseSpeed;
      if (state.stateTimer <= 0) {
        this.transitionAgent(agentId, state);
        needsUpdate = true;
      }
    }

    if (needsUpdate && this.onUIUpdate) this.onUIUpdate();
  }

  private getTaskTitle(state: AgentSimState): string {
    if (!state.currentTaskId) return '?';
    const t = this.town.getTasks().find(t => t.id === state.currentTaskId);
    return t ? t.title : '?';
  }

  private getTaskStoryId(state: AgentSimState): string | undefined {
    if (!state.currentTaskId) return undefined;
    const t = this.town.getTasks().find(t => t.id === state.currentTaskId);
    return t?.storyId;
  }

  transitionAgent(agentId: string, state: AgentSimState): void {
    const agent = this.town.getAgent(agentId);
    if (!agent) return;
    const name = agent.name;

    switch (state.currentState) {
      case 'idle': {
        const lastStoryId = agent.currentStoryId;
        const task = this.getNextTask(lastStoryId);
        if (task) {
          state.currentTaskId = task.id;
          state.currentState = 'pick_task';
          state.stateTimer = 1 + Math.random();
          // Set agent context
          const storyId = task.storyId;
          const story = storyId ? this.town.getStory(storyId) : undefined;
          const objectiveId = story?.objectiveId;
          this.town.updateAgent(agentId, {
            status: 'analyzing',
            message: 'Looking for a task...',
            currentStoryId: storyId ?? null,
            currentObjectiveId: objectiveId ?? null,
          });
          this.town.updateTask(task.id, { stage: 'todo', assigneeId: agentId, assigneeName: name });
          this.town.logActivity(agentId, 'task_update', `${name} picked up "${task.title}"`);
        } else {
          state.stateTimer = 3 + Math.random() * 5;
          this.town.updateAgent(agentId, { status: 'idle', message: null });
        }
        break;
      }

      case 'pick_task': {
        state.currentState = 'planning';
        state.stateTimer = (3 + Math.random() * 5) * state.thoroughness;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'planning', message: `${pick(PLANNING_MSGS)} (${title})` });
        this.town.updateTask(state.currentTaskId!, { stage: 'in_progress' });
        // Update story status
        const storyId = this.getTaskStoryId(state);
        if (storyId) {
          const story = this.town.getStory(storyId);
          if (story && story.status === 'ready') {
            this.town.updateStory(storyId, { status: 'in_progress' });
          }
        }
        this.town.logActivity(agentId, 'status_change', `${name} is planning "${title}"`);
        break;
      }

      case 'planning': {
        state.currentState = 'searching';
        state.stateTimer = (3 + Math.random() * 6) * state.thoroughness;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'searching', message: `${pick(SEARCHING_MSGS)} (${title})` });
        this.town.logActivity(agentId, 'status_change', `${name} is researching "${title}"`);
        break;
      }

      case 'searching': {
        state.currentState = 'coding';
        state.stateTimer = 5 + Math.random() * 10;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'coding', message: `${pick(CODING_MSGS)} (${title})` });
        this.town.logActivity(agentId, 'status_change', `${name} started implementing "${title}"`);
        break;
      }

      case 'coding': {
        state.currentState = 'testing';
        state.stateTimer = 3 + Math.random() * 5;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'testing', message: `${pick(TESTING_MSGS)} (${title})` });
        this.town.logActivity(agentId, 'status_change', `${name} is testing "${title}"`);
        break;
      }

      case 'testing': {
        const title = this.getTaskTitle(state);
        if (Math.random() < state.errorProbability) {
          state.currentState = 'error';
          state.stateTimer = 3 + Math.random() * 3;
          state.tasksFailed++;
          const errMsg = pick(ERROR_MSGS);
          this.town.updateAgent(agentId, { status: 'error', message: `${errMsg} in "${title}"` });
          this.town.logActivity(agentId, 'status_change', `${name} hit an error: ${errMsg}`);
          break;
        }
        state.currentState = 'committing';
        state.stateTimer = 1 + Math.random();
        this.town.updateAgent(agentId, { status: 'committing', message: `Committing "${title}"...` });
        this.town.logActivity(agentId, 'status_change', `${name} is committing "${title}"`);
        break;
      }

      case 'committing': {
        state.currentState = 'submit_review';
        state.stateTimer = 0.3;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'waiting_approval', message: `Submitting "${title}" for review...` });
        this.town.updateTask(state.currentTaskId!, { stage: 'review' });
        this.town.logActivity(agentId, 'review_request', `${name} submitted "${title}" for review`);
        break;
      }

      case 'submit_review': {
        const title = this.getTaskTitle(state);
        const reviewId = `rev-${Date.now()}-${agentId}`;
        state.currentReviewId = reviewId;
        state.currentState = 'waiting_review';
        this.town.addReview({
          id: reviewId,
          agentId,
          agentName: name,
          title: `Review: ${title}`,
          description: `${name} requests approval for "${title}"`,
          type: 'approval',
        });
        this.town.updateAgent(agentId, { status: 'waiting_approval', message: `Waiting for review: "${title}"` });
        break;
      }

      case 'waiting_review':
        break;

      case 'success': {
        state.currentTaskId = null;
        state.currentReviewId = null;
        state.currentState = 'idle';
        state.stateTimer = 2 + Math.random() * 4;
        this.town.updateAgent(agentId, { status: 'idle', message: null });
        this.town.logActivity(agentId, 'status_change', `${name} is now idle`);
        break;
      }

      case 'error': {
        state.currentState = 'coding';
        state.stateTimer = 4 + Math.random() * 6;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'refactoring', message: `Fixing error in "${title}"...` });
        this.town.logActivity(agentId, 'status_change', `${name} is fixing error in "${title}"`);
        break;
      }

      case 'fix_rejected': {
        state.currentState = 'coding';
        state.stateTimer = 4 + Math.random() * 6;
        const title = this.getTaskTitle(state);
        this.town.updateAgent(agentId, { status: 'refactoring', message: `Addressing feedback for "${title}"...` });
        this.town.logActivity(agentId, 'status_change', `${name} addressing feedback for "${title}"`);
        break;
      }
    }
  }

  onReviewResolved(reviewId: string, decision: 'approved' | 'rejected'): void {
    for (const [agentId, state] of this.agentStates) {
      if (state.currentReviewId !== reviewId) continue;
      const agent = this.town.getAgent(agentId);
      if (!agent) break;
      const title = this.getTaskTitle(state);

      this.town.resolveReview(reviewId, decision);

      if (decision === 'approved') {
        state.currentState = 'success';
        state.stateTimer = 2 + Math.random() * 3;
        state.tasksCompleted++;
        this.town.updateTask(state.currentTaskId!, { stage: 'done' });
        this.town.updateAgent(agentId, { status: 'success', message: `"${title}" approved!` });
        this.town.logActivity(agentId, 'task_update', `Review approved: "${title}" is done`);
      } else {
        state.currentState = 'fix_rejected';
        state.stateTimer = 4 + Math.random() * 5;
        this.town.updateTask(state.currentTaskId!, { stage: 'in_progress' });
        this.town.updateAgent(agentId, { status: 'refactoring', message: `Fixing feedback for "${title}"...` });
        this.town.logActivity(agentId, 'task_update', `Review rejected: "${title}" needs fixes`);
      }
      state.currentReviewId = null;
      break;
    }
  }

  onChatMessage(agentId: string, message: string): { from: string; body: string } | null {
    const agent = this.town.getAgent(agentId);
    if (!agent) return null;
    const state = this.agentStates.get(agentId);
    if (!state) return null;

    this.town.logActivity(agentId, 'message', `Human to ${agent.name}: ${message}`);

    const title = this.getTaskTitle(state);
    let response: string;
    switch (state.currentState) {
      case 'idle':
        response = pick(["I'm available. Assign me a task!", "Standing by.", "Idle. What do you need?"]);
        break;
      case 'pick_task': case 'planning':
        response = title !== '?' ? `Planning approach for "${title}".` : 'Picking up a new task...';
        break;
      case 'searching':
        response = title !== '?' ? `Researching "${title}". Almost ready to code.` : 'Searching...';
        break;
      case 'coding':
        response = title !== '?' ? `Coding "${title}". ${Math.floor(40 + Math.random() * 50)}% done.` : 'Implementing...';
        break;
      case 'testing':
        response = title !== '?' ? `Running tests for "${title}".` : 'Testing...';
        break;
      case 'waiting_review':
        response = title !== '?' ? `Blocked on review for "${title}".` : 'Waiting for review...';
        break;
      case 'error':
        response = title !== '?' ? `Debugging "${title}".` : 'Fixing an error.';
        break;
      case 'success':
        response = 'Just finished a task! Ready for the next one.';
        break;
      default:
        response = "I'm here! What do you need?";
    }

    this.town.logActivity(agentId, 'message', `${agent.name}: ${response}`);
    return { from: agent.name, body: response };
  }

  getAgentPipelineStep(agentId: string): number {
    const state = this.agentStates.get(agentId);
    if (!state?.currentTaskId) return -1;
    switch (state.currentState) {
      case 'pick_task': case 'planning': return 0;
      case 'searching': return 1;
      case 'coding': case 'error': case 'fix_rejected': return 2;
      case 'testing': case 'committing': return 3;
      case 'submit_review': case 'waiting_review': return 4;
      case 'success': return 5;
      default: return -1;
    }
  }

  destroy(): void {
    this.stop();
  }
}
