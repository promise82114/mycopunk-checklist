"""依 Wiki 升級頁實際引用的檔名讀取格形；沿用已解析座標，僅新來源連外一次。"""
import concurrent.futures
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from hex_svg import parseSvg

root = Path(__file__).resolve().parents[1]
index = json.loads((root / 'research/wiki-catalogue-index.json').read_text(encoding='utf-8'))
cache = {item['sourceUrl']: item for item in json.loads((root / 'research/wiki-shape-coordinates.json').read_text(encoding='utf-8'))['coordinates']}
files = list(index['patternsWanted'])
if len(files) > 1000:
    raise ValueError('file-index-scope-exceeded')
checkpoint = root / "research/wiki-catalogue-shape-progress.json"
completed = root / 'research/wiki-catalogue-coordinates.json'
prior = json.loads(completed.read_text(encoding='utf-8')) if completed.exists() else {'patterns': []}
priorPages, priorErrors = {}, {}
for pattern in prior['patterns']:
    info = pattern['fileMetadata']
    priorPages[pattern['fileTitle'].removeprefix('File:').replace(' ', '_')] = {'title': 'File:' + pattern['fileTitle'].removeprefix('File:').replace('_', ' '), 'imageinfo': [info]}
    cache[info['descriptionurl']] = pattern
for page in prior.get('emptySources', []):
    priorPages[page['title'].removeprefix('File:').replace(' ', '_')] = page
    priorErrors[page['imageinfo'][0]['descriptionurl']] = {'empty': True, 'error': 'empty-source-pattern'}
priorUrls = {pattern['sourceUrl'] for pattern in prior['patterns']} | set(priorErrors)
progress = json.loads(checkpoint.read_text(encoding="utf-8")) if checkpoint.exists() else {"pages": {}, "coordinates": {}, "errors": {}}
pages = priorPages | progress['pages']
progress['pages'] = pages
progress['errors'] = priorErrors | progress['errors']
cache.update(progress["coordinates"])
def save():
    checkpoint.write_text(json.dumps(progress, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
missingFiles = [file for file in files if file.removeprefix('File:').replace(' ', '_') not in pages]
for start in range(0, len(missingFiles), 50):
    query = {'action': 'query', 'titles': '|'.join('File:' + name.removeprefix('File:').replace('_', ' ') for name in missingFiles[start:start + 50]), 'prop': 'imageinfo', 'iiprop': 'url|comment|timestamp', 'iilimit': 1, 'format': 'json'}
    with urlopen(Request('https://mycopunk.miraheze.org/w/api.php?' + urlencode(query), headers={'User-Agent': 'MycopunkWikiCoordinates/1.0'}), timeout=30) as response:
        data = json.load(response)
    if 'error' in data:
        raise ValueError(data['error'])
    for page in data['query']['pages'].values():
        if page.get('imageinfo'):
            pages[page['title'].removeprefix('File:').replace(' ', '_')] = page
    print(json.dumps({'indexed': min(start + 50, len(files))}), flush=True)
    time.sleep(0.1)
save()
pending = [page for page in pages.values() if page['imageinfo'][0]['descriptionurl'] not in cache and page['imageinfo'][0]['descriptionurl'] not in progress['errors']]
if len(pending) > 240:
    raise ValueError('new-svg-scope-exceeded')
def fetch(page):
    info = page['imageinfo'][0]
    if not info['url'].startswith('https://static.wikitide.net/mycopunkwiki/') or not info['url'].lower().endswith('.svg'):
        raise ValueError('unexpected-media-source')
    with urlopen(Request(info['url'], headers={'User-Agent': 'MycopunkWikiCoordinates/1.0'}), timeout=25) as response:
        raw = response.read(250001)
    if len(raw) > 250000:
        raise ValueError('svg-too-large')
    try:
        cells = parseSvg(raw)
    except ValueError as error:
        return info['descriptionurl'], {'error': str(error), 'empty': str(error) == 'empty-source-pattern', 'svgSha256': hashlib.sha256(raw).hexdigest(), 'checkedOn': '2026-10-24'}
    return info['descriptionurl'], {'cells': cells, 'svgSha256': hashlib.sha256(raw).hexdigest(), 'checkedOn': '2026-10-24'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    for start in range(0, len(pending), 4):
        for url, geometry in executor.map(fetch, pending[start:start + 4]):
            if 'error' in geometry:
                progress['errors'][url] = geometry
                print(json.dumps({'parseError': geometry['error'], 'source': url}), flush=True)
            else:
                progress['coordinates'][url] = geometry
                cache[url] = geometry
        save()
        if start % 40 == 0:
            print(json.dumps({'newSourcesRead': min(start + 4, len(pending)), 'newSourcesTotal': len(pending)}), flush=True)
        time.sleep(0.15)
patterns = []
for file in files:
    page = pages.get(file.removeprefix('File:').replace(' ', '_'))
    if not page:
        continue
    info = page['imageinfo'][0]
    geometry = cache.get(info['descriptionurl'], {})
    if not geometry.get('cells'):
        continue
    version = re.search(r'\((v[0-9][^)]+)\)', info['comment'])
    patterns.append({'fileTitle': file, 'cells': geometry['cells'], 'cellCount': len(geometry['cells']), 'coordinateSystem': 'axial-flat-top', 'sourceUrl': info['descriptionurl'], 'gameVersion': version[1] if version else None, 'checkedOn': geometry.get('checkedOn', '2026-10-23'), 'author': 'Mycopunk Wiki contributors', 'license': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/', 'svgSha256': geometry['svgSha256'], 'fileMetadata': info})
(root / 'research/wiki-catalogue-coordinates.json').write_text(json.dumps({'checkedOn': '2026-10-24', 'newSourcesRead': prior.get('newSourcesRead', 0) + len((set(progress['coordinates']) | set(progress['errors'])) - priorUrls), 'patterns': patterns, 'emptyFiles': [page['title'].removeprefix('File:').replace(' ', '_') for page in pages.values() if progress['errors'].get(page['imageinfo'][0]['descriptionurl'], {}).get('empty')], 'emptySources': [page for page in pages.values() if progress['errors'].get(page['imageinfo'][0]['descriptionurl'], {}).get('empty')], 'emptyEvidence': {'reason': 'Public Wiki SVG has no polygon elements, with an Infinity viewBox; no coordinates inferred.', 'checkedOn': '2026-10-24'}}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
checkpoint.unlink(missing_ok=True)
print(json.dumps({'patterns': len(patterns), 'newSourcesRead': len(pending)}))
