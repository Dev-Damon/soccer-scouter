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
      (hideScore ? "" : ' <span class="score">' + (p.gradeScore || "") + "</span>") + "</span>";
  }
  // 이름 첫글자 대신 '포지션 배지'(GK/DF/MF/FW 색상) — 의미 있는 시각 요소
  function shortPos(pos) {
    var m = /\(([^)]+)\)/.exec(pos || "");
    if (m) return m[1].split("/")[0].trim().toUpperCase().slice(0, 3);
    return posClass(pos).toUpperCase();
  }
  function posBadge(p, lg) {
    return '<span class="posb ' + posClass(p.position) + (lg ? " lg" : "") + '">' + esc(shortPos(p.position)) + "</span>";
  }
  function flagOf(teamId) {
    var t = teamId ? teamsById[teamId] : null;
    return t ? t.flag : "🏳️";
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
    var all = [];
    (DATA.teams || []).forEach(function (t) {
      (t.news || []).forEach(function (nw) { all.push({ t: t, nw: nw }); });
    });
    all.sort(function (a, b) {
      var ka = isKoreanSrc(a.nw) ? 0 : 1, kb = isKoreanSrc(b.nw) ? 0 : 1;
      if (ka !== kb) return ka - kb;
      var da = a.nw.date || "", db = b.nw.date || ""; return da < db ? 1 : da > db ? -1 : 0;
    });
    return all.slice(0, limit || 8);
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
      listHtml += '<div class="sec-h">📰 주요 소식</div><div class="news-list">';
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

    viewEl.innerHTML = strip + heroHtml + listHtml;

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
    var meta = [fx.venue, fx.city].filter(Boolean).map(esc).join(" · ");
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
    var meta = [fx.venue, fx.city].filter(Boolean).map(esc).join(" · ");
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
    var html = '<div class="stand-note">' +
      (hasData ? "조별 순위 · 경기 결과 실시간 반영 · 상위 2팀 16강 직행" : "순위 불러오는 중… (개막 전이라 0)") +
      "</div>";
    groups.forEach(function (g) {
      var rows = (g.teamIds || []).map(function (id) {
        return { id: id, t: teamsById[id], s: STAND[id] || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 } };
      });
      rows.sort(function (a, b) {
        return b.s.pts - a.s.pts || b.s.gd - a.s.gd || b.s.gf - a.s.gf ||
          (((a.t && a.t.fifaRank) || 999) - ((b.t && b.t.fifaRank) || 999));
      });
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
    viewEl.innerHTML = html;
  }

  // ===================== 공통: 선수 행 =====================
  function playerRow(p, hideScore) {
    return '<div class="player-row" data-player="' + esc(p.id) + '">' +
      posBadge(p) +
      '<div class="player-main"><div class="player-name">' + esc(p.name) + "</div>" +
      '<div class="player-sub">' + esc(p.team) + " · " + esc(p.club) + " · " + esc(p.position) + "</div></div>" +
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
      // 등급별 둘러보기
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
      html += '<div class="search-hint">선수·나라·소속 클럽을 검색해보세요.</div>';
      viewEl.innerHTML = html;
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
      players.sort(function (a, b) { return (b.gradeScore || 0) - (a.gradeScore || 0); });
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
      .sort(function (a, b) { return (b.gradeScore || 0) - (a.gradeScore || 0); });
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

  function renderPlayer(id) {
    var p = playersById[id];
    if (!p) { viewEl.innerHTML = '<div class="empty">선수를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false;
    tabsEl.hidden = true;

    var ovr = p.ovr || p.gradeScore || 0;
    var team = teamsById[teamIdByName(p.team)];

    var facts = [
      ["포지션", p.position],
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
    // gradeScore는 정렬용으로만 내부 유지하고 UI 배지에는 노출하지 않는다.
    var roster = DATA.players.filter(function (p) { return p.team === t.name; })
      .sort(function (a, b) {
        var ra = posRank(a), rb = posRank(b);
        if (ra !== rb) return ra - rb;
        return (b.gradeScore || 0) - (a.gradeScore || 0);
      });

    // 컨트리 히어로
    var html = '<div class="detail">' +
      '<div class="country-hero">' +
        '<div class="ch-grid"></div>' +
        '<span class="team-flag lg">' + esc(t.flag) + "</span>" +
        '<div class="ch-meta"><h2>' + esc(t.name) + "</h2>" +
        '<div class="team-rank">FIFA 랭킹 ' + esc(t.fifaRank) + "위 · " + esc(t.group) + "조</div></div>" +
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
        var pc = posClass(d.pos);
        var x = Math.max(4, Math.min(96, d.x || 50));
        var y = Math.max(4, Math.min(96, d.y || 50));
        var pdAttr = (d.playerId && playersById[d.playerId]) ? ' data-player="' + esc(d.playerId) + '"' : "";
        html += '<div class="pd ' + pc + (pdAttr ? " tappable" : "") + '"' + pdAttr + ' style="left:' + x + "%;top:" + y + '%" title="' + esc(d.name || "") + '">' +
          '<span class="pd-dot">' + esc(d.number != null ? d.number : "") + "</span>" +
          '<span class="pd-name">' + esc((d.name || "").split(" ").slice(-1)[0]) + "</span></div>";
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

  function renderMatch(id) {
    var fx = fixturesById[id];
    if (!fx) { viewEl.innerHTML = '<div class="empty">경기를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false; tabsEl.hidden = true;
    var a = teamsById[fx.homeId], b = teamsById[fx.awayId];
    var when = fmtDate(fxDate(fx)).d + (fxTime(fx) ? " " + esc(fxTime(fx)) : "");
    var where = [fx.venue, fx.city].filter(Boolean).map(esc).join(" · ");
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
        '<div class="match-cta">' +
          '<button class="mbtn" data-team="' + esc(a.id) + '">' + esc(a.flag) + " " + esc(a.name) + " 분석</button>" +
          '<button class="mbtn" data-team="' + esc(b.id) + '">' + esc(b.flag) + " " + esc(b.name) + " 분석</button>" +
        "</div>" +
      "</div>";
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

  // ===================== 라우터 =====================
  function setTabbar(active) {
    if (!tabbarEl) return;
    Array.prototype.forEach.call(tabbarEl.querySelectorAll(".tabbar-btn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-nav") === active);
    });
  }

  function mountCmt(key) { if (window.KickComments) { try { window.KickComments.mount(viewEl, key); } catch (e) {} } }

  function route() {
    var r = parseHash();
    window.scrollTo(0, 0);
    if (r.name === "player") { setTabbar(""); renderPlayer(r.id); mountCmt("player:" + r.id); return; }
    if (r.name === "team") { setTabbar(""); renderTeam(r.id); mountCmt("team:" + r.id); return; }
    if (r.name === "match") { setTabbar(""); renderMatch(r.id); mountCmt("match:" + r.id); return; }
    if (r.name === "manager") { setTabbar(""); return renderManager(r.id); }
    if (r.name === "search") {
      setTabbar("search"); backBtn.hidden = true; tabsEl.hidden = true;
      return renderSearch(searchEl.value);
    }
    if (r.name === "saved") { setTabbar("saved"); return renderPlaceholder("저장", "찜한 선수·나라를 모아보는 공간 (준비 중)"); }
    if (r.name === "my") { setTabbar("my"); return renderPlaceholder("MY", "로그인하면 내 정보·찜·설정을 볼 수 있어요 (준비 중)"); }
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
  viewEl.addEventListener("click", function (e) {
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
})();
