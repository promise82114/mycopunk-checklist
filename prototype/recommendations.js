import { normalizeSearch } from './model.js';

export const recommendationTiers = ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function validateRecommendations(data, catalogue) {
  const require = (condition, message) => { if (!condition) throw new Error('推薦資料：' + message); };
  require(data?.schemaVersion === 1, '版本不支援');
  for (const key of ['sources', 'weaponRatings', 'upgradeRatings', 'guides']) require(Array.isArray(data[key]), key + ' 格式不符');
  const owners = new Map(catalogue.owners.filter(owner => owner.category === 'weapons').map(owner => [owner.id, owner]));
  const upgrades = new Map(catalogue.upgrades.map(upgrade => [upgrade.id, upgrade]));
  const sources = new Map();
  for (const source of data.sources) {
    require(!sources.has(source.id), '來源 ID 重複');
    const url = new URL(source.url);
    require(url.protocol === 'https:' && url.hostname === 'tiermaker.com' && url.pathname.startsWith('/list/random/'), '來源網址不符');
    require(source.author && source.title && /^\d{4}-\d{2}-\d{2}$/.test(source.verifiedOn), '來源欄位不完整');
    require(source.gameVersion === null || typeof source.gameVersion === 'string', '版本欄位不符');
    if (source.versionEvidence === 'not-stated') require(source.gameVersion === null, '未註明版本的來源不可填入推測版本');
    else require(source.versionEvidence === 'list-title' && source.title.includes(source.gameVersion), '版本未能對照來源標題');
    require(['weapons', 'upgrades'].includes(source.kind), '來源類型不符');
    if (source.kind === 'upgrades') require(owners.has(source.ownerId), '來源所屬武器不存在');
    sources.set(source.id, source);
  }
  const weaponKeys = new Set();
  const upgradeKeys = new Set();
  for (const rating of data.weaponRatings) {
    require(owners.has(rating.ownerId) && sources.get(rating.sourceId)?.kind === 'weapons', '武器評價歸屬不符');
    require(recommendationTiers.includes(rating.tier), '未知武器分級');
    const key = rating.sourceId + '/' + rating.ownerId;
    require(!weaponKeys.has(key), '同一來源的武器分級重複');
    weaponKeys.add(key);
  }
  for (const rating of data.upgradeRatings) {
    const source = sources.get(rating.sourceId);
    require(upgrades.get(rating.upgradeId)?.ownerId === rating.ownerId && source?.kind === 'upgrades' && source.ownerId === rating.ownerId, '配件評價歸屬不符');
    require(recommendationTiers.includes(rating.tier), '未知配件分級');
    const key = rating.sourceId + '/' + rating.upgradeId;
    require(!upgradeKeys.has(key), '同一來源的配件分級重複');
    upgradeKeys.add(key);
  }
  const guideOwners = new Set();
  for (const guide of data.guides) {
    require(owners.has(guide.ownerId) && !guideOwners.has(guide.ownerId), '武器搭配說明歸屬重複或不存在');
    require(sources.get(guide.sourceId)?.ownerId === guide.ownerId, '搭配說明未連到對應榜單');
    require(guide.basis === 'editorial-from-workbook-effects' && guide.testedInGame === false, '搭配說明必須標示為未實測的效果整理');
    require(guide.effectsDatasetVersion === (catalogue.legacyDatasetVersion || catalogue.datasetVersion) && guide.summaryEn && guide.summaryZh, '搭配說明缺少來源版本或雙語摘要');
    require(Array.isArray(guide.routes) && guide.routes.length > 0, '缺少搭配方向');
    const routeIds = new Set();
    for (const route of guide.routes) {
      require(route.id && !routeIds.has(route.id), '搭配方向 ID 重複');
      routeIds.add(route.id);
      for (const field of ['titleEn', 'titleZh', 'explanationEn', 'explanationZh', 'tradeoffEn', 'tradeoffZh', 'contextEn', 'contextZh']) require(typeof route[field] === 'string' && route[field].trim(), '搭配方向缺少雙語說明');
      require(Array.isArray(route.coreIds) && route.coreIds.length > 0 && Array.isArray(route.supportIds), '核心與輔助配件格式不符');
      const ids = [...route.coreIds, ...route.supportIds];
      require(new Set(ids).size === ids.length, '同一搭配重複列出配件');
      require(ids.every(id => upgrades.get(id)?.ownerId === guide.ownerId), '搭配引用了其他武器或不存在的配件');
    }
    guideOwners.add(guide.ownerId);
  }
  const expectedGuides = catalogue.legacyWeaponOwnerIds || [...owners.keys()];
  require(guideOwners.size === expectedGuides.length && expectedGuides.every(id => guideOwners.has(id)), '武器搭配說明未完整覆蓋原榜單裝備');
  for (const [key, array] of [['sources', data.sources], ['weaponRatings', data.weaponRatings], ['upgradeRatings', data.upgradeRatings], ['guides', data.guides]]) require(data.counts?.[key] === array.length, '統計數量不符');
  return {
    sources, owners, upgrades,
    guides: new Map(data.guides.map(guide => [guide.ownerId, guide])),
    upgradeRatings: new Map(data.upgradeRatings.map(rating => [rating.upgradeId, rating])),
  };
}

export function selectRankedUpgrades(data, index, ownerId, state, records) {
  const query = normalizeSearch(state.query || '').trim();
  return data.upgradeRatings.filter(rating => {
    if (rating.ownerId !== ownerId) return false;
    if (state.tier === 'top' && !['SS', 'S', 'A'].includes(rating.tier)) return false;
    if (state.tier !== 'top' && state.tier !== 'all' && rating.tier !== state.tier) return false;
    if (state.missing && records[rating.upgradeId]?.collected) return false;
    const upgrade = index.upgrades.get(rating.upgradeId);
    return !query || normalizeSearch([upgrade.nameEn, upgrade.nameZh, upgrade.descriptionEn, upgrade.descriptionZh, records[upgrade.id]?.note || ''].join(' ')).includes(query);
  });
}

export function routeCollection(route, records) {
  const ids = [...new Set([...route.coreIds, ...route.supportIds])];
  const collected = ids.filter(id => records[id]?.collected).length;
  return { collected, total: ids.length, missingIds: ids.filter(id => !records[id]?.collected) };
}

export function tierBadge(tier) {
  return `<span class="tier-badge tier-${tier.toLowerCase()}">${tier}</span>`;
}

export function sourceVersion(source) {
  return source.gameVersion ? `Version ${escapeHtml(source.gameVersion)} / 來源標題標示` : 'Version not stated / 來源未註明版本';
}

export function sourceLink(source, label = source.title) {
  return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
}

function bilingual(en, zh) {
  return `<div class="bilingual-copy"><p lang="en">${escapeHtml(en)}</p><p lang="zh-Hant" class="zh-copy">${escapeHtml(zh)}</p></div>`;
}

function comparisonMarkup(data, index, state, selectedOwner) {
  const sources = data.sources.filter(source => source.kind === 'weapons' && (state.source === 'both' || source.id === state.source));
  const sortSource = state.source === 'carson-weapons-1-4-6' ? state.source : 'no-you-weapons';
  const sorted = [...index.owners.values()].sort((a, b) => {
    const aTier = data.weaponRatings.find(rating => rating.ownerId === a.id && rating.sourceId === sortSource)?.tier;
    const bTier = data.weaponRatings.find(rating => rating.ownerId === b.id && rating.sourceId === sortSource)?.tier;
    return (aTier ? recommendationTiers.indexOf(aTier) : 99) - (bTier ? recommendationTiers.indexOf(bTier) : 99);
  });
  const table = `<div class="rec-comparison-controls"><label>Show sources / 顯示來源<select id="rec-source"><option value="both" ${state.source === 'both' ? 'selected' : ''}>Compare both / 並列兩榜</option>${data.sources.filter(source => source.kind === 'weapons').map(source => `<option value="${source.id}" ${state.source === source.id ? 'selected' : ''}>${source.author} · ${source.gameVersion || 'version not stated'}</option>`).join('')}</select></label><span>Sorted by ${sortSource === 'no-you-weapons' ? 'No You' : 'Carson Kong'} / 依該作者分級排序</span></div>
    <div class="rec-table-wrap"><table class="rec-table"><caption>Weapon tier comparison / 武器分級對照</caption><thead><tr><th scope="col">Weapon / 武器</th>${sources.map(source => `<th scope="col">${escapeHtml(source.author)}<span>${source.gameVersion ? 'v' + escapeHtml(source.gameVersion) : 'Version not stated'}</span></th>`).join('')}<th scope="col"><span class="sr-only">Upgrade guide / 配件搭配</span></th></tr></thead><tbody>${sorted.map(owner => `<tr ${selectedOwner === owner.id ? 'class="rec-selected-weapon"' : ''}><th scope="row"><button type="button" data-recommend-owner="${owner.id}">${escapeHtml(owner.nameEn)}<span class="zh-copy">${escapeHtml(owner.nameZh)}</span></button></th>${sources.map(source => { const rating = data.weaponRatings.find(rating => rating.sourceId === source.id && rating.ownerId === owner.id); return `<td>${rating ? tierBadge(rating.tier) : '<span class="rec-unranked">Not listed<br>來源未列入</span>'}</td>`; }).join('')}<td><button class="rec-open-guide" type="button" data-recommend-owner="${owner.id}" aria-label="${escapeHtml(owner.nameEn)} upgrade guide / 配件搭配">Guide <span>搭配 →</span></button></td></tr>`).join('')}</tbody></table></div>
    <p class="rec-fineprint">Source scales are kept separately; tiers are not averaged. No You also lists four heavy-weapon icons outside this catalogue.<br>兩榜分級各自保留，不合成平均分數。No You 榜另外列出四個現有圖鑑未收錄的重武器圖示。</p>`;
  return selectedOwner
    ? `<details class="rec-overview" ${state.comparisonOpen ? 'open' : ''}><summary>Compare all 12 weapons / 展開 12 把武器分級對照</summary>${table}</details>`
    : `<section class="rec-overview">${table}</section>`;
}

function routeMarkup(route, index, records) {
  const progress = routeCollection(route, records);
  const upgradeList = (ids, label) => ids.length ? `<div class="rec-route-upgrades"><h4>${label}</h4>${ids.map(id => {
    const upgrade = index.upgrades.get(id);
    const rating = index.upgradeRatings.get(id);
    return `<div class="rec-route-upgrade"><button type="button" data-detail="${id}">${escapeHtml(upgrade.nameEn)}<span class="zh-copy">${escapeHtml(upgrade.nameZh)}</span></button><div>${rating ? tierBadge(rating.tier) : ''}<span class="rec-owned ${records[id]?.collected ? 'owned' : ''}">${records[id]?.collected ? 'Collected / 已取得' : 'Missing / 未取得'}</span></div></div>`;
  }).join('')}</div>` : '';
  return `<article class="rec-route"><div class="rec-route-heading"><h3>${escapeHtml(route.titleEn)}<span class="zh-copy">${escapeHtml(route.titleZh)}</span></h3><span class="rec-route-progress">${progress.collected}/${progress.total} collected<br>已取得 ${progress.collected}，尚缺 ${progress.missingIds.length}</span></div><div class="rec-context">${escapeHtml(route.contextEn)}<span class="zh-copy">${escapeHtml(route.contextZh)}</span></div>${bilingual(route.explanationEn, route.explanationZh)}${upgradeList(route.coreIds, 'Core / 核心配件')}${upgradeList(route.supportIds, 'Support / 輔助配件')}<div class="rec-tradeoff"><h4>Conditions & tradeoffs / 條件與代價</h4>${bilingual(route.tradeoffEn, route.tradeoffZh)}</div></article>`;
}

export function renderRecommendations(root, data, index, catalogue, records, selectedOwner, state, renderUpgrade) {
  const owner = index.owners.get(selectedOwner);
  const guide = index.guides.get(selectedOwner);
  const source = guide ? index.sources.get(guide.sourceId) : null;
  const sourcesMarkup = `<div class="rec-source-grid">${data.sources.filter(source => source.kind === 'weapons').map(source => `<article class="rec-source-card"><span class="eyebrow">WEAPON TIERS / 武器榜</span><h3>${escapeHtml(source.author)}</h3><p>${sourceVersion(source)}</p>${sourceLink(source)}<span class="rec-verified">Checked ${source.verifiedOn} / 核對日期</span></article>`).join('')}</div>`;
  let guideMarkup = '<div class="rec-select-prompt"><h2>Choose a weapon <span>選一把武器查看配件</span></h2><p>Open a guide from the table or the equipment directory.<br>從分級表或裝備索引選擇武器，即可查看配件榜與搭配方向。</p></div>';
  if (owner && !guide) guideMarkup = '<div class="rec-select-prompt"><h2>No source ranking / 來源未列入</h2><p>This weapon has no guide in the checked tier lists. / 本次查核的榜單未提供此武器的配件分級，不推測推薦。</p></div>';
  if (guide) {
    const ratings = selectRankedUpgrades(data, index, selectedOwner, state, records);
    const totalRanked = data.upgradeRatings.filter(rating => rating.ownerId === selectedOwner).length;
    const ownerTotal = catalogue.upgrades.filter(upgrade => upgrade.ownerId === selectedOwner).length;
    guideMarkup = `<section id="upgrade-guide" class="rec-guide" aria-labelledby="rec-guide-title"><div class="rec-guide-heading"><div><span class="eyebrow">UPGRADE GUIDE / 配件搭配</span><h2 id="rec-guide-title">${escapeHtml(owner.nameEn)}</h2></div><button type="button" data-recommend-owner="all">All weapons / 返回武器對照</button></div>${bilingual(guide.summaryEn, guide.summaryZh)}<div class="rec-guide-source"><strong>${escapeHtml(source.author)} · ${sourceLink(source, source.title + ' upgrade tiers')}</strong><p>${sourceVersion(source)} · Checked ${source.verifiedOn}</p><p>Pairing notes below are editorial interpretations of Workbook v1.6 effects, not combinations endorsed by the tier-list author. Current-release behavior and grid fit are unverified.<br>下方搭配為本站依原表效果整理，未經遊戲實測；尚未核對正式版效果、疊加或棋盤可否裝入。下方資料列已採用新版 Wiki 效果，可能與舊推薦內容不同。</p></div><h3 class="rec-section-heading">Pairing directions <span>搭配方向</span><span class="rec-editorial">EDITORIAL / 本站效果整理</span></h3><div class="rec-routes">${guide.routes.map(route => routeMarkup(route, index, records)).join('')}</div><section class="rec-upgrade-ranking" aria-labelledby="rec-upgrades-title"><h3 id="rec-upgrades-title">${escapeHtml(source.author)} upgrade tiers <span>配件分級</span></h3><p class="rec-fineprint">${totalRanked}/${ownerTotal} catalogue records appear in this list. Unlisted upgrades have no inferred tier.<br>圖鑑 ${ownerTotal} 筆中，榜單列出 ${totalRanked} 筆；其餘配件不推測評級。稀有度與社群分級是不同資訊。</p><div class="rec-ranking-controls"><label>Tier / 社群分級<select id="rec-tier"><option value="top" ${state.tier === 'top' ? 'selected' : ''}>S + A / 前段配件</option><option value="all" ${state.tier === 'all' ? 'selected' : ''}>All tiers / 全部分級</option>${recommendationTiers.filter(tier => data.upgradeRatings.some(rating => rating.ownerId === selectedOwner && rating.tier === tier)).map(tier => `<option value="${tier}" ${state.tier === tier ? 'selected' : ''}>${tier}</option>`).join('')}</select></label><label class="rec-missing-control"><input id="rec-missing" type="checkbox" ${state.missing ? 'checked' : ''}>Missing only / 只看未取得</label></div><p class="rec-match-count" role="status">${ratings.length} upgrades / 筆符合條件</p><div id="rec-upgrade-list">${ratings.map(rating => `<div class="rec-rated-upgrade"><div class="rec-rating-label">${tierBadge(rating.tier)}<span>${escapeHtml(source.author)} · ${sourceLink(source, 'Tier source / 分級來源')}</span></div>${renderUpgrade(index.upgrades.get(rating.upgradeId))}</div>`).join('') || '<div class="empty-state"><h3>No matching upgrades / 沒有符合條件的配件</h3><p>Try all tiers or turn off Missing only.<br>可改選全部分級或關閉「只看未取得」。</p></div>'}</div></section></section>`;
  }
  root.innerHTML = `<div class="rec-introduction"><p class="rec-provenance">Source snapshots · ${data.verifiedOn} <span>來源核對日期</span></p>${sourcesMarkup}<p class="rec-scope-note">The authors provide ratings without item-by-item rationale or test conditions. Each list keeps its own version label.<br>作者提供分級，未提供逐項理由或測試情境。舊版與未註明版本的評價皆保留來源標示，尚未確認適用正式版。</p></div>${comparisonMarkup(data, index, state, selectedOwner)}${guideMarkup}`;
}
