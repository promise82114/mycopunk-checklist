"""將已核對的 TierMaker 快照與編輯搭配說明轉為網站資料；不連外。"""
import json
import re
from pathlib import Path

repoRoot = Path(__file__).resolve().parents[1]
ownerTitles = {
    'Gunship': 'gunship-cannon', 'Accelerator': 'accelerator', 'Shocklance': 'shocklance',
    'Carver': 'carver', 'Globbler': 'globbler', 'Trident': 'trident', 'Plate': 'plate-launcher',
    'Lead Flinger': 'lead-flinger', 'DMLR': 'dmlr', 'Swarm': 'swarm-launcher',
    'Cycler': 'cycler', 'Jackrabbit': 'jackrabbit',
}
weaponFiles = {
    'plate.png': 'plate-launcher', 'shocklance.png': 'shocklance', 'globbler.png': 'globbler',
    'gsc.png': 'gunship-cannon', 'jabbit.png': 'jackrabbit', 'cycler.png': 'cycler',
    'lf.png': 'lead-flinger', 'swarm-launcher.png': 'swarm-launcher', 'trident.png': 'trident',
    'chainsaw.png': 'carver', 'dmlr.png': 'dmlr',
    'shocklance-icon.png': 'shocklance', 'plate-launcher-icon.png': 'plate-launcher',
    'minicannonicon.png': 'gunship-cannon', 'globblericon.png': 'globbler',
    'accelerator-icon.png': 'accelerator', 'bounce-shotgun-icon.png': 'jackrabbit',
    'smg-icon.png': 'cycler', 'swarm-gun-icon.png': 'swarm-launcher',
    'leadflinger-icon.png': 'lead-flinger', 'tridenticon.png': 'trident',
    'carver-icon.png': 'carver', 'dmlr-icon.png': 'dmlr',
}
unlistedFiles = {'heavylasericon.png', 'heavynukeicon.png', 'heavyshotgunicon.png', 'heavysnipericon.png'}

def normalize(value):
    return re.sub('[^a-z0-9]', '', value.lower())

def main():
    snapshot = json.loads((repoRoot / 'research/tiermaker-snapshot.json').read_text(encoding='utf-8'))
    catalogue = json.loads((repoRoot / 'prototype/data/upgrades.json').read_text(encoding='utf-8'))
    guides = json.loads((repoRoot / 'research/editorial-guides.json').read_text(encoding='utf-8'))
    sources = []
    weaponRatings = []
    upgradeRatings = []
    for source in snapshot['sources']:
        ownerId = ownerTitles.get(source['title'])
        isCarson = '/5588347' in source['url']
        sourceId = 'no-you-' + ownerId if ownerId else 'carson-weapons-1-4-6' if isCarson else 'no-you-weapons'
        metadata = {
            'id': sourceId, 'title': source['title'], 'url': source['url'],
            'author': 'Carson Kong' if isCarson else 'No You',
            'authorUrl': 'https://tiermaker.com/user/18711617' if isCarson else snapshot['profileUrl'],
            'kind': 'upgrades' if ownerId else 'weapons', 'ownerId': ownerId,
            'gameVersion': '1.4.6' if isCarson else None,
            'versionEvidence': 'list-title' if isCarson else 'not-stated',
            'verifiedOn': snapshot['verifiedOn'], 'rationaleProvided': False,
            'excludedItems': [],
        }
        lookup = {normalize(upgrade['nameEn']): upgrade for upgrade in catalogue['upgrades'] if upgrade['ownerId'] == ownerId}
        for row in source['rows']:
            for item in row['items']:
                filename = item['asset'].rsplit('/', 1)[-1]
                evidence = {'sourceId': sourceId, 'tier': row['tier'], 'sourceItemId': item['id'], 'assetFilename': filename}
                if ownerId:
                    key = normalize(re.sub(r'(png)?\.png$', '', filename))
                    if key not in lookup:
                        raise ValueError('配件檔名未對應，請核對：' + sourceId + '/' + filename)
                    upgradeRatings.append({**evidence, 'upgradeId': lookup[key]['id'], 'ownerId': ownerId})
                elif filename in weaponFiles:
                    weaponRatings.append({**evidence, 'ownerId': weaponFiles[filename]})
                elif filename in unlistedFiles:
                    metadata['excludedItems'].append({**evidence, 'reason': 'outside-current-catalogue'})
                else:
                    raise ValueError('武器圖示未對應，請核對：' + filename)
        sources.append(metadata)
    sourceByOwner = {source['ownerId']: source['id'] for source in sources if source['kind'] == 'upgrades'}
    for guide in guides:
        guide['sourceId'] = sourceByOwner[guide['ownerId']]
        guide['basis'] = 'editorial-from-workbook-effects'
        guide['effectsDatasetVersion'] = catalogue['datasetVersion']
        guide['testedInGame'] = False
    output = {
        'schemaVersion': 1, 'verifiedOn': snapshot['verifiedOn'],
        'sources': sources, 'weaponRatings': weaponRatings, 'upgradeRatings': upgradeRatings,
        'guides': guides,
        'counts': {'sources': len(sources), 'weaponRatings': len(weaponRatings), 'upgradeRatings': len(upgradeRatings), 'guides': len(guides)},
    }
    destination = repoRoot / 'prototype/data/recommendations.json'
    content = json.dumps(output, ensure_ascii=False, indent=2) + '\n'
    if not destination.exists() or destination.read_text(encoding='utf-8') != content:
        destination.write_text(content, encoding='utf-8', newline='\n')
    print(json.dumps(output['counts'], ensure_ascii=False))

if __name__ == '__main__':
    main()
