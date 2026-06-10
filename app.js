// 축구 스카우터 — 앱 로직 (프레임워크 없는 순수 JS)
// 와이어프레임 구조: 일정(홈) → 나라 상세 → 선수 상세 → 검색 + 하단 탭바.
// 색상/룩앤필은 기존 다크 테마 유지. 새 데이터 필드(indices/formation/manager/ovr/scout)는 있으면 자동 표시.
(function () {
  "use strict";

  var DATA = window.DATA || { teams: [], players: [], groups: [], fixtures: [], meta: {} };
  DATA.groups = DATA.groups || [];
  DATA.fixtures = DATA.fixtures || [];
  var playersById = {};
  DATA.players.forEach(function (p) { playersById[p.id] = p; });
  var teamsById = {};
  DATA.teams.forEach(function (t) { teamsById[t.id] = t; });
  var fixturesById = {};
  (DATA.fixtures || []).forEach(function (f) { if (f.id) fixturesById[f.id] = f; });

  var viewEl = document.getElementById("view");
  var searchEl = document.getElementById("search");
  var backBtn = document.getElementById("backBtn");
  var sampleNote = document.getElementById("sampleNote");
  var tabsEl = document.getElementById("tabs");
  var tabbarEl = document.getElementById("tabbar");

  // 홈 탭 상태: 'schedule'(일정) | 'groups'(조별)
  var homeTab = "schedule";
  // 날짜 스트립 선택
  var selectedDate = null;

  // 푸터: 비워둠 (불필요한 안내 문구 제거)
  if (sampleNote) sampleNote.innerHTML = "";

  // ---- 유틸 ----
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // 이모지(특히 국기)를 이미지로 렌더 — Windows/PC 브라우저가 국기 이모지를 글자로 표시하는 문제 대응
  function twem(el) {
    try {
      if (window.twemoji && el) {
        window.twemoji.parse(el, { folder: "svg", ext: ".svg", base: "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/" });
      }
    } catch (e) {}
  }
  function initials(name) {
    var s = String(name || "").trim();
    return s ? s.slice(0, 1) : "?";
  }
  function gradeClass(g) { return "g-" + esc(g); }
  function badge(p, hideScore) {
    return '<span class="badge ' + gradeClass(p.grade) + '">' + esc(p.grade) +
      (hideScore ? "" : ' <span class="score">' + (p.ovr || "") + "</span>") + "</span>";
  }
  // 이름 첫글자 대신 '포지션 배지'(GK/DF/MF/FW 색상) — 의미 있는 시각 요소
  // 포지션 표기를 영문 약어로 통일 (한글/혼합 → GK/CB/LB/.../CF). 배지·선수정보 공용. 데이터는 그대로.
  function posAbbr(pos) {
    var s = String(pos || "");
    var T = [
      [/골키퍼|goalkeeper/i, "GK"],
      [/왼쪽\s*윙백|좌측\s*윙백|left.?wing.?back/i, "LWB"],
      [/오른쪽\s*윙백|우측\s*윙백|right.?wing.?back/i, "RWB"],
      [/윙백|wing.?back/i, "WB"],
      [/왼쪽\s*풀백|레프트백|left.?back/i, "LB"],
      [/오른쪽\s*풀백|라이트백|right.?back/i, "RB"],
      [/풀백|full.?back/i, "FB"],
      [/센터백|중앙\s*수비|centre.?back|center.?back|sweeper/i, "CB"],
      [/수비형\s*미드필더|defensive\s*mid/i, "DM"],
      [/공격형\s*미드필더|attacking\s*mid/i, "AM"],
      [/왼쪽\s*윙어|left\s*wing/i, "LW"],
      [/오른쪽\s*윙어|right\s*wing/i, "RW"],
      [/윙어|winger/i, "W"],
      [/중앙\s*미드필더|중원|미드필더|midfielder/i, "CM"],
      [/센터\s*포워드|centre.?forward|center.?forward/i, "CF"],
      [/스트라이커|striker/i, "ST"],
      [/공격수|forward/i, "ST"],
      [/수비수|defender/i, "DF"]
    ];
    for (var i = 0; i < T.length; i++) if (T[i][0].test(s)) return T[i][1];
    var m = s.match(/\b(GK|RWB|LWB|WB|RB|LB|FB|CB|CDM|DM|CAM|AM|CM|RM|LM|RW|LW|CF|ST|FW|DF|MF)\b/i);
    return m ? m[1].toUpperCase() : s;
  }
  function posBadge(p, lg) {
    // 배지는 기존처럼 코스(GK/DF/MF/FW)로 통일 — 한글로 새던 것만 자연히 영문 코스로 교정됨
    return '<span class="posb ' + posClass(p.position) + (lg ? " lg" : "") + '">' + posClass(p.position).toUpperCase() + "</span>";
  }
  function flagOf(teamId) {
    var t = teamId ? teamsById[teamId] : null;
    return t ? t.flag : "🏳️";
  }
  // 2026 월드컵 공동개최국(미국/캐나다/멕시코) — 경기장 도시·구장명으로 판별. 멕·캐만 지정, 나머지 개최도시는 전부 미국.
  function hostCountry(fx) {
    var c = ((fx && fx.city) || "") + " " + ((fx && fx.venue) || "");
    if (/mexico city|zapopan|guadalajara|guadalupe|nuevo le|monterrey|azteca|akron|bbva/i.test(c)) return "🇲🇽 멕시코";
    if (/toronto|vancouver|bc place|bmo field/i.test(c)) return "🇨🇦 캐나다";
    return "🇺🇸 미국";
  }
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return { d: esc(iso || "날짜 미정"), dow: "", mo: +m, day: 0 };
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return { d: +m[2] + "월 " + +m[3] + "일", dow: DOW[dt.getDay()] || "", mo: +m[2], day: +m[3] };
  }
  // 한국시간(KST) 우선 표시
  function fxDate(fx) { return fx.kstDate || fx.date; }
  function fxTime(fx) { return fx.kstTime || fx.time; }
  // 포지션 → 색 클래스(GK/DF/MF/FW)
  function posClass(pos) {
    var s = String(pos || ""); var p = s.toUpperCase();
    if (p.indexOf("GK") !== -1 || s.indexOf("골키퍼") !== -1) return "gk";
    if (/\bDF\b|CB|LB|RB|WB/.test(p) || /센터백|레프트백|라이트백|풀백|윙백|수비수/.test(s) || (s.indexOf("수비") !== -1 && s.indexOf("수비형 미") === -1)) return "df";
    if (/\bFW\b|ST|CF|LW|RW/.test(p) || /스트라이커|공격수|윙어|포워드/.test(s)) return "fw";
    return "mf";
  }
  // 포메이션 순서(공격→미드필더→수비→GK). 나라 상세 선수단의 1차 정렬키.
  function posRank(p) {
    var c = posClass(p && p.position);
    return c === "fw" ? 0 : c === "mf" ? 1 : c === "df" ? 2 : 3;
  }
  // 한글 코스 포지션(선수 상세용): 공격수/미드필더/수비수/골키퍼
  function posKo(pos) {
    var c = posClass(pos);
    return c === "gk" ? "골키퍼" : c === "df" ? "수비수" : c === "mf" ? "미드필더" : "공격수";
  }

  // ---- 라우팅(해시 기반) ----
  function go(hash) { window.location.hash = hash; }
  function parseHash() {
    var h = (window.location.hash || "").replace(/^#/, "");
    if (!h) return { name: "home" };
    var parts = h.split("/");
    if (parts[0] === "player") return { name: "player", id: parts[1] };
    if (parts[0] === "team") return { name: "team", id: parts[1] };
    if (parts[0] === "match") return { name: "match", id: parts[1] };
    if (parts[0] === "manager") return { name: "manager", id: parts[1] };
    if (parts[0] === "search") return { name: "search" };
    if (parts[0] === "saved") return { name: "saved" };
    if (parts[0] === "my") return { name: "my" };
    if (parts[0] === "admin") return { name: "admin" };
    return { name: "home" };
  }

  // ===================== 홈: 일정 / 조별 =====================
  function renderHome() {
    backBtn.hidden = true;
    tabsEl.hidden = false;
    Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === homeTab);
    });
    if (homeTab === "groups") return renderGroups();
    return renderSchedule();
  }

  function fixtureDates() {
    var set = {};
    (DATA.fixtures || []).forEach(function (f) { if (f.date) set[fxDate(f)] = 1; });
    return Object.keys(set).sort();
  }

  // 메인 하단 '주요 소식' — 팀 뉴스를 재활용(최신순 상위 N)
  function isKoreanSrc(nw) {
    if (/[\uAC00-\uD7A3]/.test(nw.source || "")) return true;
    return /\.kr(\/|$)|naver\.com|footballist|besteleven|interfootball|sportalkorea|spotvnews|yna\.co|sportschosun|sports\.donga/.test((nw.source || "") + " " + (nw.url || ""));
  }
  function homeNews(limit) {
    // 선택한 날짜에 경기가 있는 나라들의 뉴스만 (없으면 전체 폴백)
    var dayIds = {};
    (DATA.fixtures || []).forEach(function (f) {
      if (fxDate(f) === selectedDate) { if (f.homeId) dayIds[f.homeId] = 1; if (f.awayId) dayIds[f.awayId] = 1; }
    });
    var teams = Object.keys(dayIds).map(function (id) { return teamsById[id]; }).filter(Boolean);
    if (!teams.length) teams = DATA.teams || [];
    var all = [];
    teams.forEach(function (t) {
      (t.news || []).forEach(function (nw) { all.push({ t: t, nw: nw }); });
    });
    all.sort(function (a, b) {
      var ka = isKoreanSrc(a.nw) ? 0 : 1, kb = isKoreanSrc(b.nw) ? 0 : 1;
      if (ka !== kb) return ka - kb;
      var da = a.nw.date || "", db = b.nw.date || ""; return da < db ? 1 : da > db ? -1 : 0;
    });
    return all.slice(0, limit || 8);
  }

  var WITTY = [
    "축알못이 만든 축구분석 사이트",
    "따뜻한 응원보단 신랄한 비판 지향",
    "전문성? 그런 거 없습니다",
    "분석이라 쓰고 뇌피셜이라 읽는다",
    "맞으면 실력, 틀리면 모른 척",
    "정확도는 보장 못 합니다 (재미는 보장)",
    "근거 없는 자신감의 집결지",
    "팩트는 거들 뿐, 우기면 진실",
    "축잘알은 조용히 뒤로가기 눌러주세요",
    "비전문가의, 비전문가를 위한 축구 사이트",
    "응원은 셀프, 비판은 풀파워",
    "여긴 분석 사이트가 아니라 우김 사이트",
    "신랄함은 기본, 팩트는 옵션",
    "맞히면 예언자, 틀리면 그냥 팬",
    "어차피 우승은 내 최애팀 (정신승리)",
    "객관적인 척, 사실은 제일 주관적"
  ];
  function isKoreaFx(f) { return f.homeName === "대한민국" || f.awayName === "대한민국" || f.homeId === "south-korea" || f.awayId === "south-korea"; }
  function ddayCount(targetKst, todayKst) { return Math.round((Date.parse(targetKst + "T00:00:00Z") - Date.parse(todayKst + "T00:00:00Z")) / 86400000); }
  function topBanner() {
    var today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    var fxs = DATA.fixtures || [];
    var opening = fxs.map(fxDate).filter(Boolean).sort()[0], dday;
    if (opening && today < opening) {
      var d = ddayCount(opening, today);
      dday = "🏆 2026 월드컵 개막 " + (d <= 0 ? "D-DAY" : "D-" + d);
    } else {
      var krDates = fxs.filter(isKoreaFx).map(fxDate).filter(Boolean).sort(), next = null;
      for (var i = 0; i < krDates.length; i++) { if (krDates[i] >= today) { next = krDates[i]; break; } }
      if (next) { var d2 = ddayCount(next, today); dday = "🇰🇷 대한민국 다음 경기 " + (d2 <= 0 ? "D-DAY · 오늘!" : "D-" + d2); }
      else { dday = "🇰🇷 대한민국 월드컵 일정 종료"; }
    }
    var witty = WITTY[Math.floor(Math.random() * WITTY.length)];
    return '<div class="hero-banner">' +
      '<div class="hb-kicker">KICKTALK · 2026 WORLD CUP</div>' +
      '<div class="hb-title">국가와 선수를 한눈에</div>' +
      '<div class="hb-sub">' + esc(witty) + "</div>" +
      '<div class="hb-dday">' + dday + "</div></div>";
  }

  // 위트 문구 2초마다 슬라이드 전환(위→아래)
  var wittyTimer = null;
  function startWittyTicker() {
    if (wittyTimer) { clearInterval(wittyTimer); wittyTimer = null; }
    var el = viewEl.querySelector(".hb-sub");
    if (!el) return;
    var i = Math.max(0, WITTY.indexOf(el.textContent));
    wittyTimer = setInterval(function () {
      if (!document.body.contains(el)) { clearInterval(wittyTimer); wittyTimer = null; return; }
      i = (i + 1) % WITTY.length;
      el.classList.remove("anim"); void el.offsetWidth;  // 애니메이션 재생용 리플로우
      el.textContent = WITTY[i];
      el.classList.add("anim");
    }, 3000);
  }

  function renderSchedule() {
    var dates = fixtureDates();
    if (!dates.length) {
      viewEl.innerHTML = '<div class="empty">경기 일정 데이터를 채우는 중입니다.</div>';
      return;
    }
    if (!selectedDate || dates.indexOf(selectedDate) === -1) {
      var todayKST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
      selectedDate = dates.find(function (d) { return d >= todayKST; }) || dates[dates.length - 1];
    }

    // 재렌더 전 스트립 가로 스크롤 위치 기억 (날짜 클릭해도 스트립이 안 튀게)
    var prevStrip = viewEl.querySelector(".datestrip");
    var prevScroll = prevStrip ? prevStrip.scrollLeft : null;

    // 날짜 스트립
    var strip = '<div class="datestrip">';
    dates.forEach(function (d) {
      var f = fmtDate(d);
      strip += '<button class="dchip' + (d === selectedDate ? " on" : "") + '" data-date="' + esc(d) + '">' +
        '<span class="dchip-dow">' + esc(f.dow) + "</span>" +
        '<span class="dchip-day">' + f.day + "</span>" +
        '<span class="dchip-mo">' + f.mo + "월</span></button>";
    });
    strip += "</div>";

    var dayFixtures = (DATA.fixtures || []).filter(function (f) { return fxDate(f) === selectedDate; })
      .sort(function (a, b) { return (a.time || "99:99") < (b.time || "99:99") ? -1 : 1; });

    // 빅매치 히어로: 양 팀 모두 알려진 경기 중 FIFA 합산 랭킹이 가장 높은(숫자 작은) 경기
    var hero = pickBigMatch(dayFixtures);
    var heroHtml = hero ? heroCard(hero) : "";

    // 그 날의 경기 리스트
    var listHtml = '<div class="sec-h">' + fmtDate(selectedDate).d + " " +
      (fmtDate(selectedDate).dow ? fmtDate(selectedDate).dow + "요일" : "") +
      ' · ' + dayFixtures.length + '경기 <span class="kst-note">한국시간</span></div>';
    dayFixtures.forEach(function (fx) { if (!hero || fx !== hero) listHtml += fixtureCard(fx); });

    // 주요 소식 (팀 뉴스가 있을 때만)
    var hn = homeNews(8);
    if (hn.length) {
      listHtml += '<div class="sec-h">📰 이 날 경기 나라 소식</div><div class="news-list">';
      hn.forEach(function (x) {
        var nw = x.nw, tt = x.t;
        var meta = [nw.source, nw.date].filter(Boolean).map(esc).join(" · ");
        var foot = meta + (nw.url ? (meta ? " · " : "") + "원문 보기 ↗" : "");
        var tag = nw.url ? "a" : "div";
        listHtml += "<" + tag + ' class="news-item home-news' + (nw.url ? " ext" : "") + '"' +
          (nw.url ? ' href="' + esc(nw.url) + '" target="_blank" rel="noopener"' : "") + ">" +
          '<div class="hn-head"><span class="hn-flag">' + esc(tt.flag) + '</span><span class="hn-team">' + esc(tt.name) + "</span></div>" +
          '<div class="news-title">' + esc(nw.title) + "</div>" +
          (nw.summary ? '<div class="news-sum"><span class="ai-tag">AI 요약</span>' + esc(nw.summary) + "</div>" : "") +
          (foot ? '<div class="news-meta">' + foot + "</div>" : "") +
          "</" + tag + ">";
      });
      listHtml += "</div>";
    }

    viewEl.innerHTML = topBanner() + strip + heroHtml + listHtml;
    startWittyTicker();

    // 스트립 스크롤: 직전 위치가 있으면 그대로 유지(클릭해도 안 튐), 없으면(첫 진입) 선택 칩이 보이게 중앙 정렬
    var stripEl = viewEl.querySelector(".datestrip");
    if (stripEl) {
      if (prevScroll != null) {
        stripEl.scrollLeft = prevScroll;
      } else {
        var onChip = stripEl.querySelector(".dchip.on");
        if (onChip) {
          var doScroll = function () {
            try { onChip.scrollIntoView({ inline: "center", block: "nearest" }); }
            catch (e) { stripEl.scrollLeft = Math.max(0, onChip.offsetLeft - stripEl.clientWidth / 2 + onChip.clientWidth / 2); }
          };
          if (window.requestAnimationFrame) requestAnimationFrame(doScroll); else doScroll();
        }
      }
    }
  }

  function pickBigMatch(list) {
    var best = null, bestScore = 1e9;
    list.forEach(function (fx) {
      if (!fx.homeId || !fx.awayId) return;
      var h = teamsById[fx.homeId], a = teamsById[fx.awayId];
      var hr = (h && h.fifaRank) || 999, ar = (a && a.fifaRank) || 999;
      var s = hr + ar;
      if (s < bestScore) { bestScore = s; best = fx; }
    });
    return best;
  }

  function heroCard(fx) {
    var groupLabel = fx.group ? fx.group + "조" : (fx.stage || "");
    var meta = [fx.venue, fx.city, hostCountry(fx)].filter(Boolean).map(esc).join(" · ");
    var heroAttr = (fx.homeId && fx.awayId) ? ' data-match="' + esc(fx.id) + '"'
      : ' data-team="' + esc(fx.homeId || fx.awayId) + '"';
    return '<div class="hero"' + heroAttr + ">" +
      '<div class="hero-grid"></div>' +
      '<div class="hero-tag"><span class="dot"></span>오늘의 빅매치 · ' + esc(groupLabel) + "</div>" +
      '<div class="hero-match">' +
        '<div class="hero-side"><span class="hero-flag">' + esc(flagOf(fx.homeId)) + "</span>" +
          '<span class="hero-team">' + esc(fx.homeName) + "</span></div>" +
        '<div class="hero-mid"><span class="hero-kick">' + esc(fxTime(fx) || "시간 미정") + "</span><span class=\"hero-vs\">VS</span></div>" +
        '<div class="hero-side"><span class="hero-flag">' + esc(flagOf(fx.awayId)) + "</span>" +
          '<span class="hero-team">' + esc(fx.awayName) + "</span></div>" +
      "</div>" +
      (meta ? '<div class="hero-meta">' + meta + "</div>" : "") +
      '<div class="hero-cta">경기 예상 보기 →</div>' +
      "</div>";
  }

  function fixtureCard(fx) {
    var both = !!(fx.homeId && fx.awayId);
    var clickable = !!(fx.homeId || fx.awayId);
    var attr = both ? ' data-match="' + esc(fx.id) + '"'
      : (clickable ? ' data-team="' + esc(fx.homeId || fx.awayId) + '"' : "");
    var timeLabel = fxTime(fx) ? esc(fxTime(fx)) : "시간 미정";
    var groupLabel = fx.group ? esc(fx.group) + "조" : esc(fx.stage || "");
    var meta = [fx.venue, fx.city, hostCountry(fx)].filter(Boolean).map(esc).join(" · ");
    var lv = LIVE[fx.id];
    var live = !!(lv && lv.state === "in"), ended = !!(lv && lv.state === "post");
    var mid;
    if (live || ended) {
      mid = '<span class="fx-stage">' + groupLabel + "</span>" +
        '<span class="fx-score">' + (lv.hs | 0) + ' <i>-</i> ' + (lv.as | 0) + "</span>" +
        (live ? '<span class="fx-live"><span class="lv-dot"></span>LIVE ' + esc(lv.clock || "") + "</span>"
              : '<span class="fx-final">종료</span>');
    } else {
      mid = '<span class="fx-stage">' + groupLabel + "</span>" +
        '<span class="fx-time">' + timeLabel + '</span><span class="fx-vs">VS</span>';
    }
    var goals = (lv && lv.events && lv.events.length)
      ? '<div class="fx-goals">⚽ ' + lv.events.map(function (g) { return esc(g.who) + (g.clk ? " " + esc(g.clk) : ""); }).join(" · ") + "</div>"
      : "";
    return '<div class="fixture' + (clickable ? " clickable" : "") + (live ? " is-live" : "") + '"' + attr + ">" +
      '<div class="fx-side home"><span class="fx-flag">' + esc(flagOf(fx.homeId)) + "</span>" +
        '<span class="fx-team">' + esc(fx.homeName) + "</span></div>" +
      '<div class="fx-mid">' + mid + "</div>" +
      '<div class="fx-side away"><span class="fx-flag">' + esc(flagOf(fx.awayId)) + "</span>" +
        '<span class="fx-team">' + esc(fx.awayName) + "</span></div>" +
      (goals || (meta ? '<div class="fx-meta">' + meta + "</div>" : "")) +
      "</div>";
  }

  function renderGroups() {
    var groups = DATA.groups || [];
    if (!groups.length) {
      viewEl.innerHTML = '<div class="empty">조 편성 데이터를 채우는 중입니다.</div>';
      return;
    }
    fetchStandings();  // ESPN 순위 비동기 갱신(캐시 60초) → 도착 시 자동 재렌더
    var hasData = Object.keys(STAND).length > 0;
    var cmp = function (a, b) {
      return b.s.pts - a.s.pts || b.s.gd - a.s.gd || b.s.gf - a.s.gf ||
        (((a.t && a.t.fifaRank) || 999) - ((b.t && b.t.fifaRank) || 999));
    };
    var html = '<div class="stand-note">' +
      (hasData ? "조별 순위 · 결과 실시간 반영 · 1·2위 직행 + 각 조 3위 중 상위 8팀 진출" : "순위 불러오는 중… (개막 전이라 0)") +
      "</div>";
    var thirds = [];
    groups.forEach(function (g) {
      var rows = (g.teamIds || []).map(function (id) {
        return { id: id, t: teamsById[id], s: STAND[id] || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 } };
      });
      rows.sort(cmp);
      if (rows[2]) thirds.push({ g: g.group, r: rows[2] });
      html += '<div class="group-card"><h3><span class="group-letter">' + esc(g.group) + "</span>" + esc(g.group) + "조</h3>" +
        '<table class="stand"><thead><tr><th class="c">#</th><th>팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>';
      rows.forEach(function (r, i) {
        var t = r.t, s = r.s;
        var gd = (s.gd > 0 ? "+" : "") + s.gd;
        html += '<tr class="' + (i < 2 ? "qual" : "") + '"' + (t ? ' data-team="' + esc(t.id) + '"' : "") + ">" +
          '<td class="c rk">' + (i + 1) + "</td>" +
          '<td class="tm"><span class="team-flag">' + esc(t ? t.flag : "🏳️") + "</span>" +
            '<span class="tm-n">' + esc(t ? t.name : r.id) + "</span></td>" +
          "<td>" + s.p + "</td><td>" + s.w + "</td><td>" + s.d + "</td><td>" + s.l + "</td>" +
          "<td>" + gd + '</td><td class="pts">' + s.pts + "</td></tr>";
      });
      html += "</tbody></table></div>";
    });
    // 각 조 3위팀 순위 (WC2026: 12개 조 3위 중 상위 8팀 16강 진출)
    thirds.sort(function (a, b) { return cmp(a.r, b.r); });
    html += '<div class="group-card"><h3>🥉 3위 팀 순위 <span class="muted-note">상위 8팀 16강 진출</span></h3>' +
      '<table class="stand"><thead><tr><th class="c">#</th><th>팀</th><th class="c">조</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>';
    thirds.forEach(function (o, i) {
      var t = o.r.t, s = o.r.s;
      var gd = (s.gd > 0 ? "+" : "") + s.gd;
      html += '<tr class="' + (i < 8 ? "qual" : "") + '"' + (t ? ' data-team="' + esc(t.id) + '"' : "") + ">" +
        '<td class="c rk">' + (i + 1) + "</td>" +
        '<td class="tm"><span class="team-flag">' + esc(t ? t.flag : "🏳️") + "</span>" +
          '<span class="tm-n">' + esc(t ? t.name : o.r.id) + "</span></td>" +
        '<td class="c">' + esc(o.g) + "</td>" +
        "<td>" + s.p + "</td><td>" + s.w + "</td><td>" + s.d + "</td><td>" + s.l + "</td>" +
        "<td>" + gd + '</td><td class="pts">' + s.pts + "</td></tr>";
    });
    html += "</tbody></table></div>";
    viewEl.innerHTML = html;
  }

  // ===================== 공통: 선수 행 =====================
  function playerRow(p, hideScore) {
    return '<div class="player-row" data-player="' + esc(p.id) + '">' +
      posBadge(p) +
      '<div class="player-main"><div class="player-name">' + esc(p.name) + "</div>" +
      '<div class="player-sub">' + esc(p.team) + " · " + esc(p.club) + " · " + esc(posAbbr(p.position)) + "</div></div>" +
      badge(p, hideScore) + "</div>";
  }

  // ===================== 검색 =====================
  function recentGet() {
    try { return JSON.parse(localStorage.getItem("ss_recent") || "[]"); } catch (e) { return []; }
  }
  function recentPush(q) {
    q = (q || "").trim();
    if (!q) return;
    var list = recentGet().filter(function (x) { return x !== q; });
    list.unshift(q);
    list = list.slice(0, 8);
    try { localStorage.setItem("ss_recent", JSON.stringify(list)); } catch (e) {}
  }

  // ===================== 선수 랭킹 (검색 탭 기본 화면) =====================
  var rankSort = "ovr", rankPos = "all", rankLimit = 30, RANK_STATS = null;
  function rankMetric(p) {
    if (rankSort === "rating") { var s = RANK_STATS && RANK_STATS[p.id]; return s ? s.avg : -1; }
    if (rankSort === "value") return (p.scout && p.scout.value) || 0;
    if (rankSort === "fame") return (p.scout && p.scout.fame) || 0;
    return p.ovr || 0;
  }
  function rankCard(p, rank) {
    var t = teamsById[teamIdByName(p.team)], flag = t ? t.flag : "🏳";
    var sc;
    if (rankSort === "rating") { var s = RANK_STATS && RANK_STATS[p.id]; sc = s ? "⭐" + s.avg.toFixed(1) : "–"; }
    else if (rankSort === "value") sc = (p.scout && p.scout.value) || "–";
    else if (rankSort === "fame") sc = (p.scout && p.scout.fame) || "–";
    else sc = p.ovr || "–";
    return '<div class="rank-card" data-player="' + esc(p.id) + '">' +
      '<span class="rank-no">' + rank + "</span>" +
      '<span class="rank-flag">' + esc(flag) + "</span>" +
      '<div class="rank-main"><div class="rank-name">' + esc(p.name) + "</div>" +
      '<div class="rank-sub">' + esc(posAbbr(p.position)) + " · " + esc(p.team) + "</div></div>" +
      '<span class="rank-score">' + esc(sc) + "</span></div>";
  }
  function paintRanking() {
    var wrap = viewEl.querySelector(".rank-wrap");
    if (!wrap) return;
    var list = DATA.players.slice();
    if (rankPos !== "all") list = list.filter(function (p) { return posClass(p.position) === rankPos; });
    list.sort(function (a, b) { var d = rankMetric(b) - rankMetric(a); return d || (b.ovr || 0) - (a.ovr || 0); });
    var shown = list.slice(0, rankLimit);
    var sorts = [["ovr", "종합"], ["rating", "유저평점"], ["value", "가치"], ["fame", "유명도"]];
    var sortUi = '<div class="rank-sorts">' + sorts.map(function (s) { return '<button class="rank-sb' + (rankSort === s[0] ? " on" : "") + '" data-rsort="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>";
    var posF = [["all", "전체"], ["fw", "공격"], ["mf", "미드"], ["df", "수비"], ["gk", "GK"]];
    var posUi = '<div class="rank-pos">' + posF.map(function (s) { return '<button class="rank-pb' + (rankPos === s[0] ? " on" : "") + '" data-rpos="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>";
    var more = (list.length > rankLimit) ? '<button class="rank-more">더보기 (' + (list.length - rankLimit) + "명)</button>" : "";
    wrap.innerHTML = '<div class="sec-h">⚡ 선수 랭킹</div>' + sortUi + posUi +
      '<div class="rank-list">' + shown.map(function (p, i) { return rankCard(p, i + 1); }).join("") + "</div>" + more;
    twem(wrap);  // 동적 렌더된 국기 이모지 → 트위모지 이미지 변환
  }

  function renderSearch(q) {
    backBtn.hidden = true;
    tabsEl.hidden = true;
    var nq = (q || "").trim().toLowerCase();

    // 검색어 없을 때: 최근 검색 + 등급별 둘러보기
    if (!nq) {
      var recent = recentGet();
      var html = "";
      if (recent.length) {
        html += '<div class="sec-h">최근 검색</div><div class="chips">';
        recent.forEach(function (r) { html += '<button class="chip rchip" data-q="' + esc(r) + '">' + esc(r) + "</button>"; });
        html += "</div>";
      }
      html += '<div class="rank-wrap"></div>';
      // 등급별 둘러보기 (보조)
      var grades = ["월드클래스", "주전급", "로테이션", "유망주"];
      var counts = {};
      DATA.players.forEach(function (p) { counts[p.grade] = (counts[p.grade] || 0) + 1; });
      html += '<div class="sec-h">등급별 둘러보기</div><div class="grade-browse">';
      grades.forEach(function (g) {
        if (!counts[g]) return;
        html += '<button class="grade-row" data-grade="' + esc(g) + '">' +
          '<span class="badge ' + gradeClass(g) + '">' + esc(g) + "</span>" +
          '<span class="grade-count">' + counts[g] + "명 →</span></button>";
      });
      html += "</div>";
      viewEl.innerHTML = html;
      paintRanking();
      if (window.KickComments && KickComments.configured()) {
        KickComments.ready().then(function () { return KickComments.ratingStats(); }).then(function (m) {
          RANK_STATS = m || {};
          if (parseHash().name === "search" && !searchEl.value.trim()) paintRanking();
        }).catch(function () {});
      }
      return;
    }

    renderSearchResults(nq);
  }

  function renderSearchResults(nq) {
    var players = DATA.players.filter(function (p) {
      return [p.name, p.nameEn, p.team, p.club, p.league, p.position].join(" ").toLowerCase().indexOf(nq) !== -1;
    });
    var teams = DATA.teams.filter(function (t) {
      return [t.name, t.nameEn].join(" ").toLowerCase().indexOf(nq) !== -1;
    });
    var html = "";
    if (teams.length) {
      html += '<div class="sec-h">나라 · ' + teams.length + "</div><div class=\"grid\">";
      teams.forEach(function (t) {
        html += '<div class="team-card" data-team="' + esc(t.id) + '">' +
          '<span class="team-flag">' + esc(t.flag) + "</span>" +
          '<div><div class="team-name">' + esc(t.name) + "</div>" +
          '<div class="team-rank">FIFA ' + esc(t.fifaRank) + "위 · " + esc(t.group) + "조</div></div></div>";
      });
      html += "</div>";
    }
    html += '<div class="sec-h">선수 · ' + players.length + "</div>";
    if (players.length) {
      html += '<div class="grid">';
      players.sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
      players.forEach(function (p) { html += playerRow(p); });
      html += "</div>";
    } else {
      html += '<div class="empty">검색 결과가 없어요.<br>다른 이름이나 소속 클럽으로 찾아보세요.</div>';
    }
    viewEl.innerHTML = html;
  }

  function renderGradeList(grade) {
    backBtn.hidden = false;
    tabsEl.hidden = true;
    var list = DATA.players.filter(function (p) { return p.grade === grade; })
      .sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
    var html = '<div class="sec-h"><span class="badge ' + gradeClass(grade) + '">' + esc(grade) + "</span> " + list.length + "명</div><div class=\"grid\">";
    list.forEach(function (p) { html += playerRow(p); });
    html += "</div>";
    viewEl.innerHTML = html;
  }

  // ===================== 선수 상세 =====================
  function idxRow(label, val) {
    var v = Math.max(0, Math.min(100, val || 0));
    return '<div class="idx-row"><span class="idx-k">' + esc(label) + "</span>" +
      '<span class="idx-track"><span class="idx-fill" style="width:' + v + '%"></span></span>' +
      '<span class="idx-v">' + v + "</span></div>";
  }

  // 선수 평점(별점) 위젯 — 상세 페이지의 .rate-slot 에 마운트
  function renderRating(pid) {
    var slot = viewEl.querySelector(".rate-slot");
    if (!slot || !window.KickComments || !KickComments.configured()) return;
    KickComments.ready().then(function () { return KickComments.playerRating(pid); }).then(function (r) {
      var h = parseHash();
      if (h.name !== "player" || h.id !== pid) return;
      paintRating(slot, pid, r);
    }).catch(function () {});
  }
  function paintRating(slot, pid, r) {
    var mine = r.mine || 0, stars = "";
    for (var i = 1; i <= 5; i++) stars += '<button class="rate-star' + (i <= mine ? " on" : "") + '" data-pid="' + esc(pid) + '" data-s="' + i + '" aria-label="' + i + '점">★</button>';
    var avg = r.cnt ? "⭐ " + r.avg.toFixed(1) + " · " + r.cnt + "명 평가" : "아직 평점이 없어요 — 첫 평가를 남겨보세요!";
    slot.innerHTML = '<div class="block rate-box"><h3>선수 평점 <span class="muted-note">유저 평가</span></h3>' +
      '<div class="rate-stars">' + stars + "</div>" +
      '<div class="rate-avg">' + avg + (mine ? ' · 내 평점 ' + mine + "★" : "") + "</div></div>";
    twem(slot);
  }

  function renderPlayer(id) {
    var p = playersById[id];
    if (!p) { viewEl.innerHTML = '<div class="empty">선수를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false;
    tabsEl.hidden = true;

    var ovr = p.ovr || 0;
    var team = teamsById[teamIdByName(p.team)];

    var facts = [
      ["포지션", posKo(p.position)],
      ["나이", (p.age != null ? p.age + "세" : "-")],
      ["대표팀", (p.caps != null ? p.caps + "경기 · " + (p.intlGoals != null ? p.intlGoals : 0) + "골" : "-")],
    ];
    var factsHtml = facts.map(function (f) {
      return '<div class="fact"><div class="k">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + "</div></div>";
    }).join("");

    // 스카우터 지수(있으면 3축, 없으면 단일 등급 점수 바)
    var scoutHtml;
    if (p.scout && (p.scout.value != null || p.scout.fame != null || p.scout.skill != null)) {
      scoutHtml = '<div class="block"><h3>스카우터 지수 <span class="muted-note">자체 평가</span></h3>' +
        idxRow("가치", p.scout.value) + idxRow("유명도", p.scout.fame) + idxRow("실력", p.scout.skill) + "</div>";
    } else {
      scoutHtml = '<div class="block"><h3>등급 점수 <span class="muted-note">자체 평가</span></h3>' +
        '<div class="score-bar"><div class="score-fill" style="width:' + ovr + '%"></div></div></div>';
    }

    var strengths = (p.strengths || []).map(function (s) { return '<span class="tag">' + esc(s) + "</span>"; }).join("");
    var weaknesses = (p.weaknesses || []).map(function (s) { return '<span class="tag weak">' + esc(s) + "</span>"; }).join("");

    // 커리어 타임라인: honours + 이적 (연도 추출 가능하면 표시)
    var tlItems = [];
    (p.honours || []).forEach(function (h) { tlItems.push(h); });
    if (p.notableTransfer) tlItems.push(p.notableTransfer);
    var timeline = tlItems.map(function (it) {
      var ym = /(\d{4})/.exec(it);
      var yr = ym ? ym[1] : "";
      return '<div class="tl-item"><span class="tl-year">' + esc(yr) + '</span><span class="tl-dot"></span>' +
        '<span class="tl-text">' + esc(it) + "</span></div>";
    }).join("");

    viewEl.innerHTML =
      '<div class="detail">' +
        '<div class="pl-hero">' +
          posBadge(p, true) +
          '<div class="pl-meta"><div class="pl-sub">' + esc(p.club) + " · " + esc(p.league) + "</div>" +
            '<div class="pl-name">' + esc(p.name) + "</div>" +
            '<div class="detail-name-en">' + esc(p.nameEn) + "</div>" +
            '<div class="pl-badges">' + badge(p) + "</div></div>" +
          '<div class="ovr"><span class="ovr-l">OVR</span><span class="ovr-v">' + ovr + "</span></div>" +
        "</div>" +
        '<div class="quote">' + esc(p.oneLiner) + "</div>" +
        '<div class="facts">' + factsHtml + "</div>" +
        scoutHtml +
        '<div class="rate-slot" data-pid="' + esc(p.id) + '"></div>' +
        '<div class="sw">' +
          '<div class="swbox pos"><h4>강점</h4><div class="tags">' + (strengths || '<span class="tag">-</span>') + "</div></div>" +
          '<div class="swbox neg"><h4>약점</h4><div class="tags">' + (weaknesses || '<span class="tag weak">-</span>') + "</div></div>" +
        "</div>" +
        (timeline ? '<div class="block"><h3>커리어</h3><div class="tl">' + timeline + "</div></div>" : "") +
        '<div class="block"><h3>이적</h3><div class="transfer">' + esc(p.notableTransfer || "-") + "</div></div>" +
        (team ? '<div class="team-link" data-team="' + esc(team.id) + '">' + esc(team.flag) + " " + esc(team.name) + " 전력 보기 →</div>" : "") +
      "</div>";
  }

  function teamIdByName(name) {
    var found = DATA.teams.filter(function (t) { return t.name === name; })[0];
    return found ? found.id : null;
  }

  // ===================== 나라 상세 =====================
  function renderTeam(id) {
    var t = teamsById[id];
    if (!t) { viewEl.innerHTML = '<div class="empty">팀을 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false;
    tabsEl.hidden = true;

    // 주 정렬: 포메이션 순서(공격→미드→수비→GK), 같은 포지션 안에서는 점수 높은순.
    // 점수(ovr)는 정렬용으로 쓰되 나라상세 배지에는 노출하지 않는다.
    var roster = DATA.players.filter(function (p) { return p.team === t.name; })
      .sort(function (a, b) {
        var ra = posRank(a), rb = posRank(b);
        if (ra !== rb) return ra - rb;
        return (b.ovr || 0) - (a.ovr || 0);
      });

    // 컨트리 히어로
    var html = '<div class="detail">' +
      '<div class="country-hero">' +
        '<div class="ch-grid"></div>' +
        '<span class="team-flag lg">' + esc(t.flag) + "</span>" +
        '<div class="ch-meta"><h2>' + esc(t.name) + "</h2>" +
        '<div class="team-rank">FIFA 랭킹 ' + esc(t.fifaRank) + "위 · " + esc(t.group) + "조</div>" +
        (t.lastWc ? '<div class="team-wc">🏆 ' + (t.lastWc.inLast2022
          ? "직전 월드컵 2022 · " + esc(t.lastWc.stage)
          : (t.lastWc.year ? "최근 월드컵 " + esc(t.lastWc.year) + " · " + esc(t.lastWc.stage) : "2026 첫 본선 진출")) + "</div>" : "") +
        "</div>" +
      "</div>" +
      '<div class="quote">' + esc(t.tierSummary) + "</div>";

    // 최신 뉴스 (있으면)
    if (t.news && t.news.length) {
      var kn = t.news.slice().sort(function (a, b) { return (isKoreanSrc(a) ? 0 : 1) - (isKoreanSrc(b) ? 0 : 1); }).slice(0, 8);
      var moreN = kn.length - 3;
      html += '<div class="block"><h3>최신 뉴스</h3><div class="news-list' + (moreN > 0 ? " news-collapsed" : "") + '">';
      kn.forEach(function (nw) {
        var meta = [nw.source, nw.date].filter(Boolean).map(esc).join(" · ");
        var tag = nw.url ? "a" : "div";
        var foot = meta + (nw.url ? (meta ? " · " : "") + "원문 보기 ↗" : "");
        html += "<" + tag + ' class="news-item' + (nw.url ? " ext" : "") + '"' +
          (nw.url ? ' href="' + esc(nw.url) + '" target="_blank" rel="noopener"' : "") + ">" +
          '<div class="news-title">' + esc(nw.title) + "</div>" +
          (nw.summary ? '<div class="news-sum"><span class="ai-tag">AI 요약</span>' + esc(nw.summary) + "</div>" : "") +
          (foot ? '<div class="news-meta">' + foot + "</div>" : "") +
          "</" + tag + ">";
      });
      html += "</div>" + (moreN > 0 ? '<button class="more-btn" data-expand="news">뉴스 더보기 (' + moreN + '개)</button>' : "") + "</div>";
    }

    // 전력 지표 (있으면)
    if (t.indices) {
      html += '<div class="block"><h3>전력 지표 <span class="muted-note">자체 평가</span></h3>' +
        idxRow("공격력", t.indices.attack) + idxRow("수비력", t.indices.defense) +
        idxRow("조직력", t.indices.organization) + idxRow("경험치", t.indices.experience) + "</div>";
    }

    // 플레이 스타일
    if (t.styleSummary && t.styleSummary.length) {
      html += '<div class="block"><h3>플레이 스타일</h3><div class="chips">';
      t.styleSummary.forEach(function (s, i) {
        html += '<span class="chip' + (i === 0 ? " solid" : "") + '">' + esc(s) + "</span>";
      });
      html += "</div></div>";
    }

    // 예상 포메이션 피치 (있으면)
    if (t.lineup && t.lineup.length) {
      html += '<div class="block"><h3>예상 포메이션' + (t.formation ? ' <span class="muted-note">' + esc(t.formation) + "</span>" : "") + "</h3>" +
        '<div class="pitch"><div class="pitch-line halfway"></div><div class="pitch-circle"></div>';
      t.lineup.forEach(function (d) {
        // 이름·등번호·포지션은 선수 레코드(단일 소스)에서 조회. 라인업은 좌표(x,y)만 담당.
        var pl = d.playerId ? playersById[d.playerId] : null;
        var pos = (pl && pl.position) || d.pos;
        var pc = posClass(pos);
        var num = (pl && pl.number != null) ? pl.number : (d.number != null ? d.number : "");
        var nm = (pl && pl.name) || d.name || "";
        var x = Math.max(4, Math.min(96, d.x || 50));
        var y = Math.max(4, Math.min(96, d.y || 50));
        var pdAttr = pl ? ' data-player="' + esc(d.playerId) + '"' : "";
        html += '<div class="pd ' + pc + (pl ? " tappable" : "") + '"' + pdAttr + ' style="left:' + x + "%;top:" + y + '%" title="' + esc(nm) + '">' +
          '<span class="pd-dot">' + esc(num) + "</span>" +
          '<span class="pd-name">' + esc(nm.split(" ").slice(-1)[0]) + "</span></div>";
      });
      html += "</div></div>";
    }

    // 핵심 선수 가로 카드
    var coreIds = (t.keyPlayerIds || []).filter(function (pid) { return playersById[pid]; });
    if (coreIds.length) {
      html += '<div class="block"><h3>핵심 선수</h3><div class="core-scroll">';
      coreIds.forEach(function (pid) {
        var p = playersById[pid];
        html += '<div class="corecard" data-player="' + esc(p.id) + '">' +
          posBadge(p) +
          '<div class="cc-name">' + esc(p.name) + "</div>" +
          '<div class="cc-club">' + esc(p.club) + "</div>" +
          '<span class="badge ' + gradeClass(p.grade) + '">' + esc(p.grade) + "</span></div>";
      });
      html += "</div></div>";
    }

    // 감독 (있으면) — 탭하면 감독 상세 페이지
    if (t.manager && t.manager.name) {
      html += '<div class="block"><h3>감독</h3><div class="manager" data-manager="' + esc(t.id) + '"><span class="posb mgr">감독</span><div class="mgr-main"><div class="mgr-name">' + esc(t.manager.name) +
        (t.manager.nationality ? ' <span class="mgr-nat">' + esc(t.manager.nationality) + "</span>" : "") + "</div>" +
        (t.manager.note ? '<div class="mgr-note">' + esc(t.manager.note) + "</div>" : "") + '</div><span class="mgr-chev">›</span></div></div>';
    }

    html += "</div>";

    // 전체 선수단
    var rosterHtml = roster.length
      ? '<div class="grid">' + roster.map(function (p) { return playerRow(p, true); }).join("") + "</div>"
      : '<div class="empty">선수 데이터를 채우는 중입니다.</div>';
    html += '<div class="sec-h">전체 선수단 · ' + roster.length + "명</div>" + rosterHtml;

    viewEl.innerHTML = html;
  }

  // ===================== 경기 예상 (매치업) =====================
  function teamPower(t) {
    var i = t.indices || {};
    var vals = [i.attack, i.defense, i.organization, i.experience].filter(function (v) { return typeof v === "number"; });
    if (vals.length) return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return t.fifaRank ? Math.max(45, 92 - t.fifaRank * 0.4) : 55; // 폴백: FIFA 랭킹
  }
  function predict(a, b) {
    var pa = teamPower(a), pb = teamPower(b), diff = pa - pb;
    var ea = 1 / (1 + Math.pow(10, -diff / 16)); // a의 상대 우위(0~1)
    var draw = 0.30 * (1 - Math.min(1, Math.abs(diff) / 35));
    var winA = ea * (1 - draw), winB = (1 - ea) * (1 - draw);
    var s = winA + winB + draw; winA /= s; winB /= s; draw /= s;
    var ga = Math.max(0, Math.round(1.35 + diff / 22));
    var gb = Math.max(0, Math.round(1.35 - diff / 22));
    return {
      winA: Math.round(winA * 100), draw: Math.round(draw * 100), winB: Math.round(winB * 100),
      ga: ga, gb: gb, pa: Math.round(pa), pb: Math.round(pb),
    };
  }
  function cmpRow(label, va, vb) {
    va = va || 0; vb = vb || 0;
    return '<div class="cmp-row"><span class="cmp-v' + (va >= vb ? " hi" : "") + '">' + va + "</span>" +
      '<span class="cmp-k">' + esc(label) + "</span>" +
      '<span class="cmp-v' + (vb >= va ? " hi" : "") + '">' + vb + "</span></div>";
  }

  function newsItemHtml(nw) {
    var meta = [nw.source, nw.date].filter(Boolean).map(esc).join(" · ");
    var tag = nw.url ? "a" : "div";
    var foot = meta + (nw.url ? (meta ? " · " : "") + "원문 보기 ↗" : "");
    return "<" + tag + ' class="news-item' + (nw.url ? " ext" : "") + '"' +
      (nw.url ? ' href="' + esc(nw.url) + '" target="_blank" rel="noopener"' : "") + ">" +
      '<div class="news-title">' + esc(nw.title) + "</div>" +
      (nw.summary ? '<div class="news-sum"><span class="ai-tag">AI 요약</span>' + esc(nw.summary) + "</div>" : "") +
      (foot ? '<div class="news-meta">' + foot + "</div>" : "") +
      "</" + tag + ">";
  }
  function matchNews(team, max) {
    if (!team || !team.news || !team.news.length) return "";
    var kn = team.news.slice().sort(function (a, b) { return (isKoreanSrc(a) ? 0 : 1) - (isKoreanSrc(b) ? 0 : 1); }).slice(0, max || 3);
    return '<div class="mn-team"><div class="mn-h"><span class="mn-flag">' + esc(team.flag) + "</span>" + esc(team.name) + " 주요 소식</div>" +
      '<div class="news-list">' + kn.map(newsItemHtml).join("") + "</div></div>";
  }
  function renderMatch(id) {
    var fx = fixturesById[id];
    if (!fx) { viewEl.innerHTML = '<div class="empty">경기를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false; tabsEl.hidden = true;
    var a = teamsById[fx.homeId], b = teamsById[fx.awayId];
    var when = fmtDate(fxDate(fx)).d + (fxTime(fx) ? " " + esc(fxTime(fx)) : "");
    var where = [fx.venue, fx.city, hostCountry(fx)].filter(Boolean).map(esc).join(" · ");
    var top = (fx.group ? esc(fx.group) + "조" : esc(fx.stage || "")) + " · " + when + (where ? " · " + where : "");

    // 한쪽만 정해진 경우(토너먼트 미정 등)
    if (!a || !b) {
      var known = a || b;
      viewEl.innerHTML = '<div class="detail"><div class="match-meta-top">' + top + "</div>" +
        '<div class="empty">아직 양 팀이 확정되지 않은 경기예요.' +
        (known ? '<br><br><button class="mbtn" data-team="' + esc(known.id) + '">' + esc(known.flag) + " " + esc(known.name) + ' 전력 보기</button>' : "") +
        "</div></div>";
      return;
    }

    var pr = predict(a, b);
    var ia = a.indices || {}, ib = b.indices || {};
    var cmp = cmpRow("공격력", ia.attack, ib.attack) + cmpRow("수비력", ia.defense, ib.defense) +
      cmpRow("조직력", ia.organization, ib.organization) + cmpRow("경험치", ia.experience, ib.experience) +
      cmpRow("종합", pr.pa, pr.pb);
    var pv = fx.preview, previewHtml = "";
    if (pv) {
      var wpts = (pv.watchPoints || []).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");
      var strat = (pv.homeStrategy ? '<div class="strat-box"><div class="strat-team">' + esc(a.name) + '</div><div class="strat-txt">' + esc(pv.homeStrategy) + "</div></div>" : "") +
        (pv.awayStrategy ? '<div class="strat-box"><div class="strat-team">' + esc(b.name) + '</div><div class="strat-txt">' + esc(pv.awayStrategy) + "</div></div>" : "");
      previewHtml = (wpts ? '<div class="block"><h3>관전 포인트</h3><ul class="watch-list">' + wpts + "</ul></div>" : "") +
        (strat ? '<div class="block"><h3>예상 전략</h3><div class="strat">' + strat + "</div></div>" : "");
    }

    viewEl.innerHTML =
      '<div class="detail match-view">' +
        '<div class="var-title"><span class="var-tag">VAR</span> 경기 분석</div>' +
        '<div class="match-meta-top">' + top + "</div>" +
        '<div class="vs-head">' +
          '<div class="vs-team" data-team="' + esc(a.id) + '"><span class="vs-flag">' + esc(a.flag) + "</span>" +
            '<span class="vs-name">' + esc(a.name) + '</span><span class="vs-rank">FIFA ' + esc(a.fifaRank) + "위</span></div>" +
          '<div class="vs-center"><div class="vs-x">VS</div></div>' +
          '<div class="vs-team" data-team="' + esc(b.id) + '"><span class="vs-flag">' + esc(b.flag) + "</span>" +
            '<span class="vs-name">' + esc(b.name) + '</span><span class="vs-rank">FIFA ' + esc(b.fifaRank) + "위</span></div>" +
        "</div>" +
        '<div class="block h2h-slot"></div>' +
        '<div class="block"><h3>승부 예상</h3>' +
          '<div class="prob">' +
            '<div class="prob-seg a" style="width:' + pr.winA + '%">' + (pr.winA >= 12 ? pr.winA + "%" : "") + "</div>" +
            '<div class="prob-seg d" style="width:' + pr.draw + '%">' + (pr.draw >= 12 ? pr.draw + "%" : "") + "</div>" +
            '<div class="prob-seg b" style="width:' + pr.winB + '%">' + (pr.winB >= 12 ? pr.winB + "%" : "") + "</div>" +
          "</div>" +
          '<div class="prob-legend"><span>' + esc(a.name) + " 승</span><span>무</span><span>" + esc(b.name) + " 승</span></div>" +
        "</div>" +
        '<div class="block"><h3>전력 비교</h3>' + cmp + "</div>" +
        previewHtml +
        '<div class="cmt-slot"></div>' +
        ((a.news && a.news.length) || (b.news && b.news.length) ?
          '<div class="block"><h3>📰 주요 뉴스</h3>' + matchNews(a, 3) + matchNews(b, 3) + "</div>" : "") +
        '<div class="match-cta">' +
          '<button class="mbtn" data-team="' + esc(a.id) + '">' + esc(a.flag) + " " + esc(a.name) + " 분석</button>" +
          '<button class="mbtn" data-team="' + esc(b.id) + '">' + esc(b.flag) + " " + esc(b.name) + " 분석</button>" +
        "</div>" +
      "</div>";
    loadH2H(viewEl.querySelector(".h2h-slot"), fx, a, b);
  }

  // ===================== 감독 상세 =====================
  function renderManager(teamId) {
    var t = teamsById[teamId];
    var m = t && t.manager;
    if (!t || !m || !m.name) { viewEl.innerHTML = '<div class="empty">감독 정보를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false; tabsEl.hidden = true;

    var facts = [];
    if (m.nationality) facts.push(["국적", m.nationality]);
    if (m.age != null) facts.push(["나이", m.age + "세"]);
    facts.push(["현 소속", t.flag + " " + t.name + " 대표팀" + (m.currentSince ? " (" + m.currentSince + "~)" : "")]);
    var factsHtml = facts.map(function (f) {
      return '<div class="fact"><div class="k">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + "</div></div>";
    }).join("");

    var career = (m.career || []).map(function (c) {
      return '<div class="tl-item"><span class="tl-year">' + esc(c.period || "") + '</span><span class="tl-dot"></span>' +
        '<span class="tl-text">' + esc(c.team || "") + (c.note ? ' <span class="muted-note">' + esc(c.note) + "</span>" : "") + "</span></div>";
    }).join("");
    var honours = (m.honours || []).map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("");
    var careerHtml = career
      ? '<div class="block"><h3>지도자 커리어 <span class="muted-note">맡은 팀</span></h3><div class="tl">' + career + "</div></div>"
      : '<div class="block"><h3>지도자 커리어</h3><div class="transfer">상세 이력 수집 중입니다.</div></div>';

    viewEl.innerHTML =
      '<div class="detail">' +
        '<div class="pl-hero"><span class="posb mgr lg">감독</span>' +
          '<div class="pl-meta"><div class="pl-sub">감독 · ' + esc(t.name) + " 대표팀</div>" +
          '<div class="pl-name">' + esc(m.name) + "</div>" +
          (m.nationality ? '<div class="detail-name-en">' + esc(m.nationality) + "</div>" : "") + "</div></div>" +
        (m.note ? '<div class="quote">' + esc(m.note) + "</div>" : "") +
        '<div class="facts">' + factsHtml + "</div>" +
        careerHtml +
        (honours ? '<div class="block"><h3>주요 우승·수상</h3><ul class="honours">' + honours + "</ul></div>" : "") +
        (m.playerCareer ? '<div class="block"><h3>선수 시절</h3><div class="transfer">' + esc(m.playerCareer) + "</div></div>" : "") +
        '<div class="team-link" data-team="' + esc(t.id) + '">' + esc(t.flag) + " " + esc(t.name) + " 전력 보기 →</div>" +
      "</div>";
  }

  // ===================== 라이브 경기 (ESPN 공개 API · 분단위 폴링, 백엔드/키 불필요) =====================
  var LIVE = {};            // fixtureId -> {state:'in'|'post', clock, hs, as, events}
  var liveTimer = null;
  var ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  // ESPN 표기 → 앱 팀 id 보정(슬러그가 안 맞는 케이스만)
  var ESPN_ALIAS = {
    "czechia": "czech-republic", "turkiye": "turkey", "cabo-verde": "cape-verde",
    "cote-divoire": "ivory-coast", "cotedivoire": "ivory-coast",
    "usa": "united-states", "korea-republic": "south-korea",
    "congo-dr": "dr-congo", "bosnia-herzegovina": "bosnia-and-herzegovina"
  };
  function espnSlug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/['.]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function espnTeamId(name) {
    var s = espnSlug(name); s = ESPN_ALIAS[s] || s;
    return teamsById[s] ? s : null;
  }
  var fixByPair = {};
  (DATA.fixtures || []).forEach(function (f) {
    if (f.homeId && f.awayId) fixByPair[[f.homeId, f.awayId].sort().join("|")] = f.id;
  });
  function parseGoals(c) {
    var out = [];
    (c.details || []).forEach(function (d) {
      var txt = (d.type && d.type.text) || "";
      var isGoal = d.scoringPlay === true || (/goal/i.test(txt) && !/disallow|own goal/i.test(txt));
      if (!isGoal) return;
      var who = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || "";
      out.push({ who: who, clk: (d.clock && d.clock.displayValue) || "" });
    });
    return out;
  }
  function applyEspn(d) {
    var changed = false, anyLive = false, anyToday = false;
    (d.events || []).forEach(function (e) {
      var c = (e.competitions || [])[0]; if (!c) return;
      var comp = c.competitors || [];
      var H = comp.filter(function (t) { return t.homeAway === "home"; })[0] || comp[0];
      var A = comp.filter(function (t) { return t.homeAway === "away"; })[0] || comp[1];
      if (!H || !A) return;
      var hid = espnTeamId(H.team && H.team.displayName), aid = espnTeamId(A.team && A.team.displayName);
      if (!hid || !aid) return;
      var fid = fixByPair[[hid, aid].sort().join("|")]; if (!fid) return;
      var fx = fixturesById[fid]; if (!fx) return;
      var st = (e.status && e.status.type) || {}; var state = st.state;
      if (state === "in") anyLive = true;
      if (state === "in" || state === "post" || state === "pre") anyToday = true;
      if (state === "pre") { if (LIVE[fid]) { delete LIVE[fid]; changed = true; } return; }
      var hs = +H.score, as = +A.score;
      var rec = {
        state: state, clock: (e.status && e.status.displayClock) || "",
        hs: (fx.homeId === hid) ? hs : as, as: (fx.homeId === hid) ? as : hs,
        events: parseGoals(c)
      };
      if (JSON.stringify(LIVE[fid]) !== JSON.stringify(rec)) { LIVE[fid] = rec; changed = true; }
    });
    return { changed: changed, anyLive: anyLive, anyToday: anyToday };
  }
  function onHomeSchedule() {
    return parseHash().name === "home" && !searchEl.value.trim() && homeTab === "schedule";
  }
  function scheduleLive(delay) {
    if (liveTimer) clearTimeout(liveTimer);
    if (delay) liveTimer = setTimeout(fetchLive, delay);
  }
  function fetchLive() {
    if (!window.fetch) return;
    fetch(ESPN_URL, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var res = applyEspn(d);
      if (res.changed && onHomeSchedule()) renderSchedule();
      if (parseHash().name === "home" && homeTab === "groups" && !searchEl.value.trim()) fetchStandings(true);
      scheduleLive(res.anyLive ? 60000 : (res.anyToday ? 180000 : 0));  // 라이브 60초 / 임박 3분 / 없으면 중단
    }).catch(function () { scheduleLive(180000); });
  }

  // ===================== 조별 순위표 (ESPN standings · 실시간) =====================
  var STAND = {};            // teamId -> {p,w,d,l,gf,ga,gd,pts}
  var standAt = 0;
  var ESPN_STAND_URL = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
  function statVal(stats, type) {
    for (var i = 0; i < (stats || []).length; i++) if (stats[i].type === type) return +stats[i].value || 0;
    return 0;
  }
  function fetchStandings(force) {
    if (!window.fetch) return;
    if (!force && Date.now() - standAt < 60000 && Object.keys(STAND).length) return;  // 60초 캐시
    fetch(ESPN_STAND_URL, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      (d.children || []).forEach(function (g) {
        (((g.standings || {}).entries) || []).forEach(function (e) {
          var id = espnTeamId(e.team && e.team.displayName); if (!id) return;
          var s = e.stats || [];
          STAND[id] = {
            p: statVal(s, "gamesplayed"), w: statVal(s, "wins"), d: statVal(s, "ties"), l: statVal(s, "losses"),
            gf: statVal(s, "pointsfor"), ga: statVal(s, "pointsagainst"),
            gd: statVal(s, "pointdifferential"), pts: statVal(s, "points")
          };
        });
      });
      standAt = Date.now();
      if (parseHash().name === "home" && homeTab === "groups" && !searchEl.value.trim()) renderGroups();
    }).catch(function () {});
  }

  // ===================== 역대 상대전적(H2H) — ESPN 경기상세(실시간, 사전수집 0) =====================
  var ESPN_SUM = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=";
  var espnIdCache = {};
  function resolveEspnId(fx) {
    if (espnIdCache[fx.id] !== undefined) return Promise.resolve(espnIdCache[fx.id]);
    var dt = (fx.date || "").replace(/-/g, "");
    if (!dt || !window.fetch) return Promise.resolve(null);
    var key = [fx.homeId, fx.awayId].sort().join("|");
    return fetch(ESPN_URL + "?dates=" + dt, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var found = null;
      (d.events || []).forEach(function (e) {
        var c = (e.competitions || [])[0]; if (!c) return;
        var comp = c.competitors || [];
        var H = comp.filter(function (t) { return t.homeAway === "home"; })[0] || comp[0];
        var A = comp.filter(function (t) { return t.homeAway === "away"; })[0] || comp[1];
        if (!H || !A) return;
        var hid = espnTeamId(H.team && H.team.displayName), aid = espnTeamId(A.team && A.team.displayName);
        if (hid && aid && [hid, aid].sort().join("|") === key) found = e.id;
      });
      espnIdCache[fx.id] = found;
      return found;
    }).catch(function () { return null; });
  }
  function loadH2H(slot, fx, a, b) {
    if (!slot || !window.fetch) return;
    slot.innerHTML = '<h3>역대 상대전적</h3><div class="h2h-loading">불러오는 중…</div>';
    resolveEspnId(fx).then(function (eid) {
      if (!eid) { slot.style.display = "none"; return; }
      return fetch(ESPN_SUM + eid, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) { renderH2H(slot, d, fx, a, b); });
    }).catch(function () { slot.style.display = "none"; });
  }
  function compLabel(e) {
    var ln = e.leagueName || e.competitionName || "";
    var M = [[/world cup qualif/i, "월드컵 예선"], [/world cup/i, "월드컵"], [/friendly/i, "친선"],
      [/asian cup qualif/i, "아시안컵 예선"], [/asian cup/i, "아시안컵"], [/gold cup/i, "골드컵"],
      [/copa am/i, "코파 아메리카"], [/(euro|european champ).*qualif/i, "유로 예선"], [/euro|european champ/i, "유로"],
      [/confederations/i, "컨페드컵"], [/nations league/i, "네이션스리그"], [/olympic/i, "올림픽"], [/africa.*cup|afcon/i, "네이션스컵"]];
    for (var i = 0; i < M.length; i++) if (M[i][0].test(ln)) return M[i][1];
    return ln || "기타";
  }
  function roundLabel(rn) {
    var s = String(rn || "");
    var M = [[/group/i, "조별리그"], [/round of 32|last 32/i, "32강"], [/round of 16|last 16/i, "16강"],
      [/quarter/i, "8강"], [/semi/i, "4강"], [/third|3rd/i, "3·4위전"], [/final/i, "결승"]];
    for (var i = 0; i < M.length; i++) if (M[i][0].test(s)) return M[i][1];
    return "";
  }
  function renderH2H(slot, d, fx, a, b) {
    var blk = (d.headToHeadGames || [])[0];
    if (!blk || !(blk.events || []).length) { slot.style.display = "none"; return; }
    var blkAppId = espnTeamId(blk.team && blk.team.displayName);
    // 대한민국이 낀 경기는 홈/원정 무관 '대한민국 기준', 그 외엔 홈팀 기준
    var perspId = (fx.homeId === "south-korea" || fx.awayId === "south-korea") ? "south-korea" : fx.homeId;
    var perspName = (perspId === fx.awayId) ? b.name : a.name;
    var oppName = (perspName === a.name) ? b.name : a.name;
    var blockIsPersp = (blkAppId === perspId);
    var w = 0, dr = 0, l = 0, rows = "";
    blk.events.forEach(function (e) {
      var H = parseInt(e.homeTeamScore, 10), A = parseInt(e.awayTeamScore, 10);
      var blockHome = e.atVs !== "@";
      var bs = blockHome ? H : A, os = blockHome ? A : H;
      var gr = e.gameResult;  // 블록팀 기준 W/L/D (ESPN 권위 데이터)
      var pScore, pOpp, res;
      if (blockIsPersp) { pScore = bs; pOpp = os; res = gr; }
      else { pScore = os; pOpp = bs; res = (gr === "W" ? "L" : gr === "L" ? "W" : "D"); }
      if (res === "W") w++; else if (res === "L") l++; else dr++;
      var rk = res === "W" ? "win" : res === "L" ? "lose" : "draw";
      var rl = res === "W" ? "승" : res === "L" ? "패" : "무";
      var sc = (isNaN(pScore) ? "-" : pScore) + " : " + (isNaN(pOpp) ? "-" : pOpp);
      var cmp = compLabel(e), rnd = roundLabel(e.roundName);
      var meta = (e.gameDate || "").slice(0, 4) + " · " + cmp + (rnd && cmp !== "친선" ? " " + rnd : "");
      rows += '<div class="h2h-row"><span class="h2h-res ' + rk + '">' + rl + "</span>" +
        '<div class="h2h-line"><span class="h2h-score"><b>' + esc(perspName) + "</b> " + sc + " " + esc(oppName) + "</span>" +
        '<span class="h2h-meta">' + esc(meta) + "</span></div></div>";
    });
    slot.style.display = "";
    slot.innerHTML = '<h3>최근 상대전적 <span class="muted-note">최근 ' + blk.events.length + "경기 · " + esc(perspName) + " 기준 " + w + "승 " + dr + "무 " + l + "패</span></h3>" +
      '<div class="h2h-list">' + rows + "</div>";
  }

  // ===================== 라우터 =====================
  function setTabbar(active) {
    if (!tabbarEl) return;
    Array.prototype.forEach.call(tabbarEl.querySelectorAll(".tabbar-btn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-nav") === active);
    });
  }

  function mountCmt(key, container) { if (window.KickComments) { try { window.KickComments.mount(container || viewEl, key); } catch (e) {} } }

  // ===================== 마이페이지(MY 탭) =====================
  var myTab = "mine", myCache = null;
  function threadInfo(key) {
    var parts = String(key || "").split(":"), kind = parts[0], id = parts.slice(1).join(":");
    if (kind === "player") { var p = playersById[id]; return { label: "👤 " + (p ? p.name : "선수"), hash: "player/" + id }; }
    if (kind === "team") { var t = teamsById[id]; return { label: (t ? t.flag + " " : "") + (t ? t.name : "나라"), hash: "team/" + id }; }
    if (kind === "match") { var f = fixturesById[id]; return { label: "⚽ " + (f ? (f.homeName || "") + " vs " + (f.awayName || "") : "경기"), hash: "match/" + id }; }
    return { label: key, hash: "" };
  }
  function myItem(c) {
    var ti = threadInfo(c.thread_key);
    return '<div class="my-item"' + (ti.hash ? ' data-go="' + esc(ti.hash) + '"' : "") + ">" +
      '<div class="my-iw">' + esc(ti.label) + "</div>" +
      '<div class="my-ib">' + esc(c.body) + "</div></div>";
  }
  function paintMy() {
    if (!myCache) return;
    var nick = (window.KickComments && KickComments.nick()) || "익명";
    var av = window.KickComments && KickComments.avatar();
    var avH = av ? '<img class="my-av" src="' + esc(av) + '" alt="">' : '<span class="my-av ph">' + esc(nick.slice(0, 1)) + "</span>";
    var list = myTab === "mine" ? myCache.mine : myCache.tagged;
    var listH = list.length ? list.map(myItem).join("") : '<div class="empty">' + (myTab === "mine" ? "작성한 댓글이 없어요." : "나를 태그한 댓글이 없어요.") + "</div>";
    viewEl.innerHTML = '<div class="my">' +
      '<div class="my-profile">' + avH +
        '<div class="my-meta"><div class="my-nick">' + esc(nick) + "</div>" +
          '<button class="my-edit">닉네임 수정</button>' +
          ((window.KickComments && KickComments.isAdmin && KickComments.isAdmin()) ? ' <button class="my-admin">🛠 관리자</button>' : "") + "</div>" +
        '<button class="my-out">로그아웃</button></div>' +
      '<div class="my-editbox"></div>' +
      '<div class="my-tabs">' +
        '<button class="my-tabbtn' + (myTab === "mine" ? " on" : "") + '" data-mytab="mine">내가 쓴 댓글 ' + myCache.mine.length + "</button>" +
        '<button class="my-tabbtn' + (myTab === "tagged" ? " on" : "") + '" data-mytab="tagged">나를 태그한 댓글 ' + myCache.tagged.length + "</button></div>" +
      '<div class="my-list">' + listH + "</div></div>";
  }
  function renderMyLogin() {
    return KickComments.providers().then(function (P) {
      P = P || {};
      var btns = (P.google ? '<button class="my-in g" data-p="google">Google로 로그인</button>' : "") +
        (P.kakao ? '<button class="my-in kakao" data-p="kakao">카카오로 로그인</button>' : "");
      viewEl.innerHTML = '<div class="my-login"><div class="my-login-t">로그인하면 닉네임 설정 + 내 댓글·태그 모아보기를 쓸 수 있어요.</div>' + btns + "</div>";
    });
  }
  function renderMy() {
    backBtn.hidden = true; tabsEl.hidden = true;
    if (!window.KickComments || !KickComments.configured()) { viewEl.innerHTML = '<div class="empty">로그인 기능 준비 중입니다.</div>'; return; }
    viewEl.innerHTML = '<div class="empty">불러오는 중…</div>';
    KickComments.ready().then(function (user) {
      if (parseHash().name !== "my") return;
      if (!user) return renderMyLogin();
      Promise.all([KickComments.myComments(), KickComments.taggedComments()]).then(function (res) {
        if (parseHash().name !== "my") return;
        myCache = { mine: res[0] || [], tagged: res[1] || [] };
        paintMy();
      });
    });
  }

  // ===================== 관리자 페이지 (#admin) =====================
  var adminCache = null, adminTab = "reports", adminQ = "";
  function adminItem(c, extra) {
    var ti = threadInfo(c.thread_key);
    return '<div class="mgr-item' + (c.hidden ? " mgr-hidden" : "") + '">' +
      '<div class="mgr-iw">' + esc(ti.label) + " · " + esc(c.name || "익명") + (c.hidden ? ' <span class="mgr-badge">자동숨김</span>' : "") + "</div>" +
      '<div class="mgr-ib">' + esc(c.body) + "</div>" + (extra || "") +
      '<div class="mgr-act">' +
        (ti.hash ? '<button class="mgr-go" data-go="' + esc(ti.hash) + '">위치</button>' : "") +
        (c.hidden ? '<button class="mgr-unhide" data-cid="' + esc(c.id) + '">숨김해제</button>' : "") +
        '<button class="mgr-ban" data-uid="' + esc(c.user_id) + '">작성자 차단</button>' +
        '<button class="mgr-del" data-cid="' + esc(c.id) + '">댓글 삭제</button>' +
      "</div></div>";
  }
  function paintAdmin() {
    if (!adminCache) return;
    var html;
    if (adminTab === "reports") {
      html = adminCache.reports.length ? adminCache.reports.map(function (rp) {
        var c = rp.comments;
        var ign = '<button class="mgr-ign" data-rid="' + esc(rp.id) + '">신고 무시</button>';
        if (!c) return '<div class="mgr-item"><div class="mgr-ib">(삭제된 댓글) · 사유: ' + esc(rp.reason || "-") + '</div><div class="mgr-act">' + ign + "</div></div>";
        return adminItem(c, '<div class="mgr-reason">🚩 ' + esc(rp.reason || "(사유 없음)") + "</div>" + ign);
      }).join("") : '<div class="empty">신고된 댓글이 없습니다.</div>';
    } else {
      var cs = adminCache.comments;
      if (adminQ) { var q = adminQ.toLowerCase(); cs = cs.filter(function (c) { return (c.body || "").toLowerCase().indexOf(q) >= 0 || (c.name || "").toLowerCase().indexOf(q) >= 0; }); }
      html = cs.length ? cs.map(function (c) { return adminItem(c); }).join("") : '<div class="empty">댓글이 없습니다.</div>';
    }
    viewEl.innerHTML = '<div class="mgr"><h2 class="mgr-h">🛠 관리자</h2>' +
      '<div class="my-tabs">' +
        '<button class="mgr-tab my-tabbtn' + (adminTab === "reports" ? " on" : "") + '" data-adtab="reports">신고 내역 ' + adminCache.reports.length + "</button>" +
        '<button class="mgr-tab my-tabbtn' + (adminTab === "all" ? " on" : "") + '" data-adtab="all">전체 댓글 ' + adminCache.comments.length + "</button></div>" +
      (adminTab === "all" ? '<input class="mgr-search" placeholder="댓글·작성자 검색" value="' + esc(adminQ) + '">' : "") +
      '<div class="mgr-list">' + html + "</div></div>";
  }
  function renderAdmin() {
    backBtn.hidden = true; tabsEl.hidden = true;
    if (!window.KickComments || !KickComments.configured()) { viewEl.innerHTML = '<div class="empty">준비 중입니다.</div>'; return; }
    viewEl.innerHTML = '<div class="empty">불러오는 중…</div>';
    KickComments.ready().then(function () {
      if (parseHash().name !== "admin") return;
      if (!KickComments.isAdmin()) { viewEl.innerHTML = '<div class="empty">접근 권한이 없습니다.</div>'; return; }
      Promise.all([KickComments.listReports(), KickComments.listAllComments("")]).then(function (res) {
        if (parseHash().name !== "admin") return;
        adminCache = { reports: res[0] || [], comments: res[1] || [] };
        paintAdmin();
      });
    });
  }

  function route() {
    var r = parseHash();
    window.scrollTo(0, 0);
    if (r.name === "player") { setTabbar(""); renderPlayer(r.id); renderRating(r.id); mountCmt("player:" + r.id); return; }
    if (r.name === "team") { setTabbar(""); renderTeam(r.id); mountCmt("team:" + r.id); return; }
    if (r.name === "match") { setTabbar(""); renderMatch(r.id); mountCmt("match:" + r.id, viewEl.querySelector(".cmt-slot")); return; }
    if (r.name === "manager") { setTabbar(""); return renderManager(r.id); }
    if (r.name === "search") {
      setTabbar("search"); backBtn.hidden = true; tabsEl.hidden = true;
      return renderSearch(searchEl.value);
    }
    if (r.name === "saved") { setTabbar("saved"); return renderPlaceholder("저장", "찜한 선수·나라를 모아보는 공간 (준비 중)"); }
    if (r.name === "my") { setTabbar("my"); return renderMy(); }
    if (r.name === "admin") { setTabbar(""); return renderAdmin(); }
    // 홈
    setTabbar("home");
    if (searchEl.value.trim()) { tabsEl.hidden = true; return renderSearchResults(searchEl.value.trim().toLowerCase()); }
    return renderHome();
  }

  function renderPlaceholder(title, msg) {
    backBtn.hidden = true; tabsEl.hidden = true;
    viewEl.innerHTML = '<div class="empty"><div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px">' +
      esc(title) + "</div>" + esc(msg) + "</div>";
  }

  // ===================== 이벤트 =====================
  viewEl.addEventListener("input", function (e) {
    if (e.target.closest(".mgr-search") && adminCache) {
      adminQ = e.target.value;
      var q = adminQ.toLowerCase();
      var cs = adminCache.comments.filter(function (c) { return (c.body || "").toLowerCase().indexOf(q) >= 0 || (c.name || "").toLowerCase().indexOf(q) >= 0; });
      var le = viewEl.querySelector(".mgr-list");
      if (le) le.innerHTML = cs.length ? cs.map(function (c) { return adminItem(c); }).join("") : '<div class="empty">검색 결과가 없습니다.</div>';
    }
  });
  viewEl.addEventListener("click", function (e) {
    var my, ad;
    if ((my = e.target.closest(".my-admin"))) { go("admin"); return; }
    if ((my = e.target.closest(".rate-star"))) {
      if (!window.KickComments || !KickComments.user()) { alert("로그인 후 평점을 남길 수 있어요. (하단 MY 탭에서 로그인)"); return; }
      var rpid = my.getAttribute("data-pid"), rsc = parseInt(my.getAttribute("data-s"), 10);
      KickComments.ratePlayer(rpid, rsc).then(function () { renderRating(rpid); }).catch(function () {});
      return;
    }
    if ((my = e.target.closest(".rank-sb"))) { rankSort = my.getAttribute("data-rsort"); rankLimit = 30; paintRanking(); return; }
    if ((my = e.target.closest(".rank-pb"))) { rankPos = my.getAttribute("data-rpos"); rankLimit = 30; paintRanking(); return; }
    if (e.target.closest(".rank-more")) { rankLimit += 30; paintRanking(); return; }
    if ((ad = e.target.closest(".mgr-tab"))) { adminTab = ad.getAttribute("data-adtab"); paintAdmin(); return; }
    if ((ad = e.target.closest(".mgr-go"))) { go(ad.getAttribute("data-go")); return; }
    if ((ad = e.target.closest(".mgr-del"))) {
      if (!confirm("이 댓글을 삭제할까요? (관리자 강제삭제)")) return;
      ad.disabled = true; KickComments.adminDeleteComment(ad.getAttribute("data-cid")).then(function () { renderAdmin(); }); return;
    }
    if ((ad = e.target.closest(".mgr-ign"))) {
      ad.disabled = true; KickComments.ignoreReport(ad.getAttribute("data-rid")).then(function () { renderAdmin(); }); return;
    }
    if ((ad = e.target.closest(".mgr-ban"))) {
      if (!confirm("이 작성자를 차단할까요? (이후 댓글 작성 불가)")) return;
      ad.disabled = true; KickComments.banUser(ad.getAttribute("data-uid"), "관리자 차단").then(function () { alert("차단되었습니다."); renderAdmin(); }); return;
    }
    if ((ad = e.target.closest(".mgr-unhide"))) {
      ad.disabled = true; KickComments.unhideComment(ad.getAttribute("data-cid")).then(function () { renderAdmin(); }); return;
    }
    if ((my = e.target.closest(".my-in"))) { if (window.KickComments) KickComments.signIn(my.getAttribute("data-p")); return; }
    if (e.target.closest(".my-out")) { if (window.KickComments) KickComments.signOut().then(function () { renderMy(); }); return; }
    if (e.target.closest(".my-edit")) {
      var ebox = viewEl.querySelector(".my-editbox");
      if (ebox) {
        if (ebox.innerHTML) { ebox.innerHTML = ""; return; }
        var curn = (window.KickComments && KickComments.nick()) || "";
        ebox.innerHTML = '<input class="my-nickin" maxlength="20" value="' + esc(curn) + '" placeholder="닉네임"><button class="my-save">저장</button>';
        var ip = ebox.querySelector(".my-nickin"); if (ip) ip.focus();
      }
      return;
    }
    if ((my = e.target.closest(".my-save"))) {
      var ip2 = viewEl.querySelector(".my-nickin"); var v = ip2 ? ip2.value.trim() : "";
      if (!v) return;
      my.disabled = true;
      KickComments.setNickname(v).then(function () { renderMy(); }).catch(function () { my.disabled = false; alert("닉네임 저장 실패"); });
      return;
    }
    if ((my = e.target.closest(".my-tabbtn"))) { myTab = my.getAttribute("data-mytab"); paintMy(); return; }
    if ((my = e.target.closest(".my-item[data-go]"))) { go(my.getAttribute("data-go")); return; }
    var dc = e.target.closest("[data-date]");
    if (dc) { selectedDate = dc.getAttribute("data-date"); renderSchedule(); return; }
    var rc = e.target.closest(".rchip");
    if (rc) { searchEl.value = rc.getAttribute("data-q"); renderSearchResults(rc.getAttribute("data-q").toLowerCase()); return; }
    var gb = e.target.closest("[data-grade]");
    if (gb) { renderGradeList(gb.getAttribute("data-grade")); return; }
    var ex = e.target.closest("[data-expand]");
    if (ex) { var elist = ex.parentNode.querySelector(".news-list"); if (elist) elist.classList.remove("news-collapsed"); ex.style.display = "none"; return; }
    var mt = e.target.closest("[data-match]");
    if (mt) { go("match/" + mt.getAttribute("data-match")); return; }
    var mg = e.target.closest("[data-manager]");
    if (mg) { go("manager/" + mg.getAttribute("data-manager")); return; }
    var pl = e.target.closest("[data-player]");
    if (pl) { go("player/" + pl.getAttribute("data-player")); return; }
    var tm = e.target.closest("[data-team]");
    if (tm) { go("team/" + tm.getAttribute("data-team")); return; }
  });

  // 홈 탭(일정/조별) 전환
  tabsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    homeTab = btn.getAttribute("data-tab");
    searchEl.value = "";
    if (window.location.hash) { go(""); } else { renderHome(); }
  });

  // 하단 탭바
  if (tabbarEl) {
    tabbarEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".tabbar-btn");
      if (!btn) return;
      var nav = btn.getAttribute("data-nav");
      searchEl.value = "";
      if (nav === "home") { homeTab = "schedule"; go(""); }
      else if (nav === "search") { go("search"); setTimeout(function () { searchEl.focus(); }, 30); }
      else if (nav === "saved") { go("saved"); }
      else if (nav === "my") { go("my"); }
    });
  }

  var searchDebounce;
  searchEl.addEventListener("input", function () {
    var r = parseHash();
    if (r.name === "search") { renderSearch(searchEl.value); }
    else if (window.location.hash) { go(""); }
    else { route(); }
    clearTimeout(searchDebounce);
    var val = searchEl.value;
    searchDebounce = setTimeout(function () { if (val.trim().length > 1) recentPush(val); }, 1200);
  });

  backBtn.addEventListener("click", function () {
    if (window.location.hash) { go(""); } else { window.history.back(); }
  });

  document.getElementById("homeLink").addEventListener("click", function () {
    searchEl.value = ""; homeTab = "schedule"; go("");
  });

  window.addEventListener("hashchange", route);

  // 동적 영역이 다시 그려질 때마다 이모지→이미지 변환(국기 포함)
  if (window.MutationObserver) {
    new MutationObserver(function () { twem(viewEl); }).observe(viewEl, { childList: true });
  }

  // 서비스워커 (PWA, http(s)에서만)
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  route();
  twem(document.body); // 상단바·탭바·초기 화면의 이모지 변환
  fetchLive();          // 라이브 경기 폴링 시작(ESPN 공개 API, 경기중 60초/임박 3분)

  // 자동수집 뉴스(news.json, GitHub Actions 4시간 크론) 로드 → 팀별 news 최신화 후 현재 화면 다시 렌더
  function loadNews() {
    fetch("news.json?ts=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.byTeam) return;
      DATA.teams.forEach(function (t) {
        var items = d.byTeam[t.name];
        if (items && items.length) t.news = items;  // 신선한 RSS 헤드라인으로 교체(없으면 기존 유지)
      });
      route();
    }).catch(function () {});
  }
  loadNews();
})();
