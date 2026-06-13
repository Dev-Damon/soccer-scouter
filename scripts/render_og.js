// OG 공유 카드 이미지 생성(HTML→Playwright 스크린샷, 1200x630) — 국기/공 이모지 네이티브 렌더.
// 1310 디자인: 파란 스코어보드 + 득점자 좌우 가운데수렴 + 자책골 빨간공.
const { chromium } = require('/tmp/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const CHROME = '/Users/damon/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium';
const ROOT = path.dirname(__dirname);

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// d = {home:{name,flag,rank}, away:{name,flag,rank}, hs, as, ended, dt, leftG:[{name,clk,og}], rightG:[...]}
// 디자인 = 앱 경기카드(라이트). 자책골은 빨간 공 + "(자책골)".
function cardHtml(d) {
  function scorer(g) {  // ⚽ 이름 (자책골) 시간 — 경기카드처럼(가운데 정렬, 공 왼쪽)
    return '<div class="sc-row"><span class="ball' + (g.og ? ' og' : '') + '">⚽</span>' +
      '<span class="sc-txt">' + esc(g.name) + (g.og ? ' (자책골)' : '') + (g.clk ? ' ' + esc(g.clk) : '') + '</span></div>';
  }
  function team(t) {
    return '<div class="team"><span class="flag">' + t.flag + '</span>' +
      '<span class="tname">' + esc(t.name) + '</span>' +
      (t.rank ? '<span class="trank">FIFA ' + esc(t.rank) + '위</span>' : '') + '</div>';
  }
  var center = d.ended
    ? '<div class="score">' + (d.hs | 0) + ' <span>-</span> ' + (d.as | 0) + '</div><div class="sub">경기 종료</div>'
    : '<div class="vs-x">VS</div><div class="kick">' + esc(d.dt || '') + '</div>';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;}' +
    'body{width:1200px;height:630px;overflow:hidden;}' +
    '.card{width:1200px;height:630px;position:relative;color:#1c2536;display:flex;flex-direction:column;' +
      'background:linear-gradient(160deg, #ffffff 0%, #eef2f8 55%, #e3eaf4 100%);padding:40px 56px 0;}' +
    '.brand{font-size:30px;font-weight:900;letter-spacing:.5px;}' +
    '.brand b{color:#2f6fe0;}' +
    '.brand small{font-size:22px;font-weight:700;color:#62718c;margin-left:14px;}' +
    '.head{flex:1;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;}' +
    '.team{display:flex;flex-direction:column;align-items:center;gap:14px;}' +
    '.flag{font-size:104px;line-height:1;filter:drop-shadow(0 3px 7px rgba(30,50,90,.18));}' +
    '.tname{font-size:46px;font-weight:800;}' +
    '.trank{font-size:25px;color:#8a97ab;font-weight:600;}' +
    '.center{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:260px;}' +
    '.score{font-size:104px;font-weight:900;letter-spacing:2px;line-height:1;}' +
    '.score span{color:#aab5c8;margin:0 6px;}' +
    '.sub{font-size:30px;font-weight:700;color:#62718c;}' +
    '.kick{font-size:28px;font-weight:700;color:#62718c;}' +
    '.vs-x{font-size:64px;font-weight:900;color:#8a97ab;letter-spacing:3px;}' +
    '.goals{display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;padding:6px 0 18px;min-height:90px;}' +
    '.gcol{display:flex;flex-direction:column;gap:11px;align-items:center;justify-content:flex-start;}' +
    '.sc-row{display:flex;align-items:center;gap:11px;font-size:30px;font-weight:600;color:#2b3850;}' +
    '.ball{font-size:26px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;}' +
    '.ball.og{font-size:0;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 36% 32%, #ff6a5e, #e2231a 70%);box-shadow:inset -3px -3px 6px rgba(0,0,0,.25);}' +
    '.foot{height:64px;display:flex;align-items:center;justify-content:center;background:#2f6fe0;color:#fff;' +
      'font-size:26px;font-weight:800;margin:0 -56px;}' +
    '</style></head><body><div class="card">' +
    '<div class="brand"><b>KICKTALK</b><small>2026 월드컵 · 경기</small></div>' +
    '<div class="head">' + team(d.home) +
      '<div class="center">' + center + '</div>' + team(d.away) + '</div>' +
    '<div class="goals"><div class="gcol">' + (d.leftG || []).map(scorer).join('') + '</div>' +
      '<div class="gcol">' + (d.rightG || []).map(scorer).join('') + '</div></div>' +
    '<div class="foot">kicktalk.xyz · 라인업 · 실시간 점수 · 선수 평점 · 응원</div>' +
    '</div></body></html>';
}

async function render(d, outPath) {
  const b = await chromium.launch({ executablePath: CHROME });
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await pg.setContent(cardHtml(d), { waitUntil: 'networkidle' });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await b.close();
}

// items = [{data, outPath}] — 브라우저 1개 재사용해서 여러 장 생성
async function renderMany(items) {
  const b = await chromium.launch({ executablePath: CHROME });
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const it of items) {
    await pg.setContent(cardHtml(it.data), { waitUntil: 'load' });
    await pg.waitForTimeout(120);
    await pg.screenshot({ path: it.outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  }
  await b.close();
}

module.exports = { render, renderMany, cardHtml };

// CLI 테스트: node render_og.js  → 미국 4-1 파라과이 샘플
if (require.main === module) {
  const test = {
    home: { name: '미국', flag: '🇺🇸', rank: 17 }, away: { name: '파라과이', flag: '🇵🇾', rank: 41 },
    hs: 4, as: 1, ended: true, dt: '06.13 10:00',
    leftG: [
      { name: '보바디야', clk: "7'", og: true },
      { name: '발로건', clk: "31'" },
      { name: '발로건', clk: "45+5'" },
      { name: '레이나', clk: "90+8'" },
    ],
    rightG: [ { name: '마우리시우', clk: "73'" } ],
  };
  render(test, '/tmp/og_test.png').then(() => console.log('saved /tmp/og_test.png'));
}
