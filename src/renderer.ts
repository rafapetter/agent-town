import type { Agent } from './agent';
import type { AgentStatus, CharacterPalette, EnvironmentId, ThemeId } from './types';
import type { World } from './world';
import { THEMES, ENV_COLORS, type ThemeColors } from './themes';
import { renderSprite } from './sprites';

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#95A5A6', typing: '#3498DB', reading: '#9B59B6',
  thinking: '#F39C12', waiting: '#E67E22', success: '#27AE60', error: '#E74C3C',
};

const SUIT_COLORS  = ['#2C3E50', '#1A1A2E', '#34495E', '#283747', '#212F3D'];
const SCRUB_COLORS = ['#5B9BD5', '#27AE60', '#E891B2', '#48C9B0', '#5DADE2'];
const FLANNEL_COLORS = ['#B5422C', '#2E6B4E', '#8B6914', '#4A6FA5', '#CC7722', '#884422'];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private scale: number;
  private tileSize: number;
  private colors: ThemeColors;
  private env: EnvironmentId = 'office';
  private theme: ThemeId = 'hybrid';
  private starCache: { x: number; y: number; r: number; b: number }[] = [];

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
  }

  private get ts(): number { return this.tileSize * this.scale; }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
  }

  setScale(s: number): void { this.scale = s; }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
    if (this.env === 'office') this.colors = THEMES[theme];
  }

  setEnvironment(env: EnvironmentId, theme: ThemeId): void {
    this.env = env;
    this.theme = theme;
    this.colors = env === 'office' ? THEMES[theme] : ENV_COLORS[env];
    this.generateStars();
  }

  render(agents: Agent[]): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.env === 'space_station' || this.env === 'rocket') this.drawStars();

    const ww = this.world.gridWidth * this.ts;
    const wh = this.world.gridHeight * this.ts;
    const ox = Math.floor((canvas.width - ww) / 2);
    const oy = Math.floor((canvas.height - wh) / 2);

    ctx.save();
    ctx.translate(ox, oy);
    this.drawFloor();
    this.drawDecor();
    this.drawWorkstations();

    const vis = agents.filter(a => a.visible).sort((a, b) => a.y - b.y);
    for (const a of vis) this.drawAgent(a);
    for (const a of vis) { this.drawBubble(a); this.drawNameLabel(a); this.drawStatusIcon(a); }
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
    if (this.env !== 'space_station' && this.env !== 'rocket') return;
    for (let i = 0; i < 120; i++) {
      this.starCache.push({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.5 + 0.5,
        b: Math.random() * 0.5 + 0.5,
      });
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
          ctx.fillStyle = c.rug;
          ctx.fillRect(sx, sy, ts, ts);
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? c.floor : c.floorAlt;
          ctx.fillRect(sx, sy, ts, ts);
          ctx.strokeStyle = c.floorGrid;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
        }
      }
    }
  }

  private drawWallTile(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const c = this.colors;
    ctx.fillStyle = c.wall;
    ctx.fillRect(sx, sy, ts, ts);
    ctx.fillStyle = c.wallTop;
    ctx.fillRect(sx, sy, ts, ts * 0.3);
    ctx.strokeStyle = c.wallBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
    if (this.env === 'farm') {
      ctx.fillStyle = c.wallBorder;
      ctx.fillRect(sx, sy + ts * 0.45, ts, ts * 0.1);
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
        }
      }
    }
  }

  /* ── office items ───────────────────────────── */

  private drawPlant(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.plantPot;
    ctx.fillRect(sx + ts * .3, sy + ts * .6, ts * .4, ts * .35);
    ctx.fillStyle = c.plantLeaf;
    this.circle(sx + ts * .5, sy + ts * .4, ts * .22);
    ctx.fillStyle = c.plantLeafAlt;
    this.circle(sx + ts * .35, sy + ts * .52, ts * .16);
    this.circle(sx + ts * .65, sy + ts * .52, ts * .16);
  }

  private drawCoffee(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.coffee;
    ctx.fillRect(sx + ts * .2, sy + ts * .25, ts * .6, ts * .6);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(sx + ts * .35, sy + ts * .08, ts * .3, ts * .2);
    ctx.fillStyle = '#795548';
    ctx.fillRect(sx + ts * .4, sy + ts * .12, ts * .2, ts * .1);
  }

  private drawWaterCooler(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.waterCooler;
    ctx.fillRect(sx + ts * .25, sy + ts * .15, ts * .5, ts * .7);
    ctx.fillStyle = c.waterCoolerWater;
    ctx.fillRect(sx + ts * .3, sy + ts * .2, ts * .4, ts * .25);
    ctx.fillStyle = '#CCC';
    ctx.fillRect(sx + ts * .38, sy + ts * .7, ts * .24, ts * .1);
  }

  private drawBookshelf(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.bookshelf;
    ctx.fillRect(sx + 1, sy + ts * .1, ts - 2, ts * .85);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = c.books[i % c.books.length];
      ctx.fillRect(sx + ts * .15 + i * ts * .18, sy + ts * .15, ts * .12, ts * .3);
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = c.books[(i + 2) % c.books.length];
      ctx.fillRect(sx + ts * .2 + i * ts * .2, sy + ts * .55, ts * .14, ts * .25);
    }
  }

  private drawCouch(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.couch;
    ctx.fillRect(sx + ts * .05, sy + ts * .2, ts * .9, ts * .5);
    ctx.fillStyle = this.darken(c.couch, .15);
    ctx.fillRect(sx + ts * .05, sy + ts * .65, ts * .9, ts * .18);
    ctx.fillStyle = this.darken(c.couch, .08);
    ctx.fillRect(sx + ts * .47, sy + ts * .25, ts * .06, ts * .4);
  }

  private drawWhiteboard(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.whiteboard;
    ctx.fillRect(sx + ts * .1, sy + ts * .15, ts * .8, ts * .6);
    ctx.strokeStyle = '#AAA'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + ts * .1 + .5, sy + ts * .15 + .5, ts * .8 - 1, ts * .6 - 1);
    ctx.strokeStyle = '#3498DB'; ctx.beginPath();
    ctx.moveTo(sx + ts * .2, sy + ts * .35); ctx.lineTo(sx + ts * .7, sy + ts * .35);
    ctx.moveTo(sx + ts * .2, sy + ts * .5); ctx.lineTo(sx + ts * .55, sy + ts * .5);
    ctx.stroke();
  }

  private drawMeetingTable(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.meetingTable;
    ctx.fillRect(sx + 1, sy + 1, ts - 2, ts - 2);
    ctx.fillStyle = c.meetingTableEdge;
    ctx.fillRect(sx + 1, sy + ts - ts * .15, ts - 2, ts * .15 - 1);
  }

  private drawCabinet(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.cabinet;
    ctx.fillRect(sx + ts * .15, sy + ts * .1, ts * .7, ts * .8);
    ctx.strokeStyle = this.darken(c.cabinet, .15); ctx.lineWidth = 1;
    for (const frac of [.35, .55, .75]) {
      ctx.beginPath();
      ctx.moveTo(sx + ts * .2, sy + ts * frac);
      ctx.lineTo(sx + ts * .8, sy + ts * frac);
      ctx.stroke();
    }
    ctx.fillStyle = '#AAA';
    for (const frac of [.28, .48, .68]) ctx.fillRect(sx + ts * .45, sy + ts * frac, ts * .1, ts * .04);
  }

  private drawPrinter(sx: number, sy: number): void {
    const { ctx, ts } = this; const c = this.colors;
    ctx.fillStyle = c.printer;
    ctx.fillRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .45);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(sx + ts * .25, sy + ts * .2, ts * .5, ts * .12);
    ctx.fillStyle = this.darken(c.printer, .1);
    ctx.fillRect(sx + ts * .2, sy + ts * .58, ts * .6, ts * .08);
  }

  /* ── rocket items ───────────────────────────── */

  private drawRocketBody(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#E8E8F0';
    ctx.fillRect(sx + ts * .15, sy, ts * .7, ts);
    ctx.fillStyle = '#C0C0D0';
    ctx.fillRect(sx + ts * .15, sy, ts * .08, ts);
    ctx.fillRect(sx + ts * .77, sy, ts * .08, ts);
    ctx.fillStyle = '#3366CC';
    ctx.fillRect(sx + ts * .3, sy + ts * .3, ts * .4, ts * .15);
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(sx + ts * .15, sy + ts * .6, ts * .7, ts * .06);
  }

  private drawRocketNose(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#CC3333';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .5, sy + ts * .05);
    ctx.lineTo(sx + ts * .85, sy + ts * .95);
    ctx.lineTo(sx + ts * .15, sy + ts * .95);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E8E8F0';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .5, sy + ts * .3);
    ctx.lineTo(sx + ts * .75, sy + ts * .95);
    ctx.lineTo(sx + ts * .25, sy + ts * .95);
    ctx.closePath(); ctx.fill();
  }

  private drawRocketEngine(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#555566';
    ctx.fillRect(sx + ts * .2, sy, ts * .6, ts * .5);
    const t = Date.now() * 0.005;
    const flicker = 0.8 + Math.sin(t) * 0.2;
    ctx.fillStyle = `rgba(255,102,0,${flicker.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .25, sy + ts * .5);
    ctx.lineTo(sx + ts * .5, sy + ts * .95);
    ctx.lineTo(sx + ts * .75, sy + ts * .5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,170,51,${(flicker * 0.9).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .35, sy + ts * .5);
    ctx.lineTo(sx + ts * .5, sy + ts * .8);
    ctx.lineTo(sx + ts * .65, sy + ts * .5);
    ctx.closePath(); ctx.fill();
  }

  private drawScaffolding(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.strokeStyle = '#8899AA'; ctx.lineWidth = Math.max(1, this.scale * 0.5);
    ctx.strokeRect(sx + ts * .1, sy + ts * .05, ts * .8, ts * .9);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .1, sy + ts * .5);
    ctx.lineTo(sx + ts * .9, sy + ts * .5);
    ctx.stroke();
    ctx.fillStyle = '#6A7A8A';
    ctx.fillRect(sx + ts * .08, sy + ts * .02, ts * .08, ts * .96);
    ctx.fillRect(sx + ts * .84, sy + ts * .02, ts * .08, ts * .96);
  }

  private drawFuelTank(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#338844';
    ctx.fillRect(sx + ts * .2, sy + ts * .15, ts * .6, ts * .7);
    ctx.fillStyle = '#44AA55';
    ctx.fillRect(sx + ts * .25, sy + ts * .2, ts * .2, ts * .6);
    ctx.fillStyle = '#FFCC00';
    ctx.fillRect(sx + ts * .3, sy + ts * .05, ts * .4, ts * .12);
    ctx.fillStyle = '#222';
    ctx.font = `bold ${Math.max(6, ts * .18)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FUEL', sx + ts * .5, sy + ts * .5);
  }

  private drawLaunchPad(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#555566';
    ctx.fillRect(sx, sy, ts, ts);
    ctx.fillStyle = '#FFCC00';
    ctx.fillRect(sx + ts * .1, sy + ts * .45, ts * .8, ts * .1);
    ctx.fillStyle = '#444455';
    ctx.strokeStyle = '#666677'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
  }

  /* ── space station items ────────────────────── */

  private drawHullWindow(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#1A2535';
    ctx.fillRect(sx + 1, sy + 1, ts - 2, ts - 2);
    ctx.fillStyle = '#0A1020';
    ctx.fillRect(sx + ts * .15, sy + ts * .15, ts * .7, ts * .7);
    ctx.fillStyle = '#FFFFFF';
    this.circle(sx + ts * .4, sy + ts * .4, ts * .04);
    this.circle(sx + ts * .6, sy + ts * .55, ts * .03);
    this.circle(sx + ts * .35, sy + ts * .65, ts * .025);
    ctx.strokeStyle = '#2A3A4A'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + ts * .12, sy + ts * .12, ts * .76, ts * .76);
  }

  private drawSolarPanel(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#1A3A6A';
    ctx.fillRect(sx + ts * .05, sy + ts * .15, ts * .9, ts * .7);
    ctx.strokeStyle = '#4488CC'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const fx = sx + ts * .05 + (ts * .9 / 4) * i;
      ctx.beginPath(); ctx.moveTo(fx, sy + ts * .15); ctx.lineTo(fx, sy + ts * .85); ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const fy = sy + ts * .15 + (ts * .7 / 3) * i;
      ctx.beginPath(); ctx.moveTo(sx + ts * .05, fy); ctx.lineTo(sx + ts * .95, fy); ctx.stroke();
    }
    ctx.fillStyle = '#CCAA44';
    ctx.fillRect(sx + ts * .45, sy + ts * .05, ts * .1, ts * .12);
  }

  private drawOxygenTank(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#4488CC';
    ctx.fillRect(sx + ts * .25, sy + ts * .2, ts * .5, ts * .65);
    ctx.fillStyle = '#5599DD';
    ctx.fillRect(sx + ts * .3, sy + ts * .25, ts * .15, ts * .55);
    ctx.fillStyle = '#88BBEE';
    ctx.fillRect(sx + ts * .35, sy + ts * .1, ts * .3, ts * .12);
    ctx.fillStyle = '#222';
    ctx.font = `bold ${Math.max(5, ts * .16)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('O₂', sx + ts * .5, sy + ts * .52);
  }

  private drawCommDish(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#8899AA';
    ctx.fillRect(sx + ts * .45, sy + ts * .4, ts * .1, ts * .55);
    ctx.fillStyle = '#AABBCC';
    ctx.beginPath();
    ctx.moveTo(sx + ts * .15, sy + ts * .6);
    ctx.quadraticCurveTo(sx + ts * .5, sy + ts * .1, sx + ts * .85, sy + ts * .6);
    ctx.lineTo(sx + ts * .7, sy + ts * .55);
    ctx.quadraticCurveTo(sx + ts * .5, sy + ts * .25, sx + ts * .3, sy + ts * .55);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FF4444';
    this.circle(sx + ts * .5, sy + ts * .35, ts * .06);
  }

  private drawSleepPod(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#2A3A4A';
    ctx.fillRect(sx + ts * .1, sy + ts * .1, ts * .8, ts * .8);
    ctx.fillStyle = '#1A2A3A';
    ctx.fillRect(sx + ts * .15, sy + ts * .15, ts * .7, ts * .5);
    ctx.fillStyle = '#3A5A7A';
    ctx.fillRect(sx + ts * .2, sy + ts * .2, ts * .25, ts * .15);
    ctx.fillStyle = '#44AAFF';
    this.circle(sx + ts * .75, sy + ts * .25, ts * .04);
  }

  private drawSatellite(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#8899AA';
    ctx.fillRect(sx + ts * .35, sy + ts * .3, ts * .3, ts * .4);
    ctx.fillStyle = '#1A3A6A';
    ctx.fillRect(sx + ts * .05, sy + ts * .35, ts * .3, ts * .2);
    ctx.fillRect(sx + ts * .65, sy + ts * .35, ts * .3, ts * .2);
    ctx.strokeStyle = '#4488CC'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .2, sy + ts * .35); ctx.lineTo(sx + ts * .2, sy + ts * .55);
    ctx.moveTo(sx + ts * .8, sy + ts * .35); ctx.lineTo(sx + ts * .8, sy + ts * .55);
    ctx.stroke();
    ctx.fillStyle = '#FF4444';
    this.circle(sx + ts * .5, sy + ts * .25, ts * .06);
    ctx.fillStyle = '#CCAA44';
    ctx.fillRect(sx + ts * .45, sy + ts * .68, ts * .1, ts * .12);
  }

  /* ── farm items ─────────────────────────────── */

  private drawHayBale(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#D4A843';
    ctx.fillRect(sx + ts * .1, sy + ts * .2, ts * .8, ts * .65);
    ctx.fillStyle = '#C09830';
    ctx.fillRect(sx + ts * .1, sy + ts * .2, ts * .8, ts * .12);
    ctx.strokeStyle = '#8B6914'; ctx.lineWidth = Math.max(1, this.scale * 0.4);
    ctx.beginPath();
    ctx.moveTo(sx + ts * .5, sy + ts * .2); ctx.lineTo(sx + ts * .5, sy + ts * .85);
    ctx.stroke();
  }

  private drawTree(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#5A3A1A';
    ctx.fillRect(sx + ts * .4, sy + ts * .55, ts * .2, ts * .4);
    ctx.fillStyle = '#2A8A3A';
    this.circle(sx + ts * .5, sy + ts * .35, ts * .3);
    ctx.fillStyle = '#3AAA4A';
    this.circle(sx + ts * .35, sy + ts * .42, ts * .18);
    this.circle(sx + ts * .65, sy + ts * .42, ts * .18);
    ctx.fillStyle = '#4ABA5A';
    this.circle(sx + ts * .5, sy + ts * .28, ts * .15);
  }

  private drawWaterTrough(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#6A6A6A';
    ctx.fillRect(sx + ts * .1, sy + ts * .35, ts * .8, ts * .45);
    ctx.fillStyle = '#5599CC';
    ctx.fillRect(sx + ts * .15, sy + ts * .4, ts * .7, ts * .3);
    ctx.fillStyle = '#555';
    ctx.fillRect(sx + ts * .12, sy + ts * .75, ts * .12, ts * .15);
    ctx.fillRect(sx + ts * .76, sy + ts * .75, ts * .12, ts * .15);
  }

  private drawCrop(sx: number, sy: number): void {
    const { ctx, ts } = this;
    const colors = ['#3A8A2A', '#4A9A3A', '#5AAA4A'];
    for (let i = 0; i < 3; i++) {
      const cx = sx + ts * (.2 + i * .3);
      ctx.fillStyle = '#6A5A30';
      ctx.fillRect(cx, sy + ts * .5, ts * .04, ts * .4);
      ctx.fillStyle = colors[i];
      ctx.fillRect(cx - ts * .06, sy + ts * .3, ts * .16, ts * .25);
      ctx.fillStyle = '#5A9A3A';
      ctx.fillRect(cx - ts * .04, sy + ts * .42, ts * .12, ts * .12);
    }
  }

  private drawTractor(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(sx + ts * .15, sy + ts * .25, ts * .55, ts * .4);
    ctx.fillStyle = '#222';
    ctx.fillRect(sx + ts * .6, sy + ts * .3, ts * .25, ts * .3);
    ctx.fillStyle = '#333';
    this.circle(sx + ts * .25, sy + ts * .75, ts * .15);
    this.circle(sx + ts * .7, sy + ts * .72, ts * .18);
    ctx.fillStyle = '#555';
    this.circle(sx + ts * .25, sy + ts * .75, ts * .08);
    this.circle(sx + ts * .7, sy + ts * .72, ts * .1);
    ctx.fillStyle = '#AACCEE';
    ctx.fillRect(sx + ts * .52, sy + ts * .15, ts * .15, ts * .18);
  }

  /* ── farm animals ───────────────────────────── */

  private drawCow(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(sx + ts * .15, sy + ts * .3, ts * .6, ts * .35);
    ctx.fillStyle = '#333';
    ctx.fillRect(sx + ts * .25, sy + ts * .35, ts * .15, ts * .12);
    ctx.fillRect(sx + ts * .5, sy + ts * .4, ts * .12, ts * .1);
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(sx + ts * .08, sy + ts * .25, ts * .2, ts * .2);
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .12, sy + ts * .3, ts * .04, ts * .04);
    ctx.fillStyle = '#FFAAAA';
    ctx.fillRect(sx + ts * .08, sy + ts * .4, ts * .12, ts * .06);
    ctx.fillStyle = '#444';
    ctx.fillRect(sx + ts * .2, sy + ts * .65, ts * .06, ts * .2);
    ctx.fillRect(sx + ts * .4, sy + ts * .65, ts * .06, ts * .2);
    ctx.fillRect(sx + ts * .55, sy + ts * .65, ts * .06, ts * .2);
    ctx.fillRect(sx + ts * .65, sy + ts * .65, ts * .06, ts * .2);
  }

  private drawChicken(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#F5DEB3';
    ctx.fillRect(sx + ts * .3, sy + ts * .4, ts * .35, ts * .25);
    ctx.fillStyle = '#F5DEB3';
    this.circle(sx + ts * .35, sy + ts * .35, ts * .12);
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(sx + ts * .3, sy + ts * .22, ts * .1, ts * .08);
    ctx.fillStyle = '#FF8800';
    ctx.fillRect(sx + ts * .24, sy + ts * .36, ts * .08, ts * .04);
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .32, sy + ts * .32, ts * .03, ts * .03);
    ctx.fillStyle = '#CC8800';
    ctx.fillRect(sx + ts * .35, sy + ts * .65, ts * .04, ts * .15);
    ctx.fillRect(sx + ts * .5, sy + ts * .65, ts * .04, ts * .15);
    ctx.fillStyle = '#D4A843';
    ctx.fillRect(sx + ts * .55, sy + ts * .45, ts * .12, ts * .08);
    ctx.fillRect(sx + ts * .6, sy + ts * .5, ts * .08, ts * .06);
  }

  private drawSheep(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#F0EAE0';
    this.circle(sx + ts * .45, sy + ts * .45, ts * .25);
    this.circle(sx + ts * .55, sy + ts * .4, ts * .2);
    this.circle(sx + ts * .35, sy + ts * .5, ts * .18);
    ctx.fillStyle = '#3A3A3A';
    this.circle(sx + ts * .25, sy + ts * .4, ts * .1);
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + ts * .22, sy + ts * .38, ts * .03, ts * .03);
    ctx.fillStyle = '#555';
    ctx.fillRect(sx + ts * .3, sy + ts * .65, ts * .06, ts * .18);
    ctx.fillRect(sx + ts * .5, sy + ts * .65, ts * .06, ts * .18);
  }

  /* ── hospital items ─────────────────────────── */

  private drawHospitalBed(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#D0D8E0';
    ctx.fillRect(sx + ts * .05, sy + ts * .3, ts * .9, ts * .5);
    ctx.fillStyle = '#E8F0F8';
    ctx.fillRect(sx + ts * .1, sy + ts * .35, ts * .8, ts * .35);
    ctx.fillStyle = '#A0B0C0';
    ctx.fillRect(sx + ts * .05, sy + ts * .25, ts * .25, ts * .1);
    ctx.fillStyle = '#8899AA';
    ctx.fillRect(sx + ts * .08, sy + ts * .78, ts * .08, ts * .12);
    ctx.fillRect(sx + ts * .84, sy + ts * .78, ts * .08, ts * .12);
  }

  private drawMedCabinet(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#D0D8E0';
    ctx.fillRect(sx + ts * .15, sy + ts * .1, ts * .7, ts * .8);
    ctx.strokeStyle = '#A0A8B0'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + ts * .18, sy + ts * .13, ts * .64, ts * .74);
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(sx + ts * .42, sy + ts * .3, ts * .16, ts * .04);
    ctx.fillRect(sx + ts * .48, sy + ts * .24, ts * .04, ts * .16);
    ctx.strokeStyle = '#B0B8C0'; ctx.beginPath();
    ctx.moveTo(sx + ts * .2, sy + ts * .5);
    ctx.lineTo(sx + ts * .8, sy + ts * .5);
    ctx.stroke();
  }

  private drawXrayMachine(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#8899AA';
    ctx.fillRect(sx + ts * .2, sy + ts * .1, ts * .6, ts * .75);
    ctx.fillStyle = '#1A2A3A';
    ctx.fillRect(sx + ts * .25, sy + ts * .15, ts * .5, ts * .4);
    ctx.fillStyle = '#00BCD4';
    ctx.fillRect(sx + ts * .3, sy + ts * .2, ts * .4, ts * .3);
    ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ts * .35, sy + ts * .32);
    ctx.lineTo(sx + ts * .45, sy + ts * .38);
    ctx.lineTo(sx + ts * .55, sy + ts * .28);
    ctx.lineTo(sx + ts * .65, sy + ts * .42);
    ctx.stroke();
    ctx.fillStyle = '#6A7A8A';
    ctx.fillRect(sx + ts * .35, sy + ts * .82, ts * .3, ts * .08);
  }

  private drawCurtain(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#88BBCC';
    ctx.fillRect(sx + ts * .4, sy + ts * .05, ts * .2, ts * .9);
    ctx.fillStyle = '#99CCDD';
    ctx.fillRect(sx + ts * .1, sy + ts * .08, ts * .35, ts * .85);
    ctx.fillStyle = '#77AABB';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(sx + ts * .12, sy + ts * (.15 + i * .2), ts * .3, ts * .02);
    }
    ctx.fillStyle = '#6A8A9A';
    ctx.fillRect(sx + ts * .1, sy + ts * .05, ts * .5, ts * .04);
  }

  private drawSink(sx: number, sy: number): void {
    const { ctx, ts } = this;
    ctx.fillStyle = '#D0D8E0';
    ctx.fillRect(sx + ts * .15, sy + ts * .3, ts * .7, ts * .45);
    ctx.fillStyle = '#E8F0F8';
    ctx.fillRect(sx + ts * .2, sy + ts * .35, ts * .6, ts * .3);
    ctx.fillStyle = '#88AACC';
    ctx.fillRect(sx + ts * .25, sy + ts * .4, ts * .5, ts * .2);
    ctx.fillStyle = '#AABBCC';
    ctx.fillRect(sx + ts * .45, sy + ts * .15, ts * .1, ts * .18);
    ctx.fillStyle = '#CC4444';
    this.circle(sx + ts * .4, sy + ts * .16, ts * .04);
    ctx.fillStyle = '#4444CC';
    this.circle(sx + ts * .6, sy + ts * .16, ts * .04);
  }

  /* ── workstations (env-specific) ────────────── */

  private drawWorkstations(): void {
    switch (this.env) {
      case 'rocket': this.drawWorkstationsVariant('workbench'); break;
      case 'space_station': this.drawWorkstationsVariant('console'); break;
      case 'farm': this.drawWorkstationsVariant('workbench'); break;
      case 'hospital': this.drawWorkstationsVariant('medical'); break;
      default: this.drawWorkstationsVariant('office'); break;
    }
  }

  private drawWorkstationsVariant(variant: string): void {
    const { ctx, ts } = this;
    const c = this.colors;

    for (const ws of this.world.workstations) {
      for (const dt of ws.deskTiles) {
        const sx = dt.x * ts, sy = dt.y * ts;
        ctx.fillStyle = c.deskTop;
        ctx.fillRect(sx + 1, sy + ts * .2, ts - 2, ts * .55);
        ctx.fillStyle = c.deskEdge;
        ctx.fillRect(sx + 1, sy + ts * .7, ts - 2, ts * .25);
        ctx.fillStyle = c.deskLeg;
        ctx.fillRect(sx + 2, sy + ts * .85, ts * .12, ts * .15);
        ctx.fillRect(sx + ts - 2 - ts * .12, sy + ts * .85, ts * .12, ts * .15);
      }

      const mt = ws.deskTiles[0];
      const mx = mt.x * ts, my = mt.y * ts;

      if (variant === 'office' || variant === 'medical') {
        const px = mx + ts * .2, py = my + ts * .02;
        const mw = ts * .55, mh = ts * .35;
        ctx.fillStyle = c.monitor;
        ctx.fillRect(px, py, mw, mh);
        ctx.fillStyle = ws.assignedAgentId ? c.screenOn : c.screenOff;
        ctx.fillRect(px + 2, py + 2, mw - 4, mh - 4);
        ctx.fillStyle = c.monitor;
        ctx.fillRect(px + mw * .4, py + mh, mw * .2, ts * .08);
        if (variant === 'medical') {
          ctx.fillStyle = '#E74C3C';
          ctx.fillRect(px + mw * .35, py + mh * .3, mw * .3, mw * .04);
          ctx.fillRect(px + mw * .48, py + mh * .15, mw * .04, mw * .3);
        }
      } else if (variant === 'console') {
        ctx.fillStyle = '#1A2A3A';
        ctx.fillRect(mx + ts * .1, my + ts * .05, ts * .8, ts * .25);
        ctx.fillStyle = ws.assignedAgentId ? '#44AAFF' : '#0A1520';
        ctx.fillRect(mx + ts * .15, my + ts * .08, ts * .7, ts * .18);
        if (ws.assignedAgentId) {
          ctx.fillStyle = '#88CCFF';
          for (let i = 0; i < 3; i++) ctx.fillRect(mx + ts * (.2 + i * .22), my + ts * .12, ts * .14, ts * .03);
        }
        ctx.fillStyle = '#44AA55';
        this.circle(mx + ts * .85, my + ts * .16, ts * .03);
      } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(mx + ts * .15, my + ts * .08, ts * .3, ts * .12);
        ctx.fillRect(mx + ts * .55, my + ts * .1, ts * .2, ts * .08);
        ctx.fillStyle = '#AAA';
        ctx.fillRect(mx + ts * .6, my + ts * .06, ts * .1, ts * .04);
      }

      const cp = ws.chairPosition;
      const cx = cp.x * ts, cy = cp.y * ts;
      ctx.fillStyle = c.chairSeat;
      ctx.fillRect(cx + ts * .2, cy + ts * .3, ts * .6, ts * .4);
      ctx.fillStyle = c.chairBack;
      ctx.fillRect(cx + ts * .2, cy + ts * .65, ts * .6, ts * .15);
    }
  }

  /* ── agent ──────────────────────────────────── */

  private drawAgent(agent: Agent): void {
    const { ctx, ts, scale } = this;
    const { frame, flip } = agent.getCurrentSprite();
    const cw = frame.width * scale, ch = frame.height * scale;
    const cx = agent.x * ts + (ts - cw) / 2;
    const cy = agent.y * ts + (ts - ch) / 2 - scale * 2;

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(agent.x * ts + ts / 2, agent.y * ts + ts - scale * 2, cw * .3, scale * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const envPalette = this.getEnvPalette(agent);
    renderSprite(ctx, frame, cx, cy, scale, envPalette, flip);
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
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return '#' + [r, g, b].map(v => Math.round(v * (1 - amt)).toString(16).padStart(2, '0')).join('');
  }
}
