import { storageKey, beforeImportKey, maxBackupBytes, categories, rarities, rarityLabels, tagLabels, emptyCollection, parseCollection, mergeCollections, makeBackup, buildSearchIndex, filterUpgrades, sortUpgrades } from './model.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
let dataset;
let collection = emptyCollection();
let storageBlocked = false;
let storageWritable = true;
let rawStorage = null;
let pendingImport = null;
let activeUpgrade = null;
let limit = 50;
let toastTimer;
let ownersById;
let searchIndex;
let upgradeIds;
const filters = { view: 'library', category: 'all', owner: '', query: '', rarity: '', tag: '', status: 'all', sort: 'source' };

function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function readStorage() {
  try {
    rawStorage = localStorage.getItem(storageKey);
    storageWritable = true;
    if (rawStorage === null) { storageBlocked = false; return emptyCollection(); }
    const parsed = parseCollection(rawStorage);
    storageBlocked = false;
    return parsed;
  } catch (error) {
    if (rawStorage !== null && error instanceof Error && !['SecurityError', 'QuotaExceededError'].includes(error.name)) {
      storageBlocked = true;
    } else {
      storageWritable = false;
    }
    return null;
  }
}

function renderStorageNotice() {
  const notice = $('#storage-notice');
  notice.hidden = !storageBlocked && storageWritable;
  notice.textContent = storageBlocked
    ? '原有儲存資料的格式或版本無法讀取，已暫停修改以保留原檔。請到「資料說明」下載原始資料，或匯入有效備份修復。'
    : '瀏覽器儲存目前不可用，這次修改僅暫存於記憶體。離開頁面前請匯出備份。';
}

function writeRecord(id, patch) {
  const persisted = readStorage();
  if (storageBlocked) {
    renderStorageNotice();
    showToast('原有紀錄無法讀取，請先匯入有效備份。');
    return false;
  }
  if (persisted) collection = mergeCollections(persisted, collection).collection;
  const previous = collection.records[id] || { collected: false, tracked: false, note: '' };
  collection.records[id] = { ...previous, ...patch, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(storageKey, JSON.stringify(collection));
    rawStorage = JSON.stringify(collection);
    storageWritable = true;
  } catch { storageWritable = false; }
  renderStorageNotice();
  renderDirectory();
  renderHeading();
  renderResults();
  return true;
}

function updateUrl() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== ({ view: 'library', category: 'all', status: 'all', sort: 'source' }[key] ?? '')) params.set(key, value);
  }
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'collection') filters.view = 'collection';
  if (categories.some(([key]) => key === params.get('category'))) filters.category = params.get('category');
  if (ownersById.has(params.get('owner'))) {
    filters.owner = params.get('owner');
    filters.category = ownersById.get(filters.owner).category;
  }
  filters.query = (params.get('query') || '').slice(0, 500);
  if (rarities.includes(params.get('rarity'))) filters.rarity = params.get('rarity');
  if (Object.hasOwn(tagLabels, params.get('tag'))) filters.tag = params.get('tag');
  if (['all', 'missing', 'collected', 'tracked'].includes(params.get('status'))) filters.status = params.get('status');
  if (['source', 'name', 'rarity', 'size', 'missing'].includes(params.get('sort'))) filters.sort = params.get('sort');
}

function scopeUpgrades() {
  return dataset.upgrades.filter(upgrade => (filters.category === 'all' || upgrade.category === filters.category) && (!filters.owner || upgrade.ownerId === filters.owner));
}

function progressFor(upgrades) {
  return [upgrades.filter(upgrade => collection.records[upgrade.id]?.collected).length, upgrades.length];
}

function renderDirectory() {
  const groups = categories.map(([categoryId, nameEn, nameZh]) => {
    const categoryUpgrades = dataset.upgrades.filter(upgrade => categoryId === 'all' || upgrade.category === categoryId);
    const [collected, total] = progressFor(categoryUpgrades);
    const selected = filters.category === categoryId && !filters.owner;
    const children = categoryId === filters.category && categoryId !== 'all'
      ? '<div class="owner-list">' + dataset.owners.filter(owner => owner.category === categoryId).map(owner => {
        const [owned, count] = progressFor(dataset.upgrades.filter(upgrade => upgrade.ownerId === owner.id));
        return `<button type="button" data-owner="${owner.id}" aria-current="${filters.owner === owner.id ? 'page' : 'false'}"><span>${escapeHtml(owner.nameEn)}<small>${escapeHtml(owner.nameZh)}</small></span><span class="directory-count">${owned}<span>/${count}</span></span></button>`;
      }).join('') + '</div>' : '';
    return `<div class="category-group"><button type="button" class="category-button" data-category="${categoryId}" aria-current="${selected ? 'page' : 'false'}"><span>${nameEn}<small>${nameZh}</small></span><span class="directory-count">${collected}<span>/${total}</span></span></button>${children}</div>`;
  }).join('');
  const mobileOwners = filters.category !== 'all' ? `<label class="mobile-owner">Equipment / 選擇裝備<select id="owner-filter"><option value="">All in category / 此分類全部</option>${dataset.owners.filter(owner => owner.category === filters.category).map(owner => `<option value="${owner.id}" ${owner.id === filters.owner ? 'selected' : ''}>${escapeHtml(owner.nameEn)} / ${escapeHtml(owner.nameZh)}</option>`).join('')}</select></label>` : '';
  $('#directory').innerHTML = groups + mobileOwners;
}

function renderHeading() {
  const owner = ownersById.get(filters.owner);
  const category = categories.find(([key]) => key === filters.category);
  const [collected, total] = progressFor(scopeUpgrades());
  $('#breadcrumb').textContent = `${category[1].toUpperCase()} / ${category[2]}${owner ? ' / ' + owner.nameEn : ''}`;
  $('#page-title').innerHTML = owner
    ? `${escapeHtml(owner.nameEn)} <span>${escapeHtml(owner.nameZh)}</span>`
    : `${filters.view === 'collection' ? 'My collection' : category[1]} <span>${filters.view === 'collection' ? '我的收集' : category[2]}</span>`;
  $('#page-description').innerHTML = filters.view === 'collection'
    ? 'Every upgrade, one discovery at a time.<br><span>以未取得篩選查漏，也可追蹤想找的配件、記下取得線索。</span>'
    : 'Find your next upgrade. Keep track of every discovery.<br><span>英文原文與繁中暫譯對照，勾選即可記錄取得。</span>';
  $('#progress-count').innerHTML = `${collected} <span>/ ${total}</span>`;
  $('#collection-progress').max = total || 1;
  $('#collection-progress').value = collected;
  $('#progress-caption').textContent = `${total ? (100 * collected / total).toFixed(1) : 0}% of source records / 原表收錄進度`;
  $('#library-tab').setAttribute('aria-pressed', String(filters.view === 'library'));
  $('#collection-tab').setAttribute('aria-pressed', String(filters.view === 'collection'));
}

function syncFilterControls() {
  $('#search').value = filters.query;
  $('#rarity-filter').value = filters.rarity;
  $('#tag-filter').value = filters.tag;
  $('#status-filter').value = filters.status;
  $('#sort-filter').value = filters.sort;
  $('#missing-toggle').setAttribute('aria-pressed', String(filters.status === 'missing'));
}

function safeIcon(icon) {
  return /^assets\/icons\/[a-f0-9]{20}\.(?:png|jpe?g|webp|gif)$/.test(icon) ? icon : '';
}

function renderRow(upgrade) {
  const record = collection.records[upgrade.id];
  const owner = ownersById.get(upgrade.ownerId);
  const collected = Boolean(record?.collected);
  const tracked = Boolean(record?.tracked);
  const icon = safeIcon(upgrade.icon);
  return `<article class="upgrade-row ${collected ? 'is-collected' : ''}" data-upgrade="${upgrade.id}">
    <label class="collect-control"><input type="checkbox" data-collect="${upgrade.id}" ${collected ? 'checked' : ''} ${storageBlocked ? 'disabled' : ''} aria-label="Collected / 已取得：${escapeHtml(upgrade.nameEn)}"><span class="sr-only">Collected / 已取得</span></label>
    <div class="upgrade-icon" aria-hidden="true">${icon ? `<img src="${icon}" alt="" loading="lazy" width="42" height="42">` : '<span>＋</span>'}</div>
    <div class="upgrade-body"><div class="upgrade-title"><button type="button" data-detail="${upgrade.id}">${escapeHtml(upgrade.nameEn)}</button><span class="name-zh zh-copy">${escapeHtml(upgrade.nameZh || '譯名待補')}</span></div>
    <div class="upgrade-meta"><span class="rarity rarity-${upgrade.rarity.toLowerCase()}">${upgrade.rarity}</span><span>${upgrade.size ?? '?'} cells <span class="zh-copy">格</span></span>${!filters.owner ? `<span class="owner-label">${escapeHtml(owner.nameEn)}</span>` : ''}${record?.note ? '<span class="has-note">Note / 有筆記</span>' : ''}</div>
    <div class="bilingual-copy"><p lang="en">${escapeHtml(upgrade.descriptionEn)}</p><p lang="zh-Hant" class="zh-copy">${escapeHtml(upgrade.descriptionZh || '尚待翻譯，請參考左側英文原文。')}</p></div>
    <div class="upgrade-tags">${upgrade.tags.map(tag => `<button type="button" data-tag="${tag}" aria-label="Filter ${tag} / 篩選${tagLabels[tag]}">${tag}<span class="zh-copy"> ${tagLabels[tag]}</span></button>`).join('')}</div></div>
    <div class="row-actions"><button type="button" class="track-button ${tracked ? 'is-tracked' : ''}" data-track="${upgrade.id}" aria-pressed="${tracked}" aria-label="Track / 追蹤：${escapeHtml(upgrade.nameEn)}" ${storageBlocked ? 'disabled' : ''}>${tracked ? '★' : '☆'}<span>${tracked ? 'Tracked' : 'Track'}</span></button><button type="button" class="details-button" data-detail="${upgrade.id}">Details <span>詳情</span><span aria-hidden="true"> ↗</span></button></div>
  </article>`;
}

function renderResults() {
  const filtered = sortUpgrades(filterUpgrades(dataset.upgrades, filters, collection.records, searchIndex), filters.sort, collection.records);
  const visible = filtered.slice(0, limit);
  $('#result-count').textContent = `${filtered.length} upgrades / 筆配件${filtered.length > visible.length ? ` · showing ${visible.length} / 已顯示 ${visible.length}` : ''}`;
  $('#upgrade-list').innerHTML = visible.length ? visible.map(renderRow).join('') : '<div class="empty-state"><span aria-hidden="true">◇</span><h2>No matching upgrades <span>沒有符合條件的配件</span></h2><p>Try another name, rarity or effect.<br>可調整關鍵字、稀有度或收集狀態。</p><button type="button" data-action="clear">Clear filters / 清除篩選</button></div>';
  $('#upgrade-list').setAttribute('aria-busy', 'false');
  $('#load-more').hidden = visible.length >= filtered.length;
  $('#load-more').textContent = `Load ${Math.min(50, filtered.length - visible.length)} more / 顯示更多配件`;
}

function refresh({ resetLimit = true } = {}) {
  if (!dataset) return;
  if (resetLimit) limit = 50;
  syncFilterControls();
  renderDirectory();
  renderHeading();
  renderResults();
  updateUrl();
}

function clearFilters() {
  Object.assign(filters, { query: '', rarity: '', tag: '', status: 'all', sort: 'source' });
  refresh();
}

function wikiLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'mycopunk.miraheze.org' ? parsed.href : '';
  } catch { return ''; }
}

function openDetails(id) {
  const upgrade = dataset.upgrades.find(item => item.id === id);
  if (!upgrade) return;
  activeUpgrade = upgrade;
  const record = collection.records[id];
  const owner = ownersById.get(upgrade.ownerId);
  const wikiUrl = wikiLink(upgrade.wikiUrl);
  const stats = upgrade.stats.length
    ? `<div class="stats-wrap"><table class="stats-table"><caption>Statistics / 原表數值</caption><thead><tr><th scope="col">Statistic / 屬性</th><th scope="col">Value / 數值</th></tr></thead><tbody>${upgrade.stats.map(stat => `<tr><th scope="row">${escapeHtml(stat.nameEn)}<span class="zh-copy">${escapeHtml(stat.nameZh)}</span></th><td>${escapeHtml(stat.display || [stat.minRaw, stat.maxRaw].join(' → '))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">No statistic fields in source / 原表未列數值欄位。</p>';
  const turbo = upgrade.turbochargeEn
    ? `<div class="bilingual-copy"><p lang="en">${escapeHtml(upgrade.turbochargeEn)}</p><p class="zh-copy" lang="zh-Hant">${escapeHtml(upgrade.turbochargeZh || '待翻譯')}</p></div>`
    : '<p class="muted">Not recorded in source / 原表此欄空白，效果尚未收錄。</p>';
  $('#detail-content').innerHTML = `<div class="detail-heading"><div class="upgrade-icon large" aria-hidden="true">${safeIcon(upgrade.icon) ? `<img src="${upgrade.icon}" alt="" width="62" height="62">` : ''}</div><div><p class="eyebrow">${escapeHtml(owner.nameEn)}</p><h2 id="detail-title">${escapeHtml(upgrade.nameEn)}</h2><p class="zh-copy">${escapeHtml(upgrade.nameZh)}</p></div></div>
    <div class="detail-controls"><span class="rarity rarity-${upgrade.rarity.toLowerCase()}">${upgrade.rarity} / ${rarityLabels[upgrade.rarity]}</span><span>${upgrade.size ?? '?'} cells / 格</span><label><input id="detail-collected" type="checkbox" ${record?.collected ? 'checked' : ''} ${storageBlocked ? 'disabled' : ''}>Collected / 已取得</label><label><input id="detail-tracked" type="checkbox" ${record?.tracked ? 'checked' : ''} ${storageBlocked ? 'disabled' : ''}>Track / 追蹤</label></div>
    <section class="detail-section"><h3>Effect <span>效果對照</span></h3><div class="bilingual-copy"><p lang="en">${escapeHtml(upgrade.descriptionEn)}</p><p class="zh-copy" lang="zh-Hant">${escapeHtml(upgrade.descriptionZh)}</p></div></section>
    <section class="detail-section"><h3>Turbocharge <span>增幅效果</span></h3>${turbo}</section>
    <section class="detail-section">${stats}<p class="dialog-note">數值範圍、正負號及上下界順序依原表保留，尚未核對正式版。空白與 n/a 不視為相同狀態。</p></section>
    <section class="detail-section"><h3>Personal note <span>個人筆記</span></h3><form id="note-form"><label for="note-text" class="sr-only">配件筆記，上限 5000 字</label><textarea id="note-text" maxlength="5000" rows="3" placeholder="Drop location, a reminder… / 取得線索、遊玩心得" ${storageBlocked ? 'disabled' : ''}>${escapeHtml(record?.note || '')}</textarea><div class="note-actions"><span>Saved in this browser / 僅儲存於此瀏覽器</span><button type="submit" class="primary-button" ${storageBlocked ? 'disabled' : ''}>Save note / 儲存筆記</button></div></form></section>
    <footer class="detail-source"><strong>Source / 來源</strong><p>${escapeHtml(dataset.source.filename)}<br>${escapeHtml(upgrade.source.sheet)}!${upgrade.source.range}</p><p>繁中為輔助暫譯，尚未經遊戲內校對。效果標籤由英文關鍵字分類。</p>${wikiUrl ? `<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener noreferrer">Community wiki / 社群 Wiki ↗</a>` : ''}</footer>`;
  $('#detail-dialog').showModal();
}

function openAbout() {
  const missingIds = Object.keys(collection.records).filter(id => !upgradeIds.has(id)).length;
  $('#about-content').innerHTML = `<dl class="source-list"><dt>Workbook / 來源檔案</dt><dd>${escapeHtml(dataset.source.filename)}</dd><dt>Dataset / 收錄範圍</dt><dd>${dataset.counts.records} 筆裝備配件紀錄、${dataset.counts.distinctNames} 個不同名稱<br>同名跨裝備項目分開保留，不能直接作為獎盃需求總數。</dd><dt>Version / 版本</dt><dd>資料表 v1.6；檔名版本不等同遊戲版本。正式版覆蓋範圍待核對。<br>匯入日期：${dataset.source.importedOn}</dd><dt>Translations / 翻譯</dt><dd>${escapeHtml(dataset.translationNote)} 配件及角色中文名稱亦為暫譯。</dd><dt>Classification / 分類</dt><dd>效果採英文關鍵字多標籤分類，便於查找，不代表實測推薦。稀有度沿用原表。</dd><dt>Collection / 收集紀錄</dt><dd>以裝備＋配件識別，各自記錄取得、追蹤、筆記。只存在此網址的瀏覽器儲存空間，換瀏覽器或連接埠時需匯入備份。${missingIds ? `<br>另保留 ${missingIds} 筆目前圖鑑未對應的紀錄。` : ''}</dd><dt>Backup / 備份</dt><dd>匯入採整筆紀錄時間較新者優先，包含未取得的狀態；時間相同時保留本機版本。匯入前會保留一份原始資料供下載；再次匯入會替換這份還原備份，請另存重要版本。</dd></dl>`;
  $('#raw-export').hidden = rawStorage === null;
  try { $('#previous-export').hidden = localStorage.getItem(beforeImportKey) === null; } catch { $('#previous-export').hidden = true; }
  $('#about-dialog').showModal();
}

async function previewImport(file) {
  if (!file) return;
  try {
    if (file.size > maxBackupBytes) throw new Error('檔案超過 10 MB，請選擇有效的收集備份。');
    pendingImport = parseCollection(await file.text());
    const persisted = readStorage();
    const current = persisted ? mergeCollections(persisted, collection).collection : collection;
    const merged = mergeCollections(storageBlocked ? emptyCollection() : current, pendingImport);
    const unknown = Object.keys(pendingImport.records).filter(id => !upgradeIds.has(id)).length;
    $('#import-preview').innerHTML = `<p class="import-filename">${escapeHtml(file.name)}</p><dl class="import-counts"><dt>New records / 新增</dt><dd>${merged.added}</dd><dt>Newer incoming / 備份較新</dt><dd>${merged.replaced}</dd><dt>Keep local / 保留本機</dt><dd>${merged.kept}</dd><dt>Not in this dataset / 未對應</dt><dd>${unknown}</dd></dl>${storageBlocked ? '<p class="dialog-note">原有資料無法解析。套用後將保留原始文字備份，再以此次有效備份修復。</p>' : ''}`;
    $('#import-feedback').textContent = '';
    $('#import-dialog').showModal();
  } catch (error) {
    pendingImport = null;
    showToast(error.message);
  } finally { renderStorageNotice(); $('#import-file').value = ''; }
}

function applyImport() {
  if (!pendingImport) return;
  const latest = readStorage();
  const current = latest ? mergeCollections(latest, collection).collection : collection;
  const merged = mergeCollections(storageBlocked ? emptyCollection() : current, pendingImport);
  let previousRaw;
  try {
    previousRaw = localStorage.getItem(storageKey);
    // 先成功保留原始資料，才覆寫收集紀錄。任何儲存錯誤均停止匯入。
    localStorage.setItem(beforeImportKey, JSON.stringify({ createdAt: new Date().toISOString(), raw: previousRaw }));
    localStorage.setItem(storageKey, JSON.stringify(merged.collection));
  } catch {
    $('#import-feedback').textContent = '瀏覽器無法完成備份與儲存，已停止匯入，原有收集紀錄未覆寫。請釋放空間或允許網站儲存後再試。';
    return;
  }
  collection = merged.collection;
  rawStorage = JSON.stringify(collection);
  storageBlocked = false;
  storageWritable = true;
  pendingImport = null;
  $('#import-dialog').close();
  renderStorageNotice();
  refresh();
  showToast(`匯入完成：新增 ${merged.added}、更新 ${merged.replaced}、保留 ${merged.kept}。匯入前備份可於資料說明下載。`);
}

function handleClick(event) {
  const button = event.target.closest('button');
  if (!button || button.disabled || !dataset) return;
  const data = button.dataset;
  if (data.close) { $('#' + data.close).close(); return; }
  if (data.category) { filters.category = data.category; filters.owner = ''; refresh(); }
  if (data.owner) { filters.owner = data.owner; filters.category = ownersById.get(data.owner).category; refresh(); }
  if (data.view) { filters.view = data.view; refresh(); }
  if (data.tag) { filters.tag = data.tag; refresh(); }
  if (data.detail) openDetails(data.detail);
  if (data.action === 'clear') clearFilters();
  if (data.track) {
    const id = data.track;
    const current = readStorage() || collection;
    writeRecord(id, { tracked: !current.records[id]?.tracked });
    $(`[data-track="${id}"]`)?.focus();
  }
}

function setupEvents() {
  document.addEventListener('click', handleClick);
  $('#filters').addEventListener('submit', event => event.preventDefault());
  $('#directory').addEventListener('change', event => {
    if (event.target.id === 'owner-filter') { filters.owner = event.target.value; refresh(); }
  });
  $('#search').addEventListener('input', event => { filters.query = event.target.value.slice(0, 500); limit = 50; renderResults(); updateUrl(); });
  for (const [selector, key] of [['#rarity-filter', 'rarity'], ['#tag-filter', 'tag'], ['#status-filter', 'status'], ['#sort-filter', 'sort']]) {
    $(selector).addEventListener('change', event => { filters[key] = event.target.value; refresh(); });
  }
  $('#missing-toggle').addEventListener('click', () => { filters.status = filters.status === 'missing' ? 'all' : 'missing'; refresh(); });
  $('#clear-filters').addEventListener('click', clearFilters);
  $('#load-more').addEventListener('click', () => { limit += 50; renderResults(); });
  $('#language-toggle').addEventListener('click', () => {
    const englishOnly = document.body.classList.toggle('english-only');
    $('#language-toggle').setAttribute('aria-pressed', String(!englishOnly));
  });
  $('#upgrade-list').addEventListener('change', event => {
    const id = event.target.dataset.collect;
    if (!id) return;
    const checked = event.target.checked;
    if (!writeRecord(id, { collected: checked })) refresh({ resetLimit: false });
    const target = $(`[data-collect="${id}"]`);
    if (target) target.focus();
    else $('#missing-toggle').focus();
  });
  $('#detail-content').addEventListener('change', event => {
    if (!activeUpgrade) return;
    if (event.target.id === 'detail-collected') writeRecord(activeUpgrade.id, { collected: event.target.checked });
    if (event.target.id === 'detail-tracked') writeRecord(activeUpgrade.id, { tracked: event.target.checked });
  });
  $('#detail-content').addEventListener('submit', event => {
    event.preventDefault();
    if (activeUpgrade && writeRecord(activeUpgrade.id, { note: $('#note-text').value })) showToast(storageWritable ? '筆記已儲存。' : '筆記已暫存，請匯出備份。');
  });
  $('#detail-dialog').addEventListener('close', () => { activeUpgrade = null; });
  $('#import-dialog').addEventListener('close', () => { pendingImport = null; });
  $('#about-button').addEventListener('click', openAbout);
  $('#export-button').addEventListener('click', () => {
    if (storageBlocked) { if (rawStorage !== null) downloadText(rawStorage, 'mycopunk-unreadable-original.json'); return; }
    downloadText(JSON.stringify(makeBackup(collection, dataset.datasetVersion), null, 2), `mycopunk-collection-${new Date().toISOString().slice(0, 10)}.json`);
    showToast('已產生備份下載，請確認瀏覽器下載紀錄。');
  });
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', event => previewImport(event.target.files[0]));
  $('#apply-import').addEventListener('click', applyImport);
  $('#raw-export').addEventListener('click', () => { if (rawStorage !== null) downloadText(rawStorage, 'mycopunk-original-storage.json'); });
  $('#previous-export').addEventListener('click', () => {
    try {
      const backup = JSON.parse(localStorage.getItem(beforeImportKey));
      downloadText(backup.raw ?? JSON.stringify(emptyCollection(), null, 2), 'mycopunk-before-import.json');
    } catch { showToast('無法讀取匯入前備份，原有資料未變更。'); }
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    const incoming = readStorage();
    if (incoming) collection = incoming;
    renderStorageNotice();
    refresh({ resetLimit: false });
    if ($('#detail-dialog').open && activeUpgrade) {
      $('#detail-collected').checked = Boolean(collection.records[activeUpgrade.id]?.collected);
      $('#detail-tracked').checked = Boolean(collection.records[activeUpgrade.id]?.tracked);
      $('#detail-collected').disabled = storageBlocked;
      $('#detail-tracked').disabled = storageBlocked;
      $('#note-text').disabled = storageBlocked;
      $('#note-form button').disabled = storageBlocked;
    }
  });
}

async function start() {
  try {
    const response = await fetch('data/upgrades.json');
    if (!response.ok) throw new Error(`資料載入失敗（HTTP ${response.status}）。`);
    dataset = await response.json();
    if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.upgrades) || !dataset.upgrades.length || !Array.isArray(dataset.owners)) throw new Error('圖鑑資料格式不支援。');
    ownersById = new Map(dataset.owners.map(owner => [owner.id, owner]));
    upgradeIds = new Set(dataset.upgrades.map(upgrade => upgrade.id));
    searchIndex = new Map(dataset.upgrades.map(upgrade => [upgrade.id, buildSearchIndex(upgrade, ownersById.get(upgrade.ownerId))]));
    collection = readStorage() || collection;
    readUrl();
    $('#rarity-filter').insertAdjacentHTML('beforeend', rarities.map(rarity => `<option value="${rarity}">${rarity} / ${rarityLabels[rarity]}</option>`).join(''));
    $('#tag-filter').insertAdjacentHTML('beforeend', Object.entries(tagLabels).map(([tag, label]) => `<option value="${tag}">${tag} / ${label}</option>`).join(''));
    document.querySelectorAll('#filters input, #filters select, #filters button, #export-button, #import-button').forEach(control => { control.disabled = false; });
    $('#dataset-footer').textContent = `${dataset.counts.records} records · ${dataset.owners.length} equipment groups · Workbook v1.6`;
    setupEvents();
    renderStorageNotice();
    refresh();
  } catch (error) {
    $('#app-error').textContent = `${error.message} 請以 README 的本機伺服器啟動，再重新整理。`;
    $('#app-error').hidden = false;
    $('#upgrade-list').setAttribute('aria-busy', 'false');
    $('#result-count').textContent = 'Database unavailable / 無法載入資料';
    $('#directory').textContent = 'Database unavailable / 資料未載入';
  }
}

start();
