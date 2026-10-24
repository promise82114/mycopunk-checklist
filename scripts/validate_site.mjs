import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSearchIndex, filterUpgrades, tagLabels, rarities, emptyCollection, makeBackup, parseCollection, upgradeStacking } from '../prototype/model.js';
import { validateRecommendations, selectRankedUpgrades, routeCollection } from '../prototype/recommendations.js';
import { validateFieldGuide, renderShape, renderUpgrade, escapeHtml } from '../prototype/wiki.js';
import { normalizeHexCells, rotateHexCells, hexCellsOverlap, renderHexPattern } from '../prototype/patterns.js';
import { validateHiddenPaths, renderPathDiagram, renderHiddenPaths } from '../prototype/hidden-paths.js';
import { createBoard, enumeratePlacements, solvePacking } from '../prototype/build-solver.js';
import { validateBuildRules, availableBuildUpgrades, buildBoardStage, buildUpgradeId, buildCopyLimit, setBuildQuantity, buildPackingPieces, renderBuildBoard, renderBuildShape } from '../prototype/build-planner.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const siteRoot = path.join(repoRoot, 'prototype');
const workbook = JSON.parse(await readFile(path.join(siteRoot, 'data/upgrades.json'), 'utf8'));
let catalogue = workbook;
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

catalogue = JSON.parse(await readFile(path.join(siteRoot, 'data/catalogue.json'), 'utf8'));
assert.equal(catalogue.upgrades.length, 842);
assert.equal(catalogue.counts.wikiRecords, 840);
assert.equal(catalogue.primarySource.kind, 'wiki');
assert.equal(new Set(catalogue.upgrades.map(item=>item.id)).size, catalogue.upgrades.length);
for (const old of workbook.upgrades) assert(catalogue.upgrades.some(item=>item.id === old.id), 'Old collection ID lost');
for (const item of catalogue.upgrades) {
  assert(item.nameEn && item.nameZh && item.descriptionEn && item.descriptionZh, 'Missing bilingual Wiki content');
  assert(rarities.includes(item.rarity));
  assert(item.stats.every(stat=>stat.nameEn && stat.nameZh));
  if (item.source.kind === 'wiki') assert(item.source.revision && item.wikiUrl.includes('oldid='));
}
assert.equal(catalogue.upgrades.filter(item=>item.ownerId==='mycologist').length,36);
assert.equal(catalogue.upgrades.find(item=>item.id==='carver:nutrition-sampler').nameEn,'Nutritious Cores', 'Wiki redirect must retain collection ID');
validateRecommendations(recommendations, catalogue);
const fieldGuide = JSON.parse(await readFile(path.join(siteRoot, 'data/field-guide.json'), 'utf8'));
validateFieldGuide(fieldGuide, catalogue);
const wikiSource = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-equipment.json'), 'utf8'));
assert.equal(fieldGuide.equipment.items.length, wikiSource.items.length, '裝備索引數量不符');
for (const profile of fieldGuide.equipment.items) {
  assert.equal(profile.sourceRevision, wikiSource.items.find(item => item.ownerId === profile.ownerId)?.sourceRevision, '裝備修訂來源不符');
  assert.equal(profile.gameVersion, null, '裝備來源未註明遊戲版本');
}
const shapeSource = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-shapes.json'), 'utf8'));
const shapeCoordinates = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-shape-coordinates.json'), 'utf8'));
const newCoordinates = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-catalogue-coordinates.json'), 'utf8'));
const geometryBySource = new Map([...shapeCoordinates.coordinates.filter(item => item.cells), ...newCoordinates.patterns].map(item => [item.sourceUrl, item]));
const coveredShapeIds = new Set(fieldGuide.shapes.patterns.flatMap(item => item.upgradeIds));
assert.equal(coveredShapeIds.size, fieldGuide.shapes.coverage.coveredUpgradeRecords, '格形覆蓋統計不符');
assert.equal(coveredShapeIds.size,837);
assert.deepEqual(catalogue.upgrades.filter(item=>!coveredShapeIds.has(item.id) && !item.emptyPattern).map(item=>item.id).sort(), [...shapeSource.unmatchedUpgradeIds].sort(), '缺圖清單不符');
assert.equal(catalogue.upgrades.filter(item=>item.emptyPattern).length,3);
for (const owner of catalogue.owners.filter(item=>item.category!=='general')) assert(catalogue.upgrades.some(item=>item.ownerId===owner.id && coveredShapeIds.has(item.id)), 'Missing owner shapes');
for (const id of ['cycler:corrode-siphon', 'cycler:violent-ignition', 'cycler:edge-fault', 'gunship-cannon:yellow-prism', 'gunship-cannon:blue-prism', 'gunship-cannon:green-prism', 'gunship-cannon:purple-prism', 'plate-launcher:rail-tuning']) {
  assert(coveredShapeIds.has(id), '索引漏項或名稱差異再次造成缺圖：' + id);
}
const pageEvidence = JSON.parse(await readFile(path.join(repoRoot, 'research/wiki-shape-page-evidence.json'), 'utf8'));
for (const pattern of shapeSource.patterns.filter(item => item.nameMatchEvidenceUrl)) {
  const page = Object.values(pageEvidence.response.query.pages).find(page => pattern.nameMatchEvidenceUrl.endsWith('/' + page.title.replaceAll(' ', '_')));
  assert(page?.images?.some(image => image.title === pattern.fileTitle), '名稱對應缺少條目引用證據');
}
for (const pattern of fieldGuide.shapes.patterns) {
  const original = newCoordinates.patterns.find(item=>item.sourceUrl === pattern.sourceUrl) || shapeSource.patterns.find(item => item.sourceUrl === pattern.sourceUrl);
  assert(original, '格形缺少來源');
  assert.deepEqual(pattern.cells, original.cells, '格形座標與解析來源不符');
  assert.deepEqual(pattern.cells, geometryBySource.get(pattern.sourceUrl)?.cells, '格形與記憶體解析快照不符');
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
assert(renderShape(null, 5).includes('Coordinates pending') && !renderShape(null, 5).includes('not provided'), '未匯入不應宣稱來源無圖');
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

const hiddenPaths = validateHiddenPaths(fieldGuide.hiddenPaths);
const pathSnapshot = JSON.parse(await readFile(path.join(repoRoot, 'research/hidden-paths-current.json'), 'utf8'));
assert.equal(hiddenPaths.source.revision, pathSnapshot.sourceRevision.commit, '路徑固定來源修訂不符');
assert.equal(hiddenPaths.source.sha256, pathSnapshot.manifestEntry.sha256, '路徑匯出雜湊不符');
assert.equal(hiddenPaths.source.gameVersion, pathSnapshot.gameVersion.Version, '路徑版本不符');
assert.equal(hiddenPaths.source.buildId, pathSnapshot.gameVersion.BuildID, '路徑 Build 不符');
for (const [index, item] of hiddenPaths.paths.entries()) {
  const original = pathSnapshot.patternPaths[item.id];
  const enabledCells = [];
  original.Pattern.nodes.forEach((row, y) => row.nodes.forEach((cell, x) => {
    if (cell.enabled) enabledCells.push({ column: x, row: y, q: x, r: y - Math.floor(x / 2), connections: cell.connections });
  }));
  assert.equal(item.width, original.Pattern.width);
  assert.equal(item.height, original.Pattern.height);
  assert.deepEqual(item.enabledCells, enabledCells, '路徑與原始逐格資料不符');
  assert.deepEqual(item.rewardsRaw, original.Rewards, '路徑獎勵不符');
  assert.equal(item.raritiesRaw, original.Rarities);
  assert.equal(item.cellCount, [7, 22, 7, 9, 9, 10, 10][index]);
  assert.deepEqual(item.rarityRule, index === 2 ? { any: false, allowed: ['Rare'] } : index === 3 ? { any: false, allowed: ['Epic'] } : index === 6 ? { any: false, allowed: ['Standard', 'Rare'] } : { any: true, allowed: [] });
  const svg = renderPathDiagram(item);
  assert.equal((svg.match(/class="path-cell path-required"/g) || []).length, item.cellCount);
  assert.equal((svg.match(/<polygon /g) || []).length, item.width * item.height);
  assert(!/<image|<img|https?:/.test(svg), '路徑不可使用外部貼圖');
}
for (const mutate of [d => d.paths.pop(), d => d.paths[0].cells[0][1]++, d => d.paths[0].buildId = 'unknown']) {
  const invalid = structuredClone(hiddenPaths); mutate(invalid);
  assert.throws(() => validateHiddenPaths(invalid), /隱藏路徑/);
}
assert(renderHiddenPaths(hiddenPaths).includes('v2.0.2') && renderHiddenPaths(hiddenPaths).includes('1.0.3'), '新舊版本未區分');
await access(path.join(siteRoot, 'hidden-paths.js'));
console.log('Validated seven Hidden Paths against original cells, rarity rules, rewards, source versions and generated diagrams.');

const buildRules = validateBuildRules(JSON.parse(await readFile(path.join(siteRoot, 'data/build-rules.json'), 'utf8')), catalogue);
const buildEvidence = JSON.parse(await readFile(path.join(repoRoot, 'research/build-board-evidence.json'), 'utf8'));
assert.equal(buildRules.source.sha256, buildEvidence.sha256, '配裝資料匯出雜湊不符');
assert.equal(buildRules.source.url, buildEvidence.source.fileUrl, '配裝固定修訂來源不符');
assert.equal(buildRules.source.gameVersion, buildEvidence.gameVersion.Version, '配裝適用版本不符');
assert.deepEqual(buildRules.boardProfile, buildEvidence.gridProfiles.DefaultGridProfile.GridSizes, '面板預設與來源不符');
assert.deepEqual(buildBoardStage(buildRules,'mycologist',{playerLevel:2,stage:10}), {Level:0,Width:5,Height:5});
assert.deepEqual(buildBoardStage(buildRules,'mycologist',{playerLevel:6,stage:0}), {Level:6,Width:6,Height:6});
assert.deepEqual(buildBoardStage(buildRules,'g6-street-sweeper',{playerLevel:30,stage:10}), {Level:0,Width:5,Height:5});
for (const id of ['photon-disc','snowball-grenade','laser-cannon','mycologist']) assert(availableBuildUpgrades(catalogue,buildRules,id).length>=10);
assert(!availableBuildUpgrades(catalogue,buildRules,'accelerator').some(item=>item.archived));
assert.deepEqual(buildRules.rotationUnlocks, { Standard: 3, Rare: 8, Epic: 16, Exotic: 30 });
assert.deepEqual(buildRules.boardProfile.map(stage => [stage.Level, stage.Width, stage.Height]), [[0, 5, 5], [3, 6, 5], [6, 6, 6], [10, 7, 6]]);
assert(availableBuildUpgrades(catalogue, buildRules, 'wrangler').some(item => item.id === 'general:reinforced-plating'), '角色缺少通用配件');
assert(availableBuildUpgrades(catalogue, buildRules, 'mycologist').some(item => item.id === 'general:reinforced-plating'), '新版角色缺少通用配件');
assert(!availableBuildUpgrades(catalogue, buildRules, 'cycler').some(item => item.id === 'general:reinforced-plating'), '角色通用配件不應混入武器');
const cyclerOptions = availableBuildUpgrades(catalogue, buildRules, 'cycler');
assert.equal(new Set(cyclerOptions.map(item => item.nameEn)).size, cyclerOptions.length, '專屬與通用分頁不應造成同名配件重複選取');
assert(buildRules.rules['cycler:edge-fault'].geometryModifier, '擴格效果未另列');
const validateLayout = (result, board, pieces) => {
  const boardKeys = new Set(board.map(cell => cell.join(','))), occupied = new Set();
  assert.equal(result.placements.length + result.unplaced.length, pieces.length);
  for (const placement of result.placements) {
    assert(pieces.some(piece => piece.id === placement.id));
    for (const cell of placement.cells) { const key = cell.join(','); assert(boardKeys.has(key), '配件超出面板'); assert(!occupied.has(key), '配件重疊'); occupied.add(key); }
    assert.equal(placement.cells.length, pieces.find(piece => piece.id === placement.id).cells.length);
  }
  assert.equal(occupied.size, result.usedCells);
};
const narrow = createBoard(1, 2), diagonal = [{ id: 'diagonal', cells: [[0, 0], [1, 0]], allowRotation: false }];
assert.equal(solvePacking({ board: narrow, pieces: diagonal }).unplaced[0].reason, 'no-placement');
const rotated = solvePacking({ board: narrow, pieces: [{ ...diagonal[0], allowRotation: true }] });
assert(rotated.allFit && rotated.placements[0].turns > 0, '需要旋轉的配件未能裝入');
assert.doesNotThrow(() => JSON.stringify(rotated), 'Worker 結果不可含 BigInt 等無法匯出的資料');
assert(enumeratePlacements([[2, -1], [3, -2]], [[0, 1], [1, 0]], false).length > 0, '沒有原點格的格形對位失敗');
const pieces = [{ id: 'a', cells: [[0, 0], [0, 1]], allowRotation: true }, { id: 'b', cells: [[0, 0], [1, 0]], allowRotation: true }, { id: 'c', cells: [[0, 0]] }, { id: 'd', cells: [[0, 0]] }];
for (const board of [createBoard(2, 2), createBoard(3, 2, ['1,0']), createBoard(1, 1), []]) {
  // Small independent exhaustive subset search is the oracle for the branch-and-bound objective.
  let expected = [0, 0];
  function brute(index, occupied, count, area) {
    if (index === pieces.length) { if (count > expected[0] || (count === expected[0] && area > expected[1])) expected = [count, area]; return; }
    brute(index + 1, occupied, count, area);
    for (const placement of enumeratePlacements(board, pieces[index].cells, pieces[index].allowRotation === true)) {
      const keys = placement.cells.map(cell => cell.join(','));
      if (!keys.some(key => occupied.has(key))) brute(index + 1, new Set([...occupied, ...keys]), count + 1, area + keys.length);
    }
  }
  brute(0, new Set(), 0, 0);
  const result = solvePacking({ board, pieces, maxNodes: 100000, timeLimitMs: 10000 });
  assert(result.optimal); assert.deepEqual([result.placements.length, result.usedCells], expected); validateLayout(result, board, pieces);
}
const timed = solvePacking({ board: createBoard(1, 3), pieces: pieces.slice(0, 2), maxNodes: 0 });
assert(timed.limited && !timed.optimal && timed.unplaced.some(item => item.reason === 'search-limit'), '搜尋中止不可宣稱無解');
const unavailable = solvePacking({ board: narrow, pieces: [{ id: 'unknown' }, { id: 'grow', cells: [[0, 0]], unsupported: true }] });
assert.deepEqual(unavailable.unplaced.map(item => item.reason), ['missing-shape', 'geometry-modifier']);
assert(!unavailable.allFit);
assert.throws(() => createBoard(0, 3));
assert.throws(() => solvePacking({ board: narrow, pieces: [pieces[0], pieces[0]] }));
for (const asset of ['build-planner.js', 'build-solver.js', 'build-worker.js', 'build-planner.css']) await access(path.join(siteRoot, asset));
console.log('Validated build board presets, rotation levels, equipment eligibility, optimal small-board packing, overlaps, missing shapes and search limits.');

for (const item of catalogue.upgrades) assert.equal(buildRules.rules[item.id].stacking, upgradeStacking(item), 'Wiki 疊加旗標與模擬器不一致');
assert.equal(upgradeStacking({flags:'CanStackInMission'}), 'mission', '不可把 CanStackInMission 子字串誤判為一般疊加');
assert.equal(upgradeStacking({flags:'CanStack, CanStackInMission'}), 'always');
assert.equal(upgradeStacking({}), 'unknown');
const multiId = 'shocklance:auger-subroutine', missionId = 'cycler:bigazine', singleId = 'cycler:extralight-frame';
assert.equal(buildRules.rules[multiId].stacking, 'always');
assert.equal(buildRules.rules[missionId].stacking, 'mission');
assert.equal(buildRules.rules[singleId].stacking, 'single');
assert.equal(buildCopyLimit(buildRules.rules[missionId], 'loadout'), 1);
const copiesDraft = {selected:[],nextInstance:1,context:'loadout',playerLevel:30};
setBuildQuantity(copiesDraft,multiId,3,buildRules.rules[multiId]);
setBuildQuantity(copiesDraft,singleId,1,buildRules.rules[singleId]);
const stableCopies = [...copiesDraft.selected];
assert.equal(new Set(stableCopies).size,4);
assert.equal(stableCopies.filter(id=>buildUpgradeId(id)===multiId).length,3);
setBuildQuantity(copiesDraft,multiId,2,buildRules.rules[multiId]);
assert.deepEqual(copiesDraft.selected,[stableCopies[0],stableCopies[1],stableCopies[3]], '減少份數應保留其他副本的識別碼');
setBuildQuantity(copiesDraft,multiId,3,buildRules.rules[multiId]);
assert(!copiesDraft.selected.includes(stableCopies[2]), '刪除的副本不可與新副本共用識別碼');
assert.throws(()=>setBuildQuantity(copiesDraft,singleId,2,buildRules.rules[singleId]), /one copy/);
assert.throws(()=>setBuildQuantity(copiesDraft,missionId,2,buildRules.rules[missionId]), /one copy/);
const beforeInvalid = structuredClone(copiesDraft);
assert.throws(()=>setBuildQuantity(copiesDraft,multiId,41,buildRules.rules[multiId]), /0–40/);
assert.throws(()=>setBuildQuantity(copiesDraft,multiId,40,buildRules.rules[multiId]), /at most 40/);
assert.deepEqual(copiesDraft,beforeInvalid,'無效份數不可修改原選擇');
const copyUpgradeIndex = new Map(catalogue.upgrades.map(item=>[item.id,item]));
const copyShapeIndex = new Map(fieldGuide.shapes.patterns.flatMap(shape=>shape.upgradeIds.map(id=>[id,shape])));
const copyPieces = buildPackingPieces(copiesDraft,copyUpgradeIndex,copyShapeIndex,buildRules);
const copyBoard = createBoard(12,12), copyResult = solvePacking({board:copyBoard,pieces:copyPieces});
assert(copyResult.allFit && copyResult.placements.length===4, '同款多份配件必須獨立排放');
validateLayout(copyResult,copyBoard,copyPieces);
const onlySameCopies = copyPieces.filter(item=>buildUpgradeId(item.id)===multiId);
const oneCopyBoard = copyShapeIndex.get(multiId).cells;
const oneCopyFit = solvePacking({board:oneCopyBoard,pieces:onlySameCopies});
assert.equal(oneCopyFit.placements.length,1);
assert.deepEqual(oneCopyFit.unplaced.map(item=>item.reason),['capacity-conflict','capacity-conflict']);
validateLayout(oneCopyFit,oneCopyBoard,onlySameCopies);
const copyMarkup = renderBuildBoard({...copiesDraft,width:12,height:12,blocked:[],result:copyResult});
for (let i=1;i<=4;i++) assert(copyMarkup.includes('· #'+i), '每份需有獨立面板編號');
const missionDraft = {selected:[],nextInstance:1,context:'mission',playerLevel:30};
setBuildQuantity(missionDraft,missionId,3,buildRules.rules[missionId]);
missionDraft.context='loadout';
const restricted = solvePacking({board:copyBoard,pieces:buildPackingPieces(missionDraft,copyUpgradeIndex,copyShapeIndex,buildRules)});
assert.equal(missionDraft.selected.length,3,'切換情境不可默默刪除副本');
assert.equal(restricted.placements.length,1);
assert.deepEqual(restricted.unplaced.map(item=>item.reason),['stacking-restricted','stacking-restricted']);
missionDraft.context='mission';
assert(solvePacking({board:copyBoard,pieces:buildPackingPieces(missionDraft,copyUpgradeIndex,copyShapeIndex,buildRules)}).allFit);
assert(renderUpgrade(copyUpgradeIndex.get(multiId),owners.get('shocklance'),{}).includes('可重複安裝'));
assert(renderUpgrade(copyUpgradeIndex.get(missionId),owners.get('cycler'),{}).includes('任務內可疊加'));
assert(buildSearchIndex(copyUpgradeIndex.get(multiId),owners.get('shocklance')).includes('可重複安裝'), '疊加標籤應可搜尋');
console.log('Validated stacking flags, separate copy IDs, quantity limits, context changes, repeated-shape packing and catalogue labels.');

const expansionEvidence = JSON.parse(await readFile(path.join(repoRoot,'research/build-expansion-evidence.json'),'utf8'));
assert.equal(expansionEvidence.sha256,buildRules.source.sha256);
assert.equal(buildRules.expansionSource.url,expansionEvidence.sourceUrl);
for (const item of catalogue.upgrades.filter(item => ['Edge Fault','Boundary Incursion'].includes(item.nameEn))) {
  assert.deepEqual(buildRules.rules[item.id].boardExpansion,{axes:['column','row'],amount:1});
  const source = expansionEvidence.upgrades.find(entry => entry.Name === item.nameEn);
  assert.equal(source.propertyType,'UpgradeProperty_GrowGrid');
  for (const roll of Object.values(source.rolledValuesByUpgradable)) assert.deepEqual(roll.Adds,['Column','Row']);
}
const grow = (id,axis) => ({id,cells:[[0,0]],growAxis:axis});
const expansionBase = {width:2,height:2,blocked:[]};
const expansionPieces = [grow('column','column'),grow('row','row'),{id:'tall',cells:[[0,0],[0,1],[0,2]],allowRotation:false}];
const expanded = solvePacking({board:createBoard(2,2),baseBoard:expansionBase,pieces:expansionPieces});
assert(expanded.allFit && expanded.optimal);
assert.deepEqual([expanded.board.width,expanded.board.height,expanded.boardCells,expanded.usedCells],[3,3,9,5]);
validateLayout(expanded,expanded.board.cells,expansionPieces);
// Replay the emitted installation order without granting a modifier its own cells.
const replayExpansion = (result,base) => {
  let width=base.width,height=base.height; const occupied=new Set();
  for (const step of result.expansionSteps) {
    assert.deepEqual(step.before,{width,height});
    const boardKeys=new Set(createBoard(width,height,base.blocked).map(cell=>cell.join(',')));
    const placement=result.placements.find(entry=>entry.id===step.id);
    for (const cell of placement.cells) {const key=cell.join(','); assert(boardKeys.has(key)); assert(!occupied.has(key));occupied.add(key);}
    width+=Number(step.axis==='column'); height+=Number(step.axis==='row');
    assert.deepEqual(step.after,{width,height});
  }
  assert.deepEqual([result.board.width,result.board.height],[width,height]);
};
replayExpansion(expanded,expansionBase);
const orderMatters = solvePacking({board:createBoard(1,1),baseBoard:{width:1,height:1,blocked:[]},pieces:[grow('column','column'),grow('row','row'),{id:'vertical',cells:[[0,0],[0,1]],allowRotation:false}]});
assert(orderMatters.allFit && orderMatters.expansionSteps[0].axis==='row','需搜尋擴格安裝順序，不能鎖死為挑選順序');
replayExpansion(orderMatters,{width:1,height:1,blocked:[]});
const allBlocked = {width:1,height:1,blocked:['0,0']};
const noSelfFunding = solvePacking({board:[],baseBoard:allBlocked,pieces:[grow('grow','column')]});
assert(!noSelfFunding.allFit && noSelfFunding.placements.length===0 && noSelfFunding.boardCells===0 && noSelfFunding.board.width===1, '未裝入的配件不可解鎖自己的格位');
const chained = solvePacking({board:createBoard(1,1),baseBoard:{width:1,height:1,blocked:[]},pieces:[grow('a','column'),grow('b','column'),grow('c','row')]});
assert(chained.allFit); replayExpansion(chained,{width:1,height:1,blocked:[]});
assert.deepEqual([chained.board.width,chained.board.height,chained.usedCells],[3,2,3]);
const excludedGrow = solvePacking({board:createBoard(2,2),baseBoard:expansionBase,pieces:[{...grow('blocked','column'),exclusion:'stacking-restricted'},grow('yes','row')]});
assert.equal(excludedGrow.board.width,2); assert.equal(excludedGrow.board.height,3);assert.equal(excludedGrow.unplaced[0].reason,'stacking-restricted');
const budgetGrow = solvePacking({board:createBoard(2,2),baseBoard:expansionBase,pieces:expansionPieces,maxNodes:0});
assert(budgetGrow.limited && !budgetGrow.optimal && budgetGrow.boardCells===4 && budgetGrow.placements.length===0);
assert.throws(()=>solvePacking({board:createBoard(2,2),baseBoard:{width:3,height:2,blocked:[]},pieces:[grow('bad','row')]}));
const growDraft={selected:['cycler:edge-fault@1','cycler:edge-fault@2'],context:'mission',playerLevel:30,expansionAxes:{'cycler:edge-fault@1':'column','cycler:edge-fault@2':'row'}};
const growCopies=buildPackingPieces(growDraft,copyUpgradeIndex,copyShapeIndex,buildRules);
assert.deepEqual(growCopies.map(piece=>piece.growAxis),['column','row']); assert(growCopies.every(piece=>!piece.unsupported));
delete growDraft.expansionAxes['cycler:edge-fault@2'];
assert.equal(buildPackingPieces(growDraft,copyUpgradeIndex,copyShapeIndex,buildRules)[1].exclusion,'expansion-unset');
const beforeGrow=solvePacking({board:createBoard(2,2),baseBoard:expansionBase,pieces:expansionPieces.slice(2)});
assert.equal(beforeGrow.placements.length,0,'移除擴格應回到基礎面板');
const enlargedDrawing=renderBuildBoard({width:2,height:2,blocked:[],selected:expansionPieces.map(piece=>piece.id),result:expanded});
assert.equal((enlargedDrawing.match(/data-build-cell=/g)||[]).length,9);
assert.equal((enlargedDrawing.match(/class="build-added-cell"/g)||[]).length,5);
assert.equal((renderBuildShape({cells:[[0,0]]},'always').match(/class="hex-pattern"/g)||[]).length,3,'未選取的疊加預覽應有三層格形');
assert.equal((renderBuildShape({cells:[[0,0]]},'single').match(/class="hex-pattern"/g)||[]).length,1);
assert.equal((renderBuildShape({cells:[[0,0]]},'mission').match(/class="hex-pattern"/g)||[]).length,1,'一般配裝不可把任務限定配件畫成可疊加');
assert.equal((renderBuildShape({cells:[[0,0]]},'mission','mission').match(/class="hex-pattern"/g)||[]).length,3,'任務內配裝才顯示任務限定配件的重疊格形');
assert.equal((renderBuildShape({cells:[[0,0]]},'always','mission').match(/class="hex-pattern"/g)||[]).length,3);
assert(!renderBuildShape({cells:[[0,0]]},'mission','mission').includes('任務疊加'),'卡片不再要求分辨兩種疊加圖示');
for (const context of ['loadout','mission']) for (const stacking of ['always','mission','single','unknown']) {
  const markup=renderBuildShape({cells:[[0,0]]},stacking,context);
  assert.equal(markup.includes('is-stackable'),buildCopyLimit({stacking},context)>1,'圖形必須和目前模式的份數限制一致');
}
console.log('Validated per-copy expansion rolls, installation order, real board cells, exclusions, removal, search limits and stacked shape previews.');
