import type { AgentActivity, AgentStatus, CharacterPalette, Direction, Position, SpriteFrame, ZoneType } from './types';
import { PALETTES, SPRITES, SPRITES_F } from './sprites';

let nextPaletteIdx = 0;

export function resetPaletteCounter(): void {
  nextPaletteIdx = 0;
}

/** Maps legacy 7-value statuses to the new AgentActivity system */
const LEGACY_STATUS_MAP: Record<string, AgentActivity> = {
  typing: 'coding',
  thinking: 'planning',
  waiting: 'waiting_approval',
  // These already exist in AgentActivity, so they pass through:
  // idle, reading, success, error
};

export class Agent {
  readonly id: string;
  name: string;
  role: string;
  team: string;
  palette: CharacterPalette;
  paletteIndex: number;
  gender: 'M' | 'F';

  x: number;
  y: number;
  gridX: number;
  gridY: number;

  path: Position[] = [];
  private pathIndex = 0;

  userStatus: AgentStatus = 'idle';
  resolvedActivity: AgentActivity = 'idle';
  isWalking = false;
  isAtDesk = false;
  direction: Direction = 'right';

  animFrame = 0;
  animTimer = 0;

  message: string | null = null;
  messageTimer = 0;

  /* idle micro-animation state */
  breathPhase = 0;
  blinkTimer = 3 + Math.random() * 3;
  isBlinking = false;
  private blinkDuration = 0;

  /* zone & movement */
  currentZoneId: number | null = null;
  currentZoneType: ZoneType | null = null;
  movementTimer = 5 + Math.random() * 8;
  isRoaming = false;

  /* social / creative behavior */
  socialAction: 'none' | 'coffee_break' | 'chatting' | 'waving' | 'pointing' | 'high_five' | 'stretching' = 'none';
  socialTimer = 0;
  socialPartnerId: string | null = null;
  coffeeBreakTimer = 30 + Math.random() * 20; // 30-50 sec until first coffee break
  /** Timer for idle procrastination messages */
  idleMessageTimer = 5 + Math.random() * 5;

  /* portal teleportation */
  portalState: 'none' | 'departing' | 'arriving' = 'none';
  portalTimer = 0;
  portalDest: Position | null = null;
  private static PORTAL_DEPART_TIME = 0.6;
  private static PORTAL_ARRIVE_TIME = 0.5;

  /* hierarchy context — set via updateAgent() */
  currentObjectiveId: string | null = null;
  currentStoryId: string | null = null;
  /** Number of active (non-done, non-backlog) tasks assigned to this agent */
  activeTaskCount = 0;
  /** Number of completed tasks assigned to this agent */
  completedTaskCount = 0;
  /** Skills / specializations for display */
  skills: string[] = [];

  /** @deprecated Use currentZoneId instead */
  get workstationId(): number | null { return this.currentZoneId; }
  set workstationId(v: number | null) { this.currentZoneId = v; }

  visible = true;

  private walkSpeed = 3;
  private walkProgress = 0;

  constructor(id: string, name: string, spawnPos: Position, role = '', team = '') {
    this.id = id;
    this.name = name;
    this.role = role;
    this.team = team;
    this.paletteIndex = nextPaletteIdx;
    this.gender = nextPaletteIdx % 2 === 0 ? 'M' : 'F';
    this.palette = PALETTES[nextPaletteIdx++ % PALETTES.length];
    this.gridX = spawnPos.x;
    this.gridY = spawnPos.y;
    this.x = spawnPos.x;
    this.y = spawnPos.y;
  }

  setStatus(status: AgentStatus, message?: string | null): void {
    this.userStatus = status;
    this.resolvedActivity = LEGACY_STATUS_MAP[status] ?? status as AgentActivity;
    if (message !== undefined) {
      this.message = message;
      this.messageTimer = message ? 6 : 0;
    }
  }

  walkTo(path: Position[]): void {
    if (path.length <= 1) return;
    this.path = path;
    this.pathIndex = 1;
    this.isWalking = true;
    this.walkProgress = 0;
  }

  portalTo(dest: Position): void {
    this.portalState = 'departing';
    this.portalTimer = 0;
    this.portalDest = dest;
    this.isWalking = false;
    this.path = [];
  }

  /** Maps resolved activity to one of the sprite animation keys */
  private getAnimationKey(): string {
    if (this.isWalking) return 'walk';
    // Social actions take priority over work animations
    if (this.socialAction !== 'none') {
      switch (this.socialAction) {
        case 'chatting': return 'chatting';
        case 'waving': return 'waving';
        case 'pointing': return 'pointing';
        case 'high_five': return 'celebrating';
        case 'coffee_break': return 'idle';
        case 'stretching': return 'idle';
        default: return 'idle';
      }
    }
    switch (this.resolvedActivity) {
      case 'coding': case 'generating':
      case 'committing': case 'pushing':
      case 'linting':
        return 'typing';
      case 'refactoring': case 'deploying':
        return 'hammering';
      case 'reading': case 'searching': case 'grepping':
        return 'reading';
      case 'reviewing': case 'testing': case 'validating':
        return 'inspecting';
      case 'planning': case 'analyzing': case 'decomposing':
        return 'thinking';
      case 'waiting_approval': case 'blocked':
        return 'waiting';
      case 'success':
        return 'celebrating';
      default:
        return 'idle';
    }
  }

  update(dt: number): void {
    // ── Portal animation ──
    if (this.portalState !== 'none') {
      this.portalTimer += dt;
      if (this.portalState === 'departing') {
        if (this.portalTimer >= Agent.PORTAL_DEPART_TIME) {
          // Teleport to destination
          if (this.portalDest) {
            this.x = this.portalDest.x;
            this.y = this.portalDest.y;
            this.gridX = this.portalDest.x;
            this.gridY = this.portalDest.y;
          }
          this.portalState = 'arriving';
          this.portalTimer = 0;
        }
      } else if (this.portalState === 'arriving') {
        if (this.portalTimer >= Agent.PORTAL_ARRIVE_TIME) {
          this.portalState = 'none';
          this.portalTimer = 0;
          this.portalDest = null;
        }
      }
      return; // Skip normal movement during portal
    }

    this.animTimer += dt;
    const animKey = this.getAnimationKey();
    const frameRate = this.isWalking ? 0.15
      : animKey === 'typing' ? 0.25
      : animKey === 'hammering' ? 0.2
      : animKey === 'celebrating' ? 0.3
      : animKey === 'chatting' ? 0.35
      : animKey === 'waving' ? 0.3
      : 0.5;
    if (this.animTimer >= frameRate) {
      this.animTimer -= frameRate;
      this.animFrame++;
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        this.messageTimer = 0;
        const a = this.resolvedActivity;
        if (a !== 'waiting_approval' && a !== 'error' && a !== 'blocked') {
          this.message = null;
        }
      }
    }

    /* idle micro-animations */
    if (!this.isWalking && this.isAtDesk) {
      this.breathPhase += dt * 2.5;
      this.blinkTimer -= dt;
      if (this.isBlinking) {
        this.blinkDuration -= dt;
        if (this.blinkDuration <= 0) {
          this.isBlinking = false;
          this.blinkTimer = 2.5 + Math.random() * 4;
        }
      } else if (this.blinkTimer <= 0) {
        this.isBlinking = true;
        this.blinkDuration = 0.1 + Math.random() * 0.05;
      }
    } else {
      this.breathPhase = 0;
      this.isBlinking = false;
      this.blinkTimer = 3;
    }

    if (!this.isWalking || this.pathIndex >= this.path.length) return;

    const target = this.path[this.pathIndex];
    const dx = target.x - this.gridX;
    const dy = target.y - this.gridY;
    this.direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');

    this.walkProgress += dt * this.walkSpeed;

    if (this.walkProgress >= 1) {
      this.gridX = target.x;
      this.gridY = target.y;
      this.x = target.x;
      this.y = target.y;
      this.walkProgress = 0;
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.isWalking = false;
        this.path = [];
        this.pathIndex = 0;
      }
    } else {
      this.x = this.gridX + (target.x - this.gridX) * this.walkProgress;
      this.y = this.gridY + (target.y - this.gridY) * this.walkProgress;
    }
  }

  getCurrentSprite(): { frame: SpriteFrame; flip: boolean } {
    const key = this.getAnimationKey();
    const spriteSet = this.gender === 'F' ? SPRITES_F : SPRITES;
    const frames = spriteSet[key] ?? spriteSet.idle;
    const frame = frames[this.animFrame % frames.length];
    return { frame, flip: this.direction === 'left' };
  }
}
