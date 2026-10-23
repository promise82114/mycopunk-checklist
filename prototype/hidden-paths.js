import { escapeHtml, dual, sourceAnchor } from './wiki.js';

const rarityNames = { Standard: '標準', Rare: '稀有', Epic: '史詩', Exotic: '異域', Oddity: '奇物', Contraband: '違禁品' };
const pathNames = [
  ['Corner', '轉角'], ['Frame', '外框'], ['Zigzag', '折線'], ['Hook', '彎鉤'],
  ['Loop', '迴圈'], ['Fork', '分叉'], ['Diamond & stem', '菱形與直線'],
];

export function validateHiddenPaths(data) {
  const require = (condition, message) => { if (!condition) throw new Error('隱藏路徑：' + message); };
  require(data?.schemaVersion === 1 && data.paths?.length === 7, '需有七條已核對路徑');
  require(data.source?.gameVersion && data.source?.buildId && /^[a-f0-9]{64}$/.test(data.source?.sha256 || ''), '缺少來源版本或雜湊');
  require(sourceAnchor(data.source.url) && /^[a-f0-9]{40}$/.test(data.source.revision || ''), '缺少固定修訂來源');
  const ids = new Set();
  data.paths.forEach((path, index) => {
    require(Number.isInteger(path.id) && !ids.has(path.id) && path.nameEn === 'Path ' + index, '路徑 ID 或次序不符');
    ids.add(path.id);
    require(path.coordinateSystem === 'axial-flat-top' && path.offsetCoordinateSystem === 'odd-q', '座標系不符');
    require(Number.isInteger(path.width) && path.width > 0 && path.width <= 20 && Number.isInteger(path.height) && path.height > 0 && path.height <= 20, '格板尺寸無效');
    require(path.anchor?.column === 0 && path.anchor?.row === 0 && path.orientation?.rotationDegrees === 0 && path.orientation?.reflected === false, '不可改變原圖原點或方向');
    require(path.gameVersion === data.source.gameVersion && path.buildId === data.source.buildId && path.testedInGame === false, '版本或驗證狀態不符');
    require(path.cellCount > 0 && path.cellCount === path.cells?.length && path.cellCount === path.enabledCells?.length, '格數不符');
    const coordinates = new Set();
    path.enabledCells.forEach((cell, i) => {
      require(Number.isInteger(cell.column) && cell.column >= 0 && cell.column < path.width && Number.isInteger(cell.row) && cell.row >= 0 && cell.row < path.height, '格位超出來源範圍');
      const key = cell.column + ',' + cell.row;
      require(!coordinates.has(key), '格位重複'); coordinates.add(key);
      require(cell.q === cell.column && cell.r === cell.row - Math.floor(cell.column / 2) && path.cells[i][0] === cell.q && path.cells[i][1] === cell.r, '原始格位與六角座標不一致');
    });
    require(typeof path.rarityRule?.any === 'boolean' && Array.isArray(path.rarityRule.allowed), '品質條件不完整');
    require(path.rarityRule.any ? path.rarityRule.allowed.length === 0 : path.rarityRule.allowed.length > 0 && path.rarityRule.allowed.every(rarity => Object.hasOwn(rarityNames, rarity)), '品質條件無效');
    require(path.rewardsRaw?.length === 1 && path.rewardsRaw[0].Type === 'LevelUnlock_UpgradeRarity' && path.rewardsRaw[0].Count === 1 && Object.hasOwn(rarityNames, path.rewardsRaw[0].Rarity), '獎勵類型未支援');
  });
  return data;
}

export function pathCoordinate(cell) {
  return String.fromCharCode(65 + cell.column) + (cell.row + 1);
}

export function renderPathDiagram(path) {
  const radius = 12;
  const vertical = Math.sqrt(3) * radius;
  const enabled = new Set(path.enabledCells.map(cell => cell.column + ',' + cell.row));
  const minX = -radius * 2.7;
  const minY = -radius * 2.6;
  const width = 1.5 * radius * (path.width - 1) + radius * 4.2;
  const height = vertical * (path.height - 0.5) + radius * 4.1;
  let markup = '';
  for (let column = 0; column < path.width; column++) {
    markup += `<text class="path-axis" x="${1.5 * radius * column}" y="${-radius * 1.8}">${String.fromCharCode(65 + column)}</text>`;
  }
  for (let row = 0; row < path.height; row++) {
    markup += `<text class="path-axis" x="${-radius * 2.1}" y="${vertical * row + 2.5}">${row + 1}</text>`;
    for (let column = 0; column < path.width; column++) {
      const x = 1.5 * radius * column;
      const y = vertical * (row + (column % 2) / 2);
      const filled = enabled.has(column + ',' + row);
      const points = Array.from({ length: 6 }, (_, i) => [x + radius * Math.cos(i * Math.PI / 3), y + radius * Math.sin(i * Math.PI / 3)].map(n => n.toFixed(3)).join(',')).join(' ');
      markup += `<polygon class="path-cell ${filled ? 'path-required' : 'path-optional'}" data-position="${String.fromCharCode(65 + column)}${row + 1}" points="${points}"/>`;
      if (filled) markup += `<text class="path-cell-label" x="${x}" y="${y + 2.5}">${String.fromCharCode(65 + column)}${row + 1}</text>`;
    }
  }
  return `<svg class="path-diagram" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${path.nameEn}: ${path.cellCount} required hexagonal cells / ${path.cellCount} 個必填六角格"><desc>Relative odd-q grid. Required cells: ${path.enabledCells.map(pathCoordinate).join(', ')}.</desc>${markup}</svg>`;
}

function rarityRule(path) {
  if (path.rarityRule.any) return dual('Any rarity', '不限品質');
  return dual(path.rarityRule.allowed.join(' or ') + ' only', '限用 ' + path.rarityRule.allowed.map(r => `${r}（${rarityNames[r]}）`).join(' 或 '));
}

export function renderHiddenPaths(data) {
  const source = data.source;
  const cards = data.paths.map((path, index) => {
    const reward = path.rewardsRaw[0];
    const [en, zh] = pathNames[index];
    const tone = path.rarityRule.any ? 'any' : path.rarityRule.allowed.length > 1 ? 'mixed' : path.rarityRule.allowed[0].toLowerCase();
    return `<article class="hidden-path-card path-tone-${tone}" id="hidden-path-${path.id}"><header><div><span class="eyebrow">${escapeHtml(path.nameEn)} · ${path.cellCount} CELLS / 格</span><h3>${en}<span class="zh-copy">${zh}</span></h3></div><span class="path-order">${String(index).padStart(2, '0')}</span></header><div class="path-drawing">${renderPathDiagram(path)}</div><div class="path-facts"><div><span class="cell-label">COVER WITH / 使用品質</span>${rarityRule(path)}</div><div><span class="cell-label">LISTED REWARD / 資料列獎勵</span>${dual(`1 × ${reward.Rarity} upgrade`, `1 個 ${rarityNames[reward.Rarity]}升級（未指定配件名稱）`)}</div></div><div class="path-coordinates"><span class="cell-label">REQUIRED CELLS / 必須覆蓋的格位</span><p>${path.enabledCells.map(cell => `<span>${pathCoordinate(cell)}</span>`).join('')}</p></div><footer><span>${path.width} columns × ${path.height} rows / 欄 × 列<br>PC ${escapeHtml(source.gameVersion)} · Build ${escapeHtml(source.buildId)}</span>${sourceAnchor(source.url, 'Data source / 資料來源 ↗')}</footer></article>`;
  }).join('');
  return `<section class="hidden-path-guide" aria-labelledby="hidden-path-guide-title"><div class="path-version"><div><span class="eyebrow">SEVEN VERIFIED DATA DEFINITIONS / 七條來源資料</span><h2 id="hidden-path-guide-title">Follow the highlighted cells <span>依圖覆蓋亮色格位</span></h2><p>PC ${escapeHtml(source.gameVersion)} · Build ${escapeHtml(source.buildId)} · Dump ${escapeHtml(source.dumpedAt.slice(0, 10))}</p></div><div>${sourceAnchor(source.url, 'Vilsol / fixed source revision ↗')}<p>Checked ${escapeHtml(source.checkedOn)}<br>Data checked; not retested in game.<br>已核對資料，尚未實機重測。</p></div></div><div class="path-instructions"><section><h3>How to read the diagrams <span>照圖擺放</span></h3><ol><li>${dual('Cover every highlighted cell with upgrades of the listed rarity. A single upgrade may cover several target cells.', '用符合品質的升級覆蓋所有亮色格；一塊配件可同時覆蓋數個目標格。')}</li><li>${dual('Grey cells are reference space. Pieces may extend into them; they do not need to stay empty.', '灰格只供對位，配件可延伸覆蓋，無須刻意留空。')}</li><li>${dual('Keep the shown direction and alternating column heights when copying. A1 labels this diagram, not an absolute slot on your gear.', '照圖保留方向與欄位高低交錯。A1 是本圖參考格位，不是遊戲面板的固定插槽。')}</li></ol></section><aside><h3>Before you start <span>擺放前確認</span></h3>${dual('Use a grid large enough for the shown column and row span. The source does not specify a minimum gear level or named upgrade combination.', '先選可容納圖示欄列範圍的面板；來源沒有指定裝備最低等級或特定名稱的配件組合。')}<p class="data-note">自由平移、旋轉或鏡射能否觸發，尚未由這份資料確認。建議先依原圖方向對照；歷史位移排錯見下方。</p></aside></div><nav class="path-jump-links" aria-label="七條隱藏路徑">${data.paths.map(path => `<a href="#hidden-path-${path.id}">${path.nameEn}</a>`).join('')}</nav><div class="hidden-path-grid">${cards}</div><section class="path-version-notes"><h3>Versions & troubleshooting <span>版本與未觸發時的檢查</span></h3>${dual('These seven drawings and rarity rules come from the v2.0.2 PC export. They are not a claim of compatibility with every console build or later patch.', '七張圖與品質限制來自 PC v2.0.2 匯出資料；不宣稱所有主機版本或後續更新都相同。')}<ul><li>${dual('The export lists a rarity-based upgrade reward for every path, including Path 6. It does not specify a named upgrade or a currency payout for Path 6.', '七條皆列為指定品質的升級獎勵。Path 6 並未指定固定配件，也沒有列出貨幣獎勵。')}</li><li>${dual('SlideDrum’s video explicitly covers update 1.0.3 (July 14, 2025). Its historical bug workaround is to shift an unrecognized arrangement one column left or right. This has not been confirmed for v2.0.2.', 'SlideDrum 影片明示適用舊版 1.0.3（2025-07-14）。舊版未觸發時曾建議整體左右移一欄；尚未確認 v2.0.2 是否仍需此排錯方式。')}</li><li>${dual('The author reports that claims are shared across gear and each path rewards only once. If a matching layout gives nothing, consider an already claimed path; no automatic save check is available here.', '作者回報領取進度跨裝備共用，每條只領一次；圖樣吻合卻沒獎勵時，也可能已經領過。本站無法自動讀取遊戲存檔判斷。')}</li></ul><div class="path-source-links">${sourceAnchor('https://www.youtube.com/watch?v=2azMQacNAzA&t=80s', 'Original video / 七圖原片 · v1.0.3 · 1:20 ↗')}${sourceAnchor('https://www.youtube.com/watch?v=2azMQacNAzA&t=163s', 'Historical bugs / 舊版排錯 · 2:43 ↗')}${sourceAnchor('https://www.reddit.com/r/MycopunkGame/comments/1m1l4z3/everything_there_is_to_know_about_hidden_paths/', 'Author’s explanation / 作者補充 ↗')}${sourceAnchor(source.coordinateSourceUrl, 'Hex coordinate mapping / 座標換算來源 ↗')}</div></section></section>`;
}
