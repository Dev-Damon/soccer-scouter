# 경기별 OG 공유 이미지 생성 (ogm/<home>-vs-<away>.png, 1200x630) — 카톡/X 공유 썸네일용
# 라이트 모드 통일(카톡이 OG를 캐시하므로 한번 정하면 못 바꿈) — 경기 결과 카드와 같은 톤.
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
def fit(dr, txt, base, maxw, floor=40):
    sz = base
    while sz > floor:
        f = font(sz); bb = dr.textbbox((0, 0), txt, font=f)
        if bb[2] - bb[0] <= maxw: return f
        sz -= 4
    return font(floor)
W, H = 1200, 630
# 라이트 팔레트(결과 카드와 동일 톤)
ACC = (47, 111, 224)      # #2f6fe0
NAME = (28, 37, 54)       # #1c2536
SUB = (98, 113, 140)      # #62718c
FAINT = (138, 151, 171)   # #8a97ab
n = 0
for f in D["fixtures"]:
    if not (f.get("homeId") and f.get("awayId")): continue
    slug = f["homeId"] + "-vs-" + f["awayId"]
    img = Image.new("RGB", (W, H), (255, 255, 255)); dr = ImageDraw.Draw(img)
    # 세로 그라데이션: 흰색 → 연한 청회색
    top, bot = (255, 255, 255), (225, 232, 243)
    for y in range(H):
        r = y / H
        col = (int(top[0] + (bot[0] - top[0]) * r), int(top[1] + (bot[1] - top[1]) * r), int(top[2] + (bot[2] - top[2]) * r))
        dr.line([(0, y), (W, y)], fill=col)
    dr.rectangle([0, 0, W, 10], fill=ACC)  # 상단 액센트 바
    cx = W // 2
    # 헤더
    dr.text((60, 44), "KICKTALK", font=font(40), fill=NAME)
    dr.text((300, 52), "2026 월드컵 · 경기", font=font(28), fill=ACC)
    # 팀명 좌/우 + 가운데 VS (카드처럼)
    lx, rx = 340, 860
    fL = fit(dr, f["homeName"], 76, 480); fR = fit(dr, f["awayName"], 76, 480)
    center(dr, lx, 250, f["homeName"], fL, NAME)
    center(dr, rx, 250, f["awayName"], fR, NAME)
    center(dr, cx, 256, "VS", font(48), ACC)
    # 날짜·조
    grp = (f["group"] + "조") if f.get("group") else (f.get("stage") or "")
    center(dr, cx, 410, kst(f) + " KST" + ("  ·  " + grp if grp else ""), font(40), SUB)
    # 하단 바(액센트 채움 + 흰 글씨)
    dr.rounded_rectangle([60, 524, W - 60, 590], radius=33, fill=ACC)
    center(dr, cx, 540, "kicktalk.xyz  ·  라인업 · 실시간 점수 · 선수 평점 · 응원", font(30), (255, 255, 255))
    img.save(os.path.join(ROOT, "ogm", slug + ".png"))
    n += 1
print("OG 이미지 생성(라이트):", n, "개 (ogm/)")
