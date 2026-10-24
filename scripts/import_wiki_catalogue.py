"""Wiki 優先、工作簿補充；保留既有 ID，離線重建完整圖鑑與新格形索引。"""
import json
import re
import hashlib
from pathlib import Path
from wiki_catalogue import clean, key, slug, fields, members, revisionUrl, findPage, stats, acquisitionZh, descriptionKey
from import_excel import tagRules

root = Path(__file__).resolve().parents[1]
read = lambda path: json.loads((root / path).read_text(encoding='utf-8'))
legacy = read('prototype/data/upgrades.json')
snapshot = read('research/wiki-catalogue-snapshot.json')
profiles = read('research/wiki-equipment.json')['items']
translationsPath = root / 'localization/wiki-upgrades-zh-Hant.json'
translations = json.loads(translationsPath.read_text(encoding='utf-8')) if translationsPath.exists() else {}
known = {key(item['nameEn']): item for item in legacy['upgrades']}
knownDescriptions = {descriptionKey(item['descriptionEn']): item['descriptionZh'] for item in legacy['upgrades']}
labels = {key(stat['nameEn']): stat['nameZh'] for item in legacy['upgrades'] for stat in item['stats']}
byPair = {(item['ownerId'], key(item['nameEn'])): item for item in legacy['upgrades']}
redirectedIds = set()
for old in legacy['upgrades']:
    title = old['wikiUrl'].split('/wiki/')[-1].replace('_', ' ') if old['wikiUrl'] else old['nameEn'] + ' Upgrade'
    page = findPage(snapshot, title)
    canonical = fields(page).get('name') if page else None
    if canonical and key(canonical) != key(old['nameEn']):
        byPair[old['ownerId'], key(canonical)] = old
        redirectedIds.add(old['id'])
listed, upgradeInfo, ownerInfo = {}, {}, {}
for profile in profiles:
    ownerId = profile['ownerId']
    page = snapshot['ownerPages'][snapshot['ownerTitles'][ownerId] + '/source']
    info = fields(page)
    ownerInfo[ownerId] = {'apiName': info.get('api_name'), 'category': profile['category'], 'sourceUrl': revisionUrl(page)}
    for item in members(page):
        listed[ownerId, key(item['nameEn'])] = item | {'ownerId': ownerId, 'category': profile['category'], 'listSourceUrl': revisionUrl(page)}
# 工作簿舊記錄均保留；能讀到 Wiki 修訂時也以 Wiki 更新其內容。
for old in legacy['upgrades']:
    if old['id'] in redirectedIds:
        continue
    listed.setdefault((old['ownerId'], key(old['nameEn'])), {'ownerId': old['ownerId'], 'category': old['category'], 'nameEn': old['nameEn'], 'title': old['wikiUrl'].split('/wiki/')[-1].replace('_', ' ') if old['wikiUrl'] else old['nameEn'] + ' Upgrade', 'descriptionEn': old['descriptionEn'], 'rarity': old['rarity'], 'legacyExtra': True})
items, pending, patternsWanted = [], {}, {}
for (ownerId, nameKey), entry in sorted(listed.items()):
    old = byPair.get((ownerId, nameKey))
    page = findPage(snapshot, entry['title'])
    info = fields(page) if page else {}
    hasSource = bool(page and (page['sections'].get('description') or info.get('rarity')))
    name = entry['nameEn']
    description = clean(page['sections'].get('description')) if hasSource else entry['descriptionEn']
    rarity = info.get('rarity', entry['rarity'])
    translation = translations.get(name, {})
    nameZh = translation.get('nameZh') or known.get(nameKey, {}).get('nameZh', '')
    descriptionZh = translation.get('descriptionZh') or knownDescriptions.get(descriptionKey(description), '')
    if not nameZh or not descriptionZh:
        pending[name] = {'nameEn': name, 'nameZh': nameZh, 'descriptionEn': description, 'descriptionZh': descriptionZh}
    item = dict(old or {})
    item.update({'id': old['id'] if old else ownerId + ':' + slug(name), 'ownerId': ownerId, 'category': entry['category'], 'nameEn': name, 'nameZh': nameZh, 'descriptionEn': description, 'descriptionZh': descriptionZh, 'rarity': rarity, 'size': old['size'] if old else None, 'workbookSize': old['size'] if old else None, 'tags': old['tags'] if old else [], 'stats': stats(page, labels) if hasSource else old['stats'] if old else [], 'turbochargeEn': '' if hasSource else old.get('turbochargeEn', '') if old else '', 'turbochargeZh': '' if hasSource else old.get('turbochargeZh', '') if old else '', 'icon': old['icon'] if old else known.get(nameKey, {}).get('icon', ''), 'wikiUrl': revisionUrl(page) if hasSource else entry.get('listSourceUrl', old.get('wikiUrl', '') if old else ''), 'source': {'kind': 'wiki' if hasSource or entry.get('listSourceUrl') else 'workbook', 'revision': page['revision'] if hasSource else None, 'sheet': 'Wiki' if hasSource or entry.get('listSourceUrl') else old['source']['sheet'], 'row': 0 if hasSource or entry.get('listSourceUrl') else old['source']['row'], 'url': revisionUrl(page) if hasSource else entry.get('listSourceUrl'), 'checkedOn': snapshot['checkedOn']}, 'legacyExtra': bool(entry.get('legacyExtra')), 'archived': bool(entry.get('legacyExtra') and ownerId != 'general')})
    if hasSource:
        item['acquisitionEn'] = clean(page['sections'].get('acquisition', '').split('\n\n')[0])
        item['acquisitionZh'] = acquisitionZh(item['acquisitionEn']) if item['acquisitionEn'] else ''
        item['patternFile'] = info.get('pattern', '')
        item['flags'] = info.get('flags', '')
        item['tags'] = [tag for tag, rule in tagRules + [('cryo', r'cryo|freez|frozen|shatter|snowball')] if re.search(rule, description, re.I)]
    if item.get('patternFile'):
        patternsWanted.setdefault(item['patternFile'], []).append(item['id'])
    items.append(item)
coordinatePath = root / 'research/wiki-catalogue-coordinates.json'
coordinateData = json.loads(coordinatePath.read_text(encoding='utf-8')) if coordinatePath.exists() else {'patterns': []}
emptyFiles = coordinateData.get('emptyFiles', [])
oldShapes = read('research/wiki-shapes.json')['patterns']
shapeIndex = {itemId: pattern for pattern in oldShapes for itemId in pattern['upgradeIds']}
for pattern in coordinateData['patterns']:
    for itemId in patternsWanted.get(pattern['fileTitle'], []):
        shapeIndex[itemId] = pattern
shapes = []
for item in items:
    item['emptyPattern'] = item.get('patternFile') in emptyFiles
    if item['emptyPattern']:
        item['size'] = None
    pattern = shapeIndex.get(item['id'])
    if pattern and not item['emptyPattern']:
        item['size'] = len(pattern['cells'])
        shapes.append({field: pattern[field] for field in ['cells', 'cellCount', 'coordinateSystem', 'sourceUrl', 'gameVersion', 'checkedOn', 'author', 'license', 'licenseUrl'] if field in pattern} | {'upgradeIds': [item['id']], 'nameEn': item['nameEn']})
owners = [{'id': item['ownerId'], 'nameEn': item['nameEn'], 'nameZh': item['nameZh'], 'category': item['category']} for item in profiles] + [owner for owner in legacy['owners'] if owner['id'] == 'general']
output = {'schemaVersion': 1, 'datasetVersion': 'wiki-' + snapshot['checkedOn'] + '-' + hashlib.sha256(json.dumps(items, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12], 'source': legacy['source'], 'primarySource': {'kind': 'wiki', 'url': snapshot['sourceUrl'], 'checkedOn': snapshot['checkedOn'], 'license': snapshot['license']}, 'owners': owners, 'upgrades': items, 'counts': {'records': len(items), 'distinctNames': len({item['nameEn'] for item in items}), 'wikiRecords': sum(item['source']['kind'] == 'wiki' for item in items), 'legacyRecords': len(legacy['upgrades'])}}
output['legacyDatasetVersion'] = legacy['datasetVersion']
output['legacyWeaponOwnerIds'] = [owner['id'] for owner in legacy['owners'] if owner['category'] == 'weapons']
(root / 'prototype/data/catalogue.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(root / 'research/wiki-catalogue-index.json').write_text(json.dumps({'checkedOn': snapshot['checkedOn'], 'ownerInfo': ownerInfo, 'patternsWanted': patternsWanted, 'shapes': shapes}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(root / 'research/wiki-translation-pending.json').write_text(json.dumps(list(pending.values()), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'records': len(items), 'wiki': output['counts']['wikiRecords'], 'newRecords': len(items) - len(legacy['upgrades']), 'patternsWanted': len(patternsWanted), 'pendingTranslations': len(pending), 'owners': len(owners)}))
