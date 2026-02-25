import type { CharacterPalette, SpriteFrame } from './types';

/**
 * Sprite templates are 12x16 pixel grids.
 * Palette indices: 0=transparent, 1=skin, 2=hair, 3=shirt, 4=pants, 5=shoes, 6=eyes
 */
function parse(rows: string[]): SpriteFrame {
  const data = rows.map(row => row.split('').map(Number));
  return { width: data[0].length, height: data.length, data };
}

/* ── male sprites (short hair) ─────────────────── */

const M_IDLE = parse([
  '000222222000',
  '002222222200',
  '002111111200',
  '001161161100',
  '001111111100',
  '000111111000',
  '000033330000',
  '000333333000',
  '011333333110',
  '011333333110',
  '000333333000',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

const M_WALK_A = parse([
  '000222222000',
  '002222222200',
  '002111111200',
  '001161161100',
  '001111111100',
  '000111111000',
  '000033330000',
  '000333333000',
  '011333333110',
  '011333333110',
  '000333333000',
  '000044440000',
  '000440044000',
  '000400004000',
  '000500005000',
  '000000000000',
]);

const M_WALK_B = parse([
  '000222222000',
  '002222222200',
  '002111111200',
  '001161161100',
  '001111111100',
  '000111111000',
  '000033330000',
  '000333333000',
  '011333333110',
  '011333333110',
  '000333333000',
  '000044440000',
  '000004400000',
  '000004400000',
  '000005500000',
  '000000000000',
]);

const M_TYPE_A = parse([
  '000222222000',
  '002222222200',
  '002111111200',
  '001161161100',
  '001111111100',
  '000111111000',
  '000033330000',
  '000333333000',
  '000333333000',
  '001333333100',
  '010333333010',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

const M_TYPE_B = parse([
  '000222222000',
  '002222222200',
  '002111111200',
  '001161161100',
  '001111111100',
  '000111111000',
  '000033330000',
  '000333333000',
  '000333333000',
  '010333333010',
  '001333333100',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

const M_READING = parse([
  '000222222000',
  '002222222200',
  '002111111200',
  '001161161100',
  '001111111100',
  '000111111000',
  '000033330000',
  '000333333000',
  '000333333000',
  '000333333000',
  '001333333100',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

/* ── female sprites (long hair flowing down sides) ── */

const F_IDLE = parse([
  '000222222000',
  '002222222200',
  '022111111220',
  '021161161120',
  '021111111120',
  '022111111220',
  '020033330020',
  '000333333000',
  '011333333110',
  '011333333110',
  '000333333000',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

const F_WALK_A = parse([
  '000222222000',
  '002222222200',
  '022111111220',
  '021161161120',
  '021111111120',
  '022111111220',
  '020033330020',
  '000333333000',
  '011333333110',
  '011333333110',
  '000333333000',
  '000044440000',
  '000440044000',
  '000400004000',
  '000500005000',
  '000000000000',
]);

const F_WALK_B = parse([
  '000222222000',
  '002222222200',
  '022111111220',
  '021161161120',
  '021111111120',
  '022111111220',
  '020033330020',
  '000333333000',
  '011333333110',
  '011333333110',
  '000333333000',
  '000044440000',
  '000004400000',
  '000004400000',
  '000005500000',
  '000000000000',
]);

const F_TYPE_A = parse([
  '000222222000',
  '002222222200',
  '022111111220',
  '021161161120',
  '021111111120',
  '022111111220',
  '020033330020',
  '000333333000',
  '000333333000',
  '001333333100',
  '010333333010',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

const F_TYPE_B = parse([
  '000222222000',
  '002222222200',
  '022111111220',
  '021161161120',
  '021111111120',
  '022111111220',
  '020033330020',
  '000333333000',
  '000333333000',
  '010333333010',
  '001333333100',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

const F_READING = parse([
  '000222222000',
  '002222222200',
  '022111111220',
  '021161161120',
  '021111111120',
  '022111111220',
  '020033330020',
  '000333333000',
  '000333333000',
  '000333333000',
  '001333333100',
  '000044440000',
  '000044440000',
  '000040040000',
  '000040040000',
  '000050050000',
]);

/* ── sprite sets ──────────────────────────────── */

export const SPRITES: Record<string, SpriteFrame[]> = {
  idle: [M_IDLE], walk: [M_WALK_A, M_IDLE, M_WALK_B, M_IDLE],
  typing: [M_TYPE_A, M_TYPE_B], reading: [M_READING],
  thinking: [M_IDLE], waiting: [M_IDLE], success: [M_IDLE], error: [M_IDLE],
};

export const SPRITES_F: Record<string, SpriteFrame[]> = {
  idle: [F_IDLE], walk: [F_WALK_A, F_IDLE, F_WALK_B, F_IDLE],
  typing: [F_TYPE_A, F_TYPE_B], reading: [F_READING],
  thinking: [F_IDLE], waiting: [F_IDLE], success: [F_IDLE], error: [F_IDLE],
};

/* ── palettes (20 diverse appearances) ─────────── */

export const PALETTES: CharacterPalette[] = [
  { skin: '#FFDCB5', hair: '#3B2417', shirt: '#4A90D9', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#F5CBA7', hair: '#C0392B', shirt: '#27AE60', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#D4A574', hair: '#1A1A2E', shirt: '#8E44AD', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#FFDCB5', hair: '#F39C12', shirt: '#E74C3C', pants: '#2C3E50', shoes: '#34495E', eyes: '#1A1A2E' },
  { skin: '#C68642', hair: '#2C2C2C', shirt: '#F39C12', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#FFE0BD', hair: '#6B3FA0', shirt: '#1ABC9C', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#E8B796', hair: '#D35400', shirt: '#2980B9', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#FFDCB5', hair: '#7F8C8D', shirt: '#E67E22', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#A0522D', hair: '#0D0D0D', shirt: '#3498DB', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#FFE0BD', hair: '#E74C3C', shirt: '#9B59B6', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#FDDBB5', hair: '#DDA520', shirt: '#E84393', pants: '#2D3436', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#D2956A', hair: '#2C2C2C', shirt: '#6C5CE7', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#FFE0BD', hair: '#A0522D', shirt: '#00B894', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#8B6842', hair: '#1A1A1A', shirt: '#FD79A8', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#FFDCB5', hair: '#2C2C2C', shirt: '#FDCB6E', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#C68642', hair: '#6B3FA0', shirt: '#FF6348', pants: '#2C3E50', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#F5CBA7', hair: '#B5651D', shirt: '#5F27CD', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
  { skin: '#E8B796', hair: '#C0392B', shirt: '#01A3A4', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#A0522D', hair: '#2C2C2C', shirt: '#EE5A24', pants: '#2C3E50', shoes: '#1A1A2E', eyes: '#1A1A2E' },
  { skin: '#FFE0BD', hair: '#F39C12', shirt: '#0984E3', pants: '#34495E', shoes: '#2C3E50', eyes: '#1A1A2E' },
];

/* ── rendering ────────────────────────────────── */

const PALETTE_MAP: Record<number, keyof CharacterPalette> = {
  1: 'skin', 2: 'hair', 3: 'shirt', 4: 'pants', 5: 'shoes', 6: 'eyes',
};

export function renderSprite(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  x: number,
  y: number,
  pixelSize: number,
  palette: CharacterPalette,
  flip = false,
): void {
  for (let row = 0; row < frame.height; row++) {
    for (let col = 0; col < frame.width; col++) {
      const idx = frame.data[row][col];
      if (idx === 0) continue;
      const key = PALETTE_MAP[idx];
      if (!key) continue;
      ctx.fillStyle = palette[key];
      const drawCol = flip ? frame.width - 1 - col : col;
      ctx.fillRect(x + drawCol * pixelSize, y + row * pixelSize, pixelSize, pixelSize);
    }
  }
}
