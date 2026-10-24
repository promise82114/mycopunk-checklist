import { rarityLabels, upgradeStacking } from './model.js';
import { renderHexPattern } from './patterns.js';

export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const dual = (en, zh, className = '') => `<div class="dual ${className}"><p lang="en">${escapeHtml(en)}</p>${zh ? `<p lang="zh-Hant" class="zh-copy">${escapeHtml(zh)}</p>` : ''}</div>`;
export const wikiCategories = [
  ['characters', 'Characters', '角色', 'Abilities, movement & team roles', '能力、移動方式與隊伍定位'],
  ['weapons', 'Weapons', '武器', 'Firing modes, traits & upgrades', '射擊模式、特色與升級配件'],
  ['grenades', 'Grenades', '手榴彈', 'Elements, utility & crowd control', '元素效果、功能與控場'],
  ['heavy', 'Heavy weapons', '重武器', 'Special firepower & ammunition', '特殊火力與彈藥機制'],
];

export function sourceAnchor(url, label = 'Mycopunk Wiki ↗') {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['mycopunk.miraheze.org', 'tiermaker.com', 'www.reddit.com', 'reddit.com', 'steamcommunity.com', 'www.youtube.com', 'youtu.be', 'github.com', 'raw.githubusercontent.com'].includes(parsed.hostname)) return '';
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  } catch { return ''; }
}

export function categoryArt(category) {
  const paths = {
    characters: '<rect x="47" y="22" width="66" height="51" rx="17"/><path d="M60 22V10m40 12V10M58 83l-20 24m64-24 20 24M51 119l8-36h42l8 36M70 51h2m18 0h2M72 64h16"/>',
    weapons: '<path d="M24 53h75l13-13h24v39h-29l-12-9H66l-8 33H40l9-33H24zM113 53h36M70 53V37h24v16M29 58v9"/>',
    grenades: '<path d="M69 35h28v16M72 35V20h24l17 17-4 23M62 52h37l12 17v33l-17 20H65l-17-20V69zM61 77h36M61 95h36M80 61v48"/>',
    heavy: '<path d="M19 56h100v31H19zM39 56V40h52v16m28 7h35v17h-35M42 87l-8 27h22l12-27m14 0 13 20h20L99 87M27 66h70M107 60v23"/>',
  };
  return `<svg viewBox="0 0 170 140" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[category] || paths.weapons}</svg>`;
}

export function validateWikiEquipment(data) {
  if (!data || !Array.isArray(data.items) || !data.checkedOn) throw new Error('裝備介紹資料格式不符');
  const ids = new Set();
  for (const item of data.items) {
    if (!item.ownerId || ids.has(item.ownerId) || !wikiCategories.some(([id]) => id === item.category) || !item.summaryEn || !item.summaryZh || !item.acquisition?.textEn || !item.acquisition?.textZh || !sourceAnchor(item.sourceUrl)) throw new Error('裝備介紹欄位不完整');
    ids.add(item.ownerId);
  }
  return data;
}

export function validateFieldGuide(data, catalogue) {
  if (data?.schemaVersion !== 1) throw new Error('攻略資料版本不支援');
  validateWikiEquipment(data.equipment);
  const upgrades = new Map(catalogue.upgrades.map(upgrade => [upgrade.id, upgrade]));
  const patternIds = new Set();
  if (!Array.isArray(data.shapes?.patterns) || !Array.isArray(data.unlocks?.mechanics) || !Array.isArray(data.unlocks?.upgrades)) throw new Error('攻略索引不完整');
  for (const pattern of data.shapes.patterns) {
    if (pattern.coordinateSystem !== 'axial-flat-top' || !pattern.cells?.length || pattern.cells.length !== pattern.cellCount || !sourceAnchor(pattern.sourceUrl)) throw new Error('格形資料不符');
    if (!pattern.cells.every(cell => Array.isArray(cell) && cell.length === 2 && cell.every(n => Number.isInteger(n) && Math.abs(n) < 100))) throw new Error('格點座標無效');
    if (new Set(pattern.cells.map(cell => cell.join(','))).size !== pattern.cellCount) throw new Error('格點重複');
    for (const id of pattern.upgradeIds) {
      if (!upgrades.has(id) || patternIds.has(id)) throw new Error('格形配件歸屬不符或重複');
      patternIds.add(id);
    }
  }
  for (const mechanism of data.unlocks.mechanics) {
    if (!mechanism.titleEn || !mechanism.titleZh || !mechanism.summaryEn || !mechanism.summaryZh || !sourceAnchor(mechanism.sourceUrl)) throw new Error('解鎖來源不完整');
  }
  for (const unlock of data.unlocks.upgrades) if (upgrades.get(unlock.upgradeId)?.ownerId !== unlock.ownerId || !sourceAnchor(unlock.sourceUrl)) throw new Error('取得條件歸屬不符');
  return data;
}

export function renderShape(shape, size, workbookSize = size, emptyPattern = false) {
  if (shape?.cells?.length) {
    return `${renderHexPattern(shape.cells)}<span>${shape.cells.length} cells / 六角格</span><span class="shape-unknown">Wiki ${escapeHtml(shape.gameVersion || 'version not stated')}${workbookSize != null && workbookSize !== shape.cells.length ? `<br>Excel: ${workbookSize} cells / 格<br><strong>Count differs / 格數不同</strong>` : ''}</span>${sourceAnchor(shape.sourceUrl, 'Source / 來源 ↗')}`;
  }
  if (emptyPattern) return '<span class="shape-unknown">Source pattern is empty<br><span class="zh-copy">來源圖檔為空，未推測占格</span></span>';
  return `<span class="cell-count">${size ?? '—'} <small>cells / 格</small></span><span class="shape-unknown">Workbook cell count only<br><span class="zh-copy">僅原表占格數</span><br>Coordinates pending<br><span class="zh-copy">格形座標待補；不代表 Wiki 無圖</span></span>`;
}

export function renderUpgrade(upgrade, owner, record, options = {}) {
  const { storageBlocked, checklist, unlock, shape, rating } = options;
  const stats = upgrade.stats.map(stat => `<div class="stat"><span>${escapeHtml(stat.nameEn)}<small class="zh-copy">${escapeHtml(stat.nameZh)}</small></span><b>${escapeHtml(stat.display || [stat.minRaw, stat.maxRaw].filter(Boolean).join(' → ') || '—')}</b></div>`).join('');
  const turbo = upgrade.turbochargeEn && upgrade.turbochargeEn !== 'n/a' ? `<div class="inline-turbo"><span class="cell-label">TURBOCHARGE / 增幅</span>${dual(upgrade.turbochargeEn, upgrade.turbochargeZh)}</div>` : '';
  const unlockMarkup = unlock ? `<div class="inline-unlock"><span class="cell-label">${escapeHtml(unlock.kindEn || 'Unlock condition')} / ${escapeHtml(unlock.kindZh || '解鎖條件')}</span>${dual(unlock.conditionEn, unlock.conditionZh)}${sourceAnchor(unlock.sourceUrl, 'Condition source / 條件來源 ↗')}</div>` : '';
  const acquisitionMarkup = upgrade.acquisitionEn ? `<div class="inline-unlock"><span class="cell-label">ACQUISITION / 取得方式</span>${dual(upgrade.acquisitionEn, upgrade.acquisitionZh)}</div>` : '';
  const stacking = upgradeStacking(upgrade);
  const stackingMarkup = `<small class="upgrade-stacking">${{ always: 'Stackable / 可重複安裝', mission: 'In-mission stacking / 任務內可疊加', single: 'Single copy / 單件安裝', unknown: 'Stacking not recorded / 疊加規則未記載' }[stacking]}</small>`;
  return `<article class="upgrade-row ${record?.collected ? 'is-collected' : ''}" id="upgrade-${upgrade.id}" data-upgrade="${upgrade.id}">
    <label class="collect-control" title="Mark collected / 標記已收集"><input type="checkbox" data-collect="${upgrade.id}" ${record?.collected ? 'checked' : ''} ${storageBlocked ? 'disabled' : ''} aria-label="Collected / 已取得：${escapeHtml(upgrade.nameEn)}"></label>
    <div class="upgrade-identity">${upgrade.icon ? `<div class="upgrade-icon"><img src="${escapeHtml(upgrade.icon)}" alt="" loading="lazy" width="38" height="38"></div>` : ''}<div><h3>${escapeHtml(upgrade.nameEn)}</h3><p class="zh-copy">${escapeHtml(upgrade.nameZh)}</p><span class="rarity rarity-${upgrade.rarity.toLowerCase()}">${upgrade.rarity} <span class="zh-copy">${rarityLabels[upgrade.rarity]}</span></span>${stackingMarkup}${upgrade.archived ? '<small class="data-note">Archived Workbook entry / 舊表保留項目</small>' : ''}${options.showOwner ? `<button type="button" class="owner-link" data-owner="${owner.id}">${escapeHtml(owner.nameEn)} →</button>` : ''}${rating || ''}${checklist ? `<button type="button" class="track-button ${record?.tracked ? 'is-tracked' : ''}" data-track="${upgrade.id}" aria-pressed="${Boolean(record?.tracked)}">${record?.tracked ? '★ Tracked / 追蹤中' : '☆ Track / 追蹤'}</button>` : ''}</div></div>
    <div class="upgrade-effect"><span class="cell-label mobile-label">EFFECT / 效果</span>${dual(upgrade.descriptionEn, upgrade.descriptionZh)}${turbo}${acquisitionMarkup}${unlockMarkup}<div class="upgrade-source">${sourceAnchor(upgrade.wikiUrl, 'Wiki revision ↗')}<span>${upgrade.source.kind === 'wiki' ? `Checked ${escapeHtml(upgrade.source.checkedOn)} · 遊戲版本未註明` : `${escapeHtml(upgrade.source.sheet)} · row ${upgrade.source.row}`}</span></div></div>
    <div class="upgrade-stats"><span class="cell-label mobile-label">STATISTICS / 數值</span>${stats || '<span class="muted">Not listed / 原表未列數值</span>'}</div>
    <div class="upgrade-shape"><span class="cell-label mobile-label">PATTERN / 形狀</span>${renderShape(shape, upgrade.size, Object.hasOwn(upgrade, 'workbookSize') ? upgrade.workbookSize : upgrade.size, upgrade.emptyPattern)}</div>
  </article>`;
}

export const upgradeHeader = '<div class="upgrade-table-head" aria-hidden="true"><span>✓</span><span>UPGRADE & QUALITY<br>名稱與品質</span><span>EFFECT & CONDITIONS<br>效果與觸發條件</span><span>STATISTICS<br>數值</span><span>PATTERN<br>形狀</span></div>';
