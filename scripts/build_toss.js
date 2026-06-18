// 토스 미니앱(.ait) 빌드용 public/ 생성 — 웹 소스(index.html/app.js/data.js/comments.js/styles.css/bio.json/gk.json/아이콘)를
// toss/public/로 복사하되, index.html에서 애드센스 등 외부 스크립트 제거 + 토스모드 플래그 주입.
// 웹은 그대로 두고(단일 소스), 토스 빌드 직전에 이 스크립트로 public/만 생성. 사용: node scripts/build_toss.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PUB = path.join(ROOT, 'toss', 'public');
fs.mkdirSync(PUB, { recursive: true });

// 정적 자산 복사(토스 번들에 포함될 것들)
const assets = ['app.js', 'comments.js', 'data.js', 'styles.css', 'bio.json', 'gk.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest'];
assets.forEach(function (f) { var s = path.join(ROOT, f); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(PUB, f)); });

// 외부 스크립트 제거(토스 정책: 외부 스크립트 금지) — 애드센스·구글애널리틱스(gtag)·twemoji CDN. + 캐시버전 쿼리 제거.
function stripExternal(html) {
  html = html.replace(/<script[^>]*googlesyndication[^>]*><\/script>\s*/gi, '');
  html = html.replace(/<script[^>]*googletagmanager[^>]*><\/script>\s*/gi, '');
  html = html.replace(/<script>[^<]*dataLayer[^<]*<\/script>\s*/gi, '');  // gtag 인라인 설정
  html = html.replace(/<script[^>]*twemoji[^>]*><\/script>\s*/gi, '');
  html = html.replace(/(app\.js|styles\.css|comments\.js|data\.js)\?v=[^"']*/g, '$1');  // 번들이라 ?v 불필요
  return html;
}

// index.html 변환 — 외부 스크립트 제거 + 토스모드 플래그 주입
let html = stripExternal(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
html = html.replace(/<head>/i, '<head>\n  <script>window.__APPS_IN_TOSS__=true;</script>\n  <!-- TOSS_BRIDGE -->');
fs.writeFileSync(path.join(PUB, 'index.html'), html);

// 정적 안내 페이지도 번들에 포함(토스 인앱에서 푸터 링크 동작 — 약관·개인정보는 심사 필수). 외부 스크립트는 제거.
var pages = ['about.html', 'privacy.html', 'terms.html', 'patchnotes.html'];
pages.forEach(function (p) { var s = path.join(ROOT, p); if (fs.existsSync(s)) fs.writeFileSync(path.join(PUB, p), stripExternal(fs.readFileSync(s, 'utf8'))); });

console.log('toss/public 생성 완료:', assets.filter(function (f) { return fs.existsSync(path.join(PUB, f)); }).length, '자산 + index.html +', pages.length, '안내페이지');
console.log('주의: toss/src/main.ts가 IAP 브릿지(window.tossPay) 제공. 콘솔에서 appName 확정 + 후원 sku 4개 등록 후 granite build.');
