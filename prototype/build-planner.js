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
};
const cellLabel = ([q, r]) => { let column = '', n = q + 1; while (n) { column = String.fromCharCode(65 + (n - 1) % 26) + column; n = Math.floor((n - 1) / 26); } return column + (r + Math.floor(q / 2) + 1); };
const emptyDraft = () => ({ selected: [], nextInstance: 1, context: 'loadout', expansionAxes: {}, query: '', rarity: '', collectedOnly: false, stage: 10, playerLevel: 30, custom: false, width: 7, height: 6, blocked: [], editing: false, result: null, running: false, error: '' });

export const buildUpgradeId = instanceId => instanceId.split('@')[0];
export const buildCopyLimit = (rule, context) => rule.stacking === 'always' || (rule.stacking === 'mission' && context === 'mission') ? 40 : 1;
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
  const qualityOrder = ['Standard', 'Rare', 'Epic', 'Exotic', 'Oddity', 'Contraband'];
  return catalogue.upgrades.filter(item => !item.archived && (item.ownerId === ownerId || (item.ownerId === 'general' && !ownNames.has(item.nameEn) && rules.rules[item.id]?.genericOwners.includes(ownerId))))
    .sort((a, b) => Number(b.ownerId === ownerId) - Number(a.ownerId === ownerId) || qualityOrder.indexOf(a.rarity) - qualityOrder.indexOf(b.rarity) || a.nameEn.localeCompare(b.nameEn));
}

export function buildBoardStage(rules, ownerId, draft) {
  const profile = rules.boardProfiles[ownerId];
  const level = profile.levelSource === 'player' ? draft.playerLevel : profile.levelSource === 'fixed' ? 0 : draft.stage;
  return profile.stages.filter(stage => stage.Level <= level).at(-1) || profile.stages[0];
}

export function renderBuildBoard(state) {
  const radius = 16, vertical = Math.sqrt(3) * radius;
  const occupied = new Map();
  for (const placement of state.result?.placements || []) {
    const number = state.selected.indexOf(placement.id) + 1;
    placement.cells.forEach(cell => occupied.set(cell.join(','), number));
  }
  const blocked = new Set(state.blocked);
  const widthCells = state.result?.board?.width || state.width, heightCells = state.result?.board?.height || state.height;
  const baseKeys = new Set(createBoard(state.width, state.height).map(cell => cell.join(',')));
  const cells = createBoard(widthCells, heightCells);
  const polygons = cells.map(([q, r]) => {
    const x = 1.5 * radius * q, y = vertical * (r + q / 2), key = [q, r].join(',');
    const number = occupied.get(key), disabled = blocked.has(key);
    const points = Array.from({ length: 6 }, (_, i) => `${(x + radius * Math.cos(i * Math.PI / 3)).toFixed(2)},${(y + radius * Math.sin(i * Math.PI / 3)).toFixed(2)}`).join(' ');
    return `<g data-build-cell="${key}" ${!baseKeys.has(key) ? 'class="build-added-cell"' : ''} ${state.editing ? `role="button" tabindex="0" aria-pressed="${disabled}" aria-label="${cellLabel([q, r])} ${disabled ? 'unavailable / 不可用' : 'available / 可用'}"` : ''}><title>${cellLabel([q, r])}${!baseKeys.has(key) ? ' · Expanded / 擴格' : ''}${number ? ' · #' + number : ''}</title><polygon class="build-cell ${disabled ? 'build-blocked' : number ? 'piece-color-' + ((number - 1) % 10) : 'build-empty'}" points="${points}"/><text class="build-cell-number ${number ? 'is-filled' : ''}" x="${x}" y="${y + 4}">${disabled ? '×' : number || cellLabel([q, r])}</text></g>`;
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

export function createBuildPlanner(root, catalogue, guide, getCollection, onOwnerChange = () => {}) {
  const drafts = new Map(), upgradeIndex = new Map(catalogue.upgrades.map(item => [item.id, item]));
  const shapeIndex = new Map((guide?.shapes?.patterns || []).flatMap(shape => shape.upgradeIds.map(id => [id, shape])));
  const reasonFor = entry => reasonText[entry.reason === 'missing-shape' && upgradeIndex.get(buildUpgradeId(entry.id))?.emptyPattern ? 'empty-source-pattern' : entry.reason];
  const owners = (guide?.equipment?.items || catalogue.owners).filter(item => ['characters', 'weapons', 'grenades', 'heavy'].includes(item.category)).map(item => ({ ...item, id: item.ownerId || item.id }));
  let ownerId = owners.find(item => item.id === 'cycler')?.id || owners[0]?.id, rules, loading, loadError = '', worker, requestId = 0, active = false;
  const state = () => { if (!drafts.has(ownerId)) drafts.set(ownerId, emptyDraft()); return drafts.get(ownerId); };
  const stop = () => { requestId++; worker?.terminate(); worker = null; if (ownerId) state().running = false; };
  const invalidate = () => { stop(); state().result = null; state().error = ''; };
  const eligible = () => availableBuildUpgrades(catalogue, rules, ownerId);
  const quantityOf = upgradeId => state().selected.filter(id => buildUpgradeId(id) === upgradeId).length;
  const copyCaption = instanceId => {
    const copies = state().selected.filter(id => buildUpgradeId(id) === buildUpgradeId(instanceId));
    return copies.length > 1 ? ` · copy ${copies.indexOf(instanceId) + 1}/${copies.length} / 第 ${copies.indexOf(instanceId) + 1} 份` : '';
  };
  function updateQuantity(upgradeId, quantity) {
    if (!eligible().some(item => item.id === upgradeId)) return;
    try { setBuildQuantity(state(), upgradeId, quantity, rules.rules[upgradeId]); invalidate(); }
    catch (error) { state().error = error.message; }
    render();
  };

  const syncBoard = () => {
    if (!rules || state().custom) return;
    const draft = state(), stage = buildBoardStage(rules, ownerId, draft);
    const stageSelect = root.querySelector('#build-stage');
    if (stageSelect) stageSelect.value = String(stage.Level);
    if (draft.width !== stage.Width || draft.height !== stage.Height) Object.assign(draft, { width: stage.Width, height: stage.Height, blocked: [], result: null });
  };

  function renderPicker() {
    if (!rules || !root.querySelector('#build-options')) return;
    const draft = state(), query = draft.query.toLocaleLowerCase().trim(), records = getCollection();
    const options = eligible().filter(item => (!query || `${item.nameEn} ${item.nameZh} ${item.descriptionEn} ${item.descriptionZh}`.toLocaleLowerCase().includes(query)) && (!draft.rarity || item.rarity === draft.rarity) && (!draft.collectedOnly || records[item.id]?.collected));
    root.querySelector('#build-option-count').textContent = `${options.length} types / 種 · ${draft.selected.length} / 40 copies / 份`;
    root.querySelector('#build-options').innerHTML = options.map(item => {
      const shape = shapeIndex.get(item.id), rule = rules.rules[item.id], quantity = quantityOf(item.id), selected = quantity > 0;
      const limit = buildCopyLimit(rule, draft.context), inputId = `build-pick-${item.id}`;
      const stackingTitle = limit > 1 ? 'Stackable in this mode / 目前模式可重複安裝' : rule.stacking === 'mission' ? 'One copy in Loadout mode / 一般配裝限一份' : rule.stacking === 'unknown' ? 'Stacking not recorded / 疊加規則未記載' : 'Single copy / 單件安裝';
      return `<div class="build-option grade-${item.rarity.toLowerCase()} ${selected ? 'is-selected' : ''}" title="${esc(item.rarity)} · ${stackingTitle}${rule.boardExpansion ? ' · Grid expander / 擴格配件' : rule.geometryModifier ? ' · Board modifier / 面板效果未計算' : ''}${rule.ouroborosOnly ? ' · Ouroboros only / 限 Ouroboros' : ''}"><input id="${esc(inputId)}" type="checkbox" aria-label="${esc(item.nameEn)} / ${esc(item.nameZh)} · ${esc(item.rarity)}" data-build-pick="${esc(item.id)}" ${selected ? 'checked' : ''} ${!selected && draft.selected.length >= 40 ? 'disabled' : ''}><label for="${esc(inputId)}" class="build-option-copy"><b>${esc(item.nameEn)}</b><span class="zh-copy">${esc(item.nameZh)}</span></label><label for="${esc(inputId)}" class="build-option-shape">${renderBuildShape(shape, rule.stacking, draft.context)}</label>${(rule.geometryModifier && !rule.boardExpansion) || rule.ouroborosOnly || quantity > limit ? '<span class="build-special-marker" title="Special restrictions; see selected list / 特殊限制，見所選清單" aria-label="特殊限制">!</span>' : ''}${quantity > limit ? `<p class="build-inactive-copies">${quantity - limit} inactive / ${quantity - limit} 份暫停</p>` : ''}${selected && (limit > 1 || quantity > 1) ? `<div class="build-option-quantity" role="group" aria-label="Copies of ${esc(item.nameEn)} / 份數"><button type="button" data-build-sub="${esc(item.id)}" aria-label="Remove one ${esc(item.nameEn)} / 減一份">−</button><output aria-label="Quantity of ${esc(item.nameEn)} / 份數">${quantity}</output><button type="button" data-build-add="${esc(item.id)}" aria-label="Add one ${esc(item.nameEn)} / 加一份" ${quantity >= limit || draft.selected.length >= 40 ? 'disabled' : ''}>＋</button></div>` : ''}</div>`;
    }).join('') || '<p class="data-note">No matching upgrades. / 沒有符合的配件；可清除篩選。</p>';
  }

  function renderOutput() {
    const draft = state(), result = draft.result, selected = draft.selected.map(instanceId => ({ ...upgradeIndex.get(buildUpgradeId(instanceId)), instanceId }));
    const baseFree = createBoard(draft.width, draft.height, draft.blocked).length, free = result?.boardCells ?? baseFree;
    const inactiveIds = new Set(buildPackingPieces(draft, upgradeIndex, shapeIndex, rules).filter(piece => piece.exclusion === 'stacking-restricted').map(piece => piece.id));
    const activeAllFit = result?.unplaced.length > 0 && result.unplaced.every(entry => entry.reason === 'stacking-restricted');
    const expanders = selected.filter(item => rules.rules[item.id].boardExpansion);
    const expansionControls = expanders.length ? `<section class="build-expansion-controls"><h3>Expansion rolls <span class="zh-copy">擴格屬性</span></h3><p>Match each copy to your game. / 逐份對照遊戲選擇，不會自動更改屬性。</p>${expanders.map(item => `<label><span>${esc(item.nameEn)}${copyCaption(item.instanceId)}</span><select data-build-axis="${esc(item.instanceId)}" aria-label="Expansion of ${esc(item.nameEn)}${copyCaption(item.instanceId)}"><option value="">Choose / 請選擇</option><option value="column" ${draft.expansionAxes[item.instanceId] === 'column' ? 'selected' : ''}>+1 Column / 加一欄</option><option value="row" ${draft.expansionAxes[item.instanceId] === 'row' ? 'selected' : ''}>+1 Row / 加一列</option></select></label>`).join('')}</section>` : '';
    const expansionSummary = result?.expansionSteps?.length ? `<section class="build-expansion-summary"><h3>${draft.width} × ${draft.height} → ${result.board.width} × ${result.board.height} <span class="zh-copy">實際面板</span></h3><p>+${free - baseFree} cells unlocked / 新增 ${free - baseFree} 格；擴格配件本身也占格。虛線外框為新增格。</p><ol>${result.expansionSteps.map(step => `<li>#${draft.selected.indexOf(step.id) + 1} ${esc(upgradeIndex.get(buildUpgradeId(step.id)).nameEn)} · ${step.axis === 'column' ? '+1 Column / 加一欄' : '+1 Row / 加一列'} → ${step.after.width} × ${step.after.height}</li>`).join('')}</ol><p>Install in this order, then place the rest. / 先依上列順序裝入，再放其餘配件。</p></section>` : '';
    const totalCells = selected.reduce((sum, item) => sum + (shapeIndex.get(item.id)?.cellCount || 0), 0);
    root.querySelector('#build-output').setAttribute('aria-busy', String(draft.running));
    let heading = 'Ready to arrange / 準備排放', description = 'Choose upgrades, then run Auto-fit. / 選好配件後按自動排放。';
    if (draft.running) { heading = 'Searching… / 正在搜尋'; description = 'You can cancel, or change a selection to stop. / 可取消，變更選擇也會停止此次搜尋。'; }
    else if (result) {
      heading = result.allFit ? 'All selected upgrades fit / 全部放得下' : `${result.placements.length} / ${result.selectedCount} placed / 已裝入`;
      description = result.limited ? 'Best layout found so far; optimality is unproven. / 目前找到的配置；尚未證明是最多可裝數量。' : result.allFit ? 'Every selected shape is inside the board with no overlaps. / 全部選擇均在面板內，沒有重疊。' : 'Maximum number placed among calculable upgrades; ties prefer more occupied cells. / 已確認可計算項目的最多裝入數；同數量時優先使用較多格。';
      if (activeAllFit) { heading = 'All active upgrades fit / 本模式可用配件皆已裝入'; description = `${result.unplaced.length} extra ${result.unplaced.length === 1 ? 'copy is' : 'copies are'} inactive in this mode. / 另有 ${result.unplaced.length} 份額外配件暫停使用，沒有計入面板。`; }
    }
    root.querySelector('#build-output').innerHTML = `<div class="build-result-heading ${result?.allFit ? 'is-success' : ''}" role="status" aria-live="polite"><h2>${heading}</h2><p>${description}</p>${draft.error ? `<p class="build-error" role="alert">${esc(draft.error)}</p>` : ''}</div><div class="build-solve-actions"><button type="button" class="primary-button" data-build-action="solve" ${draft.running || !selected.length ? 'disabled' : ''}>Auto-fit / 自動排放</button>${draft.running ? '<button type="button" data-build-action="cancel">Cancel / 取消搜尋</button>' : result?.limited ? '<button type="button" data-build-action="longer">Search longer / 延長搜尋</button>' : ''}<button type="button" data-build-action="export" ${!result || draft.running ? 'disabled' : ''}>Export layout / 匯出配置</button></div>${expansionControls}<div class="build-metrics"><span><b>${result?.placements.length ?? '—'}</b> placed / 裝入</span><span><b>${result?.usedCells ?? 0} / ${free}</b> cells / 可用格</span><span><b>${draft.selected.length}</b> selected / 已選</span></div><p class="data-note">Selected shapes total ${totalCells} cells / 已知所選格形共 ${totalCells} 格${totalCells > free ? ' · Exceeds available cells / 已超過可用格數' : ''}</p>${result?.unplaced.length ? `<section class="build-unplaced-summary"><h3>Not placed <span class="zh-copy">未裝入項目</span></h3><ul>${result.unplaced.map(entry => `<li><b>${esc(upgradeIndex.get(buildUpgradeId(entry.id))?.nameEn)}${copyCaption(entry.id)}</b><span class="zh-copy">${esc(upgradeIndex.get(buildUpgradeId(entry.id))?.nameZh)}</span><small>${esc(reasonFor(entry)[0])}</small></li>`).join('')}</ul><p>See each item below for its reason. / 下方逐項說明原因；未搜到與無法計算不等於已證明放不下。</p></section>` : ''}${expansionSummary}<div class="build-board-wrap">${renderBuildBoard(draft)}</div><div class="build-board-tools"><label><input id="build-edit" type="checkbox" ${draft.editing ? 'checked' : ''}> Edit unavailable cells / 標記不可用格</label><button type="button" data-build-action="reset-blocked" ${!draft.blocked.length ? 'disabled' : ''}>Reset cells / 還原格位</button></div><p class="data-note">Numbers match the selected list. × cells are unavailable. / 圖中數字對應所選清單；× 表示不可用格。</p><section class="build-selected"><div class="section-heading"><h3>Selected upgrades <span class="zh-copy">所選配件</span></h3><button type="button" data-build-action="clear" ${!selected.length ? 'disabled' : ''}>Clear / 清空</button></div>${selected.map((item, index) => {
      const placement = result?.placements.find(entry => entry.id === item.instanceId), missed = result?.unplaced.find(entry => entry.id === item.instanceId) || (inactiveIds.has(item.instanceId) ? {reason:'stacking-restricted'} : null), reason = missed && reasonFor(missed);
      const shape = shapeIndex.get(item.id);
      return `<article class="build-selected-row ${missed ? 'not-placed' : ''}"><span class="build-piece-key piece-color-${index % 10}">${index + 1}</span><div><h4>${esc(item.nameEn)}<span class="zh-copy">${esc(item.nameZh)}</span></h4>${copyCaption(item.instanceId) ? `<small class="build-copy-caption">${copyCaption(item.instanceId)}</small>` : ''}${placement ? `<p class="build-placed-status">Placed · ${placement.turns * 60}° / 已裝入</p><p class="build-cell-list">${placement.cells.map(cellLabel).join(' · ')}</p>` : reason ? `<p class="build-unplaced-status">${reason[0]}</p><p class="data-note">${reason[1]}</p>` : '<p class="data-note">Not arranged / 尚未排放</p>'}${rules.rules[item.id].ouroborosOnly ? '<p class="data-note">Ouroboros only / 限 Ouroboros 模式</p>' : ''}${shape ? `<small class="data-note">Shape ${esc(shape.gameVersion || 'version not stated')} · ${sourceAnchor(shape.sourceUrl, 'Source / 格形來源 ↗')}</small>` : ''}</div><button type="button" data-build-remove="${esc(item.instanceId)}" aria-label="Remove ${esc(item.nameEn)} / 移除">×</button></article>`;
    }).join('') || '<p class="data-note">No upgrades selected. / 尚未選擇配件。</p>'}</section>${result ? `<p class="data-note">${result.elapsedMs} ms · ${result.nodes.toLocaleString()} search nodes / 搜尋節點</p>` : ''}`;
  }

  function render() {
    if (!active) return;
    if (!rules) { root.innerHTML = loadError ? `<div class="empty-state"><h2>Build planner unavailable / 配裝資料無法載入</h2><p>${esc(loadError)}</p><button type="button" data-build-action="retry">Retry / 重試</button></div>` : '<p role="status">Loading build rules… / 正在載入配裝資料…</p>'; return; }
    syncBoard();
    const draft = state(), pickerScroll = root.querySelector('#build-options')?.scrollTop || 0;
    const profile = rules.boardProfiles[ownerId], currentStage = buildBoardStage(rules, ownerId, draft);
    const inactiveCount = buildPackingPieces(draft, upgradeIndex, shapeIndex, rules).filter(piece => piece.exclusion === 'stacking-restricted').length;
    const modeControls = `<fieldset id="build-mode" class="build-mode"><legend>Build mode <span class="zh-copy">配裝模式</span></legend><div class="build-mode-options"><label class="build-mode-option ${draft.context === 'loadout' ? 'is-active' : ''}"><input type="radio" name="build-context" value="loadout" ${draft.context === 'loadout' ? 'checked' : ''}><span><b>Loadout <span class="zh-copy">一般配裝</span></b><small>Only freely stackable upgrades repeat.<span class="zh-copy">僅一般可疊加配件能裝多份。</span></small></span></label><label class="build-mode-option ${draft.context === 'mission' ? 'is-active' : ''}"><input type="radio" name="build-context" value="mission" ${draft.context === 'mission' ? 'checked' : ''}><span><b>In mission <span class="zh-copy">任務內配裝</span></b><small>Also allow mission-only duplicates.<span class="zh-copy">另開放任務限定的多份安裝。</span></small></span></label></div><p class="build-mode-hint">Overlapping shapes = multiple copies allowed in this mode. / 重疊格形＝目前模式可裝多份。${draft.context === 'mission' ? '<span class="zh-copy">任務內配裝依資料旗標提供模擬，實際適用條件尚待核對。</span>' : ''}</p>${inactiveCount ? `<p class="build-mode-warning" role="status">${inactiveCount} extra ${inactiveCount === 1 ? 'copy' : 'copies'} inactive / ${inactiveCount} 份額外配件暫停使用。<span class="zh-copy">已保留選擇；不會裝入或提供擴格，可切回任務內配裝繼續使用。</span></p>` : ''}</fieldset>`;
    const categoryNames = {characters:'Characters / 角色',weapons:'Weapons / 武器',grenades:'Grenades / 手榴彈',heavy:'Heavy weapons / 重武器'};
    const options = Object.keys(categoryNames).map(category => `<optgroup label="${categoryNames[category]}">${owners.filter(item => item.category === category).map(item => `<option value="${esc(item.id)}" ${item.id === ownerId ? 'selected' : ''}>${esc(item.nameEn)} / ${esc(item.nameZh || '')}${catalogue.upgrades.some(upgrade => upgrade.ownerId === item.id) ? '' : ' · Wiki 暫無清單'}</option>`).join('')}</optgroup>`).join('');
    root.innerHTML = `<section class="build-setup" aria-label="配裝設定"><label class="build-owner-label">Equipment / 裝備<select id="build-owner">${options}</select></label><label>${profile.levelSource === 'player' ? 'Board · player level / 面板・依玩家等級' : profile.levelSource === 'fixed' ? 'Heavy board / 重武器面板' : 'Board · gear level / 面板・裝備等級'}<select id="build-stage" ${draft.custom || profile.levelSource !== 'gear' ? 'disabled' : ''}>${profile.stages.map((stage, i) => `<option value="${stage.Level}" ${currentStage.Level === stage.Level ? 'selected' : ''}>Lv.${Math.max(1, stage.Level)}${i + 1 < profile.stages.length ? '–' + (profile.stages[i + 1].Level - 1) : '+'} · ${stage.Width} × ${stage.Height}</option>`).join('')}</select></label><label>Player level · rotation / 玩家等級・旋轉<input id="build-player" type="number" min="1" max="200" value="${draft.playerLevel}"></label><label class="build-custom-label"><input id="build-custom" type="checkbox" ${draft.custom ? 'checked' : ''}> Custom board / 自訂面板</label>${draft.custom ? `<label>Columns / 欄<input id="build-width" type="number" min="1" max="12" value="${draft.width}"></label><label>Rows / 列<input id="build-height" type="number" min="1" max="12" value="${draft.height}"></label>` : ''}</section>${modeControls}<details class="build-source-note"><summary>Rules & sources / 規則與來源</summary><span>PC ${esc(rules.source.gameVersion)} · Build ${esc(rules.source.buildId)} · ${sourceAnchor(rules.source.url, 'Board & rotation source / 面板與旋轉來源 ↗')}</span><p>Edge Fault / Boundary Incursion: each copy adds one Column or Row, matching its in-game roll. Expanders are installed first and occupy cells. / 每份依遊戲屬性加一欄或一列，先裝入再擴格，配件本身占格；右側追加欄、下側追加列的規則尚待實機核對。PC ${esc(rules.expansionSource.gameVersion)} · ${sourceAnchor(rules.expansionSource.url, 'Expansion source / 擴格來源 ↗')}。Multiversal Thievery／Handheld Pocket Universe 的跨面板與改形尚未計算。</p><p>Characters use player level; weapons and grenades use gear level. Heavy weapons use a fixed 5×5 board. Player level controls rotation. / 角色面板隨玩家等級，武器與手榴彈隨裝備等級；重武器固定 5×5。玩家等級控制旋轉，特殊面板可自訂，不允許鏡射。</p><p>Fit optimization only: maximizes upgrade count, then occupied cells. Stat bonuses are not simulated. / 以裝入數量優先，再比較占格數；不計算傷害或相鄰加成。可疊加配件可選多份，總計最多 40 份。CanStack 允許一般配裝重複；CanStackInMission 僅在「任務內配裝」模式開放，適用模式請對照遊戲。疊加規則依各配件 Wiki 修訂的技術旗標解讀，適用模式未實機核對；每份使用同一份已收錄格形，不模擬效果數值疊加。</p></details><div class="build-layout"><section class="build-picker" aria-labelledby="build-picker-title"><div class="build-picker-heading"><h2 id="build-picker-title">Choose upgrades <span class="zh-copy">挑選配件</span></h2><a class="build-mode-badge" href="#build-mode">${draft.context === 'mission' ? 'In mission / 任務內配裝' : 'Loadout / 一般配裝'}</a></div><a class="build-view-link" href="#build-output">View layout → / 查看配置</a><div class="build-picker-tools"><label class="build-search-label">Search / 搜尋<input id="build-query" type="search" maxlength="200" value="${esc(draft.query)}" placeholder="Name or effect / 名稱或效果"></label><div class="build-picker-filters"><label>Quality / 品質<select id="build-rarity"><option value="">All / 全部</option>${['Standard', 'Rare', 'Epic', 'Exotic', 'Oddity', 'Contraband'].map(value => `<option ${draft.rarity === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label><input id="build-collected" type="checkbox" ${draft.collectedOnly ? 'checked' : ''}> Collected only / 僅已收集</label></div></div><div class="build-quality-legend" aria-label="品質顏色"><span class="grade-standard"><i></i>Standard</span><span class="grade-rare"><i></i>Rare</span><span class="grade-epic"><i></i>Epic</span><span class="grade-exotic"><i></i>Exotic</span><span class="grade-oddity"><i></i>Oddity</span><span class="grade-contraband"><i></i>Contraband</span></div><p id="build-option-count" class="data-note"></p><div id="build-options"></div></section><section id="build-output" aria-label="配置結果"></section></div><p class="data-note">Selections stay during this visit; export to keep a layout. Rotation uses catalogue quality; shape versions are listed per item. / 選擇暫存於本次開啟，重整會重設；可匯出留存。旋轉依圖鑑品質，格形版本逐項標示，尚未實機核對。</p>`;
    renderPicker(); renderOutput();
    root.querySelector('#build-options').scrollTop = pickerScroll;
  }

  async function load() {
    if (loading) return loading;
    loadError = ''; render();
    loading = (async () => {
      try { const response = await fetch('data/build-rules.json'); if (!response.ok) throw new Error('HTTP ' + response.status); rules = validateBuildRules(await response.json(), catalogue); }
      catch (error) { loadError = error.message; }
      finally { loading = null; render(); }
    })();
    return loading;
  }
  function solve(longer = false) {
    stop(); const draft = state();
    if (!draft.selected.length) return;
    const currentRequest = requestId, currentOwner = ownerId;
    draft.running = true; draft.error = ''; renderOutput();
    try {
      worker = new Worker(new URL('./build-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = event => {
        if (event.data.requestId !== requestId || currentOwner !== ownerId || !active) return;
        draft.running = false; draft.result = event.data.result || null; draft.error = event.data.error || ''; worker?.terminate(); worker = null; renderOutput();
      };
      worker.onerror = () => { if (currentRequest !== requestId) return; draft.running = false; draft.error = 'Search could not run. Please retry. / 搜尋無法執行，請重試。'; worker?.terminate(); worker = null; renderOutput(); };
      worker.postMessage({ requestId: currentRequest, input: { board: createBoard(draft.width, draft.height, draft.blocked), baseBoard: {width:draft.width,height:draft.height,blocked:draft.blocked}, pieces: buildPackingPieces(draft, upgradeIndex, shapeIndex, rules), maxNodes: longer ? 1500000 : 250000, timeLimitMs: longer ? 10000 : 2500 } });
    } catch (error) { draft.running = false; draft.error = error.message; renderOutput(); }
  }
  function toggleCell(element) {
    if (!state().editing) return;
    const key = element.dataset.buildCell; invalidate();
    state().blocked = state().blocked.includes(key) ? state().blocked.filter(cell => cell !== key) : [...state().blocked, key];
    renderOutput(); root.querySelector(`[data-build-cell="${key}"]`)?.focus();
  }
  root.addEventListener('click', event => {
    if (event.target.closest('.build-view-link')) { event.preventDefault(); root.querySelector('#build-output').scrollIntoView({ block: 'start' }); return; }
    const cell = event.target.closest('[data-build-cell]'); if (cell) { toggleCell(cell); return; }
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.buildAdd || button.dataset.buildSub) { const id = button.dataset.buildAdd || button.dataset.buildSub; updateQuantity(id, quantityOf(id) + (button.dataset.buildAdd ? 1 : -1)); root.querySelector(`[data-build-${button.dataset.buildAdd ? 'add' : 'sub'}="${id}"]`)?.focus({ preventScroll: true }); return; }
    if (button.dataset.buildRemove) { invalidate(); state().selected = state().selected.filter(id => id !== button.dataset.buildRemove); render(); }
    const action = button.dataset.buildAction;
    if (action === 'solve' || action === 'longer') solve(action === 'longer');
    if (action === 'cancel') { stop(); state().error = 'Search cancelled. / 已取消搜尋。'; renderOutput(); }
    if (action === 'clear') { invalidate(); state().selected = []; render(); }
    if (action === 'reset-blocked') { invalidate(); state().blocked = []; renderOutput(); }
    if (action === 'retry') void load();
    if (action === 'export' && state().result) {
      const draft = state(), backup = { appId: 'mycopunk-build-layout', schemaVersion: 2, ownerId, context: draft.context, expansionAxes: draft.expansionAxes, expansionSource: rules.expansionSource, catalogueVersion: catalogue.datasetVersion, stackingSource: rules.stackingSource, board: { width: draft.width, height: draft.height, blocked: draft.blocked }, playerLevel: draft.playerLevel, source: rules.source, selected: draft.selected.map(buildUpgradeId), instances: draft.selected.map(id => ({ id, upgradeId: buildUpgradeId(id) })), result: draft.result };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `mycopunk-build-${ownerId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  root.addEventListener('keydown', event => { const cell = event.target.closest('[data-build-cell]'); if (cell && state().editing && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggleCell(cell); } });
  root.addEventListener('input', event => {
    const target = event.target;
    if (target.id === 'build-query') { state().query = target.value.slice(0, 200); renderPicker(); }
    if (['build-player', 'build-width', 'build-height'].includes(target.id)) {
      invalidate(); const value = Number(target.value), maximum = target.id === 'build-player' ? 200 : 12;
      if (target.value && Number.isInteger(value) && value >= 1 && value <= maximum) {
        state()[target.id === 'build-player' ? 'playerLevel' : target.id === 'build-width' ? 'width' : 'height'] = value;
        if (target.id !== 'build-player') state().blocked = [];
      } else state().error = `Enter a whole number from 1 to ${maximum}. / 請輸入 1–${maximum} 的整數。`;
      syncBoard(); renderPicker(); renderOutput();
    }
  });
  root.addEventListener('change', event => {
    const target = event.target, draft = state();
    if (target.dataset.buildAxis) {
      const id = target.dataset.buildAxis;
      if (!draft.selected.includes(id) || !rules.rules[buildUpgradeId(id)]?.boardExpansion || !['', 'column', 'row'].includes(target.value)) return;
      invalidate(); draft.expansionAxes[id] = target.value; renderOutput(); root.querySelector(`[data-build-axis="${id}"]`)?.focus({preventScroll:true});
    }
    if (target.dataset.buildPick) {
      const id = target.dataset.buildPick; if (!eligible().some(item => item.id === id)) return;
      updateQuantity(id, target.checked ? 1 : 0); root.querySelector(`[data-build-pick="${id}"]`)?.focus({ preventScroll: true });
    }
    if (target.name === 'build-context' && target.checked) { if (!['loadout','mission'].includes(target.value)) return; invalidate(); draft.context = target.value; render(); root.querySelector(`input[name="build-context"][value="${draft.context}"]`)?.focus({preventScroll:true}); }
    if (target.id === 'build-owner') { stop(); ownerId = target.value; onOwnerChange(ownerId); render(); }
    if (target.id === 'build-stage') { invalidate(); const stage = rules.boardProfiles[ownerId].stages.find(item => item.Level === Number(target.value)); if (stage) Object.assign(draft, { stage: stage.Level, width: stage.Width, height: stage.Height, blocked: [] }); render(); }
    if (target.id === 'build-player') { invalidate(); const value = Number(target.value); if (Number.isInteger(value) && value >= 1 && value <= 200) draft.playerLevel = value; render(); }
    if (target.id === 'build-custom') { invalidate(); draft.custom = target.checked; if (!draft.custom) { const stage = buildBoardStage(rules, ownerId, draft); draft.width = stage.Width; draft.height = stage.Height; draft.blocked = []; } render(); }
    if (['build-width', 'build-height'].includes(target.id)) { const value = Number(target.value); invalidate(); if (Number.isInteger(value) && value >= 1 && value <= 12) { draft[target.id === 'build-width' ? 'width' : 'height'] = value; draft.blocked = []; } render(); }
    if (target.id === 'build-rarity') { draft.rarity = target.value; renderPicker(); }
    if (target.id === 'build-collected') { draft.collectedOnly = target.checked; renderPicker(); }
    if (target.id === 'build-edit') { draft.editing = target.checked; renderOutput(); }
  });
  return {
    show(requestedOwner) { active = true; if (requestedOwner && owners.some(item => item.id === requestedOwner) && requestedOwner !== ownerId) { stop(); ownerId = requestedOwner; } render(); if (!rules && !loading) void load(); },
    hide() { active = false; stop(); },
  };
}
