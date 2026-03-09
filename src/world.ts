import type { ActivityZone, BuildingStyle, EnvironmentId, OfficeSize, Position, Room, Tile, TileType, ThemeId, ZoneType, StageConfig } from './types';
import { DEFAULT_STAGES } from './types';
import { SIZE_CONFIGS, ORCHESTRATOR_ROWS, type SizeConfig } from './themes';

interface RoomConfig {
  name: string;
  widthFraction: number;
}

export class World {
  gridWidth = 24;
  gridHeight = 16;
  tiles: Tile[][] = [];
  zones: ActivityZone[] = [];
  rooms: Room[] = [];
  spawnPoint: Position = { x: 1, y: 8 };
  currentEnv: EnvironmentId = 'office';

  /** @deprecated Use zones instead */
  get workstations(): ActivityZone[] { return this.zones; }

  constructor(size: OfficeSize = 'small', theme: ThemeId = 'hybrid', env: EnvironmentId = 'office', _roomMode?: string, stages?: StageConfig[]) {
    this.rebuild(size, theme, env, undefined, stages);
  }

  rebuild(size: OfficeSize, theme: ThemeId, env: EnvironmentId = 'office', _roomMode?: string, stages: StageConfig[] = DEFAULT_STAGES): void {
    const cfg = SIZE_CONFIGS[size];
    this.gridWidth = cfg.width;
    this.gridHeight = cfg.height;
    this.tiles = [];
    this.zones = [];
    this.rooms = [];
    this.currentEnv = env;
    this.spawnPoint = { x: 1, y: Math.floor(this.gridHeight / 2) };

    this.initFloor();
    this.addWalls();

    // Always use kanban layout: town gets RPG buildings, others get kanban rooms
    if (env === 'town') {
      this.buildTownRooms(cfg, stages);
    } else {
      this.buildKanbanRooms(cfg, stages);
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

  /** The Y row where the orchestrator corridor's separator wall sits */
  get orchestratorSeparatorY(): number { return ORCHESTRATOR_ROWS + 1; }

  /** Build the orchestrator/manager corridor at the top of the grid (rows 1..ORCHESTRATOR_ROWS) */
  private buildOrchestratorCorridor(env: EnvironmentId): Room {
    const sepY = this.orchestratorSeparatorY;
    const corridorId = 9000; // Special ID for the orchestrator room

    // Fill corridor rows with walkable floor
    for (let y = 1; y < sepY; y++) {
      for (let x = 1; x < this.gridWidth - 1; x++) {
        if (env === 'town') {
          this.tiles[y][x] = { type: 'town_stairs', walkable: true };
        } else {
          this.tiles[y][x] = { type: 'floor', walkable: true };
        }
      }
    }

    // Separator wall with doorways aligned to room centers
    for (let x = 1; x < this.gridWidth - 1; x++) {
      this.tiles[sepY][x] = { type: env === 'town' ? 'fence' : 'wall', walkable: false };
    }

    // No doorways — orchestrator corridor is fully isolated from rooms below.
    // Manager agents use portal teleportation, not walking.

    // Register orchestrator room
    const room: Room = {
      id: corridorId,
      name: 'Management',
      bounds: { x: 1, y: 1, w: this.gridWidth - 2, h: ORCHESTRATOR_ROWS },
      doorways: [],
    };
    this.rooms.push(room);

    // Add standing zones distributed across the corridor
    const zoneCount = Math.max(4, Math.floor(this.gridWidth / 5));
    const zoneSpacing = Math.floor((this.gridWidth - 4) / zoneCount);
    for (let i = 0; i < zoneCount; i++) {
      const zx = 2 + i * zoneSpacing;
      const zy = 1 + Math.floor(ORCHESTRATOR_ROWS / 2); // middle row
      if (zx < this.gridWidth - 1) {
        this.addStandingZone('common_area', { x: zx, y: zy }, corridorId, 'down');
      }
    }

    // Decorate corridor
    if (env === 'town') {
      // Town: stairs are clean, no decorations
    } else {
      // Whiteboards on top wall for office environments
      for (let x = 2; x < this.gridWidth - 2; x += 5) {
        if (this.tiles[1][x].type === 'floor') {
          this.tiles[1][x] = { type: 'whiteboard', walkable: false };
        }
      }
    }

    return room;
  }

  /** Build a vertical room divider wall with a doorway (below orchestrator corridor) */
  private buildRoomDivider(divX: number, doorY: number, doorH = 2): void {
    const startY = this.orchestratorSeparatorY + 1;
    for (let y = startY; y < this.gridHeight - 1; y++) {
      const inDoor = y >= doorY && y < doorY + doorH;
      if (!inDoor) {
        this.set(divX, y, 'wall');
      }
    }
  }

  /** Build a horizontal room divider wall with a doorway */
  private buildHorizontalDivider(divY: number, doorX: number, doorW = 2, startX = 1, endX?: number): void {
    const ex = endX ?? this.gridWidth - 1;
    for (let x = startX; x < ex; x++) {
      const inDoor = x >= doorX && x < doorX + doorW;
      if (!inDoor) {
        this.set(x, divY, 'wall');
      }
    }
  }

  /** Create N rooms split by vertical dividers (below the orchestrator corridor) */
  private createMultipleRooms(configs: RoomConfig[]): Room[] {
    const n = configs.length;
    const numDividers = n - 1;
    const usableWidth = this.gridWidth - 2 - numDividers;
    const roomStartY = this.orchestratorSeparatorY + 1; // below separator
    const roomH = this.gridHeight - 1 - roomStartY;     // to bottom wall
    const doorY = roomStartY + Math.floor(roomH / 2) - 1;
    const doorH = 2;

    const widths: number[] = [];
    let remaining = usableWidth;
    for (let i = 0; i < n; i++) {
      if (i === n - 1) {
        widths.push(remaining);
      } else {
        const w = Math.max(3, Math.round(usableWidth * configs[i].widthFraction));
        widths.push(w);
        remaining -= w;
      }
    }

    const rooms: Room[] = [];
    let x = 1;
    for (let i = 0; i < n; i++) {
      const roomStartX = x;
      const roomWidth = widths[i];
      const room: Room = {
        id: i,
        name: configs[i].name,
        bounds: { x: roomStartX, y: roomStartY, w: roomWidth, h: roomH },
        doorways: [],
      };

      if (i > 0) {
        for (let j = 0; j < doorH; j++) {
          room.doorways.push({ x: roomStartX - 1, y: doorY + j });
        }
      }

      x = roomStartX + roomWidth;

      if (i < n - 1) {
        this.buildRoomDivider(x, doorY, doorH);
        for (let j = 0; j < doorH; j++) {
          room.doorways.push({ x, y: doorY + j });
        }
        x++;
      }

      rooms.push(room);
    }

    return rooms;
  }

  /* ── zone placement ──────────────────────────── */

  private addZone(type: ZoneType, pos: Position, roomId: number, facing: 'up' | 'down' | 'left' | 'right' = 'up'): void {
    if (pos.x < 1 || pos.x >= this.gridWidth - 1 || pos.y < 1 || pos.y >= this.gridHeight - 1) return;
    if (!this.tiles[pos.y][pos.x].walkable) return;
    this.zones.push({
      id: this.zones.length,
      type,
      position: pos,
      facingDirection: facing,
      roomId,
    });
  }

  /** Place desk+chair zone */
  private addDeskZone(dx: number, dy: number, roomId: number, type: ZoneType = 'desk'): boolean {
    if (dx + 1 >= this.gridWidth - 1 || dy + 1 >= this.gridHeight - 1) return false;
    if (dx < 1 || dy < 1) return false;
    if (!this.tiles[dy][dx].walkable || !this.tiles[dy][dx + 1].walkable) return false;
    if (!this.tiles[dy + 1][dx].walkable) return false;
    this.set(dx, dy, 'desk');
    this.set(dx + 1, dy, 'desk');
    const chair: Position = { x: dx, y: dy + 1 };
    this.tiles[chair.y][chair.x] = { type: 'chair', walkable: true };
    this.addZone(type, chair, roomId, 'up');
    return true;
  }

  /** Place a standing zone */
  private addStandingZone(type: ZoneType, pos: Position, roomId: number, facing: 'up' | 'down' | 'left' | 'right' = 'up'): boolean {
    if (pos.x < 1 || pos.x >= this.gridWidth - 1 || pos.y < 1 || pos.y >= this.gridHeight - 1) return false;
    if (!this.tiles[pos.y][pos.x].walkable) return false;
    this.addZone(type, pos, roomId, facing);
    return true;
  }

  /** Fill a room with desk zones in a grid pattern.
   *  When bottomHalfOnly=true, desks are placed only in the lower half of the room. */
  private fillDesksInRoom(room: Room, type: ZoneType, maxDesks: number, topMargin = 1, bottomHalfOnly = false): number {
    let placed = 0;
    const startX = room.bounds.x;
    const endX = startX + room.bounds.w;
    const midY = room.bounds.y + Math.floor(room.bounds.h / 2);
    const startY = bottomHalfOnly ? midY : room.bounds.y + topMargin;
    const endY = room.bounds.y + room.bounds.h;

    const cols = Math.max(1, Math.floor((endX - startX) / 3));
    const rows = Math.floor((endY - startY - 1) / 3);

    for (let row = 0; row < rows && placed < maxDesks; row++) {
      for (let col = 0; col < cols && placed < maxDesks; col++) {
        const dx = startX + col * 3;
        const dy = startY + row * 3;
        if (dx + 1 < endX && dy + 1 < endY) {
          if (this.addDeskZone(dx, dy, room.id, type)) placed++;
        }
      }
    }
    return placed;
  }

  /* ── office rooms: Planning Area → Dev Floor → Test Lab → Review Corner ── */

  private buildOfficeRooms(cfg: SizeConfig): void {
    const rooms = this.createMultipleRooms([
      { name: 'Planning Area', widthFraction: 0.20 },
      { name: 'Dev Floor', widthFraction: 0.35 },
      { name: 'Test Lab', widthFraction: 0.25 },
      { name: 'Review Corner', widthFraction: 0.20 },
    ]);
    const [planning, devFloor, testLab, review] = rooms;

    // Planning Area — whiteboard, planning boards
    const pEnd = planning.bounds.x + planning.bounds.w;
    for (let x = planning.bounds.x; x < Math.min(planning.bounds.x + 3, pEnd); x++) {
      this.tryPlace(x, 1, 'whiteboard');
    }
    this.addStandingZone('whiteboard_area', { x: planning.bounds.x, y: 2 }, planning.id, 'up');
    if (planning.bounds.w > 3) {
      this.addStandingZone('whiteboard_area', { x: planning.bounds.x + 2, y: 2 }, planning.id, 'up');
    }
    this.fillDesksInRoom(planning, 'planning_board', 4, 2);
    this.tryPlace(planning.bounds.x, this.gridHeight - 2, 'plant');
    this.tryPlace(pEnd - 1, 1, 'bookshelf');
    if (this.gridHeight > 13) this.tryPlace(pEnd - 1, 2, 'bookshelf');
    // Meeting table in Planning Area
    if (planning.bounds.w >= 4 && this.gridHeight > 10) {
      const mtX = planning.bounds.x;
      const mtY = this.gridHeight - 5;
      if (mtY > 3) {
        this.tryPlace(mtX, mtY, 'meeting_table');
        if (mtX + 1 < pEnd) this.tryPlace(mtX + 1, mtY, 'meeting_table');
        this.addStandingZone('planning_board', { x: mtX, y: mtY + 1 }, planning.id, 'up');
        if (mtX + 1 < pEnd) this.addStandingZone('planning_board', { x: mtX + 1, y: mtY + 1 }, planning.id, 'up');
      }
    }
    this.tryPlace(planning.bounds.x, this.gridHeight - 3, 'cabinet');

    // Dev Floor — coding desks (main work area)
    this.fillDesksInRoom(devFloor, 'coding_desk', Math.ceil(cfg.maxWorkstations * 0.5));
    this.tryPlace(devFloor.bounds.x, 1, 'plant');
    const dfEnd = devFloor.bounds.x + devFloor.bounds.w;
    this.tryPlace(dfEnd - 1, 1, 'plant');
    this.tryPlace(devFloor.bounds.x, this.gridHeight - 2, 'printer');
    this.tryPlace(dfEnd - 1, this.gridHeight - 2, 'cabinet');
    // Extra bookshelves
    this.tryPlace(devFloor.bounds.x + 1, 1, 'bookshelf');
    if (devFloor.bounds.w > 6) this.tryPlace(dfEnd - 2, 1, 'bookshelf');
    // Mini break nook in Dev Floor
    this.tryPlace(dfEnd - 1, this.gridHeight - 3, 'water_cooler');
    this.tryPlace(dfEnd - 2, this.gridHeight - 2, 'couch');
    // Plant in bottom corner
    if (devFloor.bounds.w > 5) this.tryPlace(devFloor.bounds.x + 2, this.gridHeight - 2, 'plant');

    // Test Lab — test stations, CI monitors
    this.fillDesksInRoom(testLab, 'test_station', Math.ceil(cfg.maxWorkstations * 0.25));
    this.addStandingZone('ci_monitor', { x: testLab.bounds.x, y: this.gridHeight - 3 }, testLab.id, 'up');
    if (testLab.bounds.w > 4) {
      this.addStandingZone('ci_monitor', { x: testLab.bounds.x + 3, y: this.gridHeight - 3 }, testLab.id, 'up');
    }
    this.tryPlace(testLab.bounds.x, 1, 'cabinet');
    const tlEnd = testLab.bounds.x + testLab.bounds.w;
    this.tryPlace(tlEnd - 1, this.gridHeight - 2, 'plant');
    // Extra furniture
    this.tryPlace(testLab.bounds.x + 1, 1, 'plant');
    this.tryPlace(tlEnd - 1, this.gridHeight - 3, 'printer');
    this.tryPlace(tlEnd - 1, 1, 'cabinet');

    // Review Corner — review desks, pair stations, break area
    this.fillDesksInRoom(review, 'review_desk', Math.ceil(cfg.maxWorkstations * 0.25));
    const rEnd = review.bounds.x + review.bounds.w;
    this.tryPlace(review.bounds.x, this.gridHeight - 3, 'coffee');
    if (review.bounds.w > 3) {
      this.tryPlace(review.bounds.x + 1, this.gridHeight - 3, 'water_cooler');
    }
    this.tryPlace(review.bounds.x, this.gridHeight - 4, 'couch');
    if (review.bounds.w > 4) this.tryPlace(review.bounds.x + 1, this.gridHeight - 4, 'couch');
    if (review.bounds.w > 5) this.tryPlace(review.bounds.x + 2, this.gridHeight - 4, 'couch');
    for (let x = review.bounds.x; x < Math.min(review.bounds.x + 3, rEnd); x++) {
      this.tryPlace(x, this.gridHeight - 2, 'rug');
    }
    this.addStandingZone('pair_station', { x: rEnd - 1, y: this.gridHeight - 3 }, review.id, 'left');
    this.tryPlace(rEnd - 1, 1, 'plant');
    // Extra bookshelves and plant
    this.tryPlace(review.bounds.x, 1, 'bookshelf');
    if (review.bounds.w > 3) this.tryPlace(review.bounds.x + 1, 1, 'bookshelf');
    this.tryPlace(rEnd - 2, this.gridHeight - 2, 'plant');
  }

  /* ── rocket rooms: Mission Planning → Assembly Floor → Launch Checks → Control Tower ── */

  private buildRocketRooms(cfg: SizeConfig): void {
    const rooms = this.createMultipleRooms([
      { name: 'Mission Planning', widthFraction: 0.20 },
      { name: 'Assembly Floor', widthFraction: 0.35 },
      { name: 'Launch Checks', widthFraction: 0.25 },
      { name: 'Control Tower', widthFraction: 0.20 },
    ]);
    const [planning, assembly, checks, control] = rooms;

    // Mission Planning — whiteboards, planning desks
    const mpEnd = planning.bounds.x + planning.bounds.w;
    for (let x = planning.bounds.x; x < Math.min(planning.bounds.x + 3, mpEnd); x++) {
      this.tryPlace(x, 1, 'whiteboard');
    }
    this.addStandingZone('planning_board', { x: planning.bounds.x, y: 2 }, planning.id, 'up');
    this.fillDesksInRoom(planning, 'control_panel', 4, 2);
    this.tryPlace(planning.bounds.x, this.gridHeight - 2, 'cabinet');

    // Assembly Floor — rocket, scaffolding, tool benches (agents build RIGHT NEXT to rocket)
    const aEnd = assembly.bounds.x + assembly.bounds.w;
    const topY = 2;
    const botY = this.gridHeight - 3;

    // Rocket in center-right of assembly
    const rocketX = aEnd - 3;
    if (rocketX > assembly.bounds.x + 2) {
      this.tryPlace(rocketX, topY, 'rocket_nose');
      this.tryPlace(rocketX + 1, topY, 'rocket_nose');
      for (let y = topY + 1; y < botY; y++) {
        this.tryPlace(rocketX, y, 'rocket_body');
        this.tryPlace(rocketX + 1, y, 'rocket_body');
      }
      this.tryPlace(rocketX, botY, 'rocket_engine');
      this.tryPlace(rocketX + 1, botY, 'rocket_engine');
      // Continuous scaffolding on LEFT side (every tile)
      for (let y = topY; y <= botY; y++) {
        this.tryPlace(rocketX - 1, y, 'scaffolding');
      }
      // Scaffolding on RIGHT side too
      if (rocketX + 2 < aEnd) {
        for (let y = topY; y <= botY; y++) {
          this.tryPlace(rocketX + 2, y, 'scaffolding');
        }
      }
      // Launch pad below
      for (let x = rocketX - 1; x <= rocketX + 2 && x < aEnd; x++) {
        this.tryPlace(x, botY + 1, 'launch_pad');
      }
      // Fuel tanks
      this.tryPlace(rocketX - 2, botY, 'fuel_tank');
      this.tryPlace(rocketX - 2, botY - 1, 'fuel_tank');
      // Agent zones DIRECTLY adjacent to rocket (facing toward it)
      this.addStandingZone('engine_bay', { x: rocketX - 2, y: botY }, assembly.id, 'right');
      this.addStandingZone('fuselage_work', { x: rocketX - 2, y: topY + 1 }, assembly.id, 'right');
      this.addStandingZone('fuselage_work', { x: rocketX - 2, y: topY + 3 }, assembly.id, 'right');
      if (botY - topY > 4) {
        this.addStandingZone('fuselage_work', { x: rocketX - 2, y: Math.floor((topY + botY) / 2) }, assembly.id, 'right');
      }
      this.addStandingZone('fuel_station', { x: rocketX - 3, y: botY - 1 }, assembly.id, 'right');
      // Tool bench zones near rocket base
      this.addStandingZone('tool_bench', { x: assembly.bounds.x, y: botY }, assembly.id, 'right');
      this.addStandingZone('tool_bench', { x: assembly.bounds.x + 1, y: topY + 1 }, assembly.id, 'right');
    }
    // Fewer distant desks — most agents work adjacent to rocket
    this.fillDesksInRoom(assembly, 'tool_bench', 2);
    this.tryPlace(assembly.bounds.x, 1, 'cabinet');
    this.tryPlace(assembly.bounds.x + 1, 1, 'cabinet');

    // Launch Checks — check stations, monitors, clipboard/inspection zones
    this.fillDesksInRoom(checks, 'launch_check', 4);
    this.addStandingZone('ci_monitor', { x: checks.bounds.x, y: this.gridHeight - 3 }, checks.id, 'up');
    if (checks.bounds.w > 4) {
      this.addStandingZone('ci_monitor', { x: checks.bounds.x + 3, y: this.gridHeight - 3 }, checks.id, 'up');
    }
    // Clipboard / inspection standing zones
    this.addStandingZone('launch_check', { x: checks.bounds.x, y: 2 }, checks.id, 'down');
    if (checks.bounds.w > 4) {
      this.addStandingZone('launch_check', { x: checks.bounds.x + 3, y: 2 }, checks.id, 'down');
    }
    this.tryPlace(checks.bounds.x, 1, 'cabinet');

    // Control Tower — control panels, comm equipment
    this.fillDesksInRoom(control, 'control_tower', 4);
    this.tryPlace(control.bounds.x, 1, 'comm_dish');
    this.addStandingZone('comms', { x: control.bounds.x + 1, y: 2 }, control.id, 'left');
    const ctEnd = control.bounds.x + control.bounds.w;
    this.tryPlace(ctEnd - 1, this.gridHeight - 2, 'cabinet');
  }

  /* ── space station rooms: Bridge → Science Lab → Engineering Bay → Comm Center ── */

  private buildSpaceStationRooms(cfg: SizeConfig): void {
    const rooms = this.createMultipleRooms([
      { name: 'Bridge', widthFraction: 0.20 },
      { name: 'Science Lab', widthFraction: 0.35 },
      { name: 'Engineering Bay', widthFraction: 0.25 },
      { name: 'Comm Center', widthFraction: 0.20 },
    ]);
    const [bridge, sciLab, engBay, commCenter] = rooms;

    // Bridge — viewscreen, bridge consoles
    const bEnd = bridge.bounds.x + bridge.bounds.w;
    for (let x = bridge.bounds.x; x < bEnd; x++) {
      this.tryPlace(x, 1, 'hull_window');
      this.tryPlace(x, 2, 'hull_window');
    }
    for (let y = 3; y < this.gridHeight - 2; y += 3) {
      this.tryPlace(1, y, 'hull_window');
    }
    this.fillDesksInRoom(bridge, 'bridge_console', 4, 3);
    this.tryPlace(bridge.bounds.x, this.gridHeight - 2, 'oxygen_tank');

    // Science Lab — lab consoles
    const slEnd = sciLab.bounds.x + sciLab.bounds.w;
    for (let x = sciLab.bounds.x; x < slEnd; x += 2) {
      this.tryPlace(x, 1, 'hull_window');
    }
    this.fillDesksInRoom(sciLab, 'science_lab', Math.ceil(cfg.maxWorkstations * 0.4));
    this.addStandingZone('engineering', { x: sciLab.bounds.x, y: this.gridHeight - 3 }, sciLab.id, 'up');
    this.tryPlace(slEnd - 1, this.gridHeight - 2, 'sleep_pod');
    this.tryPlace(sciLab.bounds.x, this.gridHeight - 2, 'sleep_pod');

    // Engineering Bay — test equipment
    const ebEnd = engBay.bounds.x + engBay.bounds.w;
    this.fillDesksInRoom(engBay, 'test_station', 4);
    this.addStandingZone('engineering', { x: engBay.bounds.x, y: this.gridHeight - 3 }, engBay.id, 'up');
    if (engBay.bounds.w > 4) {
      this.addStandingZone('engineering', { x: engBay.bounds.x + 3, y: this.gridHeight - 3 }, engBay.id, 'up');
    }
    this.tryPlace(ebEnd - 1, 1, 'oxygen_tank');
    this.tryPlace(engBay.bounds.x, 1, 'solar_panel');

    // Comm Center — comm stations, observation
    const ccEnd = commCenter.bounds.x + commCenter.bounds.w;
    for (let y = 2; y < this.gridHeight - 2; y += 3) {
      this.tryPlace(ccEnd - 1, y, 'hull_window');
    }
    this.tryPlace(commCenter.bounds.x, 1, 'comm_dish');
    this.addStandingZone('comms', { x: commCenter.bounds.x + 1, y: 2 }, commCenter.id, 'left');
    this.fillDesksInRoom(commCenter, 'review_desk', 3, 2);
    this.addStandingZone('observation', { x: ccEnd - 2, y: 3 }, commCenter.id, 'right');
    if (this.gridHeight > 13) {
      this.addStandingZone('observation', { x: ccEnd - 2, y: 6 }, commCenter.id, 'right');
    }
    this.tryPlace(ccEnd - 1, this.gridHeight - 2, 'satellite');
    this.tryPlace(commCenter.bounds.x, this.gridHeight - 2, 'solar_panel');
  }

  /* ── farm rooms: Planning Shed → Field Work → Harvest Check → Market Stand ── */

  private buildFarmRooms(cfg: SizeConfig): void {
    const rooms = this.createMultipleRooms([
      { name: 'Planning Shed', widthFraction: 0.20 },
      { name: 'Field Work', widthFraction: 0.35 },
      { name: 'Harvest Check', widthFraction: 0.25 },
      { name: 'Market Stand', widthFraction: 0.20 },
    ]);
    const [shed, field, harvest, market] = rooms;
    const midY = Math.floor(this.gridHeight / 2);

    // Planning Shed — workshop benches for planning
    const sEnd = shed.bounds.x + shed.bounds.w;
    this.fillDesksInRoom(shed, 'planning_board', 3);
    this.tryPlace(shed.bounds.x, 1, 'hay_bale');
    this.tryPlace(sEnd - 1, 1, 'hay_bale');
    this.tryPlace(shed.bounds.x, this.gridHeight - 2, 'tree');

    // Field Work — crops, tractors, animals
    const fEnd = field.bounds.x + field.bounds.w;
    for (let x = field.bounds.x; x < fEnd; x += 2) {
      for (let y = 2; y < midY; y++) {
        this.tryPlace(x, y, 'crop');
      }
    }
    for (let x = field.bounds.x + 1; x < fEnd; x += 3) {
      this.addStandingZone('crop_field', { x, y: 2 }, field.id, 'down');
    }
    this.tryPlace(field.bounds.x, midY, 'tractor');
    this.tryPlace(field.bounds.x + 1, midY, 'tractor');
    this.addStandingZone('tractor_seat', { x: field.bounds.x, y: midY + 1 }, field.id, 'up');
    if (field.bounds.w > 6) {
      this.tryPlace(field.bounds.x + 4, midY, 'tractor');
      this.tryPlace(field.bounds.x + 5, midY, 'tractor');
      this.addStandingZone('tractor_seat', { x: field.bounds.x + 4, y: midY + 1 }, field.id, 'up');
    }
    const animalY = midY + 2;
    if (animalY < this.gridHeight - 2) {
      this.tryPlace(field.bounds.x, animalY, 'cow');
      this.tryPlace(field.bounds.x + 2, animalY, 'sheep');
      this.tryPlace(field.bounds.x + 4, animalY, 'chicken');
      this.addStandingZone('animal_pen', { x: field.bounds.x + 1, y: animalY }, field.id, 'left');
      this.addStandingZone('animal_pen', { x: field.bounds.x + 3, y: animalY }, field.id, 'left');
    }
    if (animalY + 2 < this.gridHeight - 1) {
      this.tryPlace(field.bounds.x, animalY + 2, 'cow');
      this.tryPlace(field.bounds.x + 2, animalY + 2, 'sheep');
      this.addStandingZone('animal_pen', { x: field.bounds.x + 3, y: animalY + 2 }, field.id, 'left');
    }
    this.tryPlace(fEnd - 1, midY + 1, 'water_trough');
    this.addStandingZone('water_station', { x: fEnd - 1, y: midY + 2 }, field.id, 'up');

    // Harvest Check — checking stations
    const hEnd = harvest.bounds.x + harvest.bounds.w;
    this.fillDesksInRoom(harvest, 'harvest_check', 4);
    this.tryPlace(harvest.bounds.x, 1, 'hay_bale');
    this.tryPlace(hEnd - 1, 1, 'hay_bale');
    this.tryPlace(harvest.bounds.x, this.gridHeight - 2, 'water_trough');
    this.addStandingZone('water_station', { x: harvest.bounds.x + 1, y: this.gridHeight - 2 }, harvest.id, 'left');

    // Market Stand — review/trade stations
    const mEnd = market.bounds.x + market.bounds.w;
    this.fillDesksInRoom(market, 'market_stand', 3);
    this.tryPlace(mEnd - 1, 1, 'hay_bale');
    this.tryPlace(mEnd - 1, this.gridHeight - 2, 'tree');
    this.tryPlace(market.bounds.x, this.gridHeight - 2, 'hay_bale');
  }

  /* ── pirate ship rooms: Captain's Quarters → Main Deck → Crow's Nest → War Room ── */

  private buildPirateShipRooms(cfg: SizeConfig): void {
    const rooms = this.createMultipleRooms([
      { name: "Captain's Quarters", widthFraction: 0.20 },
      { name: 'Main Deck', widthFraction: 0.35 },
      { name: "Crow's Nest", widthFraction: 0.25 },
      { name: 'War Room', widthFraction: 0.20 },
    ]);
    const [captain, mainDeck, crows, warRoom] = rooms;

    // Ship hull along top and bottom interior borders
    for (let x = 1; x < this.gridWidth - 1; x++) {
      if (this.tiles[1][x].walkable) {
        this.tiles[1][x] = { type: 'ship_hull', walkable: false };
      }
      if (this.tiles[this.gridHeight - 2][x].walkable) {
        this.tiles[this.gridHeight - 2][x] = { type: 'ship_hull', walkable: false };
      }
    }

    // Convert divider walls to ship_hull
    for (let x = 2; x < this.gridWidth - 2; x++) {
      for (let y = 1; y < this.gridHeight - 1; y++) {
        if (this.tiles[y][x].type === 'wall') {
          this.tiles[y][x] = { type: 'ship_hull', walkable: false };
        }
      }
    }

    // Captain's Quarters — nav table, treasure
    const cEnd = captain.bounds.x + captain.bounds.w;
    this.addDeskZone(captain.bounds.x, 3, captain.id, 'nav_table');
    if (captain.bounds.w > 3) {
      this.addDeskZone(captain.bounds.x, 6, captain.id, 'nav_table');
    }
    this.addStandingZone('planning_board', { x: cEnd - 1, y: 3 }, captain.id, 'up');
    this.tryPlace(captain.bounds.x, this.gridHeight - 3, 'treasure_chest');
    this.tryPlace(captain.bounds.x, this.gridHeight - 4, 'barrel');

    // Main Deck — masts, sails, rigging, helm
    const mdEnd = mainDeck.bounds.x + mainDeck.bounds.w;
    const mastX = mainDeck.bounds.x + Math.floor(mainDeck.bounds.w / 2);

    // Main mast
    this.tryPlace(mastX, 2, 'crows_nest');
    this.tryPlace(mastX, 2, 'jolly_roger');
    for (let y = 3; y < this.gridHeight - 3; y++) {
      this.tryPlace(mastX, y, 'ship_mast');
    }
    if (mastX - 1 >= mainDeck.bounds.x) {
      this.tryPlace(mastX - 1, 3, 'ship_sail');
      if (this.gridHeight > 10) this.tryPlace(mastX - 1, 4, 'ship_sail');
    }
    if (mastX + 1 < mdEnd) {
      this.tryPlace(mastX + 1, 3, 'ship_sail');
      if (this.gridHeight > 10) this.tryPlace(mastX + 1, 4, 'ship_sail');
    }

    // Ship wheel (helm)
    this.tryPlace(mdEnd - 1, 2, 'ship_wheel');
    this.addStandingZone('helm', { x: mdEnd - 1, y: 3 }, mainDeck.id, 'up');

    // Rigging zones
    this.addStandingZone('rigging', { x: mastX - 2, y: this.gridHeight - 4 }, mainDeck.id, 'right');
    this.addStandingZone('rigging', { x: mastX + 2, y: this.gridHeight - 4 }, mainDeck.id, 'left');
    this.addStandingZone('rigging', { x: mainDeck.bounds.x, y: 4 }, mainDeck.id, 'right');

    // Barrel cluster
    this.tryPlace(mainDeck.bounds.x, this.gridHeight - 3, 'barrel');
    this.tryPlace(mainDeck.bounds.x + 1, this.gridHeight - 3, 'barrel');

    // Crow's Nest — lookout, cannons
    const cnEnd = crows.bounds.x + crows.bounds.w;
    for (let x = crows.bounds.x; x < cnEnd; x += 2) {
      this.tryPlace(x, 2, 'cannon');
      this.addStandingZone('cannon_post', { x, y: 3 }, crows.id, 'up');
    }
    this.addStandingZone('lookout', { x: crows.bounds.x, y: this.gridHeight - 3 }, crows.id, 'up');
    if (crows.bounds.w > 3) {
      this.addStandingZone('lookout', { x: crows.bounds.x + 3, y: this.gridHeight - 3 }, crows.id, 'up');
    }
    this.tryPlace(cnEnd - 1, this.gridHeight - 3, 'barrel');
    this.tryPlace(cnEnd - 1, this.gridHeight - 4, 'barrel');

    // War Room — nav tables, cargo
    const wrEnd = warRoom.bounds.x + warRoom.bounds.w;
    this.addDeskZone(warRoom.bounds.x, 3, warRoom.id, 'war_room');
    if (warRoom.bounds.w > 3) {
      this.addDeskZone(warRoom.bounds.x, 6, warRoom.id, 'war_room');
    }
    this.addStandingZone('cargo_hold', { x: wrEnd - 1, y: this.gridHeight - 3 }, warRoom.id, 'up');
    this.tryPlace(wrEnd - 1, this.gridHeight - 4, 'barrel');
    this.tryPlace(warRoom.bounds.x, this.gridHeight - 3, 'barrel');
    this.tryPlace(warRoom.bounds.x, this.gridHeight - 4, 'treasure_chest');
  }

  /* ── hospital rooms: Diagnosis Room → Treatment Lab → Testing Wing → Pharmacy Review ── */

  private buildHospitalRooms(cfg: SizeConfig): void {
    const rooms = this.createMultipleRooms([
      { name: 'Diagnosis Room', widthFraction: 0.20 },
      { name: 'Treatment Lab', widthFraction: 0.35 },
      { name: 'Testing Wing', widthFraction: 0.25 },
      { name: 'Pharmacy Review', widthFraction: 0.20 },
    ]);
    const [diagnosis, treatment, testing, pharmacy] = rooms;

    // Diagnosis — xray, patient stations
    const dEnd = diagnosis.bounds.x + diagnosis.bounds.w;
    this.tryPlace(diagnosis.bounds.x, 1, 'xray_machine');
    this.tryPlace(diagnosis.bounds.x, 2, 'xray_machine');
    this.addStandingZone('surgery_room', { x: diagnosis.bounds.x + 1, y: 2 }, diagnosis.id, 'left');
    this.fillDesksInRoom(diagnosis, 'patient_station', 3, 3);
    this.tryPlace(diagnosis.bounds.x, this.gridHeight - 2, 'sink');
    this.tryPlace(dEnd - 1, 1, 'med_cabinet');

    // Treatment Lab — lab benches, patient beds
    const tEnd = treatment.bounds.x + treatment.bounds.w;
    this.tryPlace(treatment.bounds.x, 1, 'hospital_bed');
    this.tryPlace(treatment.bounds.x + 1, 1, 'hospital_bed');
    if (treatment.bounds.w > 5) {
      this.tryPlace(treatment.bounds.x + 3, 1, 'curtain');
      this.tryPlace(treatment.bounds.x + 4, 1, 'hospital_bed');
    }
    this.fillDesksInRoom(treatment, 'lab_bench', Math.ceil(cfg.maxWorkstations * 0.4));
    this.tryPlace(treatment.bounds.x, this.gridHeight - 2, 'sink');
    this.tryPlace(tEnd - 1, this.gridHeight - 2, 'sink');

    // Testing Wing — test benches
    const teEnd = testing.bounds.x + testing.bounds.w;
    this.fillDesksInRoom(testing, 'testing_bench', 4);
    this.tryPlace(testing.bounds.x, 1, 'med_cabinet');
    this.tryPlace(teEnd - 1, 1, 'med_cabinet');
    this.addStandingZone('ci_monitor', { x: testing.bounds.x, y: this.gridHeight - 3 }, testing.id, 'up');

    // Pharmacy Review — pharmacy shelves, review stations
    const pEnd = pharmacy.bounds.x + pharmacy.bounds.w;
    for (let y = 2; y < this.gridHeight - 2; y += 2) {
      this.tryPlace(pEnd - 1, y, 'med_cabinet');
    }
    this.addStandingZone('pharmacy', { x: pEnd - 2, y: 3 }, pharmacy.id, 'right');
    this.addStandingZone('pharmacy_review', { x: pEnd - 2, y: 6 }, pharmacy.id, 'right');
    this.fillDesksInRoom(pharmacy, 'review_desk', 3);
    this.tryPlace(pharmacy.bounds.x, this.gridHeight - 2, 'plant');
  }

  /* ── kanban rooms: one room per stage ───────── */

  private buildKanbanRooms(cfg: SizeConfig, stages: StageConfig[]): void {
    // Build orchestrator corridor at top
    this.buildOrchestratorCorridor(this.currentEnv);

    const configs: RoomConfig[] = stages.map(s => ({
      name: s.name,
      widthFraction: 1 / stages.length,
    }));
    const rooms = this.createMultipleRooms(configs);
    for (const r of rooms) this.rooms.push(r);
    for (let i = 0; i < rooms.length; i++) {
      rooms[i].kanbanStageName = stages[i].name;
      this.populateRoomByStyle(rooms[i], stages[i].buildingStyle ?? 'office', cfg);
    }
  }

  private populateRoomByStyle(room: Room, _style: BuildingStyle, _cfg: SizeConfig): void {
    const rEnd = room.bounds.x + room.bounds.w;
    const rBot = room.bounds.y + room.bounds.h;
    const midY = room.bounds.y + Math.floor(room.bounds.h / 2);

    // Standing zones in the bottom half, starting from midpoint + 1 downward,
    // with 1 empty row between each row of agents for spacing.
    const maxZones = Math.max(3, Math.min(6, room.bounds.w * 2));
    let placed = 0;
    for (let y = midY + 1; y < rBot && placed < maxZones; y += 2) {
      for (let x = room.bounds.x; x < rEnd && placed < maxZones; x++) {
        if (this.tiles[y][x].walkable) {
          this.addStandingZone('common_area', { x, y }, room.id, 'down');
          placed++;
        }
      }
    }
  }

  /* ── town rooms: RPG-style outdoor layout with buildings ── */

  private readonly ROOF_COLORS: TileType[] = ['building_roof_red', 'building_roof_blue', 'building_roof_brown', 'building_roof_green'];

  private buildTownRooms(cfg: SizeConfig, stages: StageConfig[]): void {
    const n = stages.length;
    if (n === 0) return;

    const W = this.gridWidth;
    const H = this.gridHeight;
    const sepY = this.orchestratorSeparatorY;
    const townStartY = sepY + 1; // town area starts below separator

    // Fill with grass (entire grid first — orchestrator will be overwritten)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        this.tiles[y][x] = { type: 'grass', walkable: true };
      }
    }

    // Hedge border (1 tile thick)
    for (let x = 0; x < W; x++) {
      this.tiles[0][x] = { type: 'town_hedge', walkable: false };
      this.tiles[H - 1][x] = { type: 'town_hedge', walkable: false };
    }
    for (let y = 0; y < H; y++) {
      this.tiles[y][0] = { type: 'town_hedge', walkable: false };
      this.tiles[y][W - 1] = { type: 'town_hedge', walkable: false };
    }

    // Build orchestrator corridor at top
    this.buildOrchestratorCorridor('town');

    const midX = Math.floor(W / 2);
    // Center main street in the town area (below orchestrator)
    const townH = H - townStartY - 1; // available town height (above bottom hedge)
    const roadY = townStartY + Math.floor(townH / 2);

    // ── Main street: 1-tile road + cobblestone sidewalks ──
    for (let x = 1; x < W - 1; x++) {
      this.tiles[roadY][x] = { type: 'road', walkable: true };
      // Cobblestone sidewalks (one row each side)
      if (roadY - 1 >= townStartY) this.tiles[roadY - 1][x] = { type: 'cobblestone', walkable: true };
      if (roadY + 1 < H - 1) this.tiles[roadY + 1][x] = { type: 'cobblestone', walkable: true };
    }

    this.spawnPoint = { x: 1, y: roadY };

    // ── Town Square — small plaza at center ──
    const plazaR = 2;
    for (let dy = -plazaR; dy <= plazaR; dy++) {
      for (let dx = -plazaR; dx <= plazaR; dx++) {
        const py = roadY + dy;
        const px = midX + dx;
        if (py >= townStartY && py < H - 1 && px >= 1 && px < W - 1) {
          if (this.tiles[py][px].type === 'grass') {
            this.tiles[py][px] = { type: 'cobblestone', walkable: true };
          }
        }
      }
    }

    // Fountain at center of road
    this.tiles[roadY][midX] = { type: 'fountain', walkable: false };

    // ── Register Town Square as idle/common area room ──
    const squareRoomId = 0; // will be room 0, buildings start after
    const squareRoom: Room = {
      id: squareRoomId,
      name: 'Town Square',
      bounds: { x: midX - plazaR, y: roadY - plazaR, w: plazaR * 2 + 1, h: plazaR * 2 + 2 },
      doorways: [],
    };
    this.rooms.push(squareRoom);

    // Town square standing zones (8 zones for idle agents to roam)
    this.addStandingZone('common_area', { x: midX - 1, y: roadY - 1 }, squareRoomId, 'down');
    this.addStandingZone('common_area', { x: midX + 1, y: roadY - 1 }, squareRoomId, 'down');
    this.addStandingZone('common_area', { x: midX - 1, y: roadY + 1 }, squareRoomId, 'up');
    this.addStandingZone('common_area', { x: midX + 1, y: roadY + 1 }, squareRoomId, 'up');
    this.addStandingZone('common_area', { x: midX - 2, y: roadY }, squareRoomId, 'right');
    this.addStandingZone('common_area', { x: midX + 2, y: roadY }, squareRoomId, 'left');
    this.addStandingZone('common_area', { x: midX - 2, y: roadY - 1 }, squareRoomId, 'right');
    this.addStandingZone('common_area', { x: midX + 2, y: roadY + 1 }, squareRoomId, 'left');

    // ── Building Placement — top row and bottom row along main street ──
    const topCount = Math.ceil(n / 2);
    const bottomCount = n - topCount;

    const topStartY = townStartY;      // buildings start below orchestrator separator
    const topH = roadY - topStartY;    // buildings extend to sidewalk (overwrite cobblestone)
    const botStartY = roadY + 1;       // start at sidewalk (overwrite cobblestone)
    const botH = H - 1 - botStartY;   // up to hedge edge

    const buildMargin = 1; // reduced margin from hedges for bigger buildings
    const availW = W - 2 * buildMargin;

    let stageIdx = 0; // index into stages array
    stageIdx = this.placeTownRow(buildMargin, topStartY, availW, topH, stages, stageIdx, topCount, roadY, 'top');
    stageIdx = this.placeTownRow(buildMargin, botStartY, availW, botH, stages, stageIdx, bottomCount, roadY, 'bottom');

    // Town decorations
    this.placeTownDecorRPG(midX, roadY);
  }

  private placeTownRow(
    startX: number, startY: number, totalW: number, rowH: number,
    stages: StageConfig[], startStageIdx: number, count: number,
    roadY: number, side: 'top' | 'bottom',
  ): number {
    if (count === 0 || rowH < 3) return startStageIdx;

    const gap = 2;
    const bw = Math.max(5, Math.floor((totalW - gap * Math.max(0, count - 1)) / count));
    const bh = Math.max(3, rowH);

    for (let i = 0; i < count; i++) {
      const stageI = startStageIdx + i;
      if (stageI >= stages.length) break;

      const bx = startX + i * (bw + gap);
      if (bx + bw > this.gridWidth - 1) continue;

      // Room index = stageI + 1 because room 0 is Town Square
      this.createRPGBuilding(bx, startY, bw, bh, stages[stageI], stageI + 1, roadY, side);
    }
    return startStageIdx + count;
  }

  private createRPGBuilding(
    bx: number, by: number, bw: number, bh: number,
    stage: StageConfig, roomIndex: number, roadY: number, side: 'top' | 'bottom',
  ): void {
    // Clamp
    if (bx + bw > this.gridWidth - 1) bw = this.gridWidth - 1 - bx;
    if (by + bh > this.gridHeight - 1) bh = this.gridHeight - 1 - by;
    if (bw < 3 || bh < 3) return;

    const roofColor = this.getRoofType(stage.buildingStyle ?? 'office', roomIndex);

    // ── Place tiles — flat top-down building (no windows, just roof + walls + interior + door) ──
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const relY = y - by;

        if (side === 'top') {
          // Top-side: roof at top, door wall at bottom
          if (relY === 0) {
            this.tiles[y][x] = { type: roofColor, walkable: false };
          } else if (relY === bh - 1) {
            // Front wall (door placed separately below)
            this.tiles[y][x] = { type: 'building_wall', walkable: false };
          } else {
            // Interior or side walls
            if (x === bx || x === bx + bw - 1) {
              this.tiles[y][x] = { type: 'building_wall', walkable: false };
            } else {
              this.tiles[y][x] = { type: 'building_floor', walkable: true };
            }
          }
        } else {
          // Bottom-side: door wall at top, roof at bottom
          if (relY === bh - 1) {
            this.tiles[y][x] = { type: roofColor, walkable: false };
          } else if (relY === 0) {
            // Front wall (door placed separately below)
            this.tiles[y][x] = { type: 'building_wall', walkable: false };
          } else {
            // Interior or side walls
            if (x === bx || x === bx + bw - 1) {
              this.tiles[y][x] = { type: 'building_wall', walkable: false };
            } else {
              this.tiles[y][x] = { type: 'building_floor', walkable: true };
            }
          }
        }
      }
    }

    // ── Door (centered on front wall facing road) — top row only ──
    const doorX = bx + Math.floor(bw / 2);
    const doorways: Position[] = [];

    if (side === 'top') {
      const doorWallY = by + bh - 1;
      this.tiles[doorWallY][doorX] = { type: 'building_door', walkable: true };
      doorways.push({ x: doorX, y: doorWallY });
      // Short pathway from door to sidewalk
      for (let py = doorWallY + 1; py < roadY; py++) {
        if (this.tiles[py][doorX].type === 'grass') {
          this.tiles[py][doorX] = { type: 'pathway', walkable: true };
        }
      }
      // Signpost next to entrance
      const signX = doorX + 1;
      const signY = by + bh;
      if (signY < this.gridHeight - 1 && signX < this.gridWidth - 1) {
        const t = this.tiles[signY][signX].type;
        if (t === 'grass' || t === 'cobblestone' || t === 'pathway') {
          this.tiles[signY][signX] = { type: 'signpost', walkable: false };
        }
      }
    } else {
      // Bottom row: door on top wall (facing road)
      const doorWallY = by;
      this.tiles[doorWallY][doorX] = { type: 'building_door', walkable: true };
      doorways.push({ x: doorX, y: doorWallY });
      // Short pathway from door to sidewalk
      for (let py = doorWallY - 1; py > roadY; py--) {
        if (this.tiles[py][doorX].type === 'grass') {
          this.tiles[py][doorX] = { type: 'pathway', walkable: true };
        }
      }
    }

    // ── Register room — interior bounds (no window rows) ──
    const intStartRow = 1;           // row after roof (top) or door wall (bottom)
    const intEndRow = bh - 1;        // row before door wall (top) or roof (bottom)
    const interiorY = by + intStartRow;
    const interiorH = Math.max(1, intEndRow - intStartRow);
    const room: Room = {
      id: roomIndex,
      name: stage.name,
      kanbanStageName: stage.name,
      roofY: side === 'top' ? by : by + bh - 1,
      bounds: { x: bx + 1, y: interiorY, w: bw - 2, h: interiorH },
      doorways,
    };
    this.rooms.push(room);

    // Populate interior with zones — all rooms use bottom-half
    this.populateRPGBuilding(room, stage.buildingStyle ?? 'office');
  }

  private getTownBuildingName(stage: StageConfig): string {
    switch (stage.buildingStyle) {
      case 'tavern': return 'Tavern';
      case 'workshop': return 'Workshop';
      case 'lab': return 'Library';
      case 'office': return 'Town Hall';
      case 'warehouse': return 'General Store';
      case 'depot': return 'Trading Post';
      default: return stage.name;
    }
  }

  private getRoofType(style: BuildingStyle, idx: number): TileType {
    switch (style) {
      case 'tavern': return 'building_roof_brown';
      case 'workshop': return 'building_roof_red';
      case 'lab': return 'building_roof_blue';
      case 'warehouse': return 'building_roof_green';
      case 'depot': return 'building_roof_brown';
      default: return this.ROOF_COLORS[idx % this.ROOF_COLORS.length];
    }
  }

  private populateRPGBuilding(room: Room, _style: BuildingStyle): void {
    const rEnd = room.bounds.x + room.bounds.w;
    const rBottom = room.bounds.y + room.bounds.h;
    const midY = room.bounds.y + Math.floor(room.bounds.h / 2);

    // Standing zones in the bottom half, starting from midpoint + 1 downward,
    // with 1 empty row between each row of agents for spacing.
    const maxZones = Math.max(3, Math.min(6, room.bounds.w * 2));
    let placed = 0;
    for (let y = midY + 1; y < rBottom && placed < maxZones; y += 2) {
      for (let x = room.bounds.x; x < rEnd && placed < maxZones; x++) {
        if (this.tiles[y][x].walkable) {
          this.addStandingZone('common_area', { x, y }, room.id, 'down');
          placed++;
        }
      }
    }
  }

  private tryPlaceOnFloor(x: number, y: number, type: TileType): void {
    if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
      const t = this.tiles[y][x].type;
      if (t === 'building_floor' || t === 'floor') {
        this.tiles[y][x] = { type, walkable: false };
      }
    }
  }

  private placeTownDecorRPG(midX: number, roadY: number): void {
    const W = this.gridWidth;
    const H = this.gridHeight;

    // Lampposts along the road (top side only)
    for (let x = 4; x < W - 4; x += 6) {
      if (roadY - 1 >= 1 && this.tiles[roadY - 1][x].type === 'cobblestone') {
        this.tiles[roadY - 1][x] = { type: 'lamppost', walkable: false };
      }
    }

    // Benches near the plaza (top side only)
    const benchSpots = [
      { x: midX - 3, y: roadY - 1, face: 'down' as const },
      { x: midX + 3, y: roadY - 1, face: 'down' as const },
    ];
    for (const spot of benchSpots) {
      if (spot.x >= 1 && spot.x < W - 1 && spot.y >= 1 && spot.y < H - 1) {
        const t = this.tiles[spot.y][spot.x].type;
        if (t === 'grass' || t === 'cobblestone') {
          this.tiles[spot.y][spot.x] = { type: 'bench', walkable: false };
          // Zone next to bench
          const zoneX = spot.x + 1;
          if (zoneX < W - 1 && this.tiles[spot.y][zoneX].walkable) {
            this.addStandingZone('town_bench_zone', { x: zoneX, y: spot.y }, 0, spot.face);
          }
        }
      }
    }

    // Well on one side of the road
    const wellX = midX + 4;
    const wellY = roadY - 1;
    if (wellX < W - 2 && wellY >= 1 && this.tiles[wellY][wellX].type === 'cobblestone') {
      this.tiles[wellY][wellX] = { type: 'well', walkable: false };
    }

    // Market stalls on sidewalks (top side only)
    const stallPositions = [
      { x: midX + 5, y: roadY - 1 },
    ];
    for (const pos of stallPositions) {
      if (pos.x >= 1 && pos.x < W - 1 && pos.y >= 1 && pos.y < H - 1) {
        const t = this.tiles[pos.y][pos.x].type;
        if (t === 'grass' || t === 'cobblestone') {
          this.tiles[pos.y][pos.x] = { type: 'market_stall', walkable: false };
          // Zone in front of stall
          const zoneX = pos.x + 1;
          if (zoneX < W - 1 && this.tiles[pos.y][zoneX].walkable) {
            this.addStandingZone('shop_counter', { x: zoneX, y: pos.y }, 0, 'left');
          }
        }
      }
    }

    // Trees scattered on grass (top half only — above road)
    for (let y = 1; y < roadY; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (this.tiles[y][x].type === 'grass') {
          const hash = (x * 31 + y * 17) % 100;
          if (hash < 3) {
            this.tiles[y][x] = { type: 'town_tree', walkable: false };
          } else if (hash >= 3 && hash < 5) {
            this.tiles[y][x] = { type: 'flower_bed', walkable: false };
          }
        }
      }
    }

    // Fence segments near hedge corners (top only)
    const fenceSpots = [
      { x: 2, y: 1 }, { x: W - 3, y: 1 },
    ];
    for (const spot of fenceSpots) {
      if (this.tiles[spot.y][spot.x].type === 'grass') {
        this.tiles[spot.y][spot.x] = { type: 'fence', walkable: false };
      }
    }
  }

  /* ── shared helpers ──────────────────────────── */

  private set(x: number, y: number, type: TileType): void {
    if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
      this.tiles[y][x] = { type, walkable: false };
    }
  }

  private tryPlace(x: number, y: number, type: TileType): void {
    if (x >= 1 && x < this.gridWidth - 1 && y >= 1 && y < this.gridHeight - 1) {
      const existing = this.tiles[y][x].type;
      if (existing === 'floor' || existing === 'building_floor') {
        this.tiles[y][x] = { type, walkable: false };
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return false;
    return this.tiles[y][x].walkable;
  }

  getAvailableZone(preferredType?: ZoneType): ActivityZone | null {
    if (preferredType) {
      const preferred = this.zones.find(z => z.type === preferredType && !z.assignedAgentId);
      if (preferred) return preferred;
    }
    return this.zones.find(z => !z.assignedAgentId) ?? null;
  }

  /** @deprecated Use getAvailableZone instead */
  getAvailableWorkstation(): ActivityZone | null {
    return this.getAvailableZone();
  }

  assignZone(zoneId: number, agentId: string): void {
    const z = this.zones.find(z => z.id === zoneId);
    if (z) z.assignedAgentId = agentId;
  }

  /** @deprecated Use assignZone instead */
  assignWorkstation(wsId: number, agentId: string): void {
    this.assignZone(wsId, agentId);
  }

  freeZone(agentId: string): void {
    const z = this.zones.find(z => z.assignedAgentId === agentId);
    if (z) z.assignedAgentId = undefined;
  }

  /** @deprecated Use freeZone instead */
  freeWorkstation(agentId: string): void {
    this.freeZone(agentId);
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
