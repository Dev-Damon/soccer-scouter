# 경기별 OG 공유 이미지 생성 (ogm/<home>-vs-<away>.png, 1200x630) — 카톡/X 공유 썸네일용
import json, os, datetime
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
i = src.index("{", src.index("window.DATA")); j = src.rindex("}")
D = json.loads(src[i:j + 1])
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
def font(sz): return ImageFont.truetype(FONT, sz)
os.makedirs(os.path.join(ROOT, "ogm"), exist_ok=True)
KDAY = ["월", "화", "수", "목", "금", "토", "일"]
def kst(f):
    d = f.get("kstDate") or f.get("date") or ""; t = f.get("kstTime") or f.get("time") or ""
    try:
        dt = datetime.date.fromisoformat(d); return "%d.%d(%s) %s" % (dt.month, dt.day, KDAY[dt.weekday()], t)
    except Exception: return (d + " " + t).strip()
def center(dr, cx, y, txt, fnt, fill):
    bb = dr.textbbox((0, 0), txt, font=fnt); dr.text((cx - (bb[2] - bb[0]) / 2, y), txt, font=fnt, fill=fill)
def fit(dr, txt, base, maxw):
    sz = base
    while sz > 34:
        f = font(sz); bb = dr.textbbox((0, 0), txt, font=f)
        if bb[2] - bb[0] <= maxw: return f
        sz -= 4
    return font(34)
W, H = 1200, 630
n = 0
for f in D["fixtures"]:
    if not (f.get("homeId") and f.get("awayId")): continue
    slug = f["homeId"] + "-vs-" + f["awayId"]
    img = Image.new("RGB", (W, H), (11, 18, 32)); dr = ImageDraw.Draw(img)
    dr.rectangle([0, 0, W, 9], fill=(79, 140, 255))
    cx = W // 2
    center(dr, cx, 54, "킥톡  ·  2026 FIFA 월드컵", font(34), (120, 160, 230))
    center(dr, cx, 150, f["homeName"], fit(dr, f["homeName"], 92, 1040), (234, 240, 251))
    center(dr, cx, 280, "VS", font(46), (79, 140, 255))
    center(dr, cx, 350, f["awayName"], fit(dr, f["awayName"], 92, 1040), (234, 240, 251))
    grp = (f["group"] + "조") if f.get("group") else (f.get("stage") or "")
    center(dr, cx, 482, kst(f) + " KST" + (" · " + grp if grp else ""), font(38), (159, 176, 204))
    center(dr, cx, 550, "라인업 · 실시간 점수 · 선수 평점 · 응원   |   kicktalk.xyz", font(29), (111, 125, 150))
    img.save(os.path.join(ROOT, "ogm", slug + ".png"))
    n += 1
print("OG 이미지 생성:", n, "개 (ogm/)")
