// Flat-top axial hexagons. Shared geometry for the reference and future board tools.
export function normalizeHexCells(cells) {
  const minQ = Math.min(...cells.map(([q]) => q));
  const minR = Math.min(...cells.map(([, r]) => r));
  return cells.map(([q, r]) => [q - minQ, r - minR]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function rotateHexCells(cells, turns = 1) {
  let result = cells.map(cell => [...cell]);
  for (let i = 0; i < ((turns % 6) + 6) % 6; i++) result = result.map(([q, r]) => [-r, q + r]);
  return normalizeHexCells(result);
}

export function hexCellsOverlap(first, second, offset = [0, 0]) {
  const occupied = new Set(first.map(([q, r]) => `${q},${r}`));
  return second.some(([q, r]) => occupied.has(`${q + offset[0]},${r + offset[1]}`));
}

export function renderHexPattern(cells) {
  const radius = 10;
  const centers = cells.map(([q, r]) => [1.5 * radius * q, Math.sqrt(3) * radius * (r + q / 2)]);
  const minX = Math.min(...centers.map(([x]) => x)) - radius - 1;
  const minY = Math.min(...centers.map(([, y]) => y)) - radius - 1;
  const width = Math.max(...centers.map(([x]) => x)) + radius + 1 - minX;
  const height = Math.max(...centers.map(([, y]) => y)) + radius + 1 - minY;
  const polygons = centers.map(([x, y]) => `<polygon points="${Array.from({ length: 6 }, (_, i) => [x + radius * Math.cos(i * Math.PI / 3), y + radius * Math.sin(i * Math.PI / 3)].map(n => n.toFixed(3)).join(',')).join(' ')}"/>`).join('');
  return `<svg class="hex-pattern" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${cells.length} hexagonal cells / ${cells.length} 個六角格">${polygons}</svg>`;
}
