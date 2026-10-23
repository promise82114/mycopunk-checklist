"""預設只讀本地 JSON 重建；--fetch-coordinates 才讀取最多445份公開 SVG。
SVG 僅在記憶體解析，無圖檔輸出、並行4、每來源一次無重試。
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research'
CACHE = RESEARCH / 'wiki-shape-coordinates.json'
TARGET = RESEARCH / 'wiki-shapes.json'
CHECKED_ON = '2026-10-23'
DATA = json.loads((ROOT / 'prototype/data/upgrades.json').read_text(encoding='utf-8'))
NS = '{http://www.w3.org/2000/svg}'

def normalizeName(value):
    return re.sub('[^a-z0-9]', '', value.lower())

def parseSvg(raw):
    root = ET.fromstring(raw)
    if root.tag != NS + 'svg':
        raise ValueError('not-svg')
    allowed = {'class', 'viewBox', 'width', 'height', 'style', 'points', 'fill', 'stroke', 'transform'}
    for element in root.iter():
        if element.tag not in {NS + 'svg', NS + 'polygon'} or not set(element.attrib) <= allowed:
            raise ValueError('unsupported-svg-schema')
        if any('url(' in value.lower() or 'javascript:' in value.lower() for value in element.attrib.values()):
            raise ValueError('unsupported-external-reference')
    centers = []
    for polygon in root.findall(NS + 'polygon'):
        if polygon.get('fill') != 'var(--rarity-color)' or polygon.get('transform'):
            continue
        points = [[float(v) for v in pair.split(',')] for pair in polygon.get('points', '').split()]
        if len(points) != 6 or any(len(p) != 2 for p in points):
            continue
        centers.append([sum(p[0] for p in points) / 6, sum(p[1] for p in points) / 6])
    if not centers or len(centers) != len({(round(x, 4), round(y, 4)) for x, y in centers}):
        raise ValueError('missing-or-duplicate-colored-cells')
    cells = []
    for x, y in centers:
        q = (x - 56) / 84
        r = (y - 56) / (56 * math.sqrt(3)) - q / 2
        if abs(q - round(q)) >= 0.001 or abs(r - round(r)) >= 0.001:
            raise ValueError('unsupported-grid-spacing')
        cells.append([round(q), round(r)])
    minQ = min(c[0] for c in cells)
    minR = min(c[1] for c in cells)
    return {'cells': sorted([[q - minQ, r - minR] for q, r in cells]),
        'coordinateSystem': 'axial-flat-top',
        'orientation': {'rotationDegrees': 0, 'reflected': False, 'basis': 'source-svg'},
        'sourceGridOffset': [minQ, minR]}

nameGroups = {}
for item in DATA['upgrades']:
    nameGroups.setdefault(normalizeName(item['nameEn']), []).append(item)
pages = {}
for filename in ['wiki-shapes-api-search-1.json', 'wiki-shapes-api-search-2.json', 'wiki-shapes-api-category.json']:
    pages.update(json.loads((RESEARCH / filename).read_text(encoding='utf-8'))['query']['pages'])
candidates = {}
for page in pages.values():
    name = re.sub(r' Pattern\.svg$', '', page['title'].removeprefix('File:'), flags=re.I)
    key = normalizeName(name)
    if key not in nameGroups or not page.get('imageinfo'):
        continue
    info = page['imageinfo'][0]
    if info['url'].startswith('https://static.wikitide.net/mycopunkwiki/') and info['url'].lower().endswith('.svg'):
        candidates.setdefault(key, []).append({'title': page['title'], **info})
entries = [(key, info) for key, infos in sorted(candidates.items()) for info in sorted(infos, key=lambda i: (i['timestamp'], i['title']), reverse=True)]
if len(entries) > 445:
    raise ValueError('bounded-source-limit-exceeded')

def readCoordinates(entry):
    _, info = entry
    try:
        request = Request(info['url'], headers={'User-Agent': 'MycopunkGuideCoordinateResearch/1.0'})
        with urlopen(request, timeout=25) as response:
            if response.status != 200:
                raise ValueError('unexpected-status')
            raw = response.read(250_001)
        if len(raw) > 250_000:
            raise ValueError('svg-size-limit-exceeded')
        return {'sourceUrl': info['descriptionurl'], 'svgSha256': hashlib.sha256(raw).hexdigest(), **parseSvg(raw)}
    except HTTPError as error:
        return {'sourceUrl': info['descriptionurl'], 'error': 'HTTP ' + str(error.code)}
    except Exception as error:
        return {'sourceUrl': info['descriptionurl'], 'error': str(error) or type(error).__name__}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fetch-coordinates', action='store_true', help='一次讀取公開 SVG，只存純 JSON 座標；並行4、無重試、無SVG輸出')
args = parser.parse_args()
if args.fetch_coordinates:
    coordinates = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for start in range(0, len(entries), 4):
            coordinates.extend(executor.map(readCoordinates, entries[start:start + 4]))
            if start % 40 == 0:
                print(json.dumps({'processed': min(start + 4, len(entries)), 'successful': sum('cells' in i for i in coordinates), 'failed': sum('error' in i for i in coordinates)}), flush=True)
            time.sleep(0.15)
    CACHE.write_text(json.dumps({'schemaVersion': 1, 'checkedOn': CHECKED_ON, 'coordinates': coordinates}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
elif not CACHE.exists():
    old = json.loads(TARGET.read_text(encoding='utf-8'))
    coordinates = [{'sourceUrl': p['sourceUrl'], 'svgSha256': p.get('originalSvgSha256', p['svgSha256']), 'cells': p['cells'], 'coordinateSystem': 'axial-flat-top', 'orientation': {'rotationDegrees': 0, 'reflected': False, 'basis': 'source-svg'}} for p in old['patterns']]
    CACHE.write_text(json.dumps({'schemaVersion': 1, 'checkedOn': CHECKED_ON, 'coordinates': coordinates}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
coordinateIndex = {i['sourceUrl']: i for i in json.loads(CACHE.read_text(encoding='utf-8'))['coordinates']}

def makePattern(key, info, geometry):
    version = re.search(r'\((v[0-9][^)]+)\)', info['comment'])
    upgrades = nameGroups[key]
    return {'nameEn': upgrades[0]['nameEn'], 'upgradeIds': [u['id'] for u in upgrades],
        'fileTitle': info['title'], 'sourceUrl': info['descriptionurl'], 'imageUrl': info['url'], 'uploadedOn': info['timestamp'],
        'sourceComment': info['comment'], 'checkedOn': CHECKED_ON, 'author': 'Mycopunk Wiki contributors',
        'license': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'modified': True, 'modification': '由來源 SVG 的彩色六角格中心抽取整數 axial 座標，僅做平移正規化；不保存、不使用 SVG 圖檔。',
        'gameVersion': version.group(1) if version else None, 'versionEvidence': 'upload-comment' if version else 'not-stated',
        'workbookCompatibility': 'unverified', **{k: v for k, v in geometry.items() if k != 'sourceUrl'},
        'cellCount': len(geometry['cells']), 'workbookSizes': sorted({u['size'] for u in upgrades}),
        'cellCountMatchesWorkbook': all(u['size'] == len(geometry['cells']) for u in upgrades)}

patterns, alternatePatterns, failures = [], [], []
for key, infos in sorted(candidates.items()):
    for index, info in enumerate(sorted(infos, key=lambda i: (i['timestamp'], i['title']), reverse=True)):
        geometry = coordinateIndex.get(info['descriptionurl'])
        if geometry and 'cells' in geometry:
            (patterns if index == 0 else alternatePatterns).append(makePattern(key, info, geometry))
        elif geometry and 'error' in geometry:
            failures.append({'nameEn': nameGroups[key][0]['nameEn'], 'sourceUrl': info['descriptionurl'], 'error': geometry['error'], 'preferredSource': index == 0})
covered = {id for p in patterns for id in p['upgradeIds']}
output = {'schemaVersion': 2, 'verifiedOn': CHECKED_ON,
    'source': {'name': 'Mycopunk Wiki contributors', 'url': 'https://mycopunk.miraheze.org/wiki/Main_Page', 'license': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/', 'indexUrl': 'https://mycopunk.miraheze.org/wiki/Special:AllPages?namespace=6', 'apiSnapshotFiles': ['wiki-shapes-api-search-1.json', 'wiki-shapes-api-search-2.json', 'wiki-shapes-api-category.json']},
    'apiRequests': [
        'https://mycopunk.miraheze.org/w/api.php?action=query&generator=search&gsrsearch=Pattern&gsrnamespace=6&gsrwhat=title&gsrlimit=500&prop=imageinfo&iiprop=url%7Ccomment%7Ctimestamp&format=json',
        'https://mycopunk.miraheze.org/w/api.php?action=query&generator=search&gsrsearch=Pattern&gsrnamespace=6&gsrwhat=title&gsrlimit=500&gsroffset=500&prop=imageinfo&iiprop=url%7Ccomment%7Ctimestamp&format=json',
        'https://mycopunk.miraheze.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:Upgrade_Patterns&gcmtype=file&gcmlimit=500&prop=imageinfo&iiprop=url%7Ccomment%7Ctimestamp&format=json'],
    'datasetVersion': DATA['datasetVersion'],
    'method': 'Exact names after removing ASCII punctuation/case; latest uploaded timestamp is preferred, parsed older candidates retained separately. Colored six-vertex SVG polygons without transforms supply cells. Grey background and connecting rectangles ignored. No shape inferred from workbook size. SVG text is analyzed in memory only, never saved or used as artwork.',
    'coordinateSystem': 'axial-flat-top',
    'hexGeometry': {'cellEncoding': '[q,r] integer axial coordinates', 'layout': 'flat-top', 'normalization': 'subtract minimum q and minimum r independently; no rotation or reflection',
        'centerFormula': 'x = 1.5 * radius * q; y = sqrt(3) * radius * (r + q / 2)',
        'vertexFormula': 'for k=0..5: [x + radius*cos(k*pi/3), y + radius*sin(k*pi/3)]',
        'neighborOffsets': [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],
        'clockwiseRotation60': '[q,r] -> [-r,q+r] with screen y increasing downward',
        'sourceRadius': 56, 'sourceOrigin': [56, 56], 'sourceHorizontalSpacing': 84, 'sourceVerticalSpacing': 56 * math.sqrt(3),
        'sourceCenterFormula': 'originalQ=q+sourceGridOffset[0]; originalR=r+sourceGridOffset[1]; x=56+84*originalQ; y=56+56*sqrt(3)*(originalR+originalQ/2)'},
    'compatibilityNote': '圖形版本取自 Wiki 上傳註解；Excel 的 v1.6 是工作簿版本，未註明遊戲版本。跨修訂未於遊戲驗證，格數相同不代表形狀相容。',
    'coverage': {'indexedFileCount': len(pages), 'matchedUniqueNames': len(candidates), 'candidateFileCount': len(entries), 'successfulPatterns': len(patterns), 'alternatePatterns': len(alternatePatterns), 'coveredUpgradeRecords': len(covered), 'totalUpgradeRecords': len(DATA['upgrades']), 'failedReads': len(failures), 'sizeMismatchPatterns': sum(not p['cellCountMatchesWorkbook'] for p in patterns)},
    'readScope': '使用者明確允許讀取分析、禁止保存或使用圖檔。一次讀取既有索引最多445個公開SVG，並行不超過4，每份只嘗試一次；僅保留座標、雜湊與來源證據。預設重建不連外。',
    'patterns': patterns, 'alternatePatterns': alternatePatterns, 'failures': failures,
    'candidates': [{'nameEn': nameGroups[key][0]['nameEn'], 'upgradeIds': [u['id'] for u in nameGroups[key]], 'fileTitle': i['title'], 'sourceUrl': i['descriptionurl'], 'imageUrl': i['url'], 'uploadedOn': i['timestamp'], 'sourceComment': i['comment'], 'gameVersion': v.group(1) if (v := re.search(r'\((v[0-9][^)]+)\)', i['comment'])) else None, 'checkedOn': CHECKED_ON} for key, i in entries],
    'unmatchedUpgradeIds': [u['id'] for u in DATA['upgrades'] if u['id'] not in covered]}
TARGET.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(output['coverage']), flush=True)
