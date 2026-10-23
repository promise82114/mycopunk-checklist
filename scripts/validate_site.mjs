import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSearchIndex, filterUpgrades, tagLabels, rarities, emptyCollection, makeBackup, parseCollection } from '../prototype/model.js';
import { validateRecommendations, selectRankedUpgrades, routeCollection } from '../prototype/recommendations.js';
import { validateFieldGuide, renderShape, renderUpgrade, escapeHtml } from '../prototype/wiki.js';
import { normalizeHexCells, rotateHexCells, hexCellsOverlap, renderHexPattern } from '../prototype/patterns.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const siteRoot = path.join(repoRoot, 'prototype');
const catalogue = JSON.parse(await readFile(path.join(siteRoot, 'data/upgrades.json'), 'utf8'));
const sourceHash = createHash('sha256').update(await readFile(path.join(repoRoot, catalogue.source.filename))).digest('hex');
assert.equal(sourceHash, catalogue.source.sha256, '原始 Excel 與圖鑑來源雜湊不符');
assert.equal(catalogue.schemaVersion, 1, '圖鑑版本不支援');
assert(catalogue.upgrades.length > 0, '圖鑑不可為空');
assert.equal(catalogue.upgrades.length, catalogue.counts.records, '收錄總數不符');
assert.equal(new Set(catalogue.upgrades.map(upgrade => upgrade.id)).size, catalogue.upgrades.length, '配件 ID 重複');
assert.equal(new Set(catalogue.upgrades.map(upgrade => upgrade.nameEn)).size, catalogue.counts.distinctNames, '名稱統計不符');
assert.equal(Object.keys(catalogue.counts.missingTranslations).length, 0, '仍有缺少的譯文');
const owners = new Map(catalogue.owners.map(owner => [owner.id, owner]));
const searchIndex = new Map();
for (const upgrade of catalogue.upgrades) {
  const owner = owners.get(upgrade.ownerId);
  assert(owner && owner.category === upgrade.category, '配件歸屬不符');
  assert(upgrade.id.startsWith(owner.id + ':'), '配件 ID 與裝備不符');
  assert(upgrade.nameEn && upgrade.nameZh && upgrade.descriptionEn && upgrade.descriptionZh, '缺少雙語配件內容');
  assert(rarities.includes(upgrade.rarity), '未知稀有度');
  assert(Number.isInteger(upgrade.size) && upgrade.size > 0, '占格數無效');
  assert(upgrade.tags.every(tag => Object.hasOwn(tagLabels, tag)), '未知效果標籤');
  assert(!upgrade.turbochargeEn || upgrade.turbochargeZh, '缺少 Turbocharge 譯文');
  assert(upgrade.stats.every(stat => stat.nameEn && stat.nameZh), '缺少屬性譯文');
  assert(/^assets\/icons\/[a-f0-9]{20}\.png$/.test(upgrade.icon), '圖示路徑無效');
  await access(path.join(siteRoot, upgrade.icon));
  searchIndex.set(upgrade.id, buildSearchIndex(upgrade, owner));
}
const filters = { category: 'all', owner: '', query: '', rarity: '', tag: '', status: 'all' };
const sample = catalogue.upgrades.find(upgrade => upgrade.nameEn === 'Infinity Burn');
assert(sample, '缺少搜尋驗證資料');
assert(filterUpgrades(catalogue.upgrades, { ...filters, query: sample.nameZh }, {}, searchIndex).some(upgrade => upgrade.id === sample.id), '中文搜尋無法找到配件');
const numericSample = catalogue.upgrades.find(upgrade => upgrade.stats.some(stat => stat.minRaw && stat.maxRaw));
const numericStat = numericSample.stats.find(stat => stat.minRaw && stat.maxRaw);
assert(filterUpgrades(catalogue.upgrades, { ...filters, query: numericSample.nameEn + ' ' + numericStat.minRaw }, {}, searchIndex).some(upgrade => upgrade.id === numericSample.id), '數值搜尋無法找到配件');
for (const asset of ['index.html', 'app.js', 'model.js', 'styles.css', 'recommendations.js', 'recommendations.css']) await access(path.join(siteRoot, asset));
console.log(`Validated ${catalogue.upgrades.length} upgrades, ${owners.size} equipment groups, translations and local assets.`);

const recommendations = JSON.parse(await readFile(path.join(siteRoot, 'data/recommendations.json'), 'utf8'));
const recommendationIndex = validateRecommendations(recommendations, catalogue);
const snapshot = JSON.parse(await readFile(path.join(repoRoot, 'research/tiermaker-snapshot.json'), 'utf8'));
const evidenceKey = item => [item.tier, String(item.sourceItemId ?? item.id), item.assetFilename ?? item.asset.split('/').at(-1)].join('/');
assert.equal(recommendations.verifiedOn, snapshot.verifiedOn, '榜單核對日期不符');
assert.equal(recommendations.sources.length, snapshot.sources.length, '榜單來源數量不符');
for (const source of recommendations.sources) {
  const original = snapshot.sources.find(item => item.url === source.url);
  assert(original && original.title === source.title, '來源標題或網址無法對照快照');
  assert.equal(source.rationaleProvided, false, '原榜單未提供逐項理由');
  const originalItems = original.rows.flatMap(row => row.items.map(item => evidenceKey({ ...item, tier: row.tier })));
  const importedItems = [...recommendations.weaponRatings, ...recommendations.upgradeRatings].filter(item => item.sourceId === source.id).concat(source.excludedItems).map(evidenceKey);
  assert.deepEqual(importedItems.sort(), originalItems.sort(), '來源項目的分級或對應證據不符：' + source.id);
}
assert.equal(recommendationIndex.sources.get('carson-weapons-1-4-6').gameVersion, '1.4.6');
assert(recommendations.sources.filter(source => source.author === 'No You').every(source => source.gameVersion === null), '未註明版本不可推測');
assert(!recommendations.weaponRatings.some(rating => rating.ownerId === 'accelerator' && rating.sourceId === 'carson-weapons-1-4-6'), 'Carson 未列 Accelerator，不可推測分級');
const rankState = { tier: 'all', missing: false, query: '' };
const allCycler = selectRankedUpgrades(recommendations, recommendationIndex, 'cycler', rankState, {});
const topCycler = selectRankedUpgrades(recommendations, recommendationIndex, 'cycler', { ...rankState, tier: 'top' }, {});
assert(allCycler.length > topCycler.length && topCycler.every(rating => ['S', 'A', 'SS'].includes(rating.tier)), '前段與全部分級篩選不符');
const sCycler = selectRankedUpgrades(recommendations, recommendationIndex, 'cycler', { ...rankState, tier: 'S' }, {});
assert(sCycler.length > 0 && sCycler.every(rating => rating.tier === 'S'), '單一分級篩選不符');
const guideRoute = recommendationIndex.guides.get('cycler').routes[0];
const collectedId = guideRoute.coreIds[0];
const records = { [collectedId]: { collected: true } };
assert(!selectRankedUpgrades(recommendations, recommendationIndex, 'cycler', { ...rankState, missing: true }, records).some(rating => rating.upgradeId === collectedId), '推薦清單未排除已取得配件');
assert.equal(routeCollection(guideRoute, records).collected, 1, '搭配進度未共用收集狀態');
assert(!routeCollection(guideRoute, records).missingIds.includes(collectedId), '搭配缺件清單包含已取得配件');
const invalidVersion = structuredClone(recommendations);
invalidVersion.sources.find(source => source.gameVersion === null).gameVersion = '1.6';
assert.throws(() => validateRecommendations(invalidVersion, catalogue), /未註明版本/);
const invalidOwner = structuredClone(recommendations);
invalidOwner.guides[0].routes[0].coreIds[0] = catalogue.upgrades.find(upgrade => upgrade.category !== 'weapons').id;
assert.throws(() => validateRecommendations(invalidOwner, catalogue), /其他武器/);
console.log(`Validated ${recommendations.sources.length} sources, ${recommendations.weaponRatings.length} weapon ratings, ${recommendations.upgradeRatings.length} upgrade ratings and ${recommendations.guides.reduce((sum, guide) => sum + guide.routes.length, 0)} editorial routes against source snapshots.`);

const fieldGuide = JSON.parse(await readFile(path.join(siteRoot, 'data/field-guide.json'), 'utf8'));
validateFieldGuide(fieldGuide, catalogue);
const wikiSource = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-equipment.json'), 'utf8'));
assert.equal(fieldGuide.equipment.items.length, wikiSource.items.length, '裝備索引數量不符');
for (const profile of fieldGuide.equipment.items) {
  assert.equal(profile.sourceRevision, wikiSource.items.find(item => item.ownerId === profile.ownerId)?.sourceRevision, '裝備修訂來源不符');
  assert.equal(profile.gameVersion, null, '裝備來源未註明遊戲版本');
}
const shapeSource = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-shapes.json'), 'utf8'));
for (const pattern of fieldGuide.shapes.patterns) {
  const original = shapeSource.patterns.find(item => item.sourceUrl === pattern.sourceUrl);
  assert(original, '格形缺少來源');
  assert.deepEqual(pattern.cells, original.cells, '格形座標與解析來源不符');
  assert.equal(pattern.gameVersion, original.gameVersion, '格形版本不符');
  assert.deepEqual(rotateHexCells(pattern.cells, 6), normalizeHexCells(pattern.cells), '六次旋轉未回到原格形');
  assert.equal(rotateHexCells(pattern.cells).length, pattern.cells.length, '旋轉改變格數');
  assert(!Object.hasOwn(pattern, 'asset'), '網站不應使用來源 SVG 貼圖');
}
assert(hexCellsOverlap([[0, 0]], [[1, 0]], [-1, 0]), '平移後重疊未偵測');
assert(!hexCellsOverlap([[0, 0]], [[1, 0]]), '不相交格子誤判');
const sampleShape = fieldGuide.shapes.patterns.find(pattern => pattern.upgradeIds.includes('dmlr:autocycler'));
assert(sampleShape && renderShape(sampleShape, 7).includes('Count differs'), '版本格數差異未標示');
assert.equal((renderHexPattern(sampleShape.cells).match(/<polygon /g) || []).length, sampleShape.cellCount, '繪圖數量不符');
const inlineUpgrade = renderUpgrade(sample, owners.get(sample.ownerId), {}, {});
assert(!inlineUpgrade.includes('data-detail') && !inlineUpgrade.includes('textarea'), '攻略仍依賴詳情或筆記介面');
assert(inlineUpgrade.includes(escapeHtml(sample.descriptionEn)) && inlineUpgrade.includes('upgrade-stats'), '效果與數值未直接列出');
const legacyCollection = emptyCollection();
legacyCollection.records[sample.id] = { collected: true, tracked: true, note: 'Legacy private note', updatedAt: '2026-10-23T00:00:00.000Z' };
assert(!renderUpgrade(sample, owners.get(sample.ownerId), legacyCollection.records[sample.id]).includes('Legacy private note'), '攻略不應顯示個人筆記');
assert.equal(parseCollection(JSON.stringify(makeBackup(legacyCollection, catalogue.datasetVersion))).records[sample.id].note, 'Legacy private note', '移除筆記介面不可丟棄舊備份資料');
const invalidPattern = structuredClone(fieldGuide);
invalidPattern.shapes.patterns[0].cells.push(invalidPattern.shapes.patterns[0].cells[0]);
assert.throws(() => validateFieldGuide(invalidPattern, catalogue), /格形|格點/);
for (const asset of ['wiki.js', 'patterns.js']) await access(path.join(siteRoot, asset));
console.log(`Validated ${fieldGuide.equipment.items.length} Wiki profiles, ${fieldGuide.shapes.patterns.length} coordinate patterns, ${fieldGuide.unlocks.mechanics.length} unlock topics, rotations and collision geometry.`);
