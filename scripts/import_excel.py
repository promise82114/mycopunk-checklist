"""唯讀解析來源 Excel，產生網站資料；只使用 Python 標準函式庫。"""
import argparse
import collections
import hashlib
import json
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

repoRoot = Path(__file__).resolve().parents[1]
siteRoot = repoRoot / 'prototype'
sourcePath = repoRoot / 'Mycopunk Upgrades v1.6.xlsx'
namespaces = {
    's': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}
ownerSpecs = [
    ('Cycler', 'cycler', 'The Cycler', '循環者', 'weapons'),
    ('Jackrabbit', 'jackrabbit', 'Au-Si Jackrabbit', '野兔', 'weapons'),
    ('Swarm L.', 'swarm-launcher', 'Swarm Launcher', '蜂群發射器', 'weapons'),
    ('DMLR', 'dmlr', 'DMLR', 'DMLR', 'weapons'),
    ('Lead F.', 'lead-flinger', 'Lead Flinger', '鉛彈投射器', 'weapons'),
    ('Plate L.', 'plate-launcher', 'FR.15833 Plate Launcher', '飛盤發射器', 'weapons'),
    ('Gunship C.', 'gunship-cannon', 'Gunship Cannon', '砲艇機砲', 'weapons'),
    ('Trident', 'trident', 'Trident S2', '三叉戟 S2', 'weapons'),
    ('Globbler', 'globbler', 'Globbler', '酸液投射器', 'weapons'),
    ('Carver', 'carver', 'The Carver', '切割者', 'weapons'),
    ('Shocklance', 'shocklance', 'Shocklance', '電擊長槍', 'weapons'),
    ('Accelerator', 'accelerator', 'Accelerator', '加速器', 'weapons'),
    ('Wrangler', 'wrangler', 'Wrangler', '牧人', 'characters'),
    ('Bruiser', 'bruiser', 'Bruiser', '重拳', 'characters'),
    ('Scrapper', 'scrapper', 'Scrapper', '拾荒者', 'characters'),
    ('Glider', 'glider', 'Glider', '滑翔者', 'characters'),
    ('Incendiary G.', 'incendiary-grenade', 'Incendiary Grenade', '燃燒手榴彈', 'grenades'),
    ('Shock G.', 'shock-grenade', 'Shock Grenade', '電擊手榴彈', 'grenades'),
    ('Acid G.', 'acid-grenade', 'Acid Grenade', '酸液手榴彈', 'grenades'),
    ('Generic', 'general', 'General upgrades', '通用升級', 'general'),
]
tagRules = [
    ('damage', r'damage|powerful|high.power'),
    ('ammo', r'ammo|magazine|cartridge|mag size|pellet'),
    ('reload', r'reload'),
    ('fire', r'ignit|immolat|combust|burn|flamethrower|\bfire damage\b|appl(?:y|ies|ied) (?:more )?fire|with fire|amount of fire'),
    ('shock', r'shock|electr|lightning|voltaic'),
    ('acid', r'acid|corro'),
    ('decay', r'decay'),
    ('explosion', r'explo|detonat|blast'),
    ('mobility', r'sprint|slid|\bmov(?:e|ing|ement)|airborne|mid.air|jump|wingsuit|jetpack|grappl|dash|leap|wallrun|speed boost'),
    ('survival', r'health|heal|resistance|shield|armor|armour|invulner|invinc|take reduced damage|damage reduction'),
    ('team', r'all(y|ies)|other (player|employee)|nearby players|team'),
    ('grid', r'grid|pattern|touch|border|adjacen|prism|cell|rarit'),
    ('projectile', r'ricochet|pierc|bounce|track|spread|recoil'),
    ('ability', r'recharge|cooldown|ability|abilities'),
]

def readJson(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default

def writeJson(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8') != content:
        path.write_text(content, encoding='utf-8', newline='\n')

def relationshipPath(part):
    folder, filename = posixpath.split(part)
    return folder + '/_rels/' + filename + '.rels'

def getRelationships(archive, part):
    path = relationshipPath(part)
    if path not in archive.namelist():
        return {}
    return {r.attrib['Id']: r.attrib for r in ET.fromstring(archive.read(path))}

def resolvePart(part, target):
    return target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part), target))

def readSheets(archive):
    strings = [''.join(x.itertext()) for x in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', namespaces)]
    rels = getRelationships(archive, 'xl/workbook.xml')
    sheets = {}
    for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet', namespaces):
        part = resolvePart('xl/workbook.xml', rels[sheet.attrib['{' + namespaces['r'] + '}id']]['Target'])
        root = ET.fromstring(archive.read(part))
        rows = []
        for row in root.findall('s:sheetData/s:row', namespaces):
            values = {}
            for cell in row.findall('s:c', namespaces):
                value = cell.find('s:v', namespaces)
                text = value.text if value is not None else ''
                if cell.attrib.get('t') == 's':
                    text = strings[int(text)] if text else ''
                elif cell.attrib.get('t') == 'inlineStr':
                    text = ''.join(cell.find('s:is', namespaces).itertext())
                if text:
                    values[re.sub(r'\d', '', cell.attrib['r'])] = text
            if values:
                rows.append({'row': int(row.attrib['r']), 'values': values})
        sheets[sheet.attrib['name']] = {'part': part, 'root': root, 'rows': rows}
    return sheets

def readIcons(archive, sheet):
    drawing = sheet['root'].find('s:drawing', namespaces)
    if drawing is None:
        return {}
    rels = getRelationships(archive, sheet['part'])
    drawingPart = resolvePart(sheet['part'], rels[drawing.attrib['{' + namespaces['r'] + '}id']]['Target'])
    imageRels = getRelationships(archive, drawingPart)
    rowNames = {r['row']: r['values'].get('A') for r in sheet['rows']}
    icons = {}
    for anchor in ET.fromstring(archive.read(drawingPart)):
        row = anchor.find('xdr:from/xdr:row', namespaces)
        blip = anchor.find('.//a:blip', namespaces)
        if row is None or blip is None:
            continue
        name = rowNames.get(int(row.text) + 1)
        relId = blip.attrib.get('{' + namespaces['r'] + '}embed')
        if not name or relId not in imageRels:
            continue
        imagePart = resolvePart(drawingPart, imageRels[relId]['Target'])
        payload = archive.read(imagePart)
        extension = Path(imagePart).suffix.lower()
        if extension not in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
            continue
        filename = hashlib.sha256(payload).hexdigest()[:20] + extension
        dest = siteRoot / 'assets' / 'icons' / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            dest.write_bytes(payload)
        icons.setdefault(name, 'assets/icons/' + filename)
    return icons

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=sourcePath)
    parser.add_argument('--strict', action='store_true', help='缺少譯文時失敗')
    args = parser.parse_args()
    phrasePath = repoRoot / 'localization' / 'phrases.json'
    phrases = readJson(phrasePath, [])
    phraseLookup = {(p['kind'], p['en']): p['id'] for p in phrases}
    translations = {}
    for translationPath in sorted((repoRoot / 'localization').glob('zh-Hant-*.json')):
        batch = readJson(translationPath, {})
        overlap = translations.keys() & batch.keys()
        if overlap:
            raise ValueError('翻譯鍵重複：' + ', '.join(sorted(overlap)))
        translations.update(batch)

    def phrase(kind, text):
        if not text:
            return ''
        lookupKey = (kind, text)
        if lookupKey not in phraseLookup:
            phraseId = kind + str(1 + sum(p['kind'] == kind for p in phrases)).zfill(3)
            phraseLookup[lookupKey] = phraseId
            phrases.append({'id': phraseId, 'kind': kind, 'en': text})
        return translations.get(phraseLookup[lookupKey], '')

    owners = []
    upgrades = []
    with zipfile.ZipFile(args.source) as archive:
        sheets = readSheets(archive)
        icons = readIcons(archive, sheets['Up Icon'])
        wikiLinks = {r['values'].get('A'): r['values'].get('B', '') for r in sheets['Up Wiki']['rows']}
        for sheetName, ownerId, nameEn, nameZh, category in ownerSpecs:
            owner = {'id': ownerId, 'nameEn': nameEn, 'nameZh': nameZh, 'category': category, 'sourceSheet': sheetName}
            owners.append(owner)
            for row in sheets[sheetName]['rows']:
                values = row['values']
                if row['row'] == 1 or not values.get('B'):
                    continue
                name = values['B']
                # 名稱與歸屬決定 ID，不受排序、翻譯或原始列號改動影響。
                slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
                upgradeId = ownerId + ':' + slug
                description = values.get('C', '')
                turbocharge = values.get('D', '')
                stats = []
                for label, display, minimum, maximum in [('E','F','G','H'),('I','J','K','L'),('M','N','O','P'),('Q','R','S','T'),('U','V','W','X'),('Y','Z','AA','AB'),('AC','AD','AE','AF'),('AG','AH','AI','AJ'),('AK','AL','AM','AN')]:
                    if values.get(label):
                        stats.append({'nameEn': values[label], 'nameZh': phrase('s', values[label]), 'display': values.get(display,''), 'minRaw': values.get(minimum,''), 'maxRaw': values.get(maximum,'')})
                upgrades.append({
                    'id': upgradeId, 'ownerId': ownerId, 'category': category,
                    'nameEn': name, 'nameZh': phrase('n', name),
                    'descriptionEn': description, 'descriptionZh': phrase('d', description),
                    'turbochargeEn': turbocharge, 'turbochargeZh': phrase('t', turbocharge),
                    'rarity': values.get('AP','').split('\n')[0],
                    'size': int(float(values['AO'])) if values.get('AO') else None,
                    'tags': [tag for tag, rule in tagRules if re.search(rule, description, re.I)],
                    'stats': stats, 'icon': icons.get(name, ''), 'wikiUrl': wikiLinks.get(name, ''),
                    'source': {'sheet': sheetName, 'row': row['row'], 'range': 'B' + str(row['row']) + ':AP' + str(row['row'])},
                })
    ids = [u['id'] for u in upgrades]
    if len(ids) != len(set(ids)):
        raise ValueError('配件 ID 重複，停止匯入，請核對來源')
    missing = collections.Counter()
    for upgrade in upgrades:
        for en, zh in [('descriptionEn','descriptionZh'), ('turbochargeEn','turbochargeZh'), ('nameEn','nameZh')]:
            if upgrade[en] and not upgrade[zh]:
                missing[zh] += 1
    writeJson(phrasePath, phrases)
    if args.strict and missing:
        raise ValueError('缺少譯文：' + str(dict(missing)))
    data = {
        'schemaVersion': 1, 'datasetVersion': 'workbook-1.6',
        'source': {'filename': args.source.name, 'sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(), 'importedOn': '2026-10-23', 'gameVersion': None},
        'coverageNote': '本資料庫依來源表格收錄範圍計算，尚未完成正式版與獎盃需求核對。',
        'translationNote': '繁中為輔助暫譯，尚未經遊戲內用詞核對；效果與數值以英文來源為準。',
        'owners': owners, 'upgrades': upgrades,
        'counts': {'records': len(upgrades), 'distinctNames': len(set(u['nameEn'] for u in upgrades)), 'icons': sum(bool(u['icon']) for u in upgrades), 'missingTranslations': dict(missing)},
    }
    writeJson(siteRoot / 'data' / 'upgrades.json', data)
    print(json.dumps(data['counts'], ensure_ascii=False))

if __name__ == '__main__':
    main()
