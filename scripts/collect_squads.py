#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# scripts/collect_squads.py
# ─────────────────────────────────────────────────────────────────────────────
# 국가대표 스쿼드의 "포지션·현재 소속팀"을 위키데이터(사실 기반)에서 수집해
# 포메이션/라인업 좌표를 자동 보정한 JSON을 만든다.  LLM 미사용 = 토큰 0.
# stdlib(urllib/json)만 사용. pip 설치 불필요.
#
# 사용:   python3 scripts/collect_squads.py 대한민국 브라질 스페인
# 출력:   scripts/out/squads.json   (검증 에이전트가 검토 후 data.js에 반영)
#
# 핵심 아이디어:
#  - 현재 data.js의 로스터(선수 명단)는 유지하되, 각 선수의 "granular position"을
#    위키데이터 P413(주 포지션)에서 가져와 교정한다. (예: 설영우 = full-back)
#  - 교정된 역할(role)로 선발 11인의 x/y 좌표를 재배치 → 측면자원은 측면, 센터백은 중앙.
#  - 역할 분포로 포메이션 문자열(예: 3-4-3 / 4-3-3)을 도출.
#  - 매칭 근거(위키데이터 QID/라벨/설명/원문 포지션)를 함께 남겨 검증 에이전트가 감사.
# ─────────────────────────────────────────────────────────────────────────────
import functools, json, os, ssl, sys, time, urllib.parse, urllib.request

print = functools.partial(print, flush=True)  # 리다이렉트 시에도 즉시 출력

# macOS Python.framework는 CA 번들이 없어 SSL 검증 실패 → certifi 있으면 사용, 없으면 미검증(공개 읽기전용 API라 허용)
try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL = ssl._create_unverified_context()

UA = "KickTalkSquadBot/1.0 (https://kicktalk.xyz; suckd9111@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "data.js")
OUT_DIR = os.path.join(HERE, "out")


def http_get(url, accept=None, retries=2, backoff=1.0):
    headers = {"User-Agent": UA}
    if accept:
        headers["Accept"] = accept
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=20, context=_SSL) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa
            last = e
            time.sleep(backoff * (i + 1))
    raise last


def load_data():
    src = open(DATA_PATH, encoding="utf-8").read()
    i = src.index("{", src.index("window.DATA"))
    j = src.rindex("}")
    return json.loads(src[i:j + 1])


# ── 위키데이터 QID 해석 ───────────────────────────────────────────────────────
def resolve_qid(name_en, hint="footballer"):
    # 1순위: 영문 위키백과 문서 → wikibase_item (문서 제목이 정확히 일치할 때 가장 신뢰도 높음)
    for title in (name_en, f"{name_en} (footballer)"):
        url = ("https://en.wikipedia.org/w/api.php?action=query&format=json"
               "&prop=pageprops&ppprop=wikibase_item&redirects=1&titles="
               + urllib.parse.quote(title))
        try:
            d = json.loads(http_get(url))
            for p in d.get("query", {}).get("pages", {}).values():
                q = p.get("pageprops", {}).get("wikibase_item")
                # 동음이의 문서는 wikibase_item이 없거나 disambiguation → 스킵
                if q:
                    return q, "wiki:" + title
        except Exception:
            pass
    # 2순위: wbsearchentities (축구/footballer 설명 우선)
    url = ("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json"
           "&language=en&uselang=en&type=item&limit=10&search="
           + urllib.parse.quote(name_en))
    try:
        d = json.loads(http_get(url))
        cands = d.get("search", [])
        for c in cands:
            desc = (c.get("description") or "").lower()
            if "football" in desc or "soccer" in desc:
                return c["id"], "search:" + (c.get("description") or "")
        if cands:
            return cands[0]["id"], "search(weak):" + (cands[0].get("description") or "")
    except Exception:
        pass
    return None, "UNRESOLVED"


def resolve_qids_batch(names):
    # 영문 위키백과에서 여러 제목을 한 번에 조회 → {입력명: QID}.  (나라당 1~2회 호출)
    out = {}
    CHUNK = 40
    for i in range(0, len(names), CHUNK):
        chunk = names[i:i + CHUNK]
        url = ("https://en.wikipedia.org/w/api.php?action=query&format=json"
               "&prop=pageprops&ppprop=wikibase_item&redirects=1&titles="
               + urllib.parse.quote("|".join(chunk)))
        try:
            q = json.loads(http_get(url)).get("query", {})
            norm = {m["from"]: m["to"] for m in q.get("normalized", [])}
            redir = {m["from"]: m["to"] for m in q.get("redirects", [])}
            t2q = {}
            for p in q.get("pages", {}).values():
                qid = p.get("pageprops", {}).get("wikibase_item")
                if qid:
                    t2q[p.get("title")] = qid
            for name in chunk:
                t = redir.get(norm.get(name, name), norm.get(name, name))
                out[name] = t2q.get(t)
        except Exception:
            for name in chunk:
                out.setdefault(name, None)
    return out


WD_API = "https://www.wikidata.org/w/api.php"


def _wbget(ids, props, extra=""):
    # wbgetentities: 표준 API(쿼리서비스 아님 → 강한 rate-limit 회피). 50개씩 배치.
    out = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        url = (WD_API + "?action=wbgetentities&format=json&props=" + props + extra
               + "&ids=" + "|".join(chunk))
        d = json.loads(http_get(url))
        out.update(d.get("entities", {}))
        time.sleep(0.1)
    return out


def fetch_facts(qids):
    # 1) 선수 엔티티들의 claims → P413(포지션 QID), P54(소속 QID, 종료일 없는 것), P569(생일)
    ents = _wbget(qids, "claims")
    raw, refs = {}, set()
    for qid in qids:
        claims = ents.get(qid, {}).get("claims", {})
        positions, clubs, dob = [], [], None
        for st in claims.get("P413", []):
            v = st.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            if isinstance(v, dict) and v.get("id"):
                positions.append(v["id"]); refs.add(v["id"])
        for st in claims.get("P54", []):
            if "P582" in st.get("qualifiers", {}):   # 종료일 있음 = 과거 소속
                continue
            v = st.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            if isinstance(v, dict) and v.get("id"):
                clubs.append((st.get("rank"), v["id"])); refs.add(v["id"])
        for st in claims.get("P569", []):
            t = st.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("time")
            if t:
                dob = t[1:11]; break
        raw[qid] = {"pos": positions, "clubs": clubs, "dob": dob}
    # 2) 참조된 포지션/클럽 QID의 영문 라벨
    labels = {}
    if refs:
        for q, e in _wbget(list(refs), "labels", "&languages=en").items():
            labels[q] = e.get("labels", {}).get("en", {}).get("value", q)
    # 3) 합치기 (preferred 랭크 클럽 우선)
    out = {}
    for qid in qids:
        r = raw.get(qid, {"pos": [], "clubs": [], "dob": None})
        pref = [c for rk, c in r["clubs"] if rk == "preferred"]
        clubs = pref if pref else [c for _, c in r["clubs"]]
        out[qid] = {
            "positions": set(labels.get(p, p) for p in r["pos"]),
            "clubs": set(labels.get(c, c) for c in clubs),
            "dob": r["dob"], "desc": None,
        }
    return out


# ── 포지션 라벨 → (coarse, 한글, role) ────────────────────────────────────────
# role: gk, cb, fb, wb, dm, cm, am, w, st
KO = {"gk": "골키퍼", "cb": "센터백", "fb": "풀백", "wb": "윙백",
      "dm": "수비형 미드필더", "cm": "미드필더", "am": "공격형 미드필더",
      "w": "윙어", "st": "공격수"}


def classify(labels):
    s = " | ".join(l.lower() for l in labels)

    def has(*ks):
        return any(k in s for k in ks)
    # 구체적 → 일반적 순서로 판정
    if has("goalkeeper"):
        role = "gk"
    elif has("wing-back", "wingback"):
        role = "wb"
    elif has("full-back", "fullback", "left-back", "right-back", "left back", "right back"):
        role = "fb"
    elif has("centre-back", "center-back", "central defender", "sweeper", "centre back", "center back"):
        role = "cb"
    elif has("defensive midfield"):
        role = "dm"
    elif has("attacking midfield"):
        role = "am"
    elif has("winger", "wide midfield", "left midfield", "right midfield"):
        role = "w"
    elif has("central midfield", "midfield"):
        role = "cm"
    elif has("centre-forward", "center-forward", "striker", "centre forward"):
        role = "st"
    elif has("forward"):
        role = "st"
    elif has("defender"):
        role = "cb"
    elif has("midfielder"):
        role = "cm"
    else:
        return (None, None, None, list(labels))
    coarse = {"gk": "GK", "cb": "DF", "fb": "DF", "wb": "DF",
              "dm": "MF", "cm": "MF", "am": "MF", "w": "FW", "st": "FW"}[role]
    return (coarse, KO[role], role, list(labels))


# ── 선발 11인 좌표 재배치(역할 기반) ──────────────────────────────────────────
LINE_Y = {"GK": 90, "DEF": 74, "DM": 60, "MID": 48, "AM": 34, "FWD": 20}


def spread_x(n):
    if n <= 0:
        return []
    if n == 1:
        return [50]
    return [round(15 + i * (70 / (n - 1))) for i in range(n)]


def build_lineup(players):
    # players: [{name, number, playerId, role, coarse}]  (선발 11인)
    by = {"gk": [], "def": [], "dm": [], "mid": [], "am": [], "fwd": []}
    for p in players:
        r = p["role"]
        if r == "gk":
            by["gk"].append(p)
        elif r in ("cb", "fb", "wb"):
            by["def"].append(p)
        elif r == "dm":
            by["dm"].append(p)
        elif r in ("cm",):
            by["mid"].append(p)
        elif r == "am":
            by["am"].append(p)
        elif r in ("w", "st"):
            by["fwd"].append(p)
        else:
            by["mid"].append(p)  # 미상은 중원에

    lineup = []

    def place(group, line_key, central_roles, wide_roles):
        grp = by[group]
        if not grp:
            return
        # 측면 역할은 바깥쪽, 중앙 역할은 가운데로 정렬
        def wideness(p):
            if p["role"] in wide_roles:
                return 0  # 바깥
            if p["role"] in central_roles:
                return 1  # 중앙
            return 1
        # 바깥(좌) → 중앙 → 바깥(우) 배치를 위해: 측면 둘을 양 끝, 중앙은 가운데
        wide = [p for p in grp if p["role"] in wide_roles]
        cent = [p for p in grp if p["role"] not in wide_roles]
        ordered = []
        # 좌측 측면 1명, 중앙들, 우측 측면 1명 (측면 2명 초과 시 균등 분산)
        if len(wide) >= 2:
            ordered = [wide[0]] + cent + wide[1:]
        elif len(wide) == 1:
            ordered = [wide[0]] + cent
        else:
            ordered = cent
        xs = spread_x(len(ordered))
        y = LINE_Y[line_key]
        for p, x in zip(ordered, xs):
            lineup.append({"playerId": p["playerId"], "name": p["name"],
                           "number": p["number"], "pos": p["coarse"], "x": x, "y": y})

    place("gk", "GK", ("gk",), ())
    place("def", "DEF", ("cb",), ("fb", "wb"))
    place("dm", "DM", ("dm",), ())
    place("mid", "MID", ("cm",), ())
    place("am", "AM", ("am",), ())
    place("fwd", "FWD", ("st",), ("w",))

    # 포메이션 문자열: 라인별 인원 (빈 라인 제외, GK 제외)
    counts = [("DEF", len(by["def"])), ("DM", len(by["dm"])), ("MID", len(by["mid"])),
              ("AM", len(by["am"])), ("FWD", len(by["fwd"]))]
    formation = "-".join(str(c) for _, c in counts if c > 0)
    return formation, lineup


def main():
    targets = sys.argv[1:] or ["대한민국", "브라질", "스페인"]
    D = load_data()
    teams = {t["name"]: t for t in D.get("teams", [])}
    os.makedirs(OUT_DIR, exist_ok=True)
    result = {"countries": {}, "generatedFrom": "wikidata P413/P54/P569"}

    for country in targets:
        team = teams.get(country)
        if not team:
            print(f"[{country}] 팀 없음, 스킵")
            continue
        roster = [p for p in D.get("players", []) if p.get("team") == country]
        print(f"\n[{country}] roster={len(roster)} · QID 해석 중...")

        # 1) QID 해석 (배치 1회 + 미스만 개별 폴백)
        names = [p.get("nameEn") or p["name"] for p in roster]
        qmap = resolve_qids_batch(names)
        misses = 0
        for p in roster:
            nm = p.get("nameEn") or p["name"]
            qid = qmap.get(nm)
            how = "wiki-batch"
            if not qid:
                misses += 1
                qid, how = resolve_qid(nm)  # 개별 폴백(위키 제목/검색)
                time.sleep(0.2)
            p["_qid"], p["_how"] = qid, how
        print(f"  QID 해석 완료 (배치 미스 {misses}건 개별 폴백)")
        qids = [p["_qid"] for p in roster if p["_qid"]]

        # 2) 배치 SPARQL (한 방)
        facts = fetch_facts(qids) if qids else {}

        # 3) 분류
        players_out = []
        for p in roster:
            f = facts.get(p.get("_qid"), {})
            labels = sorted(f.get("positions", []))
            coarse, ko, role, raw = classify(labels)
            # 국가대표팀/올림픽팀은 '소속 클럽'에서 제외 (P54가 대표팀도 포함하기 때문)
            club = [c for c in sorted(f.get("clubs", []))
                    if "national" not in c.lower() and "olympic" not in c.lower()]
            players_out.append({
                "id": p["id"], "name": p["name"], "nameEn": p.get("nameEn"),
                "qid": p.get("_qid"), "match": p.get("_how"),
                "wdDesc": f.get("desc"),
                "wdPositions": labels,
                "wdClubs": club,
                "dob": f.get("dob"),
                "old_position": p.get("position"),
                "new_position_ko": ko, "new_position_coarse": coarse, "role": role,
                "needsReview": (role is None),
            })

        # 4) 선발 11인 재배치 — 기존 lineup의 11명을 교정된 role로 좌표 재계산
        idmap = {po["id"]: po for po in players_out}
        starters = []
        for slot in team.get("lineup", []):
            pid = slot.get("playerId")
            po = idmap.get(pid)
            role = po["role"] if po and po["role"] else _coarse_to_role(slot.get("pos"))
            coarse = (po["new_position_coarse"] if po and po["new_position_coarse"]
                      else slot.get("pos"))
            starters.append({"playerId": pid, "name": slot.get("name"),
                             "number": slot.get("number"), "role": role, "coarse": coarse})
        formation, lineup = build_lineup(starters)

        result["countries"][country] = {
            "id": team["id"], "name": country,
            "old_formation": team.get("formation"),
            "new_formation": formation,
            "lineup": lineup,
            "players": players_out,
        }
        unresolved = [po["name"] for po in players_out if not po["qid"]]
        noPos = [po["name"] for po in players_out if not po["role"]]
        print(f"  → formation {team.get('formation')} → {formation}")
        print(f"  → QID 미해석: {len(unresolved)} {unresolved}")
        print(f"  → 포지션 미상: {len(noPos)} {noPos}")
        for po in players_out:
            if po["role"]:
                print(f"     {po['name']:<10} {po['old_position']:<3} → {po['new_position_ko']} ({po['role']})  [{','.join(po['wdPositions']) or '-'}]")

    out_path = os.path.join(OUT_DIR, "squads.json")
    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
    print(f"\n저장: {out_path}")


def _coarse_to_role(coarse):
    return {"GK": "gk", "DF": "cb", "MF": "cm", "FW": "st"}.get(coarse, "cm")


if __name__ == "__main__":
    main()
