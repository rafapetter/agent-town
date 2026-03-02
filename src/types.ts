export type AgentStatus =
  | 'idle'
  | 'typing'
  | 'reading'
  | 'thinking'
  | 'waiting'
  | 'success'
  | 'error';

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
  | 'barrel' | 'anchor' | 'plank' | 'crows_nest' | 'treasure_chest' | 'jolly_roger';

export type ThemeId = 'casual' | 'business' | 'hybrid';
export type OfficeSize = 'small' | 'medium' | 'large';
export type EnvironmentId = 'office' | 'rocket' | 'space_station' | 'farm' | 'hospital' | 'pirate_ship';

export type ZoneType =
  // Office
  | 'desk' | 'meeting' | 'break_area' | 'whiteboard_area'
  // Rocket
  | 'engine_bay' | 'fuselage_work' | 'control_panel' | 'fuel_station' | 'tool_bench'
  // Space Station
  | 'bridge_console' | 'science_lab' | 'engineering' | 'comms' | 'observation'
  // Farm
  | 'tractor_seat' | 'animal_pen' | 'crop_field' | 'barn_workshop' | 'water_station'
  // Hospital
  | 'patient_station' | 'surgery_room' | 'pharmacy' | 'reception' | 'lab_bench'
  // Pirate Ship
  | 'helm' | 'cannon_post' | 'rigging' | 'cargo_hold' | 'nav_table';

export interface Position { x: number; y: number }

export interface AgentConfig {
  id: string;
  name: string;
  status?: AgentStatus;
  message?: string;
  role?: string;
  team?: string;
}

export interface AgentUpdate {
  status?: AgentStatus;
  message?: string | null;
  name?: string;
}

export interface TownConfig {
  container: HTMLElement;
  scale?: number;
  theme?: ThemeId;
  officeSize?: OfficeSize;
  environment?: EnvironmentId;
  autoSize?: boolean;
  onAgentClick?: (agentId: string) => void;
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

export type TaskStage = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  stage: TaskStage;
  assigneeId?: string;
  assigneeName?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  updatedAt: number;
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

export type TownEventMap = {
  ready: [];
  agentAdded: [agentId: string];
  agentUpdated: [agentId: string];
  agentRemoved: [agentId: string];
  agentClick: [agentId: string];
  activity: [event: ActivityEvent];
  taskUpdated: [task: Task];
  reviewAdded: [review: ReviewItem];
  themeChanged: [theme: ThemeId];
};
