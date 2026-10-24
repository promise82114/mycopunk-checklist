"""有界讀取 27 件裝備的 Wiki 清單及其升級修訂；只存必要文字，不讀圖檔。
每個來源一次、逐批50頁、遇拒絕或限流停止、不重試。平常匯入使用本地快照。
"""
import json
import re
import hashlib
import time
from pathlib import Path
from urllib.parse import urlencode, unquote
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
equipment = json.loads((root / 'research/wiki-equipment.json').read_text(encoding='utf-8'))['items']
legacy = json.loads((root / 'prototype/data/upgrades.json').read_text(encoding='utf-8'))
requested = set()

def fetch(titles):
    result = {}
    pending = sorted(set(titles) - requested)
    if len(requested) + len(pending) > 1600:
        raise ValueError('Wiki read scope exceeded')
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        query = {'action': 'query', 'titles': '|'.join(batch), 'prop': 'revisions', 'rvprop': 'ids|timestamp|content', 'rvslots': 'main', 'format': 'json', 'redirects': 1}
        with urlopen(Request('https://mycopunk.miraheze.org/w/api.php?' + urlencode(query), headers={'User-Agent': 'MycopunkGuideWikiCatalogue/1.0'}), timeout=30) as response:
            raw = response.read(8_000_001)
        if len(raw) > 8_000_000:
            raise ValueError('Wiki response too large')
        data = json.loads(raw)
        if 'error' in data:
            raise ValueError(data['error'])
        for page in data['query']['pages'].values():
            if not page.get('revisions'):
                continue
            rev = page['revisions'][0]
            text = rev['slots']['main']['*']
            sections = {name: value.strip() for name, value in re.findall(r'<section begin="([^"]+)"\s*/>(.*?)<section end="\1"\s*/>', text, re.S)}
            wanted = ['infobox', 'description', 'properties', 'acquisition', 'upgrades', 'drop_only_upgrades', 'upgrade_grid', 'changelog']
            body = '\n'.join(sections[name] for name in wanted if name in sections) if sections else text
            result[page['title']] = {'title': page['title'], 'revision': rev['revid'], 'timestamp': rev['timestamp'], 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'sections': {key: sections[key] for key in wanted if key in sections}, 'text': body if not sections else ''}
        for redirect in data['query'].get('redirects', []):
            if redirect['to'] in result:
                result[redirect['from']] = result[redirect['to']]
        requested.update(batch)
        print(json.dumps({'requestedPages': len(requested), 'foundInBatch': len(data['query']['pages'])}), flush=True)
        time.sleep(0.15)
    return result

ownerTitles = {item['ownerId']: unquote(item['sourceUrl'].split('/wiki/')[1]).replace('_', ' ') for item in equipment}
ownerPages = fetch([title + '/source' for title in ownerTitles.values()] + ['Upgrades', 'Upgrades/source'])
upgradeTitles = set()
for page in ownerPages.values():
    for section in ['upgrades', 'drop_only_upgrades']:
        upgradeTitles.update(re.findall(r'\[\[([^\]|]+ Upgrade)\|', page['sections'].get(section, '')))
for item in legacy['upgrades']:
    upgradeTitles.add(unquote(item['wikiUrl'].split('/wiki/')[-1]).replace('_', ' ') if item['wikiUrl'] else item['nameEn'] + ' Upgrade')
if len(upgradeTitles) > 1000:
    raise ValueError('Too many upgrade titles')
upgradePages = fetch([title + '/source' for title in upgradeTitles])
missing = [title for title in upgradeTitles if title + '/source' not in upgradePages]
fallback = fetch(missing)
upgradePages.update(fallback)
output = {'schemaVersion': 1, 'checkedOn': '2026-10-24', 'sourceUrl': 'https://mycopunk.miraheze.org/wiki/Main_Page', 'license': 'CC BY-SA 4.0', 'methodZh': '直接讀取裝備清單與升級來源頁的修訂文字；保留必要段落與原文雜湊，不以 Excel 是否收錄決定 Wiki 項目是否存在。', 'ownerTitles': ownerTitles, 'ownerPages': ownerPages, 'upgradePages': upgradePages, 'requestedPageCount': len(requested)}
(root / 'research/wiki-catalogue-snapshot.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'ownerPages': len(ownerPages), 'upgradeTitles': len(upgradeTitles), 'upgradePages': len(upgradePages), 'fallbackTitles': len(missing)}))
