import type { ActivityZone, EnvironmentId, OfficeSize, Position, Room, Tile, TileType, ThemeId, ZoneType } from './types';
import { SIZE_CONFIGS, type SizeConfig } from './themes';

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

  constructor(size: OfficeSize = 'small', theme: ThemeId = 'hybrid', env: EnvironmentId = 'office') {
    this.rebuild(size, theme, env);
  }

  rebuild(size: OfficeSize, theme: ThemeId, env: EnvironmentId = 'office'): void {
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

    switch (env) {
      case 'rocket':        this.buildRocketRooms(cfg); break;
      case 'space_station': this.buildSpaceStationRooms(cfg); break;
      case 'farm':          this.buildFarmRooms(cfg); break;
      case 'pirate_ship':   this.buildPirateShipRooms(cfg); break;
      case 'hospital':      this.buildHospitalRooms(cfg); break;
      default:              this.buildOfficeRooms(cfg, theme); break;
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

  /** Build a vertical room divider wall with a doorway */
  private buildRoomDivider(divX: number, doorY: number, doorH = 2): void {
    for (let y = 1; y < this.gridHeight - 1; y++) {
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

  /** Create two rooms split by a vertical divider */
  private createTwoRooms(
    room1Name: string, room2Name: string, splitRatio = 0.6,
  ): { divX: number; doorY: number; room1: Room; room2: Room } {
    const divX = Math.floor(this.gridWidth * splitRatio);
    const doorY = Math.floor(this.gridHeight / 2) - 1;
    const doorH = 2;

    this.buildRoomDivider(divX, doorY, doorH);

    const room1: Room = {
      id: 0,
      name: room1Name,
      bounds: { x: 1, y: 1, w: divX - 1, h: this.gridHeight - 2 },
      doorways: Array.from({ length: doorH }, (_, i) => ({ x: divX, y: doorY + i })),
    };
    const room2: Room = {
      id: 1,
      name: room2Name,
      bounds: { x: divX + 1, y: 1, w: this.gridWidth - divX - 2, h: this.gridHeight - 2 },
      doorways: Array.from({ length: doorH }, (_, i) => ({ x: divX, y: doorY + i })),
    };

    this.rooms = [room1, room2];
    return { divX, doorY, room1, room2 };
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

  /** Place desk+chair zone (classic workstation style) */
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

  /** Place a standing zone (agent stands at a position near an object) */
  private addStandingZone(type: ZoneType, pos: Position, roomId: number, facing: 'up' | 'down' | 'left' | 'right' = 'up'): boolean {
    if (pos.x < 1 || pos.x >= this.gridWidth - 1 || pos.y < 1 || pos.y >= this.gridHeight - 1) return false;
    if (!this.tiles[pos.y][pos.x].walkable) return false;
    this.addZone(type, pos, roomId, facing);
    return true;
  }

  /* ── office rooms ────────────────────────────── */

  private buildOfficeRooms(cfg: SizeConfig, theme: ThemeId): void {
    const { divX, room1, room2 } = this.createTwoRooms('Open Office', 'Meeting Room', 0.55);

    // Room 1: Open office — packed desks with tight 3-tile column spacing
    let placed = 0;
    const maxDesks = Math.ceil(cfg.maxWorkstations * 0.65);
    const cols = Math.max(1, Math.floor((divX - 3) / 3));
    const maxRows = Math.floor((this.gridHeight - 4) / 3);
    for (let row = 0; row < maxRows && placed < maxDesks; row++) {
      for (let col = 0; col < cols && placed < maxDesks; col++) {
        const dx = 2 + col * 3;
        const dy = 2 + row * 3;
        if (dx + 1 < divX - 1 && dy + 1 < this.gridHeight - 1) {
          if (this.addDeskZone(dx, dy, room1.id)) placed++;
        }
      }
    }

    // Room 1 decor — plants & printer along edges
    this.tryPlace(1, 1, 'plant');
    this.tryPlace(divX - 2, 1, 'plant');
    this.tryPlace(1, this.gridHeight - 2, 'plant');
    this.tryPlace(divX - 2, this.gridHeight - 2, 'printer');

    // Room 2: Meeting Room — couches, coffee table, whiteboard, plants
    const rx = divX + 2;
    const rw = this.gridWidth - divX - 3;
    const endX = this.gridWidth - 2;

    // Whiteboard along top wall
    for (let x = rx; x <= Math.min(rx + 2, endX); x++) {
      this.tryPlace(x, 1, 'whiteboard');
    }
    this.addStandingZone('whiteboard_area', { x: rx, y: 2 }, room2.id, 'up');
    this.addStandingZone('whiteboard_area', { x: rx + 2, y: 2 }, room2.id, 'up');

    // Central meeting area: couches around coffee table
    const mtCenterY = Math.floor(this.gridHeight / 2);
    // Coffee table
    this.tryPlace(rx + 1, mtCenterY - 1, 'meeting_table');
    this.tryPlace(rx + 1, mtCenterY, 'meeting_table');
    if (rw > 4) {
      this.tryPlace(rx + 2, mtCenterY - 1, 'meeting_table');
      this.tryPlace(rx + 2, mtCenterY, 'meeting_table');
    }
    // Couches on left and right of table
    this.tryPlace(rx, mtCenterY - 1, 'couch');
    this.tryPlace(rx, mtCenterY, 'couch');
    if (rw > 5) {
      this.tryPlace(rx + 3, mtCenterY - 1, 'couch');
      this.tryPlace(rx + 3, mtCenterY, 'couch');
    }
    // Meeting zones
    this.addStandingZone('meeting', { x: rx, y: mtCenterY + 1 }, room2.id, 'up');
    this.addStandingZone('meeting', { x: rx + 2, y: mtCenterY + 1 }, room2.id, 'up');
    if (rw > 5) this.addStandingZone('meeting', { x: rx + 3, y: mtCenterY - 2 }, room2.id, 'down');

    // Break area (bottom) — coffee, water cooler, rug
    this.tryPlace(rx, this.gridHeight - 3, 'coffee');
    this.tryPlace(rx + 1, this.gridHeight - 3, 'water_cooler');
    this.tryPlace(rx, this.gridHeight - 4, 'couch');
    if (rw > 4) this.tryPlace(rx + 1, this.gridHeight - 4, 'couch');
    // Rug under break area
    for (let x = rx; x <= Math.min(rx + 2, endX); x++) {
      this.tryPlace(x, this.gridHeight - 2, 'rug');
    }
    this.addStandingZone('break_area', { x: rx + 2, y: this.gridHeight - 3 }, room2.id, 'left');

    // Plants scattered in meeting room
    this.tryPlace(endX, 1, 'plant');
    this.tryPlace(endX, this.gridHeight - 2, 'plant');
    this.tryPlace(endX, mtCenterY, 'plant');
    if (rw > 4) this.tryPlace(rx + Math.floor(rw / 2), 1, 'plant');

    // Bookshelf along right wall
    this.tryPlace(endX, 3, 'bookshelf');
    this.tryPlace(endX, 4, 'bookshelf');

    // Additional desks in room 2 for overflow (only if needed)
    const r2Desks = cfg.maxWorkstations - placed;
    let r2Placed = 0;
    for (let col = 0; col < Math.floor(rw / 4) && r2Placed < r2Desks; col++) {
      const dx = rx + col * 4;
      const dy = 4;
      if (dx + 1 < endX && dy + 1 < mtCenterY - 2) {
        if (this.addDeskZone(dx, dy, room2.id)) r2Placed++;
      }
    }
  }

  /* ── rocket rooms: Mission Control (left) + Assembly Hangar (right with rocket) ── */

  private buildRocketRooms(cfg: SizeConfig): void {
    const { divX, room1, room2 } = this.createTwoRooms('Mission Control', 'Assembly Hangar', 0.45);

    // Room 1 (LEFT): Mission Control — packed with consoles/desks
    const cols = Math.max(1, Math.floor((divX - 3) / 3));
    const rows = Math.floor((this.gridHeight - 4) / 3);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = 2 + col * 3;
        const dy = 2 + row * 3;
        if (dx + 1 < divX - 1 && dy + 1 < this.gridHeight - 1) {
          this.addDeskZone(dx, dy, room1.id, 'control_panel');
        }
      }
    }

    // Mission control decor
    this.tryPlace(1, 1, 'whiteboard');
    this.tryPlace(2, 1, 'whiteboard');
    this.tryPlace(1, this.gridHeight - 2, 'cabinet');
    this.tryPlace(2, this.gridHeight - 2, 'cabinet');

    // Room 2 (RIGHT): Assembly Hangar — rocket on the right side, work zones around it
    const rx = divX + 2;
    const rw = this.gridWidth - divX - 3;
    const endX = this.gridWidth - 2;
    const topY = 2;
    const botY = this.gridHeight - 3;

    // Rocket on the RIGHT wall
    const rocketX = endX - 2;
    this.tryPlace(rocketX, topY, 'rocket_nose');
    this.tryPlace(rocketX + 1, topY, 'rocket_nose');
    for (let y = topY + 1; y < botY; y++) {
      this.tryPlace(rocketX, y, 'rocket_body');
      this.tryPlace(rocketX + 1, y, 'rocket_body');
    }
    this.tryPlace(rocketX, botY, 'rocket_engine');
    this.tryPlace(rocketX + 1, botY, 'rocket_engine');

    // Scaffolding left of rocket
    for (let y = topY; y <= botY; y += 2) {
      this.tryPlace(rocketX - 1, y, 'scaffolding');
    }

    // Launch pad under rocket
    for (let x = rocketX - 1; x <= rocketX + 1; x++) {
      this.tryPlace(x, botY + 1, 'launch_pad');
    }

    // Fuel tanks near bottom
    this.tryPlace(rocketX - 2, botY, 'fuel_tank');
    this.tryPlace(rocketX - 2, botY - 1, 'fuel_tank');
    this.tryPlace(rocketX - 2, botY - 2, 'fuel_tank');

    // Engine bay zones (near rocket engines)
    this.addStandingZone('engine_bay', { x: rocketX - 3, y: botY }, room2.id, 'right');
    this.addStandingZone('engine_bay', { x: rocketX - 3, y: botY - 2 }, room2.id, 'right');

    // Fuselage work zones (near rocket body)
    this.addStandingZone('fuselage_work', { x: rocketX - 3, y: topY + 2 }, room2.id, 'right');
    this.addStandingZone('fuselage_work', { x: rocketX - 3, y: topY + 4 }, room2.id, 'right');

    // Fuel station zone
    this.addStandingZone('fuel_station', { x: rocketX - 3, y: botY - 4 }, room2.id, 'right');

    // Tool benches in the left portion of hangar
    const benchX = rx;
    for (let row = 0; row < 3; row++) {
      const by = 2 + row * 3;
      if (by + 1 < this.gridHeight - 1 && benchX + 1 < rocketX - 2) {
        this.addDeskZone(benchX, by, room2.id, 'tool_bench');
      }
    }
    // Second column of benches for wider hangars
    if (rw > 8) {
      const bx2 = benchX + 3;
      for (let row = 0; row < 2; row++) {
        const by = 2 + row * 3;
        if (by + 1 < this.gridHeight - 1 && bx2 + 1 < rocketX - 2) {
          this.addDeskZone(bx2, by, room2.id, 'tool_bench');
        }
      }
    }

    // Scaffolding & equipment along top
    this.tryPlace(rx, 1, 'cabinet');
    this.tryPlace(rx + 1, 1, 'cabinet');
  }

  /* ── space station rooms: Bridge + Science Deck ── */

  private buildSpaceStationRooms(cfg: SizeConfig): void {
    const { divX, room1, room2 } = this.createTwoRooms('Bridge', 'Science Deck', 0.55);

    // Room 1: Bridge
    // GIANT VIEWSCREEN along the entire top wall of the bridge (3 rows tall)
    for (let x = 2; x < divX; x++) {
      this.tryPlace(x, 1, 'hull_window');
      this.tryPlace(x, 2, 'hull_window');
    }

    // Bridge consoles facing the viewscreen — packed tight
    const frontY = 4;
    const bridgeCols = Math.max(1, Math.floor((divX - 3) / 3));
    for (let col = 0; col < bridgeCols; col++) {
      const dx = 2 + col * 3;
      if (dx + 1 < divX - 1 && frontY + 1 < this.gridHeight - 1) {
        this.addDeskZone(dx, frontY, room1.id, 'bridge_console');
      }
    }

    // More consoles rows
    const midRows = Math.floor((this.gridHeight - frontY - 4) / 3);
    for (let row = 0; row < midRows; row++) {
      const rowY = frontY + 3 + row * 3;
      if (rowY + 1 >= this.gridHeight - 2) break;
      for (let col = 0; col < bridgeCols; col++) {
        const dx = 2 + col * 3;
        if (dx + 1 < divX - 1) {
          this.addDeskZone(dx, rowY, room1.id, 'bridge_console');
        }
      }
    }

    // Comms station
    this.tryPlace(1, this.gridHeight - 3, 'comm_dish');
    this.addStandingZone('comms', { x: 2, y: this.gridHeight - 3 }, room1.id, 'left');

    // Bridge decor
    this.tryPlace(1, this.gridHeight - 2, 'oxygen_tank');

    // Hull windows along left wall
    for (let y = 3; y < this.gridHeight - 2; y += 3) {
      this.tryPlace(1, y, 'hull_window');
    }

    // Room 2: Science Deck
    const rx = divX + 2;
    const rw = this.gridWidth - divX - 3;
    const endX = this.gridWidth - 2;

    // Hull windows along right wall & top
    for (let y = 2; y < this.gridHeight - 2; y += 3) {
      this.tryPlace(endX, y, 'hull_window');
    }
    for (let x = divX + 2; x < endX; x += 2) {
      this.tryPlace(x, 1, 'hull_window');
    }

    // Science lab consoles — tight spacing
    const labCols = Math.max(1, Math.floor(rw / 3));
    for (let col = 0; col < labCols; col++) {
      const dx = rx + col * 3;
      if (dx + 1 < endX) {
        this.addDeskZone(dx, 3, room2.id, 'science_lab');
      }
    }

    // Engineering zones
    this.addStandingZone('engineering', { x: rx, y: 6 }, room2.id, 'up');
    if (rw > 4) this.addStandingZone('engineering', { x: rx + 3, y: 6 }, room2.id, 'up');

    // Observation (near hull windows on right)
    this.addStandingZone('observation', { x: endX - 1, y: 3 }, room2.id, 'right');
    if (this.gridHeight > 13) this.addStandingZone('observation', { x: endX - 1, y: 6 }, room2.id, 'right');

    // More science stations for larger sizes
    const sciRows = Math.floor((this.gridHeight - 8) / 3);
    for (let row = 0; row < sciRows; row++) {
      const dy = 7 + row * 3;
      if (dy + 1 < this.gridHeight - 2) {
        for (let col = 0; col < Math.min(labCols, 2); col++) {
          const dx = rx + col * 3;
          if (dx + 1 < endX) {
            this.addDeskZone(dx, dy, room2.id, 'science_lab');
          }
        }
      }
    }

    // Decor
    this.tryPlace(endX, 1, 'oxygen_tank');
    this.tryPlace(rx, this.gridHeight - 2, 'sleep_pod');
    this.tryPlace(rx + 1, this.gridHeight - 2, 'sleep_pod');
    this.tryPlace(endX, this.gridHeight - 2, 'solar_panel');
    this.tryPlace(endX - 1, this.gridHeight - 2, 'satellite');
  }

  /* ── farm rooms: Field & Pasture + Barn Workshop ── */

  private buildFarmRooms(cfg: SizeConfig): void {
    const { divX, room1, room2 } = this.createTwoRooms('Field & Pasture', 'Barn', 0.6);

    // Room 1: Field & Pasture — open field with tractors, animals, crops
    const midY = Math.floor(this.gridHeight / 2);

    // Dense crop fields (upper area) — every other tile
    for (let x = 2; x < divX - 1; x += 2) {
      for (let y = 2; y < midY; y++) {
        this.tryPlace(x, y, 'crop');
      }
    }

    // Crop field work zones between rows
    for (let x = 3; x < divX - 1; x += 3) {
      this.addStandingZone('crop_field', { x, y: 2 }, room1.id, 'down');
    }

    // Tractors at mid-height
    const tractorY = midY;
    this.tryPlace(2, tractorY, 'tractor');
    this.tryPlace(3, tractorY, 'tractor');
    this.addStandingZone('tractor_seat', { x: 2, y: tractorY + 1 }, room1.id, 'up');
    if (divX > 8) {
      this.tryPlace(6, tractorY, 'tractor');
      this.tryPlace(7, tractorY, 'tractor');
      this.addStandingZone('tractor_seat', { x: 6, y: tractorY + 1 }, room1.id, 'up');
    }
    if (divX > 14) {
      this.tryPlace(10, tractorY, 'tractor');
      this.tryPlace(11, tractorY, 'tractor');
      this.addStandingZone('tractor_seat', { x: 10, y: tractorY + 1 }, room1.id, 'up');
    }

    // Animals packed below tractors
    const animalY = midY + 2;
    if (animalY < this.gridHeight - 2) {
      this.tryPlace(2, animalY, 'cow');
      this.tryPlace(4, animalY, 'sheep');
      this.tryPlace(6, animalY, 'chicken');
      this.addStandingZone('animal_pen', { x: 3, y: animalY }, room1.id, 'left');
      this.addStandingZone('animal_pen', { x: 5, y: animalY }, room1.id, 'left');
    }
    if (animalY + 2 < this.gridHeight - 1) {
      this.tryPlace(2, animalY + 2, 'cow');
      this.tryPlace(4, animalY + 2, 'sheep');
      if (divX > 8) this.tryPlace(6, animalY + 2, 'chicken');
      this.addStandingZone('animal_pen', { x: 5, y: animalY + 2 }, room1.id, 'left');
    }
    if (divX > 10 && animalY < this.gridHeight - 2) {
      this.tryPlace(8, animalY, 'cow');
      this.tryPlace(10, animalY, 'sheep');
      this.addStandingZone('animal_pen', { x: 9, y: animalY }, room1.id, 'left');
    }

    // Water trough
    this.tryPlace(divX - 2, midY + 1, 'water_trough');
    this.addStandingZone('water_station', { x: divX - 2, y: midY + 2 }, room1.id, 'up');

    // Trees as border accents
    this.tryPlace(1, 1, 'tree');
    this.tryPlace(1, this.gridHeight - 2, 'tree');

    // Room 2: Barn — workshop, animals inside, hay storage
    const rx = divX + 2;
    const rw = this.gridWidth - divX - 3;
    const endX = this.gridWidth - 2;

    // Hay bales along top wall
    for (let x = rx; x <= Math.min(rx + 2, endX); x++) {
      this.tryPlace(x, 1, 'hay_bale');
    }

    // Barn workshop benches
    const barnCols = Math.max(1, Math.floor(rw / 4));
    for (let col = 0; col < barnCols; col++) {
      const dx = rx + col * 4;
      if (dx + 1 < endX && 3 + 1 < this.gridHeight - 1) {
        this.addDeskZone(dx, 3, room2.id, 'barn_workshop');
      }
    }

    // Water station in barn
    this.tryPlace(rx, midY, 'water_trough');
    if (rx + 1 <= endX) this.tryPlace(rx + 1, midY, 'water_trough');
    this.addStandingZone('water_station', { x: Math.min(rx + 2, endX), y: midY }, room2.id, 'left');

    // Animals inside barn
    this.tryPlace(endX, 2, 'cow');
    if (endX > rx + 1) this.tryPlace(endX, 4, 'sheep');
    if (endX - 1 > rx) this.tryPlace(endX - 1, 3, 'chicken');

    // More workshop zones below
    for (let row = 0; row < 2; row++) {
      const dy = midY + 2 + row * 3;
      if (dy + 1 < this.gridHeight - 1 && rx + 1 < endX) {
        this.addDeskZone(rx, dy, room2.id, 'barn_workshop');
      }
    }

    this.tryPlace(endX, this.gridHeight - 2, 'tree');
  }

  /* ── pirate ship rooms: Main Deck + Gun Deck / Cargo ── */

  private buildPirateShipRooms(cfg: SizeConfig): void {
    const midY = Math.floor(this.gridHeight / 2);

    // Ship hull (outer walls restyled)
    for (let x = 2; x < this.gridWidth - 2; x++) {
      this.tryPlace(x, this.gridHeight - 2, 'ship_hull');
    }
    for (let y = 2; y < this.gridHeight - 2; y++) {
      this.tryPlace(1, y, 'ship_hull');
      this.tryPlace(this.gridWidth - 2, y, 'ship_hull');
    }
    this.tryPlace(2, 2, 'ship_hull');
    for (let x = 3; x < this.gridWidth - 2; x++) {
      this.tryPlace(x, 1, 'ship_hull');
    }

    // Horizontal divider (deck separator)
    const deckDivY = midY;
    const hatchX = Math.floor(this.gridWidth / 2) - 1;
    this.buildHorizontalDivider(deckDivY, hatchX, 2, 2, this.gridWidth - 1);
    // Override divider tiles with ship hull visual
    for (let x = 2; x < this.gridWidth - 2; x++) {
      if (this.tiles[deckDivY][x].type === 'wall') {
        this.tiles[deckDivY][x] = { type: 'ship_hull', walkable: false };
      }
    }
    // Make hatch walkable
    this.tiles[deckDivY][hatchX] = { type: 'plank', walkable: true };
    this.tiles[deckDivY][hatchX + 1] = { type: 'plank', walkable: true };

    const room1: Room = {
      id: 0, name: 'Main Deck',
      bounds: { x: 2, y: 2, w: this.gridWidth - 4, h: deckDivY - 2 },
      doorways: [{ x: hatchX, y: deckDivY }, { x: hatchX + 1, y: deckDivY }],
    };
    const room2: Room = {
      id: 1, name: 'Gun Deck',
      bounds: { x: 2, y: deckDivY + 1, w: this.gridWidth - 4, h: this.gridHeight - deckDivY - 3 },
      doorways: [{ x: hatchX, y: deckDivY }, { x: hatchX + 1, y: deckDivY }],
    };
    this.rooms = [room1, room2];

    // Room 1: Main Deck — diverse stations
    const mainMastX = Math.floor(this.gridWidth / 2);

    // Main mast + sails
    this.tryPlace(mainMastX, 2, 'crows_nest');
    for (let y = 3; y < deckDivY - 1; y++) {
      this.tryPlace(mainMastX, y, 'ship_mast');
    }
    this.tryPlace(mainMastX - 1, 3, 'ship_sail');
    this.tryPlace(mainMastX + 1, 3, 'ship_sail');
    if (deckDivY > 5) {
      this.tryPlace(mainMastX - 1, 4, 'ship_sail');
      this.tryPlace(mainMastX + 1, 4, 'ship_sail');
    }

    // Fore mast
    if (mainMastX - 5 > 2) {
      const foreX = mainMastX - 5;
      for (let y = 3; y < deckDivY - 1; y++) {
        this.tryPlace(foreX, y, 'ship_mast');
      }
      this.tryPlace(foreX - 1, 3, 'ship_sail');
      this.tryPlace(foreX + 1, 3, 'ship_sail');
    }

    // Ship wheel at stern (helm zone)
    this.tryPlace(this.gridWidth - 4, 2, 'ship_wheel');
    this.addStandingZone('helm', { x: this.gridWidth - 4, y: 3 }, room1.id, 'up');

    // Jolly Roger
    this.tryPlace(mainMastX, 2, 'jolly_roger');

    // Navigation table (near bow)
    this.addDeskZone(3, 3, room1.id, 'nav_table');

    // Rigging zones (near masts)
    this.addStandingZone('rigging', { x: mainMastX - 2, y: deckDivY - 2 }, room1.id, 'right');
    this.addStandingZone('rigging', { x: mainMastX + 2, y: deckDivY - 2 }, room1.id, 'left');
    if (mainMastX - 5 > 3) {
      this.addStandingZone('rigging', { x: mainMastX - 4, y: deckDivY - 2 }, room1.id, 'right');
    }

    // Treasure chest & anchor
    this.tryPlace(this.gridWidth - 5, 2, 'treasure_chest');
    this.tryPlace(3, 2, 'anchor');

    // Barrel cluster on deck
    this.tryPlace(this.gridWidth - 5, deckDivY - 2, 'barrel');
    this.tryPlace(this.gridWidth - 6, deckDivY - 2, 'barrel');

    // Additional nav tables for larger ships
    if (this.gridWidth > 26) {
      this.addDeskZone(7, 3, room1.id, 'nav_table');
    }

    // Room 2: Gun Deck / Cargo — cannons, cargo, workbenches
    const lowerY = deckDivY + 1;
    const lowerH = this.gridHeight - deckDivY - 3;

    // Cannons along both sides with gunner zones
    for (let x = 3; x < this.gridWidth - 4; x += 2) {
      if (lowerY < this.gridHeight - 2) {
        this.tryPlace(x, lowerY, 'cannon');
        if (lowerY + 1 < this.gridHeight - 2) {
          this.addStandingZone('cannon_post', { x, y: lowerY + 1 }, room2.id, 'up');
        }
      }
    }

    // Cargo area with barrels in bottom section
    if (lowerH > 3) {
      const cargoY = this.gridHeight - 4;
      for (let x = 3; x < this.gridWidth - 4; x += 2) {
        this.tryPlace(x, cargoY, 'barrel');
      }
      this.addStandingZone('cargo_hold', { x: 4, y: this.gridHeight - 3 }, room2.id, 'up');
      this.addStandingZone('cargo_hold', { x: 7, y: this.gridHeight - 3 }, room2.id, 'up');
      if (this.gridWidth > 16) {
        this.addStandingZone('cargo_hold', { x: 10, y: this.gridHeight - 3 }, room2.id, 'up');
      }
    }

    // Carpenter/repair benches on gun deck
    if (lowerH > 4) {
      const benchY = lowerY + 2;
      if (benchY + 1 < this.gridHeight - 2) {
        this.addDeskZone(this.gridWidth - 7, benchY, room2.id, 'nav_table');
      }
      if (benchY + 1 < this.gridHeight - 2 && this.gridWidth > 20) {
        this.addDeskZone(this.gridWidth - 11, benchY, room2.id, 'nav_table');
      }
    }
  }

  /* ── hospital rooms: Research Lab + Pharmacy & Treatment ── */

  private buildHospitalRooms(cfg: SizeConfig): void {
    const { divX, room1, room2 } = this.createTwoRooms('Research Lab', 'Pharmacy & Treatment', 0.55);

    // Room 1: Research Lab — lab benches, experiments, microscopes
    const midY = Math.floor(this.gridHeight / 2);

    // Lab benches — tight grid (the core of the research environment)
    const labCols = Math.max(1, Math.floor((divX - 3) / 3));
    const labRows = Math.floor((this.gridHeight - 4) / 3);
    for (let row = 0; row < labRows; row++) {
      for (let col = 0; col < labCols; col++) {
        const dx = 2 + col * 3;
        const dy = 2 + row * 3;
        if (dx + 1 < divX - 1 && dy + 1 < this.gridHeight - 1) {
          this.addDeskZone(dx, dy, room1.id, 'lab_bench');
        }
      }
    }

    // X-ray / imaging equipment in corner
    this.tryPlace(1, 1, 'xray_machine');
    this.tryPlace(1, 2, 'xray_machine');
    this.addStandingZone('surgery_room', { x: 2, y: 2 }, room1.id, 'left');

    // Med cabinets (supplies)
    this.tryPlace(divX - 2, 1, 'med_cabinet');
    this.tryPlace(divX - 2, 2, 'med_cabinet');

    // Sink at bottom
    this.tryPlace(1, this.gridHeight - 2, 'sink');
    this.tryPlace(2, this.gridHeight - 2, 'sink');

    // Room 2: Pharmacy & Treatment
    const rx = divX + 2;
    const rw = this.gridWidth - divX - 3;
    const endX = this.gridWidth - 2;

    // Pharmacy shelves along the right wall (top to bottom)
    for (let y = 2; y < this.gridHeight - 2; y += 2) {
      this.tryPlace(endX, y, 'med_cabinet');
    }
    // Pharmacy zones
    this.addStandingZone('pharmacy', { x: endX - 1, y: 3 }, room2.id, 'right');
    this.addStandingZone('pharmacy', { x: endX - 1, y: 6 }, room2.id, 'right');

    // Patient beds (treatment area along top)
    this.tryPlace(rx, 2, 'hospital_bed');
    this.tryPlace(rx + 1, 2, 'hospital_bed');
    this.tryPlace(rx + 2, 2, 'curtain');
    this.addStandingZone('patient_station', { x: rx, y: 3 }, room2.id, 'up');

    if (rw > 6) {
      this.tryPlace(rx + 4, 2, 'hospital_bed');
      this.tryPlace(rx + 5, 2, 'hospital_bed');
      this.tryPlace(rx + 6, 2, 'curtain');
      this.addStandingZone('patient_station', { x: rx + 4, y: 3 }, room2.id, 'up');
    }

    // Reception desk in middle
    const recY = midY;
    if (rx + 1 < endX && recY + 1 < this.gridHeight - 1) {
      this.addDeskZone(rx, recY, room2.id, 'reception');
    }

    // More lab benches for experiments
    const expY = midY + 3;
    if (rx + 1 < endX && expY + 1 < this.gridHeight - 1) {
      this.addDeskZone(rx, expY, room2.id, 'lab_bench');
    }
    if (rw > 6 && rx + 4 + 1 < endX && expY + 1 < this.gridHeight - 1) {
      this.addDeskZone(rx + 4, expY, room2.id, 'lab_bench');
    }

    // Decor
    this.tryPlace(rx, this.gridHeight - 2, 'sink');
    this.tryPlace(endX, this.gridHeight - 2, 'plant');
    this.tryPlace(rx + Math.floor(rw / 2), 1, 'med_cabinet');
  }

  /* ── shared helpers ──────────────────────────── */

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
