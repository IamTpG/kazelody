#!/usr/bin/env python3
"""Dò cửa sổ của làng trong ảnh nền ban ngày để đặt ánh đèn ban đêm (xem src/scene2d/windows.ts).
   python3 tools/find-windows.py captures/valley/day-high/hill-12_5-plate.webp
In ra danh sách [x, y] (px). Vùng dò cố định cho view "hill": y 600–720, x 380–1230."""
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert('RGB')
px = im.load()
W, H = im.size
lum = lambda p: 0.3 * p[0] + 0.55 * p[1] + 0.15 * p[2]
cand = set()
for y in range(600, 720):
    for x in range(380, 1230):
        p = px[x, y]
        if lum(p) < 135 and p[2] >= p[1] - 10 and abs(p[0] - p[1]) < 45:
            bright = sum(1 for dx, dy in ((-5, 0), (5, 0), (0, -4), (0, 4), (-4, -3), (4, 3))
                         if lum(px[min(W - 1, max(0, x + dx)), min(H - 1, max(0, y + dy))]) > 185 and min(px[min(W - 1, max(0, x + dx)), min(H - 1, max(0, y + dy))]) > 150)
            if bright >= 4:
                cand.add((x, y))
seen = set()
for p in sorted(cand):
    if p in seen:
        continue
    stack, comp = [p], []
    seen.add(p)
    while stack:
        q = stack.pop()
        comp.append(q)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                n = (q[0] + dx, q[1] + dy)
                if n in cand and n not in seen:
                    seen.add(n)
                    stack.append(n)
    if 2 <= len(comp) <= 40:
        print(f'[{sum(a for a, b in comp) / len(comp):.1f}, {sum(b for a, b in comp) / len(comp):.1f}]')
