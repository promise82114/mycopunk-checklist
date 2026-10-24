import { normalizeHexCells, rotateHexCells } from './patterns.js';

export function createBoard(width, height, blocked = []) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 52 || height > 52) throw new Error('Board dimensions must be 1–52.');
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

export function solvePacking({ board, pieces, baseBoard, objective = 'count', maxNodes = 250000, timeLimitMs = 2500 }) {
  if (!Array.isArray(board) || board.length > 2704 || new Set(board.map(cell => cell.join(','))).size !== board.length || board.some(cell => cell.length !== 2 || !cell.every(Number.isInteger))) throw new Error('Invalid board.');
  if (!Array.isArray(pieces) || pieces.length > 40 || new Set(pieces.map(piece => piece.id)).size !== pieces.length) throw new Error('Select at most 40 copies with unique instance IDs.');
  if (!['count','priority'].includes(objective)) throw new Error('Unknown packing objective.');
  if (pieces.some(piece => piece.growAxis && !piece.exclusion && !piece.unsupported)) return solveExpandingPacking({board, pieces, baseBoard, objective, maxNodes, timeLimitMs});
  const weights = new Map(pieces.map((piece,index) => [piece.id,1n << BigInt(pieces.length-index-1)]));
  const scoreOf = placed => placed.reduce((score,item) => score + weights.get(item.id),0n);
  const started = performance.now();
  const invalid = [], items = [];
  for (const piece of pieces) {
    if (['stacking-restricted', 'expansion-unset'].includes(piece.exclusion)) { invalid.push({ id: piece.id, reason: piece.exclusion }); continue; }
    if (piece.exclusion) throw new Error('Unknown placement restriction.');
    if (piece.unsupported) { invalid.push({ id: piece.id, reason: 'geometry-modifier' }); continue; }
    if (!piece.cells?.length) { invalid.push({ id: piece.id, reason: 'missing-shape' }); continue; }
    const placements = enumeratePlacements(board, piece.cells, piece.allowRotation === true);
    if (!placements.length) { invalid.push({ id: piece.id, reason: 'no-placement' }); continue; }
    items.push({ ...piece, placements, size: piece.cells.length });
  }
  if (objective === 'count') items.sort((a, b) => a.placements.length - b.placements.length || b.size - a.size || a.id.localeCompare(b.id));
  let best = [], bestArea = 0, bestScore = 0n, nodes = 0, limited = false, complete = false;
  const update = placed => {
    const area = placed.reduce((sum, item) => sum + item.cells.length, 0);
    const score = scoreOf(placed);
    if (objective === 'priority' ? score > bestScore : placed.length > best.length || (placed.length === best.length && area > bestArea)) { best = placed.slice(); bestArea = area; bestScore = score; }
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
    if (objective === 'priority') {
      const upperScore = scoreOf(placed) + items.slice(index,index+capacity).reduce((score,item) => score+weights.get(item.id),0n);
      if (upperScore <= bestScore) return;
    } else {
      if (placed.length + capacity < best.length) return;
      if (placed.length + capacity === best.length && used + Math.min(free, sizes.reduce((a, b) => a + b, 0)) <= bestArea) return;
    }
    const key = index + '/' + occupied.toString(36);
    // Identical occupied cells imply identical area; only the number already placed can differ.
    const value = objective === 'priority' ? scoreOf(placed) : placed.length;
    if ((memo.get(key) ?? -1) >= value) return;
    if (memo.size < 100000) memo.set(key, value);
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
  const unplaced = [...invalid, ...items.filter(item => !placedIds.has(item.id)).map(item => ({ id: item.id, reason: limited ? 'search-limit' : objective === 'priority' ? 'priority-conflict' : 'capacity-conflict' }))];
  return { objective, placements: best.map(({ mask, ...placement }) => placement), unplaced, usedCells: bestArea, boardCells: board.length, selectedCount: pieces.length, validCount: items.length, optimal: !limited, limited, nodes, elapsedMs: Math.round(performance.now() - started), allFit: unplaced.length === 0 };
}

// Search installation sequences as well as final layouts. An expander must occupy
// an already available cell before it can unlock new cells; it cannot fund itself.
function solveExpandingPacking({board, pieces, baseBoard, objective, maxNodes, timeLimitMs}) {
  if (!baseBoard || !Number.isInteger(baseBoard.width) || !Number.isInteger(baseBoard.height) || baseBoard.width > 12 || baseBoard.height > 12 || !Array.isArray(baseBoard.blocked)) throw new Error('Expansion needs a valid base board.');
  const original = createBoard(baseBoard.width, baseBoard.height, baseBoard.blocked);
  if (JSON.stringify(board) !== JSON.stringify(original)) throw new Error('Base board coordinates do not match.');
  const expanders = pieces.filter(piece => piece.growAxis && !piece.exclusion && !piece.unsupported);
  for (const piece of expanders) if (!['column', 'row'].includes(piece.growAxis) || piece.cells?.length !== 1 || !orientations(piece.cells, false).length) throw new Error('Invalid board expansion.');
  const expanderIds = new Set(expanders.map(piece => piece.id));
  const normal = pieces.filter(piece => !expanderIds.has(piece.id));
  const targetCount = pieces.filter(piece => !piece.exclusion && !piece.unsupported && piece.cells?.length).length;
  const weights = new Map(pieces.map((piece,index) => [piece.id,1n << BigInt(pieces.length-index-1)]));
  const scoreOf = placed => placed.reduce((score,item) => score+weights.get(item.id),0n);
  const started = performance.now();
  let nodes = 0, limited = false, complete = false, bestArea = -1, bestScore = -1n;
  let best = {placements: [], unplaced: pieces.map(piece => ({id:piece.id, reason:'search-limit'})), usedCells:0, boardCells:board.length, board:{...baseBoard, cells:board}, expansionSteps:[]};
  function search(remainingExpanders, width, height, occupied, placed, steps, skipped) {
    if (complete || limited) return;
    if (++nodes > maxNodes || performance.now() - started >= timeLimitMs) { limited = true; return; }
    if (objective === 'priority') {
      if (scoreOf([...placed,...remainingExpanders,...normal]) <= bestScore) return;
    } else if (placed.length + remainingExpanders.length + normal.length < best.placements.length) return;
    const currentBoard = createBoard(width, height, baseBoard.blocked);
    if (remainingExpanders.length) {
      const triedAxes = new Set();
      for (const piece of remainingExpanders) {
        if (triedAxes.has(piece.growAxis)) continue;
        triedAxes.add(piece.growAxis);
        const rest = remainingExpanders.filter(item => item.id !== piece.id);
        for (const cell of currentBoard) {
          const key = cell.join(',');
          if (occupied.has(key)) continue;
          const nextWidth = width + Number(piece.growAxis === 'column'), nextHeight = height + Number(piece.growAxis === 'row');
          search(rest, nextWidth, nextHeight, new Set([...occupied, key]), [...placed, {id:piece.id, cells:[cell], turns:0, offset:cell}], [...steps, {id:piece.id, axis:piece.growAxis, before:{width,height}, after:{width:nextWidth,height:nextHeight}}], skipped);
          if (complete || limited) return;
        }
      }
      search(remainingExpanders.slice(1), width, height, occupied, placed, steps, [...skipped, remainingExpanders[0].id]);
      return;
    }
    const available = currentBoard.filter(cell => !occupied.has(cell.join(',')));
    const remaining = solvePacking({board:available, pieces:normal, objective, maxNodes:Math.max(0,maxNodes-nodes), timeLimitMs:Math.max(0,timeLimitMs-(performance.now()-started))});
    nodes += remaining.nodes;
    const placements = [...placed, ...remaining.placements], area = placed.length + remaining.usedCells;
    const score = scoreOf(placements);
    if (objective === 'priority' ? score > bestScore : placements.length > best.placements.length || (placements.length === best.placements.length && area > bestArea)) {
      bestArea = area; bestScore = score;
      best = {placements, unplaced:[...remaining.unplaced, ...skipped.map(id => ({id,reason:objective === 'priority' ? 'priority-conflict' : 'capacity-conflict'}))], usedCells:area, boardCells:currentBoard.length, board:{width,height,blocked:[...baseBoard.blocked],cells:currentBoard}, expansionSteps:steps};
    }
    complete = best.placements.length === targetCount;
    if (remaining.limited && !complete) limited = true;
  }
  search(expanders, baseBoard.width, baseBoard.height, new Set(), [], [], []);
  const fixedFailures = new Map(pieces.filter(piece => piece.exclusion || piece.unsupported || !piece.cells?.length).map(piece => [piece.id, piece.exclusion || (piece.unsupported ? 'geometry-modifier' : 'missing-shape')]));
  best.unplaced = best.unplaced.map(entry => ({id:entry.id, reason:fixedFailures.get(entry.id) || (limited ? 'search-limit' : entry.reason)}));
  return {...best, objective, selectedCount:pieces.length, validCount:targetCount, optimal:!limited, limited, nodes, elapsedMs:Math.round(performance.now()-started), allFit:best.unplaced.length===0};
}
