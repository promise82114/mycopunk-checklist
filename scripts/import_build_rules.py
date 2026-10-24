"""離線建立配裝面板與旋轉規則；不改寫圖鑑、格形或個人紀錄。"""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
evidence = json.loads((root / 'research/build-board-evidence.json').read_text(encoding='utf-8'))
catalogue = json.loads((root / 'prototype/data/catalogue.json').read_text(encoding='utf-8'))
wikiIndex = json.loads((root / 'research/wiki-catalogue-index.json').read_text(encoding='utf-8'))
ownerApis = {'jackrabbit': 'bounceshotgun', 'swarm-launcher': 'swarmgun', 'lead-flinger': 'leadflinger', 'plate-launcher': 'platelauncher', 'gunship-cannon': 'gunshipcannon', 'diffraction-driver': 'scattergun'}
guide = json.loads((root / 'prototype/data/field-guide.json').read_text(encoding='utf-8'))
owners = [{'id': item['ownerId'], 'category': item['category']} for item in guide['equipment']['items']]
ownerApis.update({id: item['apiName'] for id, item in wikiIndex['ownerInfo'].items() if item['apiName']})
boardProfiles = {owner['id']: {'levelSource': 'player' if owner['category'] == 'characters' else 'fixed' if owner['category'] == 'heavy' else 'gear', 'stages': evidence['gridProfiles']['HeavyGridProfile' if owner['category'] == 'heavy' else 'DefaultGridProfile']['GridSizes']} for owner in owners}
rotationUnlocks = {}
for milestone in evidence['levelMilestones']:
    for item in milestone['Items']:
        match = re.fullmatch(r'Rotate (\w+) upgrades', item['Label'])
        if match:
            rotationUnlocks[match[1]] = milestone['Level']
modifiers = ['Edge Fault', 'Boundary Incursion', 'Multiversal Thievery', 'Handheld Pocket Universe']
expansion = json.loads((root / 'research/build-expansion-evidence.json').read_text(encoding='utf-8'))
expanders = {item['Name'] for item in expansion['upgrades'] if item['propertyType'] == 'UpgradeProperty_GrowGrid'}
rules = {}
for upgrade in catalogue['upgrades']:
    source = evidence['upgradeRules'].get(upgrade['nameEn'], {})
    applicable = {api.lower() for api in source.get('applicableTo', [])}
    genericOwners = [owner['id'] for owner in owners if ownerApis.get(owner['id'], owner['id']).lower() in applicable or (owner['category'] == 'characters' and 'player' in applicable)] if upgrade['ownerId'] == 'general' else []
    flags = {flag.strip() for flag in upgrade.get('flags', '').split(',')}
    stacking = 'unknown' if 'flags' not in upgrade else 'always' if 'CanStack' in flags else 'mission' if 'CanStackInMission' in flags else 'single'
    rules[upgrade['id']] = {'geometryModifier': upgrade['nameEn'] in modifiers, 'ouroborosOnly': 'OnlyInOuroboros' in source.get('flags', ''), 'genericOwners': genericOwners, 'stacking': stacking}
    if upgrade['nameEn'] in expanders:
        rules[upgrade['id']]['boardExpansion'] = {'axes': ['column', 'row'], 'amount': 1}
output = {'schemaVersion': 1, 'source': {'url': evidence['source']['fileUrl'], 'gameVersion': evidence['gameVersion']['Version'], 'buildId': evidence['gameVersion']['BuildID'], 'sha256': evidence['sha256'], 'checkedOn': evidence['checkedOn']}, 'boardProfile': evidence['gridProfiles']['DefaultGridProfile']['GridSizes'], 'boardProfiles': boardProfiles, 'rotationUnlocks': rotationUnlocks, 'rules': rules, 'notesZh': '角色面板隨玩家等級，武器及手榴彈隨裝備等級；重武器固定使用 HeavyGridProfile 5×5。旋轉門檻為玩家等級。Oddity／Contraband 無已知旋轉門檻，保留來源方向。擴格、跨面板徵用與整體改形效果尚未模擬。'}
target = root / 'prototype/data/build-rules.json'
output['stackingSource'] = catalogue['primarySource'] | {'interpretationZh': '依各配件 Wiki 修訂的 CanStack／CanStackInMission 技術旗標區分情境，適用模式與效果疊加數值未實機核對。'}
output['expansionSource'] = {'url': expansion['sourceUrl'], 'gameVersion': expansion['gameVersion']['Version'], 'checkedOn': expansion['checkedAt'], 'interpretationZh': expansion['interpretationZh']}
output['notesZh'] = output['notesZh'].replace('擴格、跨面板徵用與整體改形效果尚未模擬。', 'Edge Fault／Boundary Incursion 依逐份指定的 Column／Row 擴格；跨面板徵用與整體改形效果尚未模擬。')
target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'upgradeRules': len(rules), 'boardStages': len(output['boardProfile']), 'rotationUnlocks': rotationUnlocks}))
