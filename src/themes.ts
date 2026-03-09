import type { EnvironmentId, OfficeSize } from './types';

export interface ThemeColors {
  bg: string;
  floor: string;
  floorAlt: string;
  floorGrid: string;
  wall: string;
  wallTop: string;
  wallBorder: string;
  deskTop: string;
  deskEdge: string;
  deskLeg: string;
  monitor: string;
  screenOn: string;
  screenOff: string;
  chairSeat: string;
  chairBack: string;
  plantLeaf: string;
  plantLeafAlt: string;
  plantPot: string;
  bookshelf: string;
  books: string[];
  coffee: string;
  couch: string;
  whiteboard: string;
  cabinet: string;
  printer: string;
  meetingTable: string;
  meetingTableEdge: string;
  rug: string;
  waterCooler: string;
  waterCoolerWater: string;
}

/* ── office sub-themes ─────────────────────────── */

export const THEMES: Record<string, ThemeColors> = {
  casual: {
    bg: '#1a1520', floor: '#C4A882', floorAlt: '#BFA07A', floorGrid: '#B09872',
    wall: '#8B7355', wallTop: '#A0896A', wallBorder: '#7A6345',
    deskTop: '#B8956A', deskEdge: '#8B6914', deskLeg: '#A07850',
    monitor: '#2C3E50', screenOn: '#7ED321', screenOff: '#1A2530',
    chairSeat: '#E67E22', chairBack: '#D35400',
    plantLeaf: '#27AE60', plantLeafAlt: '#2ECC71', plantPot: '#C0392B',
    bookshelf: '#8B4513', books: ['#E74C3C','#3498DB','#F39C12','#9B59B6','#1ABC9C'],
    coffee: '#5D4037', couch: '#9B59B6', whiteboard: '#ECF0F1',
    cabinet: '#A0896A', printer: '#BDC3C7',
    meetingTable: '#B8956A', meetingTableEdge: '#8B6914',
    rug: '#E8D5B7', waterCooler: '#ECF0F1', waterCoolerWater: '#74B9FF',
  },
  business: {
    bg: '#0F1923', floor: '#8890A0', floorAlt: '#828A98', floorGrid: '#7880A0',
    wall: '#3D4F5F', wallTop: '#4D5F6F', wallBorder: '#2D3F4F',
    deskTop: '#5C5C6C', deskEdge: '#3C3C4C', deskLeg: '#4C4C5C',
    monitor: '#1C2C3C', screenOn: '#4A90D9', screenOff: '#1A2530',
    chairSeat: '#2C3E50', chairBack: '#1A2530',
    plantLeaf: '#558B6E', plantLeafAlt: '#4A7D5E', plantPot: '#5C5C5C',
    bookshelf: '#3C3C4C', books: ['#4A90D9','#34495E','#95A5A6','#2980B9','#7F8C8D'],
    coffee: '#4A4A4A', couch: '#34495E', whiteboard: '#ECF0F1',
    cabinet: '#6C6C7C', printer: '#E0E0E0',
    meetingTable: '#4C4C5C', meetingTableEdge: '#3C3C4C',
    rug: '#6C7C8C', waterCooler: '#D0D0D0', waterCoolerWater: '#74B9FF',
  },
  hybrid: {
    bg: '#1a1a2e', floor: '#D4C5A0', floorAlt: '#CFC09A', floorGrid: '#C0B090',
    wall: '#556677', wallTop: '#7B8D9E', wallBorder: '#445566',
    deskTop: '#A0896A', deskEdge: '#6B5335', deskLeg: '#8B7355',
    monitor: '#2C3E50', screenOn: '#44AACC', screenOff: '#1A2530',
    chairSeat: '#8B6243', chairBack: '#6B4423',
    plantLeaf: '#27AE60', plantLeafAlt: '#2ECC71', plantPot: '#8B6243',
    bookshelf: '#6B4423', books: ['#E74C3C','#3498DB','#F39C12','#27AE60','#9B59B6'],
    coffee: '#5D4037', couch: '#6B4423', whiteboard: '#ECF0F1',
    cabinet: '#7B8D9E', printer: '#BDC3C7',
    meetingTable: '#A0896A', meetingTableEdge: '#6B5335',
    rug: '#BEB09A', waterCooler: '#D0D0D0', waterCoolerWater: '#74B9FF',
  },
};

/* ── environment palettes ──────────────────────── */

export const ENV_COLORS: Record<string, ThemeColors> = {
  office: THEMES.hybrid,
  rocket: {
    bg: '#08082A', floor: '#6A7080', floorAlt: '#626870', floorGrid: '#5A6068',
    wall: '#4A5060', wallTop: '#5A6878', wallBorder: '#3A4050',
    deskTop: '#6A7A8A', deskEdge: '#4A5A6A', deskLeg: '#5A6A7A',
    monitor: '#1A2A3A', screenOn: '#44FF88', screenOff: '#0A1A1A',
    chairSeat: '#5A6A7A', chairBack: '#4A5A6A',
    plantLeaf: '#3A7A4A', plantLeafAlt: '#4A8A5A', plantPot: '#5A5A5A',
    bookshelf: '#4A5A6A', books: ['#E74C3C','#F39C12','#ECF0F1','#3498DB','#95A5A6'],
    coffee: '#4A4A4A', couch: '#4A5A6A', whiteboard: '#B0BEC5',
    cabinet: '#5A6A7A', printer: '#7A8A9A',
    meetingTable: '#5A6A7A', meetingTableEdge: '#4A5A6A',
    rug: '#5A6068', waterCooler: '#8A9AAA', waterCoolerWater: '#74B9FF',
  },
  space_station: {
    bg: '#030310', floor: '#2A3545', floorAlt: '#253040', floorGrid: '#1E2A38',
    wall: '#1A2535', wallTop: '#2A3A4A', wallBorder: '#101A28',
    deskTop: '#2A3A4A', deskEdge: '#1A2535', deskLeg: '#253040',
    monitor: '#0A1520', screenOn: '#44AAFF', screenOff: '#050A10',
    chairSeat: '#2A3545', chairBack: '#1A2535',
    plantLeaf: '#2A6A4A', plantLeafAlt: '#3A7A5A', plantPot: '#3A3A4A',
    bookshelf: '#1A2535', books: ['#4488FF','#44AAFF','#2266CC','#6699FF','#88BBFF'],
    coffee: '#3A3A4A', couch: '#2A3545', whiteboard: '#8A9AAA',
    cabinet: '#2A3545', printer: '#4A5A6A',
    meetingTable: '#2A3A4A', meetingTableEdge: '#1A2535',
    rug: '#253040', waterCooler: '#4A5A6A', waterCoolerWater: '#44AAFF',
  },
  farm: {
    bg: '#0A1A10', floor: '#5B8C3B', floorAlt: '#538234', floorGrid: '#4A7A2E',
    wall: '#8B6914', wallTop: '#9B7924', wallBorder: '#7A5A0A',
    deskTop: '#A08050', deskEdge: '#806030', deskLeg: '#705020',
    monitor: '#5A4020', screenOn: '#A0D060', screenOff: '#3A2A10',
    chairSeat: '#8B6914', chairBack: '#7A5A0A',
    plantLeaf: '#3A8A2A', plantLeafAlt: '#4A9A3A', plantPot: '#6B4423',
    bookshelf: '#6B4423', books: ['#8B6914','#A08050','#6B4423','#C0A060','#B09040'],
    coffee: '#5A4030', couch: '#8B6914', whiteboard: '#C0B090',
    cabinet: '#7A5A0A', printer: '#A08050',
    meetingTable: '#8B7040', meetingTableEdge: '#6B5020',
    rug: '#7A9A50', waterCooler: '#A0B0C0', waterCoolerWater: '#5ABAFF',
  },
  hospital: {
    bg: '#0A1018', floor: '#C0D0C8', floorAlt: '#B0C0B8', floorGrid: '#A0B0A8',
    wall: '#7A9AB8', wallTop: '#8AAAC8', wallBorder: '#6A8AA8',
    deskTop: '#C8D0D8', deskEdge: '#A0A8B0', deskLeg: '#B0B8C0',
    monitor: '#2A3A4A', screenOn: '#00BCD4', screenOff: '#1A2530',
    chairSeat: '#4A7A9A', chairBack: '#3A6A8A',
    plantLeaf: '#4A9A6A', plantLeafAlt: '#5AAA7A', plantPot: '#8A8A8A',
    bookshelf: '#A0A8B0', books: ['#E74C3C','#3498DB','#ECF0F1','#00BCD4','#FFFFFF'],
    coffee: '#6A6A6A', couch: '#4A7A9A', whiteboard: '#ECF0F1',
    cabinet: '#D0D8E0', printer: '#E0E0E0',
    meetingTable: '#B0B8C0', meetingTableEdge: '#8A9AAA',
    rug: '#B0C8B8', waterCooler: '#D0D8E0', waterCoolerWater: '#74B9FF',
  },
  pirate_ship: {
    bg: '#061020', floor: '#8B6914', floorAlt: '#7A5A0A', floorGrid: '#6A4A00',
    wall: '#5A3A1A', wallTop: '#6B4423', wallBorder: '#4A2A0A',
    deskTop: '#8B7040', deskEdge: '#6B5020', deskLeg: '#5A4010',
    monitor: '#3A2A1A', screenOn: '#FFCC00', screenOff: '#2A1A0A',
    chairSeat: '#6B4423', chairBack: '#5A3A1A',
    plantLeaf: '#2A6A3A', plantLeafAlt: '#3A7A4A', plantPot: '#5A3A1A',
    bookshelf: '#5A3A1A', books: ['#CC3333','#FFCC00','#ECF0F1','#1ABC9C','#8B6914'],
    coffee: '#4A3020', couch: '#6B4423', whiteboard: '#C0B090',
    cabinet: '#5A3A1A', printer: '#7A5A3A',
    meetingTable: '#6B4423', meetingTableEdge: '#5A3A1A',
    rug: '#7A6A50', waterCooler: '#6A6A7A', waterCoolerWater: '#4488CC',
  },
  town: {
    bg: '#0B1A12', floor: '#6B8A4A', floorAlt: '#5F7E42', floorGrid: '#557838',
    wall: '#8B7355', wallTop: '#A0896A', wallBorder: '#7A6345',
    deskTop: '#A0896A', deskEdge: '#7A6345', deskLeg: '#5C4A32',
    monitor: '#3A3A4A', screenOn: '#4ADE80', screenOff: '#1A2A15',
    chairSeat: '#7A6345', chairBack: '#6B5535',
    plantLeaf: '#4A7A2A', plantLeafAlt: '#3A6A1A', plantPot: '#6B4423',
    bookshelf: '#7A6345', books: ['#C0392B','#2980B9','#27AE60','#F39C12','#8E44AD'],
    coffee: '#4A3520', couch: '#6B5535', whiteboard: '#D0C8B0',
    cabinet: '#7A6345', printer: '#5A5A5A',
    meetingTable: '#8B7355', meetingTableEdge: '#6B5535',
    rug: '#8B7355', waterCooler: '#4A6A8A', waterCoolerWater: '#6ABFEF',
  },
};

/* ── size configs ──────────────────────────────── */

export interface SizeConfig {
  width: number;
  height: number;
  maxWorkstations: number;
  deskStartX: number;
  deskColSpacing: number;
  deskRowSpacing: number;
  deskStartY: number;
  deskCols: number;
}

/** Height added at top of grid for orchestrator/manager corridor */
export const ORCHESTRATOR_ROWS = 2;

export const SIZE_CONFIGS: Record<OfficeSize, SizeConfig> = {
  small:  { width: 24, height: 13 + ORCHESTRATOR_ROWS, maxWorkstations: 10, deskStartX: 3, deskColSpacing: 5, deskRowSpacing: 4, deskStartY: 2, deskCols: 4 },
  medium: { width: 30, height: 16 + ORCHESTRATOR_ROWS, maxWorkstations: 18, deskStartX: 3, deskColSpacing: 5, deskRowSpacing: 4, deskStartY: 2, deskCols: 4 },
  large:  { width: 38, height: 20 + ORCHESTRATOR_ROWS, maxWorkstations: 28, deskStartX: 3, deskColSpacing: 5, deskRowSpacing: 4, deskStartY: 2, deskCols: 6 },
  wide:   { width: 46, height: 18 + ORCHESTRATOR_ROWS, maxWorkstations: 32, deskStartX: 3, deskColSpacing: 5, deskRowSpacing: 4, deskStartY: 2, deskCols: 8 },
  xl:     { width: 54, height: 22 + ORCHESTRATOR_ROWS, maxWorkstations: 40, deskStartX: 3, deskColSpacing: 5, deskRowSpacing: 4, deskStartY: 2, deskCols: 10 },
};

/* ── auto-size helper ─────────────────────────── */

/** Pick the grid size that best fills the container.
 *  With fractional scaling, prefers larger grids that use more of the
 *  container area while maintaining a minimum scale of 1.5× for readability.
 *  Falls back to agent-count heuristic otherwise. */
export function getAutoSize(agentCount: number, containerW?: number, containerH?: number, tileSize = 16): OfficeSize {
  // If container dimensions provided, pick the size that fills the most area
  if (containerW && containerH) {
    const sizes: OfficeSize[] = ['small', 'medium', 'large', 'wide', 'xl'];
    let best: OfficeSize = 'small';
    let bestScore = 0;
    for (const size of sizes) {
      const cfg = SIZE_CONFIGS[size];
      if (agentCount > cfg.maxWorkstations) continue;
      const worldW = cfg.width * tileSize;
      const worldH = cfg.height * tileSize;
      // Fractional scale — how large would this grid render?
      const scale = Math.min((containerW - 8) / worldW, (containerH - 8) / worldH);
      if (scale < 1.5) continue; // Skip if grid would be too small to read
      const filledW = worldW * scale;
      const filledH = worldH * scale;
      const score = filledW * filledH;
      if (score > bestScore) {
        bestScore = score;
        best = size;
      }
    }
    return best;
  }
  // Fallback: agent-count heuristic
  if (agentCount <= 6) return 'small';
  if (agentCount <= 14) return 'medium';
  return 'large';
}

/* ── environment metadata ──────────────────────── */

export const ENV_LABELS: Record<EnvironmentId, string> = {
  office: 'Office',
  rocket: 'Rocket Launch',
  space_station: 'Space Station',
  farm: 'Farm & Ranch',
  hospital: 'Hospital',
  pirate_ship: 'Pirate Ship',
  town: 'Town',
};
