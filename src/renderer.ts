import type { Agent } from './agent';
import type { AgentStatus, CharacterPalette, EnvironmentId, ThemeId } from './types';
import type { World } from './world';
import { THEMES, ENV_COLORS, type ThemeColors } from './themes';
import { renderSprite } from './sprites';
import { ParticleSystem } from './particles';

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#95A5A6', typing: '#3498DB', reading: '#9B59B6',
  thinking: '#F39C12', waiting: '#E67E22', success: '#27AE60', error: '#E74C3C',
};

const SUIT_COLORS  = ['#2C3E50', '#1A1A2E', '#34495E', '#283747', '#212F3D'];
const SCRUB_COLORS = ['#5B9BD5', '#27AE60', '#E891B2', '#48C9B0', '#5DADE2'];
const FLANNEL_COLORS = ['#B5422C', '#2E6B4E', '#8B6914', '#4A6FA5', '#CC7722', '#884422'];
const PIRATE_COLORS = ['#CC3333', '#1A1A2E', '#5A3A1A', '#2C6B4E', '#8B6914', '#333366'];

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

  render(agents: Agent[]): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.env === 'space_station' || this.env === 'rocket' || this.env === 'pirate_ship') this.drawStars();

    const ww = this.world.gridWidth * this.ts;
    const wh = this.world.gridHeight * this.ts;
    const ox = Math.floor((canvas.width - ww) / 2);
    const oy = Math.floor((canvas.height - wh) / 2);

    ctx.save();
    ctx.translate(ox, oy);
    this.drawFloor();
    this.drawDecor();
    this.drawWorkstations();
    this.drawGlowEffects();
    this.particles.render(ctx);

    const vis = agents.filter(a => a.visible).sort((a, b) => a.y - b.y);
    for (const a of vis) this.drawAgent(a);
    for (const a of vis) { this.drawBubble(a); this.drawNameLabel(a); this.drawStatusIcon(a); }
    this.drawRoomLabels();
    ctx.restore();
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
  }

  private drawFloorDetail(sx: number, sy: number, _gx: number, gy: number, noise: number, baseColor: string): void {
    const { ctx, ts } = this;
    switch (this.env) {
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
        // Occasional floor reflection
        if (noise % 11 === 0) {
          ctx.fillStyle = this.lighten(baseColor, 0.08);
          ctx.fillRect(sx + ts * .2, sy + ts * .2, ts * .15, ts * .08);
        }
        break;
      case 'space_station':
        // Panel seam lines every 2 tiles
        if (gy % 2 === 0) {
          ctx.fillStyle = this.lighten(baseColor, 0.04);
          ctx.fillRect(sx + ts * .48, sy, ts * .04, ts);
        }
        break;
    }
  }

  private drawWallShadows(): void {
    const { ctx, ts } = this;
    const w = this.world;
    const shadowSize = Math.max(2, ts * 0.12);

    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const tileType = w.tiles[y][x].type;
        if (tileType === 'wall' || tileType === 'ship_hull' || tileType === 'empty') continue;
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
    }
  }

  /* ── decorative items ───────────────────────── */

  private drawDecor(): void {
    const w = this.world;
    for (let y = 0; y < w.gridHeight; y++) {
      for (let x = 0; x < w.gridWidth; x++) {
        const t = w.tiles[y][x].type;
        if (t === 'floor' || t === 'wall' || t === 'desk' || t === 'chair' || t === 'rug' || t === 'empty') continue;
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

  /* ── workstations (env-specific) ────────────── */

  private drawWorkstations(): void {
    this.drawZones();
  }

  /** Desk-type zones that have a desk+chair tile pair */
  private static DESK_ZONES = new Set<string>([
    'desk', 'tool_bench', 'control_panel', 'bridge_console', 'barn_workshop',
    'nav_table', 'science_lab', 'lab_bench', 'reception', 'patient_station',
  ]);

  /** Map zone types to visual variants */
  private getZoneVariant(type: string): string {
    switch (type) {
      case 'desk': case 'reception': return 'office';
      case 'patient_station': case 'lab_bench': return 'medical';
      case 'control_panel': case 'bridge_console': case 'science_lab': case 'engineering': return 'console';
      case 'nav_table': return 'pirate';
      case 'tool_bench': case 'barn_workshop': return 'workbench';
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
    for (const room of this.world.rooms) {
      const cx = (room.bounds.x + room.bounds.w / 2) * ts;
      const ry = room.bounds.y * ts - ts * 0.1;
      const fontSize = Math.max(7, ts * 0.45);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText(room.name, cx, ry);
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
    const { frame, flip } = agent.getCurrentSprite();
    const cw = frame.width * scale, ch = frame.height * scale;
    const cx = agent.x * ts + (ts - cw) / 2;
    // Breathing bob offset
    const breathOffset = (agent.isAtDesk && !agent.isWalking)
      ? Math.sin(agent.breathPhase) * scale * 0.4
      : 0;
    const cy = agent.y * ts + (ts - ch) / 2 - scale * 2 + breathOffset;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(agent.x * ts + ts / 2, agent.y * ts + ts - scale * 2, cw * .3, scale * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const envPalette = this.getEnvPalette(agent);
    renderSprite(ctx, frame, cx, cy, scale, envPalette, flip);

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
    }
  }

  /* ── speech bubble ──────────────────────────── */

  private drawBubble(agent: Agent): void {
    if (!agent.message) return;
    const { ctx, ts, scale } = this;
    const bx = agent.x * ts + ts / 2;
    const by = agent.y * ts - ts * .4;
    ctx.font = `${Math.max(10, scale * 3)}px monospace`;
    const tw = ctx.measureText(agent.message).width;
    const pad = 6, bw = tw + pad * 2, bh = scale * 4 + pad * 2;
    const left = bx - bw / 2, top = by - bh, r = 4;
    ctx.fillStyle = '#FFF'; ctx.strokeStyle = '#2C3E50'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + bw - r, top); ctx.quadraticCurveTo(left + bw, top, left + bw, top + r);
    ctx.lineTo(left + bw, top + bh - r); ctx.quadraticCurveTo(left + bw, top + bh, left + bw - r, top + bh);
    ctx.lineTo(bx + 4, top + bh); ctx.lineTo(bx, top + bh + 5); ctx.lineTo(bx - 4, top + bh);
    ctx.lineTo(left + r, top + bh); ctx.quadraticCurveTo(left, top + bh, left, top + bh - r);
    ctx.lineTo(left, top + r); ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2C3E50'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(agent.message, bx, top + bh / 2);
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
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.roundRect(lx - totalW / 2 - 3, ly - bgH / 2, totalW + 6, bgH, 3);
    ctx.fillStyle = STATUS_COLORS[agent.userStatus];
    ctx.beginPath(); ctx.arc(lx - totalW / 2 + dotR, ly, dotR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(agent.name, lx + dotR + 2, ly);
  }

  /* ── status icons ───────────────────────────── */

  private drawStatusIcon(agent: Agent): void {
    if (agent.message) return;
    const { ctx, ts, scale } = this;
    const ix = agent.x * ts + ts / 2;
    const iy = agent.y * ts - ts * .25;
    const sz = scale * 2;
    switch (agent.userStatus) {
      case 'thinking': {
        const a = Math.floor(agent.animFrame / 2) % 3;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i === a ? '#F39C12' : '#BDC3C7';
          ctx.beginPath(); ctx.arc(ix + (i - 1) * (sz + 2), iy - (i === a ? sz * .3 : 0), sz * .35, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'success':
        ctx.strokeStyle = '#27AE60'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(ix - sz * .4, iy); ctx.lineTo(ix - sz * .1, iy + sz * .3); ctx.lineTo(ix + sz * .4, iy - sz * .3);
        ctx.stroke(); break;
      case 'error':
        ctx.strokeStyle = '#E74C3C'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(ix - sz * .3, iy - sz * .3); ctx.lineTo(ix + sz * .3, iy + sz * .3);
        ctx.moveTo(ix + sz * .3, iy - sz * .3); ctx.lineTo(ix - sz * .3, iy + sz * .3);
        ctx.stroke(); break;
      case 'waiting': {
        const p = Math.sin(agent.animTimer * 4) * .3 + .7;
        ctx.fillStyle = `rgba(230,126,34,${p})`;
        ctx.beginPath(); ctx.arc(ix, iy, sz * .45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.font = `bold ${sz}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', ix, iy);
        break;
      }
    }
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
}
