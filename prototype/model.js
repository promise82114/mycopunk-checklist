export const appId = 'mycopunk-checklist';
export const storageKey = 'mycopunk-checklist:collection:v1';
export const beforeImportKey = 'mycopunk-checklist:before-import:v1';
export const maxBackupBytes = 10 * 1024 * 1024;
export const categories = [
  ['all', 'All upgrades', '全部配件'],
  ['weapons', 'Weapons', '武器'],
  ['characters', 'Characters', '角色'],
  ['grenades', 'Grenades', '手榴彈'],
  ['general', 'General', '通用'],
];
export const rarities = ['Contraband', 'Oddity', 'Exotic', 'Epic', 'Rare', 'Standard'];
export const rarityLabels = { Contraband: '違禁品', Oddity: '奇物', Exotic: '異域', Epic: '史詩', Rare: '稀有', Standard: '標準' };
export const tagLabels = { damage: '傷害', ammo: '彈藥', reload: '裝填', fire: '火焰', shock: '電擊', acid: '酸液', decay: '衰敗', explosion: '爆炸', mobility: '移動', survival: '生存', team: '隊伍支援', grid: '棋盤／相鄰', projectile: '彈道', ability: '技能' };

export function emptyCollection() {
  return { appId, schemaVersion: 1, records: Object.create(null) };
}

export function validateCollection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.appId !== appId || value.schemaVersion !== 1) {
    throw new Error('備份格式或版本不支援，原有紀錄未變更。');
  }
  if (!value.records || typeof value.records !== 'object' || Array.isArray(value.records)) throw new Error('備份缺少有效的 records。');
  const entries = Object.entries(value.records);
  if (entries.length > 10000) throw new Error('備份項目超過 10,000 筆，請確認檔案。');
  const records = Object.create(null);
  for (const [id, record] of entries) {
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(id) || id.length > 160) throw new Error('備份含無效的配件識別碼。');
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.collected !== 'boolean' || typeof record.tracked !== 'boolean' || typeof record.note !== 'string' || record.note.length > 5000 || typeof record.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.updatedAt) || !Number.isFinite(Date.parse(record.updatedAt))) {
      throw new Error('備份含無效的收集狀態、筆記或時間；原有紀錄未變更。');
    }
    records[id] = { collected: record.collected, tracked: record.tracked, note: record.note, updatedAt: record.updatedAt };
  }
  return { appId, schemaVersion: 1, records };
}

export function parseCollection(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > maxBackupBytes) throw new Error('備份超過 10 MB，無法讀取。');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('檔案不是有效 JSON；原有紀錄未變更。'); }
  return validateCollection(value);
}

export function mergeCollections(current, incoming) {
  const merged = emptyCollection();
  Object.assign(merged.records, current.records);
  let added = 0;
  let replaced = 0;
  let kept = 0;
  for (const [id, record] of Object.entries(incoming.records)) {
    const previous = merged.records[id];
    if (!previous) { merged.records[id] = record; added++; }
    else if (Date.parse(record.updatedAt) > Date.parse(previous.updatedAt)) { merged.records[id] = record; replaced++; }
    else { kept++; }
  }
  return { collection: merged, added, replaced, kept };
}

export function makeBackup(collection, datasetVersion) {
  return { ...validateCollection(collection), datasetVersion, exportedAt: new Date().toISOString() };
}

export function normalizeSearch(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

export function buildSearchIndex(upgrade, owner) {
  return normalizeSearch([upgrade.nameEn, upgrade.nameZh, upgrade.descriptionEn, upgrade.descriptionZh, upgrade.turbochargeEn, upgrade.turbochargeZh, owner.nameEn, owner.nameZh, upgrade.rarity, rarityLabels[upgrade.rarity], upgrade.size, ...upgrade.tags.flatMap(tag => [tag, tagLabels[tag]]), ...upgrade.stats.flatMap(stat => [stat.nameEn, stat.nameZh, stat.display, stat.minRaw, stat.maxRaw])].join(' '));
}

export function filterUpgrades(upgrades, filters, records, searchIndex) {
  const terms = normalizeSearch(filters.query).trim().split(/\s+/).filter(Boolean);
  return upgrades.filter(upgrade => {
    const record = records[upgrade.id];
    return (filters.category === 'all' || upgrade.category === filters.category)
      && (!filters.owner || upgrade.ownerId === filters.owner)
      && (!filters.rarity || upgrade.rarity === filters.rarity)
      && (!filters.tag || upgrade.tags.includes(filters.tag))
      && (filters.status !== 'missing' || !record?.collected)
      && (filters.status !== 'collected' || record?.collected)
      && (filters.status !== 'tracked' || record?.tracked)
      && terms.every(term => (searchIndex.get(upgrade.id) + ' ' + normalizeSearch(record?.note || '')).includes(term));
  });
}

export function sortUpgrades(upgrades, sort, records) {
  const sorted = [...upgrades];
  if (sort === 'name') sorted.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  if (sort === 'rarity') sorted.sort((a, b) => rarities.indexOf(a.rarity) - rarities.indexOf(b.rarity) || a.nameEn.localeCompare(b.nameEn));
  if (sort === 'size') sorted.sort((a, b) => (a.size ?? Infinity) - (b.size ?? Infinity) || a.nameEn.localeCompare(b.nameEn));
  if (sort === 'missing') sorted.sort((a, b) => Number(Boolean(records[a.id]?.collected)) - Number(Boolean(records[b.id]?.collected)));
  return sorted;
}
