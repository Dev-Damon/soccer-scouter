// 뉴스/칼럼 정적 페이지 생성 — 오리지널 한국어 콘텐츠(애드센스 대응). news/_src/<slug>.html 본문 → 완성 페이지 + 허브 + sitemap.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const PUB = "2026-06-27";
const ARTICLES = [
  { slug: "worldcup-2026-guide", title: "2026 북중미 월드컵 완전 가이드 — 일정·개최지·48개국 새 포맷", desc: "사상 첫 48개국, 미국·캐나다·멕시코 공동 개최. 2026 월드컵 일정·개최 도시·32강 진출 방식까지 처음 보는 사람을 위한 완전 가이드." },
  { slug: "title-contenders", title: "2026 월드컵 우승후보 전격 분석 — 프랑스·스페인·아르헨티나·브라질", desc: "프랑스·스페인·아르헨티나·브라질·잉글랜드·포르투갈. 2026 북중미 월드컵 우승후보들의 강점과 핵심 선수를 분석한다." },
  { slug: "korea-team", title: "손흥민·김민재의 대한민국 2026 월드컵 — A조 분석·16강 시나리오", desc: "FIFA 31위 대한민국의 2026 월드컵 A조(멕시코·남아공·체코) 분석. 손흥민·김민재·이강인 핵심 3인과 16강 시나리오." },
  { slug: "player-rating-guide", title: "축구 경기 평점이란? 평점·색상 보는 법 완전 정리", desc: "경기 평점이 무엇이고 어떻게 매겨지는지, 킥톡 라인업의 색상 평점 배지(빨강~파랑)를 읽는 법까지 한 번에 정리." },
  { slug: "superstars-11", title: "2026 월드컵 꼭 봐야 할 슈퍼스타 11인", desc: "손흥민·음바페·야말·벨링엄·비니시우스·메시·호날두까지. 2026 월드컵에서 놓치면 안 될 슈퍼스타 11인을 소개한다." },
  { slug: "groups-preview", title: "2026 월드컵 조별리그 12개 조 완벽 정리", desc: "A조부터 L조까지, 2026 북중미 월드컵 12개 조의 구성과 1강·다크호스·관전 포인트를 한눈에 정리했다." },
  { slug: "offside-rule", title: "오프사이드란? 축구 오프사이드 규칙 예시로 완벽 정리", desc: "오프사이드 위치와 반칙이 되는 순간의 차이, 오프사이드가 아닌 경우, 2026 월드컵 반자동 오프사이드 판독(SAOT)까지 예시로 쉽게 정리." },
  { slug: "football-positions", title: "축구 포지션 완전 정리 — CB·풀백·수미·공미·윙어 역할 한눈에", desc: "골키퍼부터 스트라이커까지 축구 포지션별 역할과 4-3-3·4-4-2 포메이션 읽는 법을 한 번에 정리. 라인업이 보이기 시작한다." },
  { slug: "penalty-shootout", title: "승부차기 규칙 완전 정리 — 순서·인원·서든데스까지", desc: "월드컵 토너먼트 승부차기 규칙 총정리. 5명 킥 순서, 서든데스, 골키퍼 위치·키커 자격 등 세부 규칙과 기록 처리까지." },
  { slug: "individual-awards", title: "월드컵 개인상 총정리 — 골든부트·골든볼·골든글러브 뜻", desc: "골든부트(득점왕)·골든볼(MVP)·골든글러브(GK)·영플레이어상까지, 월드컵 개인상의 뜻과 선정 기준을 한눈에 정리했다." },
  { slug: "var-explained", title: "VAR이란? 축구 비디오 판독 규칙 완전 정리", desc: "VAR이 개입하는 4가지 상황(득점·PK·퇴장·제재착오)과 판독 절차, 반자동 오프사이드 판독과의 관계까지 쉽게 정리." },
  { slug: "knockout-format", title: "월드컵 32강 진출 방식 — 조 순위·32강 대진 규칙 완전 정리", desc: "48개국 12개 조에서 조 1·2위와 3위 상위 8팀이 오르는 2026 월드컵 32강 진출 방식과 승점 동률 시 순위 결정(타이브레이커) 규칙 정리." },
  { slug: "formations", title: "축구 포메이션 완전 정리 — 4-3-3·4-4-2·3-4-3 장단점 비교", desc: "4-3-3·4-4-2·3-4-3 등 대표 포메이션의 뜻과 장단점, 공수 전환에 따라 모양이 바뀌는 이유까지 한눈에 정리했다." },
  { slug: "worldcup-history", title: "월드컵 역대 우승국 총정리 — 최다 우승은 브라질(5회)", desc: "브라질 5회, 독일·이탈리아 4회, 아르헨티나 3회 등 월드컵 역대 우승국과 우승 연도, 대륙별 판도와 주요 기록을 정리했다." },
  { slug: "cards-rules", title: "축구 경고·퇴장 규칙 — 옐로카드·레드카드 완전 정리", desc: "옐로카드(경고)·레드카드(퇴장)가 나오는 경우와 경고 2회 누적 퇴장, 대회 누적 경고 시 다음 경기 결장까지 축구 징계 규칙을 정리." },
  { slug: "match-structure", title: "축구 경기 시간은 몇 분? 전·후반·추가시간·연장 완전 정리", desc: "전반 45분·후반 45분·하프타임·추가시간(인저리타임)·연장전 30분·승부차기까지, 축구 경기 시간 구성을 상황별로 정리했다." },
  { slug: "set-piece", title: "세트피스란? 코너킥·프리킥·페널티킥 규칙 완전 정리", desc: "직접·간접 프리킥, 코너킥, 페널티킥 등 세트피스 종류별 규칙과 9.15m 수비벽·득점 인정 여부까지 한눈에 정리했다." },
  { slug: "football-glossary", title: "축구 용어 사전 — 중계에서 자주 나오는 필수 용어 정리", desc: "빌드업·오버래핑·프레싱·클린시트·해트트릭 등 중계에서 자주 나오는 축구 용어를 공격·수비·기록·포지션으로 나눠 정리했다." },
  { slug: "handball-rule", title: "축구 핸드볼 규칙 — 손에 맞으면 무조건 반칙일까?", desc: "손·팔의 위치로 갈리는 핸드볼 판정 기준, 반칙이 아닌 경우, 공격 팀에 더 엄격한 규정과 페널티킥·골키퍼 예외까지 정리." },
  { slug: "squad-numbers", title: "축구 등번호의 의미 — 10번은 에이스, 9번은 골잡이", desc: "1번 골키퍼부터 7번 윙어·9번 스트라이커·10번 에이스까지, 축구 등번호에 담긴 포지션과 상징의 유래를 정리했다." },
  { slug: "group-draw", title: "월드컵 조 추첨은 어떻게? 포트·시딩 방식 완전 정리", desc: "FIFA 랭킹 기반 4개 포트 시딩, 대륙 안배 규칙(유럽 최대 2팀), '죽음의 조'가 생기는 이유까지 월드컵 조 추첨 방식을 정리." },
  { slug: "substitution-rules", title: "축구 선수 교체 규칙 — 몇 명까지, 언제 바꿀 수 있나", desc: "한 경기 5명 교체·정지 기회 3번·하프타임 예외·연장 추가 교체·뇌진탕 교체까지, 현대 축구 선수 교체 규칙을 정리했다." },
];

const CSS = "body{margin:0;background:#070d18;color:#eaf0fb;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;line-height:1.6}.wrap{max-width:680px;margin:0 auto;padding:18px}a{color:#4f8cff;text-decoration:none}header{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #243049;margin-bottom:14px;font-weight:800}.crumb{font-size:12.5px;color:#6f7d96;margin:0 0 6px}.crumb a{color:#9fb0cc}article h2{font-size:23px;line-height:1.4;margin:10px 0 14px}article h3{font-size:17px;color:#eaf0fb;margin:24px 0 8px}article p{font-size:15.5px;color:#cdd7e8;line-height:1.85;margin:0 0 13px}article ul{margin:6px 0 14px;padding-left:20px}article li{font-size:15px;color:#cdd7e8;line-height:1.8;margin-bottom:6px}article b,article strong{color:#eaf0fb}.cta{display:inline-block;background:#4f8cff;color:#06122a;font-weight:800;border-radius:10px;padding:11px 18px;margin:8px 0 6px}.more{margin-top:30px;padding-top:16px;border-top:1px solid #243049}.more h4{font-size:14px;color:#9fb0cc;margin:0 0 10px}.more a{display:block;padding:7px 0;font-size:14.5px}footer{margin-top:26px;padding-top:14px;border-top:1px solid #243049;color:#6f7d96;font-size:12px}.artlist{list-style:none;padding:0}.artlist li{background:#0f1a2a;border:1px solid #1e2a3a;border-radius:12px;padding:14px 16px;margin-bottom:12px}.artlist h3{margin:0 0 6px;font-size:17px}.artlist p{margin:0;font-size:14px;color:#9fb0cc;line-height:1.7}";

const GA = "<script async src='https://www.googletagmanager.com/gtag/js?id=G-KNLJ29Y409'></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-KNLJ29Y409');</script>";
const ADS = "<script async src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1649642792791162' crossorigin='anonymous'></script>";

function head(title, desc, canonical, ld) {
  return "<!DOCTYPE html><html lang=ko><head><meta charset=UTF-8>"
    + "<meta name=viewport content='width=device-width,initial-scale=1'>"
    + GA + ADS
    + `<title>${title}</title><meta name=description content="${desc}">`
    + `<link rel=canonical href='${canonical}'><meta name=robots content='index,follow'>`
    + "<link rel=icon type='image/svg+xml' href='https://kicktalk.xyz/icon.svg'>"
    + `<meta property=og:type content=article><meta property=og:title content="${title}">`
    + `<meta property=og:description content="${desc}"><meta property=og:url content='${canonical}'>`
    + "<meta property=og:image content='https://kicktalk.xyz/og.png'>"
    + "<meta name=twitter:card content=summary_large_image>"
    + `<script type=application/ld+json>${ld}</script>`
    + `<style>${CSS}</style></head><body><div class=wrap>`;
}
const FOOT = "<footer>킥톡(KickTalk) — 2026 북중미 월드컵 선수·국가 분석 · 실시간 경기 · <a href='https://kicktalk.xyz/'>kicktalk.xyz</a><br><a href='https://kicktalk.xyz/about.html'>킥톡 소개</a> · <a href='https://kicktalk.xyz/privacy.html'>개인정보처리방침</a> · <a href='https://kicktalk.xyz/terms.html'>서비스 약관</a></footer></div></body></html>";

fs.mkdirSync(path.join(ROOT, "news"), { recursive: true });

function firstP(body) {
  const m = body.match(/<p>([\s\S]*?)<\/p>/);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

const made = [];
ARTICLES.forEach(function (a) {
  const body = fs.readFileSync(path.join(ROOT, "news/_src", a.slug + ".html"), "utf8").trim();
  const canonical = `https://kicktalk.xyz/news/${a.slug}.html`;
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "Article",
    headline: a.title, description: a.desc, inLanguage: "ko",
    datePublished: PUB, dateModified: PUB,
    image: "https://kicktalk.xyz/og.png",
    author: { "@type": "Organization", name: "킥톡 KickTalk" },
    publisher: { "@type": "Organization", name: "킥톡 KickTalk", url: "https://kicktalk.xyz/" },
    mainEntityOfPage: canonical,
  });
  // 다른 글 추천(현재 글 제외 3개)
  const others = ARTICLES.filter(function (x) { return x.slug !== a.slug; }).slice(0, 3);
  const more = "<div class=more><h4>함께 보면 좋은 글</h4>"
    + others.map(function (o) { return `<a href='https://kicktalk.xyz/news/${o.slug}.html'>${o.title} →</a>`; }).join("")
    + "</div>";
  const html = head(a.title, a.desc, canonical, ld)
    + "<header>⚽ <a href='https://kicktalk.xyz/'>킥톡 KickTalk</a></header>"
    + "<p class=crumb><a href='https://kicktalk.xyz/'>홈</a> › <a href='https://kicktalk.xyz/news/'>월드컵 가이드</a></p>"
    + "<article>" + body + "</article>"
    + "<a class=cta href='https://kicktalk.xyz/'>킥톡에서 실시간 경기·라인업·평점 보기 →</a>"
    + more + FOOT;
  fs.writeFileSync(path.join(ROOT, "news", a.slug + ".html"), html);
  made.push({ slug: a.slug, title: a.title, excerpt: firstP(body) });
});

// 허브 페이지
const hubLd = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", name: "월드컵 가이드·칼럼 | 킥톡", url: "https://kicktalk.xyz/news/", inLanguage: "ko" });
const hub = head("2026 월드컵 가이드·칼럼 | 킥톡", "2026 북중미 월드컵 가이드, 우승후보 분석, 대한민국 전망, 선수 평점 보는 법까지 — 킥톡이 정리한 월드컵 읽을거리.", "https://kicktalk.xyz/news/", hubLd)
  + "<header>⚽ <a href='https://kicktalk.xyz/'>킥톡 KickTalk</a></header>"
  + "<p class=crumb><a href='https://kicktalk.xyz/'>홈</a> › 월드컵 가이드</p>"
  + "<article><h2>2026 월드컵 가이드 · 칼럼</h2><p>2026 북중미 월드컵을 더 깊이 즐기기 위한 읽을거리를 모았습니다. 대회 포맷부터 우승후보, 대한민국 전망, 선수 평점 보는 법까지.</p></article>"
  + "<ul class=artlist>"
  + made.map(function (m) { return `<li><h3><a href='https://kicktalk.xyz/news/${m.slug}.html'>${m.title}</a></h3><p>${m.excerpt}</p></li>`; }).join("")
  + "</ul>" + FOOT;
fs.writeFileSync(path.join(ROOT, "news", "index.html"), hub);

// sitemap 갱신 — 기존 /news/ 항목 제거 후 재삽입(idempotent)
let sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
sm = sm.split("\n").filter(function (l) { return l.indexOf("/news/") < 0; }).join("\n");
const newsUrls = ["  <url><loc>https://kicktalk.xyz/news/</loc><changefreq>weekly</changefreq></url>"]
  .concat(ARTICLES.map(function (a) { return `  <url><loc>https://kicktalk.xyz/news/${a.slug}.html</loc></url>`; }))
  .join("\n");
sm = sm.replace("</urlset>", newsUrls + "\n</urlset>");
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sm);

console.log("생성:", made.length, "기사 + 허브 + sitemap 갱신");
console.log("sitemap url 수:", (sm.match(/<loc>/g) || []).length);
