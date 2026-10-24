import { createBoard } from './build-solver.js';
import { renderHexPattern } from './patterns.js';
import { escapeHtml as esc, sourceAnchor } from './wiki.js';

const reasonText = {
  'missing-shape': ['Shape coordinates unavailable', '格形座標尚未收錄，未以占格數猜圖。'],
  'empty-source-pattern': ['Wiki source pattern is empty', '來源圖檔沒有格點；未推測占格或安裝方式。'],
  'stacking-restricted': ['Inactive in Loadout mode', '一般配裝限一份；額外份數暫停使用，不會裝入或提供擴格。切換「任務內配裝」或減少份數後再排放。'],
  'expansion-unset': ['Choose this copy’s Column / Row roll', '請對照遊戲，為此份擴格配件選擇加一欄或加一列；未指定不增加空間。'],
  'geometry-modifier': ['Cross-board / pattern modifier not calculated', '此配件會徵用其他面板或改變配件格形，目前未自動計算；此項不計為已裝入。'],
  'no-placement': ['Cannot fit by itself', '依目前可用格位與旋轉限制，此配件單獨也無合法擺法。'],
  'capacity-conflict': ['Not included in this maximum fit', '已完成搜尋；全部選擇無法同時放入。此為其中一個最多配件的配置，未裝入項目可能與其他配件互換。'],
  'search-limit': ['Not placed within the search budget', '已達搜尋上限，尚不能判定無解。可延長搜尋、減少選擇或核對面板。'],
  'priority-conflict': ['Kept higher-priority upgrades', '依已選清單由上至下保留優先配件；此項未裝入。可向上移動，讓它優先排放。'],
};
const cellLabel = ([q, r]) => { let column = '', n = q + 1; while (n) { column = String.fromCharCode(65 + (n - 1) % 26) + column; n = Math.floor((n - 1) / 26); } return column + (r + Math.floor(q / 2) + 1); };
const emptyDraft = () => ({ selected: [], nextInstance: 1, context: 'loadout', expansionAxes: {}, query: '', rarity: '', collectedOnly: false, stage: 10, boardLevel: 10, playerLevel: 30, custom: false, width: 7, height: 6, blocked: [], editing: false, autoFit: true, pending: false, result: null, running: false, error: '' });

export const buildUpgradeId = instanceId => instanceId.split('@')[0];
export const buildCopyLimit = (rule, context) => rule.stacking === 'always' || (rule.stacking === 'mission' && context === 'mission') ? 40 : 1;
export function reorderBuildSelection(draft, instanceId, toIndex) {
  const from = draft.selected.indexOf(instanceId);
  if (from < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= draft.selected.length) return false;
  if (from === toIndex) return false;
  draft.selected.splice(from,1); draft.selected.splice(toIndex,0,instanceId); return true;
}
export function setBuildQuantity(draft, upgradeId, quantity, rule) {
  const copies = draft.selected.filter(id => buildUpgradeId(id) === upgradeId);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 40) throw new Error('Quantity must be 0–40. / 份數需為 0–40 的整數。');
  // A context change keeps extra copies visible; reducing an existing over-limit choice is always allowed.
  if (quantity > copies.length && quantity > buildCopyLimit(rule, draft.context)) throw new Error('This context allows one copy. / 此疊加情境僅允許一份。');
  if (draft.selected.length - copies.length + quantity > 40) throw new Error('Select at most 40 copies in total. / 最多共選 40 份配件。');
  const removed = new Set(copies.slice(quantity));
  draft.selected = draft.selected.filter(id => !removed.has(id));
  draft.nextInstance ||= 1;
  for (let i = copies.length; i < quantity; i++) {
    let instanceId;
    do { instanceId = `${upgradeId}@${draft.nextInstance++}`; } while (draft.selected.includes(instanceId));
    draft.selected.push(instanceId);
  }
}

export function buildPackingPieces(draft, upgradeIndex, shapeIndex, rules) {
  const counts = new Map();
  return draft.selected.map(id => {
    const upgradeId = buildUpgradeId(id), item = upgradeIndex.get(upgradeId), rule = rules.rules[upgradeId];
    if (!item || !rule) throw new Error('Unknown build upgrade.');
    const copy = (counts.get(upgradeId) || 0) + 1;
    counts.set(upgradeId, copy);
    const growAxis = rule.boardExpansion && draft.expansionAxes?.[id];
    return { id, cells: shapeIndex.get(upgradeId)?.cells, allowRotation: Number.isInteger(rules.rotationUnlocks[item.rarity]) && draft.playerLevel >= rules.rotationUnlocks[item.rarity], unsupported: rule.geometryModifier && !rule.boardExpansion, ...(growAxis ? {growAxis} : {}), exclusion: copy > buildCopyLimit(rule, draft.context) ? 'stacking-restricted' : rule.boardExpansion && !growAxis ? 'expansion-unset' : null };
  });
}

export function validateBuildRules(data, catalogue) {
  if (data?.schemaVersion !== 1 || !data.source?.gameVersion || !sourceAnchor(data.source.url) || !Array.isArray(data.boardProfile) || !data.boardProfile.length || !data.rotationUnlocks) throw new Error('配裝規則資料格式不符。');
  for (const stage of data.boardProfile) { createBoard(stage.Width, stage.Height); if (!Number.isInteger(stage.Level) || stage.Level < 0) throw new Error('面板等級無效。'); }
  for (const [rarity, level] of Object.entries(data.rotationUnlocks)) if (!['Standard', 'Rare', 'Epic', 'Exotic'].includes(rarity) || !Number.isInteger(level) || level < 1) throw new Error('旋轉門檻無效。');
  for (const owner of catalogue.owners.filter(item => item.category !== 'general')) {
    const profile = data.boardProfiles?.[owner.id];
    if (!profile || !['player', 'gear', 'fixed'].includes(profile.levelSource) || !profile.stages?.length) throw new Error('裝備面板資料不完整。');
    for (const stage of profile.stages) createBoard(stage.Width, stage.Height);
  }
  for (const item of catalogue.upgrades) if (!data.rules?.[item.id] || typeof data.rules[item.id].geometryModifier !== 'boolean' || !Array.isArray(data.rules[item.id].genericOwners) || !['always', 'mission', 'single', 'unknown'].includes(data.rules[item.id].stacking)) throw new Error('配件規則不完整。');
  if (!sourceAnchor(data.expansionSource?.url) || data.expansionSource?.gameVersion !== data.source.gameVersion) throw new Error('擴格來源版本不完整。');
  for (const rule of Object.values(data.rules)) if (rule.boardExpansion && (rule.boardExpansion.amount !== 1 || JSON.stringify(rule.boardExpansion.axes) !== '["column","row"]')) throw new Error('擴格規則無效。');
  return data;
}

export function availableBuildUpgrades(catalogue, rules, ownerId) {
  const ownNames = new Set(catalogue.upgrades.filter(item => item.ownerId === ownerId && !item.archived).map(item => item.nameEn));
  const qualityOrder = ['Contraband', 'Oddity', 'Exotic', 'Epic', 'Rare', 'Standard'];
  return catalogue.upgrades.filter(item => !item.archived && (item.ownerId === ownerId || (item.ownerId === 'general' && !ownNames.has(item.nameEn) && rules.rules[item.id]?.genericOwners.includes(ownerId))))
    .sort((a, b) => qualityOrder.indexOf(a.rarity) - qualityOrder.indexOf(b.rarity) || Number(b.ownerId === ownerId) - Number(a.ownerId === ownerId) || a.nameEn.localeCompare(b.nameEn));
}

export function buildBoardStage(rules, ownerId, draft) {
  const profile = rules.boardProfiles[ownerId];
  const level = profile.levelSource === 'fixed' ? 0 : Number.isInteger(draft.boardLevel) ? draft.boardLevel : profile.levelSource === 'player' ? draft.playerLevel : draft.stage;
  return profile.stages.filter(stage => stage.Level <= level).at(-1) || profile.stages[0];
}

export function renderBuildBoard(state) {
  const radius = 16, vertical = Math.sqrt(3) * radius;
  const occupied = new Map();
  for (const placement of state.result?.placements || []) {
    const number = state.selected.indexOf(placement.id) + 1;
    placement.cells.forEach(cell => occupied.set(cell.join(','), {number,id:placement.id}));
  }
  const blocked = new Set(state.blocked);
  const widthCells = state.result?.board?.width || state.width, heightCells = state.result?.board?.height || state.height;
  const baseKeys = new Set(createBoard(state.width, state.height).map(cell => cell.join(',')));
  const cells = createBoard(widthCells, heightCells);
  const polygons = cells.map(([q, r]) => {
    const x = 1.5 * radius * q, y = vertical * (r + q / 2), key = [q, r].join(',');
    const entry = occupied.get(key), number = entry?.number, disabled = blocked.has(key);
    const grade = String(state.qualities?.[entry?.id] || 'Standard').toLowerCase();
    const points = Array.from({ length: 6 }, (_, i) => `${(x + radius * Math.cos(i * Math.PI / 3)).toFixed(2)},${(y + radius * Math.sin(i * Math.PI / 3)).toFixed(2)}`).join(' ');
    return `<g data-build-cell="${key}" ${entry ? `data-build-instance="${esc(entry.id)}"` : ''} ${!baseKeys.has(key) ? 'class="build-added-cell"' : ''} ${state.editing ? `role="button" tabindex="0" aria-pressed="${disabled}" aria-label="${cellLabel([q, r])} ${disabled ? 'unavailable / 不可用' : 'available / 可用'}"` : ''}><title>${cellLabel([q, r])}${!baseKeys.has(key) ? ' · Expanded / 擴格' : ''}${number ? ' · #' + number : ''}</title><polygon class="build-cell ${disabled ? 'build-blocked' : number ? 'build-filled grade-' + grade : 'build-empty'}" points="${points}"/><text class="build-cell-number ${number ? 'is-filled' : ''}" x="${x}" y="${y + 4}">${disabled ? '×' : number || cellLabel([q, r])}</text></g>`;
  }).join('');
  const width = 1.5 * radius * (widthCells - 1) + 2 * radius + 12;
  const height = vertical * (heightCells - 0.5) + 2 * radius + 12;
  return `<svg class="build-board ${state.editing ? 'is-editing' : ''}" width="${Math.max(240,widthCells * 26)}" viewBox="${-radius - 6} ${-radius - 6} ${width} ${height}" role="group" aria-label="Upgrade board / 配裝面板，${widthCells} × ${heightCells}">${polygons}</svg>`;
}

export function renderBuildShape(shape, stacking, context = 'loadout') {
  const stackable = buildCopyLimit({stacking}, context) > 1;
  const title = 'Stackable in this mode / 目前模式可重複安裝';
  const drawing = shape ? renderHexPattern(shape.cells) : '<span>?</span>';
  return `<span class="build-shape-stack ${stackable ? 'is-stackable' : ''}" ${stackable ? `role="img" aria-label="${title}" title="${title}"` : ''}>${stackable ? `<span class="stack-layer stack-back" aria-hidden="true">${drawing}</span><span class="stack-layer stack-middle" aria-hidden="true">${drawing}</span>` : ''}<span class="stack-layer stack-front" aria-hidden="true">${drawing}</span>${stackable ? '<span class="build-stack-caption">可疊加</span>' : ''}</span>`;
}

const categoryNames = {characters:['Characters','角色'],weapons:['Weapons','武器'],grenades:['Grenades','手榴彈'],heavy:['Heavy weapons','重武器']};
const qualityNames = {Contraband:'違禁品',Oddity:'奇物',Exotic:'異域',Epic:'史詩',Rare:'稀有',Standard:'標準'};
const qualityOrder = Object.keys(qualityNames);
const iconMarkup = item => `<span class="build-upgrade-icon" aria-hidden="true">${item.icon ? `<img src="${esc(item.icon)}" alt="" loading="lazy" width="32" height="32">` : '<span title="Icon not recorded / 縮圖待補">◇</span>'}</span>`;

export function createBuildPlanner(root, catalogue, guide, getCollection, onOwnerChange = () => {}) {
  const drafts = new Map(), upgradeIndex = new Map(catalogue.upgrades.map(item => [item.id,item]));
  const shapeIndex = new Map((guide?.shapes?.patterns || []).flatMap(shape => shape.upgradeIds.map(id => [id,shape])));
  const owners = (guide?.equipment?.items || catalogue.owners).filter(item => Object.hasOwn(categoryNames,item.category)).map(item => ({...item,id:item.ownerId || item.id}));
  const lastOwners = new Map();
  let ownerId = owners.find(item => item.id === 'cycler')?.id || owners[0]?.id;
  let rules, loading, loadError = '', worker, timer, requestId = 0, active = false, dragId = '', pointerDrag = null;
  const state = () => { if (!drafts.has(ownerId)) drafts.set(ownerId,emptyDraft()); return drafts.get(ownerId); };
  const owner = () => owners.find(item => item.id === ownerId);
  const eligible = () => availableBuildUpgrades(catalogue,rules,ownerId);
  const quantityOf = id => state().selected.filter(instanceId => buildUpgradeId(instanceId) === id).length;
  const reasonFor = entry => reasonText[entry.reason === 'missing-shape' && upgradeIndex.get(buildUpgradeId(entry.id))?.emptyPattern ? 'empty-source-pattern' : entry.reason] || ['Not placed','未裝入'];
  const pieces = () => buildPackingPieces(state(),upgradeIndex,shapeIndex,rules);
  const stop = () => { requestId++; clearTimeout(timer); timer = null; worker?.terminate(); worker = null; state().running = false; state().pending = false; };
  const invalidate = () => { stop(); state().result = null; state().error = ''; };
  const focusKey = () => root.contains(document.activeElement) ? document.activeElement?.dataset.focus : null;
  const restoreFocus = key => { if (!key) return; const element = [...root.querySelectorAll('[data-focus]')].find(item => item.dataset.focus === key); (element?.disabled ? element.closest('[role="listitem"]') : element)?.focus({preventScroll:true}); };
  function preserveView(callback) {
    const focus = focusKey(), scrolls = [...root.querySelectorAll('[data-scroll]')].map(element => [element.dataset.scroll,element.scrollTop]);
    callback();
    for (const [key,scrollTop] of scrolls) { const element = root.querySelector(`[data-scroll="${key}"]`); if (element) element.scrollTop = scrollTop; }
    restoreFocus(focus);
  }
  function syncBoard() {
    const draft = state();
    if (!rules || draft.custom) return;
    const stage = buildBoardStage(rules,ownerId,draft);
    if (draft.width !== stage.Width || draft.height !== stage.Height) Object.assign(draft,{width:stage.Width,height:stage.Height,blocked:[],result:null});
  }
  function renderSettings() {
    const draft = state(), profile = rules.boardProfiles[ownerId], stage = buildBoardStage(rules,ownerId,draft);
    const boardSource = profile.levelSource === 'player' ? 'Player level / 玩家等級' : profile.levelSource === 'gear' ? 'Gear level / 裝備等級' : 'Fixed board / 固定面板';
    return `<details class="build-setup-panel" id="build-settings" open><summary><b>${esc(owner().nameEn)} <span class="zh-copy">${esc(owner().nameZh || '')}</span></b><span>Equipment & board / 裝備與面板設定</span></summary><div class="build-settings-body"><div class="build-category-buttons" role="group" aria-label="Equipment category / 裝備分類">${Object.entries(categoryNames).map(([key,names]) => `<button type="button" data-build-category="${key}" data-focus="category:${key}" aria-pressed="${owner().category === key}">${names[0]} <span class="zh-copy">${names[1]}</span></button>`).join('')}</div><div class="build-owner-buttons" role="group" aria-label="Choose equipment / 選擇裝備">${owners.filter(item => item.category === owner().category).map(item => `<button type="button" data-build-owner="${esc(item.id)}" data-focus="owner:${esc(item.id)}" aria-pressed="${item.id === ownerId}">${esc(item.nameEn)}<span class="zh-copy">${esc(item.nameZh || '')}</span></button>`).join('')}</div><div class="build-setting-grid"><fieldset><legend>Base board <span class="zh-copy">基礎面板</span></legend><p>${boardSource}</p><div class="build-stage-buttons" role="group" aria-label="Base board size / 基礎面板尺寸">${profile.stages.map((item,index) => `<button type="button" data-build-stage="${item.Level}" data-focus="stage:${item.Level}" aria-pressed="${!draft.custom && stage.Level === item.Level}"><b>${item.Width} × ${item.Height}</b><small>${profile.levelSource === 'fixed' ? 'Fixed / 固定' : `Lv.${Math.max(1,item.Level)}${index+1 < profile.stages.length ? '–'+(profile.stages[index+1].Level-1) : '+'}`}</small></button>`).join('')}</div></fieldset><fieldset><legend>Rotation <span class="zh-copy">最高可旋轉品質</span></legend><p>Match your player unlocks / 對照玩家已解鎖的旋轉</p><div class="build-rotation-buttons" role="group" aria-label="Rotation quality / 旋轉品質">${[['None',1],...Object.entries(rules.rotationUnlocks)] .map(([rarity,level],index,entries) => { const selected = draft.playerLevel >= level && (index === entries.length-1 || draft.playerLevel < entries[index+1][1]); return `<button type="button" class="${rarity === 'None' ? '' : 'grade-'+rarity.toLowerCase()}" data-build-rotation="${level}" data-focus="rotation:${level}" aria-pressed="${selected}" title="${rarity === 'None' ? 'No rotation / 尚未解鎖' : `Player Lv.${level}+ / 玩家等級 ${level} 起`}">${rarity === 'None' ? 'None' : rarity}<span class="zh-copy">${rarity === 'None' ? '未解鎖' : qualityNames[rarity]}</span></button>`; }).join('')}</div></fieldset></div><div class="build-mode-line" id="build-mode"><span>Mode / 配裝模式</span><div role="group" aria-label="Build mode / 配裝模式"><button type="button" data-build-context="loadout" data-focus="mode:loadout" aria-pressed="${draft.context === 'loadout'}">Loadout / 一般配裝</button><button type="button" data-build-context="mission" data-focus="mode:mission" aria-pressed="${draft.context === 'mission'}">In mission / 任務內配裝</button></div><small>${draft.context === 'mission' ? 'Mission-only duplicates enabled / 已開放任務限定多份；適用條件待核對' : 'Only freely stackable upgrades repeat / 僅一般可疊加配件可裝多份'}</small></div><details class="build-custom-settings"><summary>Custom board / 自訂面板</summary><label><input id="build-custom" type="checkbox" ${draft.custom ? 'checked' : ''}> Use custom size / 使用自訂尺寸</label>${draft.custom ? `<label>Columns / 欄 <input id="build-width" data-focus="width" type="number" min="1" max="12" value="${draft.width}"></label><label>Rows / 列 <input id="build-height" data-focus="height" type="number" min="1" max="12" value="${draft.height}"></label>` : ''}</details></div></details>`;
  }
  function renderPicker() {
    const target = root.querySelector('#build-options'); if (!target || !rules) return;
    const draft = state(), query = draft.query.trim().toLocaleLowerCase(), records = getCollection();
    const options = eligible().filter(item => (!query || `${item.nameEn} ${item.nameZh} ${item.descriptionEn} ${item.descriptionZh}`.toLocaleLowerCase().includes(query)) && (!draft.rarity || item.rarity === draft.rarity) && (!draft.collectedOnly || records[item.id]?.collected));
    root.querySelector('#build-option-count').textContent = `${options.length} types / 種`;
    target.innerHTML = options.map(item => {
      const quantity = quantityOf(item.id), rule = rules.rules[item.id], limit = buildCopyLimit(rule,draft.context), disabled = quantity >= limit || draft.selected.length >= 40;
      return `<article class="build-option grade-${item.rarity.toLowerCase()} ${quantity ? 'is-selected' : ''}" role="listitem" tabindex="-1" data-focus="source-row:${esc(item.id)}" title="${esc(item.rarity+' · '+item.descriptionEn+' / '+item.descriptionZh)}">${iconMarkup(item)}<div class="build-option-copy"><b>${esc(item.nameEn)}</b><span class="zh-copy">${esc(item.nameZh)}${quantity ? `<small class="build-picked-count"> ×${quantity}</small>` : ''}</span></div><span class="build-option-shape">${renderBuildShape(shapeIndex.get(item.id),rule.stacking,draft.context)}</span><button type="button" class="build-add" data-build-add="${esc(item.id)}" data-focus="add:${esc(item.id)}" aria-label="Add ${esc(item.nameEn)} / 加入" ${disabled ? 'disabled' : ''}>${quantity && limit === 1 ? '✓' : '+'}</button></article>`;
    }).join('') || '<p class="build-empty-note">No matching upgrades / 沒有符合的配件</p>';
  }
  function renderSelected() {
    const draft = state(), target = root.querySelector('#build-selected'); if (!target) return;
    const packingPieces = pieces(), result = draft.result;
    root.querySelector('#build-selected-count').textContent = `${draft.selected.length} / 40`;
    root.querySelector('[data-build-action="clear"]').disabled = !draft.selected.length;
    target.innerHTML = draft.selected.map((id,index) => {
      const item = upgradeIndex.get(buildUpgradeId(id)), rule = rules.rules[item.id], placement = result?.placements.find(entry => entry.id === id);
      const missed = result?.unplaced.find(entry => entry.id === id) || (packingPieces[index].exclusion ? {reason:packingPieces[index].exclusion} : null), reason = missed && reasonFor(missed);
      const status = placement ? `Placed · ${placement.turns*60}° / 已裝入` : reason ? reason[0] : draft.running || draft.pending ? 'Arranging… / 排放中' : 'Not arranged / 尚未排放';
      return `<article class="build-selected-row grade-${item.rarity.toLowerCase()} ${missed ? 'not-placed' : ''}" role="listitem" tabindex="-1" draggable="true" data-build-instance="${esc(id)}" data-drag-id="${esc(id)}" data-focus="row:${esc(id)}" aria-label="#${index+1} ${esc(item.nameEn)}"><span class="build-order" title="Drag to reorder / 拖曳排序"><span class="build-piece-key">${index+1}</span><span class="build-drag-handle" aria-hidden="true">⠿</span></span>${iconMarkup(item)}<div class="build-selected-copy" title="${esc(item.descriptionEn+' / '+item.descriptionZh)}"><b>${esc(item.nameEn)}</b><span class="zh-copy">${esc(item.nameZh)}</span><small class="build-item-status ${placement ? 'is-placed' : missed ? 'is-unplaced' : ''}" ${reason ? `title="${esc(reason[1])}"` : ''}>${esc(status)}</small>${rule.boardExpansion ? `<div class="build-expansion-choice" role="group" aria-label="Expansion of #${index+1} ${esc(item.nameEn)}"><button type="button" data-build-axis="${esc(id)}" data-axis="column" data-focus="axis-column:${esc(id)}" aria-pressed="${draft.expansionAxes[id] === 'column'}">+Column / 欄</button><button type="button" data-build-axis="${esc(id)}" data-axis="row" data-focus="axis-row:${esc(id)}" aria-pressed="${draft.expansionAxes[id] === 'row'}">+Row / 列</button></div>${!draft.expansionAxes[id] ? '<small class="build-item-status is-unplaced">Choose its roll / 請選遊戲內擴格方向</small>' : ''}` : ''}${rule.ouroborosOnly ? '<small class="build-item-status is-unplaced">Ouroboros only / 限 Ouroboros</small>' : ''}</div><div class="build-selected-actions"><button type="button" data-build-up="${esc(id)}" data-focus="up:${esc(id)}" aria-label="Move #${index+1} up / 向上移" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-build-down="${esc(id)}" data-focus="down:${esc(id)}" aria-label="Move #${index+1} down / 向下移" ${index === draft.selected.length-1 ? 'disabled' : ''}>↓</button><button type="button" data-build-remove="${esc(id)}" data-focus="remove:${esc(id)}" aria-label="Remove #${index+1} ${esc(item.nameEn)} / 移除">×</button></div></article>`;
    }).join('') || '<p class="build-empty-note">Add from the left →<br><span class="zh-copy">從配件清單加入，這裡會依序編號。</span></p>';
  }
  function renderOutput() {
    const draft = state(), result = draft.result, target = root.querySelector('#build-output'); if (!target) return;
    const toolsOpen = target.querySelector('.build-board-tools')?.open || draft.editing;
    const free = result?.boardCells ?? createBoard(draft.width,draft.height,draft.blocked).length;
    const inactive = pieces().filter(piece => piece.exclusion === 'stacking-restricted').length;
    let heading = 'Choose upgrades / 先加入配件', description = draft.autoFit ? 'Changes arrange automatically / 變更後會自動重排。' : 'Add upgrades, then Arrange / 加入配件後按重新排放。';
    if (draft.pending) { heading = 'Updating… / 準備更新'; description = 'Combining recent changes / 正在合併連續操作。'; }
    else if (draft.running) { heading = 'Arranging… / 正在排放'; description = 'Higher priorities first / 優先保留清單前面的配件。'; }
    else if (result) {
      heading = result.allFit ? 'All fit / 全部裝入' : `${result.placements.length} / ${result.selectedCount} placed / 已裝入`;
      description = result.limited ? 'Best so far · search longer to improve / 搜尋時間已到，可延長搜尋。' : 'Higher priorities kept first / 已優先保留清單前面的配件。';
      if (result.unplaced.length && result.unplaced.every(entry => entry.reason === 'stacking-restricted')) { heading = 'Active upgrades fit / 可用配件已裝入'; description = 'Extra copies inactive in this mode / 額外副本於目前模式暫停使用。'; }
    } else if (draft.selected.length && !draft.autoFit) { heading = 'Ready / 準備完成'; description = 'Press Arrange to update / 按重新排放更新配置。'; }
    const qualities = Object.fromEntries(draft.selected.map(id => [id,upgradeIndex.get(buildUpgradeId(id)).rarity]));
    const expansion = result?.expansionSteps?.length ? `<section class="build-expansion-summary"><h3>${draft.width} × ${draft.height} → ${result.board.width} × ${result.board.height}</h3><p>Install expanders first / 先依序裝入擴格配件</p><ol>${result.expansionSteps.map(step => `<li>#${draft.selected.indexOf(step.id)+1} · ${step.axis === 'column' ? '+Column / 欄' : '+Row / 列'} → ${step.after.width} × ${step.after.height}</li>`).join('')}</ol></section>` : '';
    target.setAttribute('aria-busy',String(draft.pending || draft.running));
    target.innerHTML = `<header class="build-column-heading"><h2>Board <span class="zh-copy">配裝面板</span></h2><span>${result?.board?.width || draft.width} × ${result?.board?.height || draft.height}</span></header><div class="build-result-heading ${result?.allFit ? 'is-success' : ''}" role="status" aria-live="polite"><h3>${heading}</h3><p>${description}</p>${draft.error ? `<p class="build-error" role="alert">${esc(draft.error)}</p>` : ''}</div><div class="build-metrics"><span><b>${result?.placements.length ?? '—'} / ${draft.selected.length}</b>placed / 裝入</span><span><b>${result?.usedCells ?? 0} / ${free}</b>cells / 格</span></div>${inactive ? `<p class="build-mode-warning">${inactive} inactive / ${inactive} 份額外副本暫停使用，不計入擴格。</p>` : ''}<div class="build-board-wrap">${renderBuildBoard({...draft,qualities})}</div><p class="build-board-caption">Numbers = middle list · colors = quality<br>編號對應中欄，顏色對應品質。</p>${expansion}${result?.unplaced.length ? `<section class="build-unplaced-summary"><h3>Not placed <span class="zh-copy">未裝入</span></h3><ul>${result.unplaced.map(entry => `<li><b>#${draft.selected.indexOf(entry.id)+1} ${esc(upgradeIndex.get(buildUpgradeId(entry.id)).nameEn)}</b><span title="${esc(reasonFor(entry)[1])}">${esc(reasonFor(entry)[0])}<span class="zh-copy">${esc(reasonFor(entry)[1])}</span></span></li>`).join('')}</ul></section>` : ''}<div class="build-solve-actions">${draft.running ? '<button type="button" data-build-action="cancel">Cancel / 取消</button>' : `${!draft.autoFit || draft.error ? `<button type="button" data-build-action="solve" ${!draft.selected.length || draft.pending ? 'disabled' : ''}>Arrange / 重新排放</button>` : ''}${result?.limited ? '<button type="button" data-build-action="longer">Search longer / 延長搜尋</button>' : ''}`}<button type="button" data-build-action="export" ${!result || draft.running || draft.pending ? 'disabled' : ''}>Export / 匯出</button></div><details class="build-board-tools" ${toolsOpen ? 'open' : ''}><summary>Board tools / 面板工具</summary><label><input id="build-edit" type="checkbox" ${draft.editing ? 'checked' : ''}> Unavailable cells / 標記不可用格</label><button type="button" data-build-action="reset-blocked" ${!draft.blocked.length ? 'disabled' : ''}>Reset cells / 還原格位</button></details>`;
  }
  function renderResults() { preserveView(() => { renderSelected(); renderOutput(); }); }
  function renderSources() {
    const draft = state();
    return `<details class="build-source-note"><summary>Rules, versions & sources / 規則、版本與來源</summary><p>Top-to-bottom priority: keep an earlier upgrade even if skipping it would fit more later ones. Expanders may be installed first to enable that layout. / 已選清單由上優先；必要時會犧牲後面的多件來保留前面的一件。擴格配件仍先依合法順序安裝，優先順序不等於實際安裝順序。不計算傷害與相鄰加成。</p><p>Base board follows ${rules.boardProfiles[ownerId].levelSource === 'player' ? 'player' : rules.boardProfiles[ownerId].levelSource === 'gear' ? 'gear' : 'fixed'} profile; rotation uses player unlocks. Set them independently to match your game. / 基礎面板與旋轉分開對照遊戲點選；旋轉不允許鏡射，Oddity／Contraband 採來源方向。PC ${esc(rules.source.gameVersion)} · Build ${esc(rules.source.buildId)} · ${sourceAnchor(rules.source.url,'Board & rotation source / 面板與旋轉來源 ↗')}</p><p>CanStack = Loadout duplicates; CanStackInMission = mission-only simulation. / 一般配裝僅開放 CanStack 多份，任務內配裝另開放 CanStackInMission；適用條件未實機核對，總計最多 40 份為運算上限。</p><p>Edge Fault / Boundary Incursion: select each copy’s Column or Row roll; the expander occupies a cell before growing right / down. / 逐份對照遊戲選加欄或加列，先占格才擴格。向右／下增加的座標解讀尚待實機核對。${sourceAnchor(rules.expansionSource.url,'Expansion source / 擴格來源 ↗')}。Multiversal Thievery／Handheld Pocket Universe 的跨面板與改形尚未計算。</p><p>Live fit: 180 ms debounce, 60,000 nodes / about 650 ms; search longer: 1,500,000 nodes / about 10 s. Search limits never prove impossibility. / 即時排放合併連續操作並取消舊搜尋，達上限只回報目前結果；延長搜尋可改善配置。</p>${draft.selected.length ? `<ul>${draft.selected.map((id,index) => { const item=upgradeIndex.get(buildUpgradeId(id)),shape=shapeIndex.get(item.id); return `<li>#${index+1} ${esc(item.nameEn)} · ${sourceAnchor(item.wikiUrl,'Wiki ↗')} ${shape ? `· Shape ${esc(shape.gameVersion || 'version not stated')} · ${sourceAnchor(shape.sourceUrl,'格形來源 ↗')}` : '· Coordinates pending / 格形待補'}</li>`; }).join('')}</ul>` : ''}<p>Choices stay for this visit; export to keep them. / 選擇僅保留本次開啟，請匯出留存；不改動收集紀錄。</p></details>`;
  }
  function render() {
    if (!active) return;
    if (!rules) { root.innerHTML = loadError ? `<p role="alert">${esc(loadError)}</p><button type="button" data-build-action="retry">Retry / 重試</button>` : '<p role="status">Loading build rules… / 正在載入配裝資料…</p>'; return; }
    syncBoard();
    const setupOpen = root.querySelector('.build-setup-panel')?.open ?? true, sourcesOpen = root.querySelector('.build-source-note')?.open || false, customOpen = root.querySelector('.build-custom-settings')?.open || state().custom;
    preserveView(() => {
      const draft = state();
      root.innerHTML = `${renderSettings()}<div class="build-workspace-heading" id="build-workspace"><h2>Build workspace <span class="zh-copy">配裝工作區</span></h2><div><a href="#build-settings" class="build-settings-link">${esc(owner().nameEn)} · ${draft.context === 'mission' ? 'In mission / 任務內' : 'Loadout / 一般'} ↗</a><label><input id="build-live" type="checkbox" ${draft.autoFit ? 'checked' : ''}> Live fit / 即時排放</label></div></div><nav class="build-mobile-links" aria-label="配裝欄位"><a href="#build-picker">1. Available / 配件</a><a href="#build-selected-panel">2. Selected / 已選</a><a href="#build-output">3. Board / 面板</a></nav><div class="build-layout"><section class="build-picker build-column" id="build-picker" aria-labelledby="build-picker-title"><header class="build-column-heading"><h2 id="build-picker-title">Available <span class="zh-copy">配件清單</span></h2><span id="build-option-count"></span></header><label class="build-search-label"><span class="sr-only">Search upgrades / 搜尋配件</span><input id="build-query" data-focus="query" type="search" maxlength="200" value="${esc(draft.query)}" placeholder="Name or effect / 名稱或效果"></label><div class="build-quality-filters" role="group" aria-label="Quality filter / 品質篩選"><button type="button" data-build-rarity="" aria-pressed="${!draft.rarity}">All / 全部</button>${qualityOrder.map(rarity => `<button type="button" class="grade-${rarity.toLowerCase()}" data-build-rarity="${rarity}" aria-label="${rarity} / ${qualityNames[rarity]}" aria-pressed="${draft.rarity === rarity}" title="${rarity} / ${qualityNames[rarity]}"><i></i>${rarity === 'Contraband' ? 'Contra.' : rarity === 'Standard' ? 'Std.' : rarity}</button>`).join('')}</div><label class="build-collected-label"><input id="build-collected" type="checkbox" ${draft.collectedOnly ? 'checked' : ''}> Collected only / 僅已收集</label><div id="build-options" data-scroll="available" class="build-list" role="list" aria-label="Available upgrades / 可用配件"></div></section><section class="build-selected-panel build-column" id="build-selected-panel" aria-labelledby="build-selected-title"><header class="build-column-heading"><h2 id="build-selected-title">Selected <span class="zh-copy">已選與優先順序</span></h2><span id="build-selected-count"></span><button type="button" data-build-action="clear">Clear / 清空</button></header><p class="build-priority-note">Top first · Drag or use ↑ ↓<br>由上優先；拖曳或用箭頭調整順序。</p><div id="build-selected" data-scroll="selected" class="build-list" role="list" aria-label="Selected upgrades by priority / 依優先順序排列的配件"></div><p class="sr-only" id="build-announcement" aria-live="polite"></p></section><section class="build-column" id="build-output" aria-label="Build result / 配裝結果"></section></div>${renderSources()}`;
      root.querySelector('.build-setup-panel').open = setupOpen;
      root.querySelector('.build-custom-settings').open = customOpen;
      root.querySelector('.build-source-note').open = sourcesOpen;
      renderPicker(); renderSelected(); renderOutput();
    });
  }
  function scheduleFit() {
    const draft = state();
    if (!active || !rules || !draft.autoFit || !draft.selected.length) return;
    clearTimeout(timer); draft.pending = true; renderResults();
    const expectedOwner = ownerId, expectedRequest = requestId;
    timer = setTimeout(() => { timer = null; if (active && ownerId === expectedOwner && requestId === expectedRequest) solve(false,true); },180);
  }
  function changed() { syncBoard(); render(); scheduleFit(); }
  async function load() {
    if (loading) return loading;
    loadError = ''; render();
    loading = (async () => {
      try { const response = await fetch('data/build-rules.json'); if (!response.ok) throw new Error('HTTP '+response.status); rules = validateBuildRules(await response.json(),catalogue); }
      catch (error) { loadError = error.message; }
      finally { loading = null; render(); scheduleFit(); }
    })();
    return loading;
  }
  function solve(longer = false, live = false) {
    stop(); const draft = state(); if (!draft.selected.length) return;
    const currentRequest = requestId, currentOwner = ownerId;
    draft.running = true; draft.error = ''; renderResults();
    try {
      worker = new Worker(new URL('./build-worker.js',import.meta.url),{type:'module'});
      worker.onmessage = event => {
        if (event.data.requestId !== requestId || currentOwner !== ownerId || !active) return;
        draft.running = false; draft.result = event.data.result || null; draft.error = event.data.error || ''; worker?.terminate(); worker = null; renderResults();
      };
      worker.onerror = () => { if (currentRequest !== requestId) return; draft.running = false; draft.error = 'Search failed; retry. / 排放失敗，請重試。'; worker?.terminate(); worker = null; renderResults(); };
      worker.postMessage({requestId:currentRequest,input:{board:createBoard(draft.width,draft.height,draft.blocked),baseBoard:{width:draft.width,height:draft.height,blocked:draft.blocked},pieces:pieces(),objective:'priority',maxNodes:longer ? 1500000 : live ? 60000 : 250000,timeLimitMs:longer ? 10000 : live ? 650 : 2500}});
    } catch (error) { draft.running = false; draft.error = error.message; renderResults(); }
  }
  function selectOwner(id) {
    if (!owners.some(item => item.id === id) || id === ownerId) return;
    lastOwners.set(owner().category,ownerId); stop(); ownerId = id; onOwnerChange(id); render();
    if (state().selected.length && !state().result) scheduleFit();
  }
  function addUpgrade(id) {
    if (!eligible().some(item => item.id === id)) return;
    try { setBuildQuantity(state(),id,quantityOf(id)+1,rules.rules[id]); invalidate(); changed(); }
    catch (error) { state().error = error.message; renderOutput(); }
  }
  function moveSelection(id,index) {
    if (!reorderBuildSelection(state(),id,index)) return false;
    invalidate(); changed(); root.querySelector('#build-announcement').textContent = `Moved to ${index+1} / 已移至第 ${index+1} 順位。`;
    return true;
  }
  function toggleCell(element) {
    if (!state().editing) return;
    const key = element.dataset.buildCell; invalidate();
    state().blocked = state().blocked.includes(key) ? state().blocked.filter(cell => cell !== key) : [...state().blocked,key]; changed();
  }
  root.addEventListener('click',event => {
    if (event.target.closest('.build-settings-link')) { event.preventDefault(); const panel = root.querySelector('.build-setup-panel'); panel.open = true; panel.scrollIntoView({block:'start'}); return; }
    const cell = event.target.closest('[data-build-cell]');
    if (cell) { if (state().editing) toggleCell(cell); else if (cell.dataset.buildInstance) { const button = root.querySelector(`[data-build-remove="${cell.dataset.buildInstance}"]`); button?.closest('.build-selected-row')?.scrollIntoView({block:'nearest'}); button?.focus({preventScroll:true}); } return; }
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.buildAction === 'retry') { void load(); return; }
    if (!rules) return;
    if (data.buildOwner) { selectOwner(data.buildOwner); return; }
    if (data.buildCategory) { if (owner().category !== data.buildCategory) selectOwner(lastOwners.get(data.buildCategory) || owners.find(item => item.category === data.buildCategory)?.id); return; }
    if (data.buildStage !== undefined) { const stage = rules.boardProfiles[ownerId].stages.find(item => item.Level === Number(data.buildStage)); if (stage) { invalidate(); Object.assign(state(),{custom:false,stage:stage.Level,boardLevel:stage.Level,blocked:[]}); changed(); } return; }
    if (data.buildRotation) { invalidate(); state().playerLevel = Number(data.buildRotation); changed(); return; }
    if (data.buildContext) { invalidate(); state().context = data.buildContext; changed(); return; }
    if (data.buildRarity !== undefined) { state().rarity = data.buildRarity; render(); return; }
    if (data.buildAdd) { addUpgrade(data.buildAdd); return; }
    if (data.buildRemove) { invalidate(); state().selected = state().selected.filter(id => id !== data.buildRemove); changed(); return; }
    if (data.buildUp || data.buildDown) { const id = data.buildUp || data.buildDown; moveSelection(id,state().selected.indexOf(id)+(data.buildUp ? -1 : 1)); return; }
    if (data.buildAxis) { invalidate(); state().expansionAxes[data.buildAxis] = data.axis; changed(); return; }
    const action = data.buildAction;
    if (action === 'solve' || action === 'longer') solve(action === 'longer');
    if (action === 'cancel') { stop(); state().error = 'Search cancelled / 已取消此次排放'; renderResults(); }
    if (action === 'clear') { invalidate(); state().selected = []; changed(); }
    if (action === 'reset-blocked') { invalidate(); state().blocked = []; changed(); }
    if (action === 'export' && state().result) {
      const draft = state(), backup = {appId:'mycopunk-build-layout',schemaVersion:2,ownerId,objective:'priority',context:draft.context,expansionAxes:draft.expansionAxes,expansionSource:rules.expansionSource,catalogueVersion:catalogue.datasetVersion,stackingSource:rules.stackingSource,board:{width:draft.width,height:draft.height,blocked:draft.blocked,level:draft.boardLevel},playerLevel:draft.playerLevel,source:rules.source,selected:draft.selected.map(buildUpgradeId),instances:draft.selected.map(id => ({id,upgradeId:buildUpgradeId(id)})),result:draft.result};
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})), link = document.createElement('a');
      link.href = url; link.download = `mycopunk-build-${ownerId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    }
  });
  root.addEventListener('input',event => { if (event.target.id === 'build-query') { state().query = event.target.value.slice(0,200); renderPicker(); } });
  root.addEventListener('change',event => {
    const target = event.target, draft = state();
    if (target.id === 'build-live') { stop(); draft.autoFit = target.checked; renderResults(); if (draft.autoFit) scheduleFit(); }
    if (target.id === 'build-collected') { draft.collectedOnly = target.checked; renderPicker(); }
    if (target.id === 'build-custom') { invalidate(); draft.custom = target.checked; draft.blocked = []; changed(); }
    if (target.id === 'build-width' || target.id === 'build-height') { const value = Number(target.value); if (!Number.isInteger(value) || value < 1 || value > 12) { stop(); draft.error = 'Use a whole number from 1 to 12 / 請輸入 1–12 整數'; renderResults(); return; } invalidate(); draft[target.id === 'build-width' ? 'width' : 'height'] = value; draft.blocked = []; changed(); }
    if (target.id === 'build-edit') { draft.editing = target.checked; renderOutput(); }
  });
  root.addEventListener('keydown',event => { const cell = event.target.closest('[data-build-cell]'); if (cell && state().editing && ['Enter',' '].includes(event.key)) { event.preventDefault(); toggleCell(cell); } });
  root.addEventListener('dragstart',event => { const row = event.target.closest('[data-drag-id]'); if (!row) return; stop(); dragId = row.dataset.dragId; event.dataTransfer.setData('text/plain',dragId); event.dataTransfer.effectAllowed = 'move'; row.classList.add('is-dragging'); });
  root.addEventListener('dragover',event => { const row = event.target.closest('[data-drag-id]'); if (!dragId || !row) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; root.querySelectorAll('.is-drop-target').forEach(item => item.classList.remove('is-drop-target')); row.classList.add('is-drop-target'); });
  root.addEventListener('drop',event => { const row = event.target.closest('[data-drag-id]'); if (!dragId || !row) return; event.preventDefault(); const id = dragId; dragId = ''; moveSelection(id,state().selected.indexOf(row.dataset.dragId)); });
  root.addEventListener('dragend',() => { dragId = ''; root.querySelectorAll('.is-dragging,.is-drop-target').forEach(row => row.classList.remove('is-dragging','is-drop-target')); renderResults(); if (state().autoFit && !state().result) scheduleFit(); });
  function updatePointerTarget() {
    if (!pointerDrag?.moved) return;
    const row = document.elementFromPoint(pointerDrag.x,pointerDrag.y)?.closest('[data-drag-id]');
    pointerDrag.target = row && root.contains(row) ? row.dataset.dragId : null;
    root.querySelectorAll('[data-drag-id]').forEach(element => { element.classList.toggle('is-dragging',element.dataset.dragId === pointerDrag.id); element.classList.toggle('is-drop-target',element.dataset.dragId === pointerDrag.target); });
  }
  function scrollDuringDrag() {
    if (!pointerDrag) return;
    if (pointerDrag.moved) {
      const list = root.querySelector('#build-selected'), rect = list.getBoundingClientRect();
      if (pointerDrag.x >= rect.left && pointerDrag.x <= rect.right) {
        const delta = pointerDrag.y < rect.top+30 ? -8 : pointerDrag.y > rect.bottom-30 ? 8 : 0;
        if (delta) { list.scrollTop += delta; updatePointerTarget(); }
      }
    }
    requestAnimationFrame(scrollDuringDrag);
  }
  root.addEventListener('pointerdown',event => {
    const handle = event.target.closest('.build-order'); if (!handle || event.button !== 0) return;
    event.preventDefault(); stop();
    pointerDrag = {id:handle.closest('[data-drag-id]').dataset.dragId,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false,target:null};
    root.setPointerCapture(event.pointerId); requestAnimationFrame(scrollDuringDrag);
  });
  root.addEventListener('pointermove',event => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    pointerDrag.x = event.clientX; pointerDrag.y = event.clientY;
    if (Math.hypot(event.clientX-pointerDrag.startX,event.clientY-pointerDrag.startY)>5) pointerDrag.moved = true;
    updatePointerTarget();
  });
  function finishPointerDrag(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const {id,target,moved} = pointerDrag; pointerDrag = null;
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    root.querySelectorAll('.is-dragging,.is-drop-target').forEach(row => row.classList.remove('is-dragging','is-drop-target'));
    const reordered = event.type === 'pointerup' && moved && target && moveSelection(id,state().selected.indexOf(target));
    if (!reordered) { renderResults(); if (state().autoFit && !state().result) scheduleFit(); }
  }
  root.addEventListener('pointerup',finishPointerDrag);
  root.addEventListener('pointercancel',finishPointerDrag);
  root.addEventListener('pointerover',event => { if (pointerDrag) return; const entry = event.target.closest('[data-build-instance]'); root.querySelectorAll('[data-build-instance]').forEach(element => element.classList.toggle('is-highlighted',Boolean(entry) && element.dataset.buildInstance === entry.dataset.buildInstance)); });
  root.addEventListener('pointerleave',() => root.querySelectorAll('.is-highlighted').forEach(element => element.classList.remove('is-highlighted')));
  return {
    show(requestedOwner) { active = true; if (requestedOwner && owners.some(item => item.id === requestedOwner) && requestedOwner !== ownerId) { stop(); ownerId = requestedOwner; } render(); if (!rules && !loading) void load(); else if (rules && state().selected.length && !state().result && !state().running) scheduleFit(); },
    hide() { active = false; pointerDrag = null; stop(); },
  };
}
