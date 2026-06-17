// 경기별 정적 공유/SEO 페이지 생성 (m/<home>-vs-<away>.html)
// 목적: 카톡/X 공유 시 경기별 OG 썸네일·제목 노출 + 검색 인덱싱. 사람은 앱(#match/id)으로 진입.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
global.window = {}; require(path.join(ROOT, "data.js")); const D = global.window.DATA;
const SITE = "https://kicktalk.xyz";
const teamById = {}; D.teams.forEach(t => teamById[t.id] = t);
var OGVER = {}; try { OGVER = JSON.parse(fs.readFileSync(path.join(ROOT, "ogm", "og_ver.json"), "utf8")); } catch (e) {}  // 경기별 OG 버전(결과 바뀌면 데몬이 증가→카톡 캐시 무효화)
function e(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
const KDAY = ["일", "월", "화", "수", "목", "금", "토"];
function kstLabel(f) {
  var d = f.kstDate || f.date || "", t = f.kstTime || f.time || "";
  try { var dt = new Date(d + "T00:00:00+09:00"); var dow = KDAY[dt.getDay()]; var md = (dt.getMonth() + 1) + "/" + dt.getDate(); return md + "(" + dow + ") " + t; } catch (x) { return d + " " + t; }
}
fs.mkdirSync(path.join(ROOT, "m"), { recursive: true });
var urls = [];
D.fixtures.forEach(function (f) {
  if (!(f.homeId && f.awayId)) return;
  var slug = f.homeId + "-vs-" + f.awayId, mid = f.id, hn = f.homeName, an = f.awayName;
  var ht = teamById[f.homeId] || {}, at = teamById[f.awayId] || {};
  var hf = ht.flag || "", af = at.flag || "";
  var kst = kstLabel(f), grp = f.group ? f.group + "조" : (f.stage || "");
  var venue = [f.venue, f.city].filter(Boolean).join(", ");
  var canonical = SITE + "/m/" + slug + ".html", appurl = SITE + "/#match/" + mid;
  var title = hn + " vs " + an + " 중계·라인업·선수평점 | 킥톡 2026 월드컵";
  var desc = hn + " vs " + an + " " + kst + " KST 킥오프" + (grp ? " (" + grp + ")" : "") + ". 예상·확정 라인업, 실시간 중계 스코어, 선수 평점·MVP 투표, 응원·하이라이트까지 킥톡에서 한눈에.";
  var wp = ((f.preview || {}).watchPoints) || [];
  var ld = JSON.stringify({ "@context": "https://schema.org", "@type": "SportsEvent", name: hn + " vs " + an, sport: "축구", startDate: f.date, location: { "@type": "Place", name: venue || "2026 월드컵" }, url: canonical, competitor: [{ "@type": "SportsTeam", name: hn }, { "@type": "SportsTeam", name: an }] });
  var body =
    "<h1>" + e(hf) + " " + e(hn) + " <span class=vs>vs</span> " + e(an) + " " + e(af) + "</h1>" +
    "<p class=meta>" + e(kst) + " KST" + (grp ? " · " + e(grp) : "") + (venue ? " · " + e(venue) : "") + "</p>" +
    "<h2>" + e(hn + " vs " + an) + " 경기 정보·중계</h2>" +
    "<p>" + e(hn + " vs " + an) + " 경기는 " + e(kst) + " KST" + (grp ? " " + e(grp) : "") + "에 열립니다. 예상·확정 라인업과 실시간 중계 스코어, 경기 후 선수 평점·MVP 투표를 킥톡에서 무료로 확인하세요." + (venue ? " 경기장: " + e(venue) + "." : "") + "</p>" +
    (wp.length ? "<h2>관전 포인트</h2><ul class=wp>" + wp.slice(0, 3).map(function (w) { return "<li>" + e(w) + "</li>"; }).join("") + "</ul>" : "") +
    "<a class=cta href='" + appurl + "'>킥톡에서 실시간 점수·라인업·선수평점 보기 →</a>" +
    "<p class=sub>예상 라인업 · 실시간 스코어 · 선수 평점/MVP 투표 · 응원 메시지 · 포인트 베팅</p>" +
    "<p class=tlinks><a href='" + SITE + "/t/" + f.homeId + ".html'>" + e(hn) + " 선수단</a> · <a href='" + SITE + "/t/" + f.awayId + ".html'>" + e(an) + " 선수단</a></p>";
  var ogv = (OGVER[mid] && OGVER[mid].v) || 3;  // 경기별 OG 버전(기본 3, 결과 바뀌면 데몬이 +1)
  var ogimg = SITE + "/ogm/" + slug + ".png?v=" + ogv;  // 경기별 전용 OG 이미지(앱 경기카드 라이트). ?v= 올리면 카톡 OG 캐시 무효화
  var pageHtml =
    "<!DOCTYPE html><html lang=ko><head><meta charset=UTF-8>" +
    "<meta name=viewport content='width=device-width,initial-scale=1'>" +
    "<title>" + e(title) + "</title><meta name=description content='" + e(desc) + "'>" +
    "<link rel=canonical href='" + canonical + "'><meta name=robots content='index,follow'>" +
    "<meta property=og:type content=website><meta property=og:title content='" + e(hn + " vs " + an + " — 중계·라인업·평점 | 킥톡") + "'>" +
    "<meta property=og:description content='" + e(desc) + "'><meta property=og:url content='" + canonical + "'>" +
    "<meta property=og:image content='" + ogimg + "'><meta property=og:image:width content='1200'><meta property=og:image:height content='630'>" +
    "<meta name=twitter:card content='summary_large_image'><meta name=twitter:title content='" + e(hn + " vs " + an + " | 킥톡") + "'><meta name=twitter:description content='" + e(desc) + "'><meta name=twitter:image content='" + ogimg + "'>" +
    "<script type=application/ld+json>" + ld + "</script>" +
    "<style>body{margin:0;background:#070d18;color:#eaf0fb;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;line-height:1.6}.wrap{max-width:680px;margin:0 auto;padding:20px;text-align:center}a{color:#4f8cff;text-decoration:none}.brand{font-weight:800;padding:8px 0;font-size:15px}h1{font-size:26px;margin:18px 0 6px}.vs{color:#9fb0cc;font-size:18px;font-weight:600}.meta{color:#9fb0cc;font-size:14px;margin:0 0 8px}h2{font-size:14px;color:#9fb0cc;margin:22px 0 8px}ul.wp{list-style:none;padding:0;text-align:left}ul.wp li{background:#111c30;border:1px solid #243049;border-radius:8px;padding:9px 12px;margin-bottom:6px;font-size:14px}.cta{display:inline-block;background:#4f8cff;color:#06122a;font-weight:800;border-radius:11px;padding:13px 20px;margin:20px 0 8px}.sub{color:#6f7d96;font-size:12.5px}.tlinks{font-size:13.5px;margin-top:14px}.ft{margin-top:26px;padding-top:14px;border-top:1px solid #243049;color:#6f7d96;font-size:12.5px}.ft a{color:#9fb0cc}</style></head>" +
    "<body><div class=wrap><div class=brand>⚽ <a href='" + SITE + "/'>킥톡 KickTalk</a></div>" + body +
    "<div class=ft><a href='" + SITE + "/'>홈</a> · <a href='" + SITE + "/about.html'>소개</a> · <a href='" + SITE + "/privacy.html'>개인정보처리방침</a> · <a href='" + SITE + "/terms.html'>서비스 약관</a></div></div>" +
    "<script>setTimeout(function(){location.replace('" + appurl + "');},1400);</script>" +  // 사람은 앱으로(크롤러는 OG만 읽음)
    "</body></html>";
  fs.writeFileSync(path.join(ROOT, "m", slug + ".html"), pageHtml);
  urls.push(canonical);
});
// sitemap에 경기 페이지 추가(기존 항목 유지 + m/ 갱신)
var smPath = path.join(ROOT, "sitemap.xml");
var sm = fs.existsSync(smPath) ? fs.readFileSync(smPath, "utf8") : '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>';
sm = sm.replace(/\n?\s*<url>\s*<loc>https:\/\/kicktalk\.xyz\/m\/[^<]*<\/loc>[\s\S]*?<\/url>/g, "");  // 기존 m/ 항목 제거
var add = urls.map(function (u) { return "<url><loc>" + u + "</loc><changefreq>daily</changefreq></url>"; }).join("\n");
sm = sm.replace("</urlset>", add + "\n</urlset>");
fs.writeFileSync(smPath, sm);
console.log("경기 페이지 생성:", urls.length, "개 (m/) + sitemap 갱신");
