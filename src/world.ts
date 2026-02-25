import type { EnvironmentId, OfficeSize, Position, Tile, TileType, ThemeId, Workstation } from './types';
import { SIZE_CONFIGS, type SizeConfig } from './themes';

export class World {
  gridWidth = 24;
  gridHeight = 16;
  tiles: Tile[][] = [];
  workstations: Workstation[] = [];
  spawnPoint: Position = { x: 1, y: 8 };
  currentEnv: EnvironmentId = 'office';

  constructor(size: OfficeSize = 'small', theme: ThemeId = 'hybrid', env: EnvironmentId = 'office') {
    this.rebuild(size, theme, env);
  }

  rebuild(size: OfficeSize, theme: ThemeId, env: EnvironmentId = 'office'): void {
    const cfg = SIZE_CONFIGS[size];
    this.gridWidth = cfg.width;
    this.gridHeight = cfg.height;
    this.tiles = [];
    this.workstations = [];
    this.currentEnv = env;
    this.spawnPoint = { x: 1, y: Math.floor(this.gridHeight / 2) };

    this.initFloor();
    this.addWalls();

    switch (env) {
      case 'rocket':        this.buildRocketScene(cfg); break;
      case 'space_station': this.buildSpaceStationScene(cfg); break;
      case 'farm':          this.buildFarmScene(cfg); break;
      case 'hospital':
        this.placeWorkstations(cfg);
        this.decorateHospital(size);
        break;
      default:
        this.placeWorkstations(cfg);
        this.decorateOffice(size, theme);
        break;
    }
  }

  /* ── common layout ───────────────────────────── */

  private initFloor(): void {
    for (let y = 0; y < this.gridHeight; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.gridWidth; x++) {
        this.tiles[y][x] = { type: 'floor', walkable: true };
      }
    }
  }

  private addWalls(): void {
    for (let x = 0; x < this.gridWidth; x++) {
      this.set(x, 0, 'wall');
      this.set(x, this.gridHeight - 1, 'wall');
    }
    for (let y = 0; y < this.gridHeight; y++) {
      this.set(0, y, 'wall');
      this.set(this.gridWidth - 1, y, 'wall');
    }
    this.tiles[this.spawnPoint.y][0] = { type: 'floor', walkable: true };
  }

  private placeWorkstations(cfg: SizeConfig): void {
    let wsId = 0;
    const maxRows = Math.floor((this.gridHeight - cfg.deskStartY - 3) / cfg.deskRowSpacing);
    for (let row = 0; row < maxRows && wsId < cfg.maxWorkstations; row++) {
      for (let col = 0; col < cfg.deskCols && wsId < cfg.maxWorkstations; col++) {
        const dx = cfg.deskStartX + col * cfg.deskColSpacing;
        const dy = cfg.deskStartY + row * cfg.deskRowSpacing;
        if (dx + 1 >= this.gridWidth - 7) continue;
        if (dy + 1 >= this.gridHeight - 1) continue;
        this.addWorkstation(dx, dy, wsId++);
      }
    }
  }

  private addWorkstation(dx: number, dy: number, wsId: number): void {
    if (dx + 1 >= this.gridWidth - 1 || dy + 1 >= this.gridHeight - 1) return;
    if (dx < 1 || dy < 1) return;
    this.set(dx, dy, 'desk');
    this.set(dx + 1, dy, 'desk');
    const chair: Position = { x: dx, y: dy + 1 };
    this.tiles[chair.y][chair.x] = { type: 'chair', walkable: true };
    this.workstations.push({
      id: wsId,
      deskTiles: [{ x: dx, y: dy }, { x: dx + 1, y: dy }],
      chairPosition: chair,
      facingDirection: 'up',
    });
  }

  /* ── office decoration ───────────────────────── */

  private decorateOffice(size: OfficeSize, theme: ThemeId): void {
    const rx = this.gridWidth - 7;
    this.tryPlace(rx + 1, 2, 'coffee');
    this.tryPlace(rx + 3, 2, 'water_cooler');
    if (theme === 'casual') {
      this.tryPlace(rx + 1, this.gridHeight - 4, 'couch');
      this.tryPlace(rx + 2, this.gridHeight - 4, 'couch');
      this.tryPlace(rx + 1, this.gridHeight - 3, 'rug');
      this.tryPlace(rx + 2, this.gridHeight - 3, 'rug');
      this.tryPlace(rx + 3, this.gridHeight - 3, 'rug');
    } else if (theme === 'business') {
      this.tryPlace(rx + 1, this.gridHeight - 4, 'cabinet');
      this.tryPlace(rx + 2, this.gridHeight - 4, 'cabinet');
      this.tryPlace(rx + 3, this.gridHeight - 3, 'printer');
    } else {
      this.tryPlace(rx + 1, this.gridHeight - 4, 'couch');
      this.tryPlace(rx + 3, this.gridHeight - 3, 'printer');
    }
    if (size !== 'small') {
      for (let dy = 0; dy < 3; dy++) {
        this.tryPlace(rx + 1, 5 + dy, 'meeting_table');
        this.tryPlace(rx + 2, 5 + dy, 'meeting_table');
      }
      for (let x = rx + 1; x <= rx + 4 && x < this.gridWidth - 1; x++) {
        this.tryPlace(x, 1, 'bookshelf');
      }
      this.tryPlace(rx + 5, 1, 'whiteboard');
    }
    if (size === 'large') {
      this.tryPlace(rx - 1, 1, 'bookshelf');
      for (let dy = 0; dy < 2; dy++) this.tryPlace(rx + 4, 5 + dy, 'meeting_table');
      this.tryPlace(rx + 3, this.gridHeight - 5, 'cabinet');
      this.tryPlace(rx + 4, this.gridHeight - 5, 'printer');
      this.tryPlace(rx + 3, this.gridHeight - 4, 'couch');
      this.tryPlace(rx + 4, this.gridHeight - 4, 'couch');
    }
    this.placeCornerPlants();
    if (theme === 'casual') {
      for (let x = 6; x < this.gridWidth - 8; x += 7) this.tryPlace(x, this.gridHeight - 2, 'plant');
      for (let x = 7; x < this.gridWidth - 8; x += 9) this.tryPlace(x, 1, 'plant');
    } else if (theme === 'hybrid') {
      this.tryPlace(Math.floor(this.gridWidth / 2), 1, 'plant');
      this.tryPlace(Math.floor(this.gridWidth / 2), this.gridHeight - 2, 'plant');
    }
  }

  /* ── rocket scene: rocket centered, 3 levels ── */

  private buildRocketScene(cfg: SizeConfig): void {
    const cx = Math.floor(this.gridWidth / 2) - 1;
    const topY = 2;
    const botY = this.gridHeight - 4;

    this.tryPlace(cx, topY, 'rocket_nose');
    this.tryPlace(cx + 1, topY, 'rocket_nose');
    for (let y = topY + 1; y < botY; y++) {
      this.tryPlace(cx, y, 'rocket_body');
      this.tryPlace(cx + 1, y, 'rocket_body');
    }
    this.tryPlace(cx, botY, 'rocket_engine');
    this.tryPlace(cx + 1, botY, 'rocket_engine');

    for (let y = topY; y <= botY; y += 2) {
      this.tryPlace(cx - 1, y, 'scaffolding');
      this.tryPlace(cx + 2, y, 'scaffolding');
    }

    this.tryPlace(cx, botY + 1, 'launch_pad');
    this.tryPlace(cx + 1, botY + 1, 'launch_pad');
    this.tryPlace(cx - 1, botY + 1, 'launch_pad');
    this.tryPlace(cx + 2, botY + 1, 'launch_pad');

    this.tryPlace(cx - 3, botY, 'fuel_tank');
    this.tryPlace(cx + 4, botY, 'fuel_tank');
    if (botY - 2 > topY) {
      this.tryPlace(cx - 3, botY - 2, 'fuel_tank');
      this.tryPlace(cx + 4, botY - 2, 'fuel_tank');
    }

    const rocketHeight = botY - topY;
    const levelGap = Math.max(2, Math.floor(rocketHeight / 3));
    let wsId = 0;

    for (let level = 0; level < 3 && wsId < cfg.maxWorkstations; level++) {
      const baseY = topY + 1 + level * levelGap;
      if (baseY + 1 >= this.gridHeight - 1) break;

      for (let i = 0; i < 2 && wsId < cfg.maxWorkstations; i++) {
        const deskX = 2 + i * 3;
        if (deskX + 1 < cx - 2) {
          this.addWorkstation(deskX, baseY, wsId++);
        }
      }

      for (let i = 0; i < 2 && wsId < cfg.maxWorkstations; i++) {
        const deskX = cx + 4 + i * 3;
        if (deskX + 1 < this.gridWidth - 1) {
          this.addWorkstation(deskX, baseY, wsId++);
        }
      }
    }

    this.tryPlace(1, 1, 'whiteboard');
    this.tryPlace(2, 1, 'cabinet');
  }

  /* ── space station: interior + exterior zones ── */

  private buildSpaceStationScene(cfg: SizeConfig): void {
    const dividerX = Math.floor(this.gridWidth * 0.6);

    for (let y = 1; y < this.gridHeight - 1; y++) {
      this.set(dividerX, y, 'wall');
    }
    const doorY = Math.floor(this.gridHeight / 2);
    this.tiles[doorY][dividerX] = { type: 'floor', walkable: true };
    if (doorY + 1 < this.gridHeight - 1) {
      this.tiles[doorY + 1][dividerX] = { type: 'floor', walkable: true };
    }

    for (let x = dividerX + 1; x < this.gridWidth - 1; x++) {
      this.tryPlace(x, 1, 'hull_window');
      this.tryPlace(x, this.gridHeight - 2, 'hull_window');
    }

    let wsId = 0;
    const interiorCols = Math.floor((dividerX - 4) / 5);
    const maxRows = Math.floor((this.gridHeight - 5) / 4);
    for (let row = 0; row < maxRows && wsId < Math.floor(cfg.maxWorkstations * 0.65); row++) {
      for (let col = 0; col < Math.min(interiorCols, 3) && wsId < Math.floor(cfg.maxWorkstations * 0.65); col++) {
        const dx = 3 + col * 5;
        const dy = 2 + row * 4;
        if (dx + 1 < dividerX - 1 && dy + 1 < this.gridHeight - 1) {
          this.addWorkstation(dx, dy, wsId++);
        }
      }
    }

    this.tryPlace(1, 1, 'oxygen_tank');
    this.tryPlace(2, 1, 'oxygen_tank');
    this.tryPlace(1, this.gridHeight - 2, 'sleep_pod');
    this.tryPlace(2, this.gridHeight - 2, 'sleep_pod');
    const midInt = Math.floor(dividerX / 2);
    this.tryPlace(midInt, 1, 'comm_dish');

    const extStartX = dividerX + 2;
    const extMidY = Math.floor(this.gridHeight / 2);

    this.tryPlace(extStartX, 2, 'solar_panel');
    this.tryPlace(extStartX + 1, 2, 'solar_panel');
    if (extStartX + 2 < this.gridWidth - 1) {
      this.tryPlace(extStartX + 2, 2, 'solar_panel');
    }

    this.tryPlace(extStartX, extMidY - 1, 'satellite');
    if (extStartX + 1 < this.gridWidth - 1) {
      this.tryPlace(extStartX + 1, extMidY - 1, 'satellite');
    }

    this.tryPlace(extStartX, this.gridHeight - 3, 'comm_dish');

    let extRow = 0;
    for (let row = 0; row < 2 && wsId < cfg.maxWorkstations; row++) {
      const dy = extMidY + 1 + row * 3;
      if (dy + 1 >= this.gridHeight - 1) break;
      if (extStartX + 1 < this.gridWidth - 1) {
        this.addWorkstation(extStartX, dy, wsId++);
        extRow++;
      }
    }

    if (wsId < cfg.maxWorkstations && extStartX + 4 < this.gridWidth - 1) {
      const dy = 4;
      if (dy + 1 < this.gridHeight - 1) {
        this.addWorkstation(extStartX + 3, dy, wsId++);
      }
    }
  }

  /* ── farm: crops, animals, barn ──────────────── */

  private buildFarmScene(cfg: SizeConfig): void {
    const barnX = this.gridWidth - 8;
    const midY = Math.floor(this.gridHeight / 2);

    let wsId = 0;
    const cropCols = Math.min(3, Math.floor((barnX - 4) / 5));
    const maxRows = Math.floor((this.gridHeight - 5) / 4);
    for (let row = 0; row < maxRows && wsId < Math.floor(cfg.maxWorkstations * 0.6); row++) {
      for (let col = 0; col < cropCols && wsId < Math.floor(cfg.maxWorkstations * 0.6); col++) {
        const dx = 3 + col * 5;
        const dy = 2 + row * 4;
        if (dx + 1 < barnX - 1 && dy + 1 < this.gridHeight - 1) {
          this.addWorkstation(dx, dy, wsId++);
        }
      }
    }

    for (let x = 2; x < barnX - 1; x += 3) {
      for (let y = midY + 1; y < this.gridHeight - 2; y++) {
        this.tryPlace(x, y, 'crop');
      }
    }

    for (let y = 1; y < this.gridHeight - 1; y++) {
      this.tryPlace(barnX, y, 'wall');
    }
    this.tiles[midY][barnX] = { type: 'floor', walkable: true };

    const animalY = 2;
    this.tryPlace(barnX + 1, animalY, 'cow');
    this.tryPlace(barnX + 2, animalY, 'cow');
    this.tryPlace(barnX + 1, animalY + 2, 'sheep');
    this.tryPlace(barnX + 2, animalY + 2, 'sheep');
    this.tryPlace(barnX + 3, animalY + 1, 'chicken');
    this.tryPlace(barnX + 4, animalY + 1, 'chicken');
    this.tryPlace(barnX + 3, animalY + 3, 'chicken');

    this.tryPlace(barnX + 1, midY + 1, 'water_trough');
    this.tryPlace(barnX + 2, midY + 1, 'water_trough');

    this.tryPlace(barnX + 1, midY + 3, 'hay_bale');
    this.tryPlace(barnX + 2, midY + 3, 'hay_bale');
    this.tryPlace(barnX + 3, midY + 3, 'hay_bale');

    for (let row = 0; row < 2 && wsId < cfg.maxWorkstations; row++) {
      const dy = midY + 4 + row * 3;
      if (dy + 1 < this.gridHeight - 1 && barnX + 2 < this.gridWidth - 1) {
        this.addWorkstation(barnX + 1, dy, wsId++);
      }
    }

    this.tryPlace(barnX + 4, midY + 4, 'tractor');
    this.tryPlace(barnX + 5, midY + 4, 'tractor');

    this.placeCornerTrees();
    for (let x = 4; x < barnX - 2; x += 5) {
      this.tryPlace(x, 1, 'tree');
    }
    for (let x = 3; x < barnX - 2; x += 6) {
      this.tryPlace(x, this.gridHeight - 2, 'tree');
    }
  }

  /* ── hospital decoration ─────────────────────── */

  private decorateHospital(size: OfficeSize): void {
    const rx = this.gridWidth - 7;

    this.tryPlace(rx + 1, 2, 'hospital_bed');
    this.tryPlace(rx + 2, 2, 'hospital_bed');
    this.tryPlace(rx + 3, 2, 'curtain');

    this.tryPlace(rx + 1, 4, 'hospital_bed');
    this.tryPlace(rx + 2, 4, 'hospital_bed');
    this.tryPlace(rx + 3, 4, 'curtain');

    this.tryPlace(rx + 1, this.gridHeight - 3, 'med_cabinet');
    this.tryPlace(rx + 2, this.gridHeight - 3, 'med_cabinet');
    this.tryPlace(rx + 3, this.gridHeight - 3, 'sink');

    this.tryPlace(rx + 4, 2, 'xray_machine');
    this.tryPlace(rx + 4, 3, 'xray_machine');

    if (size !== 'small') {
      this.tryPlace(rx + 1, 6, 'hospital_bed');
      this.tryPlace(rx + 2, 6, 'hospital_bed');
      this.tryPlace(rx + 3, 6, 'curtain');
      this.tryPlace(rx + 4, this.gridHeight - 3, 'med_cabinet');
    }

    this.tryPlace(1, 1, 'med_cabinet');
    this.tryPlace(2, 1, 'med_cabinet');
    this.placeCornerPlants();
  }

  /* ── shared helpers ──────────────────────────── */

  private placeCornerPlants(): void {
    for (const p of [
      { x: 1, y: 1 }, { x: this.gridWidth - 2, y: 1 },
      { x: 1, y: this.gridHeight - 2 }, { x: this.gridWidth - 2, y: this.gridHeight - 2 },
    ]) this.tryPlace(p.x, p.y, 'plant');
  }

  private placeCornerTrees(): void {
    for (const p of [
      { x: 1, y: 1 }, { x: this.gridWidth - 2, y: 1 },
      { x: 1, y: this.gridHeight - 2 }, { x: this.gridWidth - 2, y: this.gridHeight - 2 },
    ]) this.tryPlace(p.x, p.y, 'tree');
  }

  private set(x: number, y: number, type: TileType): void {
    if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
      this.tiles[y][x] = { type, walkable: false };
    }
  }

  private tryPlace(x: number, y: number, type: TileType): void {
    if (x >= 1 && x < this.gridWidth - 1 && y >= 1 && y < this.gridHeight - 1) {
      if (this.tiles[y][x].type === 'floor') {
        this.tiles[y][x] = { type, walkable: false };
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return false;
    return this.tiles[y][x].walkable;
  }

  getAvailableWorkstation(): Workstation | null {
    return this.workstations.find(ws => !ws.assignedAgentId) ?? null;
  }

  assignWorkstation(wsId: number, agentId: string): void {
    const ws = this.workstations.find(w => w.id === wsId);
    if (ws) ws.assignedAgentId = agentId;
  }

  freeWorkstation(agentId: string): void {
    const ws = this.workstations.find(w => w.assignedAgentId === agentId);
    if (ws) ws.assignedAgentId = undefined;
  }

  findPath(start: Position, end: Position): Position[] {
    if (!this.isWalkable(end.x, end.y)) return [];
    const key = (p: Position) => `${p.x},${p.y}`;
    const queue: Position[] = [start];
    const visited = new Set<string>([key(start)]);
    const parent = new Map<string, Position | null>();
    parent.set(key(start), null);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.x === end.x && cur.y === end.y) {
        const path: Position[] = [];
        let node: Position | null | undefined = cur;
        while (node) { path.unshift(node); node = parent.get(key(node)) ?? undefined; }
        return path;
      }
      for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]] as const) {
        const next: Position = { x: cur.x + dx, y: cur.y + dy };
        const k = key(next);
        if (!visited.has(k) && this.isWalkable(next.x, next.y)) {
          visited.add(k); parent.set(k, cur); queue.push(next);
        }
      }
    }
    return [];
  }
}
