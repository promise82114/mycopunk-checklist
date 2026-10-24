"""僅從記憶體 SVG 取得六角格座標；不儲存或渲染來源媒體。"""
import math
import xml.etree.ElementTree as ET

def parseSvg(raw):
    ns = '{http://www.w3.org/2000/svg}'
    root = ET.fromstring(raw)
    allowed = {'class', 'viewBox', 'width', 'height', 'style', 'points', 'fill', 'stroke', 'transform'}
    if root.tag != ns + 'svg':
        raise ValueError('not-svg')
    for element in root.iter():
        if element.tag not in {ns + 'svg', ns + 'polygon'} or not set(element.attrib) <= allowed or any('url(' in value.lower() or 'javascript:' in value.lower() for value in element.attrib.values()):
            raise ValueError('unsupported-svg-schema')
    cells = []
    for polygon in root.findall(ns + 'polygon'):
        if polygon.get('fill') != 'var(--rarity-color)' or polygon.get('transform'):
            continue
        points = [[float(v) for v in pair.split(',')] for pair in polygon.get('points', '').split()]
        if len(points) != 6 or any(len(point) != 2 for point in points):
            raise ValueError('invalid-hexagon')
        x, y = [sum(point[i] for point in points) / 6 for i in [0, 1]]
        q = (x - 56) / 84
        r = (y - 56) / (56 * math.sqrt(3)) - q / 2
        if abs(q - round(q)) >= 0.001 or abs(r - round(r)) >= 0.001:
            raise ValueError('unsupported-grid-spacing')
        cells.append([round(q), round(r)])
    if not cells:
        if not list(root):
            raise ValueError('empty-source-pattern')
        raise ValueError('missing-colored-cells')
    if len(cells) != len({tuple(cell) for cell in cells}):
        raise ValueError('duplicate-cells')
    minQ, minR = min(cell[0] for cell in cells), min(cell[1] for cell in cells)
    return sorted([[q - minQ, r - minR] for q, r in cells])
