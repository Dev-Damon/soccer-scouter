#!/usr/bin/env python3
# 구글뉴스 RSS로 48개국 팀별 축구 뉴스 수집 → news.json
# GitHub Actions 크론(4시간)에서 실행. 로컬(macOS)에서도 동작(SSL 폴백).
import json, urllib.request, urllib.parse, xml.etree.ElementTree as ET, ssl, html, re, time, datetime, sys

ROOT = __file__.rsplit("/scripts/", 1)[0] if "/scripts/" in __file__ else "."


def load_teams():
    src = open(ROOT + "/data.js", encoding="utf-8").read()
    i = src.index("{", src.index("window.DATA")); j = src.rindex("}")
    D = json.loads(src[i:j + 1])
    return [t["name"] for t in D.get("teams", []) if t.get("name")]


def fetch_rss(query):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; KickTalkBot/1.0)"})
    for c in (ssl.create_default_context(), ssl._create_unverified_context()):
        try:
            return urllib.request.urlopen(req, timeout=20, context=c).read()
        except Exception:
            continue
    return b""


def parse_items(raw, max_n=5):
    out = []
    try:
        root = ET.fromstring(raw)
    except Exception:
        return out
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = (it.findtext("pubDate") or "").strip()
        src_el = it.find("source")
        source = (src_el.text.strip() if src_el is not None and src_el.text else "")
        if " - " in title:  # 구글뉴스 제목 끝의 " - 언론사" 항상 제거
            head, tail = title.rsplit(" - ", 1)
            title = head.strip()
            if not source:
                source = tail.strip()
        date = ""
        if pub:
            try:
                # RSS pubDate는 GMT → +9시간 해서 한국시간(KST) 날짜로
                dt = datetime.datetime.strptime(pub[:25], "%a, %d %b %Y %H:%M:%S") + datetime.timedelta(hours=9)
                date = dt.strftime("%Y-%m-%d")
            except Exception:
                date = ""
        title = html.unescape(re.sub("<[^>]+>", "", title)).strip()
        if title and link:
            out.append({"title": title[:140], "url": link, "source": source[:40], "date": date})
        if len(out) >= max_n:
            break
    return out


def main():
    teams = load_teams()
    by = {}
    for nm in teams:
        try:
            items = parse_items(fetch_rss(nm + " 축구 대표팀"), 5)
            if items:
                by[nm] = items
            print("  %s: %d" % (nm, len(items)))
        except Exception as e:
            print("  %s: ERR %s" % (nm, e))
        time.sleep(0.4)
    result = {"updated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "byTeam": by}
    json.dump(result, open(ROOT + "/news.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("news.json written: %d teams" % len(by))


if __name__ == "__main__":
    main()
