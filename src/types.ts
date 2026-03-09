/* ── Activity system ─────────────────────────── */

export type AgentActivity =
  // Planning phase
  | 'planning' | 'analyzing' | 'decomposing'
  // Research phase
  | 'searching' | 'reading' | 'grepping'
  // Execution phase
  | 'coding' | 'generating' | 'refactoring'
  // Validation phase
  | 'testing' | 'linting' | 'validating'
  // Integration phase
  | 'committing' | 'pushing' | 'deploying'
  // Review phase
  | 'reviewing' | 'waiting_approval'
  // Terminal / meta
  | 'idle' | 'success' | 'error' | 'paused' | 'blocked';

export type WorkPhase = 'planning' | 'execution' | 'validation' | 'review';

/** Backward-compatible status type: accepts both legacy values and new activities */
export type AgentStatus =
  | 'idle' | 'typing' | 'reading' | 'thinking' | 'waiting' | 'success' | 'error'
  | AgentActivity;

export type ParticleEventType =
  | 'task_picked' | 'task_completed' | 'review_submitted'
  | 'error_burst' | 'review_approved' | 'review_rejected';

/* ── Core types ──────────────────────────────── */

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileType =
  | 'floor' | 'wall' | 'desk' | 'chair' | 'plant' | 'empty' | 'rug'
  | 'coffee' | 'water_cooler' | 'bookshelf' | 'couch'
  | 'whiteboard' | 'cabinet' | 'printer' | 'meeting_table'
  | 'rocket_body' | 'rocket_nose' | 'rocket_engine' | 'scaffolding' | 'fuel_tank'
  | 'hull_window' | 'solar_panel' | 'oxygen_tank' | 'comm_dish' | 'sleep_pod'
  | 'hay_bale' | 'tree' | 'water_trough' | 'crop' | 'tractor'
  | 'hospital_bed' | 'med_cabinet' | 'xray_machine' | 'curtain' | 'sink'
  | 'cow' | 'chicken' | 'sheep' | 'satellite' | 'launch_pad'
  | 'ship_hull' | 'ship_mast' | 'ship_sail' | 'ship_wheel' | 'cannon'
  | 'barrel' | 'anchor' | 'plank' | 'crows_nest' | 'treasure_chest' | 'jolly_roger'
  // Town
  | 'grass' | 'road' | 'road_cross' | 'cobblestone'
  | 'building_floor' | 'building_wall' | 'building_roof' | 'building_door'
  | 'building_roof_red' | 'building_roof_blue' | 'building_roof_brown' | 'building_roof_green'
  | 'building_chimney' | 'building_window' | 'building_awning'
  | 'fence' | 'lamppost' | 'bench' | 'town_tree' | 'fountain'
  | 'signpost' | 'flower_bed' | 'mailbox' | 'pathway' | 'water'
  | 'market_stall' | 'well' | 'town_hedge' | 'town_stairs';

export type ThemeId = 'casual' | 'business' | 'hybrid';
export type OfficeSize = 'small' | 'medium' | 'large' | 'wide' | 'xl';
export type EnvironmentId = 'office' | 'rocket' | 'space_station' | 'farm' | 'hospital' | 'pirate_ship' | 'town';

export type ZoneType =
  // Office — semantic rooms
  | 'desk' | 'meeting' | 'break_area' | 'whiteboard_area'
  | 'planning_board' | 'analysis_station'
  | 'coding_desk' | 'terminal'
  | 'test_station' | 'ci_monitor'
  | 'review_desk' | 'pair_station'
  // Rocket
  | 'engine_bay' | 'fuselage_work' | 'control_panel' | 'fuel_station' | 'tool_bench'
  | 'launch_check' | 'control_tower'
  // Space Station
  | 'bridge_console' | 'science_lab' | 'engineering' | 'comms' | 'observation'
  // Farm
  | 'tractor_seat' | 'animal_pen' | 'crop_field' | 'barn_workshop' | 'water_station'
  | 'harvest_check' | 'market_stand'
  // Hospital
  | 'patient_station' | 'surgery_room' | 'pharmacy' | 'reception' | 'lab_bench'
  | 'testing_bench' | 'pharmacy_review'
  // Pirate Ship
  | 'helm' | 'cannon_post' | 'rigging' | 'cargo_hold' | 'nav_table'
  | 'lookout' | 'war_room'
  // Town
  | 'shop_counter' | 'tavern_seat' | 'town_bench_zone' | 'workshop_bench' | 'town_square'
  // Common / idle
  | 'common_area';

/* ── Stage & room mode system (v0.3) ────────── */

export type BuildingStyle = 'warehouse' | 'workshop' | 'lab' | 'office' | 'depot' | 'tavern';

/** Configurable kanban stage that maps to a room/building */
export interface StageConfig {
  id: string;
  name: string;
  color: string;
  buildingStyle?: BuildingStyle;
}

/** Room layout mode: environment-standard 4 rooms vs. kanban-stage rooms */
export type RoomMode = 'environment' | 'kanban';

/** Activity props drawn next to agents at their desk */
export type ActivityProp =
  | 'hammer' | 'magnifier' | 'clipboard' | 'wrench' | 'flask'
  | 'book' | 'pencil' | 'checkmark' | 'warning' | 'hourglass';

/** Default kanban stages used when no custom stages are provided */
export const DEFAULT_STAGES: StageConfig[] = [
  { id: 'backlog',     name: 'Backlog',     color: '#95A5A6', buildingStyle: 'warehouse' },
  { id: 'todo',        name: 'To Do',       color: '#3498DB', buildingStyle: 'office' },
  { id: 'in_progress', name: 'In Progress', color: '#F39C12', buildingStyle: 'workshop' },
  { id: 'review',      name: 'Review',      color: '#9B59B6', buildingStyle: 'lab' },
  { id: 'done',        name: 'Done',        color: '#27AE60', buildingStyle: 'depot' },
];

/* ── Interfaces ──────────────────────────────── */

export interface Position { x: number; y: number }

export interface AgentConfig {
  id: string;
  name: string;
  status?: AgentStatus;
  message?: string;
  role?: string;
  team?: string;
  /** Skills or specializations for display and filtering */
  skills?: string[];
  /** Override the auto-assigned avatar palette index */
  avatarIndex?: number;
}

export interface AgentUpdate {
  status?: AgentStatus;
  message?: string | null;
  name?: string;
  /** Link agent to current objective context */
  currentObjectiveId?: string | null;
  /** Link agent to current story context */
  currentStoryId?: string | null;
}

export interface TownConfig {
  container: HTMLElement;
  scale?: number;
  theme?: ThemeId;
  officeSize?: OfficeSize;
  environment?: EnvironmentId;
  autoSize?: boolean;
  onAgentClick?: (agentId: string) => void;
  /** Custom kanban stage definitions. Defaults to DEFAULT_STAGES. */
  stages?: StageConfig[];
  /** Room layout mode: 'environment' uses standard rooms, 'kanban' maps rooms to stages. */
  roomMode?: RoomMode;
}

export interface Tile { type: TileType; walkable: boolean }

export interface ActivityZone {
  id: number;
  type: ZoneType;
  position: Position;
  facingDirection: Direction;
  assignedAgentId?: string;
  roomId: number;
}

export interface Room {
  id: number;
  name: string;
  /** Kanban stage name this room maps to (for info signs in standard mode) */
  kanbanStageName?: string;
  /** Y position of the roof tile row (town buildings only) */
  roofY?: number;
  bounds: { x: number; y: number; w: number; h: number };
  doorways: Position[];
}

/** @deprecated Use ActivityZone instead */
export type Workstation = ActivityZone;

export interface CharacterPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  eyes: string;
}

export interface SpriteFrame {
  width: number;
  height: number;
  data: number[][];
}

export interface ActivityEvent {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  type: 'status_change' | 'task_update' | 'message' | 'review_request' | 'system';
  description: string;
}

export type Priority = 'low' | 'medium' | 'high' | 'critical';
/** Task stage — includes defaults plus any custom stage IDs */
export type TaskStage = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | (string & {});

export interface Task {
  id: string;
  title: string;
  description: string;
  stage: TaskStage;
  assigneeId?: string;
  assigneeName?: string;
  priority: Priority;
  /** Optional link to parent story — orphan tasks (no storyId) are fully supported */
  storyId?: string;
  createdAt: number;
  updatedAt: number;
}

/* ── Hierarchy: Objective > Story > Task ─────── */

export type ObjectiveStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type StoryStatus = 'draft' | 'ready' | 'in_progress' | 'done' | 'blocked';
export type SprintStatus = 'planning' | 'active' | 'completed';

/** Top-level goal that contains stories */
export interface Objective {
  id: string;
  title: string;
  description: string;
  status: ObjectiveStatus;
  priority: Priority;
  /** Optional sprint grouping */
  sprintId?: string;
  /** Auto-computed 0..1 from child stories */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

/** Deliverable unit of work that groups related tasks */
export interface Story {
  id: string;
  /** Parent objective */
  objectiveId: string;
  title: string;
  description: string;
  status: StoryStatus;
  priority: Priority;
  /** Lead agent for this story */
  assigneeId?: string;
  assigneeName?: string;
  /** Story-point estimate */
  points?: number;
  /** Auto-computed 0..1 from child tasks */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

/** Time-boxed iteration grouping objectives */
export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  status: SprintStatus;
  startDate?: number;
  endDate?: number;
  createdAt: number;
}

/** Deliverable milestone linking objectives */
export interface Milestone {
  id: string;
  name: string;
  description?: string;
  targetDate?: number;
  /** Linked objective IDs */
  objectiveIds: string[];
  /** Auto-computed 0..1 from linked objectives */
  progress: number;
}

export interface ReviewItem {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  description: string;
  type: 'approval' | 'decision' | 'feedback';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface TownSettings {
  particleDensity: 'low' | 'medium' | 'high';
  animationSpeed: number;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  agentIds: string[];
  taskFilter?: {
    storyIds?: string[];
    tags?: string[];
  };
}

export type TownEventMap = {
  ready: [];
  agentAdded: [agentId: string];
  agentUpdated: [agentId: string];
  agentRemoved: [agentId: string];
  agentClick: [agentId: string];
  activity: [event: ActivityEvent];
  taskUpdated: [task: Task];
  taskRemoved: [taskId: string];
  reviewAdded: [review: ReviewItem];
  themeChanged: [theme: ThemeId];
  objectiveAdded: [objective: Objective];
  objectiveUpdated: [objective: Objective];
  objectiveRemoved: [objectiveId: string];
  storyAdded: [story: Story];
  storyUpdated: [story: Story];
  storyRemoved: [storyId: string];
  sprintAdded: [sprint: Sprint];
  sprintUpdated: [sprint: Sprint];
  milestoneUpdated: [milestone: Milestone];
  progressChanged: [entityType: 'objective' | 'story' | 'milestone', id: string, progress: number];
  taskAdded: [task: Task];
  stagesChanged: [stages: StageConfig[]];
  roomModeChanged: [mode: RoomMode];
  workspaceChanged: [workspaceId: string | null];
  workspaceAdded: [workspace: Workspace];
  workspaceRemoved: [workspaceId: string];
};

/* ── Task visualization (renderer data) ──────── */

/** Pre-computed task item for rendering in a room */
export interface TaskItemRenderData {
  taskId: string;
  title: string;
  priority: Priority;
  assigneeId?: string;
  stage: TaskStage;
  gridX: number;
  gridY: number;
  /** Whether an agent is currently interacting with this item */
  isBeingWorked: boolean;
}

/** Completion bag summary for the "done" room */
export interface CompletionBagRenderData {
  count: number;
  gridX: number;
  gridY: number;
  /** Height of the room in grid cells — used to clamp object size */
  roomH: number;
  /** Room left edge in grid cells — used to compute true center */
  roomX: number;
  /** Room width in grid cells — used to compute true center */
  roomW: number;
}

/** Overflow indicator for rooms with more tasks than visible slots */
export interface RoomOverflow {
  roomId: number;
  count: number;
  /** Grid position for the overflow badge (last slot in top half) */
  gridX: number;
  gridY: number;
}

/** Per-room task count for background display */
export interface RoomTaskCount {
  roomId: number;
  count: number;
  /** Room bounds for positioning the count */
  bounds: { x: number; y: number; w: number; h: number };
}

/** Full task render state passed to the renderer each frame */
export interface TaskVisualizationData {
  items: TaskItemRenderData[];
  completionBag: CompletionBagRenderData | null;
  flyingTasks: FlyingTask[];
  /** Rooms where tasks exceed visible top-half slots */
  overflows: RoomOverflow[];
  /** Task count per stage room (excluding done) */
  stageCounts: RoomTaskCount[];
}

/** Task in flight between stage rooms */
export interface FlyingTask {
  taskId: string;
  title: string;
  priority: Priority;
  fromGX: number;   // grid coordinates (center of source room)
  fromGY: number;
  toGX: number;     // grid coordinates (center of destination room)
  toGY: number;
  progress: number; // 0→1
  duration: number;  // seconds
}
