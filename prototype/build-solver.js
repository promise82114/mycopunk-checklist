import { normalizeHexCells, rotateHexCells } from './patterns.js';

export function createBoard(width, height, blocked = []) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12 || height > 12) throw new Error('Board dimensions must be 1–12.');
  const disabled = new Set(blocked);
  return Array.from({ length: width * height }, (_, i) => {
    const q = i % width, row = Math.floor(i / width);
    return [q, row - Math.floor(q / 2)];
  }).filter(cell => !disabled.has(cell.join(',')));
}

export function orientations(cells, allowRotation) {
  if (!Array.isArray(cells) || !cells.length || cells.some(cell => !Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) || new Set(cells.map(cell => cell.join(','))).size !== cells.length) throw new Error('Invalid piece coordinates.');
  const seen = new Set(), result = [];
  for (let turns = 0; turns < (allowRotation ? 6 : 1); turns++) {
    const rotated = turns ? rotateHexCells(cells, turns) : normalizeHexCells(cells);
    const key = JSON.stringify(rotated);
    if (!seen.has(key)) { seen.add(key); result.push({ cells: rotated, turns }); }
  }
  return result;
}

export function enumeratePlacements(board, cells, allowRotation = true) {
  const index = new Map(board.map((cell, i) => [cell.join(','), i]));
  const seen = new Set(), result = [];
  for (const shape of orientations(cells, allowRotation)) {
    // Align one actual piece cell with every board cell; independent normalization can leave no [0,0] cell.
    const [firstQ, firstR] = shape.cells[0];
    for (const [boardQ, boardR] of board) {
      const offset = [boardQ - firstQ, boardR - firstR];
      const placed = shape.cells.map(([q, r]) => [q + offset[0], r + offset[1]]);
      let mask = 0n, valid = true;
      for (const cell of placed) {
        const bit = index.get(cell.join(','));
        if (bit === undefined) { valid = false; break; }
        mask |= 1n << BigInt(bit);
      }
      const key = mask.toString();
      if (valid && !seen.has(key)) { seen.add(key); result.push({ cells: placed, turns: shape.turns, offset, mask }); }
    }
  }
  return result;
}

export function solvePacking({ board, pieces, maxNodes = 250000, timeLimitMs = 2500 }) {
  if (!Array.isArray(board) || board.length > 144 || new Set(board.map(cell => cell.join(','))).size !== board.length || board.some(cell => cell.length !== 2 || !cell.every(Number.isInteger))) throw new Error('Invalid board.');
  if (!Array.isArray(pieces) || pieces.length > 40 || new Set(pieces.map(piece => piece.id)).size !== pieces.length) throw new Error('Select at most 40 copies with unique instance IDs.');
  const started = performance.now();
  const invalid = [], items = [];
  for (const piece of pieces) {
    if (piece.exclusion === 'stacking-restricted') { invalid.push({ id: piece.id, reason: piece.exclusion }); continue; }
    if (piece.exclusion) throw new Error('Unknown placement restriction.');
    if (piece.unsupported) { invalid.push({ id: piece.id, reason: 'geometry-modifier' }); continue; }
    if (!piece.cells?.length) { invalid.push({ id: piece.id, reason: 'missing-shape' }); continue; }
    const placements = enumeratePlacements(board, piece.cells, piece.allowRotation === true);
    if (!placements.length) { invalid.push({ id: piece.id, reason: 'no-placement' }); continue; }
    items.push({ ...piece, placements, size: piece.cells.length });
  }
  items.sort((a, b) => a.placements.length - b.placements.length || b.size - a.size || a.id.localeCompare(b.id));
  let best = [], bestArea = 0, nodes = 0, limited = false, complete = false;
  const update = placed => {
    const area = placed.reduce((sum, item) => sum + item.cells.length, 0);
    if (placed.length > best.length || (placed.length === best.length && area > bestArea)) { best = placed.slice(); bestArea = area; }
    if (best.length === items.length) complete = true;
  };
  // Seed several legal layouts so interruption always leaves a useful valid arrangement.
  for (const ordering of [items, [...items].sort((a, b) => a.size - b.size), [...items].sort((a, b) => b.size - a.size)]) {
    let occupied = 0n; const placed = [];
    for (const item of ordering) {
      const candidate = item.placements.find(p => !(p.mask & occupied));
      if (candidate) { occupied |= candidate.mask; placed.push({ id: item.id, ...candidate }); }
    }
    update(placed);
  }
  const memo = new Map();
  function search(index, occupied, used, placed) {
    if (complete || limited) return;
    nodes++;
    if (nodes > maxNodes || ((nodes & 255) === 0 && performance.now() - started >= timeLimitMs)) { limited = true; return; }
    update(placed);
    if (complete || index === items.length) return;
    const free = board.length - used;
    const sizes = items.slice(index).map(item => item.size).sort((a, b) => a - b);
    let capacity = 0, remaining = free;
    for (const size of sizes) { if (size > remaining) break; remaining -= size; capacity++; }
    if (placed.length + capacity < best.length) return;
    if (placed.length + capacity === best.length && used + Math.min(free, sizes.reduce((a, b) => a + b, 0)) <= bestArea) return;
    const key = index + '/' + occupied.toString(36);
    // Identical occupied cells imply identical area; only the number already placed can differ.
    if ((memo.get(key) ?? -1) >= placed.length) return;
    if (memo.size < 100000) memo.set(key, placed.length);
    const item = items[index];
    for (const candidate of item.placements) {
      if (!(candidate.mask & occupied)) {
        placed.push({ id: item.id, ...candidate });
        search(index + 1, occupied | candidate.mask, used + item.size, placed);
        placed.pop();
        if (complete || limited) return;
      }
    }
    search(index + 1, occupied, used, placed);
  }
  search(0, 0n, 0, []);
  const placedIds = new Set(best.map(item => item.id));
  const unplaced = [...invalid, ...items.filter(item => !placedIds.has(item.id)).map(item => ({ id: item.id, reason: limited ? 'search-limit' : 'capacity-conflict' }))];
  return { placements: best.map(({ mask, ...placement }) => placement), unplaced, usedCells: bestArea, boardCells: board.length, selectedCount: pieces.length, validCount: items.length, optimal: !limited, limited, nodes, elapsedMs: Math.round(performance.now() - started), allFit: unplaced.length === 0 };
}
