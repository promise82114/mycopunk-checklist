import { storageKey, beforeImportKey, maxBackupBytes, rarities, rarityLabels, tagLabels, emptyCollection, parseCollection, mergeCollections, makeBackup, buildSearchIndex, filterUpgrades, sortUpgrades } from './model.js';
import { validateRecommendations, renderRecommendations } from './recommendations.js';
import { escapeHtml, dual, wikiCategories, categoryArt, sourceAnchor, validateFieldGuide, renderUpgrade, upgradeHeader } from './wiki.js';

const $ = selector => document.querySelector(selector);
let dataset, fieldGuide, recommendations, recommendationIndex, profiles, ownersById, searchIndex, upgradeIds;
let recommendationStatus = 'idle';
let recommendationError = '';
let collection = emptyCollection();
let storageBlocked = false, storageWritable = true, rawStorage = null, pendingImport = null, toastTimer;
let wikiError = '';
const defaults = { view: 'home', category: 'all', owner: '', query: '', rarity: '', tag: '', status: 'all', sort: 'source' };
const filters = { ...defaults };
const recommendationState = { source: 'both', tier: 'top', missing: false, comparisonOpen: false };
const categoryName = id => wikiCategories.find(([key]) => key === id) || [id, 'General upgrades', '通用升級'];
const scopeUpgrades = () => dataset.upgrades.filter(u => (filters.category === 'all' || u.category === filters.category) && (!filters.owner || u.ownerId === filters.owner));
const countCollected = upgrades => upgrades.filter(u => collection.records[u.id]?.collected).length;

function showToast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function readStorage() {
  try {
    rawStorage = localStorage.getItem(storageKey); storageWritable = true;
    if (rawStorage === null) { storageBlocked = false; return emptyCollection(); }
    const parsed = parseCollection(rawStorage); storageBlocked = false; return parsed;
  } catch (error) {
    if (rawStorage !== null && error instanceof Error && !['SecurityError', 'QuotaExceededError'].includes(error.name)) storageBlocked = true;
    else storageWritable = false;
    return null;
  }
}
function renderStorageNotice() {
  $('#storage-notice').hidden = !storageBlocked && storageWritable;
  $('#storage-notice').textContent = storageBlocked ? '原有收集資料無法讀取，已保留原檔並暫停修改。可到來源說明下載原始資料，或用有效備份修復。' : '瀏覽器儲存不可用，勾選暫存在記憶體。請至收集清單匯出備份。';
}
function writeRecord(id, patch) {
  const persisted = readStorage();
  if (storageBlocked) { renderStorageNotice(); showToast('請先以有效備份修復收集資料。'); return; }
  if (persisted) collection = mergeCollections(persisted, collection).collection;
  collection.records[id] = { ...(collection.records[id] || { collected: false, tracked: false, note: '' }), ...patch, updatedAt: new Date().toISOString() };
  try { rawStorage = JSON.stringify(collection); localStorage.setItem(storageKey, rawStorage); storageWritable = true; } catch { storageWritable = false; }
  renderStorageNotice(); refresh();
}
function urlFor(patch) {
  const next = { ...defaults, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value && value !== defaults[key]) params.set(key, value);
  return location.pathname + (params.size ? '?' + params : '');
}
function readUrl() {
  Object.assign(filters, defaults);
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  if (['home', 'library', 'collection', 'recommendations', 'unlocks'].includes(view)) filters.view = view;
  const category = params.get('category');
  if (['all', 'general', ...wikiCategories.map(([id]) => id)].includes(category)) filters.category = category;
  if (ownersById.has(params.get('owner'))) { filters.owner = params.get('owner'); filters.category = ownersById.get(filters.owner).category; }
  if (!view && (filters.category !== 'all' || filters.owner || ['query', 'rarity', 'tag', 'status'].some(key => params.has(key)))) filters.view = 'library';
  filters.query = (params.get('query') || '').slice(0, 500);
  if (rarities.includes(params.get('rarity'))) filters.rarity = params.get('rarity');
  if (Object.hasOwn(tagLabels, params.get('tag'))) filters.tag = params.get('tag');
  if (['all', 'missing', 'collected', 'tracked'].includes(params.get('status'))) filters.status = params.get('status');
  if (['source', 'name', 'rarity', 'size', 'missing'].includes(params.get('sort'))) filters.sort = params.get('sort');
  if (filters.view === 'recommendations') { filters.category = 'weapons'; if (!recommendationIndex?.owners.has(filters.owner) && !dataset.owners.some(o => o.id === filters.owner && o.category === 'weapons')) filters.owner = ''; }
}
function navigate(patch, scroll = true) {
  Object.assign(filters, defaults, patch);
  history.pushState(null, '', urlFor(filters));
  refresh();
  if (scroll) { $('#main').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
}
function renderDirectory() {
  const nav = wikiCategories.map(([id, en, zh]) => `<div class="directory-group"><button type="button" data-category="${id}" aria-current="${filters.category === id && !filters.owner ? 'page' : 'false'}"><span>${en}<small>${zh}</small></span><span class="directory-total">${profiles.filter(p => p.category === id).length}</span></button>${filters.category === id ? `<div class="owner-list">${profiles.filter(p => p.category === id).map(p => `<button type="button" data-owner="${p.ownerId}" aria-current="${filters.owner === p.ownerId ? 'page' : 'false'}">${escapeHtml(p.nameEn)}<small>${escapeHtml(p.nameZh)}</small></button>`).join('')}</div>` : ''}</div>`).join('');
  $('#directory').innerHTML = nav + '<button class="directory-secondary" type="button" data-category="general">General upgrades <small>通用升級</small></button><button class="directory-secondary" type="button" data-action="all-upgrades">All upgrades <small>全部升級資料</small></button>';
}
function renderHeading() {
  const owner = ownersById.get(filters.owner);
  const [, en, zh] = categoryName(filters.category);
  const home = filters.view === 'home';
  let title = owner ? `${escapeHtml(owner.nameEn)} <span>${escapeHtml(owner.nameZh)}</span>` : `${en} <span>${zh}</span>`;
  let description = 'Choose equipment to see its traits and upgrades. / 選擇裝備，查閱特色、取得方式與完整升級列表。';
  if (home) { title = 'Know your gear.<span>從裝備開始，快速看懂 Mycopunk。</span>'; description = 'Characters, weapons, upgrades and the conditions behind them.<br>角色能力、裝備特性、升級效果與隱藏解鎖，整理在一起。'; }
  if (filters.view === 'collection') { title = 'Collection checklist <span>收集清單</span>'; description = 'A separate checklist for completionists. / 專為查漏與獎盃收集整理，不代表已核對遊戲完整獎盃需求。'; }
  if (filters.view === 'unlocks') { title = 'Hidden paths & unlocks <span>隱藏路徑與解鎖</span>'; description = 'Understand the unlock condition before moving upgrades around.<br>先釐清觸發方式，區分面板路徑、等級獎勵與配件增幅。'; }
  if (filters.view === 'recommendations') { title = 'Weapon tier guides <span>武器分級與搭配</span>'; description = 'Community rankings with their original sources. / 保留作者、版本與來源；搭配方向為效果整理。'; }
  if (filters.view === 'library' && filters.category === 'all' && !owner) { title = 'Upgrade reference <span>升級資料總覽</span>'; description = 'Effects, statistics and patterns in one list. / 效果、數值與形狀直接展開，無須逐一開啟詳情。'; }
  $('#page-title').innerHTML = title;
  $('#page-description').innerHTML = description;
  $('#eyebrow').textContent = home ? 'AN INDEPENDENT FIELD GUIDE / 非官方攻略手冊' : filters.view === 'collection' ? 'COMPLETION / 獎盃玩家工具' : 'FIELD REFERENCE / 攻略資料';
  $('#breadcrumbs').innerHTML = home ? '' : `<button type="button" data-view="home">Field guide / 攻略首頁</button><span>/</span>${owner ? `<button type="button" data-category="${owner.category}">${en} / ${zh}</button><span>/</span>${escapeHtml(owner.nameEn)}` : escapeHtml(filters.view === 'library' ? en : filters.view)}`;
  document.body.classList.toggle('home-page', home);
  for (const button of document.querySelectorAll('.primary-nav [data-view]')) button.setAttribute('aria-current', button.dataset.view === filters.view || (button.dataset.view === 'home' && filters.view === 'library') ? 'page' : 'false');
  document.title = (home ? 'Mycopunk Field Guide' : (owner?.nameEn || (filters.view === 'library' ? en : filters.view))) + ' — 裝備與升級攻略';
}
function categoryCard([id, en, zh, detailEn, detailZh], index) {
  return `<button type="button" class="category-card category-${id}" data-category="${id}"><div class="card-top"><span>0${index + 1}</span><span>${profiles.filter(p => p.category === id).length} entries / 項</span></div><div class="category-art">${categoryArt(id)}</div><div class="card-bottom"><h2>${en}<span>${zh}</span></h2><span class="card-arrow">↗</span></div>${dual(detailEn, detailZh)}</button>`;
}
function gearCard(profile) {
  const count = dataset.upgrades.filter(u => u.ownerId === profile.ownerId).length;
  return `<button type="button" class="gear-card" data-owner="${profile.ownerId}"><div class="gear-card-icon">${categoryArt(profile.category)}</div><div><h2>${escapeHtml(profile.nameEn)}<span>${escapeHtml(profile.nameZh)}</span></h2>${dual(profile.summaryEn, profile.summaryZh)}<span class="gear-card-foot">${count ? `${count} workbook upgrades / 筆升級` : 'Gear introduction / 裝備介紹'} <b>↗</b></span></div></button>`;
}
function renderHome() {
  return `<form id="site-search" class="home-search" role="search"><label for="home-query">Find an upgrade <span>查找升級效果</span></label><div><input id="home-query" name="query" type="search" placeholder="Try: ricochet, Heated Battery, 跳彈…" maxlength="500"><button type="submit">Search / 搜尋 →</button></div></form><section class="category-grid" aria-label="四大裝備分類">${wikiCategories.map(categoryCard).join('')}</section><section class="home-quick-links"><a href="${urlFor({view:'unlocks'})}" data-route="unlocks"><span class="quick-icon">⌘</span><div><span class="eyebrow">UPGRADE BOARD</span><h2>Hidden paths <span>面板裡的隱藏解鎖</span></h2><p>What triggers them, and what is still unknown.<br>怎樣觸發、與一般升級有何不同、哪些資訊仍待確認。</p></div><span>→</span></a><a href="${urlFor({view:'library'})}" data-route="library"><span class="quick-icon">≡</span><div><span class="eyebrow">QUICK REFERENCE</span><h2>Upgrade index <span>升級資料總表</span></h2><p>All ${dataset.upgrades.length} workbook records, fully readable.<br>英文與繁中效果、數值並列，支援分類搜尋。</p></div><span>→</span></a></section><div class="home-source-note"><p>Based on <strong>Mycopunk Wiki</strong> and <strong>Mycopunk Upgrades v1.6</strong>.</p><p>裝備介紹與舊工作簿分開註明來源；未記載的取得條件與形狀不猜測。<button type="button" data-action="about">Read source notes / 來源說明 ↗</button></p></div>`;
}
function renderGearProfile(profile) {
  const acquisitionSource = profile.acquisition.sourceUrl || profile.sourceRevisionUrl || profile.sourceUrl;
  const acquisitionVersion = profile.acquisition.versionNoteEn ? `<div class="acquisition-version">${dual(profile.acquisition.versionNoteEn, profile.acquisition.versionNoteZh)}</div>` : '';
  const workbookOwner = dataset.owners.find(owner => owner.id === profile.ownerId);
  const alias = workbookOwner && workbookOwner.nameEn !== profile.nameEn ? `<p class="data-note">Workbook label / Source name: ${escapeHtml(workbookOwner.nameEn)}</p>` : '';
  const perks = profile.traits.map(trait => `<li><h3>${escapeHtml(trait.labelEn)} <span class="zh-copy">${escapeHtml(trait.labelZh)}</span></h3>${dual(trait.textEn, trait.textZh)}</li>`).join('');
  const stats = profile.stats.map(stat => `<div><dt>${escapeHtml(stat.labelEn)}<span class="zh-copy">${escapeHtml(stat.labelZh)}</span></dt><dd>${escapeHtml(stat.value)}</dd></div>`).join('');
  const rewards = profile.levelUnlocks?.length ? `<section class="gear-levels"><h2>Level rewards <span>裝備等級獎勵</span></h2><div>${profile.levelUnlocks.map(reward => `<span><b>Lv.${escapeHtml(reward.level)}</b>${escapeHtml(reward.rewardEn)}<small class="zh-copy">${escapeHtml(reward.rewardZh)}</small></span>`).join('')}</div></section>` : '';
  return `<section class="gear-overview"><div class="gear-overview-art category-${profile.category}">${categoryArt(profile.category)}<span>${categoryName(profile.category)[1].toUpperCase()}</span></div><div class="gear-overview-content"><span class="eyebrow">OVERVIEW / 裝備簡介</span>${dual(profile.summaryEn, profile.summaryZh, 'gear-summary')}${alias}<div class="gear-profile-source">${sourceAnchor(profile.sourceRevisionUrl || profile.sourceUrl, 'Wiki revision / 來源修訂 ↗')}<span>Checked ${profile.checkedOn} · Game version not stated / 版本未註明</span></div></div></section><div class="gear-facts"><section><h2>Traits & abilities <span>特色與能力</span></h2><ul>${perks || '<li class="muted">No additional traits documented / 來源未列其他特性</li>'}</ul></section><section class="acquisition"><h2>How to get <span>取得方式</span></h2><span class="evidence-label">${profile.acquisition.status === 'legacy-guide' ? 'LEGACY GUIDE / Historical route' : profile.acquisition.status === 'not-documented' ? 'NOT DOCUMENTED / 待補證據' : 'SOURCE NOTE / 來源記載'}</span>${dual(profile.acquisition.textEn, profile.acquisition.textZh)}${acquisitionVersion}${sourceAnchor(acquisitionSource, 'Acquisition source / 查看來源 ↗')}</section></div>${stats ? `<section class="base-stats"><h2>Base statistics <span>裝備基礎數值</span></h2><dl>${stats}</dl><p class="data-note">Wiki base values, separate from upgrade ranges below. / Wiki 基礎數值，與下方升級範圍分開呈現。</p></section>` : ''}${rewards}<div class="gear-section-links"><a href="#catalogue-view">Upgrades ↓ <span>升級列表</span></a>${recommendationIndex?.guides.has(profile.ownerId) ? `<button type="button" data-recommend-owner="${profile.ownerId}">Tier & pairing guide → <span>分級與搭配</span></button>` : ''}<button type="button" data-view="unlocks">Hidden paths → <span>隱藏解鎖</span></button></div>`;
}
function renderCollection() {
  const upgrades = scopeUpgrades(); const count = countCollected(upgrades);
  return `<section class="collection-summary"><div><span class="eyebrow">WORKBOOK RECORDS / 原表收錄進度</span><p><b>${count}</b> / ${upgrades.length}<span>${(100 * count / (upgrades.length || 1)).toFixed(1)}%</span></p><progress max="${upgrades.length || 1}" value="${count}" aria-label="收集進度"></progress></div><div><p>Progress is stored in this browser. / 紀錄僅儲存於此瀏覽器。</p><button id="export-button" type="button">Export backup / 匯出備份</button><button id="import-button" type="button">Import backup / 匯入備份</button></div></section><div class="collection-groups">${[['all','All','全部'],...wikiCategories.filter(([id])=>id!=='heavy'),['general','General','通用']].map(([id,en,zh])=>`<button type="button" data-collection-category="${id}" aria-pressed="${filters.category===id}">${en} <span>${zh}</span></button>`).join('')}</div><p class="data-note">660 records are not a verified trophy total. Newer gear has no complete upgrade list yet. / 原表收錄筆數不等於獎盃所需總數；新版裝備升級仍待補齊。</p>`;
}
function renderUnlocks() {
  const mechanics = fieldGuide?.unlocks?.mechanics || [];
  return `<div class="unlock-intro"><span class="quick-icon">⌘</span><div><h2>Hidden paths ≠ upgrade patterns <span>隱藏路徑與配件形狀是兩件事</span></h2><p>Use the board guide below; individual upgrade footprints are listed on equipment pages.<br>面板解鎖看下方機制說明；每個配件的格形與占格數則列在裝備頁。</p></div></div>${mechanics.map(m => `<section class="mechanic-card" id="mechanic-${escapeHtml(m.id)}"><div class="mechanic-heading"><span class="eyebrow">${m.sourceType === 'community-player-report' ? 'PLAYER REPORT' : 'WIKI REFERENCE'} / 來源整理</span><h2>${escapeHtml(m.titleEn)}<span>${escapeHtml(m.titleZh)}</span></h2></div>${dual(m.summaryEn,m.summaryZh)}${m.steps?.length ? `<ol>${m.steps.map(step=>`<li>${dual(step.en,step.zh)}</li>`).join('')}</ol>`:''}<div class="mechanic-limit">${dual(m.limitsEn || '',m.limitsZh || '')}</div><p class="data-note">${sourceAnchor(m.sourceUrl,'Read source / 查看來源 ↗')} · Checked ${escapeHtml(m.checkedOn || fieldGuide.unlocks.checkedOn)} · ${escapeHtml(m.gameVersion || 'Game version not stated / 適用版本未註明')}</p>${(m.additionalSources||[]).map(s=>`<p class="data-note">${sourceAnchor(s.url,s.title || 'Additional source ↗')}</p>`).join('')}</section>`).join('') || '<p class="data-note">解鎖機制來源尚未載入，請重新整理。</p>'}<div class="data-note">Source evidence is kept separate from tested behavior. / 玩家分享與 Wiki 記載均保留來源，不代表本站已完成遊戲實測。</div>`;
}
function renderRow(upgrade) {
  const shape = fieldGuide?.shapes?.patterns?.find(p=>p.upgradeIds?.includes(upgrade.id) || p.upgradeId===upgrade.id);
  const unlock = fieldGuide?.unlocks?.upgrades?.find(p=>p.upgradeId===upgrade.id);
  return renderUpgrade(upgrade, ownersById.get(upgrade.ownerId), collection.records[upgrade.id], { storageBlocked, checklist:filters.view==='collection', showOwner:!filters.owner, unlock, shape });
}
function renderResults() {
  const rows = sortUpgrades(filterUpgrades(dataset.upgrades,filters,collection.records,searchIndex),filters.sort,collection.records);
  $('#result-count').textContent = `${rows.length} upgrades / 筆升級資料`;
  $('#table-header').innerHTML = rows.length ? upgradeHeader : '';
  $('#upgrade-list').innerHTML = rows.map(renderRow).join('') || `<div class="empty-state"><h3>${scopeUpgrades().length ? 'No matching upgrades / 沒有符合條件的升級' : 'Upgrade data not yet recorded / 尚未收錄升級資料'}</h3><p>${scopeUpgrades().length ? 'Adjust the search or filters. / 可清除關鍵字或調整篩選。' : 'This gear is in the Wiki index, but not in Workbook v1.6. / 此裝備已列入 Wiki 索引，但工作簿 v1.6 未提供升級清單。'}</p></div>`;
  $('#upgrade-data-note').textContent = 'Upgrade effects and ranges: Workbook v1.6 (dataset version, not game version). Pattern sources are labelled separately; cell count does not determine a shape. / 升級效果與數值來自工作簿 v1.6；這是資料表版本。占格數無法推算格形，未收錄的形狀不以示意圖代替。';
}
function renderRecommendationPage() {
  const root = $('#recommendations-view');
  root.setAttribute('aria-busy',String(recommendationStatus==='loading'));
  if(recommendationStatus==='error') root.innerHTML=`<div class="empty-state"><h2>Recommendations unavailable / 推薦資料無法載入</h2><p>${escapeHtml(recommendationError)}</p><button type="button" data-action="retry-recommendations">Retry / 重試</button></div>`;
  else if(!recommendations) root.innerHTML='<p>Loading rankings… / 正在載入榜單</p>';
  else renderRecommendations(root,recommendations,recommendationIndex,dataset,collection.records,filters.owner,recommendationState,renderRow);
}
async function loadRecommendations() {
  if(['loading','ready'].includes(recommendationStatus))return;
  recommendationStatus='loading'; if(filters.view==='recommendations')renderRecommendationPage();
  try {const response=await fetch('data/recommendations.json');if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();recommendationIndex=validateRecommendations(data,dataset);recommendations=data;recommendationStatus='ready';}
  catch(error){recommendationStatus='error';recommendationError=error.message;}
  if(filters.view==='recommendations')renderRecommendationPage();
}
function refresh() {
  renderDirectory(); renderHeading();
  const owner=ownersById.get(filters.owner);const profile=profiles.find(p=>p.ownerId===filters.owner);
  let content='';
  let showCatalogue=filters.view==='collection'||(filters.view==='library'&&(Boolean(owner)||['all','general'].includes(filters.category)));
  if(filters.view==='home')content=renderHome();
  if(filters.view==='library')content=profile?renderGearProfile(profile):(!owner&&!['all','general'].includes(filters.category)?`<div class="gear-grid">${profiles.filter(p=>p.category===filters.category).map(gearCard).join('')}</div>`:'');
  if(filters.view==='collection')content=renderCollection();
  if(filters.view==='unlocks')content=renderUnlocks();
  if(wikiError)content=`<p class="app-error">${escapeHtml(wikiError)} 裝備介紹暫時無法讀取；升級圖鑑仍可使用。</p>`+content;
  $('#page-content').innerHTML=content;
  $('#catalogue-view').hidden=!showCatalogue;
  $('#recommendations-view').hidden=filters.view!=='recommendations';
  $('#collection-status-label').hidden=filters.view!=='collection';
  for(const [selector,key]of[['#search','query'],['#rarity-filter','rarity'],['#tag-filter','tag'],['#sort-filter','sort'],['#status-filter','status']])$(selector).value=filters[key];
  if(showCatalogue)renderResults();
  else { $('#upgrade-list').innerHTML=''; $('#table-header').innerHTML=''; }
  if(filters.view==='recommendations')renderRecommendationPage();
  else { $('#recommendations-view').innerHTML=''; $('#recommendations-view').setAttribute('aria-busy','false'); }
}
function showUpgrade(id) {
  const upgrade=dataset.upgrades.find(u=>u.id===id);if(!upgrade)return;
  navigate({view:'library',category:upgrade.category,owner:upgrade.ownerId},false);
  const row=document.getElementById('upgrade-'+id);row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:'center'});
}
function openAbout() {
  $('#about-content').innerHTML=`<dl class="source-list"><dt>Equipment / 裝備介紹</dt><dd>${sourceAnchor('https://mycopunk.miraheze.org/wiki/Main_Page')} · checked ${fieldGuide?.equipment?.checkedOn || '—'}<br>改寫、繁中翻譯：本站。Wiki contributors 原文與改作文字依 CC BY-SA 4.0 提供。裝備頁列出個別修訂來源與未記載的取得條件。</dd><dt>Upgrade dataset / 升級資料</dt><dd>${escapeHtml(dataset.source.filename)} · ${dataset.upgrades.length} records / ${dataset.counts.distinctNames} names<br>v1.6 是資料表版本，並非遊戲版本。正式版與獎盃需求未完整核對。數值正負與上下界按原表保留。</dd><dt>Unlocks & patterns / 解鎖與格形</dt><dd>Wiki 與玩家資料分開標示來源、版本與限制。占格數不等於形狀，不以猜測補圖；未找到完整 Hidden Paths 路徑座標時會明示。</dd><dt>Collection / 收集資料</dt><dd>紀錄只存在此網址的瀏覽器，不會上傳。穩定 ID、舊追蹤與筆記均保留，攻略已移除筆記編輯介面；備份仍包含舊資料。網址、裝置或瀏覽器不同時需匯出／匯入。</dd><dt>Import / 匯入</dt><dd>同一 ID 以更新時間較新的整筆紀錄為準；時間相同保留本機。未對應 ID 不刪除，匯入前先保存原始備份。</dd></dl>`;
  $('#raw-export').hidden=rawStorage===null;
  try{$('#previous-export').hidden=localStorage.getItem(beforeImportKey)===null;}catch{$('#previous-export').hidden=true;}
  $('#about-dialog').showModal();
}
async function previewImport(file) {
  if(!file)return;
  try {
    if(file.size>maxBackupBytes)throw new Error('檔案超過10MB。');pendingImport=parseCollection(await file.text());
    const persisted=readStorage();const current=persisted?mergeCollections(persisted,collection).collection:collection;
    const merged=mergeCollections(storageBlocked?emptyCollection():current,pendingImport);
    const unknown=Object.keys(pendingImport.records).filter(id=>!upgradeIds.has(id)).length;
    $('#import-preview').innerHTML=`<p>${escapeHtml(file.name)}</p><dl class="import-counts"><dt>New / 新增</dt><dd>${merged.added}</dd><dt>Newer / 備份較新</dt><dd>${merged.replaced}</dd><dt>Keep local / 保留本機</dt><dd>${merged.kept}</dd><dt>Unmatched / 未對應</dt><dd>${unknown}</dd></dl>${storageBlocked?'<p>原始資料無法讀取，套用前將先保存原始文字。</p>':''}`;
    $('#import-feedback').textContent='';$('#import-dialog').showModal();
  }catch(error){pendingImport=null;showToast(error.message);}finally{renderStorageNotice();$('#import-file').value='';}
}
function applyImport() {
  if(!pendingImport)return;const latest=readStorage();const current=latest?mergeCollections(latest,collection).collection:collection;
  const merged=mergeCollections(storageBlocked?emptyCollection():current,pendingImport);
  try{const previousRaw=localStorage.getItem(storageKey);localStorage.setItem(beforeImportKey,JSON.stringify({createdAt:new Date().toISOString(),raw:previousRaw}));localStorage.setItem(storageKey,JSON.stringify(merged.collection));}
  catch{$('#import-feedback').textContent='無法完成備份與儲存，已停止覆寫。原有資料未變更。';return;}
  collection=merged.collection;rawStorage=JSON.stringify(collection);storageBlocked=false;storageWritable=true;pendingImport=null;$('#import-dialog').close();renderStorageNotice();refresh();showToast(`匯入完成：新增 ${merged.added}、更新 ${merged.replaced}、保留 ${merged.kept}。`);
}
function setupEvents() {
  document.addEventListener('click',event=>{
    const element=event.target.closest('button,a[data-home],a[data-route]');if(!element||element.disabled)return;const data=element.dataset;
    if(data.home!==undefined){event.preventDefault();navigate({view:'home'});}
    if(data.route){event.preventDefault();navigate({view:data.route});}
    if(data.view)navigate({view:data.view,category:data.view==='recommendations'?'weapons':'all'});
    if(data.category)navigate({view:'library',category:data.category});
    if(data.owner){const owner=ownersById.get(data.owner);navigate({view:filters.view==='recommendations'&&recommendationIndex?.owners.has(data.owner)?'recommendations':'library',category:owner.category,owner:data.owner});}
    if(data.collectionCategory)navigate({view:'collection',category:data.collectionCategory});
    if(data.recommendOwner){Object.assign(recommendationState,{tier:'top',missing:false,comparisonOpen:false});navigate({view:'recommendations',category:'weapons',owner:data.recommendOwner==='all'?'':data.recommendOwner});}
    if(data.detail)showUpgrade(data.detail);
    if(data.close)$('#'+data.close).close();
    if(data.action==='about'||element.id==='about-button')openAbout();
    if(data.action==='all-upgrades')navigate({view:'library'});
    if(data.action==='retry-recommendations')void loadRecommendations();
    if(data.track){writeRecord(data.track,{tracked:!collection.records[data.track]?.tracked});document.querySelector(`[data-track="${data.track}"]`)?.focus();}
    if(element.id==='language-toggle'){const englishOnly=document.body.classList.toggle('english-only');element.setAttribute('aria-pressed',String(!englishOnly));}
    if(element.id==='export-button'){if(storageBlocked){if(rawStorage!==null)downloadText(rawStorage,'mycopunk-unreadable-original.json');}else downloadText(JSON.stringify(makeBackup(collection,dataset.datasetVersion),null,2),'mycopunk-collection-'+new Date().toISOString().slice(0,10)+'.json');}
    if(element.id==='import-button')$('#import-file').click();
    if(element.id==='apply-import')applyImport();
    if(element.id==='clear-filters'){Object.assign(filters,{query:'',rarity:'',tag:'',status:'all',sort:'source'});history.replaceState(null,'',urlFor(filters));refresh();}
    if(element.id==='raw-export'&&rawStorage!==null)downloadText(rawStorage,'mycopunk-original-storage.json');
    if(element.id==='previous-export'){try{const backup=JSON.parse(localStorage.getItem(beforeImportKey));downloadText(backup.raw??JSON.stringify(emptyCollection()),'mycopunk-before-import.json');}catch{showToast('無法讀取匯入前備份。');}}
  });
  document.addEventListener('submit',event=>{if(event.target.id==='filters'){event.preventDefault();return;}if(event.target.id==='site-search'){event.preventDefault();navigate({view:'library',query:$('#home-query').value.slice(0,500)});}});
  $('#search').addEventListener('input',event=>{filters.query=event.target.value.slice(0,500);renderResults();history.replaceState(null,'',urlFor(filters));});
  $('#filters').addEventListener('change',event=>{const fields={'rarity-filter':'rarity','tag-filter':'tag','status-filter':'status','sort-filter':'sort'};if(fields[event.target.id]){filters[fields[event.target.id]]=event.target.value;renderResults();history.replaceState(null,'',urlFor(filters));}});
  document.addEventListener('change',event=>{
    const id=event.target.dataset.collect;if(id){writeRecord(id,{collected:event.target.checked});const root=filters.view==='recommendations'?$('#recommendations-view'):$('#upgrade-list');(root.querySelector(`[data-collect="${id}"]`)||$(filters.view==='recommendations'?'#rec-missing':'#status-filter')).focus();}
    if(event.target.id==='import-file')void previewImport(event.target.files[0]);
    const fields={'rec-source':'source','rec-tier':'tier','rec-missing':'missing'};if(fields[event.target.id]){recommendationState[fields[event.target.id]]=event.target.id==='rec-missing'?event.target.checked:event.target.value;renderRecommendationPage();$('#'+event.target.id)?.focus();}
  });
  $('#recommendations-view').addEventListener('toggle',event=>{if(event.target.matches('.rec-overview'))recommendationState.comparisonOpen=event.target.open;},true);
  $('#import-dialog').addEventListener('close',()=>{pendingImport=null;});
  window.addEventListener('popstate',()=>{readUrl();refresh();});
  window.addEventListener('storage',event=>{if(event.key!==storageKey&&event.key!==null)return;const incoming=readStorage();if(incoming)collection=incoming;renderStorageNotice();refresh();});
}
async function start() {
  try {
    const response=await fetch('data/upgrades.json');if(!response.ok)throw new Error('HTTP '+response.status);dataset=await response.json();
    if(dataset.schemaVersion!==1||!Array.isArray(dataset.upgrades)||!dataset.upgrades.length)throw new Error('升級資料格式不支援');
    try{const response=await fetch('data/field-guide.json');if(!response.ok)throw new Error('HTTP '+response.status);const incoming=await response.json();fieldGuide=validateFieldGuide(incoming,dataset);}catch(error){wikiError=error.message;}
    profiles=fieldGuide?.equipment?.items||dataset.owners.filter(o=>o.category!=='general').map(o=>({ownerId:o.id,...o,summaryEn:'Workbook upgrade list',summaryZh:'工作簿升級列表',traits:[],stats:[],acquisition:{status:'not-documented',textEn:'Not documented',textZh:'取得方式未記載'}}));
    ownersById=new Map([...dataset.owners.map(o=>[o.id,o]),...profiles.map(p=>[p.ownerId,{...p,id:p.ownerId}])]);
    upgradeIds=new Set(dataset.upgrades.map(u=>u.id));searchIndex=new Map(dataset.upgrades.map(u=>[u.id,buildSearchIndex(u,ownersById.get(u.ownerId))]));
    collection=readStorage()||collection;readUrl();
    $('#rarity-filter').insertAdjacentHTML('beforeend',rarities.map(r=>`<option value="${r}">${r} / ${rarityLabels[r]}</option>`).join(''));
    $('#tag-filter').insertAdjacentHTML('beforeend',Object.entries(tagLabels).map(([tag,label])=>`<option value="${tag}">${tag} / ${label}</option>`).join(''));
    setupEvents();renderStorageNotice();refresh();void loadRecommendations();
  }catch(error){$('#app-error').hidden=false;$('#app-error').textContent=error.message+'。請以 README 的 HTTP 伺服器開啟，再重新整理。';}
}
start();
