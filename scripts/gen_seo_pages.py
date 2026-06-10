import json, os, html
src=open("data.js",encoding="utf-8").read()
i=src.index("{",src.index("window.DATA")); j=src.rindex("}")
D=json.loads(src[i:j+1])
def e(s): return html.escape(str(s if s is not None else ""))
teamById={t["id"]:t for t in D["teams"]}
teamByName={t["name"]:t for t in D["teams"]}
os.makedirs("p",exist_ok=True); os.makedirs("t",exist_ok=True)
CSS="body{margin:0;background:#070d18;color:#eaf0fb;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;line-height:1.6}.wrap{max-width:680px;margin:0 auto;padding:18px}a{color:#4f8cff;text-decoration:none}header{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #243049;margin-bottom:18px;font-weight:800}h1{font-size:24px;margin:6px 0 2px}h1 small{font-size:14px;color:#9fb0cc;font-weight:600}h2{font-size:15px;color:#9fb0cc;margin:20px 0 8px}.meta{color:#9fb0cc;font-size:14px;margin:0 0 12px}.facts{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}.facts li{background:#111c30;border:1px solid #243049;border-radius:8px;padding:5px 11px;font-size:13.5px;font-weight:700}.one{background:#111c30;border-left:3px solid #4f8cff;border-radius:8px;padding:11px 14px;font-size:14.5px}ul.dims{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px}ul.dims li{background:#111c30;border:1px solid #243049;border-radius:8px;padding:6px 11px;font-size:14px}ul.dims b{float:right;color:#4f8cff}.cta{display:inline-block;background:#4f8cff;color:#06122a;font-weight:800;border-radius:10px;padding:11px 18px;margin:18px 0 6px}.links{font-size:13.5px;color:#9fb0cc;margin-top:10px}footer{margin-top:26px;padding-top:14px;border-top:1px solid #243049;color:#6f7d96;font-size:12px}"
def page(title,desc,canonical,ld,bodyhtml,ogt):
    return ("<!DOCTYPE html><html lang=ko><head><meta charset=UTF-8>"
      "<meta name=viewport content='width=device-width,initial-scale=1'>"
      "<script async src='https://www.googletagmanager.com/gtag/js?id=G-KNLJ29Y409'></script>"
      "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-KNLJ29Y409');</script>"
      f"<title>{e(title)}</title><meta name=description content='{e(desc)}'>"
      f"<link rel=canonical href='{canonical}'><meta name=robots content='index,follow'>"
      f"<meta property=og:type content=website><meta property=og:title content='{e(ogt)}'>"
      f"<meta property=og:description content='{e(desc)}'><meta property=og:url content='{canonical}'>"
      "<meta property=og:image content='https://kicktalk.xyz/og.png'>"
      f"<script type=application/ld+json>{ld}</script>"
      f"<style>{CSS}</style></head><body><div class=wrap>"
      "<header>⚽ <a href='https://kicktalk.xyz/'>킥톡 KickTalk</a></header>"
      f"{bodyhtml}"
      "<footer>킥톡(KickTalk) — 2026 북중미 월드컵 선수·국가 분석 · 실시간 경기 · <a href='https://kicktalk.xyz/'>kicktalk.xyz</a></footer>"
      "</div></body></html>")
np=0
for p in D["players"]:
    pid=p["id"]; t=teamByName.get(p["team"]); tid=t["id"] if t else ""
    name=p["name"]; pos=p.get("position",""); club=p.get("club",""); num=p.get("number")
    title=f"{name} {p['team']} {pos} 능력치·등번호 프로필 | 킥톡 2026 월드컵"
    desc=f"{name}({p.get('nameEn','')}) {p['team']} {pos}, {club}. 등번호 {num if num is not None else '-'}, OVR {p.get('ovr','')}. {p.get('oneLiner','')} 2026 월드컵 선수 분석 킥톡."
    facts=[]
    if num is not None: facts.append(f"등번호 {num}")
    facts.append(f"OVR {p.get('ovr','-')}")
    if p.get("age"): facts.append(f"{p['age']}세")
    facts.append(f"A매치 {p.get('caps',0)}경기 {p.get('intlGoals',0)}골")
    if p.get("grade"): facts.append(p["grade"])
    body=f"<h1>{e(name)} <small>{e(p.get('nameEn',''))}</small></h1>"
    body+=f"<p class=meta>{e(p['team'])} 대표팀 · {e(pos)} · {e(club)} ({e(p.get('league',''))})</p>"
    body+="<ul class=facts>"+"".join(f"<li>{e(f)}</li>" for f in facts)+"</ul>"
    if p.get("oneLiner"): body+=f"<p class=one>{e(p['oneLiner'])}</p>"
    if p.get("power"):
        pw=p["power"]
        body+="<h2>능력치 (킥톡 자체 지수)</h2><ul class=dims>"+"".join(f"<li>{k} <b>{pw.get(k,'-')}</b></li>" for k in ["공격력","수비력","스피드","테크닉","피지컬","골결정력"])+"</ul>"
    if p.get("strengths"): body+="<h2>강점</h2><ul>"+"".join(f"<li>{e(s)}</li>" for s in p["strengths"])+"</ul>"
    if p.get("honours"): body+="<h2>주요 경력</h2><ul>"+"".join(f"<li>{e(h)}</li>" for h in p["honours"])+"</ul>"
    body+=f"<a class=cta href='https://kicktalk.xyz/#player/{e(pid)}'>킥톡 앱에서 {e(name)} 전체 분석·레이더 보기 →</a>"
    body+=f"<p class=links><a href='https://kicktalk.xyz/t/{e(tid)}.html'>{e(p['team'])} 대표팀 명단</a> · <a href='https://kicktalk.xyz/'>킥톡 홈</a></p>"
    ld=json.dumps({"@context":"https://schema.org","@type":"Person","name":name,"alternateName":p.get("nameEn",""),"jobTitle":"축구 선수","affiliation":{"@type":"SportsTeam","name":p["team"]},"url":f"https://kicktalk.xyz/p/{pid}.html"},ensure_ascii=False)
    open(f"p/{pid}.html","w",encoding="utf-8").write(page(title,desc,f"https://kicktalk.xyz/p/{pid}.html",ld,body,f"{name} — {p['team']} | 킥톡"))
    np+=1
nt=0
for t in D["teams"]:
    tid=t["id"]; tn=t["name"]
    roster=[p for p in D["players"] if p["team"]==tn]
    roster.sort(key=lambda p:(p.get("number") if p.get("number") is not None else 999))
    title=f"{tn} 2026 월드컵 대표팀 명단·전력·선수 | 킥톡"
    desc=f"{tn}({t.get('nameEn','')}) 2026 북중미 월드컵 대표팀 명단 {len(roster)}명 — 선수별 능력치·등번호·소속을 한눈에. 킥톡."
    body=f"<h1>{e(tn)} <small>{e(t.get('nameEn',''))}</small></h1>"
    body+=f"<p class=meta>2026 FIFA 월드컵 대표팀 · 선수 {len(roster)}명</p>"
    body+=f"<a class=cta href='https://kicktalk.xyz/#team/{e(tid)}'>킥톡에서 {e(tn)} 전력·예상 포메이션 보기 →</a>"
    body+="<h2>대표팀 선수단</h2><ul>"+"".join(f"<li><a href='https://kicktalk.xyz/p/{e(p['id'])}.html'>{('['+str(p['number'])+'] ' if p.get('number') is not None else '')}{e(p['name'])} ({e(p.get('position',''))})</a></li>" for p in roster)+"</ul>"
    ld=json.dumps({"@context":"https://schema.org","@type":"SportsTeam","name":tn,"sport":"축구","url":f"https://kicktalk.xyz/t/{tid}.html"},ensure_ascii=False)
    open(f"t/{tid}.html","w",encoding="utf-8").write(page(title,desc,f"https://kicktalk.xyz/t/{tid}.html",ld,body,f"{tn} 2026 월드컵 대표팀 | 킥톡"))
    nt+=1
# sitemap
urls=["https://kicktalk.xyz/","https://kicktalk.xyz/privacy.html","https://kicktalk.xyz/terms.html"]
urls+=[f"https://kicktalk.xyz/t/{t['id']}.html" for t in D["teams"]]
urls+=[f"https://kicktalk.xyz/p/{p['id']}.html" for p in D["players"]]
sm='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
for u in urls: sm+=f"  <url><loc>{u}</loc></url>\n"
sm+="</urlset>\n"
open("sitemap.xml","w",encoding="utf-8").write(sm)
print(f"선수 페이지 {np}개 · 나라 페이지 {nt}개 · sitemap URL {len(urls)}개")
