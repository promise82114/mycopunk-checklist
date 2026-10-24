"""本地 Wiki 快照的純解析工具；不連網。"""
import html
import re
from urllib.parse import quote

def clean(text):
    text = re.sub(r'\[\[(?:[^\]|]+\|)?([^\]]+)\]\]', r'\1', text or '')
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r"'{2,}", '', text)
    return html.unescape(text).strip()

def key(text):
    return re.sub('[^a-z0-9]', '', clean(text).lower())

def descriptionKey(text):
    # Keep signs, ranges and punctuation: a changed effect must not inherit an old translation.
    return re.sub(r'\s+', ' ', clean(text)).strip().casefold().replace('’', "'")

def slug(text):
    return re.sub('[^a-z0-9]+', '-', clean(text).lower()).strip('-')

def fields(page):
    text = page.get('sections', {}).get('infobox', '') or page.get('text', '')
    return {name.lower(): clean(value) for name, value in re.findall(r'^\|\s*(\w+)\s*=([^\n]*)', text, re.M)}

def members(page):
    output = []
    for section in ['upgrades', 'drop_only_upgrades']:
        for line in page.get('sections', {}).get(section, '').splitlines():
            match = re.match(r'^\|\s*\[\[([^\]|]+)\|([^\]]+)\]\]\s*\|\|(.*?)\|\|\s*(.*)$', line)
            if match:
                rarity = re.search(r'\b(Standard|Rare|Epic|Exotic|Oddity|Contraband)\b', clean(match[3]))
                if rarity:
                    output.append({'title': match[1], 'nameEn': clean(match[2]), 'rarity': rarity[1], 'descriptionEn': clean(match[4]), 'section': section})
    return output

def revisionUrl(page):
    return 'https://mycopunk.miraheze.org/wiki/' + quote(page['title'].replace(' ', '_'), safe=':()/') + '?oldid=' + str(page['revision'])

def findPage(snapshot, title):
    return snapshot['upgradePages'].get(title + '/source') or snapshot['upgradePages'].get(title)

def acquisitionZh(text):
    if text == 'Source: Found in the world drop pool.':
        return '來自世界掉落池。'
    if text == 'Source: Awarded as a special drop.':
        return '特殊掉落獎勵；此來源未列更詳細條件。'
    match = re.fullmatch(r'Source: Innate ability of (.+), available from the start\.', text)
    if match:
        return match[1] + ' 的初始固有能力。'
    match = re.fullmatch(r'Source: Awarded by redeeming the 2FA Code: (.+) item\.', text)
    if match:
        return '兌換「2FA Code: ' + match[1] + '」道具取得。'
    match = re.fullmatch(r'Source: Unlocked from the (.+) skill tree at Tier (\d+) \((starter ability|requires (\d+) skill points spent)\)\.( Requires unlocking With Me first\.)?', text)
    if match:
        condition = '初始能力' if match[3] == 'starter ability' else '需先花費 ' + match[4] + ' 點技能點'
        return match[1] + ' 技能樹第 ' + match[2] + ' 階（' + condition + '）。' + ('需先解鎖 With Me。' if match[5] else '')
    raise ValueError('Untranslated acquisition: ' + text)

def stats(page, labels):
    labels = labels | {key(en): zh for en, zh in {
        'Delay': '延遲', 'Adds': '增加', 'Element Amount': '元素施加量', 'Normal Bullet Damage': '一般子彈傷害',
        'Heavy weapons deal more damage': '重武器傷害提高', 'Min Radius': '最小半徑', 'Max Radius': '最大半徑',
        'Blue': '藍色', 'Purple': '紫色', 'Yellow': '黃色', 'Charged Range': '蓄力射程', 'Ammo': '彈藥',
        'Efficacy Per Throw': '每次投擲效能', 'Count': '數量', 'Second Explosion Size': '第二次爆炸範圍',
        'First Explosion Damage': '第一次爆炸傷害', 'Second Explosion Damage': '第二次爆炸傷害',
        'Your secondary ability recharges faster when near your last explosion': '靠近上次爆炸位置時，次要技能充能加快',
        'Flamethrower damage is increased while you are ignited': '自己被點燃時，火焰噴射器傷害提高',
        'Size Per Stack': '每層範圍', 'Time Per Bullet': '每發所需時間', 'Phantom Limb': '幻肢', 'Min Speed': '最低速度',
        'Height': '高度', 'Infection': '感染', 'Attunement': '調諧', 'Unattuned Damage': '非調諧元素傷害',
        'Blade Damage': '刀刃傷害', 'Battery Cost': '電量消耗', 'Lightning Damage': '閃電傷害', 'Extra Pellet Damage': '額外彈丸傷害'
    }.items()}
    result = []
    for line in page.get('sections', {}).get('properties', '').splitlines():
        if line.startswith('| ') and ' || ' in line:
            name, value = line[2:].split(' || ', 1)
            name, value = clean(name), clean(value)
            if name and value and not name.startswith('class='):
                result.append({'nameEn': name, 'nameZh': labels.get(key(name), name), 'display': value, 'minRaw': '', 'maxRaw': ''})
    return result
