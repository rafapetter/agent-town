import type { Agent } from './agent';
import type {
  AgentActivity, ActivityProp, CharacterPalette, EnvironmentId, ParticleEventType, ThemeId,
  Priority, TaskVisualizationData, TaskItemRenderData, CompletionBagRenderData, FlyingTask, RoomOverflow, RoomTaskCount,
} from './types';
import type { World } from './world';
import { THEMES, ENV_COLORS, ORCHESTRATOR_ROWS, type ThemeColors } from './themes';
import { renderSprite } from './sprites';
import { ParticleSystem } from './particles';

const ACTIVITY_COLORS: Record<AgentActivity, string> = {
  // Planning phase — amber/orange
  planning: '#F39C12', analyzing: '#E67E22', decomposing: '#D35400',
  // Research — purple
  searching: '#8E44AD', reading: '#9B59B6', grepping: '#7D3C98',
  // Execution — blue
  coding: '#3498DB', generating: '#2980B9', refactoring: '#2471A3',
  // Validation — teal
  testing: '#1ABC9C', linting: '#16A085', validating: '#148F77',
  // Integration — indigo
  committing: '#5B5EA6', pushing: '#6C5CE7', deploying: '#4834D4',
  // Review — orange
  reviewing: '#E67E22', waiting_approval: '#F39C12',
  // Terminal states
  idle: '#95A5A6', success: '#27AE60', error: '#E74C3C',
  paused: '#BDC3C7', blocked: '#C0392B',
};

const SUIT_COLORS  = ['#2C3E50', '#1A1A2E', '#34495E', '#283747', '#212F3D'];
const SCRUB_COLORS = ['#5B9BD5', '#27AE60', '#E891B2', '#48C9B0', '#5DADE2'];
const FLANNEL_COLORS = ['#B5422C', '#2E6B4E', '#8B6914', '#4A6FA5', '#CC7722', '#884422'];
const PIRATE_COLORS = ['#CC3333', '#1A1A2E', '#5A3A1A', '#2C6B4E', '#8B6914', '#333366'];
const TUNIC_COLORS = ['#7A3B2E', '#2E5A3B', '#3A4A7A', '#8B6914', '#6A2A5A', '#CC7722', '#4A6A4A', '#AA4444'];

const ACTIVITY_PROP: Partial<Record<AgentActivity, ActivityProp>> = {
  coding: 'pencil', generating: 'pencil', refactoring: 'hammer',
  planning: 'clipboard', analyzing: 'clipboard', decomposing: 'clipboard',
  searching: 'magnifier', grepping: 'magnifier', reading: 'book',
  testing: 'flask', validating: 'flask', linting: 'checkmark',
  committing: 'wrench', pushing: 'wrench', deploying: 'wrench',
  reviewing: 'magnifier', waiting_approval: 'hourglass',
  success: 'checkmark', error: 'warning',
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private scale: number;
  private tileSize: number;
  private colors: ThemeColors;
  private env: EnvironmentId = 'office';
  private theme: ThemeId = 'hybrid';
  private starCache: { x: number; y: number; r: number; b: number }[] = [];
  private warpStars: { x: number; y: number; speed: number; len: number; brightness: number }[] = [];
  private colorCache = new Map<string, string>();
  private floorNoise: Uint8Array = new Uint8Array(0);
  private particles = new ParticleSystem();
  private lightCanvas: HTMLCanvasElement | null = null;
  private shakeOffset = { x: 0, y: 0 };
  private shakeEnd = 0;
  private flashColor = '';
  private flashStart = 0;
  private flashDuration = 0;
  /** Tracks which door tile positions are open (key = "x,y") */
  private openDoors = new Set<string>();
  /** Debounce timers for door closing (key = "x,y", value = close timestamp) */
  private doorCloseTimers = new Map<string, number>();

  constructor(
    private canvas: HTMLCanvasElement,
    world: World,
    scale: number,
    tileSize: number,
    theme: ThemeId = 'hybrid',
    env: EnvironmentId = 'office',
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.world = world;
    this.scale = scale;
    this.tileSize = tileSize;
    this.env = env;
    this.theme = theme;
    this.colors = env === 'office' ? THEMES[theme] : ENV_COLORS[env];
    this.ctx.imageSmoothingEnabled = false;
    this.generateStars();
    this.generateFloorNoise();
    this.particles.configure(env, world.gridWidth, world.gridHeight, this.tileSize * this.scale);
  }

  private get ts(): number { return this.tileSize * this.scale; }
  /** Ceil'd tile size for fill operations — prevents 1px gaps between tiles at fractional scale */
  private get tsCeil(): number { return Math.ceil(this.tileSize * this.scale); }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
  }

  setScale(s: number): void {
    this.scale = s;
    this.particles.configure(this.env, this.world.gridWidth, this.world.gridHeight, this.ts);
  }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
    if (this.env === 'office') this.colors = THEMES[theme];
  }

  setEnvironment(env: EnvironmentId, theme: ThemeId): void {
    this.env = env;
    this.theme = theme;
    this.colors = env === 'office' ? THEMES[theme] : ENV_COLORS[env];
    this.generateStars();
    this.generateFloorNoise();
    this.particles.configure(env, this.world.gridWidth, this.world.gridHeight, this.ts);
  }

  updateParticles(dt: number): void {
    this.particles.update(dt);
  }

  spawnWeldingSparks(gridX: number, gridY: number): void {
    const worldX = gridX * this.ts + this.ts / 2;
    const worldY = gridY * this.ts;
    this.particles.spawnWeldingSparks(worldX, worldY);
  }

  spawnEventParticles(gridX: number, gridY: number, eventType: ParticleEventType): void {
    const worldX = gridX * this.ts + this.ts / 2;
    const worldY = gridY * this.ts + this.ts / 2;
    this.particles.spawnEventParticles(worldX, worldY, eventType);

    // Subtle screen shake on errors (no flash overlays — they cause distracting background color changes)
    if (eventType === 'error_burst' || eventType === 'review_rejected') {
      this.shake(2.5, 180);
    }
  }

  /** Trigger screen shake (for error bursts, impacts) */
  shake(intensity = 3, duration = 200): void {
    this.shakeEnd = Date.now() + duration;
    this.shakeOffset = { x: (Math.random() - 0.5) * intensity * 2, y: (Math.random() - 0.5) * intensity * 2 };
  }

  /** Trigger screen flash (white for success, red for error) */
  flash(color: string, duration = 300): void {
    this.flashColor = color; this.flashStart = Date.now(); this.flashDuration = duration;
  }

  render(agents: Agent[], taskViz?: TaskVisualizationData): void {
    const { ctx, canvas } = this;

    // Update door open/close states based on agent proximity
    if (this.env === 'town') this.updateDoorStates(agents);

    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.env === 'space_station' || this.env === 'rocket' || this.env === 'pirate_ship') this.drawStars();

    const ww = this.world.gridWidth * this.ts;
    const wh = this.world.gridHeight * this.ts;
    let ox = Math.floor((canvas.width - ww) / 2);
    let oy = Math.floor((canvas.height - wh) / 2);

    // Screen shake offset
    if (Date.now() < this.shakeEnd) {
      const decay = (this.shakeEnd - Date.now()) / 200;
      this.shakeOffset.x = (Math.random() - 0.5) * 3 * decay;
      this.shakeOffset.y = (Math.random() - 0.5) * 3 * decay;
      ox += Math.round(this.shakeOffset.x);
      oy += Math.round(this.shakeOffset.y);
    }

    ctx.save();
    ctx.translate(ox, oy);
    this.drawFloor();
    // Peaked roofs removed — town now uses flat top-down roof tiles
    this.drawDecor();
    this.drawWorkstations();
    if (taskViz) this.drawTaskItems(taskViz);
    this.drawGlowEffects();
    this.particles.render(ctx);

    const vis = agents.filter(a => a.visible).sort((a, b) => a.y - b.y);
    // Draw conversation lines between chatting agents (behind agents)
    this.drawConversationLines(vis);
    for (const a of vis) this.drawAgent(a);

    // Flying task animations (above agents, below lighting)
    if (taskViz) this.drawFlyingTasks(taskViz);

    // Lighting overlay (multiply blend for atmosphere — all environments)
    this.drawLightingOverlay();

    if (taskViz) this.drawAgentTaskConnections(vis, taskViz);
    for (const a of vis) { this.drawBubble(a); this.drawNameLabel(a); this.drawStatusIcon(a); }
    this.drawRoomLabels();
    ctx.restore();

    // Screen flash overlay
    if (this.flashStart) {
      const elapsed = Date.now() - this.flashStart;
      const alpha = Math.max(0, 1 - elapsed / this.flashDuration) * 0.25;
      if (alpha > 0) {
        ctx.fillStyle = this.flashColor.includes('rgba') ? this.flashColor : `rgba(255,255,255,${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else { this.flashStart = 0; }
    }
  }

  getAgentAt(sx: number, sy: number, agents: Agent[]): Agent | null {
    const ww = this.world.gridWidth * this.ts;
    const wh = this.world.gridHeight * this.ts;
    const ox = (this.canvas.width - ww) / 2;
    const oy = (this.canvas.height - wh) / 2;
    const wx = (sx - ox) / this.ts;
    const wy = (sy - oy) / this.ts;
    for (const a of agents) {
      if (Math.abs(wx - (a.x + 0.5)) < 0.6 && Math.abs(wy - (a.y + 0.5)) < 0.6) return a;
    }
    return null;
  }

  /* ── environment outfit palette ─────────────── */

  private getEnvPalette(agent: Agent): CharacterPalette {
    const i = agent.paletteIndex;
    switch (this.env) {
      case 'space_station':
        return { ...agent.palette, shirt: '#E0E0E0', pants: '#C8C8D0', shoes: '#888888' };
      case 'rocket':
        return { ...agent.palette, shirt: '#FF8C00', pants: '#555566', shoes: '#444455' };
      case 'hospital': {
        if (i % 3 === 0) return { ...agent.palette, shirt: '#FFFFFF', pants: '#E0E8E0', shoes: '#D0D0D0' };
        const sc = SCRUB_COLORS[i % SCRUB_COLORS.length];
        return { ...agent.palette, shirt: sc, pants: sc, shoes: '#888888' };
      }
      case 'farm':
        return {
          ...agent.palette,
          shirt: FLANNEL_COLORS[i % FLANNEL_COLORS.length],
          pants: '#5C4A32',
          shoes: '#5A3A1A',
        };
      case 'pirate_ship':
        return {
          ...agent.palette,
          shirt: PIRATE_COLORS[i % PIRATE_COLORS.length],
          pants: '#3A2A1A',
          shoes: '#2A1A0A',
        };
      case 'town':
        return {
          ...agent.palette,
          shirt: TUNIC_COLORS[i % TUNIC_COLORS.length],
          pants: '#5A4A32',
          shoes: '#3A2A1A',
        };
      case 'office':
        if (this.theme === 'business') {
          return {
            ...agent.palette,
            shirt: SUIT_COLORS[i % SUIT_COLORS.length],
            pants: '#1A1A2E',
            shoes: '#1A1A1A',
          };
        }
        return agent.palette;
      default:
        return agent.palette;
    }
  }

  /* ── stars (space backgrounds) ──────────────── */

  private generateStars(): void {
    this.starCache = [];
    this.warpStars = [];
    if (this.env === 'pirate_ship') {
      // Stars in the night sky (top half)
      for (let i = 0; i < 80; i++) {
        this.starCache.push({
          x: Math.random(), y: Math.random() * 0.4,
          r: Math.random() * 1.2 + 0.3,
          b: Math.random() * 0.5 + 0.5,
        });
      }
      return;
    }
    if (this.env !== 'space_station' && this.env !== 'rocket') return;
    for (let i = 0; i < 120; i++) {
      this.starCache.push({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.5 + 0.5,
        b: Math.random() * 0.5 + 0.5,
      });
    }
    // Warp speed stars for the space station viewscreen
    if (this.env === 'space_station') {
      for (let i = 0; i < 40; i++) {
        this.warpStars.push({
          x: Math.random(),          // 0-1 across viewscreen width
          y: Math.random(),          // 0-1 across viewscreen height
          speed: 0.3 + Math.random() * 0.7,  // streak speed
          len: 0.08 + Math.random() * 0.2,   // streak length
          brightness: 0.5 + Math.random() * 0.5,
        });
      }
    }
  }

  private drawStars(): void {
    const { ctx, canvas } = this;
    for (const s of this.starCache) {
      const a = s.b * 0.6 + Math.sin(Date.now() * 0.001 + s.x * 100) * 0.15;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── floor noise ──────────────────────────────── */

  private generateFloorNoise(): void {
    const w = this.world.gridWidth;
    const h = this.world.gridHeight;
    this.floorNoise = new Uint8Array(w * h);
    let seed = 42;
    for (let i = 0; i < w * h; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      this.floorNoise[i] = seed & 0xff;
    }
  }

  /* ── floor & walls ──────────────────────────── */

  private drawFloor(): void {
    const { ctx, ts } = this;
    const c = this.colors;
    const w = this.world;

    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const t = w.tiles[y][x];
        const sx = x * ts, sy = y * ts;

        if (t.type === 'wall') {
          this.drawWallTile(sx, sy);
        } else if (t.type === 'rug') {
          this.shadedRect(sx, sy, ts, ts, c.rug, { outline: false, shadowAmt: 0.06, highlightAmt: 0.06 });
        } else if (t.type === 'grass') {
          // 3-color grass variation (no grid lines for RPG feel)
          const grassColors = [c.floor, c.floorAlt, this.darken(c.floor, 0.04)];
          ctx.fillStyle = grassColors[(x * 7 + y * 13) % 3];
          ctx.fillRect(sx, sy, ts, ts);
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          // Dot scatter (darker and lighter specks)
          if (noise % 3 === 0) {
            ctx.fillStyle = this.darken(c.floor, 0.12);
            ctx.fillRect(sx + ((noise * 3) % ts), sy + ((noise * 7) % ts), 1, 1);
            ctx.fillRect(sx + ((noise * 11) % ts), sy + ((noise * 5) % ts), 1, 1);
          }
          if (noise % 4 === 0) {
            ctx.fillStyle = this.lighten(c.floorAlt, 0.08);
            ctx.fillRect(sx + ((noise * 9) % ts), sy + ((noise * 2) % ts), 1, 1);
          }
          // Grass tufts
          if (noise % 5 < 2) {
            ctx.fillStyle = this.darken(c.plantLeaf, 0.1);
            ctx.fillRect(sx + ts * .25, sy + ts * .7, ts * .04, ts * .14);
            ctx.fillRect(sx + ts * .45, sy + ts * .65, ts * .03, ts * .18);
            ctx.fillRect(sx + ts * .34, sy + ts * .72, ts * .03, ts * .12);
          }
          if (noise % 7 === 0) {
            ctx.fillStyle = this.lighten(c.plantLeafAlt, 0.1);
            ctx.fillRect(sx + ts * .7, sy + ts * .3, ts * .04, ts * .12);
            ctx.fillRect(sx + ts * .78, sy + ts * .35, ts * .03, ts * .1);
          }
          // Tiny wildflowers every ~18 tiles
          if (noise % 18 === 0) {
            const flowerCol = ['#E74C3C', '#F1C40F', '#FF69B4', '#FFFFFF'][noise % 4];
            ctx.fillStyle = flowerCol;
            ctx.fillRect(sx + ts * .5, sy + ts * .4, 2, 2);
          }
        } else if (t.type === 'road' || t.type === 'road_cross') {
          // Irregular cobblestone road (no grid lines)
          const roadBase = '#8A8A7A';
          ctx.fillStyle = roadBase;
          ctx.fillRect(sx, sy, ts, ts);
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          // Irregular cobblestones with color variation
          const stoneColors = ['#A29A8A', '#9A9282', '#8E8678', '#96907E'];
          const stoneH = Math.max(2, Math.floor(ts / 3));
          const stoneW = Math.max(3, Math.floor(ts / 2));
          for (let row = 0; row < ts; row += stoneH) {
            const rowOffset = (Math.floor(row / stoneH) % 2) * Math.floor(stoneW / 2);
            for (let col = -rowOffset; col < ts; col += stoneW) {
              const si = Math.abs((col + row + noise) * 7) % 4;
              ctx.fillStyle = stoneColors[si];
              const sw = stoneW - 1 + ((si % 2) === 0 ? 0 : -1);
              ctx.fillRect(sx + Math.max(0, col), sy + row, Math.min(sw, ts - Math.max(0, col)), stoneH - 1);
            }
            // Mortar lines
            ctx.fillStyle = '#6A6258';
            ctx.fillRect(sx, sy + row + stoneH - 1, ts, 1);
          }
          if (t.type === 'road_cross') {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(sx + ts * .1, sy + ts * .45, ts * .8, ts * .1);
            ctx.fillRect(sx + ts * .45, sy + ts * .1, ts * .1, ts * .8);
          }
        } else if (t.type === 'cobblestone') {
          // Slightly lighter cobblestone variant (no grid lines)
          ctx.fillStyle = '#9A9080';
          ctx.fillRect(sx, sy, ts, ts);
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          const stoneColors2 = ['#A8A090', '#9E9688', '#928A7E', '#A49C8C'];
          const stH = Math.max(2, Math.floor(ts / 3));
          const stW = Math.max(3, Math.floor(ts / 2));
          for (let row = 0; row < ts; row += stH) {
            const rowOff = (Math.floor(row / stH) % 2) * Math.floor(stW / 2);
            for (let col = -rowOff; col < ts; col += stW) {
              ctx.fillStyle = stoneColors2[Math.abs((col + row + noise) * 5) % 4];
              ctx.fillRect(sx + Math.max(0, col), sy + row, Math.min(stW - 1, ts - Math.max(0, col)), stH - 1);
            }
            ctx.fillStyle = '#7A7268';
            ctx.fillRect(sx, sy + row + stH - 1, ts, 1);
          }
        } else if (t.type === 'town_stairs') {
          // City hall wide stone stairs
          const stairBase = '#B0A89A';
          ctx.fillStyle = stairBase;
          ctx.fillRect(sx, sy, ts, ts);
          // Horizontal stair step lines — each row of tiles is one step
          ctx.fillStyle = '#C8C0B4';
          ctx.fillRect(sx, sy, ts, Math.max(1, ts * 0.15)); // step edge highlight
          ctx.fillStyle = '#8A8278';
          ctx.fillRect(sx, sy + ts - Math.max(1, ts * 0.1), ts, Math.max(1, ts * 0.1)); // step shadow
          // Subtle stone texture
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          if (noise % 3 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.03)';
            ctx.fillRect(sx + ts * 0.2, sy + ts * 0.3, ts * 0.3, ts * 0.2);
          }
        } else if (t.type === 'building_floor') {
          // Warm wood floor (no grid lines, plank pattern)
          const baseColor = (x + y) % 2 === 0 ? '#C4A06A' : '#BA9660';
          ctx.fillStyle = baseColor;
          ctx.fillRect(sx, sy, ts, ts);
          // Wood grain lines
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          if (noise % 3 < 2) {
            ctx.fillStyle = this.darken(baseColor, 0.06);
            ctx.fillRect(sx + 1, sy + ts * .35, ts - 2, 1);
            ctx.fillRect(sx + 3, sy + ts * .65, ts - 6, 1);
          }
          // Baseboard shadow at edges where floor meets wall
          if (y > 0 && !w.tiles[y - 1][x].walkable) {
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.fillRect(sx, sy, ts, 2);
          }
          if (x > 0 && !w.tiles[y][x - 1].walkable) {
            ctx.fillStyle = 'rgba(0,0,0,0.04)';
            ctx.fillRect(sx, sy, 2, ts);
          }
        } else if (t.type === 'building_wall') {
          // Stone/wood facade with detail
          this.shadedRect(sx, sy, ts, ts, c.wall, { outline: false, highlightAmt: 0.08, shadowAmt: 0.1 });
          // Stone mortar lines for texture
          const noise2 = this.floorNoise[y * w.gridWidth + x] || 0;
          if (noise2 % 3 === 0) {
            ctx.fillStyle = this.darken(c.wall, 0.06);
            ctx.fillRect(sx + 1, sy + ts * .45, ts - 2, 1);
          }
          if (noise2 % 4 === 0) {
            ctx.fillStyle = this.darken(c.wall, 0.05);
            ctx.fillRect(sx + ts * .3, sy + ts * .2, 1, ts * .25);
          }
          ctx.fillStyle = c.wallTop;
          ctx.fillRect(sx, sy, ts, ts * 0.28);
          ctx.fillStyle = this.lighten(c.wallTop, 0.15);
          ctx.fillRect(sx, sy, ts, Math.max(1, ts * 0.04));
          // Clean walls — no windows or torches
          ctx.strokeStyle = c.wallBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
        } else if (t.type === 'building_door') {
          const doorKey = `${x},${y}`;
          const isOpen = this.openDoors.has(doorKey);

          if (isOpen) {
            // OPEN DOOR — dark interior with door panel swung to side
            // Dark interior
            ctx.fillStyle = '#2A1A10';
            ctx.fillRect(sx, sy, ts, ts);
            // Warm interior light spill
            ctx.fillStyle = 'rgba(255,200,100,0.15)';
            ctx.fillRect(sx + ts * .1, sy + ts * .1, ts * .8, ts * .8);
            // Interior floor hint
            ctx.fillStyle = '#3A2A18';
            ctx.fillRect(sx + ts * .15, sy + ts * .7, ts * .7, ts * .25);
            // Door frame (stone arch)
            ctx.fillStyle = this.darken(c.wall, 0.1);
            ctx.fillRect(sx, sy, ts * .1, ts);           // left frame
            ctx.fillRect(sx + ts * .9, sy, ts * .1, ts);  // right frame
            ctx.fillRect(sx, sy, ts, ts * .06);           // top frame
            // Door panel swung to right side (narrow sliver)
            ctx.fillStyle = '#7A5A32';
            ctx.fillRect(sx + ts * .82, sy + ts * .08, ts * .08, ts * .84);
            ctx.fillStyle = this.darken('#7A5A32', 0.15);
            ctx.fillRect(sx + ts * .82, sy + ts * .08, 1, ts * .84);
            // Handle on edge of swung door
            ctx.fillStyle = '#CCAA44';
            ctx.fillRect(sx + ts * .83, sy + ts * .45, 2, 2);
            // Hinges visible on frame
            ctx.fillStyle = '#555';
            ctx.fillRect(sx + ts * .88, sy + ts * .2, ts * .04, ts * .03);
            ctx.fillRect(sx + ts * .88, sy + ts * .6, ts * .04, ts * .03);
          } else {
            // CLOSED DOOR — arched wooden door, RPG style
            const doorColor = '#7A5A32';
            ctx.fillStyle = '#9A8A6A';
            ctx.fillRect(sx, sy, ts, ts);
            // Door body with wood grain
            this.shadedRect(sx + ts * .15, sy + ts * .05, ts * .7, ts * .9, doorColor);
            // Vertical wood planks
            ctx.fillStyle = this.darken(doorColor, 0.08);
            ctx.fillRect(sx + ts * .35, sy + ts * .08, 1, ts * .82);
            ctx.fillRect(sx + ts * .55, sy + ts * .08, 1, ts * .82);
            // Lighter center highlight
            ctx.fillStyle = this.lighten(doorColor, 0.1);
            ctx.fillRect(sx + ts * .38, sy + ts * .15, ts * .16, ts * .7);
            // Arched top
            ctx.fillStyle = this.darken(doorColor, 0.2);
            ctx.fillRect(sx + ts * .12, sy, ts * .76, ts * .04);
            ctx.fillRect(sx + ts * .12, sy, ts * .04, ts * .9);
            ctx.fillRect(sx + ts * .84, sy, ts * .04, ts * .9);
            // Metal hinges
            ctx.fillStyle = '#555';
            ctx.fillRect(sx + ts * .15, sy + ts * .2, ts * .08, ts * .03);
            ctx.fillRect(sx + ts * .15, sy + ts * .6, ts * .08, ts * .03);
            // Door handle — ornate round knob
            ctx.fillStyle = '#CCAA44';
            ctx.beginPath(); ctx.arc(sx + ts * .68, sy + ts * .5, ts * .04, 0, Math.PI * 2); ctx.fill();
            // Handle highlight
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(sx + ts * .67, sy + ts * .48, 1, 1);
          }
        } else if (t.type === 'building_roof' || t.type === 'building_roof_red'
                   || t.type === 'building_roof_blue' || t.type === 'building_roof_brown'
                   || t.type === 'building_roof_green') {
          const roofMap: Record<string, string> = {
            building_roof: '#6A4A3A',
            building_roof_red: '#B03030',
            building_roof_blue: '#3060A0',
            building_roof_brown: '#8A6A40',
            building_roof_green: '#3A7A3A',
          };
          const roofColor = roofMap[t.type] ?? '#6A4A3A';
          ctx.fillStyle = roofColor;
          ctx.fillRect(sx, sy, ts, ts);
          // Shingle pattern (offset brick style)
          const shingleH = Math.max(2, Math.floor(ts / 3));
          const shingleW = Math.max(3, Math.floor(ts / 2));
          for (let row = 0; row < ts; row += shingleH) {
            const offset = ((row / shingleH) % 2) * Math.floor(shingleW / 2);
            // Darker mortar line
            ctx.fillStyle = this.darken(roofColor, 0.15);
            ctx.fillRect(sx, sy + row + shingleH - 1, ts, 1);
            // Vertical mortar
            for (let col = -offset; col < ts; col += shingleW) {
              ctx.fillRect(sx + col + shingleW - 1, sy + row, 1, shingleH);
            }
          }
          // Ridge line (lighter horizontal stripe at 15% from top)
          ctx.fillStyle = this.lighten(roofColor, 0.2);
          ctx.fillRect(sx, sy + ts * 0.14, ts, Math.max(1, ts * 0.05));
          // Highlight on top edge for 3D effect
          ctx.fillStyle = this.lighten(roofColor, 0.15);
          ctx.fillRect(sx, sy, ts, Math.max(1, ts * 0.06));
          // Bottom shadow edge (roof overhang)
          ctx.fillStyle = this.darken(roofColor, 0.2);
          ctx.fillRect(sx, sy + ts - 1, ts, 1);
          // Overhang shadow on tile below if it's a wall
          if (y + 1 < w.gridHeight) {
            const below = w.tiles[y + 1][x].type;
            if (below === 'building_wall' || below === 'building_window' || below === 'building_door') {
              ctx.fillStyle = 'rgba(0,0,0,0.15)';
              ctx.fillRect(sx, (y + 1) * ts, ts, Math.max(2, ts * 0.12));
            }
          }
        } else if (t.type === 'building_chimney') {
          // Roof background first
          ctx.fillStyle = '#6A4A3A';
          ctx.fillRect(sx, sy, ts, ts);
          // Chimney structure
          this.shadedRect(sx + ts * .3, sy + ts * .15, ts * .4, ts * .75, '#7A6A5A');
          // Chimney top rim
          ctx.fillStyle = '#8A7A6A';
          ctx.fillRect(sx + ts * .25, sy + ts * .1, ts * .5, ts * .08);
          // Enhanced smoke wisps (4 particles at different lifecycle stages)
          for (let i = 0; i < 4; i++) {
            const age = (Date.now() * 0.001 + i * 0.8) % 3;
            const smokeX2 = sx + ts * 0.45 + Math.sin(age * 2 + i) * ts * 0.08;
            const smokeY2 = sy + ts * 0.05 - age * ts * 0.12;
            const smokeAlpha = Math.max(0, 0.3 - age * 0.1);
            const smokeSize = ts * (0.04 + age * 0.025);
            ctx.fillStyle = `rgba(200,200,210,${smokeAlpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(smokeX2, smokeY2, smokeSize, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (t.type === 'building_window') {
          // Wall background
          this.shadedRect(sx, sy, ts, ts, c.wall, { outline: false, highlightAmt: 0.08, shadowAmt: 0.1 });
          ctx.fillStyle = c.wallTop;
          ctx.fillRect(sx, sy, ts, ts * 0.28);
          ctx.fillStyle = this.lighten(c.wallTop, 0.15);
          ctx.fillRect(sx, sy, ts, Math.max(1, ts * 0.04));
          // Warm interior glow behind glass
          const glowFlicker = 0.3 + Math.sin(Date.now() * 0.002 + x * 3.7) * 0.05;
          ctx.fillStyle = `rgba(255,200,100,${glowFlicker.toFixed(2)})`;
          ctx.fillRect(sx + ts * .18, sy + ts * .33, ts * .64, ts * .44);
          // Window
          this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .5, '#4A6A8A', { highlightAmt: 0.15 });
          // Glass reflection
          ctx.fillStyle = 'rgba(150,200,255,0.15)';
          ctx.fillRect(sx + ts * .18, sy + ts * .33, ts * .2, ts * .12);
          // Window frame cross
          ctx.fillStyle = c.wallBorder;
          ctx.fillRect(sx + ts * .48, sy + ts * .3, ts * .04, ts * .5);
          ctx.fillRect(sx + ts * .15, sy + ts * .53, ts * .7, ts * .04);
          // Shutters on sides
          ctx.fillStyle = this.darken(c.wall, 0.15);
          ctx.fillRect(sx + ts * .05, sy + ts * .3, ts * .08, ts * .5);
          ctx.fillRect(sx + ts * .87, sy + ts * .3, ts * .08, ts * .5);
          // Window sill with flower box
          ctx.fillStyle = this.lighten(c.wall, 0.1);
          ctx.fillRect(sx + ts * .12, sy + ts * .78, ts * .76, ts * .06);
          // Flower box below sill
          ctx.fillStyle = '#6B4423';
          ctx.fillRect(sx + ts * .15, sy + ts * .84, ts * .7, ts * .08);
          // Tiny flowers in box
          const fColors = ['#E74C3C', '#F1C40F', '#FF69B4'];
          for (let f = 0; f < 3; f++) {
            ctx.fillStyle = '#3A7A2A';
            ctx.fillRect(sx + ts * (.25 + f * .2), sy + ts * .78, 1, ts * .06);
            ctx.fillStyle = fColors[f];
            ctx.fillRect(sx + ts * (.24 + f * .2), sy + ts * .76, 2, 2);
          }
          ctx.strokeStyle = c.wallBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
        } else if (t.type === 'building_awning') {
          // Wall background
          this.shadedRect(sx, sy, ts, ts, c.wall, { outline: false });
          // Striped awning
          const stripeW = Math.max(2, Math.floor(ts / 4));
          for (let sx2 = 0; sx2 < ts; sx2 += stripeW * 2) {
            ctx.fillStyle = '#CC4444';
            ctx.fillRect(sx + sx2, sy + ts * .5, stripeW, ts * .35);
            ctx.fillStyle = '#EEEECC';
            ctx.fillRect(sx + sx2 + stripeW, sy + ts * .5, stripeW, ts * .35);
          }
          // Shadow under awning
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(sx, sy + ts * .85, ts, ts * .15);
        } else if (t.type === 'town_hedge') {
          // Dense foliage border
          const hedgeBase = '#2A5A2A';
          ctx.fillStyle = hedgeBase;
          ctx.fillRect(sx, sy, ts, ts);
          // Leafy texture (multiple circles)
          const leafColors = ['#3A6A2A', '#2A6A3A', '#4A7A3A', '#356830'];
          for (let i = 0; i < 5; i++) {
            const lx = sx + ((i * 7 + x * 3) % ts);
            const ly = sy + ((i * 11 + y * 5) % ts);
            const lr = ts * (.18 + (i % 3) * .06);
            ctx.fillStyle = leafColors[i % leafColors.length];
            ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
          }
          // Dark outline
          ctx.strokeStyle = '#1A4A1A';
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
        } else if (t.type === 'pathway') {
          // Stepping-stone dirt path (no grid lines)
          const pathColor = '#9A8A6A';
          ctx.fillStyle = pathColor;
          ctx.fillRect(sx, sy, ts, ts);
          // Stepping stones
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          const stoneColors = ['#B0A080', '#A89878', '#9E9070'];
          for (let s = 0; s < 3; s++) {
            const stX = sx + ((noise * (s + 1) * 7) % Math.max(1, Math.floor(ts * 0.6))) + ts * 0.1;
            const stY = sy + ((noise * (s + 1) * 11) % Math.max(1, Math.floor(ts * 0.6))) + ts * 0.1;
            const stR = ts * (0.12 + (s % 2) * 0.04);
            ctx.fillStyle = stoneColors[s];
            ctx.beginPath(); ctx.arc(stX, stY, stR, 0, Math.PI * 2); ctx.fill();
          }
          // Softer edges via grass-colored border pixels
          ctx.fillStyle = this.colors.floor;
          ctx.fillRect(sx, sy, 1, ts);
          ctx.fillRect(sx + ts - 1, sy, 1, ts);
          ctx.fillRect(sx, sy, ts, 1);
          ctx.fillRect(sx, sy + ts - 1, ts, 1);
        } else {
          const baseColor = (x + y) % 2 === 0 ? c.floor : c.floorAlt;
          ctx.fillStyle = baseColor;
          ctx.fillRect(sx, sy, ts, ts);

          // Subtle noise dithering (1-3 dots per tile)
          const noise = this.floorNoise[y * w.gridWidth + x] || 0;
          const dotCount = (noise % 3) + 1;
          ctx.fillStyle = this.darken(baseColor, 0.06);
          for (let d = 0; d < dotCount; d++) {
            const dx = ((noise * (d + 1) * 7) % Math.max(1, ts - 4)) + 2;
            const dy = ((noise * (d + 1) * 13) % Math.max(1, ts - 4)) + 2;
            const dotSize = Math.max(1, Math.floor(this.scale * 0.3));
            ctx.fillRect(sx + dx, sy + dy, dotSize, dotSize);
          }

          // Environment-specific floor detail
          this.drawFloorDetail(sx, sy, x, y, noise, baseColor);

          // Grid line (subtle)
          ctx.strokeStyle = c.floorGrid;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
        }
      }
    }

    // Wall-adjacent shadow pass
    this.drawWallShadows();

    // Terrain edge transitions (grass ↔ road/cobblestone/floor blending)
    if (this.env === 'town' || this.env === 'farm') this.drawTerrainEdges();
  }

  private drawFloorDetail(sx: number, sy: number, gx: number, gy: number, noise: number, baseColor: string): void {
    const { ctx, ts } = this;
    switch (this.env) {
      case 'office':
        // Subtle carpet fiber texture dots
        if (noise % 5 === 0) {
          ctx.fillStyle = this.darken(baseColor, 0.04);
          ctx.fillRect(sx + ((noise * 3) % ts), sy + ((noise * 7) % ts), 1, 1);
          ctx.fillRect(sx + ((noise * 11) % ts), sy + ((noise * 13) % ts), 1, 1);
        }
        if (noise % 9 === 0) {
          ctx.fillStyle = this.lighten(baseColor, 0.03);
          ctx.fillRect(sx + ((noise * 5) % ts), sy + ((noise * 2) % ts), 1, 1);
        }
        break;
      case 'farm':
        // Occasional grass tufts
        if (noise % 7 === 0) {
          ctx.fillStyle = '#4A8A2A';
          ctx.fillRect(sx + ts * .3, sy + ts * .72, ts * .04, ts * .12);
          ctx.fillRect(sx + ts * .5, sy + ts * .68, ts * .03, ts * .16);
          ctx.fillRect(sx + ts * .38, sy + ts * .75, ts * .03, ts * .1);
        }
        break;
      case 'pirate_ship':
        // Wood grain
        if (noise % 4 < 2) {
          ctx.fillStyle = this.darken(baseColor, 0.06);
          ctx.fillRect(sx + 2, sy + ts * .35, ts - 4, 1);
          ctx.fillRect(sx + 4, sy + ts * .65, ts - 8, 1);
        }
        break;
      case 'hospital':
        // Modern floor with subtle reflections and ledge highlights
        if (noise % 11 === 0) {
          ctx.fillStyle = this.lighten(baseColor, 0.08);
          ctx.fillRect(sx + ts * .2, sy + ts * .2, ts * .15, ts * .08);
        }
        break;
      case 'rocket':
        // Metal plate seam lines and occasional hazard stripe
        if (gy % 2 === 0) {
          ctx.fillStyle = this.darken(baseColor, 0.06);
          ctx.fillRect(sx, sy + ts - 1, ts, 1);
        }
        if (gx % 3 === 0) {
          ctx.fillStyle = this.darken(baseColor, 0.04);
          ctx.fillRect(sx + ts - 1, sy, 1, ts);
        }
        // Occasional hazard stripe near edges
        if (noise % 23 === 0) {
          ctx.fillStyle = 'rgba(255,180,0,0.12)';
          ctx.fillRect(sx, sy + ts * .4, ts, ts * .2);
          ctx.fillStyle = 'rgba(20,20,20,0.1)';
          for (let s = 0; s < ts; s += 4) {
            ctx.fillRect(sx + s, sy + ts * .4, 2, ts * .2);
          }
        }
        break;
      case 'space_station':
        // Panel seam lines every 2 tiles
        if (gy % 2 === 0) {
          ctx.fillStyle = this.lighten(baseColor, 0.04);
          ctx.fillRect(sx + ts * .48, sy, ts * .04, ts);
        }
        break;
      case 'town':
        // Grass tufts similar to farm
        if (noise % 7 === 0) {
          ctx.fillStyle = '#4A8A2A';
          ctx.fillRect(sx + ts * .3, sy + ts * .72, ts * .04, ts * .12);
          ctx.fillRect(sx + ts * .5, sy + ts * .68, ts * .03, ts * .16);
          ctx.fillRect(sx + ts * .38, sy + ts * .75, ts * .03, ts * .1);
        }
        break;
    }
  }

  /** Draw soft grass edges where grass meets hard terrain (road, cobblestone, pathway) */
  private drawTerrainEdges(): void {
    const { ctx, ts } = this;
    const w = this.world;
    const c = this.colors;
    const isHard = (t: string) => t === 'road' || t === 'cobblestone' || t === 'road_cross' || t === 'pathway'
      || t === 'floor' || t === 'building_floor' || t === 'town_stairs';
    const isGrass = (t: string) => t === 'grass' || t === 'town_tree' || t === 'lamppost' || t === 'bench'
      || t === 'flower_bed' || t === 'fence' || t === 'mailbox' || t === 'signpost'
      || t === 'fountain' || t === 'market_stall' || t === 'well'
      || t === 'crop' || t === 'hay_bale' || t === 'tree';
    const edgeDepth = Math.max(2, Math.floor(ts * 0.18));

    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        if (!isHard(w.tiles[y][x].type)) continue;
        const sx = x * ts, sy = y * ts;
        const noise = this.floorNoise[y * w.gridWidth + x] || 0;

        // Check cardinal neighbors for grass and draw soft edge
        // North: grass above → grass creeps down into this tile
        if (y > 0 && isGrass(w.tiles[y - 1][x].type)) {
          for (let px = 0; px < ts; px++) {
            const d = edgeDepth + Math.sin(px * 1.3 + noise * 0.5) * 1.5;
            ctx.fillStyle = (px + noise) % 5 < 3 ? c.floor : c.floorAlt;
            ctx.fillRect(sx + px, sy, 1, Math.max(1, Math.round(d)));
          }
          // 1px shadow on inner edge
          ctx.fillStyle = 'rgba(0,0,0,0.06)';
          ctx.fillRect(sx, sy + edgeDepth, ts, 1);
        }
        // South: grass below
        if (y < w.gridHeight - 1 && isGrass(w.tiles[y + 1][x].type)) {
          for (let px = 0; px < ts; px++) {
            const d = edgeDepth + Math.sin(px * 1.1 + noise * 0.7) * 1.5;
            ctx.fillStyle = (px + noise) % 5 < 3 ? c.floor : c.floorAlt;
            ctx.fillRect(sx + px, sy + ts - Math.round(d), 1, Math.max(1, Math.round(d)));
          }
          ctx.fillStyle = 'rgba(0,0,0,0.06)';
          ctx.fillRect(sx, sy + ts - edgeDepth - 1, ts, 1);
        }
        // West: grass left
        if (x > 0 && isGrass(w.tiles[y][x - 1].type)) {
          for (let py = 0; py < ts; py++) {
            const d = edgeDepth + Math.sin(py * 1.2 + noise * 0.3) * 1.5;
            ctx.fillStyle = (py + noise) % 5 < 3 ? c.floor : c.floorAlt;
            ctx.fillRect(sx, sy + py, Math.max(1, Math.round(d)), 1);
          }
        }
        // East: grass right
        if (x < w.gridWidth - 1 && isGrass(w.tiles[y][x + 1].type)) {
          for (let py = 0; py < ts; py++) {
            const d = edgeDepth + Math.sin(py * 0.9 + noise * 0.6) * 1.5;
            ctx.fillStyle = (py + noise) % 5 < 3 ? c.floor : c.floorAlt;
            ctx.fillRect(sx + ts - Math.round(d), sy + py, Math.max(1, Math.round(d)), 1);
          }
        }
      }
    }
  }

  /** Update which doors are open based on agent proximity (Manhattan distance ≤ 2) */
  private updateDoorStates(agents: Agent[]): void {
    const w = this.world;
    const now = Date.now();
    const CLOSE_DEBOUNCE = 500; // ms before a door closes after agents leave

    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        if (w.tiles[y][x].type !== 'building_door') continue;
        const key = `${x},${y}`;
        const agentNearby = agents.some(a => {
          const dist = Math.abs(Math.round(a.x) - x) + Math.abs(Math.round(a.y) - y);
          return dist <= 2;
        });

        if (agentNearby) {
          this.openDoors.add(key);
          this.doorCloseTimers.delete(key);
        } else if (this.openDoors.has(key)) {
          // Start close timer if not already started
          if (!this.doorCloseTimers.has(key)) {
            this.doorCloseTimers.set(key, now + CLOSE_DEBOUNCE);
          }
          // Close door when timer expires
          if (now >= (this.doorCloseTimers.get(key) ?? 0)) {
            this.openDoors.delete(key);
            this.doorCloseTimers.delete(key);
          }
        }
      }
    }
  }

  /** Draw peaked triangular roofs above flat roof tile rows for a classic RPG look */
  private drawPeakedRoofs(): void {
    const { ctx, ts } = this;
    const w = this.world;
    const isRoof = (t: string) => t === 'building_roof' || t === 'building_roof_red'
      || t === 'building_roof_blue' || t === 'building_roof_brown'
      || t === 'building_roof_green';

    const roofColorMap: Record<string, string> = {
      building_roof: '#6A4A3A', building_roof_red: '#B03030',
      building_roof_blue: '#3060A0', building_roof_brown: '#8A6A40',
      building_roof_green: '#3A7A3A',
    };

    // Find the BOTTOM row of each roof (where the roof meets the wall)
    // We draw the peaked portion covering the entire roof area + extending above it
    const processed = new Set<string>();

    for (let y = 0; y < w.gridHeight; y++) {
      let x = 0;
      while (x < w.gridWidth) {
        const t = w.tiles[y][x].type;
        if (!isRoof(t)) { x++; continue; }

        // Only process from topmost roof row
        if (y > 0 && isRoof(w.tiles[y - 1][x].type)) { x++; continue; }

        const key = `${x},${y}`;
        if (processed.has(key)) { x++; continue; }

        // Find contiguous horizontal run width
        const startX = x;
        const roofType = t;
        while (x < w.gridWidth && isRoof(w.tiles[y][x].type)) x++;
        const endX = x;
        const runWidth = endX - startX;

        if (runWidth < 3) continue;

        // Find how many roof rows deep this building is
        let roofDepth = 1;
        for (let checkY = y + 1; checkY < w.gridHeight; checkY++) {
          if (isRoof(w.tiles[checkY][startX].type)) roofDepth++;
          else break;
        }

        // Mark all roof tiles processed
        for (let ry = y; ry < y + roofDepth; ry++) {
          for (let rx = startX; rx < endX; rx++) {
            processed.add(`${rx},${ry}`);
          }
        }

        const baseColor = roofColorMap[roofType] || '#6A4A3A';
        const leftColor = this.lighten(baseColor, 0.12);
        const rightColor = this.darken(baseColor, 0.18);
        const ridgeColor = this.lighten(baseColor, 0.3);
        const darkEdge = this.darken(baseColor, 0.25);

        const sx = startX * ts;
        const sy = y * ts;
        const rw = runWidth * ts;
        const roofBottom = (y + roofDepth) * ts; // bottom of flat roof tiles
        const overhang = ts * 0.25;

        // Peak height: tall and dramatic — 50-75% of building width
        const peakH = Math.max(ts * 1.5, rw * 0.4);
        const centerX = sx + rw / 2;
        const peakY = sy - peakH;

        // ── Background: fill the flat roof tile area with roof color ──
        ctx.fillStyle = baseColor;
        ctx.fillRect(sx, sy, rw, roofDepth * ts);

        // ── Left slope (lighter — sun-facing) ──
        ctx.fillStyle = leftColor;
        ctx.beginPath();
        ctx.moveTo(sx - overhang, roofBottom);
        ctx.lineTo(centerX, peakY);
        ctx.lineTo(centerX, roofBottom);
        ctx.closePath();
        ctx.fill();

        // ── Right slope (darker — shadow) ──
        ctx.fillStyle = rightColor;
        ctx.beginPath();
        ctx.moveTo(centerX, peakY);
        ctx.lineTo(sx + rw + overhang, roofBottom);
        ctx.lineTo(centerX, roofBottom);
        ctx.closePath();
        ctx.fill();

        // ── Shingle rows — brick-pattern horizontal lines ──
        const shingleStep = Math.max(3, ts * 0.25);
        const totalH = roofBottom - peakY;
        for (let si = shingleStep; si < totalH; si += shingleStep) {
          const frac = si / totalH;
          // Width at this height
          const halfW = (rw / 2 + overhang) * frac;
          const lineY = peakY + si;
          // Alternating offset for brick pattern
          const offset = (Math.floor(si / shingleStep) % 2 === 0) ? 0 : shingleStep * 0.5;

          // Left slope shingle line
          ctx.strokeStyle = this.darken(leftColor, 0.08);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(centerX - halfW, lineY);
          ctx.lineTo(centerX, lineY);
          ctx.stroke();

          // Right slope shingle line
          ctx.strokeStyle = this.darken(rightColor, 0.06);
          ctx.beginPath();
          ctx.moveTo(centerX, lineY);
          ctx.lineTo(centerX + halfW, lineY);
          ctx.stroke();

          // Vertical stagger marks (brick pattern)
          const markSpacing = Math.max(4, ts * 0.4);
          for (let mx = centerX - halfW + offset; mx < centerX; mx += markSpacing) {
            ctx.strokeStyle = this.darken(leftColor, 0.06);
            ctx.beginPath();
            ctx.moveTo(mx, lineY);
            ctx.lineTo(mx, lineY + shingleStep * 0.8);
            ctx.stroke();
          }
          for (let mx = centerX + offset; mx < centerX + halfW; mx += markSpacing) {
            ctx.strokeStyle = this.darken(rightColor, 0.05);
            ctx.beginPath();
            ctx.moveTo(mx, lineY);
            ctx.lineTo(mx, lineY + shingleStep * 0.8);
            ctx.stroke();
          }
        }

        // ── Ridge line at peak (thick, bright) ──
        ctx.strokeStyle = ridgeColor;
        ctx.lineWidth = Math.max(2, this.scale * 0.8);
        ctx.beginPath();
        ctx.moveTo(sx - overhang, roofBottom);
        ctx.lineTo(centerX, peakY);
        ctx.lineTo(sx + rw + overhang, roofBottom);
        ctx.stroke();

        // ── Ridge cap (small triangle at very top) ──
        ctx.fillStyle = ridgeColor;
        ctx.beginPath();
        ctx.moveTo(centerX - ts * 0.15, peakY + ts * 0.1);
        ctx.lineTo(centerX, peakY - ts * 0.05);
        ctx.lineTo(centerX + ts * 0.15, peakY + ts * 0.1);
        ctx.closePath();
        ctx.fill();

        // ── Eaves (dark border strip along bottom edges) ──
        ctx.fillStyle = darkEdge;
        const eavesH = Math.max(2, ts * 0.12);
        // Left eave
        ctx.beginPath();
        ctx.moveTo(sx - overhang, roofBottom);
        ctx.lineTo(sx - overhang, roofBottom + eavesH);
        ctx.lineTo(centerX, roofBottom + eavesH);
        ctx.lineTo(centerX, roofBottom);
        ctx.closePath();
        ctx.fill();
        // Right eave
        ctx.beginPath();
        ctx.moveTo(centerX, roofBottom);
        ctx.lineTo(centerX, roofBottom + eavesH);
        ctx.lineTo(sx + rw + overhang, roofBottom + eavesH);
        ctx.lineTo(sx + rw + overhang, roofBottom);
        ctx.closePath();
        ctx.fill();

        // ── Drop shadow on wall below roof ──
        const shadowGrad = ctx.createLinearGradient(sx, roofBottom, sx, roofBottom + ts * 0.4);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.2)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(sx - overhang, roofBottom, rw + overhang * 2, ts * 0.4);

        // ── Dormer window (on wide buildings ≥ 8 tiles) ──
        if (runWidth >= 8) {
          const dormerX = centerX - ts * 0.5;
          const dormerW = ts;
          const dormerBaseY = peakY + totalH * 0.45;
          const dormerPeakY = dormerBaseY - ts * 0.5;
          // Dormer face
          ctx.fillStyle = this.lighten(baseColor, 0.05);
          ctx.fillRect(dormerX, dormerBaseY - ts * 0.3, dormerW, ts * 0.3);
          // Dormer roof
          ctx.fillStyle = this.darken(baseColor, 0.1);
          ctx.beginPath();
          ctx.moveTo(dormerX - ts * 0.1, dormerBaseY - ts * 0.3);
          ctx.lineTo(dormerX + dormerW / 2, dormerPeakY);
          ctx.lineTo(dormerX + dormerW + ts * 0.1, dormerBaseY - ts * 0.3);
          ctx.closePath();
          ctx.fill();
          // Dormer window glass
          ctx.fillStyle = 'rgba(100,180,255,0.35)';
          ctx.fillRect(dormerX + ts * 0.2, dormerBaseY - ts * 0.25, ts * 0.6, ts * 0.2);
          // Window frame
          ctx.strokeStyle = this.darken(baseColor, 0.2);
          ctx.lineWidth = 1;
          ctx.strokeRect(dormerX + ts * 0.2, dormerBaseY - ts * 0.25, ts * 0.6, ts * 0.2);
        }

        // ── Chimneys sticking through the roof ──
        for (let cx2 = startX; cx2 < endX; cx2++) {
          if (w.tiles[y][cx2].type === 'building_chimney') {
            const chimSx = cx2 * ts;
            // Height of roof at chimney position
            const chimFrac = (cx2 - startX + 0.5) / runWidth;
            const distFromCenter = Math.abs(chimFrac - 0.5) * 2; // 0 at center, 1 at edge
            const roofAtChim = peakY + totalH * distFromCenter;
            // Chimney body
            ctx.fillStyle = '#7A6A5A';
            ctx.fillRect(chimSx + ts * .3, roofAtChim - ts * 0.6, ts * .4, roofBottom - roofAtChim + ts * 0.6);
            // Chimney cap
            ctx.fillStyle = '#8A7A6A';
            ctx.fillRect(chimSx + ts * .22, roofAtChim - ts * 0.65, ts * .56, ts * .1);
            // Chimney lip
            ctx.fillStyle = '#6A5A4A';
            ctx.fillRect(chimSx + ts * .25, roofAtChim - ts * 0.56, ts * .5, ts * .04);
          }
        }
      }
    }
  }

  private drawWallShadows(): void {
    const { ctx, ts } = this;
    const w = this.world;
    const shadowSize = Math.max(2, ts * 0.12);

    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const tileType = w.tiles[y][x].type;
        if (tileType === 'wall' || tileType === 'ship_hull' || tileType === 'empty'
            || tileType === 'building_wall' || tileType === 'building_roof'
            || tileType === 'building_roof_red' || tileType === 'building_roof_blue'
            || tileType === 'building_roof_brown' || tileType === 'building_roof_green'
            || tileType === 'building_chimney' || tileType === 'building_window'
            || tileType === 'town_hedge') continue;
        const sx = x * ts, sy = y * ts;

        // Shadow below walls
        if (y > 0 && (w.tiles[y - 1][x].type === 'wall' || w.tiles[y - 1][x].type === 'ship_hull')) {
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(sx, sy, ts, shadowSize);
        }
        // Shadow right of walls
        if (x > 0 && (w.tiles[y][x - 1].type === 'wall' || w.tiles[y][x - 1].type === 'ship_hull')) {
          ctx.fillStyle = 'rgba(0,0,0,0.05)';
          ctx.fillRect(sx, sy, shadowSize * 0.7, ts);
        }
      }
    }
  }

  private drawWallTile(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const c = this.colors;
    // Wall body
    this.shadedRect(sx, sy, ts, ts, c.wall, { outline: false, highlightAmt: 0.08, shadowAmt: 0.1 });
    // Wall top highlight
    ctx.fillStyle = c.wallTop;
    ctx.fillRect(sx, sy, ts, ts * 0.28);
    // Wall top edge (bright line)
    ctx.fillStyle = this.lighten(c.wallTop, 0.15);
    ctx.fillRect(sx, sy, ts, Math.max(1, ts * 0.04));
    ctx.strokeStyle = c.wallBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
    if (this.env === 'farm') {
      // Barn wood beam
      ctx.fillStyle = c.wallBorder;
      ctx.fillRect(sx, sy + ts * 0.45, ts, ts * 0.08);
      // Timber beam peaked accent at wall top
      ctx.fillStyle = this.darken(c.wallBorder, 0.1);
      ctx.fillRect(sx, sy + ts * 0.26, ts, ts * 0.04);
      ctx.fillStyle = this.lighten(c.wallTop, 0.08);
      ctx.fillRect(sx, sy + ts * 0.22, ts, ts * 0.04);
    } else if (this.env === 'hospital') {
      // Modern ledge highlight line
      ctx.fillStyle = this.lighten(c.wallTop, 0.2);
      ctx.fillRect(sx, sy + ts * 0.28, ts, Math.max(1, ts * 0.03));
      // Subtle horizontal band
      ctx.fillStyle = this.lighten(c.wall, 0.06);
      ctx.fillRect(sx, sy + ts * 0.5, ts, ts * 0.06);
    }
  }

  /* ── decorative items ───────────────────────── */

  private drawDecor(): void {
    const w = this.world;
    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const t = w.tiles[y][x].type;
        if (t === 'floor' || t === 'wall' || t === 'desk' || t === 'chair' || t === 'rug' || t === 'empty'
            || t === 'grass' || t === 'road' || t === 'road_cross' || t === 'cobblestone'
            || t === 'building_floor' || t === 'building_wall' || t === 'building_roof'
            || t === 'building_roof_red' || t === 'building_roof_blue' || t === 'building_roof_brown' || t === 'building_roof_green'
            || t === 'building_door' || t === 'building_chimney' || t === 'building_window' || t === 'building_awning'
            || t === 'pathway' || t === 'town_hedge' || t === 'town_stairs') continue;
        const sx = x * this.ts, sy = y * this.ts;
        switch (t) {
          case 'plant': this.drawPlant(sx, sy); break;
          case 'coffee': this.drawCoffee(sx, sy); break;
          case 'water_cooler': this.drawWaterCooler(sx, sy); break;
          case 'bookshelf': this.drawBookshelf(sx, sy); break;
          case 'couch': this.drawCouch(sx, sy); break;
          case 'whiteboard': this.drawWhiteboard(sx, sy); break;
          case 'meeting_table': this.drawMeetingTable(sx, sy); break;
          case 'cabinet': this.drawCabinet(sx, sy); break;
          case 'printer': this.drawPrinter(sx, sy); break;
          case 'rocket_body': this.drawRocketBody(sx, sy); break;
          case 'rocket_nose': this.drawRocketNose(sx, sy); break;
          case 'rocket_engine': this.drawRocketEngine(sx, sy); break;
          case 'scaffolding': this.drawScaffolding(sx, sy); break;
          case 'fuel_tank': this.drawFuelTank(sx, sy); break;
          case 'launch_pad': this.drawLaunchPad(sx, sy); break;
          case 'hull_window': this.drawHullWindow(sx, sy); break;
          case 'solar_panel': this.drawSolarPanel(sx, sy); break;
          case 'oxygen_tank': this.drawOxygenTank(sx, sy); break;
          case 'comm_dish': this.drawCommDish(sx, sy); break;
          case 'sleep_pod': this.drawSleepPod(sx, sy); break;
          case 'satellite': this.drawSatellite(sx, sy); break;
          case 'hay_bale': this.drawHayBale(sx, sy); break;
          case 'tree': this.drawTree(sx, sy); break;
          case 'water_trough': this.drawWaterTrough(sx, sy); break;
          case 'crop': this.drawCrop(sx, sy); break;
          case 'tractor': this.drawTractor(sx, sy); break;
          case 'cow': this.drawCow(sx, sy); break;
          case 'chicken': this.drawChicken(sx, sy); break;
          case 'sheep': this.drawSheep(sx, sy); break;
          case 'hospital_bed': this.drawHospitalBed(sx, sy); break;
          case 'med_cabinet': this.drawMedCabinet(sx, sy); break;
          case 'xray_machine': this.drawXrayMachine(sx, sy); break;
          case 'curtain': this.drawCurtain(sx, sy); break;
          case 'sink': this.drawSink(sx, sy); break;
          case 'ship_hull': this.drawShipHull(sx, sy); break;
          case 'ship_mast': this.drawShipMast(sx, sy); break;
          case 'ship_sail': this.drawShipSail(sx, sy); break;
          case 'ship_wheel': this.drawShipWheel(sx, sy); break;
          case 'cannon': this.drawCannon(sx, sy); break;
          case 'barrel': this.drawBarrel(sx, sy); break;
          case 'anchor': this.drawAnchor(sx, sy); break;
          case 'plank': this.drawPlankTile(sx, sy); break;
          case 'crows_nest': this.drawCrowsNest(sx, sy); break;
          case 'treasure_chest': this.drawTreasureChest(sx, sy); break;
          case 'jolly_roger': this.drawJollyRoger(sx, sy); break;
          // Town decor
          case 'lamppost': this.drawLamppost(sx, sy); break;
          case 'bench': this.drawBench(sx, sy); break;
          case 'town_tree': this.drawTownTree(sx, sy); break;
          case 'fountain': this.drawFountain(sx, sy); break;
          case 'flower_bed': this.drawFlowerBed(sx, sy); break;
          case 'fence': this.drawFence(sx, sy); break;
          case 'mailbox': this.drawMailbox(sx, sy); break;
          case 'signpost': this.drawSignpost(sx, sy); break;
          case 'water': this.drawWater(sx, sy); break;
          case 'market_stall': this.drawMarketStall(sx, sy); break;
          case 'well': this.drawWell(sx, sy); break;
        }
      }
    }
  }

  /* ── office items ───────────────────────────── */

  private drawPlant(sx: number, sy: number): void {
    const { ts } = this; const c = this.colors;
    this.shadedRect(sx + ts * .3, sy + ts * .6, ts * .4, ts * .35, c.plantPot);
    this.shadedCircle(sx + ts * .5, sy + ts * .4, ts * .22, c.plantLeaf);
    this.shadedCircle(sx + ts * .35, sy + ts * .52, ts * .16, c.plantLeafAlt, false);
    this.shadedCircle(sx + ts * .65, sy + ts * .52, ts * .16, c.plantLeafAlt, false);
  }

  private drawCoffee(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    this.shadedRect(sx + ts * .2, sy + ts * .25, ts * .6, ts * .6, c.coffee);
    this.shadedRect(sx + ts * .35, sy + ts * .08, ts * .3, ts * .2, '#FFFFFF');
    ctx.fillStyle = '#795548';
    ctx.fillRect(sx + ts * .4, sy + ts * .12, ts * .2, ts * .1);
    // Steam wisps
    const t = Date.now() * 0.003;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 2; i++) {
      const wy = sy + ts * .04 - Math.sin(t + i * 2) * ts * .04;
      ctx.fillRect(sx + ts * (.4 + i * .12), wy, ts * .04, ts * .04);
    }
  }

  private drawWaterCooler(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    this.shadedRect(sx + ts * .25, sy + ts * .15, ts * .5, ts * .7, c.waterCooler);
    this.shadedRect(sx + ts * .3, sy + ts * .2, ts * .4, ts * .25, c.waterCoolerWater, { outline: false });
    // Water level line
    ctx.fillStyle = this.lighten(c.waterCoolerWater, 0.3);
    ctx.fillRect(sx + ts * .3, sy + ts * .2, ts * .4, Math.max(1, ts * .03));
    this.shadedRect(sx + ts * .38, sy + ts * .7, ts * .24, ts * .1, '#CCCCCC');
    // Tap
    ctx.fillStyle = '#999';
    ctx.fillRect(sx + ts * .46, sy + ts * .62, ts * .08, ts * .1);
  }

  private drawBookshelf(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    this.shadedRect(sx + 1, sy + ts * .1, ts - 2, ts * .85, c.bookshelf);
    // Shelf divider
    ctx.fillStyle = this.darken(c.bookshelf, 0.15);
    ctx.fillRect(sx + ts * .1, sy + ts * .48, ts * .8, Math.max(1, ts * .03));
    // Top row books (varying heights)
    const heights = [.28, .3, .26, .32];
    for (let i = 0; i < 4; i++) {
      const bh = ts * heights[i];
      this.shadedRect(sx + ts * .15 + i * ts * .18, sy + ts * .48 - bh, ts * .12, bh, c.books[i % c.books.length]);
    }
    // Bottom row books
    const heights2 = [.22, .25, .2];
    for (let i = 0; i < 3; i++) {
      const bh = ts * heights2[i];
      this.shadedRect(sx + ts * .2 + i * ts * .2, sy + ts * .85 - bh, ts * .14, bh, c.books[(i + 2) % c.books.length]);
    }
  }

  private drawCouch(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    // Back rest
    this.shadedRect(sx + ts * .05, sy + ts * .2, ts * .9, ts * .5, c.couch);
    // Seat cushion (darker)
    this.shadedRect(sx + ts * .08, sy + ts * .5, ts * .84, ts * .2, this.darken(c.couch, .08), { outline: false });
    // Base
    this.shadedRect(sx + ts * .05, sy + ts * .65, ts * .9, ts * .18, this.darken(c.couch, .15));
    // Center divider
    ctx.fillStyle = this.darken(c.couch, .12);
    ctx.fillRect(sx + ts * .47, sy + ts * .25, ts * .06, ts * .4);
    // Armrests
    this.shadedRect(sx + ts * .02, sy + ts * .25, ts * .08, ts * .45, this.darken(c.couch, .05), { outline: false });
    this.shadedRect(sx + ts * .9, sy + ts * .25, ts * .08, ts * .45, this.darken(c.couch, .05), { outline: false });
  }

  private drawWhiteboard(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    // Frame
    this.shadedRect(sx + ts * .08, sy + ts * .12, ts * .84, ts * .66, '#AAAAAA');
    // Board surface
    this.shadedRect(sx + ts * .12, sy + ts * .16, ts * .76, ts * .58, c.whiteboard, { shadowAmt: 0.05, highlightAmt: 0.1 });
    // Written content
    ctx.strokeStyle = '#3498DB'; ctx.lineWidth = Math.max(1, this.scale * 0.3);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .2, sy + ts * .3); ctx.lineTo(sx + ts * .7, sy + ts * .3);
    ctx.moveTo(sx + ts * .2, sy + ts * .42); ctx.lineTo(sx + ts * .55, sy + ts * .42);
    ctx.moveTo(sx + ts * .2, sy + ts * .54); ctx.lineTo(sx + ts * .62, sy + ts * .54);
    ctx.stroke();
    // Red marker dot
    ctx.fillStyle = '#E74C3C';
    this.circle(sx + ts * .72, sy + ts * .3, ts * .025);
    // Tray
    this.shadedRect(sx + ts * .15, sy + ts * .72, ts * .7, ts * .04, '#CCCCCC', { outline: false });
  }

  private drawMeetingTable(sx: number, sy: number): void {
    const { ts } = this; const c = this.colors;
    this.shadedRect(sx + 1, sy + 1, ts - 2, ts - 2, c.meetingTable);
    this.shadedRect(sx + 1, sy + ts - ts * .15, ts - 2, ts * .15 - 1, c.meetingTableEdge, { outline: false });
  }

  private drawCabinet(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    this.shadedRect(sx + ts * .15, sy + ts * .1, ts * .7, ts * .8, c.cabinet);
    // Drawer lines
    ctx.strokeStyle = this.darken(c.cabinet, .15); ctx.lineWidth = 1;
    for (const frac of [.35, .55, .75]) {
      ctx.beginPath();
      ctx.moveTo(sx + ts * .2, sy + ts * frac);
      ctx.lineTo(sx + ts * .8, sy + ts * frac);
      ctx.stroke();
    }
    // Handles (shaded)
    for (const frac of [.28, .48, .68]) {
      this.shadedRect(sx + ts * .44, sy + ts * frac, ts * .12, ts * .04, '#BBBBBB');
    }
  }

  private drawPrinter(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .45, c.printer);
    // Paper tray in
    this.shadedRect(sx + ts * .25, sy + ts * .2, ts * .5, ts * .12, '#FFFFFF');
    // Output slot
    ctx.fillStyle = this.darken(c.printer, .2);
    ctx.fillRect(sx + ts * .2, sy + ts * .58, ts * .6, ts * .08);
    // Paper coming out
    ctx.fillStyle = '#FFF';
    ctx.fillRect(sx + ts * .28, sy + ts * .56, ts * .44, ts * .04);
    // Status LED
    ctx.fillStyle = '#27AE60';
    ctx.fillRect(sx + ts * .72, sy + ts * .35, ts * .06, ts * .04);
  }

  /* ── rocket items ───────────────────────────── */

  private drawRocketBody(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .15, sy, ts * .7, ts, '#E8E8F0');
    // Panel stripes
    ctx.fillStyle = '#C0C0D0';
    ctx.fillRect(sx + ts * .15, sy, ts * .08, ts);
    ctx.fillRect(sx + ts * .77, sy, ts * .08, ts);
    // Window
    this.shadedRect(sx + ts * .3, sy + ts * .3, ts * .4, ts * .15, '#3366CC');
    // Window glare
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(sx + ts * .32, sy + ts * .32, ts * .12, ts * .06);
    // Red accent stripe
    this.shadedRect(sx + ts * .15, sy + ts * .6, ts * .7, ts * .06, '#CC3333', { outline: false });
    // Rivets
    ctx.fillStyle = '#B0B0C0';
    for (const ry of [.15, .5, .85]) {
      ctx.fillRect(sx + ts * .2, sy + ts * ry, ts * .03, ts * .03);
      ctx.fillRect(sx + ts * .77, sy + ts * ry, ts * .03, ts * .03);
    }
  }

  private drawRocketNose(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Outer nose (red)
    ctx.fillStyle = '#CC3333';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .5, sy + ts * .05);
    ctx.lineTo(sx + ts * .85, sy + ts * .95);
    ctx.lineTo(sx + ts * .15, sy + ts * .95);
    ctx.closePath(); ctx.fill();
    // Outline
    ctx.strokeStyle = this.darken('#CC3333', 0.3);
    ctx.lineWidth = 1; ctx.stroke();
    // Inner body (white)
    ctx.fillStyle = '#E8E8F0';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .5, sy + ts * .3);
    ctx.lineTo(sx + ts * .75, sy + ts * .95);
    ctx.lineTo(sx + ts * .25, sy + ts * .95);
    ctx.closePath(); ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .48, sy + ts * .32);
    ctx.lineTo(sx + ts * .35, sy + ts * .95);
    ctx.lineTo(sx + ts * .25, sy + ts * .95);
    ctx.closePath(); ctx.fill();
  }

  private drawRocketEngine(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .2, sy, ts * .6, ts * .5, '#555566');
    // Nozzle detail
    this.shadedRect(sx + ts * .28, sy + ts * .38, ts * .44, ts * .12, '#444455', { outline: false });
    const t = Date.now() * 0.005;
    const flicker = 0.8 + Math.sin(t) * 0.2;
    // Outer flame
    ctx.fillStyle = `rgba(255,102,0,${flicker.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .25, sy + ts * .5);
    ctx.lineTo(sx + ts * .5, sy + ts * .95);
    ctx.lineTo(sx + ts * .75, sy + ts * .5);
    ctx.closePath(); ctx.fill();
    // Inner flame (brighter)
    ctx.fillStyle = `rgba(255,200,80,${(flicker * 0.9).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .35, sy + ts * .5);
    ctx.lineTo(sx + ts * .5, sy + ts * .8);
    ctx.lineTo(sx + ts * .65, sy + ts * .5);
    ctx.closePath(); ctx.fill();
    // Core (white-hot)
    ctx.fillStyle = `rgba(255,255,200,${(flicker * 0.7).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .42, sy + ts * .5);
    ctx.lineTo(sx + ts * .5, sy + ts * .65);
    ctx.lineTo(sx + ts * .58, sy + ts * .5);
    ctx.closePath(); ctx.fill();
  }

  private drawScaffolding(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Vertical beams
    this.shadedRect(sx + ts * .08, sy + ts * .02, ts * .08, ts * .96, '#6A7A8A');
    this.shadedRect(sx + ts * .84, sy + ts * .02, ts * .08, ts * .96, '#6A7A8A');
    // Cross bars
    ctx.strokeStyle = '#8899AA'; ctx.lineWidth = Math.max(1, this.scale * 0.5);
    ctx.strokeRect(sx + ts * .1, sy + ts * .05, ts * .8, ts * .9);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .1, sy + ts * .5);
    ctx.lineTo(sx + ts * .9, sy + ts * .5);
    ctx.stroke();
    // Diagonal brace
    ctx.strokeStyle = '#7A8A9A';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .16, sy + ts * .05);
    ctx.lineTo(sx + ts * .84, sy + ts * .5);
    ctx.stroke();
  }

  private drawFuelTank(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .2, sy + ts * .15, ts * .6, ts * .7, '#338844');
    // Highlight stripe
    ctx.fillStyle = '#44AA55';
    ctx.fillRect(sx + ts * .25, sy + ts * .2, ts * .15, ts * .6);
    // Label plate
    this.shadedRect(sx + ts * .3, sy + ts * .05, ts * .4, ts * .12, '#FFCC00');
    // Gauge
    this.shadedRect(sx + ts * .58, sy + ts * .3, ts * .15, ts * .35, '#225533');
    ctx.fillStyle = '#44FF66';
    ctx.fillRect(sx + ts * .6, sy + ts * .45, ts * .11, ts * .18);
    // Text
    ctx.fillStyle = '#222';
    ctx.font = `bold ${Math.max(6, ts * .18)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FUEL', sx + ts * .42, sy + ts * .55);
  }

  private drawLaunchPad(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx, sy, ts, ts, '#555566');
    // Yellow warning stripe
    this.shadedRect(sx + ts * .08, sy + ts * .45, ts * .84, ts * .1, '#FFCC00', { outline: false });
    // Hazard pattern
    ctx.fillStyle = '#333344';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(sx + ts * (.12 + i * .22), sy + ts * .45, ts * .08, ts * .1);
    }
    ctx.strokeStyle = '#666677'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
  }

  /* ── space station items ────────────────────── */

  private drawHullWindow(sx: number, sy: number): void {
    const { ctx, ts } = this;

    // Check if this is part of the space station viewscreen (rows 1-2, contiguous hull_windows)
    const gridX = Math.round(sx / ts);
    const gridY = Math.round(sy / ts);
    const isViewscreen = this.env === 'space_station' && gridY >= 1 && gridY <= 2;

    if (isViewscreen) {
      // Giant Star Trek viewscreen tile — deep space with warp speed streaks
      // Dark space background
      ctx.fillStyle = '#020815';
      ctx.fillRect(sx, sy, ts, ts);

      // Subtle deep-space blue gradient
      const grd = ctx.createLinearGradient(sx, sy, sx, sy + ts);
      grd.addColorStop(0, 'rgba(10,20,60,0.4)');
      grd.addColorStop(1, 'rgba(5,10,30,0.2)');
      ctx.fillStyle = grd;
      ctx.fillRect(sx, sy, ts, ts);

      // Warp speed star streaks — animated
      const now = Date.now() * 0.001;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx + 1, sy + 1, ts - 2, ts - 2);
      ctx.clip();

      for (const star of this.warpStars) {
        // Use gridX to offset stars so they look continuous across tiles
        const seedOffset = gridX * 0.13 + gridY * 0.37;
        const phase = ((star.x + seedOffset + now * star.speed * 0.4) % 1.0);
        const streakX = sx + phase * ts;
        const streakY = sy + star.y * ts;

        // Longer streaks = faster warp effect
        const streakLen = ts * star.len * (0.6 + Math.sin(now * 2 + star.x * 10) * 0.4);
        const alpha = star.brightness * (0.5 + Math.sin(now * 3 + star.y * 20) * 0.3);

        // Blue-white warp streak
        const gradient = ctx.createLinearGradient(streakX - streakLen, streakY, streakX, streakY);
        gradient.addColorStop(0, `rgba(100,150,255,0)`);
        gradient.addColorStop(0.3, `rgba(150,200,255,${(alpha * 0.5).toFixed(2)})`);
        gradient.addColorStop(1, `rgba(220,240,255,${alpha.toFixed(2)})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(streakX - streakLen, streakY - 0.5, streakLen, Math.max(1, ts * 0.02));

        // Bright head of the streak
        ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(2)})`;
        ctx.fillRect(streakX - 1, streakY - 0.5, Math.max(1, ts * 0.03), Math.max(1, ts * 0.02));
      }

      // A few static distant stars (very faint, deep background)
      const seed = gridX * 7 + gridY * 13;
      for (let i = 0; i < 5; i++) {
        const fx = ((seed + i * 31) % 97) / 97;
        const fy = ((seed + i * 47) % 89) / 89;
        const fb = 0.15 + Math.sin(now * 0.5 + i) * 0.08;
        ctx.fillStyle = `rgba(180,200,255,${fb.toFixed(2)})`;
        ctx.fillRect(sx + fx * ts, sy + fy * ts, Math.max(1, ts * 0.025), Math.max(1, ts * 0.025));
      }

      ctx.restore();

      // Thin frame between viewscreen tiles
      ctx.strokeStyle = '#1A2A40';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);

      // Top row: viewscreen top border
      if (gridY === 1) {
        ctx.fillStyle = '#2A3A4A';
        ctx.fillRect(sx, sy, ts, Math.max(1, ts * 0.06));
      }
      // Bottom row: viewscreen bottom border
      if (gridY === 2) {
        ctx.fillStyle = '#2A3A4A';
        ctx.fillRect(sx, sy + ts - Math.max(1, ts * 0.06), ts, Math.max(1, ts * 0.06));
      }

      return;
    }

    // Regular hull window (side windows, science deck, etc.)
    // Frame
    this.shadedRect(sx + 1, sy + 1, ts - 2, ts - 2, '#1A2535');
    // Window glass
    this.shadedRect(sx + ts * .15, sy + ts * .15, ts * .7, ts * .7, '#0A1020', { highlightAmt: 0.05, shadowAmt: 0.05 });
    // Stars in window
    ctx.fillStyle = '#FFFFFF';
    this.circle(sx + ts * .4, sy + ts * .4, ts * .04);
    this.circle(sx + ts * .6, sy + ts * .55, ts * .03);
    this.circle(sx + ts * .35, sy + ts * .65, ts * .025);
    this.circle(sx + ts * .7, sy + ts * .35, ts * .02);
    // Glass reflection
    ctx.fillStyle = 'rgba(100,150,255,0.08)';
    ctx.fillRect(sx + ts * .18, sy + ts * .18, ts * .3, ts * .15);
    // Blinking status LED
    const blink = Math.sin(Date.now() * 0.003) > 0;
    if (blink) {
      ctx.fillStyle = '#44FF88';
      ctx.fillRect(sx + ts * .8, sy + ts * .85, ts * .06, ts * .04);
    }
    ctx.strokeStyle = '#2A3A4A'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + ts * .12, sy + ts * .12, ts * .76, ts * .76);
  }

  private drawSolarPanel(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .05, sy + ts * .15, ts * .9, ts * .7, '#1A3A6A');
    // Grid lines
    ctx.strokeStyle = '#4488CC'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const fx = sx + ts * .05 + (ts * .9 / 4) * i;
      ctx.beginPath(); ctx.moveTo(fx, sy + ts * .15); ctx.lineTo(fx, sy + ts * .85); ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const fy = sy + ts * .15 + (ts * .7 / 3) * i;
      ctx.beginPath(); ctx.moveTo(sx + ts * .05, fy); ctx.lineTo(sx + ts * .95, fy); ctx.stroke();
    }
    // Shine highlight on panel
    ctx.fillStyle = 'rgba(100,180,255,0.1)';
    ctx.fillRect(sx + ts * .08, sy + ts * .18, ts * .22, ts * .22);
    // Connector
    this.shadedRect(sx + ts * .45, sy + ts * .05, ts * .1, ts * .12, '#CCAA44');
  }

  private drawOxygenTank(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .25, sy + ts * .2, ts * .5, ts * .65, '#4488CC');
    // Highlight stripe
    ctx.fillStyle = '#5599DD';
    ctx.fillRect(sx + ts * .3, sy + ts * .25, ts * .1, ts * .55);
    // Valve top
    this.shadedRect(sx + ts * .35, sy + ts * .1, ts * .3, ts * .12, '#88BBEE');
    // Pressure gauge
    this.shadedRect(sx + ts * .58, sy + ts * .35, ts * .12, ts * .12, '#336699');
    ctx.fillStyle = '#66BBFF';
    ctx.fillRect(sx + ts * .6, sy + ts * .38, ts * .08, ts * .06);
    // Text
    ctx.fillStyle = '#222';
    ctx.font = `bold ${Math.max(5, ts * .16)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('O₂', sx + ts * .43, sy + ts * .55);
  }

  private drawCommDish(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Support pole
    this.shadedRect(sx + ts * .45, sy + ts * .4, ts * .1, ts * .55, '#8899AA');
    // Dish
    ctx.fillStyle = '#AABBCC';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .15, sy + ts * .6);
    ctx.quadraticCurveTo(sx + ts * .5, sy + ts * .1, sx + ts * .85, sy + ts * .6);
    ctx.lineTo(sx + ts * .7, sy + ts * .55);
    ctx.quadraticCurveTo(sx + ts * .5, sy + ts * .25, sx + ts * .3, sy + ts * .55);
    ctx.closePath(); ctx.fill();
    // Dish outline
    ctx.strokeStyle = this.darken('#AABBCC', 0.25);
    ctx.lineWidth = 1; ctx.stroke();
    // Dish highlight
    ctx.fillStyle = this.lighten('#AABBCC', 0.15);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .25, sy + ts * .55);
    ctx.quadraticCurveTo(sx + ts * .4, sy + ts * .3, sx + ts * .55, sy + ts * .5);
    ctx.closePath(); ctx.fill();
    // Red indicator (pulsing)
    const pulse = 0.6 + Math.sin(Date.now() * 0.004) * 0.4;
    ctx.fillStyle = `rgba(255,68,68,${pulse.toFixed(2)})`;
    this.circle(sx + ts * .5, sy + ts * .35, ts * .06);
  }

  private drawSleepPod(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .1, sy + ts * .1, ts * .8, ts * .8, '#2A3A4A');
    // Inner panel
    this.shadedRect(sx + ts * .15, sy + ts * .15, ts * .7, ts * .5, '#1A2A3A', { outline: false });
    // Display
    this.shadedRect(sx + ts * .2, sy + ts * .2, ts * .25, ts * .15, '#3A5A7A', { outline: false });
    // Status indicator (breathing)
    const pulse = 0.5 + Math.sin(Date.now() * 0.002) * 0.5;
    ctx.fillStyle = `rgba(68,170,255,${pulse.toFixed(2)})`;
    this.circle(sx + ts * .75, sy + ts * .25, ts * .04);
    // Pillow detail
    ctx.fillStyle = '#354A5E';
    ctx.fillRect(sx + ts * .5, sy + ts * .2, ts * .3, ts * .1);
  }

  private drawSatellite(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Body
    this.shadedRect(sx + ts * .35, sy + ts * .3, ts * .3, ts * .4, '#8899AA');
    // Solar panels
    this.shadedRect(sx + ts * .05, sy + ts * .35, ts * .3, ts * .2, '#1A3A6A');
    this.shadedRect(sx + ts * .65, sy + ts * .35, ts * .3, ts * .2, '#1A3A6A');
    // Panel grid lines
    ctx.strokeStyle = '#4488CC'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .2, sy + ts * .35); ctx.lineTo(sx + ts * .2, sy + ts * .55);
    ctx.moveTo(sx + ts * .8, sy + ts * .35); ctx.lineTo(sx + ts * .8, sy + ts * .55);
    ctx.stroke();
    // Panel shine
    ctx.fillStyle = 'rgba(100,180,255,0.1)';
    ctx.fillRect(sx + ts * .07, sy + ts * .37, ts * .12, ts * .08);
    ctx.fillRect(sx + ts * .67, sy + ts * .37, ts * .12, ts * .08);
    // Antenna
    ctx.fillStyle = '#FF4444';
    this.circle(sx + ts * .5, sy + ts * .25, ts * .06);
    // Connector
    this.shadedRect(sx + ts * .45, sy + ts * .68, ts * .1, ts * .12, '#CCAA44');
  }

  /* ── farm items ─────────────────────────────── */

  private drawHayBale(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .1, sy + ts * .2, ts * .8, ts * .65, '#D4A843');
    // Top band
    ctx.fillStyle = '#C09830';
    ctx.fillRect(sx + ts * .1, sy + ts * .2, ts * .8, ts * .1);
    // Binding straps
    ctx.strokeStyle = '#8B6914'; ctx.lineWidth = Math.max(1, this.scale * 0.4);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .35, sy + ts * .2); ctx.lineTo(sx + ts * .35, sy + ts * .85);
    ctx.moveTo(sx + ts * .65, sy + ts * .2); ctx.lineTo(sx + ts * .65, sy + ts * .85);
    ctx.stroke();
    // Straw texture
    ctx.fillStyle = '#BF9535';
    ctx.fillRect(sx + ts * .2, sy + ts * .4, ts * .08, ts * .03);
    ctx.fillRect(sx + ts * .5, sy + ts * .6, ts * .06, ts * .03);
    ctx.fillRect(sx + ts * .72, sy + ts * .45, ts * .05, ts * .03);
  }

  private drawTree(sx: number, sy: number): void {
    const { ts } = this;
    // Trunk
    this.shadedRect(sx + ts * .4, sy + ts * .55, ts * .2, ts * .4, '#5A3A1A');
    // Foliage layers (back to front, bottom to top)
    this.shadedCircle(sx + ts * .5, sy + ts * .38, ts * .3, '#2A8A3A');
    this.shadedCircle(sx + ts * .35, sy + ts * .44, ts * .18, '#3AAA4A', false);
    this.shadedCircle(sx + ts * .65, sy + ts * .44, ts * .18, '#3AAA4A', false);
    this.shadedCircle(sx + ts * .5, sy + ts * .28, ts * .17, '#4ABA5A', false);
  }

  private drawWaterTrough(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .1, sy + ts * .35, ts * .8, ts * .45, '#6A6A6A');
    // Water
    this.shadedRect(sx + ts * .15, sy + ts * .4, ts * .7, ts * .3, '#5599CC', { outline: false, highlightAmt: 0.25 });
    // Water surface shimmer
    const shimmer = Math.sin(Date.now() * 0.002) * 0.15;
    ctx.fillStyle = `rgba(200,230,255,${(0.15 + shimmer).toFixed(2)})`;
    ctx.fillRect(sx + ts * .2, sy + ts * .42, ts * .25, ts * .04);
    // Legs
    this.shadedRect(sx + ts * .12, sy + ts * .75, ts * .12, ts * .15, '#555555');
    this.shadedRect(sx + ts * .76, sy + ts * .75, ts * .12, ts * .15, '#555555');
  }

  private drawCrop(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const colors = ['#3A8A2A', '#4A9A3A', '#5AAA4A'];
    // Soil mound
    ctx.fillStyle = '#5A4A25';
    ctx.fillRect(sx + ts * .08, sy + ts * .82, ts * .84, ts * .1);
    for (let i = 0; i < 3; i++) {
      const cx = sx + ts * (.2 + i * .3);
      // Stem
      ctx.fillStyle = '#6A5A30';
      ctx.fillRect(cx, sy + ts * .45, ts * .04, ts * .4);
      // Leaves
      this.shadedRect(cx - ts * .08, sy + ts * .28, ts * .2, ts * .22, colors[i], { outline: false, highlightAmt: 0.15 });
      ctx.fillStyle = this.darken(colors[i], 0.1);
      ctx.fillRect(cx - ts * .04, sy + ts * .4, ts * .12, ts * .08);
      // Small fruit/bud
      ctx.fillStyle = '#CC4444';
      ctx.fillRect(cx + ts * .04, sy + ts * .3, ts * .06, ts * .06);
    }
  }

  private drawTractor(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const t = Date.now() * 0.002;
    // Subtle vibration (engine running)
    const vib = Math.sin(t * 8) * ts * 0.005;
    // Main body
    this.shadedRect(sx + ts * .15, sy + ts * .25 + vib, ts * .55, ts * .4, '#CC3333');
    // Cab
    this.shadedRect(sx + ts * .6, sy + ts * .3 + vib, ts * .25, ts * .3, '#222222');
    // Windshield
    this.shadedRect(sx + ts * .52, sy + ts * .15 + vib, ts * .15, ts * .18, '#AACCEE', { highlightAmt: 0.3 });
    // Exhaust pipe
    ctx.fillStyle = '#444';
    ctx.fillRect(sx + ts * .18, sy + ts * .12 + vib, ts * .06, ts * .15);
    // Exhaust puffs (animated smoke)
    const puffAlpha = 0.15 + Math.sin(t * 3) * 0.1;
    const puff1Y = sy + ts * .06 - Math.abs(Math.sin(t * 2)) * ts * .1;
    const puff2Y = sy + ts * .02 - Math.abs(Math.sin(t * 2 + 1)) * ts * .1;
    ctx.fillStyle = `rgba(180,180,180,${puffAlpha.toFixed(2)})`;
    this.circle(sx + ts * .21, puff1Y, ts * .04);
    ctx.fillStyle = `rgba(160,160,160,${(puffAlpha * 0.7).toFixed(2)})`;
    this.circle(sx + ts * .19, puff2Y, ts * .035);
    // Front wheel (spinning)
    const wheelAngle = t * 3;
    this.shadedCircle(sx + ts * .25, sy + ts * .75, ts * .15, '#333333');
    ctx.fillStyle = '#555';
    this.circle(sx + ts * .25, sy + ts * .75, ts * .07);
    // Wheel spokes (animated rotation)
    ctx.strokeStyle = '#666'; ctx.lineWidth = Math.max(1, ts * 0.02);
    for (let i = 0; i < 4; i++) {
      const a = wheelAngle + (Math.PI / 2) * i;
      const cx = sx + ts * .25, cy = sy + ts * .75;
      const r = ts * .12;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    // Rear wheel (bigger, spinning)
    this.shadedCircle(sx + ts * .7, sy + ts * .72, ts * .18, '#333333');
    ctx.fillStyle = '#555';
    this.circle(sx + ts * .7, sy + ts * .72, ts * .09);
    // Rear wheel spokes
    for (let i = 0; i < 6; i++) {
      const a = wheelAngle * 0.7 + (Math.PI / 3) * i;
      const cx = sx + ts * .7, cy = sy + ts * .72;
      const r = ts * .15;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  }

  /* ── farm animals ───────────────────────────── */

  private drawCow(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const t = Date.now() * 0.001;
    // Slow grazing head bob
    const headBob = Math.sin(t * 0.8) * ts * 0.015;
    // Body
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .6, ts * .35, '#F0F0F0');
    // Spots
    ctx.fillStyle = '#333';
    ctx.fillRect(sx + ts * .25, sy + ts * .35, ts * .15, ts * .1);
    ctx.fillRect(sx + ts * .5, sy + ts * .4, ts * .1, ts * .08);
    // Head (bobs slightly while grazing)
    this.shadedRect(sx + ts * .06, sy + ts * .25 + headBob, ts * .22, ts * .22, '#F0F0F0');
    // Eye
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .12, sy + ts * .3 + headBob, ts * .04, ts * .04);
    // Nose/mouth
    ctx.fillStyle = '#FFAAAA';
    ctx.fillRect(sx + ts * .08, sy + ts * .4 + headBob, ts * .12, ts * .06);
    // Horns
    ctx.fillStyle = '#D4C5A0';
    ctx.fillRect(sx + ts * .08, sy + ts * .22 + headBob, ts * .04, ts * .05);
    ctx.fillRect(sx + ts * .2, sy + ts * .22 + headBob, ts * .04, ts * .05);
    // Legs (subtle walking shift)
    const legShift = Math.sin(t * 1.2) * ts * 0.01;
    this.shadedRect(sx + ts * .2, sy + ts * .65, ts * .06, ts * .2 + legShift, '#444444', { outline: false });
    this.shadedRect(sx + ts * .4, sy + ts * .65, ts * .06, ts * .2 - legShift, '#444444', { outline: false });
    this.shadedRect(sx + ts * .55, sy + ts * .65, ts * .06, ts * .2 - legShift, '#444444', { outline: false });
    this.shadedRect(sx + ts * .65, sy + ts * .65, ts * .06, ts * .2 + legShift, '#444444', { outline: false });
    // Tail (wagging)
    const tailWag = Math.sin(t * 2) * ts * 0.04;
    ctx.fillStyle = '#888';
    ctx.fillRect(sx + ts * .74, sy + ts * .33 + tailWag, ts * .12, ts * .03);
    ctx.fillRect(sx + ts * .82, sy + ts * .34 + tailWag * 1.5, ts * .06, ts * .025);
  }

  private drawChicken(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const t = Date.now() * 0.001;
    // Pecking animation — head dips down periodically
    const peckCycle = (t * 1.5) % 4;
    const isPecking = peckCycle < 0.4;
    const headDip = isPecking ? ts * 0.06 : 0;
    // Body bob
    const bodyBob = Math.sin(t * 2) * ts * 0.008;
    // Body
    this.shadedRect(sx + ts * .3, sy + ts * .4 + bodyBob, ts * .35, ts * .25, '#F5DEB3');
    // Head (dips when pecking)
    this.shadedCircle(sx + ts * .35, sy + ts * .35 + headDip + bodyBob, ts * .12, '#F5DEB3', false);
    // Comb
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(sx + ts * .3, sy + ts * .22 + headDip + bodyBob, ts * .1, ts * .08);
    // Beak
    ctx.fillStyle = '#FF8800';
    ctx.fillRect(sx + ts * .24, sy + ts * .36 + headDip + bodyBob, ts * .08, ts * .04);
    // Eye
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .32, sy + ts * .32 + headDip + bodyBob, ts * .03, ts * .03);
    // Legs (walking step)
    const legStep = Math.sin(t * 3) * ts * 0.015;
    ctx.fillStyle = '#CC8800';
    ctx.fillRect(sx + ts * .35, sy + ts * .65 + bodyBob, ts * .04, ts * .15 + legStep);
    ctx.fillRect(sx + ts * .5, sy + ts * .65 + bodyBob, ts * .04, ts * .15 - legStep);
    // Tail feathers (slight waggle)
    const tailWag = Math.sin(t * 2.5) * ts * 0.01;
    ctx.fillStyle = '#D4A843';
    ctx.fillRect(sx + ts * .55, sy + ts * .42 + tailWag + bodyBob, ts * .12, ts * .06);
    ctx.fillStyle = '#C09830';
    ctx.fillRect(sx + ts * .6, sy + ts * .48 + tailWag + bodyBob, ts * .1, ts * .05);
    ctx.fillStyle = '#B08820';
    ctx.fillRect(sx + ts * .58, sy + ts * .38 - tailWag + bodyBob, ts * .08, ts * .05);
    // Wing detail (flutters slightly)
    const wingFlutter = Math.sin(t * 4) * ts * 0.005;
    ctx.fillStyle = this.darken('#F5DEB3', 0.1);
    ctx.fillRect(sx + ts * .38, sy + ts * .44 + wingFlutter + bodyBob, ts * .15, ts * .12);
  }

  private drawSheep(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const t = Date.now() * 0.001;
    // Gentle body bob
    const bob = Math.sin(t * 0.7) * ts * 0.01;
    // Wool body (fluffy circles, slightly pulsing)
    const woolPulse = Math.sin(t * 1.5) * ts * 0.008;
    this.shadedCircle(sx + ts * .45, sy + ts * .45 + bob, ts * .25 + woolPulse, '#F0EAE0', false);
    this.shadedCircle(sx + ts * .55, sy + ts * .4 + bob, ts * .2 - woolPulse * 0.5, '#F0EAE0', false);
    this.shadedCircle(sx + ts * .35, sy + ts * .5 + bob, ts * .18 + woolPulse * 0.5, '#F0EAE0', false);
    // Extra wool tufts
    this.shadedCircle(sx + ts * .5, sy + ts * .3 + bob, ts * .12, '#F5EFE5', false);
    // Head (dark face, gentle nod)
    const headNod = Math.sin(t * 0.5) * ts * 0.01;
    this.shadedCircle(sx + ts * .25, sy + ts * .4 + headNod, ts * .1, '#3A3A3A');
    // Eye
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .22, sy + ts * .38 + headNod, ts * .03, ts * .03);
    // Ears (slight twitch)
    const earTwitch = Math.sin(t * 3) > 0.9 ? ts * 0.01 : 0;
    ctx.fillStyle = '#3A3A3A';
    ctx.fillRect(sx + ts * .18, sy + ts * .35 + headNod - earTwitch, ts * .04, ts * .06);
    // Legs
    const legShift = Math.sin(t * 1) * ts * 0.008;
    this.shadedRect(sx + ts * .3, sy + ts * .65, ts * .06, ts * .18 + legShift, '#555555', { outline: false });
    this.shadedRect(sx + ts * .5, sy + ts * .65, ts * .06, ts * .18 - legShift, '#555555', { outline: false });
    this.shadedRect(sx + ts * .38, sy + ts * .67, ts * .06, ts * .16 - legShift, '#555555', { outline: false });
    this.shadedRect(sx + ts * .58, sy + ts * .67, ts * .06, ts * .16 + legShift, '#555555', { outline: false });
  }

  /* ── hospital items ─────────────────────────── */

  private drawHospitalBed(sx: number, sy: number): void {
    const { ts } = this;
    // Frame
    this.shadedRect(sx + ts * .05, sy + ts * .3, ts * .9, ts * .5, '#D0D8E0');
    // Mattress
    this.shadedRect(sx + ts * .1, sy + ts * .35, ts * .8, ts * .35, '#E8F0F8', { outline: false, highlightAmt: 0.15 });
    // Pillow
    this.shadedRect(sx + ts * .08, sy + ts * .28, ts * .25, ts * .12, '#F0F5FF');
    // Headboard
    this.shadedRect(sx + ts * .05, sy + ts * .25, ts * .03, ts * .55, '#A0B0C0');
    // Footboard
    this.shadedRect(sx + ts * .92, sy + ts * .35, ts * .03, ts * .45, '#A0B0C0');
    // Legs
    this.shadedRect(sx + ts * .08, sy + ts * .78, ts * .08, ts * .12, '#8899AA');
    this.shadedRect(sx + ts * .84, sy + ts * .78, ts * .08, ts * .12, '#8899AA');
    // Blanket fold
    this.shadedRect(sx + ts * .1, sy + ts * .55, ts * .8, ts * .08, this.darken('#E8F0F8', 0.05), { outline: false });
  }

  private drawMedCabinet(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .15, sy + ts * .1, ts * .7, ts * .8, '#D0D8E0');
    // Shelf divider
    ctx.strokeStyle = '#B0B8C0'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .2, sy + ts * .5);
    ctx.lineTo(sx + ts * .8, sy + ts * .5);
    ctx.stroke();
    // Red cross
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(sx + ts * .42, sy + ts * .3, ts * .16, ts * .04);
    ctx.fillRect(sx + ts * .48, sy + ts * .24, ts * .04, ts * .16);
    // Bottles on shelf
    ctx.fillStyle = '#88AACC';
    ctx.fillRect(sx + ts * .22, sy + ts * .55, ts * .06, ts * .12);
    ctx.fillRect(sx + ts * .32, sy + ts * .57, ts * .05, ts * .1);
    ctx.fillStyle = '#AABB88';
    ctx.fillRect(sx + ts * .58, sy + ts * .56, ts * .06, ts * .11);
    // Handle
    this.shadedRect(sx + ts * .45, sy + ts * .72, ts * .1, ts * .04, '#AAAAAA');
  }

  private drawXrayMachine(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .2, sy + ts * .1, ts * .6, ts * .75, '#8899AA');
    // Screen bezel
    this.shadedRect(sx + ts * .25, sy + ts * .15, ts * .5, ts * .4, '#1A2A3A');
    // Screen
    ctx.fillStyle = '#00BCD4';
    ctx.fillRect(sx + ts * .28, sy + ts * .18, ts * .44, ts * .34);
    // X-ray image lines
    ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .32, sy + ts * .32);
    ctx.lineTo(sx + ts * .42, sy + ts * .38);
    ctx.lineTo(sx + ts * .52, sy + ts * .28);
    ctx.lineTo(sx + ts * .62, sy + ts * .42);
    ctx.stroke();
    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < ts * .34; y += 2) {
      ctx.fillRect(sx + ts * .28, sy + ts * .18 + y, ts * .44, 1);
    }
    // Control buttons
    this.shadedRect(sx + ts * .28, sy + ts * .6, ts * .08, ts * .06, '#27AE60');
    this.shadedRect(sx + ts * .4, sy + ts * .6, ts * .08, ts * .06, '#E74C3C');
    // Base
    this.shadedRect(sx + ts * .35, sy + ts * .82, ts * .3, ts * .08, '#6A7A8A');
  }

  private drawCurtain(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Curtain rod
    this.shadedRect(sx + ts * .08, sy + ts * .04, ts * .54, ts * .04, '#6A8A9A');
    // Back curtain panel
    this.shadedRect(sx + ts * .38, sy + ts * .06, ts * .22, ts * .88, '#88BBCC', { outline: false });
    // Front curtain panel (gathered)
    this.shadedRect(sx + ts * .1, sy + ts * .06, ts * .35, ts * .88, '#99CCDD', { outline: false, highlightAmt: 0.1 });
    // Curtain fold lines (vertical for draping effect)
    ctx.fillStyle = '#77AABB';
    ctx.fillRect(sx + ts * .2, sy + ts * .1, ts * .02, ts * .82);
    ctx.fillRect(sx + ts * .32, sy + ts * .1, ts * .02, ts * .82);
    // Horizontal gather lines
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(sx + ts * .12, sy + ts * (.15 + i * .2), ts * .3, ts * .02);
    }
  }

  private drawSink(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .45, '#D0D8E0');
    // Basin
    this.shadedRect(sx + ts * .2, sy + ts * .35, ts * .6, ts * .3, '#E8F0F8', { outline: false });
    // Water
    ctx.fillStyle = '#88AACC';
    ctx.fillRect(sx + ts * .25, sy + ts * .4, ts * .5, ts * .2);
    // Water shimmer
    ctx.fillStyle = 'rgba(200,230,255,0.2)';
    ctx.fillRect(sx + ts * .3, sy + ts * .42, ts * .15, ts * .04);
    // Faucet
    this.shadedRect(sx + ts * .44, sy + ts * .15, ts * .12, ts * .18, '#AABBCC');
    // Hot/cold handles
    this.shadedCircle(sx + ts * .4, sy + ts * .16, ts * .04, '#CC4444');
    this.shadedCircle(sx + ts * .6, sy + ts * .16, ts * .04, '#4444CC');
    // Drain
    ctx.fillStyle = '#777';
    this.circle(sx + ts * .5, sy + ts * .55, ts * .03);
  }

  /* ── pirate ship items ────────────────────────── */

  private drawShipHull(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx, sy, ts, ts, '#5A3A1A', { highlightAmt: 0.1 });
    // Top rail
    ctx.fillStyle = '#6B4423';
    ctx.fillRect(sx + 1, sy + 1, ts - 2, ts * .12);
    // Wood plank lines
    ctx.strokeStyle = '#4A2A0A'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 1, sy + ts * .33); ctx.lineTo(sx + ts - 1, sy + ts * .33);
    ctx.moveTo(sx + 1, sy + ts * .66); ctx.lineTo(sx + ts - 1, sy + ts * .66);
    ctx.stroke();
    // Wood grain dots
    ctx.fillStyle = '#4A2A0A';
    ctx.fillRect(sx + ts * .25, sy + ts * .2, ts * .04, ts * .03);
    ctx.fillRect(sx + ts * .7, sy + ts * .5, ts * .04, ts * .03);
    ctx.fillRect(sx + ts * .4, sy + ts * .78, ts * .04, ts * .03);
    // Nailhead
    ctx.fillStyle = '#888';
    ctx.fillRect(sx + ts * .15, sy + ts * .46, ts * .03, ts * .03);
    ctx.fillRect(sx + ts * .82, sy + ts * .46, ts * .03, ts * .03);
  }

  private drawShipMast(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .4, sy, ts * .2, ts, '#6B4423');
    // Wood grain shadow stripe
    ctx.fillStyle = '#5A3A1A';
    ctx.fillRect(sx + ts * .42, sy, ts * .04, ts);
    // Ring bands
    ctx.fillStyle = '#555';
    ctx.fillRect(sx + ts * .38, sy + ts * .2, ts * .24, ts * .03);
    ctx.fillRect(sx + ts * .38, sy + ts * .7, ts * .24, ts * .03);
  }

  private drawShipSail(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const t = Date.now() * 0.001;
    const bulge = Math.sin(t) * ts * .05;
    // Sail body
    ctx.fillStyle = '#F0E8D0';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .05, sy + ts * .1);
    ctx.quadraticCurveTo(sx + ts * .5 + bulge, sy + ts * .5, sx + ts * .05, sy + ts * .9);
    ctx.lineTo(sx + ts * .95, sy + ts * .9);
    ctx.quadraticCurveTo(sx + ts * .5 + bulge, sy + ts * .5, sx + ts * .95, sy + ts * .1);
    ctx.closePath(); ctx.fill();
    // Sail outline
    ctx.strokeStyle = this.darken('#F0E8D0', 0.25);
    ctx.lineWidth = 1; ctx.stroke();
    // Sail shadow on one side
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .55, sy + ts * .1);
    ctx.quadraticCurveTo(sx + ts * .5 + bulge, sy + ts * .5, sx + ts * .55, sy + ts * .9);
    ctx.lineTo(sx + ts * .95, sy + ts * .9);
    ctx.quadraticCurveTo(sx + ts * .5 + bulge, sy + ts * .5, sx + ts * .95, sy + ts * .1);
    ctx.closePath(); ctx.fill();
    // Sail creases
    ctx.strokeStyle = '#C0B090'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .3, sy + ts * .1); ctx.lineTo(sx + ts * .3, sy + ts * .9);
    ctx.moveTo(sx + ts * .5, sy + ts * .12); ctx.lineTo(sx + ts * .5, sy + ts * .88);
    ctx.moveTo(sx + ts * .7, sy + ts * .1); ctx.lineTo(sx + ts * .7, sy + ts * .9);
    ctx.stroke();
    // Patch
    ctx.fillStyle = '#E0D8C0';
    ctx.fillRect(sx + ts * .6, sy + ts * .4, ts * .12, ts * .15);
  }

  private drawShipWheel(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const cx = sx + ts * .5, cy = sy + ts * .5;
    const r = ts * .3;
    ctx.strokeStyle = '#6B4423'; ctx.lineWidth = Math.max(2, this.scale * .6);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Spokes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = '#8B6914';
    this.circle(cx, cy, ts * .06);
  }

  private drawCannon(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Barrel
    this.shadedRect(sx + ts * .15, sy + ts * .35, ts * .7, ts * .25, '#333333');
    // Barrel mouth
    this.shadedRect(sx + ts * .1, sy + ts * .32, ts * .12, ts * .3, '#444444');
    // Fuse hole
    ctx.fillStyle = '#222';
    this.circle(sx + ts * .78, sy + ts * .4, ts * .03);
    // Wheels
    this.shadedCircle(sx + ts * .3, sy + ts * .7, ts * .1, '#5A3A1A');
    this.shadedCircle(sx + ts * .7, sy + ts * .7, ts * .1, '#5A3A1A');
    // Wheel hubs
    ctx.fillStyle = '#4A2A0A';
    this.circle(sx + ts * .3, sy + ts * .7, ts * .04);
    this.circle(sx + ts * .7, sy + ts * .7, ts * .04);
  }

  private drawBarrel(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx + ts * .2, sy + ts * .15, ts * .6, ts * .7, '#8B6914');
    // Metal bands
    this.shadedRect(sx + ts * .15, sy + ts * .25, ts * .7, ts * .06, '#6B5020', { outline: false });
    this.shadedRect(sx + ts * .15, sy + ts * .6, ts * .7, ts * .06, '#6B5020', { outline: false });
    // Lid
    ctx.fillStyle = '#7A5A0A';
    ctx.fillRect(sx + ts * .22, sy + ts * .15, ts * .56, ts * .1);
    // Wood grain
    ctx.fillStyle = this.darken('#8B6914', 0.1);
    ctx.fillRect(sx + ts * .35, sy + ts * .35, ts * .03, ts * .2);
    ctx.fillRect(sx + ts * .55, sy + ts * .4, ts * .03, ts * .15);
  }

  private drawAnchor(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const cx = sx + ts * .5, top = sy + ts * .15;
    ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(2, this.scale * .5);
    // Vertical shaft
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, sy + ts * .7); ctx.stroke();
    // Cross bar
    ctx.beginPath(); ctx.moveTo(cx - ts * .2, top + ts * .15); ctx.lineTo(cx + ts * .2, top + ts * .15); ctx.stroke();
    // Curved arms
    ctx.beginPath();
    ctx.arc(cx, sy + ts * .7, ts * .2, 0, Math.PI);
    ctx.stroke();
    // Ring at top
    ctx.beginPath(); ctx.arc(cx, top, ts * .06, 0, Math.PI * 2); ctx.stroke();
  }

  private drawPlankTile(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.shadedRect(sx, sy + ts * .35, ts, ts * .3, '#A08050');
    // Wood grain
    ctx.fillStyle = this.darken('#A08050', 0.08);
    ctx.fillRect(sx + ts * .1, sy + ts * .42, ts * .8, ts * .02);
    ctx.fillRect(sx + ts * .2, sy + ts * .52, ts * .6, ts * .02);
  }

  private drawCrowsNest(sx: number, sy: number): void {
    const { ts } = this;
    // Mast continues up
    this.shadedRect(sx + ts * .4, sy + ts * .3, ts * .2, ts * .7, '#6B4423');
    // Platform
    this.shadedRect(sx + ts * .1, sy + ts * .5, ts * .8, ts * .12, '#8B6914');
    // Railing posts
    this.shadedRect(sx + ts * .1, sy + ts * .3, ts * .06, ts * .22, '#6B4423', { outline: false });
    this.shadedRect(sx + ts * .84, sy + ts * .3, ts * .06, ts * .22, '#6B4423', { outline: false });
    // Railing top bar
    this.shadedRect(sx + ts * .1, sy + ts * .3, ts * .8, ts * .04, '#6B4423', { outline: false });
  }

  private drawTreasureChest(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Chest body
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .5, '#8B6914');
    // Lid
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .15, '#6B5020', { outline: false });
    // Metal bands
    this.shadedRect(sx + ts * .15, sy + ts * .42, ts * .7, ts * .04, '#FFCC00', { outline: false });
    this.shadedRect(sx + ts * .42, sy + ts * .3, ts * .16, ts * .2, '#FFCC00', { outline: false });
    // Lock
    this.shadedCircle(sx + ts * .5, sy + ts * .42, ts * .05, '#FFD700');
    // Keyhole
    ctx.fillStyle = '#333';
    ctx.fillRect(sx + ts * .49, sy + ts * .41, ts * .03, ts * .04);
    // Gold coins peeking out (with glint)
    this.shadedCircle(sx + ts * .35, sy + ts * .28, ts * .04, '#FFD700', false);
    this.shadedCircle(sx + ts * .55, sy + ts * .26, ts * .035, '#FFD700', false);
    this.shadedCircle(sx + ts * .65, sy + ts * .29, ts * .03, '#FFD700', false);
    // Sparkle effect
    const sparkle = Math.sin(Date.now() * 0.005) > 0.7;
    if (sparkle) {
      ctx.fillStyle = 'rgba(255,255,200,0.8)';
      ctx.fillRect(sx + ts * .4, sy + ts * .26, ts * .03, ts * .03);
    }
  }

  private drawJollyRoger(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Mast
    this.shadedRect(sx + ts * .45, sy, ts * .1, ts, '#6B4423');
    // Flag (with wave animation)
    const wave = Math.sin(Date.now() * 0.002) * ts * .02;
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .55, sy + ts * .1);
    ctx.quadraticCurveTo(sx + ts * .75, sy + ts * .18 + wave, sx + ts * .95, sy + ts * .1);
    ctx.lineTo(sx + ts * .95, sy + ts * .4);
    ctx.quadraticCurveTo(sx + ts * .75, sy + ts * .35 - wave, sx + ts * .55, sy + ts * .4);
    ctx.closePath(); ctx.fill();
    // Flag outline
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
    // Skull
    ctx.fillStyle = '#F0F0F0';
    this.circle(sx + ts * .72, sy + ts * .2, ts * .06);
    // Eye sockets
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .69, sy + ts * .19, ts * .03, ts * .02);
    ctx.fillRect(sx + ts * .74, sy + ts * .19, ts * .03, ts * .02);
    // Crossbones
    ctx.strokeStyle = '#F0F0F0'; ctx.lineWidth = Math.max(1, this.scale * .3);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .62, sy + ts * .28); ctx.lineTo(sx + ts * .82, sy + ts * .36);
    ctx.moveTo(sx + ts * .82, sy + ts * .28); ctx.lineTo(sx + ts * .62, sy + ts * .36);
    ctx.stroke();
  }

  /* ── town items ──────────────────────────────── */

  private drawGrassBase(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const c = this.colors;
    const gx = Math.floor(sx / ts), gy = Math.floor(sy / ts);
    const grassColors = [c.floor, c.floorAlt, this.darken(c.floor, 0.04)];
    ctx.fillStyle = grassColors[(gx * 7 + gy * 13) % 3];
    ctx.fillRect(sx, sy, ts, ts);
    // Dot scatter
    const noise = this.floorNoise[gy * this.world.gridWidth + gx] || 0;
    if (noise % 3 === 0) {
      ctx.fillStyle = this.darken(c.floor, 0.12);
      ctx.fillRect(sx + ((noise * 3) % ts), sy + ((noise * 7) % ts), 1, 1);
    }
  }

  private drawLamppost(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.2);
    // Post (black, 2px wide, centered)
    const postW = Math.max(2, ts * .08);
    this.shadedRect(sx + ts * .46, sy + ts * .25, postW, ts * .7, '#333333', { outline: false });
    // Base plate
    this.shadedRect(sx + ts * .35, sy + ts * .85, ts * .3, ts * .1, '#444444');
    // Lamp housing
    this.shadedRect(sx + ts * .35, sy + ts * .18, ts * .3, ts * .12, '#444444');
    // Yellow glow circle at top
    const glowR = ts * .18;
    const glowCx = sx + ts * .5, glowCy = sy + ts * .2;
    ctx.fillStyle = 'rgba(255,220,100,0.25)';
    ctx.beginPath(); ctx.arc(glowCx, glowCy, glowR * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFDD66';
    ctx.beginPath(); ctx.arc(glowCx, glowCy, glowR * .6, 0, Math.PI * 2); ctx.fill();
  }

  private drawBench(sx: number, sy: number): void {
    const { ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.35);
    // Two legs
    this.shadedRect(sx + ts * .15, sy + ts * .55, ts * .08, ts * .3, '#6B4423', { outline: false });
    this.shadedRect(sx + ts * .77, sy + ts * .55, ts * .08, ts * .3, '#6B4423', { outline: false });
    // Seat plank
    this.shadedRect(sx + ts * .1, sy + ts * .48, ts * .8, ts * .12, '#8B6914');
    // Back rest
    this.shadedRect(sx + ts * .1, sy + ts * .3, ts * .8, ts * .08, '#7A5A0A');
    // Back supports
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .06, ts * .25, '#6B4423', { outline: false });
    this.shadedRect(sx + ts * .79, sy + ts * .3, ts * .06, ts * .25, '#6B4423', { outline: false });
  }

  /** Draw a small ground shadow ellipse at the base of a decoration */
  private drawGroundShadow(sx: number, sy: number, widthFactor = 0.35): void {
    const { ctx, ts } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(sx + ts * 0.5, sy + ts * 0.92, ts * widthFactor, ts * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTownTree(sx: number, sy: number): void {
    const { ts } = this;
    const c = this.colors;
    this.drawGrassBase(sx, sy);
    // Ground shadow
    this.drawGroundShadow(sx, sy, 0.38);
    // Brown trunk (bottom 40%)
    this.shadedRect(sx + ts * .38, sy + ts * .5, ts * .24, ts * .45, '#5A3A1A');
    // Leafy canopy with subtle sway
    const sway = Math.sin(Date.now() * 0.001 + sx * 0.5) * ts * 0.01;
    this.shadedCircle(sx + ts * .5 + sway, sy + ts * .3, ts * .35, c.plantLeaf);
    this.shadedCircle(sx + ts * .32 + sway, sy + ts * .38, ts * .22, c.plantLeafAlt, false);
    this.shadedCircle(sx + ts * .68 + sway, sy + ts * .38, ts * .22, c.plantLeafAlt, false);
    this.shadedCircle(sx + ts * .5 + sway, sy + ts * .18, ts * .2, this.lighten(c.plantLeaf, 0.1), false);
  }

  private drawFountain(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.4);
    this.shadedRect(sx + ts * .1, sy + ts * .2, ts * .8, ts * .7, '#8A8A8A');
    // Inner basin
    this.shadedRect(sx + ts * .18, sy + ts * .28, ts * .64, ts * .54, '#7A7A7A', { outline: false });
    // Blue water center
    ctx.fillStyle = '#5599CC';
    ctx.fillRect(sx + ts * .22, sy + ts * .32, ts * .56, ts * .46);
    // Animated water shimmer
    const shimmer = Math.sin(Date.now() * 0.003) * 0.2;
    ctx.fillStyle = `rgba(200,240,255,${(0.25 + shimmer).toFixed(2)})`;
    ctx.fillRect(sx + ts * .28, sy + ts * .38, ts * .2, ts * .06);
    const shimmer2 = Math.sin(Date.now() * 0.003 + 1.5) * 0.15;
    ctx.fillStyle = `rgba(200,240,255,${(0.2 + shimmer2).toFixed(2)})`;
    ctx.fillRect(sx + ts * .52, sy + ts * .52, ts * .18, ts * .05);
    // Center spout
    this.shadedRect(sx + ts * .44, sy + ts * .35, ts * .12, ts * .25, '#999999');
    // Water spray from top (animated)
    const sprayH = ts * .12 + Math.sin(Date.now() * 0.005) * ts * .04;
    ctx.fillStyle = 'rgba(150,210,255,0.5)';
    ctx.fillRect(sx + ts * .47, sy + ts * .35 - sprayH, ts * .06, sprayH);
  }

  private drawFlowerBed(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.3);
    ctx.fillStyle = '#5A4A25';
    ctx.fillRect(sx + ts * .1, sy + ts * .65, ts * .8, ts * .25);
    // Small colorful flowers (3-4 colored dots)
    const flowerColors = ['#E74C3C', '#F1C40F', '#FF69B4', '#3498DB'];
    const positions = [
      [.2, .45], [.45, .4], [.7, .48], [.55, .55],
    ];
    for (let i = 0; i < 4; i++) {
      // Stem
      ctx.fillStyle = '#3A7A2A';
      ctx.fillRect(sx + ts * positions[i][0], sy + ts * positions[i][1], ts * .04, ts * .25);
      // Flower head
      ctx.fillStyle = flowerColors[i];
      this.circle(sx + ts * (positions[i][0] + .02), sy + ts * positions[i][1], ts * .06);
    }
    // Leaves
    ctx.fillStyle = '#4A8A3A';
    ctx.fillRect(sx + ts * .15, sy + ts * .58, ts * .08, ts * .05);
    ctx.fillRect(sx + ts * .62, sy + ts * .56, ts * .08, ts * .05);
  }

  private drawFence(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    // Fence posts
    this.shadedRect(sx + ts * .1, sy + ts * .2, ts * .1, ts * .65, '#8B6914');
    this.shadedRect(sx + ts * .8, sy + ts * .2, ts * .1, ts * .65, '#8B6914');
    // Post tops (pointed)
    ctx.fillStyle = '#A07820';
    ctx.fillRect(sx + ts * .08, sy + ts * .15, ts * .14, ts * .08);
    ctx.fillRect(sx + ts * .78, sy + ts * .15, ts * .14, ts * .08);
    // Horizontal rails
    this.shadedRect(sx, sy + ts * .35, ts, ts * .06, '#A08050', { outline: false });
    this.shadedRect(sx, sy + ts * .6, ts, ts * .06, '#A08050', { outline: false });
  }

  private drawMailbox(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.2);
    // Post
    this.shadedRect(sx + ts * .44, sy + ts * .45, ts * .12, ts * .5, '#6B4423', { outline: false });
    // Blue mailbox body
    this.shadedRect(sx + ts * .25, sy + ts * .2, ts * .5, ts * .3, '#2980B9');
    // Mailbox top (rounded look)
    this.shadedRect(sx + ts * .22, sy + ts * .16, ts * .56, ts * .08, '#3498DB');
    // Mail slot
    ctx.fillStyle = '#1A5276';
    ctx.fillRect(sx + ts * .35, sy + ts * .32, ts * .3, ts * .04);
    // Flag (red)
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(sx + ts * .72, sy + ts * .2, ts * .04, ts * .15);
    ctx.fillRect(sx + ts * .72, sy + ts * .2, ts * .12, ts * .06);
  }

  private drawSignpost(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.2);
    // Wooden post
    this.shadedRect(sx + ts * .44, sy + ts * .15, ts * .12, ts * .8, '#6B4423');
    // Directional arrow sign
    this.shadedRect(sx + ts * .2, sy + ts * .2, ts * .55, ts * .15, '#A08050');
    // Arrow shape (right)
    ctx.fillStyle = '#A08050';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .75, sy + ts * .2);
    ctx.lineTo(sx + ts * .88, sy + ts * .275);
    ctx.lineTo(sx + ts * .75, sy + ts * .35);
    ctx.closePath(); ctx.fill();
    // Text line on sign
    ctx.fillStyle = '#3A2A1A';
    ctx.fillRect(sx + ts * .25, sy + ts * .26, ts * .35, ts * .03);
  }

  private drawWater(sx: number, sy: number): void {
    const { ctx, ts } = this;
    // Blue water tile
    const baseBlue = '#4488AA';
    ctx.fillStyle = baseBlue;
    ctx.fillRect(sx, sy, ts, ts);
    // Animated wave pattern
    const t = Date.now() * 0.002;
    ctx.fillStyle = this.lighten(baseBlue, 0.1);
    for (let i = 0; i < 3; i++) {
      const waveX = (Math.sin(t + i * 2) * ts * .08);
      const waveY = sy + ts * (.2 + i * .3);
      ctx.fillRect(sx + ts * .1 + waveX, waveY, ts * .3, ts * .04);
    }
    // Shimmer highlight
    const shimmer = Math.sin(t * 1.5) * 0.15;
    ctx.fillStyle = `rgba(200,240,255,${(0.15 + shimmer).toFixed(2)})`;
    ctx.fillRect(sx + ts * .5, sy + ts * .35, ts * .2, ts * .06);
    ctx.fillStyle = `rgba(200,240,255,${(0.1 + shimmer).toFixed(2)})`;
    ctx.fillRect(sx + ts * .2, sy + ts * .65, ts * .15, ts * .05);
    // Subtle border
    ctx.strokeStyle = this.darken(baseBlue, 0.15);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
  }

  private drawMarketStall(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.4);
    // Wooden counter
    this.shadedRect(sx + ts * .05, sy + ts * .5, ts * .9, ts * .35, '#8B6914');
    // Goods on counter (colorful boxes)
    const goods = ['#E74C3C', '#F39C12', '#27AE60', '#3498DB'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = goods[i];
      const gx = sx + ts * (.1 + i * .2);
      ctx.fillRect(gx, sy + ts * .42, ts * .14, ts * .12);
    }
    // Striped awning above
    const awningH = ts * .25;
    const stripeW = Math.max(2, Math.floor(ts / 5));
    for (let sx2 = 0; sx2 < ts; sx2 += stripeW * 2) {
      ctx.fillStyle = '#CC4444';
      ctx.fillRect(sx + sx2, sy + ts * .15, stripeW, awningH);
      ctx.fillStyle = '#EEEECC';
      ctx.fillRect(sx + sx2 + stripeW, sy + ts * .15, stripeW, awningH);
    }
    // Awning edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(sx, sy + ts * .15 + awningH, ts, ts * .04);
    // Support posts
    this.shadedRect(sx + ts * .08, sy + ts * .15, ts * .06, ts * .7, '#6B4423', { outline: false });
    this.shadedRect(sx + ts * .86, sy + ts * .15, ts * .06, ts * .7, '#6B4423', { outline: false });
  }

  private drawWell(sx: number, sy: number): void {
    const { ctx, ts } = this;
    this.drawGrassBase(sx, sy);
    this.drawGroundShadow(sx, sy, 0.35);
    // Stone circle base
    this.shadedRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .55, '#8A8A7A');
    // Inner dark water
    ctx.fillStyle = '#2A3A5A';
    ctx.fillRect(sx + ts * .22, sy + ts * .38, ts * .56, ts * .4);
    // Water shimmer
    const shimmer = Math.sin(Date.now() * 0.002) * 0.15;
    ctx.fillStyle = `rgba(100,150,200,${(0.2 + shimmer).toFixed(2)})`;
    ctx.fillRect(sx + ts * .28, sy + ts * .48, ts * .2, ts * .06);
    // Roof structure (A-frame)
    this.shadedRect(sx + ts * .15, sy + ts * .15, ts * .06, ts * .6, '#5A3A1A', { outline: false });
    this.shadedRect(sx + ts * .79, sy + ts * .15, ts * .06, ts * .6, '#5A3A1A', { outline: false });
    // Cross beam
    this.shadedRect(sx + ts * .15, sy + ts * .12, ts * .7, ts * .06, '#6B4423');
    // Rope
    ctx.fillStyle = '#A09060';
    ctx.fillRect(sx + ts * .48, sy + ts * .18, ts * .04, ts * .25);
    // Bucket
    this.shadedRect(sx + ts * .42, sy + ts * .4, ts * .16, ts * .1, '#7A7A7A');
  }

  /* ── workstations (env-specific) ────────────── */

  private drawWorkstations(): void {
    this.drawZones();
  }

  /** Desk-type zones that have a desk+chair tile pair */
  private static DESK_ZONES = new Set<string>([
    'desk', 'tool_bench', 'control_panel', 'bridge_console', 'barn_workshop',
    'nav_table', 'science_lab', 'lab_bench', 'reception', 'patient_station',
    'shop_counter', 'workshop_bench',
  ]);

  /** Map zone types to visual variants */
  private getZoneVariant(type: string): string {
    switch (type) {
      case 'desk': case 'reception': return 'office';
      case 'patient_station': case 'lab_bench': return 'medical';
      case 'control_panel': case 'bridge_console': case 'science_lab': case 'engineering': return 'console';
      case 'nav_table': return 'pirate';
      case 'tool_bench': case 'barn_workshop': case 'workshop_bench': return 'workbench';
      case 'shop_counter': return 'office';
      default: return 'workbench';
    }
  }

  private drawZones(): void {
    const { ctx, ts } = this;
    const c = this.colors;

    for (const zone of this.world.zones) {
      const isDeskZone = Renderer.DESK_ZONES.has(zone.type);

      if (isDeskZone) {
        // Desk-type zone: desk tiles at (pos.x, pos.y-1) and (pos.x+1, pos.y-1)
        const deskY = zone.position.y - 1;
        const deskX = zone.position.x;
        if (deskY >= 0) {
          for (let dx = 0; dx < 2; dx++) {
            const tx = deskX + dx;
            if (tx < this.world.gridWidth && this.world.tiles[deskY]?.[tx]?.type === 'desk') {
              const sx = tx * ts, sy = deskY * ts;
              this.shadedRect(sx + 1, sy + ts * .2, ts - 2, ts * .55, c.deskTop);
              this.shadedRect(sx + 1, sy + ts * .7, ts - 2, ts * .2, c.deskEdge, { outline: false });
              this.shadedRect(sx + 2, sy + ts * .85, ts * .12, ts * .15, c.deskLeg, { outline: false });
              this.shadedRect(sx + ts - 2 - ts * .12, sy + ts * .85, ts * .12, ts * .15, c.deskLeg, { outline: false });
            }
          }
        }

        // Items on desk
        const mx = deskX * ts, my = deskY * ts;
        const variant = this.getZoneVariant(zone.type);

        if (variant === 'office' || variant === 'medical') {
          const px = mx + ts * .2, py = my + ts * .02;
          const mw = ts * .55, mh = ts * .35;
          this.shadedRect(px, py, mw, mh, c.monitor);
          ctx.fillStyle = zone.assignedAgentId ? c.screenOn : c.screenOff;
          ctx.fillRect(px + 2, py + 2, mw - 4, mh - 4);
          if (zone.assignedAgentId) {
            this.drawScreenContent(px + 2, py + 2, mw - 4, mh - 4, zone.assignedAgentId, variant === 'medical');
          }
          this.shadedRect(px + mw * .35, py + mh, mw * .3, ts * .06, c.monitor, { outline: false });
          ctx.fillStyle = this.darken(c.monitor, 0.1);
          ctx.fillRect(px + mw * .25, py + mh + ts * .05, mw * .5, ts * .03);
          if (variant === 'medical') {
            ctx.fillStyle = '#E74C3C';
            ctx.fillRect(px + mw * .35, py + mh * .3, mw * .3, mw * .04);
            ctx.fillRect(px + mw * .48, py + mh * .15, mw * .04, mw * .3);
          }
        } else if (variant === 'console') {
          this.shadedRect(mx + ts * .1, my + ts * .05, ts * .8, ts * .25, '#1A2A3A');
          ctx.fillStyle = zone.assignedAgentId ? '#44AAFF' : '#0A1520';
          ctx.fillRect(mx + ts * .15, my + ts * .08, ts * .7, ts * .18);
          if (zone.assignedAgentId) {
            this.drawScreenContent(mx + ts * .15, my + ts * .08, ts * .7, ts * .18, zone.assignedAgentId, false);
          }
          if (zone.assignedAgentId) {
            const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
            ctx.fillStyle = `rgba(68,170,85,${pulse.toFixed(2)})`;
          } else {
            ctx.fillStyle = '#333';
          }
          this.circle(mx + ts * .85, my + ts * .16, ts * .03);
          ctx.fillStyle = '#445566';
          ctx.fillRect(mx + ts * .15, my + ts * .27, ts * .08, ts * .04);
          ctx.fillRect(mx + ts * .28, my + ts * .27, ts * .08, ts * .04);
        } else if (variant === 'pirate') {
          this.shadedRect(mx + ts * .1, my + ts * .05, ts * .7, ts * .25, '#D4C5A0');
          ctx.fillStyle = '#8B6914';
          ctx.fillRect(mx + ts * .2, my + ts * .12, ts * .15, ts * .02);
          ctx.fillRect(mx + ts * .4, my + ts * .18, ts * .2, ts * .02);
          ctx.strokeStyle = '#CC3333'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx + ts * .55, my + ts * .1); ctx.lineTo(mx + ts * .62, my + ts * .17);
          ctx.moveTo(mx + ts * .62, my + ts * .1); ctx.lineTo(mx + ts * .55, my + ts * .17);
          ctx.stroke();
          ctx.fillStyle = '#F0E0C0';
          ctx.fillRect(mx + ts * .78, my + ts * .12, ts * .08, ts * .15);
          const flameFlicker = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
          ctx.fillStyle = `rgba(255,200,50,${flameFlicker.toFixed(2)})`;
          this.circle(mx + ts * .82, my + ts * .1, ts * .04);
          ctx.fillStyle = `rgba(255,100,20,${(flameFlicker * 0.6).toFixed(2)})`;
          this.circle(mx + ts * .82, my + ts * .08, ts * .025);
        } else {
          this.shadedRect(mx + ts * .15, my + ts * .08, ts * .3, ts * .12, '#888888');
          this.shadedRect(mx + ts * .55, my + ts * .1, ts * .2, ts * .08, '#888888');
          ctx.fillStyle = '#AAA';
          ctx.fillRect(mx + ts * .6, my + ts * .06, ts * .1, ts * .04);
        }

        // Chair
        const cp = zone.position;
        const cx = cp.x * ts, cy = cp.y * ts;
        this.shadedRect(cx + ts * .2, cy + ts * .3, ts * .6, ts * .4, c.chairSeat);
        this.shadedRect(cx + ts * .2, cy + ts * .65, ts * .6, ts * .15, c.chairBack);
        ctx.fillStyle = this.darken(c.chairBack, 0.2);
        ctx.fillRect(cx + ts * .22, cy + ts * .8, ts * .04, ts * .12);
        ctx.fillRect(cx + ts * .74, cy + ts * .8, ts * .04, ts * .12);
      }
      // Standing zones: environment objects drawn by drawDecor(), no extra furniture needed
    }

    // Draw room divider walls
    this.drawRoomWalls();
  }

  private drawRoomWalls(): void {
    const { ts } = this;
    const c = this.colors;
    for (let y = 0; y < this.world.gridHeight; y++) {
      for (let x = 1; x < this.world.gridWidth - 1; x++) {
        const tile = this.world.tiles[y][x];
        if (tile.type === 'wall' && y > 0 && y < this.world.gridHeight - 1 && x > 0 && x < this.world.gridWidth - 1) {
          // Check if it's an interior wall (not on the border)
          const isTopBorder = y === 0;
          const isBotBorder = y === this.world.gridHeight - 1;
          const isLeftBorder = x === 0;
          const isRightBorder = x === this.world.gridWidth - 1;
          if (!isTopBorder && !isBotBorder && !isLeftBorder && !isRightBorder) {
            const sx = x * ts, sy = y * ts;
            this.shadedRect(sx, sy, ts, ts, c.wall);
            // Wall top highlight
            this.ctx.fillStyle = c.wallTop;
            this.ctx.fillRect(sx + 1, sy + 1, ts - 2, ts * .3);
          }
        }
      }
    }
  }

  private drawRoomLabels(): void {
    const { ctx, ts } = this;

    // ── Draw orchestrator corridor separator line ──
    const sepY = (ORCHESTRATOR_ROWS + 1) * ts;
    const gridW = this.world.gridWidth * ts;
    if (this.env === 'town') {
      // Subtle fence-top highlight
      ctx.fillStyle = 'rgba(100, 80, 40, 0.3)';
      ctx.fillRect(ts, sepY, gridW - 2 * ts, Math.max(1, this.scale * 0.5));
    } else {
      // Glass railing effect
      ctx.fillStyle = 'rgba(120, 180, 255, 0.15)';
      ctx.fillRect(ts, sepY + ts * 0.4, gridW - 2 * ts, Math.max(1, this.scale * 0.8));
      ctx.fillStyle = 'rgba(200, 230, 255, 0.08)';
      ctx.fillRect(ts, sepY + ts * 0.1, gridW - 2 * ts, Math.max(1, this.scale * 0.4));
    }

    for (const room of this.world.rooms) {
      // Skip "Town Square" label in town environment
      if (this.env === 'town' && room.id === 0 && room.name === 'Town Square') continue;

      const cx = (room.bounds.x + room.bounds.w / 2) * ts;
      const ry = room.bounds.y * ts - ts * 0.1;
      const fontSize = Math.max(7, ts * 0.45);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // ── Orchestrator / Management corridor label ──
      if (room.id === 9000) {
        const mgrFontSize = Math.max(8, ts * 0.45);
        ctx.font = `bold ${mgrFontSize}px sans-serif`;
        // Centered vertically in the top wall layer (row 0)
        const labelY = ts * 0.5;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = this.env === 'town' ? 'rgba(240, 232, 208, 0.8)' : 'rgba(200, 220, 255, 0.75)';
        ctx.fillText('⬥ ' + room.name, (room.bounds.x + 0.5) * ts, labelY);
        ctx.textAlign = 'center';
        continue;
      }

      if (this.env === 'town') {
        // ── Ceiling label: draw on the roof tile row ──
        const townFontSize = Math.max(8, ts * 0.5);
        ctx.font = `bold ${townFontSize}px sans-serif`;
        const tw = ctx.measureText(room.name).width;
        const stripW = Math.max(tw + ts * .4, room.bounds.w * ts * 0.8);
        const stripH = ts * .55;
        const stripX = cx - stripW / 2;
        const roofTileY = room.roofY ?? room.bounds.y;
        const stripY = roofTileY * ts + (ts - stripH) / 2; // centered on roof tile

        // Semi-transparent dark strip behind text (wooden beam look)
        ctx.fillStyle = 'rgba(40, 25, 10, 0.75)';
        ctx.fillRect(stripX, stripY, stripW, stripH);
        // Thin decorative lines (wood grain)
        ctx.fillStyle = 'rgba(80, 50, 20, 0.5)';
        ctx.fillRect(stripX, stripY, stripW, Math.max(1, this.scale * 0.3));
        ctx.fillRect(stripX, stripY + stripH - Math.max(1, this.scale * 0.3), stripW, Math.max(1, this.scale * 0.3));
        // Text
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#F0E8D0';
        ctx.fillText(room.name, cx, stripY + stripH / 2);

        // ── Info sign: show kanban stage name if different from room name ──
        if (room.kanbanStageName && room.kanbanStageName !== room.name) {
          const infoFontSize = Math.max(6, townFontSize * 0.6);
          ctx.font = `${infoFontSize}px sans-serif`;
          ctx.fillStyle = 'rgba(240, 232, 208, 0.55)';
          ctx.fillText(`→ ${room.kanbanStageName}`, cx, stripY + stripH + infoFontSize * 0.7);
        }

        // Restore font
        ctx.font = `bold ${fontSize}px sans-serif`;
      } else {
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillText(room.name, cx, ry);

        // ── Info sign: show kanban stage name if different from room name ──
        if (room.kanbanStageName && room.kanbanStageName !== room.name) {
          const infoFontSize = Math.max(5, fontSize * 0.6);
          ctx.font = `${infoFontSize}px sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.textBaseline = 'top';
          ctx.fillText(`→ ${room.kanbanStageName}`, cx, ry + 2);
          ctx.font = `bold ${fontSize}px sans-serif`;
        }
      }
    }
  }

  /** Draw animated screen content (code, charts, ECG) */
  private drawScreenContent(sx: number, sy: number, sw: number, sh: number, agentId: string, isMedical: boolean): void {
    const ctx = this.ctx;
    const t = Date.now();

    // Deterministic seed from agent ID
    let seed = 0;
    for (let i = 0; i < agentId.length; i++) seed = ((seed << 5) - seed + agentId.charCodeAt(i)) | 0;
    seed = Math.abs(seed);
    const contentType = isMedical ? 3 : seed % 3;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();

    if (contentType === 0) {
      // Scrolling code lines
      const lineH = Math.max(2, Math.floor(sh / 7));
      const scrollOffset = (t * 0.015) % (sh * 2);
      const lineColors = ['#88CCFF', '#FFCC44', '#88FF88', '#FF8888', '#CCAAFF'];
      for (let i = 0; i < 8; i++) {
        const ly = sy - scrollOffset + i * (lineH + Math.max(1, lineH * 0.4));
        if (ly < sy - lineH || ly > sy + sh) continue;
        const lineW = sw * (0.25 + ((seed + i * 7) % 5) / 8);
        const indent = ((seed + i * 3) % 3) * sw * 0.1;
        ctx.fillStyle = lineColors[(seed + i) % lineColors.length];
        ctx.globalAlpha = 0.5;
        ctx.fillRect(sx + 2 + indent, ly, lineW, lineH - 1);
      }
    } else if (contentType === 1) {
      // Bar chart
      const barCount = 4;
      const barW = (sw - 4) / barCount;
      for (let i = 0; i < barCount; i++) {
        const h = sh * (0.2 + ((seed + i * 13) % 6) / 10);
        const pulse = Math.sin(t * 0.002 + i * 1.5) * sh * 0.04;
        ctx.fillStyle = i % 2 === 0 ? '#44AAFF' : '#44FF88';
        ctx.globalAlpha = 0.5;
        ctx.fillRect(sx + 2 + i * barW, sy + sh - h - pulse, barW - 2, h + pulse);
      }
    } else if (contentType === 2) {
      // Data grid
      ctx.globalAlpha = 0.4;
      const rows = 3, cols = 3;
      const cellW = (sw - 4) / cols, cellH = (sh - 4) / rows;
      for (let r = 0; r < rows; r++) {
        for (let co = 0; co < cols; co++) {
          ctx.fillStyle = ((r + co) % 2 === 0) ? '#88CCFF' : '#44FF88';
          ctx.fillRect(sx + 2 + co * cellW, sy + 2 + r * cellH, cellW - 1, cellH - 1);
        }
      }
    } else {
      // Medical ECG
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(sw / 20));
      for (let px = 0; px < sw; px += step) {
        const phase = (t * 0.004 + px * 0.15 + seed) % (Math.PI * 8);
        const beat = phase % (Math.PI * 2);
        const spike = beat < 0.6 ? Math.sin(beat * 10) * sh * 0.3 : 0;
        const lineY = sy + sh / 2 - spike;
        px === 0 ? ctx.moveTo(sx + px, lineY) : ctx.lineTo(sx + px, lineY);
      }
      ctx.stroke();
    }

    // Blinking cursor
    if (Math.floor(t / 500) % 2 === 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.7;
      const cursorH = Math.max(2, sh * 0.12);
      ctx.fillRect(sx + sw * 0.08, sy + sh - cursorH - 2, Math.max(1, sw * 0.04), cursorH);
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.globalAlpha = 1;
    for (let y = 0; y < sh; y += 2) {
      ctx.fillRect(sx, sy + y, sw, 1);
    }

    ctx.restore();
  }

  /* ── glow effects ─────────────────────────────── */

  private drawGlowEffects(): void {
    const { ctx, ts } = this;
    const w = this.world;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Monitor glow on floor below active zones
    for (const zone of w.zones) {
      if (!zone.assignedAgentId) continue;
      if (!Renderer.DESK_ZONES.has(zone.type)) continue;
      const glowX = zone.position.x * ts + ts * 0.5;
      const glowY = zone.position.y * ts;
      const glowColor = this.colors.screenOn;
      const grad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, ts * 1.2);
      grad.addColorStop(0, this.hexToRgba(glowColor, 0.06));
      grad.addColorStop(1, this.hexToRgba(glowColor, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(glowX - ts * 1.2, glowY - ts * 1.2, ts * 2.4, ts * 2.4);
    }

    // Environment-specific glow from special objects
    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const t = w.tiles[y][x].type;
        const cx = x * ts + ts * 0.5, cy = y * ts + ts * 0.5;
        let glowColor: string | null = null;
        let glowRadius = ts * 1.2;
        let glowAlpha = 0.05;

        switch (t) {
          case 'rocket_engine':
            glowColor = '#FF6600'; glowRadius = ts * 2; glowAlpha = 0.1;
            break;
          case 'hull_window':
            if (this.env === 'space_station') { glowColor = '#4488FF'; glowAlpha = 0.03; }
            break;
          case 'xray_machine':
            glowColor = '#00BCD4'; glowAlpha = 0.04;
            break;
          case 'treasure_chest':
            glowColor = '#FFD700'; glowAlpha = 0.04;
            break;
          case 'lamppost':
            glowColor = '#FFDD66'; glowRadius = ts * 2; glowAlpha = 0.08;
            break;
          case 'fountain':
            glowColor = '#88CCFF'; glowAlpha = 0.04;
            break;
          case 'hospital_bed':
            glowColor = '#AADDFF'; glowAlpha = 0.03;
            break;
          case 'sink':
            glowColor = '#88BBDD'; glowAlpha = 0.02;
            break;
          case 'tractor':
            glowColor = '#FFCC44'; glowRadius = ts * 1.5; glowAlpha = 0.05;
            break;
          case 'cannon':
            glowColor = '#FF8844'; glowAlpha = 0.03;
            break;
          case 'ship_wheel':
            glowColor = '#FFAA44'; glowAlpha = 0.04;
            break;
          case 'satellite':
            glowColor = '#66AAFF'; glowRadius = ts * 1.5; glowAlpha = 0.04;
            break;
          case 'solar_panel':
            glowColor = '#44CCFF'; glowAlpha = 0.03;
            break;
          case 'coffee':
            glowColor = '#FF9944'; glowAlpha = 0.02;
            break;
        }

        if (glowColor) {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
          grad.addColorStop(0, this.hexToRgba(glowColor, glowAlpha));
          grad.addColorStop(1, this.hexToRgba(glowColor, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(cx - glowRadius, cy - glowRadius, glowRadius * 2, glowRadius * 2);
        }
      }
    }

    ctx.restore();
  }

  /* ── agent ──────────────────────────────────── */

  private drawAgent(agent: Agent): void {
    const { ctx, ts, scale } = this;

    // ── Portal VFX ──
    if (agent.portalState !== 'none') {
      const centerX = agent.x * ts + ts / 2;
      const centerY = agent.y * ts + ts / 2;

      if (agent.portalState === 'departing') {
        const t = Math.min(1, agent.portalTimer / 0.6);
        // Growing glow ring
        const ringR = ts * 0.5 + t * ts * 0.6;
        const alpha = 0.4 * (1 - t * 0.5);
        const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, ringR);
        grad.addColorStop(0, `rgba(100,220,255,${alpha})`);
        grad.addColorStop(0.6, `rgba(100,220,255,${alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(100,220,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(centerX - ringR, centerY - ringR, ringR * 2, ringR * 2);

        // Spiral particles inward
        for (let i = 0; i < 6; i++) {
          const angle = t * Math.PI * 4 + i * Math.PI / 3;
          const dist = ringR * (1 - t);
          const px = centerX + Math.cos(angle) * dist;
          const py = centerY + Math.sin(angle) * dist;
          ctx.fillStyle = `rgba(180,240,255,${0.6 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(px, py, scale * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Agent shrinks as they depart
        if (t < 0.8) {
          const agentScale = 1 - t * 1.2;
          if (agentScale > 0) {
            const { frame, flip } = agent.getCurrentSprite();
            const cw = frame.width * scale * agentScale;
            const ch = frame.height * scale * agentScale;
            const cx2 = centerX - cw / 2;
            const cy2 = centerY - ch / 2;
            ctx.globalAlpha = 1 - t;
            const envPalette = this.getEnvPalette(agent);
            renderSprite(ctx, frame, cx2, cy2, scale * agentScale, envPalette, flip);
            ctx.globalAlpha = 1;
          }
        }

        // Flash at end of departure
        if (t > 0.7) {
          const flashAlpha = (t - 0.7) / 0.3 * 0.4;
          ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
          ctx.beginPath();
          ctx.arc(centerX, centerY, ts * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (agent.portalState === 'arriving') {
        const t = Math.min(1, agent.portalTimer / 0.5);

        // Expanding ring
        const ringR = ts * 1.2 * t;
        const alpha = 0.35 * (1 - t);
        ctx.strokeStyle = `rgba(100,220,255,${alpha})`;
        ctx.lineWidth = Math.max(1, scale * 0.6 * (1 - t));
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Agent scales up
        const agentScale = Math.min(1, t * 1.5);
        const { frame, flip } = agent.getCurrentSprite();
        const cw = frame.width * scale * agentScale;
        const ch = frame.height * scale * agentScale;
        const cx2 = centerX - cw / 2;
        const cy2 = centerY - ch / 2;
        ctx.globalAlpha = Math.min(1, t * 2);
        const envPalette = this.getEnvPalette(agent);
        renderSprite(ctx, frame, cx2, cy2, scale * agentScale, envPalette, flip);
        ctx.globalAlpha = 1;

        // Sparkle particles outward
        for (let i = 0; i < 4; i++) {
          const angle = t * Math.PI * 2 + i * Math.PI / 2;
          const dist = ts * 0.3 + t * ts * 0.5;
          const px = centerX + Math.cos(angle) * dist;
          const py = centerY + Math.sin(angle) * dist;
          ctx.fillStyle = `rgba(180,240,255,${0.5 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(px, py, scale * 0.6 * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return; // Don't draw normal agent during portal
    }

    const { frame, flip } = agent.getCurrentSprite();
    const cw = frame.width * scale, ch = frame.height * scale;
    const cx = agent.x * ts + (ts - cw) / 2;

    // Walk bob: 1px bounce on even walk frames (contact pose)
    const walkBob = agent.isWalking
      ? Math.abs(Math.sin(agent.animTimer * 8)) * scale * 0.6
      : 0;
    // Breathing bob when stationary
    const breathOffset = (agent.isAtDesk && !agent.isWalking)
      ? Math.sin(agent.breathPhase) * scale * 0.4
      : 0;
    // Squash/stretch on arrival (brief squash effect)
    const arrivalT = agent.isAtDesk && !agent.isWalking ? Math.min(1, (Date.now() - (agent as any)._arriveTime || 0) / 200) : 1;
    const squashX = arrivalT < 1 ? 1 + (1 - arrivalT) * 0.08 : 1;
    const squashY = arrivalT < 1 ? 1 - (1 - arrivalT) * 0.08 : 1;

    const cy = agent.y * ts + (ts - ch) / 2 - scale * 2 + breathOffset + walkBob;

    // Ground shadow (stays fixed, doesn't bob)
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(agent.x * ts + ts / 2, agent.y * ts + ts - scale * 1.5, cw * .25, scale * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Activity-colored glow under agent (subtle, synced to current activity phase)
    const actColor = ACTIVITY_COLORS[agent.resolvedActivity];
    if (actColor && agent.resolvedActivity !== 'idle') {
      ctx.fillStyle = this.hexToRgba(actColor, 0.06);
      ctx.beginPath();
      ctx.ellipse(agent.x * ts + ts / 2, agent.y * ts + ts - scale * 1.5, cw * .4, scale * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const envPalette = this.getEnvPalette(agent);
    const isIdle = agent.resolvedActivity === 'idle' && !agent.isWalking;

    // Gray out idle agents — reduce opacity and apply desaturation
    if (isIdle) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.filter = 'grayscale(85%)';
    }

    // Apply squash/stretch transform for arrival effect
    if (squashX !== 1 || squashY !== 1) {
      ctx.save();
      ctx.translate(cx + cw / 2, cy + ch);
      ctx.scale(squashX, squashY);
      ctx.translate(-(cx + cw / 2), -(cy + ch));
      renderSprite(ctx, frame, cx, cy, scale, envPalette, flip);
      ctx.restore();
    } else {
      renderSprite(ctx, frame, cx, cy, scale, envPalette, flip);
    }

    // Eye blink overlay (cover eye pixels with skin color)
    if (agent.isBlinking) {
      const eyeRow = 3; // Eyes are on row 3 of the 12x16 sprite
      const eyeY = cy + eyeRow * scale;
      // Eye positions: columns 3-4 and 6-7 in the 12-wide grid
      const col1 = flip ? 6 : 3;
      const col2 = flip ? 3 : 6;
      ctx.fillStyle = envPalette.skin;
      ctx.fillRect(cx + col1 * scale, eyeY, scale * 2, scale);
      ctx.fillRect(cx + col2 * scale, eyeY, scale * 2, scale);
    }

    this.drawHeadgear(agent, cx, cy, cw, ch);

    // Activity prop (when at desk and not walking)
    if (agent.isAtDesk && !agent.isWalking) {
      const prop = ACTIVITY_PROP[agent.resolvedActivity];
      if (prop) {
        // Draw near the agent's right hand with gentle bobbing
        const bob = Math.sin(Date.now() * 0.003) * scale * 0.6;
        const propX = cx + cw + scale;
        const propY = cy + ch * 0.4 + bob;
        this.drawActivityProp(prop, propX, propY, scale);
      }
    }

    // Restore from idle gray-out
    if (isIdle) {
      ctx.restore();
    }
  }

  private drawHeadgear(agent: Agent, cx: number, cy: number, cw: number, _ch: number): void {
    const { ctx, scale } = this;
    const headX = cx + cw * 0.5;
    const headY = cy + scale * 2;

    switch (this.env) {
      case 'space_station': {
        ctx.strokeStyle = 'rgba(180,220,255,0.6)';
        ctx.lineWidth = Math.max(1, scale * 0.6);
        ctx.beginPath();
        ctx.arc(headX, headY, scale * 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(180,220,255,0.12)';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(headX - scale, headY - scale * 0.8, scale * 1.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rocket': {
        const hatY = cy - scale * 0.8;
        ctx.fillStyle = '#FFB800';
        ctx.fillRect(headX - scale * 3.2, hatY + scale * 0.5, scale * 6.4, scale * 2);
        ctx.fillStyle = '#E5A600';
        ctx.fillRect(headX - scale * 2.8, hatY, scale * 5.6, scale * 1.5);
        ctx.fillStyle = '#CC9200';
        ctx.fillRect(headX - scale * 2.5, hatY + scale * 0.6, scale * 5, scale * 0.4);
        break;
      }
      case 'farm': {
        const hatY = cy - scale * 1.5;
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(headX - scale * 4, hatY + scale * 2.5, scale * 8, scale * 1.2);
        ctx.fillStyle = '#A07820';
        ctx.fillRect(headX - scale * 2.5, hatY, scale * 5, scale * 2.8);
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(headX - scale * 2, hatY + scale * 1, scale * 4, scale * 0.5);
        break;
      }
      case 'hospital': {
        if (agent.paletteIndex % 3 === 1) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(headX - scale * 2.5, cy - scale * 0.5, scale * 5, scale * 2);
          ctx.fillStyle = '#E74C3C';
          ctx.fillRect(headX - scale * 0.5, cy, scale * 1, scale * 1);
        }
        break;
      }
      case 'pirate_ship': {
        const hatY = cy - scale * 1.2;
        if (agent.paletteIndex % 3 === 0) {
          // Tricorn hat for captains
          ctx.fillStyle = '#1A1A1A';
          ctx.fillRect(headX - scale * 3.5, hatY + scale * 1.5, scale * 7, scale * 1.2);
          ctx.fillStyle = '#2A2A2A';
          ctx.fillRect(headX - scale * 2.5, hatY, scale * 5, scale * 2);
          // Gold trim
          ctx.fillStyle = '#FFCC00';
          ctx.fillRect(headX - scale * 2.5, hatY + scale * 1.5, scale * 5, scale * 0.3);
        } else {
          // Red bandana for crew
          ctx.fillStyle = '#CC2222';
          ctx.fillRect(headX - scale * 3, hatY + scale * 0.8, scale * 6, scale * 1.5);
          ctx.fillStyle = '#AA1111';
          ctx.fillRect(headX + scale * 1.5, hatY + scale * 1.2, scale * 2.5, scale * 0.8);
        }
        break;
      }
      case 'town': {
        // Small cap for some townsfolk
        if (agent.paletteIndex % 3 === 0) {
          const capY = cy - scale * 0.5;
          ctx.fillStyle = '#4A6A8A';
          ctx.fillRect(headX - scale * 2.8, capY + scale * 0.5, scale * 5.6, scale * 1.2);
          // Cap brim
          ctx.fillStyle = '#3A5A7A';
          ctx.fillRect(headX - scale * 1.5, capY + scale * 1.5, scale * 5, scale * 0.6);
        }
        break;
      }
    }
  }

  /* ── activity props ─────────────────────────── */

  private drawActivityProp(prop: ActivityProp, px: number, py: number, scale: number): void {
    const ctx = this.ctx;
    const s = scale; // Shorthand for scale
    const sz = s * 1.2; // Each prop is ~4-6 scaled pixels

    switch (prop) {
      case 'pencil': {
        // Yellow diagonal line with dark tip
        ctx.fillStyle = '#FFD700';
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-0.4);
        ctx.fillRect(0, 0, sz * 1, sz * 4);
        // Dark tip
        ctx.fillStyle = '#333';
        ctx.fillRect(0, sz * 3.5, sz * 1, sz * 0.8);
        // Eraser
        ctx.fillStyle = '#FF8888';
        ctx.fillRect(0, -sz * 0.3, sz * 1, sz * 0.5);
        ctx.restore();
        break;
      }
      case 'hammer': {
        // Brown handle + grey head
        ctx.fillStyle = '#7A5A32';
        ctx.fillRect(px, py + sz * 1.2, sz * 0.8, sz * 3);
        // Grey head
        ctx.fillStyle = '#888';
        ctx.fillRect(px - sz * 0.6, py + sz * 0.3, sz * 2, sz * 1.2);
        ctx.fillStyle = '#AAA';
        ctx.fillRect(px - sz * 0.4, py + sz * 0.5, sz * 1.6, sz * 0.4);
        break;
      }
      case 'clipboard': {
        // White rect with lines
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(px, py, sz * 3, sz * 4);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(px + sz * 0.3, py + sz * 0.6, sz * 2.4, sz * 3.1);
        // Lines
        ctx.fillStyle = '#AAA';
        ctx.fillRect(px + sz * 0.6, py + sz * 1.2, sz * 1.8, sz * 0.3);
        ctx.fillRect(px + sz * 0.6, py + sz * 2.0, sz * 1.4, sz * 0.3);
        ctx.fillRect(px + sz * 0.6, py + sz * 2.8, sz * 1.6, sz * 0.3);
        // Clip
        ctx.fillStyle = '#888';
        ctx.fillRect(px + sz * 1, py - sz * 0.3, sz * 1, sz * 0.6);
        break;
      }
      case 'magnifier': {
        // Circle + handle line
        ctx.strokeStyle = '#555';
        ctx.lineWidth = Math.max(1, s * 0.5);
        ctx.beginPath();
        ctx.arc(px + sz * 1.5, py + sz * 1.5, sz * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        // Glass fill
        ctx.fillStyle = 'rgba(150,200,255,0.25)';
        ctx.fill();
        // Glare
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(px + sz * 1.2, py + sz * 1.2, sz * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // Handle
        ctx.strokeStyle = '#7A5A32';
        ctx.lineWidth = Math.max(1, s * 0.6);
        ctx.beginPath();
        ctx.moveTo(px + sz * 2.4, py + sz * 2.4);
        ctx.lineTo(px + sz * 3.5, py + sz * 3.5);
        ctx.stroke();
        break;
      }
      case 'book': {
        // Colored rect (blue)
        ctx.fillStyle = '#2980B9';
        ctx.fillRect(px, py + sz * 0.3, sz * 3, sz * 3.5);
        // Pages (lighter edge)
        ctx.fillStyle = '#F0F0E0';
        ctx.fillRect(px + sz * 2.6, py + sz * 0.6, sz * 0.4, sz * 2.9);
        // Spine
        ctx.fillStyle = this.darken('#2980B9', 0.15);
        ctx.fillRect(px, py + sz * 0.3, sz * 0.3, sz * 3.5);
        // Title line
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(px + sz * 0.6, py + sz * 1.5, sz * 1.5, sz * 0.3);
        break;
      }
      case 'flask': {
        // Triangle body + neck
        ctx.fillStyle = '#D5F5E3';
        ctx.beginPath();
        ctx.moveTo(px + sz * 0.8, py + sz * 1);
        ctx.lineTo(px, py + sz * 4);
        ctx.lineTo(px + sz * 3, py + sz * 4);
        ctx.lineTo(px + sz * 2.2, py + sz * 1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1ABC9C';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Neck
        ctx.fillStyle = '#D5F5E3';
        ctx.fillRect(px + sz * 1, py, sz * 1, sz * 1.2);
        // Liquid
        ctx.fillStyle = 'rgba(26,188,156,0.4)';
        ctx.fillRect(px + sz * 0.3, py + sz * 2.5, sz * 2.4, sz * 1.3);
        // Bubbles
        ctx.fillStyle = 'rgba(26,188,156,0.6)';
        this.circle(px + sz * 1.2, py + sz * 2.8, sz * 0.2);
        this.circle(px + sz * 1.8, py + sz * 3.2, sz * 0.15);
        break;
      }
      case 'wrench': {
        // Grey wrench shape (simplified)
        ctx.fillStyle = '#888';
        ctx.save();
        ctx.translate(px + sz * 0.5, py);
        ctx.rotate(0.3);
        // Handle
        ctx.fillRect(0, sz * 1, sz * 0.8, sz * 2.5);
        // Head (U-shape via rects)
        ctx.fillRect(-sz * 0.3, sz * 0.2, sz * 1.4, sz * 0.8);
        ctx.fillStyle = this.colors.floor;
        ctx.fillRect(sz * 0.1, sz * 0.4, sz * 0.6, sz * 0.6);
        ctx.restore();
        break;
      }
      case 'checkmark': {
        // Green checkmark
        ctx.strokeStyle = '#27AE60';
        ctx.lineWidth = Math.max(2, s * 0.6);
        ctx.beginPath();
        ctx.moveTo(px, py + sz * 2);
        ctx.lineTo(px + sz * 1.2, py + sz * 3.5);
        ctx.lineTo(px + sz * 3.5, py + sz * 0.5);
        ctx.stroke();
        break;
      }
      case 'warning': {
        // Yellow triangle with !
        ctx.fillStyle = '#F1C40F';
        ctx.beginPath();
        ctx.moveTo(px + sz * 1.5, py);
        ctx.lineTo(px, py + sz * 3.5);
        ctx.lineTo(px + sz * 3, py + sz * 3.5);
        ctx.closePath();
        ctx.fill();
        // Outline
        ctx.strokeStyle = '#E67E22';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Exclamation mark
        ctx.fillStyle = '#333';
        ctx.fillRect(px + sz * 1.3, py + sz * 1, sz * 0.4, sz * 1.4);
        ctx.fillRect(px + sz * 1.3, py + sz * 2.7, sz * 0.4, sz * 0.4);
        break;
      }
      case 'hourglass': {
        // Two triangles connected
        ctx.fillStyle = '#8B6914';
        // Frame top
        ctx.fillRect(px, py, sz * 3, sz * 0.4);
        // Frame bottom
        ctx.fillRect(px, py + sz * 3.6, sz * 3, sz * 0.4);
        // Top triangle (sand)
        ctx.fillStyle = '#F5DEB3';
        ctx.beginPath();
        ctx.moveTo(px + sz * 0.3, py + sz * 0.4);
        ctx.lineTo(px + sz * 2.7, py + sz * 0.4);
        ctx.lineTo(px + sz * 1.5, py + sz * 2);
        ctx.closePath();
        ctx.fill();
        // Bottom triangle (collected sand)
        ctx.beginPath();
        ctx.moveTo(px + sz * 1.5, py + sz * 2);
        ctx.lineTo(px + sz * 0.3, py + sz * 3.6);
        ctx.lineTo(px + sz * 2.7, py + sz * 3.6);
        ctx.closePath();
        ctx.fill();
        // Sand stream
        const sandAlpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.fillStyle = `rgba(210,180,140,${sandAlpha.toFixed(2)})`;
        ctx.fillRect(px + sz * 1.35, py + sz * 1.8, sz * 0.3, sz * 0.5);
        break;
      }
    }
  }

  /* ── speech bubble ──────────────────────────── */

  /** Truncate message to short status label (1-2 words max) */
  private truncateMessage(msg: string): string {
    if (msg.length <= 16) return msg;
    // Try to cut at a word boundary
    const cut = msg.lastIndexOf(' ', 16);
    return (cut > 6 ? msg.slice(0, cut) : msg.slice(0, 14)) + '...';
  }

  private drawBubble(agent: Agent): void {
    if (!agent.message) return;
    const { ctx, ts, scale } = this;
    const bx = agent.x * ts + ts / 2;
    const by = agent.y * ts - ts * .4;
    const text = this.truncateMessage(agent.message);
    ctx.font = `${Math.max(10, scale * 3)}px monospace`;
    const tw = ctx.measureText(text).width;
    const pad = 6, bw = tw + pad * 2, bh = scale * 4 + pad * 2;
    const left = bx - bw / 2, top = by - bh, r = 4;
    // Parchment-style RPG bubble
    ctx.fillStyle = '#F5E6C8'; ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + bw - r, top); ctx.quadraticCurveTo(left + bw, top, left + bw, top + r);
    ctx.lineTo(left + bw, top + bh - r); ctx.quadraticCurveTo(left + bw, top + bh, left + bw - r, top + bh);
    ctx.lineTo(bx + 4, top + bh); ctx.lineTo(bx, top + bh + 5); ctx.lineTo(bx - 4, top + bh);
    ctx.lineTo(left + r, top + bh); ctx.quadraticCurveTo(left, top + bh, left, top + bh - r);
    ctx.lineTo(left, top + r); ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Inner inset border
    ctx.strokeStyle = '#E8D5B0'; ctx.lineWidth = 1;
    ctx.strokeRect(left + 2, top + 2, bw - 4, bh - 4);
    // Text
    ctx.fillStyle = '#3A2A1A'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, top + bh / 2);
  }

  /* ── conversation lines ───────────────────────── */

  private drawConversationLines(agents: Agent[]): void {
    const { ctx, ts } = this;
    const drawn = new Set<string>();

    for (const a of agents) {
      if (a.socialAction !== 'chatting' || !a.socialPartnerId) continue;
      const pairKey = [a.id, a.socialPartnerId].sort().join(':');
      if (drawn.has(pairKey)) continue;
      drawn.add(pairKey);

      const partner = agents.find(b => b.id === a.socialPartnerId);
      if (!partner) continue;

      const ax = a.x * ts + ts / 2;
      const ay = a.y * ts + ts * 0.3;
      const bx = partner.x * ts + ts / 2;
      const by = partner.y * ts + ts * 0.3;

      // Draw a subtle dotted arc between the two agents
      const midX = (ax + bx) / 2;
      const midY = (ay + by) / 2 - ts * 0.6;

      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,200,100,0.35)';
      ctx.lineWidth = Math.max(1, this.scale * 0.4);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(midX, midY, bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Small chat dots pulsing along the arc
      const pulse = (Math.sin(Date.now() * 0.005) + 1) / 2;
      const dotT = 0.3 + pulse * 0.4;
      const dotX = (1 - dotT) * (1 - dotT) * ax + 2 * (1 - dotT) * dotT * midX + dotT * dotT * bx;
      const dotY = (1 - dotT) * (1 - dotT) * ay + 2 * (1 - dotT) * dotT * midY + dotT * dotT * by;
      ctx.fillStyle = 'rgba(255,220,130,0.5)';
      ctx.beginPath();
      ctx.arc(dotX, dotY, Math.max(1.5, this.scale * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── name label ─────────────────────────────── */

  private drawNameLabel(agent: Agent): void {
    const { ctx, ts, scale } = this;
    const lx = agent.x * ts + ts / 2;
    const ly = agent.y * ts + ts + scale;
    ctx.font = `bold ${Math.max(9, scale * 2.5)}px sans-serif`;
    const nw = ctx.measureText(agent.name).width;
    const dotR = scale * .8;
    const totalW = dotR * 2 + 4 + nw;
    const bgH = scale * 3 + 4;
    ctx.fillStyle = 'rgba(50,35,15,0.75)';
    this.roundRect(lx - totalW / 2 - 3, ly - bgH / 2, totalW + 6, bgH, 3);
    // Subtle gold border
    ctx.strokeStyle = 'rgba(139,105,20,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - totalW / 2 - 2.5, ly - bgH / 2 + 0.5, totalW + 5, bgH - 1);
    ctx.fillStyle = ACTIVITY_COLORS[agent.resolvedActivity] ?? '#95A5A6';
    ctx.beginPath(); ctx.arc(lx - totalW / 2 + dotR, ly, dotR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(agent.name, lx + dotR + 2, ly);

    // Mini progress bar below name label
    if (agent.activeTaskCount > 0) {
      const barW = totalW + 2;
      const barH = Math.max(2, scale * 0.6);
      const barX = lx - barW / 2;
      const barY = ly + bgH / 2 + 1;
      const total = agent.completedTaskCount + agent.activeTaskCount;
      const progress = total > 0 ? agent.completedTaskCount / total : 0;
      // Background (dark semi-transparent)
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      // Fill (green)
      ctx.fillStyle = '#27AE60';
      ctx.fillRect(barX, barY, barW * progress, barH);
    }
  }

  /* ── status icons ───────────────────────────── */

  private drawStatusIcon(agent: Agent): void {
    if (agent.message) return;
    const { ctx, ts, scale } = this;
    const ix = agent.x * ts + ts / 2;
    // Gentle float bob above head
    const bob = Math.sin(Date.now() * 0.004 + agent.paletteIndex) * scale * 0.6;
    const iy = agent.y * ts - ts * .25 + bob;
    const sz = scale * 2;
    const activity = agent.resolvedActivity;

    // Draw icon background bubble for important states
    const drawIconBubble = (bgColor: string) => {
      ctx.fillStyle = bgColor;
      ctx.beginPath(); ctx.arc(ix, iy, sz * .55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ix, iy, sz * .55, 0, Math.PI * 2); ctx.stroke();
    };

    switch (activity) {
      // Planning — animated thought bubble with dots
      case 'planning': case 'analyzing': case 'decomposing': {
        // Thought bubble trail (3 small circles ascending)
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(ix + sz * .3, iy + sz * .5, sz * .12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix + sz * .15, iy + sz * .3, sz * .18, 0, Math.PI * 2); ctx.fill();
        // Main thought bubble
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(ix, iy - sz * .1, sz * .45, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ix, iy - sz * .1, sz * .45, 0, Math.PI * 2); ctx.stroke();
        // Animated dots inside
        const a = Math.floor(Date.now() / 400) % 3;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i === a ? '#F39C12' : '#BDC3C7';
          ctx.beginPath(); ctx.arc(ix + (i - 1) * sz * .25, iy - sz * .1, sz * .08, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      // Reading — open book icon
      case 'reading': {
        drawIconBubble('rgba(155,89,182,0.15)');
        ctx.fillStyle = '#9B59B6';
        // Book pages
        ctx.fillRect(ix - sz * .25, iy - sz * .15, sz * .22, sz * .3);
        ctx.fillRect(ix + sz * .03, iy - sz * .15, sz * .22, sz * .3);
        // Spine
        ctx.fillStyle = '#7D3C98';
        ctx.fillRect(ix - sz * .03, iy - sz * .18, sz * .06, sz * .36);
        break;
      }
      // Searching — magnifying glass with pulse
      case 'searching': case 'grepping': {
        const pulse = 0.8 + Math.sin(Date.now() * 0.006) * 0.2;
        ctx.strokeStyle = `rgba(142,68,173,${pulse})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ix - sz * .08, iy - sz * .08, sz * .22, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + sz * .1, iy + sz * .1); ctx.lineTo(ix + sz * .3, iy + sz * .3); ctx.stroke();
        break;
      }
      // Coding — brackets <>
      case 'coding': case 'generating': case 'refactoring': {
        drawIconBubble('rgba(52,152,219,0.12)');
        ctx.strokeStyle = '#3498DB'; ctx.lineWidth = 2;
        // Left bracket <
        ctx.beginPath();
        ctx.moveTo(ix - sz * .05, iy - sz * .2);
        ctx.lineTo(ix - sz * .25, iy);
        ctx.lineTo(ix - sz * .05, iy + sz * .2);
        ctx.stroke();
        // Right bracket >
        ctx.beginPath();
        ctx.moveTo(ix + sz * .05, iy - sz * .2);
        ctx.lineTo(ix + sz * .25, iy);
        ctx.lineTo(ix + sz * .05, iy + sz * .2);
        ctx.stroke();
        break;
      }
      // Testing — flask with bubbling
      case 'testing': case 'validating': {
        ctx.strokeStyle = '#1ABC9C'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ix - sz * .15, iy - sz * .3); ctx.lineTo(ix + sz * .15, iy - sz * .3);
        ctx.moveTo(ix - sz * .1, iy - sz * .3); ctx.lineTo(ix - sz * .25, iy + sz * .25);
        ctx.lineTo(ix + sz * .25, iy + sz * .25); ctx.lineTo(ix + sz * .1, iy - sz * .3);
        ctx.stroke();
        // Bubbling dots inside
        const bub = Math.floor(Date.now() / 300) % 3;
        ctx.fillStyle = '#1ABC9C';
        ctx.beginPath(); ctx.arc(ix - sz * .08, iy + sz * (.05 - bub * .08), sz * .04, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix + sz * .06, iy + sz * (.12 - ((bub + 1) % 3) * .06), sz * .03, 0, Math.PI * 2); ctx.fill();
        break;
      }
      // Linting — checkmark in box
      case 'linting': {
        ctx.strokeStyle = '#16A085'; ctx.lineWidth = 2;
        ctx.strokeRect(ix - sz * .3, iy - sz * .3, sz * .6, sz * .6);
        ctx.beginPath();
        ctx.moveTo(ix - sz * .15, iy); ctx.lineTo(ix - sz * .05, iy + sz * .15); ctx.lineTo(ix + sz * .2, iy - sz * .15);
        ctx.stroke();
        break;
      }
      // Committing/pushing — arrow up with glow
      case 'committing': case 'pushing': {
        drawIconBubble('rgba(108,92,231,0.1)');
        ctx.strokeStyle = '#6C5CE7'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ix, iy + sz * .25); ctx.lineTo(ix, iy - sz * .15);
        ctx.moveTo(ix - sz * .18, iy + sz * .02); ctx.lineTo(ix, iy - sz * .25); ctx.lineTo(ix + sz * .18, iy + sz * .02);
        ctx.stroke();
        break;
      }
      // Deploying — rocket with animated flame
      case 'deploying': {
        const flameH = Math.sin(Date.now() * 0.01) * sz * .08;
        ctx.fillStyle = '#4834D4';
        ctx.beginPath();
        ctx.moveTo(ix, iy - sz * .35);
        ctx.lineTo(ix - sz * .15, iy + sz * .1);
        ctx.lineTo(ix + sz * .15, iy + sz * .1);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FF6600';
        ctx.beginPath();
        ctx.moveTo(ix - sz * .08, iy + sz * .1);
        ctx.lineTo(ix, iy + sz * .3 + flameH);
        ctx.lineTo(ix + sz * .08, iy + sz * .1);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FFCC00';
        ctx.beginPath();
        ctx.moveTo(ix - sz * .04, iy + sz * .1);
        ctx.lineTo(ix, iy + sz * .22 + flameH * 0.5);
        ctx.lineTo(ix + sz * .04, iy + sz * .1);
        ctx.closePath(); ctx.fill();
        break;
      }
      // Paused — ZZZ sleep
      case 'paused': {
        const drift = Date.now() * 0.001;
        ctx.font = `bold ${sz * .6}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
          const za = 0.3 + (2 - i) * 0.2;
          ctx.fillStyle = `rgba(189,195,199,${za})`;
          ctx.fillText('z', ix + i * sz * .2 + Math.sin(drift + i) * 2, iy - i * sz * .25);
        }
        break;
      }
      // Blocked — pulsing red lock
      case 'blocked': {
        const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.3;
        drawIconBubble(`rgba(192,57,43,${(pulse * 0.15).toFixed(2)})`);
        ctx.strokeStyle = `rgba(192,57,43,${pulse})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ix, iy - sz * .15, sz * .15, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = `rgba(192,57,43,${pulse})`;
        ctx.fillRect(ix - sz * .2, iy, sz * .4, sz * .3);
        // Keyhole
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.arc(ix, iy + sz * .08, sz * .04, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ix - 1, iy + sz * .1, 2, sz * .1);
        break;
      }
      // Success — animated green sparkle checkmark
      case 'success': {
        const sparkle = 0.6 + Math.sin(Date.now() * 0.006) * 0.4;
        drawIconBubble(`rgba(39,174,96,${(sparkle * 0.15).toFixed(2)})`);
        ctx.strokeStyle = '#27AE60'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(ix - sz * .25, iy); ctx.lineTo(ix - sz * .05, iy + sz * .2); ctx.lineTo(ix + sz * .25, iy - sz * .2);
        ctx.stroke();
        // Sparkle dots
        if (sparkle > 0.8) {
          ctx.fillStyle = '#2ECC71';
          ctx.beginPath(); ctx.arc(ix + sz * .35, iy - sz * .3, sz * .06, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(ix - sz * .3, iy - sz * .2, sz * .04, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      // Error — pulsing red X
      case 'error': {
        const pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.4;
        drawIconBubble(`rgba(231,76,60,${(pulse * 0.2).toFixed(2)})`);
        ctx.strokeStyle = `rgba(231,76,60,${pulse})`; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(ix - sz * .2, iy - sz * .2); ctx.lineTo(ix + sz * .2, iy + sz * .2);
        ctx.moveTo(ix + sz * .2, iy - sz * .2); ctx.lineTo(ix - sz * .2, iy + sz * .2);
        ctx.stroke();
        break;
      }
      // Waiting approval — RPG quest exclamation mark
      case 'waiting_approval': {
        const bounce = Math.abs(Math.sin(Date.now() * 0.004)) * sz * .15;
        // Exclamation bubble
        ctx.fillStyle = '#E67E22';
        ctx.beginPath(); ctx.arc(ix, iy - bounce, sz * .5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#D35400'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ix, iy - bounce, sz * .5, 0, Math.PI * 2); ctx.stroke();
        // Exclamation mark
        ctx.fillStyle = '#FFF'; ctx.font = `bold ${sz}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', ix, iy - bounce);
        break;
      }
      // Reviewing — eye icon
      case 'reviewing': {
        ctx.strokeStyle = '#E67E22'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ix - sz * .3, iy);
        ctx.quadraticCurveTo(ix, iy - sz * .25, ix + sz * .3, iy);
        ctx.quadraticCurveTo(ix, iy + sz * .25, ix - sz * .3, iy);
        ctx.stroke();
        // Pupil
        ctx.fillStyle = '#E67E22';
        ctx.beginPath(); ctx.arc(ix, iy, sz * .08, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
  }

  /* ── town lighting ─────────────────────────── */

  /** Environment-aware atmosphere lighting overlay with per-tile point lights */
  private drawLightingOverlay(): void {
    // Skip environments that have their own glow systems
    if (this.env === 'rocket' || this.env === 'space_station') return;

    const { ctx, ts } = this;
    const w = this.world;
    const ww = w.gridWidth * ts, wh = w.gridHeight * ts;

    // Ambient tint per environment
    const ambientTint: Record<string, string | null> = {
      town: 'rgb(245, 235, 215)',        // warm golden
      office: 'rgb(240, 240, 245)',       // cool fluorescent
      farm: 'rgb(245, 240, 210)',         // warm sunset
      hospital: 'rgb(235, 245, 250)',     // sterile blue-white
      pirate_ship: 'rgb(220, 225, 240)',  // moonlit
    };

    const tint = ambientTint[this.env];
    if (!tint) return;

    // Ensure light canvas exists
    if (!this.lightCanvas || this.lightCanvas.width !== ww || this.lightCanvas.height !== wh) {
      this.lightCanvas = document.createElement('canvas');
      this.lightCanvas.width = ww;
      this.lightCanvas.height = wh;
    }
    const lctx = this.lightCanvas.getContext('2d')!;

    // Step 1: Fill with ambient tint
    lctx.clearRect(0, 0, ww, wh);
    lctx.fillStyle = tint;
    lctx.fillRect(0, 0, ww, wh);

    // Step 2: Add point light sources (additive blending)
    lctx.globalCompositeOperation = 'lighter';

    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const t = w.tiles[y][x].type;
        const lx = x * ts + ts / 2, ly = y * ts + ts / 2;
        let lightColor: string | null = null;
        let lightRadius = ts * 2;
        let lightAlpha = 0.4;
        let offsetY = 0;

        // Town lights
        if (t === 'lamppost') {
          lightColor = 'rgba(60, 50, 20, 0.7)';
          lightRadius = ts * 3.5; offsetY = -ts * 0.3;
          const grad = lctx.createRadialGradient(lx, ly + offsetY, 0, lx, ly + offsetY, lightRadius);
          grad.addColorStop(0, 'rgba(60, 50, 20, 0.7)');
          grad.addColorStop(0.5, 'rgba(40, 35, 15, 0.2)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          lctx.fillStyle = grad;
          lctx.fillRect(lx - lightRadius, ly + offsetY - lightRadius, lightRadius * 2, lightRadius * 2);
          continue;
        } else if (t === 'building_window') {
          lightColor = 'rgba(50, 40, 15, ALPHA)'; lightRadius = ts * 2; lightAlpha = 0.4;
        } else if (t === 'fountain') {
          lightColor = 'rgba(15, 30, 50, ALPHA)'; lightRadius = ts * 1.5; lightAlpha = 0.25;
        }
        // Hospital lights
        else if (t === 'xray_machine') {
          lightColor = 'rgba(0, 188, 212, ALPHA)'; lightRadius = ts * 1.5; lightAlpha = 0.2;
        } else if (t === 'hospital_bed') {
          lightColor = 'rgba(50, 50, 40, ALPHA)'; lightRadius = ts * 1.2; lightAlpha = 0.15;
        }
        // Farm lights
        else if (t === 'tractor') {
          lightColor = 'rgba(60, 50, 15, ALPHA)'; lightRadius = ts * 1.5; lightAlpha = 0.2;
        }
        // Pirate lights
        else if (t === 'treasure_chest') {
          lightColor = 'rgba(60, 50, 0, ALPHA)'; lightRadius = ts * 1.5; lightAlpha = 0.3;
        } else if (t === 'ship_wheel') {
          lightColor = 'rgba(50, 40, 10, ALPHA)'; lightRadius = ts * 1.2; lightAlpha = 0.15;
        }
        // Office lights
        else if (t === 'coffee') {
          lightColor = 'rgba(50, 35, 10, ALPHA)'; lightRadius = ts * 1; lightAlpha = 0.15;
        }

        if (lightColor) {
          const grad = lctx.createRadialGradient(lx, ly + offsetY, 0, lx, ly + offsetY, lightRadius);
          grad.addColorStop(0, lightColor.replace('ALPHA', lightAlpha.toFixed(2)));
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          lctx.fillStyle = grad;
          lctx.fillRect(lx - lightRadius, ly + offsetY - lightRadius, lightRadius * 2, lightRadius * 2);
        }
      }
    }

    lctx.globalCompositeOperation = 'source-over';

    // Step 3: Composite light buffer onto scene with multiply blend
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightCanvas, 0, 0);
    ctx.restore();
  }

  /* ── helpers ────────────────────────────────── */

  private circle(cx: number, cy: number, r: number): void {
    this.ctx.beginPath(); this.ctx.arc(cx, cy, r, 0, Math.PI * 2); this.ctx.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath(); c.fill();
  }

  private darken(hex: string, amt: number): string {
    const key = `d:${hex}:${amt}`;
    const cached = this.colorCache.get(key);
    if (cached) return cached;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const result = '#' + [r, g, b].map(v => Math.round(v * (1 - amt)).toString(16).padStart(2, '0')).join('');
    this.colorCache.set(key, result);
    return result;
  }

  private lighten(hex: string, amt: number): string {
    const key = `l:${hex}:${amt}`;
    const cached = this.colorCache.get(key);
    if (cached) return cached;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const result = '#' + [r, g, b].map(v => Math.min(255, Math.round(v + (255 - v) * amt)).toString(16).padStart(2, '0')).join('');
    this.colorCache.set(key, result);
    return result;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Draw a rectangle with outline, highlight (top/left), and shadow (bottom/right) edges */
  private shadedRect(
    x: number, y: number, w: number, h: number,
    baseColor: string,
    opts?: { outline?: boolean; highlight?: boolean; shadow?: boolean; highlightAmt?: number; shadowAmt?: number },
  ): void {
    const ctx = this.ctx;
    const o = { outline: true, highlight: true, shadow: true, highlightAmt: 0.2, shadowAmt: 0.2, ...opts };
    const edge = Math.max(1, Math.floor(this.scale * 0.4));

    if (o.outline) {
      ctx.fillStyle = this.darken(baseColor, 0.35);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = baseColor;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    } else {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
    }

    const inset = o.outline ? 1 : 0;
    if (o.highlight && w > 4 && h > 4) {
      ctx.fillStyle = this.lighten(baseColor, o.highlightAmt);
      ctx.fillRect(x + inset, y + inset, w - inset * 2, edge); // top
      ctx.fillRect(x + inset, y + inset, edge, h - inset * 2); // left
    }
    if (o.shadow && w > 4 && h > 4) {
      ctx.fillStyle = this.darken(baseColor, o.shadowAmt);
      ctx.fillRect(x + inset, y + h - inset - edge, w - inset * 2, edge); // bottom
      ctx.fillRect(x + w - inset - edge, y + inset, edge, h - inset * 2); // right
    }
  }

  /** Draw a circle with outline and highlight spot */
  private shadedCircle(cx: number, cy: number, r: number, baseColor: string, outline = true): void {
    const ctx = this.ctx;
    if (outline && r > 2) {
      ctx.fillStyle = this.darken(baseColor, 0.3);
      ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = baseColor;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (r > 3) {
      ctx.fillStyle = this.lighten(baseColor, 0.25);
      ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ── Task visualization ──────────────────────── */

  private getPriorityColor(priority: Priority): string {
    switch (priority) {
      case 'critical': return '#E74C3C';
      case 'high':     return '#F39C12';
      case 'medium':   return '#3498DB';
      case 'low':      return '#95A5A6';
      default:         return '#95A5A6';
    }
  }

  private drawTaskItems(taskViz: TaskVisualizationData): void {
    const { ctx, ts } = this;

    for (const item of taskViz.items) {
      const sx = item.gridX * ts;
      const sy = item.gridY * ts;

      // Glow effect when agent is working on this item
      if (item.isBeingWorked) {
        const pulse = 0.15 + Math.sin(Date.now() * 0.005) * 0.1;
        const glowColor = this.getPriorityColor(item.priority);
        ctx.save();
        ctx.fillStyle = this.hexToRgba(glowColor, pulse);
        ctx.beginPath();
        ctx.ellipse(sx + ts / 2, sy + ts / 2, ts * 0.55, ts * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Done items: faded with checkmark
      if (item.stage === 'done') {
        ctx.save();
        ctx.globalAlpha = 0.45;
        this.drawEnvironmentTaskItem(sx, sy, item);
        ctx.restore();
        // Small checkmark
        const checkSize = Math.max(4, ts * 0.25);
        const cx = sx + ts * 0.75;
        const cy = sy + ts * 0.25;
        ctx.save();
        ctx.strokeStyle = '#27AE60';
        ctx.lineWidth = Math.max(1.5, ts * 0.08);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - checkSize * 0.4, cy);
        ctx.lineTo(cx, cy + checkSize * 0.4);
        ctx.lineTo(cx + checkSize * 0.5, cy - checkSize * 0.35);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      // Gentle bob when being worked on
      const bob = item.isBeingWorked ? Math.sin(Date.now() * 0.006) * this.scale * 0.5 : 0;
      this.drawEnvironmentTaskItem(sx, sy + bob, item);
    }

    // Overflow badges for rooms with more tasks than visible slots
    if (taskViz.overflows) {
      for (const ov of taskViz.overflows) {
        this.drawOverflowBadge(ov);
      }
    }

    if (taskViz.completionBag) {
      this.drawCompletionAccumulator(taskViz.completionBag);
    }

    // Task count per stage room — drawn last so it renders on top of everything
    if (taskViz.stageCounts) {
      for (const sc of taskViz.stageCounts) {
        this.drawRoomTaskCount(sc);
      }
    }
  }

  private drawOverflowBadge(ov: RoomOverflow): void {
    const { ctx, ts } = this;
    const cx = ov.gridX * ts + ts / 2;
    const cy = ov.gridY * ts + ts / 2;
    const fontSize = Math.max(8, ts * 0.6);

    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillText('+', cx, cy);
    ctx.restore();
  }

  private drawRoomTaskCount(sc: RoomTaskCount): void {
    if (sc.count === 0) return;
    const { ctx, ts } = this;
    const text = sc.count > 99 ? '99+' : `${sc.count}`;
    const cx = (sc.bounds.x + sc.bounds.w / 2) * ts;
    // Position in the corridor layer (middle divider between top and bottom halves)
    const midRow = sc.bounds.y + Math.floor(sc.bounds.h / 2);
    const cy = midRow * ts; // top edge of the corridor row
    const fontSize = Math.max(24, ts * 2);

    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  private drawEnvironmentTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    switch (this.env) {
      case 'office':        this.drawOfficeTaskItem(sx, sy, item); break;
      case 'town':          this.drawTownTaskItem(sx, sy, item); break;
      case 'rocket':        this.drawRocketTaskItem(sx, sy, item); break;
      case 'space_station': this.drawSpaceTaskItem(sx, sy, item); break;
      case 'farm':          this.drawFarmTaskItem(sx, sy, item); break;
      case 'hospital':      this.drawHospitalTaskItem(sx, sy, item); break;
      case 'pirate_ship':   this.drawPirateTaskItem(sx, sy, item); break;
      default:              this.drawOfficeTaskItem(sx, sy, item); break;
    }
  }

  // ── Office: paper/folder with colored tab ──
  private drawOfficeTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Paper
    this.shadedRect(sx + ts * .2, sy + ts * .3, ts * .6, ts * .5, '#F5F5F0');
    // Priority color tab
    ctx.fillStyle = pc;
    ctx.fillRect(sx + ts * .2, sy + ts * .26, ts * .22, ts * .08);
    // Text lines
    ctx.fillStyle = '#CCC';
    ctx.fillRect(sx + ts * .28, sy + ts * .45, ts * .42, ts * .03);
    ctx.fillRect(sx + ts * .28, sy + ts * .54, ts * .32, ts * .03);
    ctx.fillRect(sx + ts * .28, sy + ts * .63, ts * .36, ts * .03);
  }

  // ── Town: parchment scroll with wax seal ──
  private drawTownTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Scroll body
    this.shadedRect(sx + ts * .2, sy + ts * .32, ts * .6, ts * .45, '#E8D5B0');
    // Rolled edges
    this.shadedCircle(sx + ts * .23, sy + ts * .34, ts * .05, '#D4C090');
    this.shadedCircle(sx + ts * .77, sy + ts * .34, ts * .05, '#D4C090');
    // Wax seal (priority color)
    this.shadedCircle(sx + ts * .5, sy + ts * .68, ts * .07, pc);
    // Faint text lines
    ctx.fillStyle = '#C4B08A';
    ctx.fillRect(sx + ts * .3, sy + ts * .45, ts * .35, ts * .02);
    ctx.fillRect(sx + ts * .3, sy + ts * .52, ts * .28, ts * .02);
  }

  // ── Rocket: circuit board with LED ──
  private drawRocketTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Board
    this.shadedRect(sx + ts * .2, sy + ts * .35, ts * .6, ts * .4, '#1A3A2A');
    // Traces
    ctx.fillStyle = '#44AA44';
    ctx.fillRect(sx + ts * .28, sy + ts * .45, ts * .18, ts * .025);
    ctx.fillRect(sx + ts * .52, sy + ts * .55, ts * .2, ts * .025);
    ctx.fillRect(sx + ts * .35, sy + ts * .6, ts * .12, ts * .025);
    // Chip
    ctx.fillStyle = '#2A2A2A';
    ctx.fillRect(sx + ts * .4, sy + ts * .42, ts * .12, ts * .08);
    // LED (priority color)
    ctx.fillStyle = pc;
    ctx.beginPath();
    ctx.arc(sx + ts * .72, sy + ts * .42, ts * .035, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Space Station: data pad / tablet ──
  private drawSpaceTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Pad frame
    this.shadedRect(sx + ts * .22, sy + ts * .3, ts * .56, ts * .48, '#3A4A5A');
    // Screen
    ctx.fillStyle = '#1A3050';
    ctx.fillRect(sx + ts * .27, sy + ts * .35, ts * .46, ts * .32);
    // Screen content lines
    ctx.fillStyle = '#4488AA';
    ctx.fillRect(sx + ts * .32, sy + ts * .42, ts * .3, ts * .02);
    ctx.fillRect(sx + ts * .32, sy + ts * .48, ts * .22, ts * .02);
    // Status light
    ctx.fillStyle = pc;
    ctx.beginPath();
    ctx.arc(sx + ts * .5, sy + ts * .73, ts * .03, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Farm: burlap seed bag ──
  private drawFarmTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Sack body
    this.shadedRect(sx + ts * .25, sy + ts * .38, ts * .5, ts * .42, '#8B7355');
    // Tied top knot
    ctx.fillStyle = '#6B5335';
    ctx.fillRect(sx + ts * .35, sy + ts * .32, ts * .3, ts * .08);
    this.shadedCircle(sx + ts * .5, sy + ts * .33, ts * .06, '#6B5335');
    // Color tag
    ctx.fillStyle = pc;
    ctx.fillRect(sx + ts * .32, sy + ts * .52, ts * .14, ts * .1);
    // Stitch lines
    ctx.strokeStyle = '#5A4235';
    ctx.lineWidth = Math.max(1, this.scale * 0.3);
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .3, sy + ts * .68);
    ctx.lineTo(sx + ts * .7, sy + ts * .68);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Hospital: medical chart ──
  private drawHospitalTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Clipboard
    this.shadedRect(sx + ts * .22, sy + ts * .28, ts * .52, ts * .52, '#EEEEEE');
    // Clip at top
    ctx.fillStyle = '#888';
    ctx.fillRect(sx + ts * .4, sy + ts * .25, ts * .16, ts * .06);
    // Red cross
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(sx + ts * .4, sy + ts * .38, ts * .16, ts * .04);
    ctx.fillRect(sx + ts * .45, sy + ts * .34, ts * .06, ts * .12);
    // Priority bar
    ctx.fillStyle = pc;
    ctx.fillRect(sx + ts * .27, sy + ts * .7, ts * .42, ts * .04);
    // Chart lines
    ctx.fillStyle = '#CCC';
    ctx.fillRect(sx + ts * .28, sy + ts * .55, ts * .35, ts * .025);
    ctx.fillRect(sx + ts * .28, sy + ts * .62, ts * .28, ts * .025);
  }

  // ── Pirate Ship: treasure map ──
  private drawPirateTaskItem(sx: number, sy: number, item: TaskItemRenderData): void {
    const { ctx, ts } = this;
    const pc = this.getPriorityColor(item.priority);
    // Map parchment
    this.shadedRect(sx + ts * .18, sy + ts * .3, ts * .64, ts * .48, '#D4C5A0');
    // Burnt/ragged edges
    ctx.fillStyle = '#B8A880';
    ctx.fillRect(sx + ts * .18, sy + ts * .3, ts * .04, ts * .48);
    ctx.fillRect(sx + ts * .78, sy + ts * .3, ts * .04, ts * .48);
    // Map route
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = Math.max(1, this.scale * 0.4);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .28, sy + ts * .42);
    ctx.lineTo(sx + ts * .48, sy + ts * .55);
    ctx.lineTo(sx + ts * .68, sy + ts * .45);
    ctx.stroke();
    // X marks the spot (priority color)
    ctx.strokeStyle = pc;
    ctx.lineWidth = Math.max(1, this.scale * 0.5);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .55, sy + ts * .58);
    ctx.lineTo(sx + ts * .65, sy + ts * .68);
    ctx.moveTo(sx + ts * .65, sy + ts * .58);
    ctx.lineTo(sx + ts * .55, sy + ts * .68);
    ctx.stroke();
  }

  /* ── Completion accumulator (grows with completed tasks) ── */

  private drawCompletionAccumulator(bag: CompletionBagRenderData): void {
    const { ctx, ts } = this;
    const level = Math.min(5, Math.floor(bag.count / 3)); // 0-5 growth stages

    // Base position: true center of Done room — object grows upward
    const baseX = (bag.roomX + bag.roomW / 2) * ts;
    const baseY = (bag.gridY + 1) * ts; // bottom edge of grid cell
    const p = ts / 16; // pixel unit (1/16 of tile for blocky pixel look)
    // Max height in pixels — clamped to room height minus 1 tile margin
    const maxH = Math.max(ts * 2, (bag.roomH - 1) * ts);

    ctx.save();

    switch (this.env) {
      case 'office':   this.drawPixelOffice(baseX, baseY, p, level, maxH); break;
      case 'town':     this.drawPixelTown(baseX, baseY, p, level, maxH); break;
      case 'rocket':   this.drawPixelRocket(baseX, baseY, p, level, maxH); break;
      case 'space_station': this.drawPixelSpaceStation(baseX, baseY, p, level, maxH); break;
      case 'farm':     this.drawPixelFarm(baseX, baseY, p, level, maxH); break;
      case 'hospital': this.drawPixelHospital(baseX, baseY, p, level, maxH); break;
      case 'pirate_ship': this.drawPixelPirate(baseX, baseY, p, level, maxH); break;
      default:         this.drawPixelOffice(baseX, baseY, p, level, maxH); break;
    }

    ctx.restore();
  }

  /** Helper: draw a pixel block (blocky rectangle) */
  private pixelBlock(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Office: Dartboard — single iconic object, grows upward, clamped to room */
  private drawPixelOffice(bx: number, by: number, p: number, level: number, maxH: number): void {
    const ctx = this.ctx;
    // Board size grows with level, clamped to room
    const boardR = Math.min((maxH - p * 8) / 2, p * (8 + level * 3));
    const boardCX = bx;
    const boardCY = by - boardR - p * 4;

    // ── Wooden back-plate (square frame) ──
    const frameW = boardR * 2 + p * 6;
    this.pixelBlock(bx - frameW / 2, boardCY - boardR - p * 3, frameW, boardR * 2 + p * 6, '#5C3D1A');
    this.pixelBlock(bx - frameW / 2 + p, boardCY - boardR - p * 2, frameW - p * 2, boardR * 2 + p * 4, '#6B4226');

    // ── Dartboard rings (outside → inside) ──
    // Outer black ring
    this.drawPixelCircle(boardCX, boardCY, boardR, '#1A1A1A');
    // Green ring
    this.drawPixelCircle(boardCX, boardCY, boardR - p * 2, '#1B7A2B');
    // Red ring
    this.drawPixelCircle(boardCX, boardCY, boardR - p * 4, '#CC2222');
    // White/cream ring
    if (boardR > p * 8) {
      this.drawPixelCircle(boardCX, boardCY, boardR - p * 6, '#E8DFC8');
    }
    // Green inner ring
    if (boardR > p * 10) {
      this.drawPixelCircle(boardCX, boardCY, boardR - p * 8, '#1B7A2B');
    }
    // Red inner ring
    if (boardR > p * 12) {
      this.drawPixelCircle(boardCX, boardCY, boardR - p * 10, '#CC2222');
    }
    // Bullseye (green outer, red center)
    this.drawPixelCircle(boardCX, boardCY, Math.max(p * 3, boardR * 0.18), '#1B7A2B');
    this.drawPixelCircle(boardCX, boardCY, Math.max(p * 2, boardR * 0.1), '#CC2222');

    // ── Wire divider cross-hairs ──
    ctx.strokeStyle = '#AAA';
    ctx.lineWidth = Math.max(1, p * 0.5);
    ctx.beginPath();
    ctx.moveTo(boardCX, boardCY - boardR); ctx.lineTo(boardCX, boardCY + boardR);
    ctx.moveTo(boardCX - boardR, boardCY); ctx.lineTo(boardCX + boardR, boardCY);
    ctx.stroke();

    // ── Darts stuck in board — more darts with level ──
    const darts: Array<[number, number, string, number]> = [];
    // Always one dart near bullseye
    darts.push([boardCX + p, boardCY - p, '#3498DB', -0.3]);
    if (level >= 1) darts.push([boardCX + boardR * 0.5, boardCY - boardR * 0.3, '#E74C3C', 0.4]);
    if (level >= 2) darts.push([boardCX - boardR * 0.4, boardCY + boardR * 0.2, '#27AE60', -0.5]);
    if (level >= 3) darts.push([boardCX + boardR * 0.2, boardCY + boardR * 0.5, '#F39C12', 0.2]);
    if (level >= 4) darts.push([boardCX - boardR * 0.6, boardCY - boardR * 0.4, '#9B59B6', -0.6]);
    if (level >= 5) darts.push([boardCX - p * 2, boardCY + p, '#FF1493', 0.1]);

    for (const [dx, dy, color, angle] of darts) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(angle);
      // Dart tip (silver)
      this.pixelBlock(-p / 2, -p * 3, p, p * 3, '#CCC');
      // Dart body
      this.pixelBlock(-p, -p * 6, p * 2, p * 3, color);
      // Dart flight (tail)
      this.pixelBlock(-p * 2, -p * 8, p * 4, p * 2, color);
      this.pixelBlock(-p, -p * 9, p * 2, p, color);
      ctx.restore();
    }

    // ── Stand / mount ──
    this.pixelBlock(bx - p * 2, by - p * 4, p * 4, p * 4, '#5C3D1A');
    this.pixelBlock(bx - p * 4, by - p, p * 8, p, '#444');
  }

  /** Helper: draw a filled pixel circle at (cx,cy) with given radius */
  private drawPixelCircle(cx: number, cy: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
    ctx.fill();
  }

  /** Town: Pixel-art ceremonial key of the city (horizontal) */
  private drawPixelTown(bx: number, by: number, p: number, level: number, maxH: number): void {
    // Total width of key — grows with level
    const totalW = Math.min(maxH - p * 2, p * (28 + level * 12));
    // Center vertically on the pedestal
    const cy = by - p * 8;

    // ── Key shaft (horizontal, centered) ──
    const shaftH = p * 4;
    const shaftLeft = bx - totalW / 2 + p * 8; // start after ring
    const shaftW = totalW - p * 10; // length of shaft
    this.pixelBlock(shaftLeft, cy - shaftH / 2, shaftW, shaftH, '#DAA520');
    this.pixelBlock(shaftLeft, cy - shaftH / 2, shaftW, p, '#F0D060'); // highlight top
    this.pixelBlock(shaftLeft, cy + shaftH / 2 - p, shaftW, p, '#B8860B'); // shadow bottom

    // ── Key ring (bow) on left ──
    const ringW = p * 8;
    const ringH = p * 10;
    const ringX = shaftLeft - ringW + p * 2;
    const ringY = cy - ringH / 2;
    // Outer ring
    this.pixelBlock(ringX + p * 2, ringY, ringW - p * 4, ringH, '#DAA520');
    this.pixelBlock(ringX + p, ringY + p, p, ringH - p * 2, '#DAA520');
    this.pixelBlock(ringX + ringW - p * 2, ringY + p, p, ringH - p * 2, '#DAA520');
    this.pixelBlock(ringX, ringY + p * 2, p, ringH - p * 4, '#F0D060');
    this.pixelBlock(ringX + ringW - p, ringY + p * 2, p, ringH - p * 4, '#B8860B');
    // Inner hole
    this.pixelBlock(ringX + p * 2, cy - p * 2, p * 4, p * 4, '#2C1810');
    this.pixelBlock(ringX + p * 3, cy - p, p * 2, p * 2, '#1A0F08');

    // ── Key teeth (wards) — grow with level, pointing down from shaft end ──
    const teethCount = Math.min(4, 1 + level);
    const teethStartX = shaftLeft + shaftW - p * 4;
    for (let i = 0; i < teethCount; i++) {
      const tx = teethStartX - i * p * 5;
      // Tooth pointing down
      this.pixelBlock(tx, cy + shaftH / 2, p * 2, p * 4, '#DAA520');
      this.pixelBlock(tx - p * 2, cy + shaftH / 2 + p * 2, p * 2, p * 2, '#DAA520');
      // Highlight
      this.pixelBlock(tx, cy + shaftH / 2, p, p * 4, '#F0D060');
    }

    // ── Decorative notches on shaft ──
    if (level >= 2) {
      const nx = shaftLeft + shaftW * 0.5;
      this.pixelBlock(nx, cy - shaftH / 2 - p * 2, p, p * 2, '#DAA520');
      this.pixelBlock(nx, cy + shaftH / 2, p, p * 2, '#DAA520');
    }

    // ── Gem in key ring ──
    if (level >= 3) {
      this.pixelBlock(ringX + p * 2, cy - p, p * 2, p * 2, '#E74C3C');
      this.pixelBlock(ringX + p * 2, cy, p, p, '#FF6B6B');
    }

    // ── Ribbons hanging from ring ──
    if (level >= 4) {
      this.pixelBlock(ringX + p * 3, ringY + ringH - p, p * 6, p * 2, '#3498DB');
      this.pixelBlock(ringX + p * 3, ringY - p, p * 6, p * 2, '#E74C3C');
    }
  }

  /** Rocket: Tall sectioned rocket matching reference — red cone, white body, blue windows, red stripes, big fins, growing flames */
  private drawPixelRocket(bx: number, by: number, p: number, level: number, maxH: number): void {
    const ctx = this.ctx;
    // Rocket height: fills more of the room as level increases, clamped to maxH
    const rocketH = Math.min(maxH - p * 4, p * (28 + level * 18));
    const bodyW = p * 12;
    const rx = bx - bodyW / 2;

    // ── Launch pad ──
    this.pixelBlock(bx - p * 12, by - p * 3, p * 24, p * 3, '#555');
    this.pixelBlock(bx - p * 11, by - p * 2, p * 22, p, '#666');

    // ── Fuel tanks at base (green) ──
    if (level >= 2) {
      this.pixelBlock(bx - p * 8, by - p * 8, p * 3, p * 5, '#27AE60');
      this.pixelBlock(bx - p * 8, by - p * 9, p * 3, p, '#2ECC71');
      this.pixelBlock(bx - p * 7, by - p * 6, p, p * 2, '#FFF');
      this.pixelBlock(bx + p * 5, by - p * 8, p * 3, p * 5, '#27AE60');
      this.pixelBlock(bx + p * 5, by - p * 9, p * 3, p, '#2ECC71');
      this.pixelBlock(bx + p * 6, by - p * 6, p, p * 2, '#FFF');
    }

    // ── Support struts ──
    this.pixelBlock(bx - p * 9, by - p * 5, p * 2, p * 2, '#777');
    this.pixelBlock(bx + p * 7, by - p * 5, p * 2, p * 2, '#777');

    // ── Rocket body — white, grows upward ──
    const bodyBottom = by - p * 5;
    const bodyTop = bodyBottom - rocketH;
    this.pixelBlock(rx, bodyTop, bodyW, rocketH, '#E8E8E8');
    // Left highlight
    this.pixelBlock(rx, bodyTop, p, rocketH, '#F4F4F4');
    // Right shadow
    this.pixelBlock(rx + bodyW - p, bodyTop, p, rocketH, '#CCCCCC');

    // ── Sections with red stripes and blue windows ──
    const sectionH = Math.max(p * 8, rocketH / Math.max(2, 1 + level));
    const numSections = Math.max(1, Math.floor(rocketH / sectionH));
    for (let i = 0; i < numSections; i++) {
      const sy = bodyBottom - (i + 1) * sectionH;
      if (sy < bodyTop) break;
      // Red horizontal stripe
      this.pixelBlock(rx, sy, bodyW, p * 2, '#E74C3C');
      // Blue window porthole (wider)
      const winY = sy + sectionH * 0.35;
      if (winY + p * 5 < bodyBottom && winY > bodyTop + p * 2) {
        this.pixelBlock(bx - p * 3, winY, p * 6, p * 5, '#2C3E50');
        this.pixelBlock(bx - p * 2, winY + p, p * 4, p * 3, '#5DADE2');
        // Window highlight
        this.pixelBlock(bx - p * 2, winY + p, p * 2, p, '#85C1E9');
      }
    }

    // ── Nose cone (red, stepped triangle) ──
    const coneBase = bodyTop;
    const coneH = Math.min(p * 8 + level * p * 2, rocketH * 0.2);
    const steps = Math.max(3, Math.floor(coneH / p));
    for (let r = 0; r < steps; r++) {
      const rowW = bodyW - r * p * 2 * (bodyW / (steps * p * 2));
      const rW = Math.max(p, Math.round(rowW));
      this.pixelBlock(bx - rW / 2, coneBase - (r + 1) * p, rW, p, '#E74C3C');
    }
    // Tip
    this.pixelBlock(bx - p, coneBase - steps * p - p, p * 2, p, '#C0392B');

    // ── Fins (red, always present, scaled for wider body) ──
    const finH = p * (8 + level * 3);
    const finW = p * (5 + level);
    // Left fin
    this.pixelBlock(rx - finW, bodyBottom - finH, finW, finH, '#C0392B');
    this.pixelBlock(rx - finW - p, bodyBottom - finH * 0.6, p, finH * 0.6, '#C0392B');
    // Right fin
    this.pixelBlock(rx + bodyW, bodyBottom - finH, finW, finH, '#C0392B');
    this.pixelBlock(rx + bodyW + finW, bodyBottom - finH * 0.6, p, finH * 0.6, '#C0392B');

    // ── Engine flames — grow with level (wider to match body) ──
    const t = Date.now() * 0.008;
    const flameH = p * (4 + level * 8);
    const f1 = Math.sin(t) * p * 2;
    const f2 = Math.cos(t * 1.3) * p;
    // Outer flame (red-orange)
    this.pixelBlock(bx - p * 5, by - p * 3, p * 10, Math.min(flameH * 0.6, p * 20) + Math.abs(f1), '#FF4400');
    // Mid flame (orange)
    this.pixelBlock(bx - p * 3, by - p * 2, p * 6, Math.min(flameH * 0.8, p * 24) + Math.abs(f2), '#FF8800');
    // Inner flame (yellow)
    this.pixelBlock(bx - p * 2, by - p, p * 4, Math.min(flameH * 0.5, p * 16) + Math.abs(f1), '#FFCC00');
    // Core (white-hot)
    if (level >= 2) {
      this.pixelBlock(bx - p, by, p * 2, Math.min(flameH * 0.3, p * 10) + Math.abs(f2), '#FFFF88');
    }
    // Side exhaust at higher levels
    if (level >= 3) {
      this.pixelBlock(rx - finW / 2, by - p * 2, p * 2, flameH * 0.2 + Math.abs(f2), '#FF6600');
      this.pixelBlock(rx + bodyW + finW / 2 - p, by - p * 2, p * 2, flameH * 0.2 + Math.abs(f1), '#FF6600');
    }
    // Smoke at max
    if (level >= 4) {
      const sa = 0.1 + Math.sin(t * 0.5) * 0.05;
      ctx.fillStyle = `rgba(180,180,180,${sa})`;
      ctx.fillRect(bx - p * 6, by + p * 3, p * 4, p * 4);
      ctx.fillRect(bx + p * 3, by + p * 4, p * 3, p * 3);
    }
  }

  /** Space station: module cluster stacking upward */
  private drawPixelSpaceStation(bx: number, by: number, p: number, level: number, maxH: number): void {
    const ctx = this.ctx;
    const s = Math.min(1 + level * 0.2, maxH / (p * 30));
    const sp = p * Math.max(1, s);
    const mw = sp * 10;
    const mh = sp * 7;
    this.pixelBlock(bx - mw / 2, by - mh, mw, mh, '#4A5A6A');
    this.pixelBlock(bx - mw / 2 + sp, by - mh + sp, mw - sp * 2, mh - sp * 2, '#5A6A7A');
    this.pixelBlock(bx - sp * 2, by - mh + sp * 2, sp * 4, sp * 3, '#2C3E50');
    this.pixelBlock(bx - sp, by - mh + sp * 3, sp * 2, sp, '#3498DB');
    this.pixelBlock(bx - sp, by - sp * 2, sp * 2, sp, '#27AE60');
    if (level >= 1) {
      this.pixelBlock(bx - mw / 2 - sp * 5, by - sp * 6, sp * 5, sp * 5, '#3A4A5A');
      this.pixelBlock(bx - mw / 2 - sp, by - sp * 5, sp, sp * 3, '#666');
    }
    if (level >= 2) {
      this.pixelBlock(bx + mw / 2, by - sp * 6, sp * 5, sp * 5, '#3A4A5A');
      this.pixelBlock(bx + mw / 2 - sp, by - sp * 5, sp, sp * 3, '#666');
    }
    if (level >= 3) {
      const labY = Math.max(by - maxH + sp * 2, by - mh - sp * 6);
      this.pixelBlock(bx - sp * 4, labY, sp * 8, sp * 6, '#5A6A7A');
      this.pixelBlock(bx - sp, by - mh - sp, sp * 2, sp, '#666');
      this.pixelBlock(bx - mw / 2 - sp * 8, labY + sp, sp * 6, sp * 3, '#2C3E80');
      this.pixelBlock(bx + mw / 2 + sp * 2, labY + sp, sp * 6, sp * 3, '#2C3E80');
    }
    if (level >= 4) {
      const tY = Math.max(by - maxH + sp, by - mh - sp * 14);
      this.pixelBlock(bx - sp, tY, sp * 2, sp * 8, '#888');
      this.pixelBlock(bx - sp * 4, tY - sp * 2, sp * 8, sp * 2, '#AAA');
      const blink = Math.sin(Date.now() * 0.004) > 0;
      this.pixelBlock(bx, tY - sp * 3, sp, sp, blink ? '#E74C3C' : '#660000');
    }
    if (level >= 5) {
      this.pixelBlock(bx - sp * 6, by, sp * 12, sp * 3, '#4A5A6A');
    }
  }

  /** Farm: Pixel-art cow — well-defined blocky cow that grows bigger */
  private drawPixelFarm(bx: number, by: number, p: number, level: number, maxH: number): void {
    // Scale cow, clamped so it doesn't exceed room
    const maxScale = maxH / (p * 22); // cow is ~22p tall at 1x
    const s = Math.min(1 + level * 0.35, maxScale);
    const sp = p * Math.max(1, s);

    const bodyW = sp * 10;
    const bodyH = sp * 6;
    const legH = sp * 4;
    const totalH = bodyH + legH + sp * 4; // body + legs + head above

    // Ground
    this.pixelBlock(bx - bodyW / 2 - sp * 2, by - sp, bodyW + sp * 6, sp, '#4A8C3F');

    // ── Legs (under body) ──
    const legY = by - sp - legH;
    const bodyY = legY - bodyH;
    const bodyX = bx - bodyW / 2;
    // Front-left
    this.pixelBlock(bodyX + sp, legY, sp * 2, legH, '#F0EDE0');
    this.pixelBlock(bodyX + sp, legY + legH - sp, sp * 2, sp, '#3A2A1A');
    // Front-right
    this.pixelBlock(bodyX + sp * 3, legY, sp * 2, legH, '#E8E5D8');
    this.pixelBlock(bodyX + sp * 3, legY + legH - sp, sp * 2, sp, '#3A2A1A');
    // Back-left
    this.pixelBlock(bodyX + bodyW - sp * 5, legY, sp * 2, legH, '#F0EDE0');
    this.pixelBlock(bodyX + bodyW - sp * 5, legY + legH - sp, sp * 2, sp, '#3A2A1A');
    // Back-right
    this.pixelBlock(bodyX + bodyW - sp * 3, legY, sp * 2, legH, '#E8E5D8');
    this.pixelBlock(bodyX + bodyW - sp * 3, legY + legH - sp, sp * 2, sp, '#3A2A1A');

    // ── Body ──
    this.pixelBlock(bodyX, bodyY, bodyW, bodyH, '#F5F2E8');
    // Outline edges
    this.pixelBlock(bodyX, bodyY, bodyW, sp, '#E0DDD2');
    this.pixelBlock(bodyX, bodyY + bodyH - sp, bodyW, sp, '#D8D5C8');
    // Black spots
    this.pixelBlock(bodyX + sp * 2, bodyY + sp * 2, sp * 3, sp * 2, '#2A2A2A');
    this.pixelBlock(bodyX + sp * 6, bodyY + sp, sp * 2, sp * 3, '#2A2A2A');
    if (level >= 2) this.pixelBlock(bodyX + sp * 4, bodyY + sp * 4, sp * 2, sp, '#2A2A2A');
    if (level >= 4) this.pixelBlock(bodyX + sp * 8, bodyY + sp * 2, sp, sp * 2, '#2A2A2A');

    // ── Udder ──
    this.pixelBlock(bodyX + sp * 5, legY, sp * 2, sp, '#FFCCAA');

    // ── Tail ──
    this.pixelBlock(bodyX + bodyW, bodyY + sp, sp, sp * 3, '#2A2A2A');
    this.pixelBlock(bodyX + bodyW + sp, bodyY + sp * 3, sp, sp * 2, '#2A2A2A');

    // ── Head ──
    const headW = sp * 5;
    const headH = sp * 4;
    const headX = bodyX - headW + sp;
    const headY = bodyY - sp;
    this.pixelBlock(headX, headY, headW, headH, '#F5F2E8');
    // Eyes
    this.pixelBlock(headX + sp, headY + sp, sp, sp, '#111');
    this.pixelBlock(headX + sp * 3, headY + sp, sp, sp, '#111');
    // Muzzle
    this.pixelBlock(headX + sp, headY + sp * 2, sp * 3, sp * 2, '#EECCAA');
    // Nostrils
    this.pixelBlock(headX + sp + sp / 2, headY + sp * 3, sp / 2 || p, sp / 2 || p, '#6A4A2A');
    this.pixelBlock(headX + sp * 3, headY + sp * 3, sp / 2 || p, sp / 2 || p, '#6A4A2A');
    // Ears
    this.pixelBlock(headX, headY - sp, sp, sp, '#F5F2E8');
    this.pixelBlock(headX + sp * 4, headY - sp, sp, sp, '#F5F2E8');

    // ── Horns (grow with level) ──
    if (level >= 1) {
      this.pixelBlock(headX - sp, headY - sp, sp, sp, '#DAA520');
      this.pixelBlock(headX + headW, headY - sp, sp, sp, '#DAA520');
    }
    if (level >= 3) {
      this.pixelBlock(headX - sp, headY - sp * 2, sp, sp, '#DAA520');
      this.pixelBlock(headX + headW, headY - sp * 2, sp, sp, '#DAA520');
    }

    // ── Bell ──
    if (level >= 2) {
      this.pixelBlock(headX + sp * 2, headY + headH, sp, sp, '#888');
      this.pixelBlock(headX + sp, headY + headH + sp, sp * 3, sp * 2, '#DAA520');
    }

    // ── Crown at max ──
    if (level >= 5) {
      this.pixelBlock(headX + sp, headY - sp * 3, sp * 3, sp, '#FFD700');
      this.pixelBlock(headX, headY - sp * 4, sp, sp, '#FFD700');
      this.pixelBlock(headX + sp * 2, headY - sp * 4, sp, sp, '#FFD700');
      this.pixelBlock(headX + sp * 4, headY - sp * 4, sp, sp, '#FFD700');
      this.pixelBlock(headX + sp * 2, headY - sp * 3, sp, sp, '#E74C3C');
    }
  }

  /** Hospital: Balloons only — more balloons with level, clamped to room */
  private drawPixelHospital(bx: number, by: number, p: number, level: number, maxH: number): void {
    const ctx = this.ctx;
    const balloons: Array<[number, string, number]> = [
      [0, '#E74C3C', 0],
    ];
    if (level >= 1) { balloons.push([-5, '#3498DB', 2]); balloons.push([5, '#27AE60', 1]); }
    if (level >= 2) { balloons.push([-9, '#F39C12', 3]); balloons.push([9, '#9B59B6', 4]); }
    if (level >= 3) { balloons.push([-3, '#FF69B4', 5]); balloons.push([3, '#00CED1', 6]); }
    if (level >= 4) { balloons.push([-7, '#FFD700', 7]); balloons.push([7, '#FF6347', 8]); balloons.push([0, '#FF1493', 9]); }
    if (level >= 5) { balloons.push([-11, '#7B68EE', 10]); balloons.push([11, '#00FA9A', 8]); }

    const t = Date.now() * 0.002;
    const tieX = bx;
    const tieY = by - p * 3;
    const maxBalloonY = by - maxH + p * 4; // don't go above room

    for (let i = 0; i < balloons.length; i++) {
      const [xOff, color, hOff] = balloons[i];
      const bob = Math.sin(t + i * 0.8) * p * 2;
      const blobX = bx + xOff * p;
      const rawY = by - p * 12 - hOff * p * 3 + bob;
      const blobY = Math.max(maxBalloonY, rawY);

      // Balloon body
      const bw = p * 5;
      const bh = p * 6;
      this.pixelBlock(blobX - bw / 2, blobY - bh, bw, bh, color);
      this.pixelBlock(blobX - bw / 2 + p, blobY - bh - p, bw - p * 2, p, color);
      this.pixelBlock(blobX - p, blobY, p * 2, p, color);
      // Highlight
      this.pixelBlock(blobX - bw / 2 + p, blobY - bh + p, p * 2, p, '#FFFFFF44');

      // String
      ctx.strokeStyle = '#AAA';
      ctx.lineWidth = Math.max(1, this.scale * 0.3);
      ctx.beginPath();
      ctx.moveTo(blobX, blobY + p);
      ctx.quadraticCurveTo(blobX + (tieX - blobX) * 0.3, blobY + (tieY - blobY) * 0.5, tieX, tieY);
      ctx.stroke();
    }
  }

  /** Pirate: Treasure chest with gold and pirate flag on top */
  private drawPixelPirate(bx: number, by: number, p: number, level: number, maxH: number): void {
    const s = Math.min(1 + level * 0.25, maxH / (p * 36));
    const sp = p * Math.max(1, s);
    const w = sp * 14;
    const x0 = bx - w / 2;

    // ── Chest body ──
    const chestH = sp * 7;
    this.pixelBlock(x0, by - chestH, w, chestH, '#7A5A10');
    this.pixelBlock(x0 + sp, by - chestH + sp, w - sp * 2, chestH - sp * 2, '#9A7420');
    // Metal bands
    this.pixelBlock(x0, by - chestH + sp * 2, w, sp, '#555');
    this.pixelBlock(x0, by - sp * 2, w, sp, '#555');
    // Corner rivets
    this.pixelBlock(x0 + sp, by - chestH + sp, sp, sp, '#999');
    this.pixelBlock(x0 + w - sp * 2, by - chestH + sp, sp, sp, '#999');
    // Lock plate
    this.pixelBlock(bx - sp, by - chestH / 2 - sp, sp * 2, sp * 2, '#777');
    this.pixelBlock(bx, by - chestH / 2, sp, sp, '#444');

    // ── Chest lid (open) ──
    const lidTop = by - chestH - sp * 3;
    this.pixelBlock(x0, lidTop, w, sp * 3, '#9A7420');
    this.pixelBlock(x0 + sp, lidTop + sp, w - sp * 2, sp, '#AA8430');
    this.pixelBlock(x0, lidTop + sp * 2, w, sp, '#555');

    // ── Gold pile ──
    const goldBase = lidTop;
    if (level >= 1) {
      this.pixelBlock(x0 + sp * 2, goldBase - sp * 2, w - sp * 4, sp * 2, '#FFD700');
      this.pixelBlock(x0 + sp * 3, goldBase - sp * 3, w - sp * 6, sp, '#FFED4A');
    }
    if (level >= 2) {
      this.pixelBlock(x0 + sp * 3, goldBase - sp * 5, w - sp * 6, sp * 2, '#FFD700');
      this.pixelBlock(x0 + sp * 3, goldBase - sp * 4, sp * 2, sp * 2, '#E74C3C');
    }
    if (level >= 3) {
      this.pixelBlock(x0 + sp * 4, goldBase - sp * 7, w - sp * 8, sp * 2, '#FFD700');
      this.pixelBlock(x0 + w - sp * 5, goldBase - sp * 6, sp * 2, sp * 2, '#2ECC71');
      this.pixelBlock(x0 + sp * 5, goldBase - sp * 6, sp * 2, sp, '#3498DB');
    }
    if (level >= 4) {
      this.pixelBlock(x0 + sp * 5, goldBase - sp * 9, w - sp * 10, sp * 2, '#FFED4A');
      // Crown
      this.pixelBlock(bx - sp * 3, goldBase - sp * 10, sp * 6, sp * 2, '#FFD700');
      this.pixelBlock(bx - sp * 3, goldBase - sp * 11, sp * 2, sp, '#FFD700');
      this.pixelBlock(bx - sp, goldBase - sp * 12, sp * 2, sp * 2, '#FFD700');
      this.pixelBlock(bx + sp, goldBase - sp * 11, sp * 2, sp, '#FFD700');
      this.pixelBlock(bx, goldBase - sp * 11, sp, sp, '#E74C3C');
    }

    // ── Pirate flag on top — always present ──
    const flagPoleX = bx;
    const goldTopY = level >= 4 ? goldBase - sp * 12 : level >= 3 ? goldBase - sp * 7 : level >= 2 ? goldBase - sp * 5 : level >= 1 ? goldBase - sp * 3 : goldBase;
    const flagTopY = Math.max(by - maxH + sp * 2, goldTopY - sp * 10);
    // Pole
    this.pixelBlock(flagPoleX - sp / 2, flagTopY, sp, goldTopY - flagTopY, '#8B6914');
    // Flag
    this.pixelBlock(flagPoleX + sp, flagTopY, sp * 6, sp * 4, '#1A1A1A');
    // Skull
    this.pixelBlock(flagPoleX + sp * 2, flagTopY + sp, sp * 3, sp * 2, '#FFF');
    // Skull eyes
    this.pixelBlock(flagPoleX + sp * 2, flagTopY + sp, sp, sp, '#1A1A1A');
    this.pixelBlock(flagPoleX + sp * 4, flagTopY + sp, sp, sp, '#1A1A1A');
    // Crossbones
    this.pixelBlock(flagPoleX + sp, flagTopY + sp * 3, sp, sp, '#FFF');
    this.pixelBlock(flagPoleX + sp * 5, flagTopY + sp * 3, sp, sp, '#FFF');
    this.pixelBlock(flagPoleX + sp * 3, flagTopY + sp * 3, sp, sp, '#FFF');
  }

  /* ── Agent → task connection lines ───────────── */

  private drawAgentTaskConnections(agents: Agent[], taskViz: TaskVisualizationData): void {
    const { ctx, ts } = this;

    for (const agent of agents) {
      if (agent.resolvedActivity === 'idle' || !agent.isAtDesk || agent.isWalking) continue;

      // Find task items assigned to this agent that are being worked on
      const myItems = taskViz.items.filter(it => it.assigneeId === agent.id && it.isBeingWorked);
      if (myItems.length === 0) continue;

      // Pick closest item
      let closest = myItems[0];
      let closestDist = Infinity;
      for (const it of myItems) {
        const d = Math.abs(it.gridX - agent.gridX) + Math.abs(it.gridY - agent.gridY);
        if (d < closestDist) { closestDist = d; closest = it; }
      }

      const ax = agent.x * ts + ts / 2;
      const ay = agent.y * ts + ts * 0.5;
      const bx = closest.gridX * ts + ts / 2;
      const by = closest.gridY * ts + ts / 2;

      // Subtle dotted line in priority color
      ctx.save();
      ctx.setLineDash([2, 3]);
      const pc = this.getPriorityColor(closest.priority);
      ctx.strokeStyle = this.hexToRgba(pc, 0.3);
      ctx.lineWidth = Math.max(1, this.scale * 0.3);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  /* ── Flying task transition animation ──────── */

  private drawFlyingTasks(taskViz: TaskVisualizationData): void {
    if (!taskViz.flyingTasks || taskViz.flyingTasks.length === 0) return;
    const { ctx, ts } = this;

    for (const ft of taskViz.flyingTasks) {
      const p = ft.progress;
      // Quadratic bezier arc: from → apex → to
      const fromX = ft.fromGX * ts + ts / 2;
      const fromY = ft.fromGY * ts + ts / 2;
      const toX = ft.toGX * ts + ts / 2;
      const toY = ft.toGY * ts + ts / 2;
      const midX = (fromX + toX) / 2;
      const midY = Math.min(fromY, toY) - ts * 4; // arc apex above both rooms

      // Quadratic bezier interpolation
      const t2 = p;
      const inv = 1 - t2;
      const cx2 = inv * inv * fromX + 2 * inv * t2 * midX + t2 * t2 * toX;
      const cy2 = inv * inv * fromY + 2 * inv * t2 * midY + t2 * t2 * toY;

      // Trail: 3 fading afterimages
      for (let trail = 3; trail >= 1; trail--) {
        const tp = Math.max(0, p - trail * 0.04);
        const tinv = 1 - tp;
        const tx = tinv * tinv * fromX + 2 * tinv * tp * midX + tp * tp * toX;
        const ty = tinv * tinv * fromY + 2 * tinv * tp * midY + tp * tp * toY;
        ctx.save();
        ctx.globalAlpha = 0.15 - trail * 0.04;
        ctx.translate(tx, ty);
        this.drawFlyingItemBody(ft);
        ctx.restore();
      }

      // Main flying item
      ctx.save();
      ctx.translate(cx2, cy2);

      // Draw wings (flapping)
      const wingFlap = Math.sin(p * Math.PI * 14) * 0.3;
      const wingW = ts * 0.35;
      const wingH = ts * 0.2;
      const pc = this.getPriorityColor(ft.priority);

      ctx.fillStyle = this.hexToRgba(pc, 0.6);
      // Left wing
      ctx.save();
      ctx.translate(-ts * 0.25, -ts * 0.05);
      ctx.rotate(-0.4 + wingFlap);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-wingW, -wingH * 0.5);
      ctx.lineTo(-wingW * 0.7, wingH * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Right wing
      ctx.save();
      ctx.translate(ts * 0.25, -ts * 0.05);
      ctx.rotate(0.4 - wingFlap);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wingW, -wingH * 0.5);
      ctx.lineTo(wingW * 0.7, wingH * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Draw the task item body at center
      this.drawFlyingItemBody(ft);
      ctx.restore();
    }
  }

  /** Draw a small version of the task item for flying animation (already translated) */
  private drawFlyingItemBody(ft: FlyingTask): void {
    const { ctx, ts } = this;
    const s = ts * 0.4; // smaller than floor items
    const pc = this.getPriorityColor(ft.priority);

    // Simple themed item (compact version)
    switch (this.env) {
      case 'town':
        // Mini scroll
        this.shadedRect(-s / 2, -s / 2, s, s * 0.7, '#E8D5B0');
        this.shadedCircle(-s / 2 + s * 0.1, -s / 2 + s * 0.1, s * 0.08, '#D4C090');
        this.shadedCircle(s / 2 - s * 0.1, -s / 2 + s * 0.1, s * 0.08, '#D4C090');
        this.shadedCircle(0, s * 0.1, s * 0.1, pc);
        break;
      case 'rocket':
        // Mini circuit
        this.shadedRect(-s / 2, -s / 2, s, s * 0.65, '#1A3A2A');
        ctx.fillStyle = pc;
        ctx.beginPath();
        ctx.arc(s * 0.2, -s * 0.15, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'pirate_ship':
        // Mini map
        this.shadedRect(-s / 2, -s / 2, s, s * 0.7, '#D4C5A0');
        ctx.strokeStyle = pc;
        ctx.lineWidth = Math.max(1, this.scale * 0.3);
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, 0);
        ctx.lineTo(s * 0.15, s * 0.1);
        ctx.stroke();
        break;
      default:
        // Mini paper/generic
        this.shadedRect(-s / 2, -s / 2, s, s * 0.7, '#F5F5F0');
        ctx.fillStyle = pc;
        ctx.fillRect(-s / 2, -s / 2 - s * 0.05, s * 0.3, s * 0.1);
        break;
    }
  }
}
