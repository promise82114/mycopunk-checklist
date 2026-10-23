"""以本地來源快照重建攻略資料；不連網、不改寫工作簿或個人紀錄。"""
import json
import re
from pathlib import Path

repoRoot = Path(__file__).resolve().parents[1]
def read(name):
    return json.loads((repoRoot / 'research' / name).read_text(encoding='utf-8'))
equipment = read('wiki-equipment.json')
snapshot = read('wiki-equipment-snapshot.json')
unlocks = read('wiki-unlocks.json')
shapes = read('wiki-shapes.json')
hiddenSnapshot = read('hidden-paths-current.json')
hiddenPaths = {
    'schemaVersion': 1,
    'source': {
        'author': hiddenSnapshot['author'],
        'gameVersion': hiddenSnapshot['manifestEntry']['version'],
        'buildId': hiddenSnapshot['manifestEntry']['buildId'],
        'dumpedAt': hiddenSnapshot['manifestEntry']['dumpedAt'],
        'checkedOn': hiddenSnapshot['checkedOn'],
        'sha256': hiddenSnapshot['dataSha256'],
        'url': hiddenSnapshot['sourceRevision']['fileUrl'],
        'revision': hiddenSnapshot['sourceRevision']['commit'],
        'coordinateSourceUrl': hiddenSnapshot['coordinateEvidence']['sourceUrl'],
    },
    'paths': hiddenSnapshot['derivedPaths'],
}
rewardLabels = {'Rare skin': '稀有造型', 'Epic skin': '史詩造型', 'upgrade from a curated set': '指定候選池的升級', 'Standard upgrade': '標準升級', 'Rare upgrade': '稀有升級', 'Epic upgrade': '史詩升級', 'Exotic upgrade': '異域升級', 'Oddity upgrade': '奇物升級', '1 Saxonite': '1 個 Saxonite'}
for item in equipment['items']:
    page = next((page for page in snapshot['pages'] if page.get('permalink') == item.get('sourceRevisionUrl')), None)
    rewards = []
    if page and 'Level Unlocks' in page['text']:
        text = page['text'].split('Level Unlocks', 1)[1]
        for line in text.splitlines():
            match = re.fullmatch(r'(\d+)\t(.+)', line.strip())
            if match:
                reward = match[2]
                anonymous = re.fullmatch(r'Upgrade: \d+', reward)
                rewards.append({'level': int(match[1]), 'rewardEn': 'Upgrade (name not stated)' if anonymous else reward, 'rewardZh': '升級配件（來源未提供名稱）' if anonymous else rewardLabels.get(reward, reward)})
    item['levelUnlocks'] = rewards
# 網站只帶繪圖座標與必要來源，不打包完整索引、原始 SVG 或抓取紀錄。
patternFields = ['nameEn', 'upgradeIds', 'cells', 'cellCount', 'sourceUrl', 'gameVersion', 'checkedOn', 'author', 'license', 'licenseUrl', 'coordinateSystem']
sitePatterns = [{key: pattern[key] for key in patternFields if key in pattern} for pattern in shapes['patterns']]
output = {'schemaVersion': 1, 'equipment': equipment, 'unlocks': {'checkedOn': unlocks['checkedOn'], 'mechanics': unlocks['mechanics'], 'upgrades': unlocks['upgrades']}, 'shapes': {'patterns': sitePatterns, 'coverage': shapes['coverage'], 'compatibilityNote': shapes['compatibilityNote']}, 'hiddenPaths': hiddenPaths}
text = json.dumps(output, ensure_ascii=False, indent=2) + '\n'
destination = repoRoot / 'prototype/data/field-guide.json'
if not destination.exists() or destination.read_text(encoding='utf-8') != text:
    destination.write_text(text, encoding='utf-8', newline='\n')
print(json.dumps({'equipment': len(equipment['items']), 'patterns': len(sitePatterns), 'mechanics': len(unlocks['mechanics']), 'levelRewards': sum(len(item['levelUnlocks']) for item in equipment['items'])}))
