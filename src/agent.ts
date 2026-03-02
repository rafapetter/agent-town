import type { AgentStatus, CharacterPalette, Direction, Position, SpriteFrame, ZoneType } from './types';
import { PALETTES, SPRITES, SPRITES_F } from './sprites';

let nextPaletteIdx = 0;

export function resetPaletteCounter(): void {
  nextPaletteIdx = 0;
}

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
  movementTimer = 15 + Math.random() * 15;
  isRoaming = false;

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

  update(dt: number): void {
    this.animTimer += dt;
    const frameRate = this.isWalking ? 0.15 : this.userStatus === 'typing' ? 0.25 : 0.5;
    if (this.animTimer >= frameRate) {
      this.animTimer -= frameRate;
      this.animFrame++;
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        this.messageTimer = 0;
        if (this.userStatus !== 'waiting' && this.userStatus !== 'error') {
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
    const key = this.isWalking ? 'walk' : this.userStatus;
    const spriteSet = this.gender === 'F' ? SPRITES_F : SPRITES;
    const frames = spriteSet[key] ?? spriteSet.idle;
    const frame = frames[this.animFrame % frames.length];
    return { frame, flip: this.direction === 'left' };
  }
}
