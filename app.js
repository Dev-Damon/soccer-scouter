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
  // 잔디 표시명: 같은 팀에 성(姓)이 겹치는 선수만 풀네임(예: 산티아고/라울 히메네스), 나머지는 성만(공간 절약)
  var _surnameDup = {};
  (function () { var byKey = {}; DATA.players.forEach(function (p) { var sur = String(p.name || "").split(" ").slice(-1)[0]; var k = p.team + "|" + sur; (byKey[k] = byKey[k] || []).push(p.id); }); Object.keys(byKey).forEach(function (k) { if (byKey[k].length > 1) byKey[k].forEach(function (id) { _surnameDup[id] = true; }); }); })();
  // 성 대신 '알려진 이름/별칭'으로 표시할 선수(예: 비니시우스 주니오르 → 비니시우스). 승인된 항목만 추가.
  var PITCH_OVERRIDE = {
    "vinicius-junior": "비니시우스",
    // 성 앞 관사(van/de) 포함 — 오버라이드명은 렌더 시 한 줄(줄바꿈/축약 안 함)
    "virgil-van-dijk": "반 다이크", "micky-van-de-ven": "반 데 벤", "jan-paul-van-hecke": "판 헤케",
    "marten-de-roon": "더 론", "kevin-de-bruyne": "데 브라위너", "charles-de-ketelaere": "데 케텔라레",
    "maxim-de-cuyper": "더 카위퍼르", "koni-de-winter": "더 빈터르"
  };
  function pitchSurname(name, pid) { if (pid && PITCH_OVERRIDE[pid]) return PITCH_OVERRIDE[pid]; return String(name || "").split(" ").slice(-1)[0]; }
  function pitchName(name, pid) { if (pid && PITCH_OVERRIDE[pid]) return PITCH_OVERRIDE[pid]; return (pid && _surnameDup[pid]) ? (name || "") : String(name || "").split(" ").slice(-1)[0]; }
  function pitchNameHtml(name, pid) { var nm = pitchName(name, pid); if (pid && PITCH_OVERRIDE[pid]) return esc(nm); return nm.split(" ").map(esc).join("<br>"); }  // 풀네임이면 단어마다 줄바꿈(오버라이드명은 한 줄)
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
  // 선수단 카드용: 큰 등번호 + 작은 포지션(번호 없으면 기존 포지션 배지)
  function numBadge(p) {
    var pc = posClass(p.position);
    if (p.number == null) return posBadge(p);
    return '<span class="numb ' + pc + '"><span class="numb-n">' + p.number + '</span><span class="numb-p">' + pc.toUpperCase() + "</span></span>";
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
  // 나라상세 선수단 정렬: "pos"=포지션순(공→미→수→GK, 동일포지션 점수높은순, 기본) / "score"=점수순
  var squadSort = "pos", _squadTeamId = null;
  function sortRosterBy(list, mode) {
    return list.slice().sort(function (a, b) {
      if (mode === "score") { var d = (b.ovr || 0) - (a.ovr || 0); return d || (posRank(a) - posRank(b)); }
      var ra = posRank(a), rb = posRank(b);
      if (ra !== rb) return ra - rb;
      return (b.ovr || 0) - (a.ovr || 0);
    });
  }
  // 한글 코스 포지션(선수 상세용): 공격수/미드필더/수비수/골키퍼
  function posKo(pos) {
    var c = posClass(pos);
    return c === "gk" ? "골키퍼" : c === "df" ? "수비수" : c === "mf" ? "미드필더" : "공격수";
  }

  // ---- 라우팅(해시 기반) ----
  var _scrollMem = {}, _isPop = false;  // 화면별 스크롤 위치 기억 → 뒤로가기 시 그 자리 복원
  try { history.scrollRestoration = "manual"; } catch (e) {}  // 브라우저 자동복원 끄고 우리가 제어
  function hkey() { return location.hash || "#"; }  // 홈은 해시가 ""라 "#"로 정규화
  // 비동기 콘텐츠(라인업·순위표·뉴스)가 늦게 로딩돼 페이지가 자라도, 목표 위치 도달할 때까지 ~1.2초 재시도
  function restoreScroll(y) {
    if (!y) { window.scrollTo(0, 0); return; }
    var start = null;
    function step(ts) {
      if (start == null) start = ts;
      window.scrollTo(0, y);
      if (window.scrollY < y - 2 && ts - start < 1200) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function go(hash) { _isPop = false; window.location.hash = hash; }  // 새 화면 진입(앞으로)=맨위
  function parseHash() {
    var h = (window.location.hash || "").replace(/^#/, "");
    if (!h) return { name: "home" };
    var parts = h.split("/");
    if (parts[0] === "player") return { name: "player", id: parts[1] };
    if (parts[0] === "compare") return { name: "compare", a: parts[1], b: parts[2] };
    if (parts[0] === "rate") return { name: "rate", id: parts[1] };
    if (parts[0] === "team") return { name: "team", id: parts[1] };
    if (parts[0] === "match") return { name: "match", id: parts[1] };
    if (parts[0] === "manager") return { name: "manager", id: parts[1] };
    if (parts[0] === "search") return { name: "search" };
    if (parts[0] === "board") return { name: "board" };
    if (parts[0] === "post") return { name: "post", id: parts[1] };
    if (parts[0] === "write") return { name: "write" };
    if (parts[0] === "edit") return { name: "edit", id: parts[1] };
    if (parts[0] === "saved") return { name: "saved" };
    if (parts[0] === "my") return { name: "my" };
    if (parts[0] === "admin") return { name: "admin" };
    if (parts[0] === "adminuser") return { name: "adminuser", id: parts[1] };
    if (parts[0] === "mvrank") return { name: "mvrank", id: parts[1] };
    return { name: "home" };
  }

  // ===================== 홈: 일정 / 조별 =====================
  // ===== 토너먼트 대진표 (2026 월드컵 공식 구조, 경기번호 FIFA 기준) =====
  var BRACKET = {
    r32: [
      { m: 73, a: "2A", b: "2B" }, { m: 74, a: "1E", b: "3rd A/B/C/D/F" }, { m: 75, a: "1F", b: "2C" }, { m: 76, a: "1C", b: "2F" },
      { m: 77, a: "1I", b: "3rd C/D/F/G/H" }, { m: 78, a: "2E", b: "2I" }, { m: 79, a: "1A", b: "3rd C/E/F/H/I" }, { m: 80, a: "1L", b: "3rd E/H/I/J/K" },
      { m: 81, a: "1D", b: "3rd B/E/F/I/J" }, { m: 82, a: "1G", b: "3rd A/E/H/I/J" }, { m: 83, a: "2K", b: "2L" }, { m: 84, a: "1H", b: "2J" },
      { m: 85, a: "1B", b: "3rd E/F/G/I/J" }, { m: 86, a: "1J", b: "2H" }, { m: 87, a: "1K", b: "3rd D/E/I/J/L" }, { m: 88, a: "2D", b: "2G" }
    ],
    r16: [{ m: 89, from: [74, 77] }, { m: 90, from: [73, 75] }, { m: 91, from: [76, 78] }, { m: 92, from: [79, 80] }, { m: 93, from: [83, 84] }, { m: 94, from: [81, 82] }, { m: 95, from: [86, 88] }, { m: 96, from: [85, 87] }],
    qf: [{ m: 97, from: [89, 90] }, { m: 98, from: [93, 94] }, { m: 99, from: [91, 92] }, { m: 100, from: [95, 96] }],
    sf: [{ m: 101, from: [97, 98] }, { m: 102, from: [99, 100] }],
    third: { m: 103, from: [101, 102] }, final: { m: 104, from: [101, 102] }
  };
  function brkSlot(s) {
    var m = /^([12])([A-L])$/.exec(s);
    if (m) return m[2] + "조 " + (m[1] === "1" ? "1위" : "2위");
    var t = /3rd\s+([A-L/]+)/.exec(s);
    if (t) return t[1].replace(/\//g, "·") + " 3위";
    return s;
  }
  var R32M = {}; BRACKET.r32.forEach(function (m) { R32M[m.m] = m; });
  var BL_R32 = [74, 77, 73, 75, 76, 78, 79, 80], BR_R32 = [83, 84, 81, 82, 86, 88, 85, 87];
  // ===== 킥톡 예측 대진표 — 전력(지수+몸값+FIFA랭킹)으로 조 순위·승자 예측. 잉글랜드는 매 경기 승리 강제(우승 고정). 참고용. =====
  var PRED = null, PRED_CHAMP = "england";
  function brkStrength(id) { var t = teamsById[id]; if (!t) return 0; var x = t.indices || {}; var mv = TEAM_MV[id] || 0; return (x.attack || 60) + (x.defense || 60) + (x.organization || 60) + (x.experience || 40) * 0.4 + Math.sqrt(mv) * 2 + (60 - (t.fifaRank || 60)) * 0.5; }
  function predictBracket() {
    var gr = {}; (DATA.groups || []).forEach(function (g) { gr[g.group] = (g.teamIds || []).slice().sort(function (a, b) { return brkStrength(b) - brkStrength(a); }); });
    var thirds = Object.keys(gr).map(function (L) { return { L: L, id: gr[L][2] }; }).filter(function (o) { return o.id; }).sort(function (a, b) { return brkStrength(b.id) - brkStrength(a.id); });
    var usedThird = {};
    function slotTeam(s) {
      var m = /^([12])([A-L])$/.exec(s); if (m) { var arr = gr[m[2]] || []; return arr[m[1] === "1" ? 0 : 1]; }
      var t = /3rd\s+([A-L/]+)/.exec(s);
      if (t) { var cands = t[1].split("/"); var pick = thirds.filter(function (o) { return cands.indexOf(o.L) >= 0 && !usedThird[o.L]; })[0] || thirds.filter(function (o) { return !usedThird[o.L]; })[0]; if (pick) { usedThird[pick.L] = 1; return pick.id; } }
      return null;
    }
    function win(a, b) { if (!a) return b; if (!b) return a; if (a === PRED_CHAMP || b === PRED_CHAMP) return PRED_CHAMP; return brkStrength(a) >= brkStrength(b) ? a : b; }
    var r32 = {}; BRACKET.r32.forEach(function (m) { r32[m.m] = { a: slotTeam(m.a), b: slotTeam(m.b) }; });
    var node = {}, r32win = {};
    function side(arr, pfx) {
      var w = arr.map(function (mn) { var wn = win(r32[mn].a, r32[mn].b); r32win[mn] = wn; return wn; });
      var l16 = []; for (var i = 0; i < 4; i++) { node[pfx + "16_" + i] = win(w[2 * i], w[2 * i + 1]); l16.push(node[pfx + "16_" + i]); }
      var l8 = []; for (i = 0; i < 2; i++) { node[pfx + "8_" + i] = win(l16[2 * i], l16[2 * i + 1]); l8.push(node[pfx + "8_" + i]); }
      node[pfx + "sf"] = win(l8[0], l8[1]); return node[pfx + "sf"];
    }
    var lf = side(BL_R32, "l"), rf = side(BR_R32, "r");
    node.fin = win(lf, rf);
    var lLose = node.lsf === node.l8_0 ? node.l8_1 : node.l8_0, rLose = node.rsf === node.r8_0 ? node.r8_1 : node.r8_0;  // 3·4위전 = 양 4강 패자
    return { r32: r32, r32win: r32win, node: node, champion: node.fin, runnerUp: node.fin === lf ? rf : lf, third: [lLose, rLose] };
  }
  // 세로형 32강 대진표 — 한 경기 = 팀카드(조/순위 2줄) 위아래로 쌓음. 가운데 결승.
  // ★카드 크기는 고정, 너비가 넓어지면 '연결선(컬럼 간격)'만 좌우로 늘림(전체 확대 X). 리사이즈 시 재배치.
  function layoutBracket() {
    var fit = viewEl.querySelector(".brk2-fit"); if (!fit) return;
    var W = Math.max(320, Math.floor(fit.clientWidth)), H = 560, CY = H / 2, i;
    function cyA(n) { var a = [], k; for (k = 0; k < n; k++) a.push(H / (2 * n) * (2 * k + 1)); return a; }
    var r32cy = cyA(8), c16cy = cyA(4), c8cy = cyA(2);
    var cardW = 58, Wp = 22, Wf = 42, OFF = PRED ? 18 : 15, edge = cardW / 2 + 5;  // R32 카드 중심 = 좌측 여백 (예측 모드는 세로카드라 간격↑)
    var span = (W / 2) - edge;  // R32열 → 중앙(결승)까지 가로 거리(넓을수록 길어짐 = 연결선만 늘어남)
    var XL = edge, X16 = edge + span * 0.426, X8 = edge + span * 0.618, X4 = edge + span * 0.765, XF = W / 2;  // 비율은 원본 360px 디자인과 동일
    var XR = W - edge, XR16 = W - X16, XR8 = W - X8, XR4 = W - X4;
    var boxes = [], BX = {}, P = [];
    function box(cx, cy, w, h, cls, html, attr) { boxes.push('<div class="bx ' + cls + '"' + (attr || "") + ' style="left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;width:' + w + 'px;min-height:' + h + 'px">' + html + "</div>"); }
    function teamAttr(tid) { var t = teamsById[tid]; return t ? ' data-team="' + esc(tid) + '" title="' + esc(t.name) + '"' : ""; }  // 클릭→나라상세 + 마우스오버 툴팁
    function vbox(id, cx, cy, w) { BX[id] = { cx: cx, cy: cy, w: w }; }
    function tcard(s, cx, cy, tid, isWin) {
      var t = brkSlot(s), sp = t.lastIndexOf(" "), g = sp > 0 ? t.slice(0, sp) : t, r = sp > 0 ? t.slice(sp + 1) : "";
      if (PRED && tid) {
        var tm = teamsById[tid];
        // 3위 슬롯: 후보 조 목록(A·B·C·D·F 3위) 유지 + 실제 올라온 조만 굵게·강조색. 1·2위는 그대로.
        var labelHtml, is3 = g.indexOf("·") >= 0;
        if (is3) { var tg = tm && tm.group; labelHtml = g.split("·").map(function (x) { return x === tg ? '<b class="hl3">' + esc(x) + "</b>" : esc(x); }).join("·") + " " + esc(r); }
        else labelHtml = esc(g + " " + r);
        box(cx, cy, cardW, 32, "tc pred" + (isWin ? " win" : ""), '<span class="bxf">' + esc(tm ? tm.flag : "") + '</span><span class="bxl' + (is3 ? " bxl3" : "") + '">' + labelHtml + "</span>", teamAttr(tid));
        return;
      }
      box(cx, cy, cardW, 26, "tc", "<b>" + esc(g) + "</b>" + (r ? "<i>" + esc(r) + "</i>" : ""));
    }
    function conBox(id, cx, cy, w, lbl) {  // 16강~4강 노드: 예측 승자 국기(클릭가능) or 라벨
      var tid = PRED && PRED.node[id], t = tid && teamsById[tid];
      box(cx, cy, w, 14, "con", t ? '<span class="bxf">' + esc(t.flag) + "</span>" : lbl, t ? teamAttr(tid) : "");
      vbox(id, cx, cy, w);
    }
    function pair(id, mn, cx, cy, ed) { var m = R32M[mn]; var pt = PRED && PRED.r32[mn]; var wn = PRED && PRED.r32win[mn]; tcard(m.a, cx, cy - OFF, pt && pt.a, pt && wn === pt.a); tcard(m.b, cx, cy + OFF, pt && pt.b, pt && wn === pt.b); vbox(id, cx, cy, cardW); P.push("M" + ed + " " + (cy - OFF) + " V" + (cy + OFF)); }
    for (i = 0; i < 8; i++) pair("lr" + i, BL_R32[i], XL, r32cy[i], XL + cardW / 2);
    for (i = 0; i < 4; i++) conBox("l16_" + i, X16, c16cy[i], Wp, "16강");
    for (i = 0; i < 2; i++) conBox("l8_" + i, X8, c8cy[i], Wp, "8강");
    conBox("lsf", X4, CY, Wp, "4강");
    vbox("fin", XF, CY, Wf); box(XF, CY, Wf, Wf, "fin", PRED && PRED.champion ? '<div class="trophy">🏆</div><div class="bxf champf">' + esc((teamsById[PRED.champion] || {}).flag || "") + "</div>" : '<div class="trophy">🏆</div><div class="finlbl">결승</div>', PRED && PRED.champion ? teamAttr(PRED.champion) : "");
    box(XF, CY + Wf / 2 + 16, 74, 16, "thirdpl", (PRED && PRED.third) ? ('🥉 <span class="bxf">' + esc((teamsById[PRED.third[0]] || {}).flag || "") + '</span><span class="bxf">' + esc((teamsById[PRED.third[1]] || {}).flag || "") + "</span>") : "🥉 3·4위전");
    conBox("rsf", XR4, CY, Wp, "4강");
    for (i = 0; i < 2; i++) conBox("r8_" + i, XR8, c8cy[i], Wp, "8강");
    for (i = 0; i < 4; i++) conBox("r16_" + i, XR16, c16cy[i], Wp, "16강");
    for (i = 0; i < 8; i++) pair("rr" + i, BR_R32[i], XR, r32cy[i], XR - cardW / 2);
    function eH(c, p, dir) { var cc = BX[c], pp = BX[p], cr = dir > 0 ? cc.cx + cc.w / 2 : cc.cx - cc.w / 2, pl = dir > 0 ? pp.cx - pp.w / 2 : pp.cx + pp.w / 2, mx = (cr + pl) / 2; P.push("M" + cr + " " + cc.cy + " H" + mx + " V" + pp.cy + " H" + pl); }
    for (i = 0; i < 4; i++) { eH("lr" + (2 * i), "l16_" + i, 1); eH("lr" + (2 * i + 1), "l16_" + i, 1); }
    for (i = 0; i < 2; i++) { eH("l16_" + (2 * i), "l8_" + i, 1); eH("l16_" + (2 * i + 1), "l8_" + i, 1); }
    eH("l8_0", "lsf", 1); eH("l8_1", "lsf", 1); eH("lsf", "fin", 1);
    for (i = 0; i < 4; i++) { eH("rr" + (2 * i), "r16_" + i, -1); eH("rr" + (2 * i + 1), "r16_" + i, -1); }
    for (i = 0; i < 2; i++) { eH("r16_" + (2 * i), "r8_" + i, -1); eH("r16_" + (2 * i + 1), "r8_" + i, -1); }
    eH("r8_0", "rsf", -1); eH("r8_1", "rsf", -1); eH("rsf", "fin", -1);
    var svg = '<svg class="brk-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">' + P.map(function (d) { return '<path class="brk-edge" d="' + d + '" fill="none" stroke-width="1.4"/>'; }).join("") + "</svg>";
    fit.innerHTML = '<div class="brk-stage" style="width:' + W + "px;height:" + H + 'px">' + svg + boxes.join("") + "</div>";
    fit.style.height = H + "px";
    twem(fit);
  }
  window.addEventListener("resize", function () { if (viewEl.querySelector(".brk2-fit")) layoutBracket(); });
  function renderBracket() {
    PRED = predictBracket();
    var champ = teamsById[PRED.champion] || {}, ru = teamsById[PRED.runnerUp] || {};
    viewEl.innerHTML = '<div class="brk-note">🏆 킥톡 예측 <span class="muted-note">자체 지수 기반 · 참고용</span><br>우승 ' + esc(champ.flag || "") + " " + esc(champ.name || "") + " · 준우승 " + esc(ru.flag || "") + " " + esc(ru.name || "") + ' <span class="muted-note">(조별리그 끝나면 실제 결과 반영)</span></div><div class="brk2-fit"></div><div class="adslot"></div>';
    layoutBracket();
    insertAdFit(viewEl.querySelector(".adslot"));  // 대진표 하단 애드핏 320x100
  }

  function renderHome() {
    backBtn.hidden = true;
    tabsEl.hidden = false;
    Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === homeTab);
    });
    if (homeTab === "groups") return renderGroups();
    if (homeTab === "bracket") return renderBracket();
    if (homeTab === "scorers") return renderScorers();
    return renderSchedule();
  }

  // ===================== 월드컵 기록(득점왕·도움·자책골·카드) =====================
  var statsData = null, statsLoading = null, scoreCat = "goals";
  var SCORE_CATS = [["goals", "⚽ 득점"], ["assists", "🅰️ 도움"], ["og", "🥅 자책골"], ["cards", "🟨 카드"]];
  function ensureStats() {
    if (statsData) return Promise.resolve(statsData);
    if (statsLoading) return statsLoading;
    // DB(크론+라이브 클라이언트 적재) 우선 → 새로고침마다 최신. 단 클라이언트 ready 후 조회(아니면 sb null로 폴백 캐싱됨)
    var ready = (window.KickComments && KickComments.ready) ? KickComments.ready() : Promise.resolve();
    statsLoading = ready.then(function () {
      return (window.KickComments && KickComments.matchStats) ? KickComments.matchStats() : null;
    }).then(function (db) {
      if (db && db.players && db.players.length) return db;
      return fetch("stats.json").then(function (r) { return r.json(); });  // DB 비었을 때만 폴백
    }).then(function (j) { statsData = j || { players: [] }; return statsData; }).catch(function () { statsData = { players: [] }; return statsData; });
    return statsLoading;
  }
  function scVal(p) { return scoreCat === "cards" ? ((p.yellow || 0) + (p.red || 0) * 2) : (p[scoreCat] || 0); }
  function renderScorers() {
    ensureStats().then(function (j) {
      if (parseHash().name !== "home" || homeTab !== "scorers") return;
      var subs = '<div class="rank-sorts">' + SCORE_CATS.map(function (c) { return '<button class="rank-sb' + (scoreCat === c[0] ? " on" : "") + '" data-scat="' + c[0] + '">' + c[1] + "</button>"; }).join("") + "</div>";
      // 골·자책골을 경기결과(match_results)와 대조해 보정 — fetch_stats가 놓친 득점도 반영(경기상세와 항상 일치)
      var statsP = (j.players || []).slice(), gr = goalsFromResults(), byPid = {};
      statsP.forEach(function (p) { if (p.pid) byPid[p.pid] = p; });
      Object.keys(gr).forEach(function (pid) {
        var pl = playersById[pid]; if (!pl) return;
        if (byPid[pid]) { byPid[pid].goals = Math.max(byPid[pid].goals || 0, gr[pid].g); byPid[pid].og = Math.max(byPid[pid].og || 0, gr[pid].og); }
        else { var t = teamsById[teamIdByName(pl.team)] || {}; statsP.push({ pid: pid, name: pl.name, team: pl.team, flag: t.flag || "", goals: gr[pid].g, assists: 0, og: gr[pid].og, yellow: 0, red: 0, apps: gr[pid].g > 0 ? 1 : 0 }); }
      });
      var players = statsP.filter(function (p) { return scVal(p) > 0; }).sort(function (a, b) {
        var d = scVal(b) - scVal(a); if (d) return d;
        // 타이브레이크: 득점=도움多, 도움=골多 → 적은 경기수 → 이름 (월드컵 골든부트 기준)
        if (scoreCat === "goals") { var sa = (b.assists || 0) - (a.assists || 0); if (sa) return sa; }
        else if (scoreCat === "assists") { var sg = (b.goals || 0) - (a.goals || 0); if (sg) return sg; }
        var ap = (a.apps || 0) - (b.apps || 0); if (ap) return ap;
        return (a.name || "").localeCompare(b.name || "");
      });
      // 공동순위: 같은 값이면 같은 등수(1,1,1,…,4,…)
      var _rk = 0, _pv = null;
      players.forEach(function (p, i) { var v = scVal(p); if (_pv === null || v !== _pv) { _rk = i + 1; _pv = v; } p._rank = _rk; });
      var _rcount = {}; players.forEach(function (p) { _rcount[p._rank] = (_rcount[p._rank] || 0) + 1; });
      function scAds() { insertAdFit(viewEl.querySelector(".ad-top")); insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50"); }  // 맨위 320x100 / 맨밑 320x50
      var html = '<div class="adslot ad-top"></div><div class="sec-h">👟 월드컵 기록 <span class="muted-note">실시간 집계 · ESPN</span></div>' + subs;
      if (!players.length) { html += '<div class="empty">아직 기록이 없어요.<br>경기가 시작되면 골·도움·카드가 자동으로 채워져요! ⚽</div>'; viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>'; twem(viewEl); scAds(); return; }
      var rows = players.slice(0, 50).map(function (p, i) {
        var pl = p.pid && playersById[p.pid];
        var meta = pl ? (esc(pl.club || "") + (pl.league ? " · " + esc(pl.league) : "")) : esc(p.team || "");
        var apps = p.apps || 0, statMain, statsub;
        if (scoreCat === "cards") {
          statMain = '<span class="sc-cards">' + (p.yellow ? '<span class="cardbox y">' + p.yellow + "</span>" : "") + (p.red ? '<span class="cardbox r">' + p.red + "</span>" : "") + "</span>";
          statsub = apps ? apps + "경기" : "";
        } else {
          var unit = scoreCat === "goals" ? "골" : scoreCat === "assists" ? "도움" : "자책";
          statMain = '<span class="sc-mainline"><span class="sc-num">' + scVal(p) + '</span><span class="sc-unit">' + unit + "</span></span>";
          statsub = apps ? (apps + "경기 · 평균 " + (scVal(p) / apps).toFixed(2)) : "";
        }
        return '<div class="sc-row' + (p.pid ? " clickable" : "") + '"' + (p.pid ? ' data-player="' + esc(p.pid) + '"' : "") + '>' +
          '<span class="sc-rank' + (_rcount[p._rank] > 1 ? " tie" : "") + '"' + (_rcount[p._rank] > 1 ? ' title="공동 ' + p._rank + '위"' : "") + ">" + (_rcount[p._rank] > 1 ? "=" : "") + p._rank + '</span><span class="sc-flag">' + esc(p.flag || "") + "</span>" +
          '<span class="sc-name">' + esc(p.name) + '<span class="sc-team">' + meta + "</span></span>" +
          '<span class="sc-stat">' + statMain + (statsub ? '<span class="sc-statsub">' + statsub + "</span>" : "") + "</span></div>";
      }).join("");
      viewEl.innerHTML = html + '<div class="sc-list">' + rows + "</div><div class=\"adslot ad-bot\"></div>"; twem(viewEl); scAds();
    });
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
    if (IS_TOSS) return [];  // 토스 미니앱: 외부 뉴스(외부링크·저작권) 숨김
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
    // 나라당 최대 2개로 균형 — 1차는 나라당 2개까지(정렬순), 칸 남으면(나라 적거나 기사 적으면) 2차로 남은 기사 채움
    var lim = limit || 8, perCountry = 2, byTeam = {}, picked = [];
    all.forEach(function (x) { var c = byTeam[x.t.id] || 0; if (c < perCountry && picked.length < lim) { picked.push(x); byTeam[x.t.id] = c + 1; x._u = 1; } });
    if (picked.length < lim) all.forEach(function (x) { if (!x._u && picked.length < lim) { picked.push(x); x._u = 1; } });
    return picked;
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
    // 다음 대한민국 경기 픽스처(디데이 클릭 시 이동)
    var krFxs = fxs.filter(isKoreaFx).filter(fxDate).sort(function (a, b) { return fxDate(a) < fxDate(b) ? -1 : 1; }), nextKr = null;
    for (var ki = 0; ki < krFxs.length; ki++) { if (fxDate(krFxs[ki]) >= today) { nextKr = krFxs[ki]; break; } }
    if (opening && today < opening) {
      var d = ddayCount(opening, today);
      dday = "🏆 2026 월드컵 개막 " + (d <= 0 ? "D-DAY" : "D-" + d);
    } else {
      if (nextKr) { var d2 = ddayCount(fxDate(nextKr), today); dday = "🇰🇷 대한민국 다음 경기 " + (d2 <= 0 ? "D-DAY · 오늘!" : "D-" + d2); }
      else { dday = "🇰🇷 대한민국 월드컵 일정 종료"; }
    }
    var ddayTap = nextKr ? ' data-match="' + esc(nextKr.id) + '"' : "";  // 클릭 시 다음 한국경기 상세로
    var witty = WITTY[wittyIdx];  // 현재 회전 중인 문구(렌더돼도 끊김 없이 이어짐)
    return '<div class="hero-banner">' +
      '<div class="hb-kicker">KICKTALK · 2026 WORLD CUP</div>' +
      '<div class="hb-title">국가와 선수를 한눈에</div>' +
      '<div class="hb-sub">' + esc(witty) + "</div>" +
      '<div class="hb-dday' + (nextKr ? " clickable" : "") + '"' + ddayTap + ">" + dday + (nextKr ? " ›" : "") + "</div></div>";
  }

  // 위트 문구 3초마다 슬라이드 전환 — 렌더(날짜 클릭)와 '독립적'으로 타이머 1개만 돈다(클릭해도 리셋 X)
  var wittyTimer = null, wittyIdx = Math.floor(Math.random() * WITTY.length);
  function startWittyTicker() {
    if (wittyTimer) return;  // 이미 돌고 있으면 재시작 안 함
    wittyTimer = setInterval(function () {
      wittyIdx = (wittyIdx + 1) % WITTY.length;
      var el = document.querySelector(".hb-sub");  // 매 틱 현재 요소 조회(재렌더돼도 끊김 없음)
      if (el) { el.classList.remove("anim"); void el.offsetWidth; el.textContent = WITTY[wittyIdx]; el.classList.add("anim"); }
    }, 3000);
  }

  // 카카오 애드핏 배너 삽입 (SPA: 영역+스크립트를 매번 새로 넣어 렌더 트리거)
  // ===== 앱인토스(토스 미니앱) 모드 — 토스 웹뷰면 외부광고·쿠팡·베팅·외부송금 숨김(토스 정책 준수). 일반 웹은 무영향. ?toss=1로 테스트 =====
  var IS_TOSS = (function () { try { return /toss/i.test(navigator.userAgent) || /[?&]toss=1/.test(location.search) || !!window.AppsInToss || !!window.__APPS_IN_TOSS__; } catch (e) { return false; } })();
  function insertAdFit(el, unit, w, h) {
    if (IS_TOSS || !el || el.getAttribute("data-done")) return;
    el.setAttribute("data-done", "1");
    el.innerHTML = '<div class="ad-label">광고</div>';
    var ins = document.createElement("ins"); ins.className = "kakao_ad_area"; ins.style.display = "none";
    ins.setAttribute("data-ad-unit", unit || "DAN-njRR43wj48QPOMPj");
    ins.setAttribute("data-ad-width", w || "320"); ins.setAttribute("data-ad-height", h || "100");
    el.appendChild(ins);
    var s = document.createElement("script"); s.async = true; s.src = "//t1.kakaocdn.net/kas/static/ba.min.js";
    el.appendChild(s);
  }
  // Google AdSense — 수동 반응형 단위(자동광고 X = 앵커·전면광고 없이 UX 방해 최소). 승인 후 콘솔에서 광고단위ID 발급 → ADSENSE_SLOT에 입력하면 활성화.
  var ADSENSE_CLIENT = "ca-pub-1649642792791162", ADSENSE_SLOT = "";
  function insertAdSense(el) {
    if (IS_TOSS || !el || !ADSENSE_SLOT || el.getAttribute("data-done")) return;
    el.setAttribute("data-done", "1");
    el.innerHTML = '<div class="ad-label">광고</div>';
    var ins = document.createElement("ins"); ins.className = "adsbygoogle"; ins.style.display = "block";
    ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
    ins.setAttribute("data-ad-slot", ADSENSE_SLOT);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    el.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }
  // 쿠팡 파트너스 iframe 배너(+ 대가성 문구)
  function insertCoupang(el, w, h) {
    if (IS_TOSS || !el) return;
    el.innerHTML = '<div class="ad-label">광고</div>' +
      '<iframe src="https://ads-partners.coupang.com/widgets.html?id=996159&template=carousel&trackingCode=AF6139723&subId=&width=' + w + '&height=' + h + '&tsource=" width="' + w + '" height="' + h + '" frameborder="0" scrolling="no" referrerpolicy="unsafe-url"></iframe>' +
      '<div class="cpang-note">이 페이지는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</div>';
  }
  // PC 사이드 세로광고 — 넓은 화면에서만 1회 삽입(고정요소라 재렌더 영향 없음): 우=애드핏 160×600, 좌=쿠팡 90×728
  if (window.matchMedia && window.matchMedia("(min-width: 1000px)").matches && document.body) {
    var _sa = document.createElement("div"); _sa.id = "sideAd"; document.body.appendChild(_sa);
    insertAdFit(_sa, "DAN-d8Ks9EUQd2zgzDyG", "160", "600");
    var _sl = document.createElement("div"); _sl.id = "sideAdL"; document.body.appendChild(_sl);
    insertCoupang(_sl, 90, 728);
  }
  function pageAd() { if (!viewEl || viewEl.querySelector(".adslot")) return; var d = document.createElement("div"); d.className = "adslot"; viewEl.appendChild(d); insertAdFit(d); coupangBottom(); }
  // 페이지 맨 아래에 쿠팡 배너 1개(모든 페이지 공통) — 이미 있으면 스킵
  function coupangBottom() { if (!viewEl || viewEl.querySelector(".cpang-m")) return; var cp = document.createElement("div"); cp.className = "adslot cpang-m"; viewEl.appendChild(cp); insertCoupang(cp, 320, 100); }
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
    var _todayKST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    var strip = '<div class="datestrip-wrap"><button class="ds-arrow l" aria-label="이전 날짜">‹</button><div class="datestrip">';
    dates.forEach(function (d) {
      var f = fmtDate(d);
      var korDay = (DATA.fixtures || []).some(function (fx) { return fxDate(fx) === d && (fx.homeId === "south-korea" || fx.awayId === "south-korea"); });
      strip += '<button class="dchip' + (d === selectedDate ? " on" : "") + (korDay ? " kor" : "") + (d === _todayKST ? " today" : "") + '" data-date="' + esc(d) + '">' +
        (korDay ? '<span class="dchip-kor">🇰🇷</span>' : "") +
        '<span class="dchip-dow">' + esc(f.dow) + "</span>" +
        '<span class="dchip-day">' + f.day + "</span>" +
        '<span class="dchip-mo">' + f.mo + "월</span></button>";
    });
    strip += '</div><button class="ds-arrow r" aria-label="다음 날짜">›</button></div>';

    var dayFixtures = (DATA.fixtures || []).filter(function (f) { return fxDate(f) === selectedDate; })
      .sort(function (a, b) { return (a.time || "99:99") < (b.time || "99:99") ? -1 : 1; });

    // 빅매치 히어로: 양 팀 모두 알려진 경기 중 FIFA 합산 랭킹이 가장 높은 경기 (라이브 경기는 상단 라이브카드로 빠지므로 제외)
    var hero = pickBigMatch(dayFixtures.filter(function (f) { return !isLiveOrBcast(f); }));
    var heroHtml = hero ? heroCard(hero) : "";

    // 그 날의 경기 리스트
    var listHtml = '<div class="sec-h">' + fmtDate(selectedDate).d + " " +
      (fmtDate(selectedDate).dow ? fmtDate(selectedDate).dow + "요일" : "") +
      ' · ' + dayFixtures.length + '경기 <span class="kst-note">한국시간</span></div>';
    dayFixtures.forEach(function (fx) { if ((!hero || fx !== hero) && !isLiveOrBcast(fx)) listHtml += fixtureCard(fx); });  // 라이브/방송중 경기는 상단 라이브카드에만

    listHtml += '<div class="adslot home-ad"></div>';
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
    listHtml += '<div class="adslot cpang-m"></div>';  // 모바일 쿠팡(320x50)

    viewEl.innerHTML = topBanner() + liveSection() + strip + heroHtml + '<div class="cheer-slot"></div>' + listHtml;
    insertAdFit(viewEl.querySelector(".home-ad"));
    insertCoupang(viewEl.querySelector(".cpang-m"), 320, 100);
    startWittyTicker();
    loadCheers();

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
      // 데스크탑 좌우 이동 버튼
      var wrap = viewEl.querySelector(".datestrip-wrap");
      if (wrap) {
        var la = wrap.querySelector(".ds-arrow.l"), ra = wrap.querySelector(".ds-arrow.r");
        var updArrows = function () {
          var max = stripEl.scrollWidth - stripEl.clientWidth - 2;
          var atStart = stripEl.scrollLeft <= 2, atEnd = stripEl.scrollLeft >= max || max <= 0;
          if (la) la.classList.toggle("hide", atStart);
          if (ra) ra.classList.toggle("hide", atEnd);
          wrap.classList.toggle("at-start", atStart);
          wrap.classList.toggle("at-end", atEnd);
        };
        if (la) la.addEventListener("click", function () { stripEl.scrollBy({ left: -stripEl.clientWidth * 0.6, behavior: "smooth" }); });
        if (ra) ra.addEventListener("click", function () { stripEl.scrollBy({ left: stripEl.clientWidth * 0.6, behavior: "smooth" }); });
        stripEl.addEventListener("scroll", updArrows);
        setTimeout(updArrows, 60); setTimeout(updArrows, 320);
      }
    }
  }

  function pickBigMatch(list) {
    // 무조건 대한민국 경기가 빅매치
    var kor = list.filter(function (fx) { return fx.homeId && fx.awayId && (fx.homeId === "south-korea" || fx.awayId === "south-korea"); })[0];
    if (kor) return kor;
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

  // 메인 상단 '지금 라이브' 카드 — 라이브 경기 있을 때만 노출, 탭하면 경기상세
  var LIVE_DEMO = 0;  // 0=실제 라이브만. (?live=1/2 파라미터로는 여전히 더미 테스트 가능)
  // 시각 기준 라이브: 킥오프 정각~+130분이면(종료/ESPN post 아니면) 라이브로 간주 → ESPN 'in' 늦어도 정각부터 카드 표시
  function isTimeLive(f) {
    if (!f || !f.homeId || !f.awayId) return false;
    var lv = LIVE[f.id]; if (lv && lv.state === "post") return false;
    var ko = matchKickoff(f); if (!ko) return false;
    var now = Date.now(); return now >= ko && now < ko + 130 * 60000;
  }
  function isLiveFix(f) { var lv = LIVE[f.id]; return (lv && lv.state === "in") || isTimeLive(f); }
  function isLiveOrBcast(f) { return isLiveFix(f) || !!(LIVE_STREAM && LIVE_STREAM.mid === f.id); }  // ESPN 라이브 or JTBC 방송 감지
  function liveFixtures() { return (DATA.fixtures || []).filter(isLiveFix); }
  function liveKey() { return liveFixtures().map(function (f) { return f.id; }).sort().join(","); }
  function liveSection() {
    var tn = +((location.search.match(/[?&]live=(\d)/) || [])[1] || 0);  // ?live=1 / ?live=2 → 더미 라이브카드 테스트
    if (!tn && LIVE_DEMO && !liveFixtures().length) tn = LIVE_DEMO;
    var live, dummy = null;
    if (tn) {
      live = (DATA.fixtures || []).filter(function (f) { return f.homeId && f.awayId; }).slice(0, tn);
      dummy = [{ hs: 1, as: 0, clock: "67'", state: "in" }, { hs: 2, as: 2, clock: "81'", state: "in" }];
    } else {
      live = liveFixtures();
      if (LIVE_STREAM && LIVE_STREAM.mid) { var _bf = fixturesById[LIVE_STREAM.mid]; if (_bf && live.indexOf(_bf) < 0) live = [_bf].concat(live); }  // JTBC 방송 감지 경기도 메인 라이브카드에
    }
    if (!live.length) return "";
    // 오늘의 빅매치 카드(heroCard) 스타일 재사용 — 2경기면 세로로 나열. ESPN 데이터 없으면 '곧 시작' 0:0 표시
    var cards = live.map(function (fx, i) {
      var lv = dummy ? dummy[i] : (LIVE[fx.id] || { state: "in", hs: 0, as: 0, clock: "" });
      return heroCard(fx, lv, true);
    }).join("");
    return '<div class="live-sec"><div class="live-sec-h"><span class="lv-pip"></span> 지금 라이브 <span class="live-sec-n">' + live.length + "경기</span></div><div class=\"live-cards\">" + cards + "</div></div>";
  }
  // 라이브 시계 라벨: 숫자 시계는 "LIVE 67'", 텍스트 상태(전반 종료 등)는 그대로
  function liveClk(c) { c = c || ""; return /^\d/.test(c) ? "LIVE " + esc(c) : (c ? esc(c) : "LIVE"); }
  function heroCard(fx, lvOverride, asLiveCard) {
    var groupLabel = fx.group ? fx.group + "조" : (fx.stage || "");
    var meta = [fx.venue, fx.city, hostCountry(fx)].filter(Boolean).map(esc).join(" · ");
    var heroAttr = (fx.homeId && fx.awayId) ? ' data-match="' + esc(fx.id) + '"'
      : ' data-team="' + esc(fx.homeId || fx.awayId) + '"';
    var swap = (fx.awayId === "south-korea");  // 대한민국 무조건 왼쪽
    var lId = swap ? fx.awayId : fx.homeId, lName = swap ? fx.awayName : fx.homeName;
    var rId = swap ? fx.homeId : fx.awayId, rName = swap ? fx.homeName : fx.awayName;
    var lv = lvOverride || LIVE[fx.id], live = !!(lv && lv.state === "in"), ended = !!(lv && lv.state === "post");
    var preKick = !!(asLiveCard && LIVE_STREAM && LIVE_STREAM.mid === fx.id && !(LIVE[fx.id] && LIVE[fx.id].state === "in"));  // 방송 감지인데 아직 킥오프 전 → 시작시간만 간결히
    var lS = lv ? (swap ? lv.as : lv.hs) : 0, rS = lv ? (swap ? lv.hs : lv.as) : 0;
    var mid = (live && asLiveCard)
      ? '<div class="hero-mid">' + (preKick ? '<span class="hero-kt">' + esc(fxTime(fx) || "") + "</span>" : "") + '<span class="hero-score">' + (lS | 0) + " : " + (rS | 0) + "</span></div>"  // 방송 감지·미킥오프면 점수 위에 시작시간만
      : live
      ? '<div class="hero-mid"><span class="hero-score">' + (lS | 0) + " : " + (rS | 0) + '</span><span class="hero-fin">경기 중 ' + esc(lv.clock || "") + "</span></div>"  // 빅매치는 라이브 강조 X(전용 라이브카드가 위에 있음)
      : ended
      ? '<div class="hero-mid"><span class="hero-score">' + (lS | 0) + " : " + (rS | 0) + '</span><span class="hero-fin">경기 종료</span></div>'
      : '<div class="hero-mid"><span class="hero-kick">' + esc(fxTime(fx) || "시간 미정") + "</span><span class=\"hero-vs\">VS</span></div>";
    var lvG = teamGoals(fx, lv, lName, "l"), rvG = teamGoals(fx, lv, rName, "r");  // 좌/우 팀별 득점자(가운데로 수렴)
    return '<div class="hero' + (live && asLiveCard ? " hero-live" : "") + (asLiveCard ? " live-hero" : "") + '"' + heroAttr + ">" +
      '<div class="hero-grid"></div>' +
      '<div class="hero-tag"><span class="dot"></span>' + (asLiveCard ? "" : "오늘의 빅매치 · ") + esc(groupLabel) + ((asLiveCard && live) ? '<span class="hero-taglive"><span class="hlv-dot"></span>' + liveClk(lv.clock) + "</span>" : "") + "</div>" +
      '<div class="hero-match">' +
        '<div class="hero-side"><span class="hero-flag">' + esc(flagOf(lId)) + "</span>" +
          '<span class="hero-team">' + esc(lName) + "</span></div>" +
        mid +
        '<div class="hero-side"><span class="hero-flag">' + esc(flagOf(rId)) + "</span>" +
          '<span class="hero-team">' + esc(rName) + "</span></div>" +
      "</div>" +
      ((lvG || rvG) ? '<div class="hero-gsplit"><div class="hg-l">' + lvG + '</div><div class="hg-r">' + rvG + "</div></div>" : "") +
      (meta ? '<div class="hero-meta">' + meta + "</div>" : "") +
      '<div class="hero-cta">' + (live ? "경기 보기 →" : ended ? "경기 결과 보기 →" : "경기 예상 보기 →") + "</div>" +
      "</div>";
  }

  // 특정 팀의 득점자만 추려서 줄바꿈 목록으로(성만). 한국골은 한국쪽, 상대골은 상대쪽에 배치용.
  function teamGoals(fx, lv, teamName, side) {
    if (!lv || !lv.events || !lv.events.length) return "";
    var oppName = (teamName === fx.homeName) ? fx.awayName : fx.homeName;
    return lv.events.filter(function (g) {
      var p = playerByName(g.who); if (!p) return false;
      return g.og ? (p.team === oppName) : (p.team === teamName);  // 자책골은 상대 선수가 우리 쪽 득점 → 우리 쪽에 표시
    }).map(function (g) {
      var p = playerByName(g.who), nm = p ? pitchSurname(p.name, p.id) : g.who.split(" ").slice(-1)[0];
      var label = esc(nm) + (g.og ? " (자책골)" : "") + (g.clk ? " " + esc(g.clk) : "");
      return side === "r" ? ("⚽ " + label) : (label + " ⚽");  // 공이 가운데쪽: 좌팀=뒤, 우팀=앞
    }).join("<br>");
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
    var swap = (fx.awayId === "south-korea");  // 대한민국은 무조건 왼쪽
    var lId = swap ? fx.awayId : fx.homeId, lName = swap ? fx.awayName : fx.homeName;
    var rId = swap ? fx.homeId : fx.awayId, rName = swap ? fx.homeName : fx.awayName;
    var lScore = lv ? (swap ? lv.as : lv.hs) : 0, rScore = lv ? (swap ? lv.hs : lv.as) : 0;
    var mid;
    if (live || ended) {
      mid = '<span class="fx-stage">' + groupLabel + "</span>" +
        '<span class="fx-score">' + (lScore | 0) + ' <i>-</i> ' + (rScore | 0) + "</span>" +
        (live ? '<span class="fx-live"><span class="lv-dot"></span>' + liveClk(lv.clock) + "</span>"
              : '<span class="fx-final">종료</span>');
    } else {
      mid = '<span class="fx-stage">' + groupLabel + "</span>" +
        '<span class="fx-time">' + timeLabel + '</span><span class="fx-vs">VS</span>';
    }
    var lG = teamGoals(fx, lv, lName, "l"), rG = teamGoals(fx, lv, rName, "r");  // 좌(홈쪽)/우(원정쪽) 득점자(가운데로 수렴)
    var goals = (lG || rG) ? '<div class="fx-goals"><div class="fx-g-l">' + lG + '</div><div class="fx-g-r">' + rG + "</div></div>" : "";
    return '<div class="fixture' + (clickable ? " clickable" : "") + (live ? " is-live" : "") + '"' + attr + ">" +
      '<div class="fx-side home"><span class="fx-flag">' + esc(flagOf(lId)) + "</span>" +
        '<span class="fx-team">' + esc(lName) + "</span></div>" +
      '<div class="fx-mid">' + mid + "</div>" +
      '<div class="fx-side away"><span class="fx-flag">' + esc(flagOf(rId)) + "</span>" +
        '<span class="fx-team">' + esc(rName) + "</span></div>" +
      goals + (meta ? '<div class="fx-meta">' + meta + "</div>" : "") +
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
    var html = '<div class="adslot ad-top"></div><div class="stand-note">' +
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
    viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
    insertAdFit(viewEl.querySelector(".ad-top")); insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");  // 맨위 320x100 / 맨밑 320x50
  }

  // ===================== 공통: 선수 행 =====================
  function playerRow(p, hideScore, clubLeague) {
    // clubLeague: 나라상세에선 나라명 대신 '클럽 · 리그' 표시
    var sub = clubLeague ? (esc(p.club) + (p.league ? " · " + esc(p.league) : "")) : (esc(p.team) + " · " + esc(p.club) + (p.league ? " · " + esc(p.league) : ""));
    return '<div class="player-row" data-player="' + esc(p.id) + '">' +
      numBadge(p) +
      '<div class="player-main"><div class="player-name">' + esc(p.name) + "</div>" +
      '<div class="player-sub">' + sub + "</div></div>" +
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
  // 저장(찜) — localStorage. key: "player:{id}" / "team:{id}"
  function saveGet() { try { return JSON.parse(localStorage.getItem("ss_saved") || "[]"); } catch (e) { return []; } }
  function saveHas(key) { return saveGet().indexOf(key) !== -1; }
  function saveToggle(key) { var l = saveGet(), i = l.indexOf(key); if (i < 0) l.unshift(key); else l.splice(i, 1); try { localStorage.setItem("ss_saved", JSON.stringify(l)); } catch (e) {} return i < 0; }
  function saveBtnHtml(key) { return '<button class="save-btn' + (saveHas(key) ? " on" : "") + '" data-save="' + esc(key) + '" aria-label="저장">⭐</button>'; }
  function renderSaved() {
    backBtn.hidden = true; tabsEl.hidden = true;
    var keys = saveGet(), players = [], teams = [], matches = [];
    keys.forEach(function (k) { var pr = k.split(":"); if (pr[0] === "player" && playersById[pr[1]]) players.push(playersById[pr[1]]); else if (pr[0] === "team" && teamsById[pr[1]]) teams.push(teamsById[pr[1]]); else if (pr[0] === "match" && fixturesById[pr[1]]) matches.push(fixturesById[pr[1]]); });
    var html = '<div class="sec-h">⭐ 저장</div>';
    if (!players.length && !teams.length && !matches.length) { viewEl.innerHTML = html + '<div class="empty">아직 저장한 항목이 없어요.<br>선수·나라·경기 상세에서 ⭐ 를 눌러 찜해보세요!</div>'; return; }
    if (teams.length) html += '<div class="sv-sub">나라</div><div class="grid">' + teams.map(function (t) { return '<div class="player-row" data-team="' + esc(t.id) + '"><span class="rank-flag" style="font-size:24px">' + esc(t.flag || "🏳") + '</span><div class="player-main"><div class="player-name">' + esc(t.name) + '</div><div class="player-sub">대표팀</div></div></div>'; }).join("") + "</div>";
    if (matches.length) html += '<div class="sv-sub">경기</div><div class="grid">' + matches.map(function (fx) { var ta = teamsById[fx.homeId], tb = teamsById[fx.awayId]; var nm = (ta ? ta.flag + " " + ta.name : "?") + " vs " + (tb ? tb.flag + " " + tb.name : "?"); return '<div class="player-row" data-match="' + esc(fx.id) + '"><div class="player-main"><div class="player-name">' + esc(nm) + '</div><div class="player-sub">' + esc((fmtDate(fxDate(fx)) || {}).d || fx.date || "") + "</div></div></div>"; }).join("") + "</div>";
    if (players.length) html += '<div class="sv-sub">선수</div><div class="grid">' + players.map(function (p) { return playerRow(p, true); }).join("") + "</div>";
    viewEl.innerHTML = html; twem(viewEl); pageAd();
  }

  // ===================== 선수 랭킹 (검색 탭 기본 화면) =====================
  var rankSort = "ovr", rankPos = "all", rankLimit = 30, RANK_STATS = null;
  var RDIMS = ["공격력", "수비력", "스피드", "테크닉", "피지컬", "골결정력"];
  function rankMetric(p) {
    if (rankSort === "rating") { var s = RANK_STATS && RANK_STATS[p.id]; return s ? s.avg : -1; }
    if (RDIMS.indexOf(rankSort) >= 0) return (p.power && p.power[rankSort] != null) ? p.power[rankSort] : -1;
    return p.ovr || 0;
  }
  function rankCard(p, rank) {
    var t = teamsById[teamIdByName(p.team)], flag = t ? t.flag : "🏳";
    var sc;
    if (rankSort === "rating") { var s = RANK_STATS && RANK_STATS[p.id]; sc = s ? "⭐" + s.avg.toFixed(1) : "–"; }
    else if (RDIMS.indexOf(rankSort) >= 0) sc = (p.power && p.power[rankSort] != null) ? p.power[rankSort] : "–";
    else sc = p.ovr || "–";
    return '<div class="rank-card" data-player="' + esc(p.id) + '">' +
      '<span class="rank-no">' + rank + "</span>" +
      '<span class="rank-flag">' + esc(flag) + "</span>" +
      '<div class="rank-main"><div class="rank-name">' + esc(p.name) + "</div>" +
      '<div class="rank-sub">' + esc(posClass(p.position).toUpperCase()) + " · " + esc(p.team) + "</div></div>" +
      '<span class="rank-score">' + esc(sc) + "</span></div>";
  }
  function paintRanking() {
    var wrap = viewEl.querySelector(".rank-wrap");
    if (!wrap) return;
    var list = DATA.players.slice();
    if (rankPos !== "all") list = list.filter(function (p) { return posClass(p.position) === rankPos; });
    if (RDIMS.indexOf(rankSort) >= 0) list = list.filter(function (p) { return p.power; });  // 지수 정렬은 레이더 보유 선수만
    list.sort(function (a, b) { var d = rankMetric(b) - rankMetric(a); return d || (b.ovr || 0) - (a.ovr || 0); });
    var shown = list.slice(0, rankLimit);
    var sorts = [["ovr", "종합"], ["공격력", "공격력"], ["골결정력", "골결정력"], ["스피드", "스피드"], ["테크닉", "테크닉"], ["피지컬", "피지컬"], ["수비력", "수비력"], ["rating", "평점"]];
    var sortUi = '<div class="rank-sorts">' + sorts.map(function (s) { return '<button class="rank-sb' + (rankSort === s[0] ? " on" : "") + '" data-rsort="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>";
    var posF = [["all", "전체"], ["fw", "FW"], ["mf", "MF"], ["df", "DF"], ["gk", "GK"]];
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
      paintRanking(); pageAd();
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
    viewEl.innerHTML = html; pageAd();
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

  function powerRadar(pw) {
    var dims = [["공격력", pw["공격력"]], ["골결정력", pw["골결정력"]], ["스피드", pw["스피드"]], ["수비력", pw["수비력"]], ["피지컬", pw["피지컬"]], ["테크닉", pw["테크닉"]]];
    var cx = 170, cy = 160, R = 105, angs = [-90, -30, 30, 90, 150, 210];
    function pt(v, i) { var a = angs[i] * Math.PI / 180; return [cx + (v / 100) * R * Math.cos(a), cy + (v / 100) * R * Math.sin(a)]; }
    function ring(f) { return angs.map(function (a) { var r = a * Math.PI / 180; return (cx + f * R * Math.cos(r)).toFixed(1) + "," + (cy + f * R * Math.sin(r)).toFixed(1); }).join(" "); }
    var grid = [0.25, 0.5, 0.75, 1].map(function (f) { return '<polygon points="' + ring(f) + '" fill="none" stroke="#2a3a5c" stroke-width="1"/>'; }).join("") +
      angs.map(function (a) { var r = a * Math.PI / 180; return '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(r)).toFixed(1) + '" y2="' + (cy + R * Math.sin(r)).toFixed(1) + '" stroke="#2a3a5c" stroke-width="1"/>'; }).join("");
    var poly = dims.map(function (d, i) { var q = pt(d[1] || 0, i); return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ");
    var dots = dims.map(function (d, i) { var q = pt(d[1] || 0, i); return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.5" fill="#4f8cff"/>'; }).join("");
    var labels = dims.map(function (d, i) { var r = angs[i] * Math.PI / 180, lx = cx + (R + 26) * Math.cos(r), ly = cy + (R + 26) * Math.sin(r), anc = Math.abs(Math.cos(r)) < 0.3 ? "middle" : (Math.cos(r) > 0 ? "start" : "end"); return '<text x="' + lx.toFixed(0) + '" y="' + (ly + 4).toFixed(0) + '" class="pr-lbl" font-size="15" font-weight="700" text-anchor="' + anc + '">' + d[0] + " " + (d[1] || 0) + "</text>"; }).join("");
    var radar = '<svg viewBox="-25 0 390 315" class="pw-radar">' + grid + '<polygon points="' + poly + '" fill="rgba(79,140,255,.28)" stroke="#4f8cff" stroke-width="2.5"/>' + dots + labels + "</svg>";
    var bars = dims.slice().sort(function (a, b) { return (b[1] || 0) - (a[1] || 0); }).map(function (d) {
      var v = d[1] || 0, col = v >= 85 ? "#4f8cff" : v >= 70 ? "#5bbf8a" : v >= 55 ? "#f0a93b" : "#e5748a";
      return '<div class="pw-bar"><span class="pw-bn">' + d[0] + '</span><div class="pw-bt"><div class="pw-bf" style="width:' + v + "%;background:" + col + '"></div></div><span class="pw-bv">' + v + "</span></div>";
    }).join("");
    return '<div class="block"><h3>⚡ 능력치 <span class="muted-note">자체 지수</span></h3><div class="pw-radarwrap">' + radar + "</div>" + bars + "</div>";
  }
  // 능력치 카드 이미지(공유용) — 캔버스로 임팩트 있게 그려서 Web Share / 다운로드
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function gradeColor(grade) { return grade === "월드클래스" ? "#f5b301" : grade === "주전급" ? "#5bbf8a" : grade === "유망주" ? "#36c2d6" : "#4f8cff"; }
  function playerCardCanvas(p) {
    var W = 720, H = 760, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), ac = gradeColor(p.grade);
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#1b2d60"); g.addColorStop(.55, "#0c1530"); g.addColorStop(1, "#070d18"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rgl = c.createRadialGradient(W / 2, 450, 20, W / 2, 450, 300); rgl.addColorStop(0, hexA(ac, .16)); rgl.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = rgl; c.fillRect(0, 200, W, 480);
    c.textAlign = "left"; c.fillStyle = "#fff"; c.font = "900 30px -apple-system,sans-serif"; c.fillText("KICKTALK", 40, 62); c.fillStyle = ac; c.font = "bold 19px -apple-system,sans-serif"; c.fillText("2026 월드컵 능력치 분석", 205, 60);
    c.fillStyle = "#fff"; c.font = "bold 50px -apple-system,sans-serif"; c.fillText(String(p.name).slice(0, 14), 40, 146);
    c.fillStyle = "#aeb8cc"; c.font = "500 22px -apple-system,sans-serif"; c.fillText(((p.position || "") + " · " + (p.club || "")).slice(0, 36), 40, 180);
    c.font = "bold 22px -apple-system,sans-serif"; var gtxt = p.grade || "", gw = c.measureText(gtxt).width + 34;
    rr(c, 40, 200, gw, 38, 19); c.fillStyle = hexA(ac, .18); c.fill(); c.strokeStyle = ac; c.lineWidth = 1.5; c.stroke(); c.fillStyle = ac; c.fillText(gtxt, 57, 226);
    c.beginPath(); c.arc(W - 80, 116, 56, 0, 7); c.fillStyle = hexA(ac, .15); c.fill(); c.strokeStyle = ac; c.lineWidth = 3; c.stroke();
    c.textAlign = "center"; c.fillStyle = "#fff"; c.font = "900 50px -apple-system,sans-serif"; c.fillText(String(p.ovr || ""), W - 80, 128); c.fillStyle = ac; c.font = "bold 16px sans-serif"; c.fillText("OVR", W - 80, 156);
    var pw = p.power, K = ["공격력", "골결정력", "스피드", "수비력", "피지컬", "테크닉"], dims = K.map(function (k) { return [k, (pw[k] || 0)]; });
    var cx = W / 2, cy = 450, R = 168, angs = [-90, -30, 30, 90, 150, 210].map(function (a) { return a * Math.PI / 180; });
    c.strokeStyle = "rgba(130,148,186,.32)"; c.lineWidth = 1.5;
    [0.25, 0.5, 0.75, 1].forEach(function (f) { c.beginPath(); angs.forEach(function (a, i) { var x = cx + f * R * Math.cos(a), y = cy + f * R * Math.sin(a); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.stroke(); });
    angs.forEach(function (a) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); c.stroke(); });
    c.save(); c.shadowColor = ac; c.shadowBlur = 24;
    c.beginPath(); dims.forEach(function (d, i) { var v = d[1] / 100, x = cx + v * R * Math.cos(angs[i]), y = cy + v * R * Math.sin(angs[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
    c.fillStyle = hexA(ac, .40); c.fill(); c.strokeStyle = ac; c.lineWidth = 3.5; c.stroke(); c.restore();
    c.font = "bold 22px -apple-system,sans-serif";
    dims.forEach(function (d, i) { var v = d[1] / 100, x = cx + v * R * Math.cos(angs[i]), y = cy + v * R * Math.sin(angs[i]); c.fillStyle = ac; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); var lx = cx + (R + 34) * Math.cos(angs[i]), ly = cy + (R + 34) * Math.sin(angs[i]), ca = Math.cos(angs[i]); c.fillStyle = "#e6edf8"; c.textAlign = Math.abs(ca) < 0.3 ? "center" : (ca > 0 ? "left" : "right"); c.fillText(d[0] + " " + d[1], lx, ly + 7); });
    rr(c, 40, H - 80, W - 80, 52, 26); c.fillStyle = ac; c.fill();
    c.textAlign = "center"; c.fillStyle = "#0a1020"; c.font = "900 25px -apple-system,sans-serif"; c.fillText("kicktalk.xyz  ·  전 선수 능력치 무료 분석", W / 2, H - 46);
    return cv;
  }
  function shareMatch(fx) {
    if (!fx || !fx.homeId || !fx.awayId) return;
    var url = "https://kicktalk.xyz/m/" + fx.homeId + "-vs-" + fx.awayId + ".html";  // 경기별 OG 페이지(카톡 썸네일) — 깔끔한 URL. 처음 공유되는 경기는 캐시 없어 새 디자인 정상 표시
    var txt = fx.homeName + " vs " + fx.awayName + " — 라인업·실시간·평점 | 킥톡";
    if (navigator.share) { navigator.share({ text: txt, url: url }).catch(function () {}); }  // title 생략 — title+text 중복 시 카톡에 텍스트 2번 나옴
    else if (navigator.clipboard) { navigator.clipboard.writeText(url).then(function () { ktToast("🔗 링크 복사됨! 카톡·커뮤니티에 붙여넣기"); }).catch(function () { ktToast(url); }); }
    else ktToast(url);
  }
  function sharePlayerCard(p) {
    if (!p || !p.power) return;
    playerCardCanvas(p).toBlob(function (blob) {
      if (!blob) return;
      var fname = (p.id || "player") + "-kicktalk.png";
      try {
        var file = new File([blob], fname, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: p.name + " 능력치", text: p.name + " — 킥톡 2026 월드컵 능력치 · kicktalk.xyz" }).catch(function () {});
          return;
        }
      } catch (e) {}
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    }, "image/png");
  }
  // 경기 결과 공유 카드(캔버스) — 스코어·득점자·팬MVP
  function matchCardCanvas(fx, lv, momName) {
    var swap = (fx.awayId === "south-korea");
    var lId = swap ? fx.awayId : fx.homeId, lName = swap ? fx.awayName : fx.homeName;
    var rId = swap ? fx.homeId : fx.awayId, rName = swap ? fx.homeName : fx.awayName;
    var lS = lv ? (swap ? lv.as : lv.hs) : 0, rS = lv ? (swap ? lv.hs : lv.as) : 0;
    var leftG = [], rightG = [];  // 득점자 좌(홈쪽)/우(원정쪽) 분리 — 경기카드처럼
    ((lv && lv.events) || []).forEach(function (g) {
      var p = playerByName(g.who); if (!p) return;
      var team = g.og ? (p.team === fx.homeName ? fx.awayName : fx.homeName) : p.team;  // 자책골은 상대팀 득점
      var txt = "⚽ " + pitchSurname(p.name, p.id) + (g.og ? " (OG)" : "") + (g.clk ? " " + g.clk : "");
      (team === lName ? leftG : rightG).push(txt);
    });
    var maxN = Math.max(leftG.length, rightG.length), gEnd = maxN ? 300 + maxN * 32 : 290;
    var W = 720, H = gEnd + (momName ? 42 : 0) + 78;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var c = cv.getContext("2d");
    var light = document.documentElement.classList.contains("light");  // 앱 테마 따라감
    var C = light ? { b1: "#ffffff", b2: "#eef2f8", b3: "#e1e8f3", name: "#1c2536", sub: "#62718c", faint: "#8a97ab", acc: "#2f6fe0", gold: "#c98e00", barTxt: "#ffffff" }
                  : { b1: "#1b2d60", b2: "#0c1530", b3: "#070d18", name: "#eaf0fb", sub: "#9fb0cc", faint: "#7e8da6", acc: "#4f8cff", gold: "#f5b301", barTxt: "#0a1020" };
    var bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, C.b1); bg.addColorStop(.55, C.b2); bg.addColorStop(1, C.b3); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.textAlign = "left"; c.fillStyle = C.name; c.font = "900 30px -apple-system,sans-serif"; c.fillText("KICKTALK", 40, 60);
    c.fillStyle = C.acc; c.font = "bold 19px -apple-system,sans-serif"; c.fillText("2026 월드컵 · 경기 결과", 205, 58);
    c.textAlign = "center";
    c.font = "62px -apple-system,sans-serif"; c.fillText(flagOf(lId), 150, 198); c.fillText(flagOf(rId), 570, 198);
    c.fillStyle = C.name; c.font = "bold 25px -apple-system,sans-serif"; c.fillText(String(lName).slice(0, 9), 150, 248); c.fillText(String(rName).slice(0, 9), 570, 248);
    c.fillStyle = C.name; c.font = "900 74px -apple-system,sans-serif"; c.fillText((lS | 0) + " : " + (rS | 0), 360, 205);
    c.fillStyle = C.sub; c.font = "600 21px -apple-system,sans-serif"; c.fillText(lv && lv.state === "post" ? "경기 종료" : ((lv && lv.clock) || "진행 중"), 360, 246);
    if (maxN) {
      c.font = "500 22px -apple-system,sans-serif"; c.fillStyle = C.name;
      for (var gi = 0; gi < maxN; gi++) {
        if (leftG[gi]) c.fillText(leftG[gi], 162, 300 + gi * 32);
        if (rightG[gi]) c.fillText(rightG[gi], 558, 300 + gi * 32);
      }
    }
    if (momName) { c.fillStyle = C.gold; c.font = "bold 24px -apple-system,sans-serif"; c.fillText("🏅 팬 MVP  " + momName, 360, gEnd + 24); }
    rr(c, 40, H - 70, W - 80, 50, 25); c.fillStyle = C.acc; c.fill();
    c.fillStyle = C.barTxt; c.font = "900 23px -apple-system,sans-serif"; c.fillText("kicktalk.xyz · 라인업·평점·응원 같이 보기", W / 2, H - 37);
    return cv;
  }
  function shareMatchResult(fx) {
    var lv = LIVE[fx.id];
    (window.KickComments && KickComments.matchMvp ? KickComments.matchMvp(fx.id) : Promise.resolve({})).then(function (md) {
      var votes = (md && md.votes) || {}, top = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0];
      var momName = (top && playersById[top]) ? playersById[top].name : "";
      var hs = lv ? (lv.hs | 0) : 0, as = lv ? (lv.as | 0) : 0;
      var url = (fx.homeId && fx.awayId) ? "https://kicktalk.xyz/m/" + fx.homeId + "-vs-" + fx.awayId + ".html" : "https://kicktalk.xyz";
      var txt = fx.homeName + " " + hs + " : " + as + " " + fx.awayName + " — 경기 결과·평점·MVP | 킥톡\n" + url;  // 공유 시 URL 텍스트 동봉
      matchCardCanvas(fx, lv, momName).toBlob(function (blob) {
        if (!blob) return;
        var fname = fx.id + "-kicktalk.png";
        try { var file = new File([blob], fname, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: fx.homeName + " vs " + fx.awayName + " 결과", text: txt, url: url }).catch(function () {}); return; } } catch (e) {}
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { ktToast("🖼️ 이미지 저장 + 🔗 링크 복사됨"); }).catch(function () {});  // 다운로드 폴백: URL도 클립보드에
      }, "image/png");
    });
  }
  // ===== 선수 비교(레이더 겹쳐보기) =====
  var CMP_KEYS = ["공격력", "골결정력", "스피드", "수비력", "피지컬", "테크닉"];
  var cmpA = null;
  function compareRadar(pwA, pwB) {
    var cx = 170, cy = 160, R = 105, angs = [-90, -30, 30, 90, 150, 210];
    function rpf(f) { return angs.map(function (a) { var r = a * Math.PI / 180; return (cx + f * R * Math.cos(r)).toFixed(1) + "," + (cy + f * R * Math.sin(r)).toFixed(1); }).join(" "); }
    var grid = [0.25, 0.5, 0.75, 1].map(function (f) { return '<polygon points="' + rpf(f) + '" fill="none" stroke="#2a3a5c" stroke-width="1"/>'; }).join("") +
      angs.map(function (a) { var r = a * Math.PI / 180; return '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(r)).toFixed(1) + '" y2="' + (cy + R * Math.sin(r)).toFixed(1) + '" stroke="#2a3a5c"/>'; }).join("");
    function poly(pw, col, fl) { var pts = CMP_KEYS.map(function (k, i) { var a = angs[i] * Math.PI / 180, v = (pw[k] || 0) / 100; return (cx + v * R * Math.cos(a)).toFixed(1) + "," + (cy + v * R * Math.sin(a)).toFixed(1); }).join(" "); return '<polygon points="' + pts + '" fill="' + fl + '" stroke="' + col + '" stroke-width="2.5"/>'; }
    var labels = CMP_KEYS.map(function (k, i) { var r = angs[i] * Math.PI / 180, lx = cx + (R + 26) * Math.cos(r), ly = cy + (R + 26) * Math.sin(r), anc = Math.abs(Math.cos(r)) < 0.3 ? "middle" : (Math.cos(r) > 0 ? "start" : "end"); return '<text x="' + lx.toFixed(0) + '" y="' + (ly + 4).toFixed(0) + '" class="pr-lbl" font-size="14" font-weight="700" text-anchor="' + anc + '">' + k + "</text>"; }).join("");
    return '<svg viewBox="-25 0 390 315" class="pw-radar">' + grid + poly(pwA, "#4f8cff", "rgba(79,140,255,.22)") + poly(pwB, "#f0a93b", "rgba(240,169,59,.20)") + labels + "</svg>";
  }
  function paintCmpResults(q) {
    var box = viewEl.querySelector(".cmp-results"); if (!box) return;
    var nq = (q || "").trim().toLowerCase();
    var list = DATA.players.filter(function (p) { return p.id !== cmpA && (!nq || (p.name + " " + (p.nameEn || "")).toLowerCase().indexOf(nq) !== -1); });
    list.sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
    box.innerHTML = list.slice(0, 40).map(function (p) { return '<div class="player-row" data-cmp-pick="' + esc(p.id) + '">' + numBadge(p) + '<div class="player-main"><div class="player-name">' + esc(p.name) + '</div><div class="player-sub">' + esc(p.team) + "</div></div></div>"; }).join("");
    twem(box);
  }
  function renderCompare(aId, bId) {
    backBtn.hidden = false; tabsEl.hidden = true;
    var A = playersById[aId];
    if (!A) { viewEl.innerHTML = '<div class="empty">선수를 찾을 수 없어요.</div>'; return; }
    cmpA = aId;
    var B = bId ? playersById[bId] : null;
    if (!B) {
      viewEl.innerHTML = '<div class="sec-h">⚖️ 선수 비교</div><div class="cmp-pick-a"><b>' + esc(A.name) + '</b> <span class="muted-note">와 비교할 선수를 골라주세요</span></div><input class="cmp-search" placeholder="선수 검색 (예: 음바페, 케인)"><div class="cmp-results"></div>';
      paintCmpResults("");
      var si = viewEl.querySelector(".cmp-search"); if (si) si.addEventListener("input", function () { paintCmpResults(this.value); });
      return;
    }
    var rows = ["공격력", "수비력", "스피드", "테크닉", "피지컬", "골결정력"].map(function (k) { var va = (A.power && A.power[k]) || 0, vb = (B.power && B.power[k]) || 0; return '<div class="cmp-row"><span class="cmp-v' + (va > vb ? " win" : "") + '">' + va + '</span><span class="cmp-k">' + k + '</span><span class="cmp-v' + (vb > va ? " win" : "") + '">' + vb + "</span></div>"; }).join("");
    var radar = (A.power && B.power) ? compareRadar(A.power, B.power) : '<div class="empty">능력치 데이터가 없어요.</div>';
    viewEl.innerHTML = '<div class="cmp"><div class="cmp-head"><div class="cmp-hp" data-player="' + esc(A.id) + '"><span class="lg-dot a"></span>' + esc(A.name) + '<small>OVR ' + (A.ovr || "") + '</small></div><span class="cmp-vs">VS</span><div class="cmp-hp" data-player="' + esc(B.id) + '"><span class="lg-dot b"></span>' + esc(B.name) + '<small>OVR ' + (B.ovr || "") + '</small></div></div>' +
      '<div class="pw-radarwrap">' + radar + '</div><div class="cmp-rows">' + rows + '</div>' +
      '<button class="cmp-change" data-cmp-change="' + esc(A.id) + '">↺ 다른 선수와 비교</button></div>';
    twem(viewEl);
  }
  // 이번 월드컵 출전·득점(기록탭 통계 = 크론 집계)을 A매치 기록에 가산. 통계 로드 후 비동기로 갱신.
  // ★단일 진실원천(경기 득점): 종료경기 결과(match_results, 데몬이 1분마다 갱신·앱과 동일 매칭)에서 선수별 골 집계.
  // 기록탭/A매치 골은 이 값과 대조(더 큰 값)해서, fetch_stats 누락으로 '경기상세엔 있는데 기록엔 없는' 불일치를 원천 차단.
  function goalsFromResults() {
    var m = {};
    Object.keys(LIVE).forEach(function (mid) {
      var lv = LIVE[mid]; if (!lv || !lv.events || !lv.events.length) return;
      var fx = fixturesById[mid]; if (!fx) return;
      var hk = (teamsById[fx.homeId] || {}).name, ak = (teamsById[fx.awayId] || {}).name;
      lv.events.forEach(function (g) {
        if (!g.who) return;
        var pl = playerByName(g.who, hk) || playerByName(g.who, ak) || playerByName(g.who);
        if (!pl) return;
        var e = m[pl.id] || (m[pl.id] = { g: 0, og: 0 });
        if (g.og) e.og++; else e.g++;
      });
    });
    return m;
  }
  function applyWcAmatch(p, id) {
    if (posClass(p.position) === "gk") return;  // 골키퍼는 실점/무실점(gk.json)을 정적 표시 — 가산 안 함
    ensureStats().then(function (j) {
      var hh = parseHash(); if (hh.name !== "player" || hh.id !== id) return;
      var st = ((j && j.players) || []).filter(function (x) { return x.pid === p.id; })[0];
      var gr = goalsFromResults()[p.id] || { g: 0 };
      var wg = Math.max(st ? (st.goals || 0) : 0, gr.g);  // 골: 경기결과와 대조(누락 방지)
      var wa = Math.max(st ? (st.apps || 0) : 0, wg > 0 ? 1 : 0);  // 득점=출전 보장
      if (!wa && !wg) return;
      var vEl = null, fs = viewEl.querySelectorAll(".facts .fact");
      Array.prototype.forEach.call(fs, function (f) { var k = f.querySelector(".k"); if (k && k.textContent.indexOf("A매치") >= 0) vEl = f.querySelector(".v"); });
      if (!vEl) return;
      var caps = (p.caps != null ? p.caps : 0) + wa, goals = (p.intlGoals != null ? p.intlGoals : 0) + wg;
      var isGK = posClass(p.position) === "gk";  // 골키퍼는 득점 표시 안 함
      vEl.innerHTML = caps + "경기" + (isGK ? "" : " · " + goals + "골") + ' <span class="wc-add">이번 월드컵 ' + (wa ? wa + "경기" : "") + (wa && wg && !isGK ? "·" : "") + (wg && !isGK ? wg + "골" : "") + "</span>";
    });
  }
  // 선수 키·몸무게(cm/kg) — scripts/fetch_bio.js가 ESPN bio에서 자동수집해 마커 사이 갱신(경기 출전선수 위주).
  var PLAYER_BIO = {};  // 키·몸무게(cm/kg) — bio.json에서 로드(scripts/fetch_bio.js 생성), app.js 경량화
  (function(){ if(!window.fetch) return; fetch("bio.json?b=2").then(function(r){return r.json();}).then(function(d){ if(d) Object.assign(PLAYER_BIO, d); var h=parseHash(); if(h.name==="player"&&h.id) renderPlayer(h.id); }).catch(function(){}); })();
  // 골키퍼 국가대표 실점·무실점 — gk.json(나무위키 등 정확 소스 수집). {pid:{g:경기,c:실점,cs:무실점}}
  var PLAYER_GK = {};
  (function(){ if(!window.fetch) return; fetch("gk.json?b=1").then(function(r){return r.json();}).then(function(d){ if(d) Object.assign(PLAYER_GK, d); var h=parseHash(); if(h.name==="player"&&h.id) renderPlayer(h.id); }).catch(function(){}); })();
  function renderPlayer(id) {
    var p = playersById[id];
    if (!p) { viewEl.innerHTML = '<div class="empty">선수를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false;
    tabsEl.hidden = true;

    var ovr = p.ovr || 0;
    var team = teamsById[teamIdByName(p.team)];

    var bio = PLAYER_BIO[p.id] || {};
    var pH = p.height || bio.h, pW = p.weight || bio.w;  // 키(cm)·몸무게(kg) — ESPN bio 자동수집(fetch_bio.js)
    var facts = [
      ["포지션", posClass(p.position).toUpperCase()],
      ["나이", (p.age != null ? p.age + "세" : "-")],
    ];
    // 좌: A매치 기록, 우: 키·몸무게(나이 밑) — 2열 그리드 순서
    var isGK = posClass(p.position) === "gk";  // 골키퍼는 득점 대신 실점·무실점(있으면)
    var gk = PLAYER_GK[p.id];
    var amatch;
    if (isGK && gk) amatch = gk.g + "경기 · " + gk.c + "실점" + (gk.cs != null ? " · " + gk.cs + "무실점" : "");  // 정확 소스(gk.json)
    else if (p.caps != null) amatch = p.caps + "경기" + (isGK ? "" : " · " + (p.intlGoals != null ? p.intlGoals : 0) + "골");
    else amatch = "-";
    facts.push(["A매치 기록", amatch]);
    if (pH || pW) facts.push(["키 · 몸무게", [pH ? pH + "cm" : null, pW ? pW + "kg" : null].filter(Boolean).join(" · ")]);
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

    var powerHtml = p.power ? (powerRadar(p.power) + '<button class="share-card" data-share-card="' + esc(p.id) + '">📤 능력치 카드 이미지로 공유</button><button class="cmp-go" data-cmp-go="' + esc(p.id) + '">⚖️ 다른 선수와 능력치 비교</button>') : "";
    var strengths = (p.strengths || []).map(function (s) { return '<span class="tag">' + esc(s) + "</span>"; }).join("");
    var weaknesses = (p.weaknesses || []).map(function (s) { return '<span class="tag weak">' + esc(s) + "</span>"; }).join("");

    // 커리어 타임라인: honours + 이적 (연도 추출 가능하면 표시)
    var tlItems = [];
    (p.honours || []).forEach(function (h) { tlItems.push(h); });
    if (p.notableTransfer) tlItems.push(p.notableTransfer);
    tlItems = tlItems.map(function (it) {
      var ys = it.match(/\d{4}/g);
      return { text: it, yr: ys ? Math.max.apply(null, ys.map(Number)) : 0 };
    }).sort(function (a, b) { return b.yr - a.yr; });  // 최신이 맨 위
    var timeline = tlItems.map(function (o) {
      return '<div class="tl-item"><span class="tl-year">' + (o.yr || "") + '</span><span class="tl-dot"></span>' +
        '<span class="tl-text">' + esc(o.text) + "</span></div>";
    }).join("");

    viewEl.innerHTML =
      '<div class="detail">' +
        '<div class="pl-hero">' +
          posBadge(p, true) +
          '<div class="pl-meta"><div class="pl-sub">' + esc(p.club) + " · " + esc(p.league) + "</div>" +
            '<div class="pl-name">' + esc(p.name) + "</div>" +
            '<div class="detail-name-en">' + esc(p.nameEn) + "</div>" +
            '<div class="pl-badges">' + badge(p) + "</div></div>" +
          '<div class="ovr">' + saveBtnHtml("player:" + p.id) + '<span class="ovr-v">' + ovr + "</span></div>" +
        "</div>" +
        '<div class="quote">' + esc(p.oneLiner) + "</div>" +
        '<div class="facts">' + factsHtml + "</div>" +
        (p.power ? powerHtml : scoutHtml) +
        '<div class="rate-slot" data-pid="' + esc(p.id) + '"></div>' +
        '<div class="sw">' +
          '<div class="swbox pos"><h4>강점</h4><div class="tags">' + (strengths || '<span class="tag">-</span>') + "</div></div>" +
          '<div class="swbox neg"><h4>약점</h4><div class="tags">' + (weaknesses || '<span class="tag weak">-</span>') + "</div></div>" +
        "</div>" +
        (timeline ? '<div class="block"><h3>커리어</h3><div class="tl">' + timeline + "</div></div>" : "") +
        '<div class="block"><h3>이적</h3><div class="transfer">' + esc(p.notableTransfer || "-") + "</div></div>" +
        (team ? '<div class="team-link" data-team="' + esc(team.id) + '">' + esc(team.flag) + " " + esc(team.name) + " 전력 보기 →</div>" : "") +
        '<div class="adslot"></div>' +
      "</div>";
    insertAdFit(viewEl.querySelector(".adslot")); coupangBottom();
    applyWcAmatch(p, id);  // 이번 월드컵 출전·득점 반영(통계 로드 후)
  }

  function teamIdByName(name) {
    var found = DATA.teams.filter(function (t) { return t.name === name; })[0];
    return found ? found.id : null;
  }

  // ===================== 나라 상세 =====================
  function tsRows(t) {
    var fxs = (DATA.fixtures || []).filter(function (f) { return f.homeId === t.id || f.awayId === t.id; });
    fxs.sort(function (a, b) { return (matchKickoff(a) || 0) - (matchKickoff(b) || 0); });
    return fxs.map(function (f) {
      var opp = teamsById[f.homeId === t.id ? f.awayId : f.homeId];
      var oppNm = opp ? (esc(opp.flag) + " " + esc(opp.name)) : esc((f.homeId === t.id ? f.awayName : f.homeName) || "미정");
      var when = esc((fxDate(f) || "") + (fxTime(f) ? " " + fxTime(f) : ""));
      var stage = f.group ? esc(f.group + "조") : esc(f.stage || "");
      var lv = LIVE[f.id], live = !!(lv && lv.state === "in"), ended = matchEnded(f);
      var hasScore = !!(lv && (lv.state === "in" || lv.state === "post") && lv.hs != null);
      var badge;
      if (hasScore) {  // 종료/진행 경기는 우리팀 기준 스코어 표시(승=초록·무=회색·패=빨강)
        var myS = (f.homeId === t.id) ? lv.hs : lv.as, opS = (f.homeId === t.id) ? lv.as : lv.hs;
        var rcls = live ? "live" : (myS > opS ? "win" : myS < opS ? "lose" : "draw");
        badge = ' <span class="ts-score ' + rcls + '">' + (myS | 0) + " : " + (opS | 0) + (live ? " <b>LIVE</b>" : "") + "</span>";
      } else { badge = live ? ' <span class="ts-live">🔴 LIVE</span>' : ended ? ' <span class="ts-done">종료</span>' : ""; }
      return '<div class="ts-row' + (ended ? " past" : "") + '" data-match="' + esc(f.id) + '"><div class="ts-opp">🆚 ' + oppNm + badge + '</div><div class="ts-when">' + when + (stage ? " · " + stage : "") + "</div></div>";
    }).join("");
  }
  function teamSchedule(t) {
    var fxs = (DATA.fixtures || []).filter(function (f) { return f.homeId === t.id || f.awayId === t.id; });
    if (!fxs.length) return "";
    return '<div class="block"><h3>📅 경기 일정</h3><div class="ts-list">' + tsRows(t) + "</div></div>";
  }
  // 나라별 스쿼드 총 시장가치(€M) — Transfermarkt 집계(공개 보도, 2026-06 기준). 전체 DB가 아닌 '보도된 나라별 총액'을 출처 표기해 인용.
  var TEAM_MV = { france: 1520, england: 1360, spain: 1220, portugal: 1010, germany: 947, brazil: 928.2, argentina: 807.5, netherlands: 754.2, norway: 589.9, belgium: 547.5, "ivory-coast": 522.1, senegal: 478.1, turkey: 473.7, morocco: 447.7, sweden: 406.08, croatia: 387.3, "united-states": 385.6, ecuador: 368.7, uruguay: 359.3, switzerland: 332.5, colombia: 302.35, japan: 270.85, algeria: 256.9, austria: 245.2, ghana: 234.5, canada: 198.65, mexico: 191.85, "czech-republic": 188.18, scotland: 170.25, paraguay: 153.65, "bosnia-and-herzegovina": 146.4, "dr-congo": 143.9, "south-korea": 139.05, egypt: 116.48, uzbekistan: 85.33, australia: 77.45, tunisia: 69.95, haiti: 55.9, "cape-verde": 49.25, "south-africa": 49.25, "saudi-arabia": 40.68, panama: 34.55, "new-zealand": 34.45, iran: 32.05, curacao: 25.78, iraq: 21.2, jordan: 20.3, qatar: 19.93 };
  var _mvRank = null;
  function mvRank(id) { if (!_mvRank) { _mvRank = {}; Object.keys(TEAM_MV).sort(function (a, b) { return TEAM_MV[b] - TEAM_MV[a]; }).forEach(function (k, i) { _mvRank[k] = i + 1; }); } return _mvRank[id]; }
  function fmtMV(m) { if (m == null) return ""; if (m >= 1000) return "€" + (m / 1000).toFixed(2).replace(/\.?0+$/, "") + "B"; return "€" + m + "M"; }
  // 경기 헤더 밑 양팀 스쿼드 몸값 비교(시안2) — 분할 막대 + 우세 배수
  function mvCompareHtml(a, b) {
    var av = TEAM_MV[a.id], bv = TEAM_MV[b.id];
    if (av == null || bv == null) return "";
    var tot = av + bv, lp = Math.round(av / tot * 100);
    var hi = av >= bv ? a : b, ratio = Math.max(av, bv) / Math.max(0.01, Math.min(av, bv));
    var rtxt = ratio >= 1.05 ? " · 약 " + (ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)) + "배" : "";
    var note = av === bv ? "💰 스쿼드 몸값 대등" : '💰 스쿼드 몸값 <b>' + esc(hi.name) + " 우세</b>" + rtxt;
    return '<div class="block mvcmp clk" data-mvrank="' + esc(a.id) + '"><div class="mvcmp-top"><span class="mvcmp-l">' + esc(a.flag) + " " + fmtMV(av) + '</span><span class="mvcmp-r">' + fmtMV(bv) + " " + esc(b.flag) + "</span></div>" +
      '<div class="mvcmp-bar"><span class="l" style="width:' + lp + '%"></span><span class="r" style="width:' + (100 - lp) + '%"></span></div>' +
      '<div class="mvcmp-note">' + note + "</div></div>";
  }
  // 나라별 스쿼드 총 시장가치 순위 페이지 — 가로 막대 그래프, 선택 나라 강조. 행 탭하면 그 나라 상세로.
  function renderMvRank(hid) {
    backBtn.hidden = false; tabsEl.hidden = true;
    var arr = (DATA.teams || []).filter(function (t) { return TEAM_MV[t.id] != null; }).sort(function (a, b) { return TEAM_MV[b.id] - TEAM_MV[a.id]; });
    var max = arr.length ? TEAM_MV[arr[0].id] : 1;
    var rows = arr.map(function (t, i) {
      var v = TEAM_MV[t.id];
      return '<div class="mvr-row' + (t.id === hid ? " me" : "") + '" data-team="' + esc(t.id) + '"><span class="mvr-rk">' + (i + 1) + '</span><div class="mvr-mid"><div class="mvr-nm">' + esc(t.flag) + " " + esc(t.name) + '</div><div class="mvr-bar"><i style="width:' + (v / max * 100) + '%"></i></div></div><span class="mvr-v">' + fmtMV(v) + "</span></div>";
    }).join("");
    viewEl.innerHTML = '<div class="mvr"><div class="mvr-h">💰 스쿼드 총 시장가치 순위</div><div class="mvr-sub">2026 월드컵 ' + arr.length + "개국 · Transfermarkt 집계 · 참고용</div>" + rows + "</div>";
    twem(viewEl);
    if (hid) { var el = viewEl.querySelector(".mvr-row.me"); if (el) el.scrollIntoView({ block: "center" }); }
  }
  function renderTeam(id) {
    var t = teamsById[id];
    if (!t) { viewEl.innerHTML = '<div class="empty">팀을 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false;
    tabsEl.hidden = true;

    // 선수단 정렬: squadSort("pos" 기본 / "score") — 헤더 토글로 전환.
    _squadTeamId = t.id;
    var roster = sortRosterBy(DATA.players.filter(function (p) { return p.team === t.name; }), squadSort);

    // 컨트리 히어로
    var html = '<div class="detail">' +
      '<div class="country-hero">' +
        '<div class="ch-grid"></div>' +
        saveBtnHtml("team:" + t.id) +
        '<span class="team-flag lg">' + esc(t.flag) + "</span>" +
        '<div class="ch-meta"><h2>' + esc(t.name) + "</h2>" +
        '<div class="team-rank">FIFA 랭킹 ' + esc(t.fifaRank) + "위 · " + esc(t.group) + "조</div>" +
        (t.lastWc ? '<div class="team-wc">🏆 ' + (t.lastWc.inLast2022
          ? "직전 월드컵 2022 · " + esc(t.lastWc.stage)
          : (t.lastWc.year ? "최근 월드컵 " + esc(t.lastWc.year) + " · " + esc(t.lastWc.stage) : "2026 첫 본선 진출")) + "</div>" : "") +
        "</div>" +
      "</div>" +
      '<div class="quote">' + esc(t.tierSummary) + "</div>";

    // 스쿼드 총 시장가치(€) — 보도된 나라별 총액
    var mv = TEAM_MV[t.id];
    if (mv != null) {
      html += '<div class="block mv-card clk" data-mvrank="' + esc(t.id) + '"><span class="mv-ic">💰</span><div class="mv-main">' +
        '<div class="mv-k">스쿼드 총 시장가치</div>' +
        '<div class="mv-v">' + fmtMV(mv) + ' <span class="mv-rank">참전국 중 ' + mvRank(t.id) + '위</span></div>' +
        '<div class="mv-src">Transfermarkt 집계 · 참고용 · 순위 보기 ›</div></div></div>';
    }

    // 최신 뉴스 (있으면) — 토스 미니앱은 숨김(외부링크·저작권)
    if (!IS_TOSS && t.news && t.news.length) {
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

    html += '<div class="team-live-slot"></div>';  // 라이브 경기 배너(이 팀이 뛰는 중이면)
    // 예상 포메이션 피치 (있으면) — 선발 확정되면 자동으로 '선발 포메이션'으로 교체
    if (t.lineup && t.lineup.length) {
      html += '<div class="block team-pitch-block"><h3 class="team-pitch-h">예상 포메이션' + (t.formation ? ' <span class="muted-note">' + esc(t.formation) + "</span>" : "") + "</h3>" +
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
          '<span class="pd-name">' + pitchNameHtml(nm, pl && pl.id) + "</span></div>";
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
    html += teamSchedule(t);

    html += "</div>";

    // 전체 선수단 (+ 정렬 토글: 포지션순/점수순)
    var rosterHtml = roster.length
      ? '<div class="grid squad-grid">' + roster.map(function (p) { return playerRow(p, false, true); }).join("") + "</div>"
      : '<div class="empty">선수 데이터를 채우는 중입니다.</div>';
    html += '<div class="sec-h squad-h"><span>전체 선수단 · ' + roster.length + '명</span>' +
      (roster.length ? '<span class="squad-sort">' +
        '<button class="ssort' + (squadSort === "pos" ? " on" : "") + '" data-squadsort="pos">포지션순</button>' +
        '<button class="ssort' + (squadSort === "score" ? " on" : "") + '" data-squadsort="score">점수순</button>' +
      '</span>' : "") + "</div>" + rosterHtml;
    html += '<div class="adslot"></div>';
    viewEl.innerHTML = html;
    insertAdFit(viewEl.querySelector(".adslot")); coupangBottom();
    loadTeamLive(t);  // 이 팀이 뛰는 중/임박이면 라이브 배너 + 선발 확정 포메이션 반영
    // 종료 경기 결과(스코어) 표시 — DB 결과 로드 후 일정 행 재렌더
    _schedTeam = t;
    window._teamSchedRefresh = function () { if (parseHash().name !== "team" || !_schedTeam) return; var el = viewEl.querySelector(".ts-list"); if (el) { el.innerHTML = tsRows(_schedTeam); twem(el); } };
    loadStoredResults();
  }
  var _schedTeam = null;

  function teamRelevantFixture(teamId) {
    var fxs = (DATA.fixtures || []).filter(function (f) { return f.homeId === teamId || f.awayId === teamId; });
    var liveF = fxs.filter(function (f) { var lv = LIVE[f.id]; return lv && lv.state === "in"; })[0];
    if (liveF) return liveF;
    var now = Date.now();
    return fxs.filter(function (f) { var ko = matchKickoff(f); return ko && now >= ko - 7200000 && now < ko + 10800000; }).sort(function (a, b) { return matchKickoff(a) - matchKickoff(b); })[0] || null;
  }
  function loadTeamLive(t) {
    var fx = teamRelevantFixture(t.id); if (!fx) return;
    var opp = teamsById[fx.homeId === t.id ? fx.awayId : fx.homeId];
    function renderBanner() {
      var banner = viewEl.querySelector(".team-live-slot"); if (!banner) return;
      var lv = LIVE[fx.id], isLive = !!(lv && lv.state === "in"), ended = !!(lv && lv.state === "post");
      var oppName = opp ? (opp.flag + " " + opp.name) : "";
      var statusH;
      if (isLive || ended) {
        var myS = (fx.homeId === t.id) ? lv.hs : lv.as, opS = (fx.homeId === t.id) ? lv.as : lv.hs;
        statusH = '<span class="tlv-badge' + (isLive ? " live" : "") + '">' + (isLive ? "🔴 " + liveClk(lv.clock) : "경기 종료") + "</span>" +
          '<span class="tlv-score">' + (myS | 0) + " : " + (opS | 0) + "</span>";
      } else { statusH = '<span class="tlv-when">⏱ ' + esc(fxTime(fx) || "곧") + " 킥오프</span>"; }
      banner.innerHTML = '<div class="team-live clickable" data-match="' + esc(fx.id) + '">' + statusH + '<span class="tlv-vs">vs ' + esc(oppName) + '</span><span class="tlv-go">경기 →</span></div>';
      twem(banner);
    }
    function updatePitch() {
      var eid = espnIdCache[fx.id]; if (eid) delete summaryCache[eid];  // 교체 반영 위해 캐시버스트
      fetchSummary(fx).then(function (d) {
        if (!d || parseHash().name !== "team") return;
        var rs = (d.rosters || []).filter(function (r) { return espnTeamId(r.team && r.team.displayName) === t.id; })[0];
        var live = LIVE[fx.id] && LIVE[fx.id].state === "in";
        var coords = rs && (live ? currentLineupCoords(rs, d.keyEvents) : espnLineupCoords(rs)); if (!coords) return;  // 경기중=실시간 라인업 / 종료=선발
        var pb = viewEl.querySelector(".team-pitch-block"); if (!pb) return;
        var bandCls = { "0": "gk", "1": "df", "1.5": "df", "2": "mf", "3": "mf", "4": "fw" };
        var dots = coords.map(function (c) {
          var enm = (c.p.athlete && c.p.athlete.displayName) || "", mp = playerByName(enm, t.name, c.p.jersey), nm = mp ? mp.name : enm;
          var pos = (c.p.position && c.p.position.abbreviation) || "", pc = bandCls[espnBand(pos)] || "mf";
          var num = c.p.jersey != null ? c.p.jersey : "";
          var x = Math.max(4, Math.min(96, c.x)), y = Math.max(6, Math.min(94, c.y));
          return '<div class="pd ' + pc + (mp ? " tappable" : "") + '"' + (mp ? ' data-player="' + esc(mp.id) + '"' : "") + ' style="left:' + x + "%;top:" + y + '%"><span class="pd-dot">' + esc(num) + '</span><span class="pd-name">' + pitchNameHtml(nm, mp && mp.id) + "</span></div>";
        }).join("");
        var hEl = pb.querySelector(".team-pitch-h"); if (hEl) hEl.innerHTML = (live ? "현재 라인업" : "선발 포메이션") + ' <span class="muted-note">실시간 · ' + esc(rs.formation || "") + "</span>";
        var pEl = pb.querySelector(".pitch"); if (pEl) pEl.innerHTML = '<div class="pitch-line halfway"></div><div class="pitch-circle"></div>' + dots;
        twem(pb);
      }).catch(function () {});
    }
    renderBanner();
    updatePitch();
    var _tc = 0;
    window._teamLiveTick = function () { if (parseHash().name !== "team") return; renderBanner(); if ((++_tc) % 4 === 0) updatePitch(); };  // 점수 15초·교체 ~60초
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
    if (IS_TOSS || !team || !team.news || !team.news.length) return "";  // 토스 미니앱은 뉴스 숨김
    var kn = team.news.slice().sort(function (a, b) { return (isKoreanSrc(a) ? 0 : 1) - (isKoreanSrc(b) ? 0 : 1); }).slice(0, max || 3);
    return '<div class="mn-team"><div class="mn-h"><span class="mn-flag">' + esc(team.flag) + "</span>" + esc(team.name) + " 주요 소식</div>" +
      '<div class="news-list">' + kn.map(newsItemHtml).join("") + "</div></div>";
  }
  // 경기 예상 라인업 피치(두 팀 마주보기) — 자체 t.lineup 기반(경기 전에도 항상)
  function normName(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/ø/g, "o").replace(/ł/g, "l").replace(/đ/g, "d").replace(/ð/g, "d").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss").replace(/þ/g, "th").replace(/[^a-z ]/g, "").trim(); }  // 터키 ı 등 NFD로 안 풀리는 글자 매핑(매칭 실패 방지)
  var _nameMap = null, _teamNameMap = null, _teamNumMap = null;
  function playerByName(nm, teamKo, jersey) {
    if (!_nameMap) {
      _nameMap = {}; _teamNameMap = {}; _teamNumMap = {};
      (DATA.players || []).forEach(function (p) { if (!p.nameEn) return; if (p.team && p.number != null) _teamNumMap[p.team + "|" + p.number] = p; [p.nameEn, p.aliasEn].forEach(function (en) { if (!en) return; var n = normName(en); var sur = n.split(" ").pop(); _nameMap[n] = p; if (!_nameMap["_s" + sur]) _nameMap["_s" + sur] = p; if (p.team) { var tk = p.team + "|"; _teamNameMap[tk + n] = p; if (!_teamNameMap[tk + "_s" + sur]) _teamNameMap[tk + "_s" + sur] = p; } }); });
    }  // 별칭(aliasEn)도 매칭 — 예: 카쿠=Alejandro Romero Gamarra. teamKo 주어지면 동명이인(에밀리아노 마르티네스 아르헨/우루) 팀 우선 매칭. jersey는 같은팀 동명이인(브라질 에데르송 GK/MF) 등번호로 구분
    var n = normName(nm), sur = n.split(" ").pop();
    if (teamKo) {
      var tk = teamKo + "|";
      if (jersey != null && jersey !== "") { var jp = _teamNumMap[tk + jersey]; if (jp) { var jn = normName(jp.nameEn), ja = jp.aliasEn ? normName(jp.aliasEn) : ""; if (jn === n || ja === n || jn.split(" ").pop() === sur || (ja && ja.split(" ").pop() === sur)) return jp; } }  // 등번호 일치 + 이름도 일관될 때만(오매칭 방지)
      var tm = _teamNameMap[tk + n] || _teamNameMap[tk + "_s" + sur]; if (tm) return tm;
    }
    return _nameMap[n] || _nameMap["_s" + sur] || null;
  }
  // ESPN 포지션 약어 → 깊이밴드(0=GK,1=수비,2=미드,3=공미,4=공격) + 좌우값
  function espnBand(abbr) {
    var a = (abbr || "").toUpperCase();
    if (a === "G" || a === "GK") return 0;
    if (/^(DM|CDM)(-|$)/.test(a)) return 1.5;   // 수비형 미드 = 별도 라인(4-1-4-1 등)
    if (/AM/.test(a)) return 3;
    if (/^(F|CF|ST|SS|RF|LF|RW|LW|W)(-|$)/.test(a)) return 4;
    if (/^(CM|RM|LM|M)(-|$)/.test(a)) return 2;
    if (/^(CD|CB|RB|LB|RWB|LWB|WB|D)(-|$)/.test(a)) return 1;
    return 2;
  }
  function espnSideV(abbr) {
    var a = (abbr || "").toUpperCase();
    var s = /-L$/.test(a) ? -2 : /-R$/.test(a) ? 2 : /^L/.test(a) ? -2 : /^R/.test(a) ? 2 : 0;
    if (/B$/.test(a) && s) s *= 1.4;
    return s;
  }
  function espnLineupCoords(rs) {
    var starters = (rs.roster || []).filter(function (p) { return p.starter && p.athlete && p.athlete.displayName; });  // 이름 없는 슬롯 제외(빈 동그라미 방지)
    if (starters.length < 9) return null;
    var bands = {};
    starters.forEach(function (p) { var abbr = (p.position && p.position.abbreviation) || ""; var bk = espnBand(abbr); (bands[bk] = bands[bk] || []).push({ p: p, sv: espnSideV(abbr), fp: p.formationPlace || 0 }); });
    // 사용된 라인(밴드)만 GK(뒤)→최전방 사이에 '균등 분포' → 공격/미드/수비 간격 일정하게
    var usedBands = Object.keys(bands).map(Number).sort(function (a, b) { return a - b; });
    var n = usedBands.length, out = [];
    usedBands.forEach(function (bk, bi) {
      var y = n <= 1 ? 50 : 86 - (bi / (n - 1)) * 74;  // 86(골키퍼) ~ 12(최전방) 균등
      var arr = bands[bk];
      arr.sort(function (x, y2) { return (x.sv - y2.sv) || (x.fp - y2.fp); });
      arr.forEach(function (it, i) { out.push({ p: it.p, x: arr.length === 1 ? 50 : (i + 0.5) / arr.length * 100, y: y }); });
    });
    return out;
  }
  // 현재 '뛰고 있는' 11명 — 선발 좌표에서 교체된 선수를 들어온 선수로 교체(위치 유지)
  function currentLineupCoords(rs, keyEvents) {
    var coords = espnLineupCoords(rs); if (!coords) return null;
    var rosterByName = {};
    (rs.roster || []).forEach(function (p) { var n = p.athlete && p.athlete.displayName; if (n) rosterByName[n] = p; });
    (keyEvents || []).forEach(function (ev) {
      if (!/substitution/i.test((ev.type && ev.type.type) || "")) return;
      var parts = (ev.participants || []).map(function (a) { return a.athlete; }).filter(Boolean);
      if (parts.length < 2) return;
      var inA = parts[0], outName = parts[1].displayName;
      var slot = coords.filter(function (c) { return (c.p.athlete && c.p.athlete.displayName) === outName; })[0];
      if (!slot) return;  // 다른 팀 교체
      var inEntry = rosterByName[inA.displayName];
      slot.p = { athlete: inA, jersey: inEntry ? inEntry.jersey : "", position: slot.p.position };  // 위치는 나간 선수 자리 유지
    });
    return coords;
  }
  // 라이브 경기 요약(summary)에서 이 경기 기록 집계 → DB 경기별 행에 즉시 반영(크론과 동일 키)
  function computeMatchPlayers(d) {
    var m = {};
    function mb(nm, field, teamId) {
      var p = playerByName(nm), k = p ? p.id : ("n:" + nm);
      var r = m[k] || (m[k] = { key: k, name: p ? p.name : nm, pid: p ? p.id : null, flag: "", team: "", goals: 0, assists: 0, og: 0, yellow: 0, red: 0, apps: 0 });
      r[field]++;
      if (!r.flag && teamId) { var t = teamsById[teamId]; if (t) { r.flag = t.flag; r.team = t.name; } }
    }
    (d.keyEvents || []).forEach(function (ev) {
      var ty = ((ev.type && ev.type.type) || "").toLowerCase(), txt = (ev.shortText || ev.text || "");
      var parts = (ev.participants || ev.athletesInvolved || []).map(function (a) { return (a.athlete || {}).displayName; }).filter(Boolean);
      var evT = ev.team ? espnTeamId(ev.team.displayName) : null;
      if (/own.?goal/.test(ty)) { if (parts[0]) mb(parts[0], "og", evT); }
      else if (/goal|scored/.test(ty) && !/missed|saved|disallow/.test(ty + txt.toLowerCase())) { if (parts[0]) mb(parts[0], "goals", evT); if (parts[1]) mb(parts[1], "assists", evT); }
      else if (/yellow.?card/.test(ty)) { if (parts[0]) mb(parts[0], "yellow", evT); }
      else if (/red.?card/.test(ty)) { if (parts[0]) mb(parts[0], "red", evT); }
    });
    var seen = {};
    (d.rosters || []).forEach(function (rs) { (rs.roster || []).forEach(function (pl) { if (pl.starter && pl.athlete && pl.athlete.displayName) seen[pl.athlete.displayName] = 1; }); });
    (d.keyEvents || []).forEach(function (ev) { if (/substitution/i.test((ev.type && ev.type.type) || "")) { var inA = ((ev.participants || [])[0] || {}).athlete; if (inA && inA.displayName) seen[inA.displayName] = 1; } });
    Object.keys(seen).forEach(function (nm) { mb(nm, "apps"); });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function pitchSVG(plA, plB) {
    var W = 720, H = 440, padX = 0.08, span = 0.40;
    function side(players, left, col) {
      // 동적 배치: d.y로 라인(밴드) 클러스터링 → 라인 수에 맞춰 가로 균등 + 라인 안에서 세로 균등(입력 좌표 범위 무관, 항상 안 겹침)
      var sorted = players.slice().sort(function (p, q) { return q.y - p.y; });  // 골키퍼(높은 y) 먼저
      var bands = [], cur = null;
      sorted.forEach(function (p) { if (!cur || Math.abs(p.y - cur.ref) > 8) { cur = { ref: p.y, items: [] }; bands.push(cur); } cur.items.push(p); });
      var n = bands.length, out = [];
      bands.forEach(function (band, bi) {
        var t = n <= 1 ? 0.5 : bi / (n - 1);  // 0=골키퍼 ~ 1=최전방
        var px = left ? W * (0.05 + t * 0.36) : W * (0.95 - t * 0.36);  // 좌5→41%, 우95→59% (중앙 간격 + 양 팀 바깥)
        var items = band.items.slice().sort(function (p, q) { return p.x - q.x; });
        var m = items.length;
        items.forEach(function (d, i) {
          var py = ((m === 1 ? 0.5 : (i + 0.5) / m) * 0.80 + 0.10) * H;  // 라인 내 세로 균등(겹침 방지)
          var num = (d.number != null && d.number !== "") ? d.number : "";
          var raw = (d.name || "").replace(/\(.*?\)/g, "").trim();
          var nm = pitchName(raw, d.pid);  // 성 중복 선수만 풀네임(예: 산티아고/라울 히메네스)
          var _ov = d.pid && PITCH_OVERRIDE[d.pid];  // 오버라이드명(반 다이크 등)은 축약·줄바꿈 안 함
          if (!_ov && !(d.pid && _surnameDup[d.pid]) && nm.length > 5) nm = nm.slice(0, 4) + "…";  // 성만일 때만 길면 축약
          var _nmW = nm.split(" "), _multi = _nmW.length > 1 && !_ov;  // 풀네임은 단어마다 줄바꿈(SVG tspan), 오버라이드명은 한 줄
          var nmSvg = _multi ? _nmW.map(function (w, i) { return '<tspan x="' + px.toFixed(0) + '" dy="' + (i ? 14 : 0) + '">' + esc(w) + "</tspan>"; }).join("") : esc(nm);
          var nameFont = _multi ? 14 : 18;
          var pd = d.rate ? ' data-rate="' + esc(d.pid) + '" data-rmatch="' + esc(d.rate) + '" style="cursor:pointer"' : (d.pid ? ' data-player="' + esc(d.pid) + '"' : "");
          var rbsvg = "";
          if (d.rating != null) {
            var rc = d.rating >= 7.0 ? "#1aa55b" : d.rating >= 6.5 ? "#c99a1c" : "#cc6b22";
            var bx = px + 5, by = py - 27;
            rbsvg = '<rect x="' + bx.toFixed(0) + '" y="' + by.toFixed(0) + '" width="29" height="18" rx="3.5" fill="' + rc + '" stroke="#0b1220" stroke-width="1" class="rbox-tap" style="cursor:pointer"/>' +
              '<text x="' + (bx + 14.5).toFixed(0) + '" y="' + (by + 13.5).toFixed(0) + '" fill="#fff" font-size="13.5" font-weight="800" text-anchor="middle" style="pointer-events:none">' + d.rating.toFixed(1) + "</text>";
          }
          var ico = (d.goal ? "⚽" : "") + (d.subIn ? "🔺" : "") + (d.subOff ? "⇄" : "");  // 골·교체투입(🔺=교체로 들어온 선수)·교체아웃
          var icoSvg = ico ? '<text x="' + (px - 20).toFixed(0) + '" y="' + (py - 12).toFixed(0) + '" font-size="13" text-anchor="middle">' + ico + "</text>" : "";
          out.push('<g class="mf-p"' + pd + '><circle cx="' + px.toFixed(0) + '" cy="' + py.toFixed(0) + '" r="17" fill="' + col + '" stroke="#0b1220" stroke-width="2"/>' +
            '<text x="' + px.toFixed(0) + '" y="' + (py + 6).toFixed(0) + '" fill="#fff" font-size="17" font-weight="800" text-anchor="middle">' + esc(num) + '</text>' +
            '<text x="' + px.toFixed(0) + '" y="' + (py + 31).toFixed(0) + '" fill="#fff" font-size="' + nameFont + '" font-weight="700" text-anchor="middle" style="paint-order:stroke;stroke:rgba(0,0,0,.4);stroke-width:3px">' + nmSvg + "</text>" + rbsvg + icoSvg + "</g>");
        });
      });
      return out.join("");
    }
    var W2 = 720, H2 = 440;
    var pitch = '<rect class="mf-grass" width="' + W2 + '" height="' + H2 + '"/>' +
      '<rect x="6" y="6" width="' + (W2 - 12) + '" height="' + (H2 - 12) + '" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"/>' +
      '<line x1="' + (W2 / 2) + '" y1="6" x2="' + (W2 / 2) + '" y2="' + (H2 - 6) + '" stroke="rgba(255,255,255,.22)" stroke-width="2"/>' +
      '<circle cx="' + (W2 / 2) + '" cy="' + (H2 / 2) + '" r="54" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"/>' +
      '<rect x="6" y="' + (H2 / 2 - 82) + '" width="78" height="164" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="2"/>' +
      '<rect x="' + (W2 - 84) + '" y="' + (H2 / 2 - 82) + '" width="78" height="164" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="2"/>';
    return '<div class="mf-wrap"><svg viewBox="0 0 ' + W2 + " " + H2 + '" class="mf-pitch">' + pitch + side(plA, true, "#4f8cff") + side(plB, false, "#e5566a") + "</svg></div>";
  }
  function mfHead(a, fa, b, fb, matchId) {
    var tra = ratingBox(teamRatingOf(matchId, a.id), 2), trb = ratingBox(teamRatingOf(matchId, b.id), 2);
    return '<div class="mf-head"><span class="mf-a"><span class="mf-tm" data-team="' + esc(a.id) + '">' + esc(a.flag) + " " + esc(a.name) + '</span>' + (tra ? " " + tra : "") + " <b>" + esc(fa || "") + '</b></span><span class="mf-b"><b>' + esc(fb || "") + "</b> " + (trb ? trb + " " : "") + '<span class="mf-tm" data-team="' + esc(b.id) + '">' + esc(b.name) + " " + esc(b.flag) + "</span></span></div>";
  }
  function matchFormation(a, b) {
    if (!(a.lineup && a.lineup.length && b.lineup && b.lineup.length)) return "";
    function toPl(t) { return (t.lineup || []).map(function (d) { var p = playersById[d.playerId] || {}; return { name: p.name || "", number: p.number, x: d.x, y: d.y, pid: p.id }; }); }
    return '<h3>📋 예상 라인업 <span class="muted-note">탭하면 선수 상세</span></h3>' + mfHead(a, a.formation, b, b.formation) + pitchSVG(toPl(a), toPl(b));
  }
  function espnPitch(d, a, b, matchId) {
    var rosters = d.rosters || [];
    function rosterFor(team) { return rosters.filter(function (rs) { return espnTeamId(rs.team && rs.team.displayName) === team.id; })[0]; }
    var ra = rosterFor(a), rb = rosterFor(b);
    // ★규칙: 경기중=실시간 라인업(현재 뛰는 선수, currentLineupCoords) / 종료=선발 라인업(espnLineupCoords). 교체된 선수는 교체명단에 표시. (이 규칙 바꾸지 말 것)
    var st = (((d.header || {}).competitions || [])[0] || {}).status;
    var ended = !!(st && st.type && st.type.state === "post");
    function coordFn(rs) { return ended ? espnLineupCoords(rs) : currentLineupCoords(rs, d.keyEvents); }
    var ca = ra && coordFn(ra), cb = rb && coordFn(rb);
    if (!ca || !cb) return null;
    var em = matchEventMap(d.keyEvents);
    function toPl(coords, teamKo) { return coords.map(function (c) { var nm = (c.p.athlete && c.p.athlete.displayName) || ""; var mp = playerByName(nm, teamKo, c.p.jersey); var dn = mp ? mp.name : nm; return { name: dn, number: c.p.jersey, x: c.x, y: c.y, pid: mp && mp.id, rating: ratingOf(matchId, dn), goal: em.goals[nm] || 0, subOff: !!em.subOff[nm], subIn: !!em.subIn[nm], rate: ended && !!(mp && mp.id) ? matchId : null }; }); }
    return '<h3>📋 ' + (ended ? "선발 라인업" : "라인업") + ' <span class="muted-note">' + (ended ? "교체는 명단 참고" : "실시간 · 탭하면 상세") + "</span></h3>" + mfHead(a, ra.formation, b, rb.formation, matchId) + pitchSVG(toPl(ca, a.name), toPl(cb, b.name));
  }
  // 출전정지·경고 누적 — 기록탭의 누적 카드로 자동 산출(레드/옐2장=정지 예상)
  // 예상전략 텍스트에서 포메이션(4-3-3 등) 언급 제거 — 예상≠확정일 수 있어서
  function stripFormation(t) {
    return String(t || "")
      .replace(/\s*\d(?:-\d){2,3}\s*(?:을 바탕으로|를 바탕으로|에서는|에서|기반으로|기반|을|를|으로|로)?/g, " ")
      .replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
  }
  function loadCardWatch(slot, a, b, fx) {
    if (!slot || !window.KickComments || !KickComments.matchStats) return;
    if (fx && matchEnded(fx)) { slot.style.display = "none"; return; }  // 종료 경기엔 출전정지·경고 안 보임
    var setA = {}, setB = {};
    teamIds(a).forEach(function (id) { setA[id] = 1; }); teamIds(b).forEach(function (id) { setB[id] = 1; });
    (KickComments.ready ? KickComments.ready() : Promise.resolve()).then(function () { return KickComments.matchStats(); }).then(function (data) {
      if (parseHash().name !== "match") return;
      var players = (data && data.players) || [];
      function cards(setX) {  // 출전정지(레드 or 옐2장)만 — 경고 1장(at-risk)은 제외
        return players.filter(function (p) { return p.pid && setX[p.pid] && ((p.yellow || 0) >= 2 || (p.red || 0) >= 1); })
          .map(function (p) {
            var lb = (p.red || 0) >= 1 ? "🟥 출전정지" : "🟨🟨 경고누적 출전정지";
            return { name: p.name, lb: lb, cls: "cw-out" };
          });
      }
      var ca = cards(setA), cb = cards(setB);
      if (!ca.length && !cb.length) { slot.style.display = "none"; return; }
      function blk(team, list) { return list.length ? '<div class="cw-team">' + esc(team.flag) + " " + esc(team.name) + "</div>" + list.map(function (p) { return '<div class="cw-row ' + p.cls + '"><span class="cw-nm">' + esc(p.name) + '</span><span class="cw-lb">' + p.lb + "</span></div>"; }).join("") : ""; }
      slot.innerHTML = "<h3>⚠️ 출전정지 <span class=\"muted-note\">카드 누적 · 다음 경기</span></h3>" + blk(a, ca) + blk(b, cb);
      slot.style.display = ""; twem(slot);
    }).catch(function () { slot.style.display = "none"; });
  }
  function renderMatch(id) {
    var fx = fixturesById[id];
    if (!fx) { viewEl.innerHTML = '<div class="empty">경기를 찾을 수 없어요.</div>'; return; }
    backBtn.hidden = false; tabsEl.hidden = true;
    var a = teamsById[fx.homeId], b = teamsById[fx.awayId];
    if (fx.awayId === "south-korea" && a && b) { var _sw = a; a = b; b = _sw; }  // 대한민국 경기는 항상 한국을 왼쪽에
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
    var mf = matchFormation(a, b);
    var ia = a.indices || {}, ib = b.indices || {};
    var cmp = cmpRow("공격력", ia.attack, ib.attack) + cmpRow("수비력", ia.defense, ib.defense) +
      cmpRow("조직력", ia.organization, ib.organization) + cmpRow("경험치", ia.experience, ib.experience) +
      cmpRow("종합", pr.pa, pr.pb);
    var pv = fx.preview, previewHtml = "";
    if (pv) {
      var wpts = (pv.watchPoints || []).map(function (p) { return "<li>" + esc(stripFormation(p)) + "</li>"; }).join("");
      var strat = (pv.homeStrategy ? '<div class="strat-box"><div class="strat-team">' + esc(a.name) + '</div><div class="strat-txt">' + esc(stripFormation(pv.homeStrategy)) + "</div></div>" : "") +
        (pv.awayStrategy ? '<div class="strat-box"><div class="strat-team">' + esc(b.name) + '</div><div class="strat-txt">' + esc(stripFormation(pv.awayStrategy)) + "</div></div>" : "");
      previewHtml = (wpts ? '<div class="block"><h3>관전 포인트</h3><ul class="watch-list">' + wpts + "</ul></div>" : "") +
        (strat ? '<div class="block"><h3>예상 전략</h3><div class="strat">' + strat + "</div></div>" : "");
    }

    viewEl.innerHTML =
      '<div class="detail match-view">' +
        '<div class="match-top-btns">' + saveBtnHtml("match:" + fx.id) + '<button class="share-btn" data-share-match="' + esc(fx.id) + '" aria-label="공유">📤</button></div>' +
        '<div class="var-title"><span class="var-tag">VAR</span> 경기 분석</div>' +
        '<div class="match-meta-top">' + top + "</div>" +
        '<div class="vs-head">' +
          '<div class="vs-team" data-team="' + esc(a.id) + '"><span class="vs-flag">' + esc(a.flag) + "</span>" +
            '<span class="vs-name">' + esc(a.name) + '</span><span class="vs-rank">FIFA ' + esc(a.fifaRank) + "위</span><span class=\"vs-go\">전력 보기 ›</span></div>" +
          '<div class="vs-center"><div class="vs-x">VS</div></div>' +
          '<div class="vs-team" data-team="' + esc(b.id) + '"><span class="vs-flag">' + esc(b.flag) + "</span>" +
            '<span class="vs-name">' + esc(b.name) + '</span><span class="vs-rank">FIFA ' + esc(b.fifaRank) + "위</span><span class=\"vs-go\">전력 보기 ›</span></div>" +
        "</div>" +
        '<div class="vs-goals"></div>' +  /* 골 표기는 몸값비교 위에(스코어 바로 아래) */
        mvCompareHtml(a, b) +
        '<div class="live-btn-slot"></div>' +  /* 라이브 중(치지직 JTBC 송출 감지)이면 updScore가 버튼 채움 */
        ((MATCH_HIGHLIGHTS[fx.id] && matchEnded(fx) && !IS_TOSS) ? '<a class="hl-btn" href="' + esc(MATCH_HIGHLIGHTS[fx.id]) + '" target="_blank" rel="noopener">▶ 하이라이트 보기</a>' : "") +  /* 토스모드는 외부링크(치지직) 제거 */
        /* 경기 결과 이미지 공유 버튼 제거(우측상단 📤 공유로 일원화) */
        '<div class="block pred-slot"></div>' +
        '<div class="block bet-slot"></div>' +
        '<div class="adslot"></div>' +
        '<div class="block h2h-slot"></div>' +
        '<div class="block mf-block"' + (mf ? "" : ' style="display:none"') + ">" + (mf || "") + "</div>" +
        '<div class="block card-slot" style="display:none"></div>' +
        '<div class="block lineup-slot"></div>' +
        '<div class="mom-slot"></div>' +
        /* 선수 평점·MVP 버튼은 종료 후에만(MOM 포디움이 진입점) — 예정/진행 경기엔 표시 안 함 */
        '<div class="block"><h3>승부 예상</h3>' +
          '<div class="prob">' +
            '<div class="prob-seg a" style="width:' + pr.winA + '%">' + (pr.winA >= 12 ? pr.winA + "%" : "") + "</div>" +
            '<div class="prob-seg d" style="width:' + pr.draw + '%">' + (pr.draw >= 12 ? pr.draw + "%" : "") + "</div>" +
            '<div class="prob-seg b" style="width:' + pr.winB + '%">' + (pr.winB >= 12 ? pr.winB + "%" : "") + "</div>" +
          "</div>" +
          '<div class="prob-legend"><span>' + esc(a.name) + ' 승</span><span class="pl-draw" style="left:' + (pr.winA + pr.draw / 2) + '%">무</span><span>' + esc(b.name) + " 승</span></div>" +
        "</div>" +
        '<div class="block"><h3>전력 비교</h3>' + cmp + "</div>" +
        previewHtml +
        '<div class="adslot ad2"></div>' +
        '<div class="cmt-slot"></div>' +
        (!IS_TOSS && ((a.news && a.news.length) || (b.news && b.news.length)) ?
          '<div class="block"><h3>📰 주요 뉴스</h3>' + matchNews(a, 3) + matchNews(b, 3) + "</div>" : "") +
        '<div class="match-cta">' +
          '<button class="mbtn" data-team="' + esc(a.id) + '">' + esc(a.flag) + " " + esc(a.name) + " 분석</button>" +
          '<button class="mbtn" data-team="' + esc(b.id) + '">' + esc(b.flag) + " " + esc(b.name) + " 분석</button>" +
        "</div>" +
        '<div class="adslot adsense-slot"></div>' +  // AdSense(승인 후 활성) — 페이지 맨 끝, 방해 최소
      "</div>";
    loadH2H(viewEl.querySelector(".h2h-slot"), fx, a, b);
    loadLineup(viewEl.querySelector(".lineup-slot"), fx, a, b);
    loadMomPodium(viewEl.querySelector(".mom-slot"), fx);
    loadCardWatch(viewEl.querySelector(".card-slot"), a, b, fx);
    insertAdFit(viewEl.querySelector(".adslot")); insertAdFit(viewEl.querySelector(".ad2"), "DAN-SWWhds5NegoTMohB", "320", "50"); insertAdSense(viewEl.querySelector(".adsense-slot")); coupangBottom();

    // 라이브 자동 갱신: 스코어(VS 자리) + 라인업/이벤트
    var aIsHome = (a.id === fx.homeId);
    loadPrediction(viewEl.querySelector(".pred-slot"), fx, a, b, aIsHome);
    if (!IS_TOSS) loadBetting(viewEl.querySelector(".bet-slot"), fx, a, b, aIsHome);  // 토스 미니앱은 포인트 베팅 숨김(사행성 정책) — 무료 예측만
    if (matchEnded(fx) && window.KickComments) {  // 종료경기 정산 트리거(크론 안 기다리고 즉시)
      var _lv = LIVE[fx.id];
      if (_lv && _lv.state === "post" && _lv.hs != null && _lv.as != null && KickComments.settleWithResult) {
        KickComments.settleWithResult(fx.id, _lv.hs > _lv.as ? "home" : _lv.hs < _lv.as ? "away" : "draw");  // 최종 스코어로 즉시 정산(멱등)
      } else if (KickComments.settleMatch) { KickComments.settleMatch(fx.id); }
    }
    function updScore() {
      var lv = LIVE[fx.id], c = viewEl.querySelector(".vs-center"); if (!c) return;
      if (lv && (lv.state === "in" || lv.state === "post")) {
        var as_ = aIsHome ? lv.hs : lv.as, bs_ = aIsHome ? lv.as : lv.hs;
        c.innerHTML = '<div class="vs-score">' + (as_ | 0) + ' <span>-</span> ' + (bs_ | 0) + "</div>" +
          '<div class="vs-clock' + (lv.state === "in" ? " live" : "") + '">' + (lv.state === "post" ? "경기 종료" : esc(lv.clock || "LIVE")) + "</div>";
      }
      var gw = viewEl.querySelector(".vs-goals");  // 경기카드처럼 득점자 표시(좌=홈, 우=원정)
      if (gw) { var lg = teamGoals(fx, lv, a.name, "l"), rg = teamGoals(fx, lv, b.name, "r"); gw.innerHTML = (lg || rg) ? '<div class="vg-l">' + lg + '</div><div class="vg-r">' + rg + "</div>" : ""; twem(gw); }
      var lbs = viewEl.querySelector(".live-btn-slot");  // 치지직 JTBC 라이브 송출 감지 시 "라이브 보기" 버튼(경기종료면 숨김)
      if (lbs) { lbs.innerHTML = (!IS_TOSS && LIVE_STREAM && LIVE_STREAM.mid === fx.id && LIVE_STREAM.url && !(lv && lv.state === "post")) ? '<a class="live-btn" href="' + esc(LIVE_STREAM.url) + '" target="_blank" rel="noopener"><span class="lb-dot"></span>라이브 보기 (JTBC)</a>' : ""; }  /* 토스모드는 외부링크 제거 */
    }
    function refreshLineup() {
      var slot = viewEl.querySelector(".lineup-slot"); if (!slot) return;
      var wasOpen = !!((slot.querySelector(".lu-subs-d") || {}).open);  // 교체명단 펼침 상태 보존(라이브 새로고침 시 접힘 방지)
      var eid = espnIdCache[fx.id]; if (eid) delete summaryCache[eid];
      fetchSummary(fx).then(function (d) {
        if (!d || parseHash().name !== "match") return;
        renderLineup(slot, d, a, b, fx);
        var _det = slot.querySelector(".lu-subs-d"); if (_det && wasOpen) _det.open = true;  // 펼침 복원
        var lv = LIVE[fx.id];  // 라이브면 이 경기 기록을 즉시 DB에 반영(기록탭 새로고침 시 최신)
        if (lv && lv.state === "in" && window.KickComments && KickComments.pushMatchStats) { var pl = computeMatchPlayers(d); if (pl.length) KickComments.pushMatchStats(fx.id, pl); }
      });
    }
    // fetchLive(스코어 폴링)가 끝날 때마다 즉시 이 경기 점수 갱신(다음 20초 틱 안 기다림)
    window._matchLiveTick = function () { updScore(); var lv = LIVE[fx.id]; if ((lv && lv.state === "in") || isTimeLive(fx)) refreshLineup(); };  // 시각상 라이브면 LIVE 미설정이어도 라인업·통계 갱신
    updScore();
    var lvNow = LIVE[fx.id], ko = matchKickoff(fx);
    // 킥오프 2시간 전 ~ 종료 후까지 타이머 가동(선발 라인업 뜨자마자 자동 교체 + 라이브 스코어)
    if ((lvNow && lvNow.state === "in") || (ko && Date.now() >= ko - 7200000 && Date.now() < ko + 8400000)) {
      if (window.fetch) fetchLive();  // 전역 스코어 폴링 시동
      if (window.fetch) refreshLineup();  // 진입 즉시 1회
      var _tick = 0;
      matchLiveTimer = setInterval(function () {
        if (parseHash().name !== "match") { stopMatchLive(); return; }
        _tick++;
        updScore();
        var lv = LIVE[fx.id];
        if (lv && lv.state === "in") refreshLineup();                 // 라이브: 매 20초
        else if (lv && lv.state === "post") { refreshLineup(); stopMatchLive(); }
        else if (_tick % 3 === 0) refreshLineup();                    // 킥오프 전: 60초마다 라인업 폴링 → 뜨면 자동 반영
      }, 20000);
    }
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

    var career = (m.career || []).slice().reverse().map(function (c) {  // 최신이 맨 위
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
  var LIVE_STREAM = null;   // {mid, url, title} — 치지직 JTBC 채널 라이브 송출 감지(서버 update_live가 live_state.ls에 기록)
  var _pushedResults = {};  // 결과 중복 저장 방지
  var _livePushAt = 0;      // 라이브 공유캐시 push throttle
  var SB_PUB = "sb_publishable_AsDWJPjKDg1S5wqezB9Vtw_uxKFmE26", SB_URL = "https://jhzchgvnkwdroxfrgjvm.supabase.co";
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
      if (/disallow/i.test(txt)) return;
      var isOG = d.ownGoal === true || /own.?goal/i.test(txt) || /own.?goal/i.test((d.type && d.type.id) || "");
      var isGoal = d.scoringPlay === true || /goal/i.test(txt);
      if (!isGoal) return;
      var who = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || "";
      out.push({ who: who, clk: (d.clock && d.clock.displayValue) || "", og: isOG });
    });
    return out;
  }
  function applyEspn(d) {
    var changed = false, anyLive = false, anyToday = false, seen = {};
    (d.events || []).forEach(function (e) {
      var c = (e.competitions || [])[0]; if (!c) return;
      var comp = c.competitors || [];
      var H = comp.filter(function (t) { return t.homeAway === "home"; })[0] || comp[0];
      var A = comp.filter(function (t) { return t.homeAway === "away"; })[0] || comp[1];
      if (!H || !A) return;
      var hid = espnTeamId(H.team && H.team.displayName), aid = espnTeamId(A.team && A.team.displayName);
      if (!hid || !aid) return;
      var fid = fixByPair[[hid, aid].sort().join("|")]; if (!fid) return;
      seen[fid] = 1;
      var fx = fixturesById[fid]; if (!fx) return;
      var st = (e.status && e.status.type) || {}; var state = st.state;
      if (state === "in") anyLive = true;
      if (state === "in" || state === "post" || state === "pre") anyToday = true;
      if (state === "pre") { if (LIVE[fid]) { delete LIVE[fid]; changed = true; } return; }
      var hs = +H.score, as = +A.score;
      var ht = state === "in" && (st.name === "STATUS_HALFTIME" || st.detail === "HT" || st.description === "Halftime");  // 하프타임 감지
      var rec = {
        state: state, clock: ht ? "전반 종료" : ((e.status && e.status.displayClock) || ""),
        hs: (fx.homeId === hid) ? hs : as, as: (fx.homeId === hid) ? as : hs,
        events: parseGoals(c)
      };
      if (JSON.stringify(LIVE[fid]) !== JSON.stringify(rec)) { LIVE[fid] = rec; changed = true; }
      if (state === "post" && window.KickComments && KickComments.pushResult && !_pushedResults[fid]) { _pushedResults[fid] = 1; KickComments.pushResult(fid, rec.hs, rec.as, rec.events); }  // 결과+득점자 영구 저장
    });
    // 캐시로 복원했던 '진행중'인데 이번 ESPN 응답엔 없는 경기(=끝났거나 목록서 내려감) → 제거(유령 라이브카드 방지)
    Object.keys(LIVE).forEach(function (fid) { if (LIVE[fid] && LIVE[fid].state === "in" && LIVE[fid].cached && !seen[fid]) { delete LIVE[fid]; changed = true; } });
    saveLiveCache();
    // 공유 캐시(DB)에도 라이브 상태 저장 → 새로 접속한 사용자도 빠르게 받음. 변동 있을 때 20초 throttle.
    if (changed && window.KickComments && KickComments.pushLiveState && Date.now() - _livePushAt > 20000) {
      _livePushAt = Date.now();
      var lm = {}; Object.keys(LIVE).forEach(function (k) { if (LIVE[k] && LIVE[k].state === "in") lm[k] = { state: "in", hs: LIVE[k].hs, as: LIVE[k].as, clock: LIVE[k].clock, events: LIVE[k].events }; });
      KickComments.pushLiveState({ t: Date.now(), live: lm, ls: LIVE_STREAM });  // ls 보존(서버 60초마다 갱신, 클라 push가 덮어쓰지 않게)
    }
    return { changed: changed, anyLive: anyLive, anyToday: anyToday };
  }
  // 신규 사용자용: 부팅 시 공유 라이브상태를 DB에서 바로 fetch(SDK 대기 X) → 라이브카드 즉시 표시
  function bootLiveState() {
    if (!window.fetch) return;
    fetch(SB_URL + "/rest/v1/app_data?key=eq.live_state&select=data", { headers: { apikey: SB_PUB, Authorization: "Bearer " + SB_PUB } })
      .then(function (r) { return r.json(); }).then(function (rows) {
        var d = rows && rows[0] && rows[0].data; if (!d) return;
        var fresh = Date.now() - (d.t || 0) <= 5 * 60000;
        applyLiveStream(d, fresh);  // 라이브 송출 링크 반영(live 없어도 ls는 처리)
        if (!d.live || !fresh) return;  // 5분 지난 캐시 무시(유령 방지)
        var changed = false;
        Object.keys(d.live).forEach(function (k) { if (!LIVE[k] && d.live[k] && d.live[k].state === "in") { LIVE[k] = d.live[k]; LIVE[k].cached = true; changed = true; } });
        if (changed) { if (onHomeSchedule()) renderSchedule(); if (window._matchLiveTick) window._matchLiveTick(); if (window._teamLiveTick) window._teamLiveTick(); if (window._teamSchedRefresh) window._teamSchedRefresh(); }
      }).catch(function () {});
  }
  // live_state.ls(서버 감지 JTBC 라이브) → LIVE_STREAM 반영. 변동 시 경기페이지 버튼 즉시 갱신.
  function applyLiveStream(d, fresh) {
    var next = (fresh && d && d.ls && d.ls.mid && d.ls.url) ? d.ls : null;
    if (JSON.stringify(next) === JSON.stringify(LIVE_STREAM)) return;
    LIVE_STREAM = next;
    if (window._matchLiveTick) window._matchLiveTick();
    if (onHomeSchedule()) renderSchedule();  // 메인 일정에 방송중 라이브카드 즉시 반영
  }
  // 열려있는 클라가 서버의 ls 변동을 주기적으로 받도록 live_state 재조회(60초 throttle).
  var _lsFetchAt = 0;
  function refreshLiveStream() {
    if (!window.fetch || Date.now() - _lsFetchAt < 55000) return;
    _lsFetchAt = Date.now();
    fetch(SB_URL + "/rest/v1/app_data?key=eq.live_state&select=data", { headers: { apikey: SB_PUB, Authorization: "Bearer " + SB_PUB } })
      .then(function (r) { return r.json(); }).then(function (rows) {
        var d = rows && rows[0] && rows[0].data; if (!d) return;
        applyLiveStream(d, Date.now() - (d.t || 0) <= 5 * 60000);
      }).catch(function () {});
  }
  // 라이브 상태 캐시(앱 열자마자 라이브카드 즉시 표시 → fetchLive가 곧 갱신)
  var LIVE_CACHE_KEY = "kt_live_v1";
  function saveLiveCache() {
    try { var m = {}; Object.keys(LIVE).forEach(function (k) { if (LIVE[k] && LIVE[k].state === "in") m[k] = LIVE[k]; }); localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ t: Date.now(), live: m })); } catch (e) {}
  }
  function restoreLiveCache() {
    try {
      var c = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY) || "{}");
      if (!c.live || (Date.now() - (c.t || 0)) > 3 * 3600 * 1000) return;  // 3시간 지난 캐시는 신뢰 X
      Object.keys(c.live).forEach(function (k) { if (!LIVE[k]) { LIVE[k] = c.live[k]; LIVE[k].cached = true; } });
    } catch (e) {}
  }
  // 저장된 종료경기 결과를 LIVE에 병합(ESPN이 안 줘도 카드에 결과 유지)
  function loadStoredResults() {
    if (!window.KickComments || !KickComments.matchResults) return;
    KickComments.ready().then(KickComments.matchResults).then(function (res) {
      var changed = false;
      Object.keys(res || {}).forEach(function (mid) {
        // DB에 결과 있으면 = 종료된 경기. LIVE가 비었거나 '아직 in(스테일)'이면 post로 덮어씀(ESPN이 스코어보드서 내려 안 잡히던 끝난 경기가 라이브로 멈춰있던 버그 해결)
        if (!(res[mid] && res[mid].hs != null)) return;
        if (LIVE[mid] && LIVE[mid].state === "post") return;
        LIVE[mid] = { state: "post", hs: res[mid].hs, as: res[mid].as, clock: "", events: res[mid].ev || [], stored: true }; changed = true;
      });
      if (changed) { if (onHomeSchedule()) renderSchedule(); if (window._matchLiveTick) window._matchLiveTick(); if (window._teamLiveTick) window._teamLiveTick(); if (window._teamSchedRefresh) window._teamSchedRefresh(); }
    }).catch(function () {});
  }
  function onHomeSchedule() {
    return parseHash().name === "home" && !searchEl.value.trim() && homeTab === "schedule";
  }
  function scheduleLive(delay) {
    if (liveTimer) clearTimeout(liveTimer);
    if (delay) liveTimer = setTimeout(fetchLive, delay);
  }
  var _lastLiveKey = "";
  var _lastFetchDone = Date.now();   // 마지막으로 fetchLive가 '완료'(then/catch)된 시각 — 워치독이 체인 끊김 감지용
  // 모바일에서 기기가 잠들면 fetch가 영영 안 끝나는 경우가 있음 → AbortController로 타임아웃 강제(반드시 then/catch 도달 → 다음 폴링 예약)
  function fetchTimeout(u, opts, ms) {
    opts = opts || {};
    if (!window.AbortController) return fetch(u, opts);
    var ac = new AbortController(), o = {}; for (var k in opts) o[k] = opts[k]; o.signal = ac.signal;
    var t = setTimeout(function () { ac.abort(); }, ms || 10000);
    return fetch(u, o).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  // 폴링 간격: 라이브(ESPN/시각) 15초 · 킥오프 20분전 임박 20초 · 그 외 2분(완전 정지 안 함 → 새로고침 없이 자동 표시)
  function nextLiveDelay(anyLive) {
    if (anyLive || liveFixtures().length) return 15000;
    var now = Date.now(), soon = false;
    (DATA.fixtures || []).forEach(function (f) { if (!f.homeId || !f.awayId) return; var ko = matchKickoff(f); if (!ko) return; if (now >= ko - 1200000 && now < ko) soon = true; });
    return soon ? 20000 : 120000;
  }
  function fetchLive() {
    if (!window.fetch) return;
    // 오늘+어제(UTC) 둘 다 조회 — KST 새벽 경기는 어제UTC라, today만 보면 라이브가 영영 안 잡힘(데몬은 2일 스캔)
    function dstr(t) { return new Date(t).toISOString().slice(0, 10).replace(/-/g, ""); }
    var now = Date.now();
    var urls = [ESPN_URL + "?dates=" + dstr(now), ESPN_URL + "?dates=" + dstr(now - 86400000)];
    Promise.all(urls.map(function (u) { return fetchTimeout(u, { cache: "no-store" }, 10000).then(function (r) { return r.json(); }).catch(function () { return {}; }); })).then(function (arr) {
      _lastFetchDone = Date.now();
      var merged = { events: [] };
      arr.forEach(function (d) { if (d && d.events) merged.events = merged.events.concat(d.events); });
      var res = applyEspn(merged);
      refreshLiveStream();  // 서버가 감지한 JTBC 라이브 송출 링크(ls) 주기 동기화
      loadStoredResults();  // 매 폴링마다 DB 결과와 대조 → 끝난 경기(ESPN서 내려간)도 스테일 라이브 안 되게 post로 정리
      if (window._matchLiveTick) window._matchLiveTick();  // 경기페이지면 점수 즉시 반영
      if (window._teamLiveTick) window._teamLiveTick(); if (window._teamSchedRefresh) window._teamSchedRefresh();    // 나라상세 라이브 배너 점수 갱신
      var lk = liveKey();
      if ((res.changed || lk !== _lastLiveKey) && onHomeSchedule()) renderSchedule();  // 라이브 집합이 바뀌면(정각 시작 등) 새로고침 없이 자동 갱신
      _lastLiveKey = lk;
      if (parseHash().name === "home" && homeTab === "groups" && !searchEl.value.trim()) fetchStandings(true);
      scheduleLive(nextLiveDelay(res.anyLive));
    }).catch(function () { _lastFetchDone = Date.now(); scheduleLive(60000); });
  }
  // 워치독: 라이브 중인데 폴링 체인이 45초+ 멈춰있으면(타이머 정지·fetch 행 등) 강제 재시동 — 화면 보이는 동안만, 라이브 있을 때만(상시 부하 X)
  setInterval(function () {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (!liveFixtures().length) return;
    if (Date.now() - _lastFetchDone > 45000) fetchLive();
  }, 20000);

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
    var d0 = fx.date || fx.kstDate; if (!d0 || !window.fetch) return Promise.resolve(null);
    var key = [fx.homeId, fx.awayId].sort().join("|");
    // 경기일 ±1일 모두 조회 — ESPN이 UTC/현지 경계 때문에 fx.date와 다른 날짜에 넣을 수 있음(KST 새벽 경기)
    var base = Date.parse(d0 + "T12:00:00Z");
    function ds(t) { return new Date(t).toISOString().slice(0, 10).replace(/-/g, ""); }
    var dates = [ds(base), ds(base - 86400000), ds(base + 86400000)];
    return Promise.all(dates.map(function (dd) { return fetch(ESPN_URL + "?dates=" + dd, { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }); })).then(function (arr) {
      var found = null;
      arr.forEach(function (d) {
        (d.events || []).forEach(function (e) {
          var c = (e.competitions || [])[0]; if (!c) return;
          var comp = c.competitors || [];
          var H = comp.filter(function (t) { return t.homeAway === "home"; })[0] || comp[0];
          var A = comp.filter(function (t) { return t.homeAway === "away"; })[0] || comp[1];
          if (!H || !A) return;
          var hid = espnTeamId(H.team && H.team.displayName), aid = espnTeamId(A.team && A.team.displayName);
          if (hid && aid && [hid, aid].sort().join("|") === key) found = e.id;
        });
      });
      if (found) espnIdCache[fx.id] = found;  // 못 찾으면 캐시 안 함(다음에 재시도)
      return found;
    }).catch(function () { return null; });
  }
  var summaryCache = {};
  function hasLineupData(d) { return !!(d && (d.rosters || []).some(function (rs) { return (rs.roster || []).some(function (p) { return p.starter; }); })); }
  function fetchSummary(fx) {
    var KC = window.KickComments;
    function dbGet() { return (KC && KC.getLineup) ? KC.getLineup(fx.id).then(function (db) { return (db && db.rosters) ? db : null; }) : Promise.resolve(null); }
    function fromEspn() {
      return resolveEspnId(fx).then(function (eid) {
        if (!eid) return dbGet();
        if (summaryCache[eid]) return summaryCache[eid];
        return fetch(ESPN_SUM + eid, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          summaryCache[eid] = d;
          if (hasLineupData(d) && KC && KC.pushLineup) KC.pushLineup(fx.id, { rosters: d.rosters, keyEvents: d.keyEvents, header: d.header, headToHeadGames: d.headToHeadGames, boxscore: d.boxscore });  // 확정 라인업+상대전적+경기통계 DB 저장(영구·백업)
          return d;
        }).catch(function () { return dbGet(); });  // ESPN 실패 → DB 백업
      });
    }
    // 종료 경기는 DB 저장본 우선(빠름). 단 DB에 경기통계(boxscore)가 없으면 ESPN으로 폴백 — 통계 없는 DB본이 통계를 가리던 버그 수정.
    if (matchEnded(fx)) return dbGet().then(function (db) {
      var hasStats = db && db.boxscore && db.boxscore.teams && db.boxscore.teams.length >= 2;
      return hasStats ? db : fromEspn().then(function (e) { return (e && e.rosters) ? e : (db || e); });
    });
    return fromEspn();
  }
  var H2HPRE = null, h2hLoading = null;
  function ensureH2H() {   // 사전수집 h2h.json 1회 로드(첫 경기 진입 때)
    if (H2HPRE) return Promise.resolve(H2HPRE);
    if (h2hLoading) return h2hLoading;
    if (!window.fetch) { H2HPRE = {}; return Promise.resolve(H2HPRE); }
    h2hLoading = fetch("h2h.json").then(function (r) { return r.json(); }).then(function (j) { H2HPRE = j || {}; return H2HPRE; }).catch(function () { H2HPRE = {}; return H2HPRE; });
    return h2hLoading;
  }
  function loadPrediction(slot, fx, a, b, aIsHome) {
    if (!slot || !window.KickComments || !KickComments.predCounts) return;
    var leftCh = aIsHome ? "home" : "away", rightCh = aIsHome ? "away" : "home";
    var ko = matchKickoff(fx);
    function isOpen() { return ko ? Date.now() < ko : !matchEnded(fx); }
    function cd() {
      if (!isOpen()) return "투표 마감";
      if (!ko) return "";
      var ms = ko - Date.now(); if (ms <= 0) return "곧 시작";
      var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
      if (d > 0) return d + "일 " + (h % 24) + "시간 후 종료";
      if (h > 0) return h + "시간 " + (m % 60) + "분 후 종료";
      return m + "분 후 종료";
    }
    function paint(c, bet) {
      var locked = !!bet;  // 베팅하면 예측 고정(변경 불가)
      var mine = bet ? bet.choice : KickComments.predMine(fx.id), total = c.total || 0, op = isOpen() && !locked;
      function pct(n) { return total > 0 ? Math.round(n / total * 100) : 0; }
      var opts = [
        { ch: leftCh, name: a.name, flag: a.flag, n: c[leftCh] || 0 },
        { ch: "draw", name: "무승부", flag: "", n: c.draw || 0 },
        { ch: rightCh, name: b.name, flag: b.flag, n: c[rightCh] || 0 }
      ];
      var cols = opts.map(function (o) {
        var p = pct(o.n), on = mine === o.ch;
        return '<button class="pred-col' + (on ? " on" : "") + '"' + (op ? ' data-pred="' + o.ch + '"' : " disabled") + '>' +
          '<span class="pred-col-team">' + (o.flag ? '<span class="pred-col-flag">' + esc(o.flag) + "</span>" : "") + esc(o.name) + "</span>" +
          '<span class="pred-col-pct">' + p + "%</span></button>";
      }).join("");
      slot.innerHTML = '<div class="pred-box"><div class="pred-q">이 경기의 승리팀을 맞혀보세요! 🔮</div>' +
        '<div class="pred-cols">' + cols + "</div>" +
        '<div class="pred-foot">' + (total ? "<b>" + total.toLocaleString() + "</b>명 참여중" : "첫 예측을 남겨보세요") + " · ⏱ " + cd() + (locked ? " · 💰 베팅완료(예측 고정)" : "") + "</div></div>";
      slot._predOpen = op;
      twem(slot);
    }
    paint({ total: 0 });
    slot._predFx = fx.id; slot._predPaint = paint;
    function refresh() {
      // 클라이언트 ready 후 조회(카카오 인앱브라우저 등에서 초기화 전 호출돼 0%로 뜨던 것 방지)
      KickComments.ready().then(function () {
        var betP = (KickComments.user && KickComments.user() && KickComments.myBet) ? KickComments.myBet(fx.id) : Promise.resolve(null);
        return Promise.all([KickComments.predCounts(fx.id), betP]);
      }).then(function (r) { if (document.body.contains(slot)) paint(r[0], r[1]); }).catch(function () {});
    }
    slot._predReload = refresh;
    refresh();
    if (window._predTimer) clearInterval(window._predTimer);
    window._predTimer = setInterval(function () { if (!document.body.contains(slot)) { clearInterval(window._predTimer); return; } refresh(); }, 30000);
  }

  var BET_PRESETS = [50, 100, 500];
  function betOddsOf(fx) {
    var home = teamsById[fx.homeId], away = teamsById[fx.awayId];
    if (!home || !away) return null;
    var pr = predict(home, away);
    function od(p) { return Math.min(10, Math.max(1.1, Math.round(1000 / Math.max(1, p * 1.12)) / 10)); }  // predict()는 %(예 56)라 배당=100/% → 1000/p/10(소수1자리)
    return { home: od(pr.winA), draw: od(pr.draw), away: od(pr.winB) };
  }
  function updBetWin(bss) {
    if (!bss) return;
    var inp = bss.querySelector(".bet-amt"); var s = inp ? (parseInt(inp.value, 10) || 0) : (bss._betStake || 0);
    bss._betStake = s;
    Array.prototype.forEach.call(bss.querySelectorAll(".bet-opt-win"), function (el) {
      var o = parseFloat(el.getAttribute("data-odds")) || 0;
      el.textContent = "적중 +" + Math.round(s * o).toLocaleString();
    });
  }
  function loadBetting(slot, fx, a, b, aIsHome) {
    if (!slot || !window.KickComments || !KickComments.myPoints) return;
    var ko = matchKickoff(fx);
    var open = ko ? Date.now() < ko : !matchEnded(fx);
    var ODDS = betOddsOf(fx); if (!ODDS) { slot.innerHTML = ""; return; }
    var L = aIsHome ? "home" : "away", R = aIsHome ? "away" : "home";
    var NAME = { draw: "무승부" }; NAME[aIsHome ? "home" : "away"] = a.name; NAME[aIsHome ? "away" : "home"] = b.name;
    KickComments.ready().then(function (user) {  // 로그인 상태 확정 후 렌더(OAuth 복귀 직후 user()=null로 로그인창 떠있던 버그)
    if (!document.body.contains(slot)) return;
    if (!user) {
      slot.innerHTML = '<div class="bet-box"><div class="bet-h">💰 포인트 베팅 <span class="bet-info" data-bet-guide>ⓘ</span></div>' +
        '<div class="bet-login">로그인하면 <b>1,000 포인트</b>로 베팅하고 랭킹에 도전! <button class="cmt-in g bet-loginbtn" data-p="google">구글 로그인</button></div></div>';
      twem(slot); return;
    }
    function render(pts, bet) {
      if (!document.body.contains(slot)) return;
      var bal = (pts && pts.points) || 0;
      var head = '<div class="bet-h">💰 포인트 베팅 <span class="bet-bal">' + bal.toLocaleString() + ' KP</span> <span class="bet-info" data-bet-guide>ⓘ</span></div>';
      if (bet) {
        var nm = NAME[bet.choice] || bet.choice, pot = Math.round(bet.stake * bet.odds);
        var body = bet.status === "won" ? '<span class="bet-win">✅ 적중! +' + (bet.payout || 0).toLocaleString() + ' KP</span>'
          : bet.status === "lost" ? '<span class="bet-lose">❌ 아쉽! −' + bet.stake.toLocaleString() + ' KP</span>'
          : '<span class="bet-pend">적중 시 +' + pot.toLocaleString() + ' KP · 결과 후 자동정산</span>';
        var cancelBtn = (open && bet.status === "pending") ? '<button class="bet-cancel" data-betcancel="' + fx.id + '">베팅 취소 · 환불받기</button>' : "";
        slot.innerHTML = '<div class="bet-box">' + head + '<div class="bet-mine"><b>' + esc(nm) + '</b> ×' + bet.odds + ' · ' + bet.stake.toLocaleString() + ' KP &nbsp; ' + body + "</div>" + cancelBtn + "</div>";
        return;
      }
      if (!open) { slot.innerHTML = '<div class="bet-box">' + head + '<div class="bet-closed">⏱ 베팅 마감된 경기</div></div>'; return; }
      var stake = Math.max(10, Math.min(slot._betStake || 100, bal || 100));
      slot._betStake = stake;
      var opts = [L, "draw", R].map(function (ch) {
        return '<button class="bet-opt" data-betch="' + ch + '"><span class="bet-opt-name">' + esc(NAME[ch]) + "</span><span class=\"bet-opt-odds\">×" + ODDS[ch] + '</span><span class="bet-opt-win" data-odds="' + ODDS[ch] + '">적중 +' + Math.round(stake * ODDS[ch]).toLocaleString() + "</span></button>";
      }).join("");
      slot.innerHTML = '<div class="bet-box">' + head +
        '<div class="bet-stakes"><span class="bet-stakes-l">베팅액</span>' +
          '<button class="bet-step" data-betstep="-100">−100</button>' +
          '<input class="bet-amt" type="number" inputmode="numeric" value="' + stake + '" min="10" max="' + bal + '">' +
          '<button class="bet-step" data-betstep="100">+100</button>' +
          '<button class="bet-step bet-allin" data-betstep="ALLIN">올인</button>' +
        "</div>" +
        '<div class="bet-opts">' + opts + "</div>" +
        '<div class="bet-note">금액 조절 후 옵션을 누르면 베팅돼요 · 현금가치 없는 재미용</div></div>';
      slot._betStakeMax = bal;
      twem(slot);
    }
    slot._betFx = fx.id;
    slot._betReload = function () { Promise.all([KickComments.myPoints(), KickComments.myBet(fx.id)]).then(function (r) { render(r[0], r[1]); }); };
    slot._betReload();
    });
  }
  function showBetGuide() {
    var ov = document.createElement("div"); ov.className = "bet-guide-ov";
    ov.innerHTML = '<div class="bet-guide"><button class="bet-guide-x" aria-label="닫기">✕</button>' +
      "<h3>🎮 포인트 게임 안내</h3>" +
      "<ul class=\"bet-guide-list\"><li>가입하면 <b>1,000 KP</b> 지급, 매일 출석 시 <b>+200 KP</b></li>" +
      "<li>경기 승·무·패에 포인트를 <b>베팅</b> → 적중하면 배당만큼 획득, 틀리면 잃어요</li>" +
      "<li>배당은 전력차 기반 자동 산출 — <b>언더독 적중 = 대박</b></li>" +
      "<li>🔥 연속 적중 보너스: 3연승 +10% · 5연승 +25% · 10연승 +50%</li>" +
      "<li>누적 포인트로 <b>등급·랭킹</b>에 도전!</li></ul>" +
      '<div class="bet-disc">⚠️ 본 포인트는 환전·현금화·구매가 일절 불가능하며, 오로지 재미와 랭킹을 위한 것입니다. 실제 금전적 가치가 없습니다.</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".bet-guide-x")) ov.remove(); });
  }

  function loadH2H(slot, fx, a, b) {
    if (!slot) return;
    ensureH2H().then(function (pre) {
      if (parseHash().name !== "match") return;
      var rec = pre && pre[fx.id];
      if (rec && rec.h2h) { renderH2H(slot, { headToHeadGames: rec.h2h }, fx, a, b); return; }  // 조별리그=사전수집 즉시
      if (!window.fetch) { slot.style.display = "none"; return; }
      slot.innerHTML = '<h3>최근 상대전적</h3><div class="h2h-loading">불러오는 중…</div>';  // 토너먼트/누락=라이브
      fetchSummary(fx).then(function (d) { if (!d) { slot.style.display = "none"; return; } renderH2H(slot, d, fx, a, b); }).catch(function () { slot.style.display = "none"; });
    });
  }
  // 라인업 즉시 표시용 캐시: 로컬(재방문 즉시) + 직접 DB조회(신규 사용자도 빠르게, SDK 대기 X)
  function lineupCacheGet(mid) { try { var c = JSON.parse(localStorage.getItem("kt_lu_" + mid) || "null"); return (c && c.d) ? c.d : null; } catch (e) { return null; } }
  function lineupCacheSet(mid, d) { try { if (hasLineupData(d)) localStorage.setItem("kt_lu_" + mid, JSON.stringify({ t: Date.now(), d: { rosters: d.rosters, keyEvents: d.keyEvents, header: d.header, headToHeadGames: d.headToHeadGames, boxscore: d.boxscore } })); } catch (e) {} }
  function directLineupFetch(mid) {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(SB_URL + "/rest/v1/app_data?key=eq." + encodeURIComponent("lineup:" + mid) + "&select=data", { headers: { apikey: SB_PUB, Authorization: "Bearer " + SB_PUB } })
      .then(function (r) { return r.json(); }).then(function (rows) { return (rows && rows[0] && rows[0].data) ? rows[0].data : null; }).catch(function () { return null; });
  }
  function loadLineup(slot, fx, a, b) {
    if (!slot || !window.fetch) return;
    var cached = lineupCacheGet(fx.id), freshDone = false;
    if (cached && hasLineupData(cached)) renderLineup(slot, cached, a, b, fx);  // ① 로컬캐시 즉시
    else slot.innerHTML = '<h3>📋 라인업</h3><div class="h2h-loading">불러오는 중…</div>';
    directLineupFetch(fx.id).then(function (db) {  // ② 직접 DB조회(신규 사용자도 빠름)
      if (db && hasLineupData(db) && !freshDone) { lineupCacheSet(fx.id, db); renderLineup(slot, db, a, b, fx); }
    });
    fetchSummary(fx).then(function (d) {  // ③ 최신(라이브 ESPN/DB) — 도착하면 덮어씀
      freshDone = true;
      if (!d) { if (!cached) slot.style.display = "none"; return; }
      lineupCacheSet(fx.id, d); renderLineup(slot, d, a, b, fx);
    }).catch(function () { if (!cached) slot.style.display = "none"; });
  }
  // 경기 하이라이트 URL — 종료경기 풀하이라이트(치지직/JTBC). scripts/fetch_highlights.js가 종료경기를 자동 매칭해 마커 사이를 갱신.
  var MATCH_HIGHLIGHTS = {
    /* HL-AUTO-START */
    "match-1": "https://chzzk.naver.com/video/13663676", // 멕시코-남아프리카공화국
    "match-2": "https://chzzk.naver.com/video/13666274", // 대한민국-체코
    "match-7": "https://chzzk.naver.com/video/13680813", // 캐나다-보스니아 헤르체고비나
    "match-8": "https://chzzk.naver.com/video/13697795", // 카타르-스위스
    "match-13": "https://chzzk.naver.com/video/13698656", // 브라질-모로코
    "match-14": "https://chzzk.naver.com/video/13699342", // 아이티-스코틀랜드
    "match-19": "https://chzzk.naver.com/video/13682431", // 미국-파라과이
    "match-20": "https://chzzk.naver.com/video/13700637", // 호주-튀르키예
    "match-25": "https://chzzk.naver.com/video/13713371", // 독일-퀴라소
    "match-26": "https://chzzk.naver.com/video/13714960", // 코트디부아르-에콰도르
    "match-31": "https://chzzk.naver.com/video/13714387", // 네덜란드-일본
    "match-32": "https://chzzk.naver.com/video/13716097", // 스웨덴-튀니지
    "match-37": "https://chzzk.naver.com/video/13728955", // 벨기에-이집트
    "match-38": "https://chzzk.naver.com/video/13730200", // 이란-뉴질랜드
    "match-43": "https://chzzk.naver.com/video/13727569", // 스페인-카보베르데
    "match-44": "https://chzzk.naver.com/video/13729415", // 사우디아라비아-우루과이
    "match-49": "https://chzzk.naver.com/video/13744157", // 프랑스-세네갈
    "match-50": "https://chzzk.naver.com/video/13744863", // 이라크-노르웨이
    "match-55": "https://chzzk.naver.com/video/13745669", // 아르헨티나-알제리
    "match-56": "https://chzzk.naver.com/video/13746888", // 오스트리아-요르단
    "match-62": "https://chzzk.naver.com/video/13762270", // 우즈베키스탄-콜롬비아
    "match-67": "https://chzzk.naver.com/video/13760610", // 잉글랜드-크로아티아
    "match-68": "https://chzzk.naver.com/video/13761281" // 가나-파나마
    /* HL-AUTO-END */
  };
  // 선수 평점 — 무료 공식소스 없어 사진에서 수동 입력(재활용 ratingBox). 나중에 유료API 붙이면 같은 박스 재사용.
  var MATCH_RATINGS = {
    "match-67": {  // 잉글랜드-크로아티아 (2026-06-17, SofaScore) — 선발+교체, 등번호 대조
      team: { "england": 6.85, "croatia": 6.66 },
      byName: {
        "조던 픽포드": 6.1, "리스 제임스": 5.9, "에즈리 콘사": 6.2, "존 스톤스": 6.4, "니코 오라일리": 6.3, "엘리엇 앤더슨": 7.0, "데클란 라이스": 6.9, "노니 마두에케": 7.5, "주드 벨링엄": 7.7, "앤서니 고든": 8.3, "해리 케인": 8.3,
        "모건 로저스": 7.3, "부카요 사카": 7.0, "마커스 래시포드": 7.4, "제드 스펜스": 6.6, "마크 게이": 6.7,
        "도미니크 리바코비치": 7.5, "요시프 슈탈로": 6.0, "루카 부슈코비치": 6.1, "요슈코 그바르디올": 5.7, "요시프 스타니시치": 6.7, "루카 모드리치": 8.0, "마리오 파샬리치": 6.7, "이반 페리시치": 6.7, "페타르 수치치": 6.7, "마르틴 바투리나": 7.5, "페타르 무사": 7.4,
        "마테오 코바치치": 7.0, "마르코 파샬리치": 6.6, "이고르 마타노비치": 6.5, "니콜라 블라시치": 6.3, "안드레이 크라마리치": 6.5
      }
    },
    "match-61": {  // 포르투갈-콩고민주공화국 (2026-06-17, SofaScore) — 선발+교체, 등번호 대조
      team: { "portugal": 6.84, "dr-congo": 6.70 },
      byName: {
        "디오구 코스타": 6.8, "주앙 칸셀루": 6.4, "토마스 아라우주": 6.9, "헤나투 베이가": 7.2, "누누 멘드스": 6.4, "주앙 네베스": 8.0, "비티냐": 7.4, "베르나르두 실바": 6.2, "브루누 페르난드스": 7.8, "페드루 네투": 7.0, "크리스티아누 호날두": 6.1,
        "프란시스쿠 콘세이상": 6.8, "하파엘 레앙": 6.5, "넬송 세메두": 6.6, "곤살루 하무스": 6.5,
        "세드리크 바캄부": 6.9, "요안 위사": 7.3, "에도 카옘베": 6.9, "사뮈엘 무투삼": 6.5, "은갈라옐 무카우": 6.6, "아르튀르 마수아쿠": 6.9, "스티브 카푸아디": 6.5, "악셀 투안제베": 6.4, "샹셀 음벰바": 6.5, "에런 완비사카": 6.7, "리오넬 음파시": 6.0,
        "노아 사디키": 7.0, "조리스 카옘베": 7.1, "샤를 피켈": 6.6, "제데옹 칼룰루": 6.8, "시몽 반자": 6.5
      }
    },
    // SWE-TUN 평점(사진, 2026-06-17) — 선발+교체. 등번호로 라인업 대조. (90분 교체 스벤손·엘랑가는 평점 미표기로 제외)
    "match-32": {  // 스웨덴-튀니지
      team: { "sweden": 7.14, "tunisia": 6.19 },
      byName: {
        "크리스토페르 노르드펠트": 6.3, "빅토르 린델뢰프": 6.3, "이사크 히엔": 6.7, "예스페르 칼스트룀": 6.3, "가브리엘 구드뮌손": 7.3, "알렉산데르 이사크": 8.6, "야신 아야리": 8.7, "벤야민 뉘그렌": 7.0, "빅토르 요케레스": 8.0, "구스타프 라게르비엘케": 6.8, "알렉산데르 베른하르드손": 6.7,
        "엘리오트 스트로우드": 6.8, "루카스 베리발": 6.9, "마티아스 스반베리": 7.6,
        "압델무히브 샤마크": 3.7, "얀 발레리": 5.5, "오마르 레키크": 6.8, "몬타사르 탈비": 7.0, "무함마드 아민 벤 하미다": 6.9, "알리 압디": 5.2, "라니 케디라": 6.2, "엘리에스 스키리": 6.1, "한니발 메즈브리": 7.2, "엘리아스 사드": 6.5, "아니스 벤 슬리만": 6.1,
        "무함마드 하지 마흐무드": 6.6, "세바스티안 투네크티": 6.3, "엘리아스 아추리": 6.4, "이스마엘 가르비": 6.0, "피라스 샤와트": 6.5
      }
    },
    // AUT-JOR 평점(사진, 2026-06-17) — 선발+교체. 등번호로 라인업 대조.
    "match-56": {  // 오스트리아-요르단
      team: { "austria": 6.82, "jordan": 6.59 },
      byName: {
        "알렉산더 슐라거": 7.4, "필리프 음베네": 6.6, "다비드 알라바": 6.5, "크사버 슐라거": 7.1, "마르셀 자비처": 6.8, "콘라트 라이머": 6.6, "사샤 칼라이지치": 6.1, "필리프 린하르트": 7.3, "니콜라스 자이발트": 7.3, "로마노 슈미트": 7.5, "슈테판 포슈": 5.9,
        "마르코 아르나우토비치": 7.3, "케빈 단소": 7.0, "카니 추쿠에메카": 6.3, "파울 바너": 6.6, "파트리크 비머": 6.5,
        "야지드 아불라일라": 5.9, "압달라 나십": 6.2, "야잔 알아랍": 6.2, "이흐산 하다드": 6.5, "모하마드 아부알나디": 6.4, "니자르 알라슈단": 7.0, "누르 알라와브데": 6.8, "오데 알파쿠리": 6.7, "무사 알타마리": 6.6, "알리 올완": 7.8, "모한나드 아부 타하": 7.5,
        "살림 오바이드": 6.1, "사이드 알로산": 6.2, "마흐무드 알마르디": 6.6, "모하마드 알다우드": 6.5, "알리 아자이제": 6.6
      }
    },
    // ARG-ALG 평점(사진, 2026-06-17) — 선발+교체. 메시 10.0(만점). 등번호로 라인업 대조.
    "match-55": {  // 아르헨티나-알제리
      team: { "argentina": 7.07, "algeria": 6.44 },
      byName: {
        "에밀리아노 마르티네스": 6.7, "파쿤도 메디나": 7.2, "리산드로 마르티네스": 7.4, "크리스티안 로메로": 7.3, "곤살로 몬티엘": 6.9, "엔소 페르난데스": 7.2, "알렉시스 맥 알리스터": 6.8, "로드리고 데 파울": 7.2, "티아고 알마다": 6.7, "라우타로 마르티네스": 6.4, "리오넬 메시": 10,
        "나우엘 몰리나": 6.8, "니콜라스 곤살레스": 6.8, "훌리안 알바레스": 6.4, "니콜라스 오타멘디": 6.8, "니코 파스": 6.7,
        "루카 지단": 6.3, "라피크 벨갈리": 6.0, "아이사 만디": 7.1, "라미 벤세바이니": 6.6, "라얀 아이트누리": 6.0, "아니스 하지 무사": 6.6, "이샴 부다위": 6.4, "나빌 벤탈렙": 6.7, "아민 구이리": 6.2, "파레스 샤이비": 6.5, "이브라힘 마자": 8.3,
        "우셈 아우아르": 6.4, "리야드 마레즈": 6.7, "모하메드 아무라": 6.4, "아딜 불비나": 6.2, "라미즈 제루키": 6.7
      }
    },
    // IRQ-NOR 평점(사진, 2026-06-17) — 선발+교체. 등번호로 라인업 대조.
    "match-50": {  // 이라크-노르웨이
      team: { "iraq": 6.44, "norway": 6.89 },
      byName: {
        "잘랄 하산": 6.1, "메르차스 도스키": 6.9, "알리 자심": 6.6, "아캄 하심": 6.0, "아미르 알암마리": 6.9, "알리 알하마디": 6.7, "자이드 타흐신": 5.3, "자이드 이스마일": 6.7, "에이멘 후세인": 7.1, "후세인 알리": 6.0, "이브라힘 바예시": 6.6,
        "마르코 파르지": 6.3, "지단 이크발": 6.5, "무스타파 사둔": 6.2, "아흐메드 카셈": 6.6, "모하나드 알리": 6.5,
        "외르얀 뉠란": 6.6, "율리안 뤼에르손": 6.6, "알렉산데르 쇠를로트": 6.1, "산데르 베르게": 7.1, "크리스토페르 아예르": 7.0, "마르틴 외데고르": 7.2, "엘링 홀란": 8.1, "프레드리크 아우르스네스": 6.7, "토르비외른 헤겜": 6.8, "안토니오 누사": 6.7, "다비드 묄레르 볼페": 7.6,
        "레오 외스티고르": 7.5, "안드레아스 셸데루프": 6.5, "오스카르 봅": 6.5, "크리스티안 토르스트베트": 6.7, "패트릭 베리": 6.6
      }
    },
    // FRA-SEN 평점(사진, 2026-06-17) — 선발+교체. 등번호로 라인업 대조. 시스(88' 투입)는 평점 미표기로 제외.
    "match-49": {  // 프랑스-세네갈
      team: { "france": 7.09, "senegal": 6.49 },
      byName: {
        "마이크 메냥": 6.3, "테오 에르난데스": 6.4, "윌리암 사리바": 6.5, "다요 우파메카노": 7.9, "쥘 쿠앙데": 6.6, "아드리앵 라비오": 7.4, "오렐리앙 추아메니": 7.2, "데지레 두에": 6.7, "마이클 올리세": 7.7, "우스만 뎀벨레": 7.0, "킬리안 음바페": 8.1,
        "브래들리 바르콜라": 7.9, "라얀 셰르키": 6.5,
        "에두아르 멘디": 6.8, "크레팽 디아타": 6.9, "칼리두 쿨리발리": 6.3, "무사 니아카테": 6.5, "엘 하지 말리크 디우프": 6.1, "이스마일라 사르": 6.2, "이드리사 가나 게예": 6.7, "라민 카마라": 6.1, "니콜라스 잭슨": 5.9, "파페 게예": 6.7, "사디오 마네": 6.5,
        "이브라힘 음바예": 7.4, "아비브 디아라": 6.2, "일리만 은디아예": 6.6, "밤바 디엥": 6.4
      }
    },
    // 평점(사진, 2026-06-15/16) — 등번호로 ESPN 라인업 대조.
    "match-37": {  // 벨기에-이집트
      team: { "belgium": 6.91, "egypt": 6.76 },
      byName: {
        "티보 쿠르투아": 6.9, "브란던 메헬레": 7.7, "막심 더 카위퍼르": 6.8, "케빈 데 브라위너": 6.5, "유리 틸레만스": 7.6, "로멜루 루카쿠": 6.2, "레안드로 트로사르": 7.1, "예레미 도쿠": 6.5, "토마 뫼니에": 8.1, "샤를 데 케텔라레": 7.3, "한스 바나컨": 6.5, "티모티 카스타뉴": 7.8, "니콜라 라스킨": 7.2, "아마두 오나나": 6.9, "나탕 응고이": 7.1, "마티아스 페르난데스-파르도": 6.4,
        "야세르 이브라힘": 8.7, "모하메드 하니": 8, "라미 라비아": 6.8, "이맘 아쇼우르": 7.9, "함자 압델카림": 6.6, "모하메드 살라": 8.1, "모스타파 압델라우프 (지코)": 8.1, "아흐메드 파토우": 8.8, "함디 파티": 8.8, "모하나드 라신": 7, "마르완 아티아": 8.3, "오마르 마르무시": 7, "모스타파 쇼베이르": 7.5, "지조": 6.4
      }
    },
    "match-38": {  // 이란-뉴질랜드
      team: { "iran": 6.83, "new-zealand": 6.7 },
      byName: {
        "알리레자 베이란반드": 8.4, "에산 하지사피": 6.8, "쇼자에 칼릴자데": 8.2, "밀라드 모하마디": 8.1, "사이드 에자톨라히": 8.2, "모하마드 모헤비": 7.6, "메흐디 타레미": 8.8, "메흐디 가예디": 6.6, "알리 알리푸르": 6.6, "사만 고도스": 8.2, "아리아 유세피": 8.2, "아미르호세인 호세인자데": 6.6, "알리 네마티": 8.2, "샤흐리아르 모간루": 7.1, "라민 레자에이안": 8.2,
        "맥스 크로콤": 8.7, "팀 페인": 8.1, "마이클 박살": 8, "조 벨": 8.7, "마르코 스타메니치": 8.4, "크리스 우드": 8.5, "사르프리트 싱": 5.9, "일라이저 저스트": 9, "리베라토 카카체": 8.1, "핀 서먼": 7.2, "벤 올드": 6.4, "캘럼 매코왓": 8.7, "라이언 토마스": 6.3, "캘런 엘리엇": 7
      }
    },
    "match-43": {  // 스페인-카보베르데
      team: { "spain": 7.2, "cape-verde": 7.01 },
      byName: {
        "마르코스 요렌테": 7.8, "미켈 메리노": 6.4, "페란 토레스": 5.9, "파비안 루이스": 7.1, "가비": 8.1, "다니 올모": 6.8, "에므릭 라포르트": 8.2, "로드리": 8.6, "니코 윌리암스": 6.5, "라민 야말": 6.8, "페드리": 9, "미켈 오야르사발": 8, "파우 쿠바르시": 7.8, "우나이 시몬": 7.1, "마르크 쿠쿠레야": 7.3,
        "보지냐": 9.7, "디네이 보르게스": 8.5, "로베르투 '피코' 로페스": 7.6, "케빈 피나": 8.4, "조바네 카브랄": 8.7, "주앙 파울루": 6.8, "자미루 몬테이루": 8.7, "시드니 로페스 카브랄": 8.5, "데로이 두아르테": 6.6, "라로스 두아르테": 8.4, "윌리 세메두": 6.5, "텔무 아르칸주": 6.8, "다일론 리브라멘투": 8.5, "라이언 멘데스": 8.9, "누누 다 코스타": 6.6, "스티븐 모레이라": 8.5
      }
    },
    "match-44": {  // 사우디아라비아-우루과이
      team: { "saudi-arabia": 6.74, "uruguay": 6.65 },
      byName: {
        "압둘엘라 알 아므리": 7.6, "하산 알 탐박티": 8, "나세르 알 다우사리": 6.7, "무사브 알주와이르": 6.5, "피라스 알 부라이칸": 6.7, "살렘 알 다우사리": 6.3, "사우드 압둘하미드": 8.4, "나와프 부샬": 6.7, "압둘라 알카이바리": 8.6, "모하메드 알 오와이스": 7.6, "모하메드 칸노": 7.2, "모테브 알하르비": 8.5, "무함마드 아부 알샤마트": 6.4,
        "세바스티안 카세레스": 6.6, "마누엘 우가르테": 8.3, "로드리고 벤탄쿠르": 8.5, "니콜라스 데 라 크루스": 6.9, "페데리코 발베르데": 8.4, "다르윈 누녜스": 8.4, "기예르모 바렐라": 6.7, "아구스틴 카노비오": 6.5, "마티아스 올리베라": 7.2, "마티아스 비냐": 8.2, "브라이안 로드리게스": 6.6, "막시밀리아노 아라우호": 7.4, "페데리코 비냐스": 8.5, "페르난도 무슬레라": 6.4, "후안 마누엘 사나브리아": 6.9, "로드리고 아기레": 6.3
      }
    },
    "match-31": {  // 네덜란드-일본
      team: { "netherlands": 6.92, "japan": 6.72 },
      byName: {
        "바르트 페르브뤼헌": 8.0, "미키 반 데 벤": 8.4, "티야니 레이네르스": 8.5, "코디 학포": 7.5, "버질 반 다이크": 7.9, "얀 파울 판 헤케": 7.4, "프렝키 더용": 7.2, "도니엘 말런": 8.6, "덴젤 둠프리스": 7.0, "라윈 흐라번베르흐": 7.3, "크리센시오 서머빌": 8.5,
        "퀸턴 팀버": 6.8, "테윈 코프메이너스": 6.4, "멤피스 데파이": 6.5, "네이선 아케": 6.3, "브라이언 브로베이": 6.5,
        "스즈키 자이온": 7.8, "도안 리츠": 8.4, "와타나베 츠요시": 8.4, "쿠보 타케후사": 8.7, "사노 가이슈": 8.2, "다니구치 쇼고": 8.6, "카마다 다이치": 7.1, "마에다 다이젠": 8.3, "이토 히로키": 8.3, "나카무라 게이토": 7.6, "우에다 아야세": 8.6,
        "이토 준야": 6.5, "스가와라 유키나리": 7.1, "토미야스 타케히로": 6.8, "오가와 고키": 6.6, "시오가이 켄토": 6.5
      }
    },
    "match-26": {  // 코트디부아르-에콰도르
      team: { "ivory-coast": 7.08, "ecuador": 6.60 },
      byName: {
        "야히아 포파나": 6.7, "기슬랭 코낭": 7.2, "바주마나 투레": 6.3, "엘리 와이": 6.4, "에마뉘엘 아그바두": 7.6, "세코 포파나": 6.8, "윌프리드 싱고": 7.7, "프랑크 케시에": 7.2, "니콜라 페페": 8.1, "겔라 두에": 7.2, "얀 디오망데": 8.2,
        "아마드 디알로": 8.3, "앙주요안 보니": 6.4, "이브라힘 상가레": 6.9, "크리스트 이나오 울라이": 7.1, "오딜롱 코수누": 6.7,
        "에르난 갈린데스": 7.0, "존 예보아": 6.5, "알란 프랑코": 7.1, "곤살로 플라타": 6.6, "모이세스 카이세도": 7.1, "조엘 오르도녜스": 6.6, "페드로 비테": 7.4, "윌리안 파초": 6.5, "에네르 발렌시아": 6.4, "알란 민다": 6.2, "피에로 인카피에": 6.5,
        "닐손 앙굴로": 6.4, "잭슨 포로소": 6.1, "앙헬로 프레시아도": 6.1, "케빈 로드리게스": 6.1
      }
    },
    "match-25": {  // 독일-퀴라소
      team: { "germany": 7.53, "curacao": 6.14 },
      byName: {
        "마누엘 노이어": 6.9, "나타니엘 브라운": 8.0, "플로리안 비르츠": 7.6, "알렉산다르 파블로비치": 7.6, "니코 슐로터베크": 8.4, "자말 무지알라": 8.1, "카이 하베르츠": 8.5, "요나탄 타": 8.5, "펠릭스 은메차": 8.5, "레로이 사네": 8.4, "요주아 키미히": 8.1,
        "데니즈 운다브": 8.5, "다비드 라움": 6.8, "안토니오 뤼디거": 6.7, "레온 고레츠카": 6.9, "발데마어 안톤": 6.8,
        "엘로이 룸": 5.0, "리바노 코메넨시아": 7.3, "셰렐 플로라뉘스": 5.2, "유르헌 로카디아": 3.7, "타히스 총": 8.5, "리헤들리 바조어": 5.3, "레안드로 바쿠나": 3.4, "아르만도 오비스포": 5.7, "손체 한선": 3.6, "주니뉴 바쿠나": 6.8, "데베론 폰빌러": 5.0,
        "예레미 안토니서": 6.8, "예아를 마르가리타": 6.4, "헤르바네 카스타너르": 6.3
      }
    },
    // HAI-SCO 평점(사진, 2026-06-14) — 선발+교체. 등번호로 ESPN 라인업 대조.
    "match-14": {
      team: { "haiti": 6.74, "scotland": 6.93 },
      byName: {
        "조니 플라시드": 6.9, "마르탱 엑스페리앙스": 7.0, "뤼방 프로비당스": 8.9, "한네스 델크루아": 8.9, "장리크네르 벨가르드": 7.3, "윌슨 이시도르": 8.2, "리카르도 아데": 7.0, "당리 장 자크": 7.1, "프란츠디 피에로": 8.8, "카를랑스 아르퀴스": 8.3, "루이시우스 데드송": 8.4,
        "조쥬에 카지미르": 6.7, "레니 조제프": 6.3, "야신 포르튀네": 6.6,
        "앵거스 건": 7.2, "벤 개넌-도크": 7.2, "에런 히키": 7.0, "스콧 맥토미니": 8.4, "그랜트 핸리": 7.5, "로런스 섕클런드": 4.5, "셰 아담스": 8.5, "루이스 퍼거슨": 7.8, "잭 헨드리": 7.1, "존 맥긴": 7.5, "앤디 로버트슨": 7.2,
        "네이선 패터슨": 6.9, "라이언 크리스티": 8.7, "린든 다익스": 6.5, "케니 맥린": 6.6, "핀레이 커티스": 6.4
      }
    },
    // AUS-TUR 평점(사진, 2026-06-14) — 선발+교체. 등번호로 ESPN 라인업 대조.
    "match-20": {
      team: { "australia": 7.18, "turkey": 6.58 },
      byName: {
        "패트릭 비치": 9.4, "조던 보스": 8.5, "네스토리 이란쿤다": 7.4, "캐머런 버지스": 7.2, "폴 오콘-엥글러": 7.3, "해리 수타르": 7.5, "에이든 오닐": 7.1, "알레산드로 치르카티": 7.8, "모하메드 투레": 8.4, "제이컵 이탈리아노": 7.0, "코너 메트칼프": 7.8,
        "니샨 벨루필라이": 6.5, "제이슨 게리아": 6.9, "테테 옌기": 6.8, "아지즈 베히치": 6.6, "잭슨 어바인": 6.5,
        "우우르잔 차크르": 8.2, "제키 첼리크": 6.2, "아르다 귈레르": 6.8, "이스마일 육세크": 7.4, "메리흐 데미랄": 6.7, "오르쿤 쾨크주": 6.5, "케렘 아크튀르코을루": 5.8, "압뒬케림 바르닥즈": 8.5, "페르디 카드오을루": 8.8, "하칸 찰하놀루": 7.3, "바르시 알페르 이을마즈": 8.3,
        "케난 이을드즈": 7.1, "유누스 아크귄": 6.5, "메르트 뮐뒤르": 6.7, "살리흐 외즈잔": 6.8, "데니즈 귈": 6.4
      }
    },
    // BRA-MAR 평점(사진, 2026-06-13) — 선발+교체. 등번호로 ESPN 라인업 대조 매칭. (#18 Danilo Santos는 우리 데이터에 없어 제외)
    "match-13": {
      team: { "brazil": 6.84, "morocco": 6.81 },
      byName: {
        "알리송": 6.9, "호제르 이바녜스": 6.1, "마르키뉴스": 7.3, "가브리에우 마갈량이스": 7.1, "더글라스 산투스": 7.2, "카세미루": 6.7, "브루누 기마랑이스": 6.9, "루카스 파케타": 6.9, "하피냐": 6.6, "비니시우스 주니오르": 8.0, "이고르 치아구": 6.2,
        "다닐루": 6.8, "파비뉴": 6.6, "마테우스 쿠냐": 6.8, "루이스 엔히키": 7.0, "다닐루 산투스": 6.4,
        "야신 부누": 6.9, "차디 리아드": 6.6, "이사 디오프": 6.5, "누사이르 마즈라위": 6.9, "아슈라프 하키미": 7.1, "아제딘 우나히": 6.7, "아유브 부아디": 7.0, "네일 엘 아이나우이": 6.9, "이스마엘 사이바리": 7.6, "빌랄 엘 칸누스": 7.0, "브라힘 디아스": 6.8,
        "셈스딘 탈비": 6.5, "사미르 엘 무라베트": 6.6, "아나스 살라흐에딘": 6.7, "아유브 아마이무니": 6.7, "소피안 라히미": 6.5
      }
    },
    // QAT-SUI 평점(사진, 2026-06-13) — 선발+스위스 교체. 카타르 Al-Amin·Abdulsallam은 우리 선수단에 없어 제외.
    "match-8": {
      team: { "qatar": 6.79, "switzerland": 6.89 },
      byName: {
        "마흐무드 아부나다": 5.9, "아유브 알우이": 8.1, "페드루 미겔": 7.3, "부알렘 쿠키": 7.3, "호맘 아흐메드": 7.7, "자셈 가베르": 8.4, "아심 마디보": 6.3, "이사 라예": 7.3, "에드밀손 주니오르": 8.2, "야수프 압두리사그": 7.0, "아크람 아피프": 7.1,
        "그레고어 코벨": 7.5, "리카르도 로드리게스": 7.8, "마누엘 아칸지": 7.3, "니코 엘베디": 7.1, "드니 자카리아": 8.4, "레모 프로일러": 8.8, "그라니트 자카": 7.2, "미셸 아에비셔": 7.4, "루벤 바르가스": 7.8, "브렐 엠볼로": 7.0, "단 은도예": 9.3,
        "파비안 리더": 6.5, "요한 만잠비": 6.1, "제키 암두니": 6.8, "미로 무하임": 6.1, "아르돈 야샤리": 6.3
      }
    },
    // MEX-RSA 평점(사진, 공식 사진) — 풀네임 키(히메네스/차베스 중복 방지)
    "match-1": {
      team: { "mexico": 7.12, "south-africa": 6.17 },
      byName: {
        "헤수스 가야르도": 6.9, "훌리안 키뇨네스": 8.6, "요한 바스케스": 6.9, "알바로 피달고": 7.1, "라울 랑헬": 7.3, "에리크 리라": 7.4, "세사르 몬테스": 8.8, "브라이언 구티에레스": 6.9, "라울 히메네스": 7.6, "이스라엘 레예스": 7.2, "로베르토 알바라도": 8.2, "힐베르토 모라": 6.6,
        "쿨리소 무다우": 6.5, "테보호 모코에나": 6.5, "이크람 레이너스": 6.1, "은코시나티 시비시": 6.0, "스페펠로 시톨레": 4.9, "이메 오콘": 6.3, "호넨 윌리엄스": 6.3, "라일 포스터": 5.9, "제이든 아담스": 6.6, "음베케젤리 음보카지": 6.4, "오브리 모디바": 5.9, "탈렌테 음바타": 6.5
      }
    },
    // KOR-CZE 평점(사진, 공식 사진 2026-06-12) — 선발+교체 전체. 다른 경기는 사진 받으면 동일 추가.
    "match-2": {
      team: { "south-korea": 7.15, "czech-republic": 6.62 },
      byName: {
        "김승규": 7.4, "이기혁": 6.9, "이태석": 7.2, "백승호": 7.1, "이재성": 7.0, "김민재": 6.9, "황인범": 8.9, "이강인": 8.1, "손흥민": 6.4, "이한범": 6.8, "설영우": 6.6,
        "황희찬": 6.7, "엄지성": 7.0, "오현규": 7.5, "김진규": 6.7, "박진섭": 6.7,
        "마테이 코바르시": 7.0, "블라디미르 초우팔": 6.4, "슈테판 할로우페크": 6.0, "루카시 프로보트": 6.9, "토마시 소우첵": 6.6, "로빈 흐라나치": 6.2, "알렉산드르 소이카": 6.7, "파벨 슐츠": 6.7, "야로슬라프 젤레니": 6.8, "파트리크 슈크": 6.4, "라디슬라프 크레이치": 7.1,
        "미할 사딜레크": 6.6, "아담 흘로제크": 7.0, "토마시 호리": 6.5, "모이미르 히틸": 6.4
      }
    },
    // CAN-BIH 평점(선명한 사진 재확인, 공식 사진) — 캐나다 6.76 / 보스니아 6.88. 선발+교체 전체.
    "match-7": {
      team: { "canada": 6.76, "bosnia-and-herzegovina": 6.88 },
      byName: {
        "막심 크레포": 6.8, "알리스테어 존스턴": 6.9, "뤽 드 푸제롤": 6.7, "데릭 코넬리우스": 6.6, "리치 라리에아": 8.1, "타종 뷰캐넌": 6.2, "이스마엘 코네": 6.5, "스테판 에우스타키오": 7.0, "리암 밀러": 6.7, "조나단 데이비드": 6.3, "타니 올루와세이": 6.2,
        "알리 아흐메드": 6.6, "제이콥 섀펄버그": 6.7, "프로미스 데이비드": 6.5, "사일 라린": 7.6,
        "니콜라 바실리": 6.3, "아마르 메미치": 6.3, "이반 바시치": 7.4, "벤야민 타히로비치": 6.5, "에스미르 바이락타레비치": 6.0, "세아드 콜라시나츠": 7.9, "타리크 무하레모비치": 7.8, "니콜라 카티치": 8.1, "아마르 데디치": 6.9, "요보 루키치": 7.4, "에르메딘 데미로비치": 6.8,
        "아르민 기고비치": 6.8, "사메드 바즈다르": 6.2, "이반 슌이치": 6.4, "케림 알라이베고비치": 6.5, "제니스 부르니치": 6.7
      }
    },
    // USA-PAR 평점(사진, SofaScore) — 미국 7.13 / 파라과이 6.32. 선발+교체.
    "match-19": {
      team: { "united-states": 7.13, "paraguay": 6.32 },
      byName: {
        "매트 프리즈": 6.0, "알렉스 프리먼": 7.2, "크리스 리처즈": 6.9, "팀 림": 7.6, "안토니 로빈슨": 6.8, "타일러 애덤스": 7.0, "말릭 틸먼": 7.5, "세르히뇨 데스트": 6.7, "웨스턴 매케니": 7.3, "크리스천 풀리식": 7.4, "폴라린 발로건": 9.1,
        "세바스티안 베르할터": 6.8, "티모시 웨아": 6.5, "리카르도 페피": 6.4, "조반니 레이나": 7.8,
        "오를란도 힐": 6.1, "후안 호세 카세레스": 6.3, "오마르 알데레테": 5.9, "구스타보 고메스": 5.9, "후니오르 알론소": 5.3, "디에고 고메스": 6.2, "안드레스 쿠바스": 6.9, "다미안 보바디야": 5.4, "미겔 알미론": 6.5, "훌리오 엔시소": 7.3, "안토니오 사나브리아": 6.4,
        "마우리시우": 7.4, "알렉스 아르세": 6.1, "구스타보 벨라스케스": 6.3, "라몬 소사": 6.6, "카쿠": 6.5
      }
    }
  };
  function ratingOf(matchId, name) { var m = MATCH_RATINGS[matchId]; if (!m || !m.byName || !name) return null; if (m.byName[name] != null) return m.byName[name]; var sur = name.split(" ").pop(); return m.byName[sur] != null ? m.byName[sur] : null; }
  function ratingBox(r, dec) { if (r == null) return ""; var cls = r >= 7.0 ? "rb-good" : r >= 6.5 ? "rb-ok" : "rb-low"; return '<span class="rbox ' + cls + '">' + r.toFixed(dec || 1) + "</span>"; }
  function teamRatingOf(matchId, teamId) { var m = MATCH_RATINGS[matchId]; return (m && m.team && m.team[teamId] != null) ? m.team[teamId] : null; }
  // 골/교체 표시용 — keyEvents에서 득점자·교체나간선수 추출(ESPN 이름 기준)
  function matchEventMap(keyEvents) {
    var goals = {}, subOff = {}, subIn = {};
    (keyEvents || []).forEach(function (ev) {
      var ty = ((ev.type && ev.type.type) || "").toLowerCase();
      var parts = (ev.participants || []).map(function (x) { return x.athlete; }).filter(Boolean);
      if (/goal|scored/.test(ty) && !/own.?goal|missed|saved/.test(ty)) { if (parts[0]) goals[parts[0].displayName] = (goals[parts[0].displayName] || 0) + 1; }
      else if (/substitution/i.test(ty) && parts.length >= 2) { subOff[parts[1].displayName] = (ev.clock && ev.clock.displayValue) || "1"; subIn[parts[0].displayName] = (ev.clock && ev.clock.displayValue) || "1"; }  // parts[0]=투입, parts[1]=교체아웃
    });
    return { goals: goals, subOff: subOff, subIn: subIn };
  }
  // 평점 미니시트(종료경기 잔디 선수 탭) — 공식+유저평균 보고 1~10 채점
  function openRateSheet(pid, matchId) {
    var pl = playersById[pid]; if (!pl || !window.KickComments) return;
    var off = ratingOf(matchId, pl.name);
    var bg = document.createElement("div"); bg.className = "rate-sheet-bg";
    // 처음부터 전체 레이아웃 렌더(크기 고정) → 데이터는 값만 나중에 채움(팝업 크기 안 변함)
    var scale0 = ""; for (var s0 = 1; s0 <= 10; s0++) scale0 += '<button class="rs-n" data-rs-score="' + s0 + '">' + s0 + "</button>";
    bg.innerHTML = '<div class="rate-sheet">' +
      '<div class="rs-head"><b>' + esc(pl.name) + "</b>" + (pl.number != null ? ' <span class="rs-num">#' + pl.number + "</span>" : "") + '<button class="rs-x" aria-label="닫기">✕</button></div>' +
      '<div class="rs-vals">' + (off != null ? '공식 <b class="rs-off">' + off.toFixed(1) + "</b>" : "팬 평점") + "</div>" +
      '<div class="rs-hint">탭해서 내 평점 주기</div>' +
      '<div class="rs-scale">' + scale0 + "</div>" +
      '<button class="rs-mvp" data-rs-mvp>🏆 이 경기 최고의 선수로 뽑기</button>' +
      '<button class="rs-detail">선수 상세 보기 →</button></div>';
    document.body.appendChild(bg);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); }
    ktModalOpen(close);  // 뒤로가기 시 페이지가 아니라 팝업이 닫히도록
    function load() {
      KickComments.ready().then(function () { return Promise.all([KickComments.matchRatings(matchId), KickComments.matchMvp ? KickComments.matchMvp(matchId) : null]); }).then(function (arr) {
        var rd = arr[0] || {}, md = arr[1] || { votes: {}, mine: null };
        var ur = (rd.byPlayer && rd.byPlayer[pid]) || null, mine = (rd.mine && rd.mine[pid]) || 0; bg._mine = mine;
        bg.querySelector(".rs-vals").innerHTML = (off != null ? '공식 <b class="rs-off">' + off.toFixed(1) + "</b>" : "") + (off != null && ur ? " · " : "") + (ur ? '유저 <b class="rs-usr">' + ur.avg.toFixed(1) + "</b> (" + ur.cnt + "명)" : (off == null ? "아직 유저 평점 없음" : ""));
        bg.querySelector(".rs-hint").textContent = "탭해서 내 평점" + (mine ? " · 현재 " + mine + "점 (다시 누르면 취소)" : "");
        Array.prototype.forEach.call(bg.querySelectorAll(".rs-n"), function (btn) { btn.classList.toggle("on", +btn.getAttribute("data-rs-score") === mine); });
        var isMvp = md.mine === pid; bg._mvpMine = md.mine;  // 이 경기 최고의 선수(MVP) — 경기당 1명
        var mvpBtn = bg.querySelector(".rs-mvp");
        if (mvpBtn) { var vc = (md.votes && md.votes[pid]) || 0; mvpBtn.classList.toggle("on", isMvp); mvpBtn.innerHTML = (isMvp ? "🏆 내가 뽑은 최고의 선수 ✓ (취소)" : "🏆 이 경기 최고의 선수로 뽑기") + (vc ? ' <span class="rs-mvpn">' + vc + "표</span>" : ""); }
      }).catch(function () {});
    }
    bg.addEventListener("click", function (e) {
      if (e.target === bg || e.target.closest(".rs-x")) { if (ktModalClose) history.back(); else close(); return; }
      var n = e.target.closest("[data-rs-score]");
      if (n) { if (!KickComments.user || !KickComments.user()) { KickComments.promptLogin(); return; } var sc = +n.getAttribute("data-rs-score"); (bg._mine === sc ? KickComments.unrateMatchPlayer(matchId, pid) : KickComments.rateMatchPlayer(matchId, pid, sc)).then(load); return; }
      if (e.target.closest(".rs-mvp")) { if (!KickComments.user || !KickComments.user()) { KickComments.promptLogin(); return; } (bg._mvpMine === pid ? KickComments.unvoteMvp(matchId) : KickComments.voteMvp(matchId, pid)).then(function () { ktToast(bg._mvpMine === pid ? "최고의 선수 취소" : "🏆 최고의 선수로 뽑았어요!"); load(); }); return; }
      if (e.target.closest(".rs-detail")) { ktModalClose = null; close(); location.hash = "#player/" + pid; return; }
    });
    load();
  }
  function luPlayer(p, matchId, subInfo, goals, ended, outInfo, teamKo) {
    var num = (p.jersey != null && p.jersey !== "") ? p.jersey : "";
    var enm = (p.athlete && (p.athlete.displayName || p.athlete.shortName)) || "";
    var mp = playerByName(enm, teamKo, p.jersey), nm = mp ? mp.name : enm;
    var pos = (p.position && (p.position.abbreviation || p.position.name)) || "";
    var info = subInfo && subInfo[enm];  // 교체 투입 정보(들어온 분·나간 선수)
    var oinfo = outInfo && outInfo[enm];  // 교체로 빠진 선발(경기중 잔디엔 없음 → 명단에 표시)
    var gi = (goals && goals[enm]) ? ' <span class="lu-goal">⚽' + (goals[enm] > 1 ? goals[enm] : "") + "</span>" : "";  // 득점 표시
    var rb = ratingBox(ratingOf(matchId, nm));
    var sub = info ? '<span class="lu-subin">⇄ ' + esc(info.clk) + " · " + esc(info.outKo) + "</span>"
            : oinfo ? '<span class="lu-subin lu-subout">↓ ' + esc(oinfo.clk) + " · " + esc(oinfo.inKo) + " 교체</span>" : "";
    var tap = mp ? (ended ? ' data-rate="' + esc(mp.id) + '" data-rmatch="' + esc(matchId) + '"' : ' data-player="' + esc(mp.id) + '"') : "";  // 종료=평점시트, 아니면 상세
    return '<div class="lu-p' + (mp ? " clickable" : "") + '"' + tap + '><span class="lu-num">' + esc(num) + '</span><span class="lu-pmain"><span class="lu-nm">' + esc(nm) + gi + "</span>" + sub + "</span>" + (pos && !info && !oinfo ? '<span class="lu-pos">' + esc(pos) + "</span>" : "") + rb + "</div>";
  }
  function enToKo(name, teamKo) { var mp = playerByName(name || "", teamKo); return mp ? mp.name : (name || ""); }
  function luEvent(ev) {
    var evTeamKo = ev.team ? ((teamsById[espnTeamId(ev.team.displayName)] || {}).name) : null;  // 이벤트 팀 → 동명이인 매칭
    function nk(a) { return enToKo((a && a.displayName) || "", evTeamKo); }
    function jn(a) { var n = (a && a.displayName) || "", mp = playerByName(n, evTeamKo); var num = (mp && mp.number != null) ? mp.number : ((a && a.jersey != null && a.jersey !== "") ? a.jersey : ""); return (num !== "" ? num + "번 " : "") + enToKo(n, evTeamKo); }
    var ty = ((ev.type && ev.type.type) || "").toLowerCase(), clk = (ev.clock && ev.clock.displayValue) || "";
    var parts = (ev.participants || ev.athletesInvolved || []).map(function (a) { return a.athlete; }).filter(Boolean);
    var icon, txt;
    if (/own.?goal/.test(ty)) { icon = "⚽"; txt = nk(parts[0]) + " 자책골"; }
    else if (/goal|scored/.test(ty) && !/missed|saved/.test(ty)) { icon = "⚽"; txt = nk(parts[0]) + " 골" + (parts[1] ? " (도움 " + nk(parts[1]) + ")" : ""); }
    else if (/yellow/.test(ty)) { icon = "🟨"; txt = nk(parts[0]) + " 경고"; }
    else if (/red/.test(ty)) { icon = "🟥"; txt = nk(parts[0]) + " 퇴장"; }
    else if (/substitution/.test(ty)) { icon = "🔄"; txt = (parts[0] ? jn(parts[0]) + " ⬆" : "") + (parts[1] ? " " + jn(parts[1]) + " ⬇" : ""); }
    else return "";
    if (!(txt || "").trim()) txt = ev.shortText || ev.text || "";
    var evT = ev.team ? espnTeamId(ev.team.displayName) : null;
    var flag = (evT && teamsById[evT]) ? teamsById[evT].flag : "";  // 어느 나라 이벤트인지(타국 경기 구분)
    return '<div class="lu-ev"><span class="lu-ec">' + esc(clk) + '</span><span class="lu-ei">' + icon + "</span>" +
      (flag ? '<span class="lu-eflag">' + esc(flag) + "</span>" : "") +
      '<span class="lu-et">' + esc(txt) + "</span></div>";
  }
  // 경기 통계(ESPN boxscore) — 종료 경기, 교체명단 아래. 점유율=분할바, 나머지=가운데 미러바.
  var STAT_DEFS = [
    { k: "possessionPct", l: "점유율", pct: 1, split: 1 },
    { k: "totalShots", l: "슈팅" },
    { k: "shotsOnTarget", l: "유효 슈팅" },
    { k: "saves", l: "선방" },
    { k: "wonCorners", l: "코너킥" },
    { k: "foulsCommitted", l: "파울" },
    { k: "offsides", l: "오프사이드" },
    { k: "totalPasses", l: "패스" },
    { k: "passPct", l: "패스 성공률", pct: 1, ratio: ["accuratePasses", "totalPasses"] },  // ESPN passPct는 소수1자리 반올림(0.9) → 정확도 위해 성공/시도로 직접 계산
    { k: "totalTackles", l: "태클" },
    { k: "interceptions", l: "인터셉트" },
    { k: "yellowCards", l: "경고" },
  ];
  function statOf(team, key) {
    var st = (team.statistics || []).filter(function (x) { return x.name === key; })[0];
    if (!st) return null;
    var v = (st.value != null) ? st.value : parseFloat(st.displayValue);
    return isNaN(v) ? null : v;
  }
  function matchStatsHtml(a, b, bs, live) {
    var teams = (bs && bs.teams) || []; if (teams.length < 2) return "";
    function tid(t) { return espnTeamId(t.team && t.team.displayName); }
    var aT = tid(teams[0]) === a.id ? teams[0] : teams[1], bT = (aT === teams[0]) ? teams[1] : teams[0];
    function ratioPct(t, r) { var den = statOf(t, r[1]); if (!den) return null; var num = statOf(t, r[0]); return num == null ? null : num / den * 100; }
    var rows = STAT_DEFS.map(function (d) {
      var av = d.ratio ? ratioPct(aT, d.ratio) : statOf(aT, d.k), bv = d.ratio ? ratioPct(bT, d.ratio) : statOf(bT, d.k);
      if (av == null && bv == null) return "";
      av = av || 0; bv = bv || 0;
      av = Math.round(av * (d.mul || 1)); bv = Math.round(bv * (d.mul || 1));
      var at = d.pct ? av + "%" : av, bt = d.pct ? bv + "%" : bv;
      var aw = av >= bv, bw = bv >= av, bar;
      var ld = av < bv ? " dim" : "", rd = bv < av ? " dim" : "";  // 낮은 값 쪽 막대는 회색으로 흐리게(소파스코어식)
      if (d.split) {
        var tot = av + bv || 1;
        bar = '<div class="ms-bar sp"><span class="l" style="width:' + (av / tot * 100) + '%"></span><span class="r" style="width:' + (bv / tot * 100) + '%"></span></div>';
      } else if (d.pct) {
        // 퍼센트 지표(패스 성공률 등)는 상대비교가 아니라 각자 실제 %로 채움(90%면 막대 90%)
        var pa = Math.max(0, Math.min(100, av)), pb = Math.max(0, Math.min(100, bv));
        bar = '<div class="ms-bar mr"><span class="ms-h l"><i class="f' + ld + '" style="width:' + pa + '%"></i></span><span class="ms-h r"><i class="f' + rd + '" style="width:' + pb + '%"></i></span></div>';
      } else {
        var sm = av + bv || 1;  // 소파스코어식: 각 막대 = 값/합(비율). 한쪽이 0 아니면 양쪽 다 안 참.
        bar = '<div class="ms-bar mr"><span class="ms-h l"><i class="f' + ld + '" style="width:' + (av / sm * 100) + '%"></i></span><span class="ms-h r"><i class="f' + rd + '" style="width:' + (bv / sm * 100) + '%"></i></span></div>';
      }
      var pl = d.split ? " ms-pill ms-pill-l" : "", pr = d.split ? " ms-pill ms-pill-r" : "";  // 점유율은 팀색 알약 배지
      return '<div class="ms-row"><div class="ms-top"><span class="ms-v' + pl + (aw ? " win" : "") + '">' + at + '</span><span class="ms-l">' + esc(d.l) + '</span><span class="ms-v' + pr + (bw ? " win" : "") + '">' + bt + "</span></div>" + bar + "</div>";
    }).join("");
    if (!rows) return "";
    return '<div class="mstat"><div class="mstat-h">📊 경기 통계' + (live ? ' <span class="ms-live">● 실시간</span>' : "") + "</div>" +
      '<div class="mstat-leg"><span class="ms-tm">' + esc(a.flag) + " " + esc(a.name) + '</span><span class="ms-tm">' + esc(b.name) + " " + esc(b.flag) + "</span></div>" + rows + "</div>";
  }
  function renderLineup(slot, d, a, b, fx) {
    var rosters = d.rosters || [];
    var matchId = fx ? fx.id : null;
    // 교체 투입 정보 파싱(들어온 선수 → 몇분·나간 선수)
    var subInfo = {}, outInfo = {};
    (d.keyEvents || []).forEach(function (ev) {
      if (!/substitution/i.test((ev.type && ev.type.type) || "")) return;
      var parts = (ev.participants || []).map(function (x) { return x.athlete; }).filter(Boolean);
      if (parts.length < 2) return;
      var inN = parts[0].displayName, outN = parts[1].displayName, clk = (ev.clock && ev.clock.displayValue) || "";
      var evKo = ev.team ? ((teamsById[espnTeamId(ev.team.displayName)] || {}).name) : null;
      if (inN) subInfo[inN] = { clk: clk, outKo: enToKo(outN, evKo) };
      if (outN) outInfo[outN] = { clk: clk, inKo: enToKo(inN, evKo) };  // 교체로 빠진 선발 → 명단에 표시(경기중)
    });
    var _em = matchEventMap(d.keyEvents);  // 득점/교체 표시용
    var hasLineup = rosters.some(function (r) { return (r.roster || []).some(function (p) { return p.starter; }); });
    var events = (d.keyEvents || []).filter(function (ev) { var ty = (ev.type && ev.type.type) || ""; return /goal|scored|yellow|red|substitution/.test(ty); });
    if (!hasLineup && !events.length) { slot.style.display = "none"; return; }
    var html = "";
    if (hasLineup) {
      // 선발은 피치에 다 있으니 LIST엔 '교체 명단'만(접이식, 평소 접힘 → 경기상세 짧게)
      var subsHtml = rosters.map(function (rs) {
        var t = teamsById[espnTeamId(rs.team && rs.team.displayName)];
        var nm = t ? (t.flag + " " + t.name) : ((rs.team && rs.team.displayName) || "");
        var subs = (rs.roster || []).filter(function (p) { return !p.starter; });
        // 경기중엔 잔디가 '현재 선수'라 교체로 빠진 선발이 잔디에 없음 → 명단 맨 위에 추가(골·교체시각 보이게). 종료 땐 잔디가 선발이라 불필요.
        if (!(fx && matchEnded(fx))) {
          var outS = (rs.roster || []).filter(function (p) { return p.starter && outInfo[(p.athlete && p.athlete.displayName) || ""]; });
          subs = outS.concat(subs);
        }
        if (!subs.length) return "";
        subs.sort(function (x, y) { function rank(p) { var n = (p.athlete && p.athlete.displayName) || ""; return outInfo[n] ? 0 : (subInfo[n] ? 1 : 2); } return rank(x) - rank(y); });  // 빠진 선발 → 투입선수 → 미출전 순
        return '<div class="lu-subteam"><div class="lu-tn">' + esc(nm) + '</div><div class="lu-list subs">' + subs.map(function (p) { return luPlayer(p, matchId, subInfo, _em.goals, fx && matchEnded(fx), outInfo, t && t.name); }).join("") + "</div></div>";
      }).join("");
      if (subsHtml) html += '<details class="lu-subs-d"' + (fx && matchEnded(fx) ? " open" : "") + '><summary>🔄 교체 명단</summary>' + subsHtml + "</details>";  // 종료 후엔 펼친 채로
    } else {
      html += '<h3>📋 라인업</h3><div class="lu-wait">선발 라인업은 킥오프 약 1시간 전에 공개돼요.</div>';
    }
    if (fx && (matchEnded(fx) || isLiveFix(fx)) && a && b) html += matchStatsHtml(a, b, d.boxscore, !matchEnded(fx) && isLiveFix(fx));  // 교체명단 아래 경기 통계(ESPN) — 라이브 중에도 표시(실시간)
    if (events.length) html += '<div class="lu-events"><h3>⚽ 주요 이벤트</h3>' + events.map(luEvent).join("") + "</div>";
    slot.innerHTML = html;
    twem(slot);
    // 실제 선발 라인업이 오면 포메이션 피치도 '예상→실시간'으로 자동 교체
    if (hasLineup) {
      try { var ep = espnPitch(d, a, b, matchId); var mb = viewEl.querySelector(".mf-block"); if (ep && mb) { mb.innerHTML = ep; mb.style.display = ""; twem(mb); } } catch (e) {}
    }
  }
  // ===== 경기 평점·MVP =====
  var mrCtx = null;
  // 라인업 아래 '팬이 뽑은 최고의 선수' 포디움 (종료 경기 + 득표 있을 때만)
  function loadMomPodium(slot, fx) {
    if (!slot || !window.KickComments || !KickComments.matchMvp) return;
    if (!matchEnded(fx)) { slot.style.display = "none"; return; }
    KickComments.ready().then(function () { return KickComments.matchMvp(fx.id); }).then(function (md) {
      if (parseHash().name !== "match") return;
      var votes = (md && md.votes) || {}, total = (md && md.total) || 0;
      var arr = Object.keys(votes).map(function (pid) { var p = playersById[pid]; return { pid: pid, name: p ? p.name : pid, team: p ? p.team : null, v: votes[pid] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
      var medals = ["🥇", "🥈", "🥉"], body;
      if (!arr.length) {
        body = '<div class="mom-empty">아직 투표가 없어요.<br>이 경기 최고의 선수에게 첫 표를 남겨보세요! 🏆</div>';
      } else {
        body = arr.map(function (x, i) {
          var pct = total ? Math.round(x.v / total * 100) : 0, t = x.team && teamsById[x.team];
          return '<div class="mom-row' + (i === 0 ? " top" : "") + '"><span class="mom-medal">' + medals[i] + "</span>" +
            '<span class="mom-nm">' + (t ? esc(t.flag) + " " : "") + esc(x.name) + "</span>" +
            '<span class="mom-bar"><span style="width:' + pct + '%"></span></span>' +
            '<span class="mom-vn">' + x.v + "표 · " + pct + "%</span></div>";
        }).join("");
      }
      slot.style.display = "";
      slot.innerHTML = '<div class="block mom-card"><h3>🏅 이 경기 최고의 선수 (MVP)' + (total ? ' <span class="mom-tot">' + total + "명 투표</span>" : "") + "</h3>" + body +
        '<button class="mom-go" data-rate-go="' + esc(fx.id) + '">⭐ 선수 평점 매기기 · MVP 투표 →</button></div>';
      twem(slot);
    }).catch(function () { slot.style.display = "none"; });
  }
  function matchKickoff(fx) { try { var ms = Date.parse(fxDate(fx) + "T" + (fxTime(fx) || "00:00") + ":00+09:00"); return isNaN(ms) ? null : ms; } catch (e) { return null; } }
  function matchEnded(fx) { var lv = LIVE[fx.id]; if (lv && lv.state === "post") return true; var ko = matchKickoff(fx); return ko ? Date.now() > ko + 130 * 60000 : false; }
  function teamIds(t) { var ids = []; (t.lineup || []).forEach(function (d) { if (playersById[d.playerId] && ids.indexOf(d.playerId) < 0) ids.push(d.playerId); }); return ids; }
  function ofTags(p) { var t = ""; if (p.goals) t += " ⚽" + (p.goals > 1 ? p.goals : ""); if (p.assists) t += " 🅰" + (p.assists > 1 ? p.assists : ""); if (p.yellow) t += " 🟨"; if (p.red) t += " 🟥"; if (p.og) t += " 자책"; return t ? '<span class="of-ev">' + t + "</span>" : ""; }
  // 출장 선수만 + MVP 1탭 투표 + 킥톡 평점(기록+민심 blend). (공식 평점 유료 연동 시 r 자리에 드롭인)
  function loadMvpBoard(matchId, a, b, md) {
    var slot = viewEl.querySelector(".mvp-slot"); if (!slot || !KickComments.matchStatsOne) return;
    var setA = {}, setB = {};
    teamIds(a).forEach(function (id) { setA[id] = 1; }); teamIds(b).forEach(function (id) { setB[id] = 1; });
    KickComments.matchStatsOne(matchId).then(function (data) {
      if (parseHash().name !== "rate") return;
      var played = ((data && data.players) || []).filter(function (p) { return p.pid && ((p.apps || 0) > 0 || p.goals || p.assists || p.yellow || p.red || p.og); });
      if (!played.length) { slot.innerHTML = '<div class="mr-hint muted-note">선발 라인업이 나오면 출장 선수와 함께 열려요. (보통 킥오프 ~1시간 전)</div>'; return; }
      var votes = (md && md.votes) || {}, total = (md && md.total) || 0, mine = md && md.mine;
      var rated = played.map(function (p) {
        var off = ratingOf(matchId, p.name);  // 공식 사진 공식 평점(MATCH_RATINGS) — 라인업과 동일
        var ev = (p.goals || 0) * 1.1 + (p.assists || 0) * 0.6 - (p.yellow || 0) * 0.3 - (p.red || 0) * 1.3 - (p.og || 0) * 1.2;
        var vb = total > 0 ? (votes[p.pid] || 0) / total * 1.5 : 0;  // 민심 보너스
        var blend = Math.max(5.0, Math.min(9.9, Math.round((6.4 + ev + vb) * 10) / 10));
        var r = (off != null) ? off : blend;  // 공식 있으면 공식 사진, 없으면 킥톡 blend
        var side = setA[p.pid] ? "A" : setB[p.pid] ? "B" : (p.team === a.name ? "A" : "B");
        return { pid: p.pid, name: p.name, side: side, r: r, off: off, v: votes[p.pid] || 0, goals: p.goals, assists: p.assists, yellow: p.yellow, red: p.red, og: p.og };
      });
      var mom = rated.slice().sort(function (x, y) { return y.r - x.r; })[0];
      var head = mom ? '<div class="mr-lead">🏅 이 경기 MVP <b>' + esc(mom.name) + "</b> · " + (mom.off != null ? "평점 " : "킥톡 평점 ") + mom.r.toFixed(1) + (total ? ' <span class="muted-note">(' + total + "표)</span>" : "") + "</div>" : "";
      head += '<div class="mr-hint muted-note">제일 잘한 선수에게 🏆 한 번만! 평점은 경기 활약(골·도움·카드)과 민심을 반영해요.</div>';
      function card(p) {
        var voted = mine === p.pid, pct = total > 0 ? Math.round(p.v / total * 100) : 0;
        var rc = p.r >= 7.0 ? "#1aa55b" : p.r >= 6.5 ? "#e8a90c" : "#e5566a";  // 공식 사진식 색
        return '<div class="mvp-card' + (voted ? " voted" : "") + (p === mom ? " mom" : "") + '">' +
          '<div class="mvp-top"><span class="mvp-nm" data-player="' + esc(p.pid) + '">' + (p === mom ? "⭐ " : "") + esc(p.name) + ofTags(p) + '</span><span class="mvp-rt" style="color:' + rc + '">' + p.r.toFixed(1) + "</span></div>" +
          '<div class="mvp-vbar"><span style="width:' + pct + '%"></span></div>' +
          '<div class="mvp-bot"><span class="mvp-vn">' + p.v + "표 · " + pct + '%</span><button class="mvp-btn' + (voted ? " on" : "") + '" data-mvp-pid="' + esc(p.pid) + '" title="' + (voted ? "내 MVP (다시 누르면 취소)" : "MVP 투표") + '">🏆</button></div></div>';
      }
      function teamBlock(side, team) {
        var list = rated.filter(function (p) { return p.side === side; }).sort(function (x, y) { return y.r - x.r; });
        return '<div class="sec-h">' + esc(team.flag) + " " + esc(team.name) + '</div><div class="mvp-list">' + (list.length ? list.map(card).join("") : '<div class="mr-hint muted-note">기록 없음</div>') + "</div>";
      }
      slot.innerHTML = head + teamBlock("A", a) + teamBlock("B", b);
      twem(slot);
    }).catch(function () {});
  }
  function renderMatchRate(matchId) {
    backBtn.hidden = false; tabsEl.hidden = true;
    var fx = fixturesById[matchId];
    if (!fx) { viewEl.innerHTML = '<div class="empty">경기를 찾을 수 없어요.</div>'; return; }
    var a = teamsById[fx.homeId], b = teamsById[fx.awayId];
    if (fx.awayId === "south-korea" && a && b) { var sw = a; a = b; b = sw; }
    if (!a || !b) { viewEl.innerHTML = '<div class="empty">아직 팀이 확정되지 않은 경기예요.</div>'; return; }
    var title = '<div class="sec-h">⭐ 선수 평점 · MVP</div><div class="mr-match">' + esc(a.flag) + " " + esc(a.name) + " vs " + esc(b.name) + " " + esc(b.flag) + "</div>";
    mrCtx = { matchId: matchId, a: a, b: b };
    viewEl.innerHTML = '<div class="detail">' + title + '<div class="h2h-loading">불러오는 중…</div></div>';
    KickComments.ready().then(function () { return KickComments.matchMvp(matchId); })
      .then(function (md) { if (parseHash().name === "rate") paintMatchRate(md); })
      .catch(function () { viewEl.innerHTML = '<div class="detail">' + title + '<div class="empty">평점을 불러오지 못했어요.</div></div>'; });
  }
  function paintMatchRate(md) {
    if (!mrCtx) return;
    mrCtx.mvpMine = md && md.mine;
    var a = mrCtx.a, b = mrCtx.b;
    viewEl.innerHTML = '<div class="detail"><div class="sec-h">⭐ 선수 평점 · MVP</div><div class="mr-match">' + esc(a.flag) + " " + esc(a.name) + " vs " + esc(b.name) + " " + esc(b.flag) + '</div><div class="mvp-slot"><div class="mr-hint muted-note">집계 중…</div></div></div>';
    twem(viewEl);
    loadMvpBoard(mrCtx.matchId, a, b, md);
  }
  function refreshMatchRatings() {
    if (!mrCtx) return;
    KickComments.matchMvp(mrCtx.matchId).then(function (md) { if (parseHash().name === "rate") { mrCtx.mvpMine = md && md.mine; loadMvpBoard(mrCtx.matchId, mrCtx.a, mrCtx.b, md); } });
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
    var persp = (b.id === perspId) ? b : a;  // perspId 팀(한국 경기면 항상 한국) — a/b 스왑과 무관하게 id로 매칭
    var perspName = persp.name, oppName = (persp === a ? b : a).name;
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
        '<span class="h2h-line"><b>' + esc(perspName) + "</b> " + sc + " " + esc(oppName) + '<span class="h2h-meta"> · ' + esc(meta) + "</span></span></div>";
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
  function openGacha() {
    if (!window.KickComments || !KickComments.user || !KickComments.user()) { if (window.KickComments) KickComments.promptLogin(); return; }
    var bg = document.createElement("div"); bg.className = "rate-sheet-bg";
    bg.innerHTML = '<div class="rate-sheet gacha"><div class="gc-title">🎰 럭키 드로우 <button class="gc-oddsbtn">확률 ⓘ</button></div>' +
      '<div class="gc-odds hidden">🎲 당첨 확률<br>꽝 35% · 50KP 33% · 100KP 18% · 200KP 8% · 500KP 4% · 🎉잭팟 1000KP 2%</div>' +
      '<div class="gc-reel">?</div><div class="gc-msg">버튼을 눌러 뽑아보세요!</div>' +
      '<button class="gc-draw">뽑기 🎲</button><button class="gc-close rs-detail">닫기</button></div>';
    document.body.appendChild(bg);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); if (parseHash().name === "my") renderMy(); }
    ktModalOpen(close);
    var spinning = false;
    function setBtn() { var btn = bg.querySelector(".gc-draw"); if (!btn || spinning) return; KickComments.freeDrawAvailable().then(function (free) { if (!spinning) btn.textContent = free ? "🆓 오늘의 무료 뽑기 🎲" : "뽑기 · 100 KP 🎲"; }); }
    setBtn();
    bg.addEventListener("click", function (e) {
      if (e.target.closest(".gc-close")) { if (ktModalClose) history.back(); else close(); return; }
      if (e.target.closest(".gc-oddsbtn")) { bg.querySelector(".gc-odds").classList.toggle("hidden"); return; }
      if (e.target.closest(".gc-draw") && !spinning) {
        spinning = true;
        var reel = bg.querySelector(".gc-reel"), msg = bg.querySelector(".gc-msg"), btn = bg.querySelector(".gc-draw");
        btn.disabled = true; msg.textContent = "두구두구…"; reel.className = "gc-reel";
        var vals = [0, 50, 100, 200, 500, 1000], i = 0;
        var spin = setInterval(function () { reel.textContent = vals[(i++) % vals.length]; }, 80);
        KickComments.luckyDraw().then(function (res) {
          setTimeout(function () {
            clearInterval(spin); spinning = false; btn.disabled = false;
            if (!res || res.error) { msg.textContent = (res && res.error === "not_enough") ? "포인트가 부족해요 (100 KP 필요)" : "잠시 후 다시 시도"; reel.textContent = "?"; setBtn(); return; }
            reel.textContent = res.reward; reel.className = "gc-reel " + (res.jackpot ? "jackpot" : res.reward === 0 ? "miss" : "win");
            msg.innerHTML = (res.free ? "🆓 무료 · " : "") + (res.reward === 0 ? "꽝! 다음 기회에 😅" : ((res.jackpot ? "🎉 잭팟!! " : "🎁 ") + "+" + res.reward + " KP")) + ' <span class="muted-note">(잔액 ' + (res.points || 0).toLocaleString() + " KP)</span>";
            btn.textContent = "다시 뽑기 · 100 KP 🎲";  // 무료 1회 소진됨
          }, 1100);
        }).catch(function () { clearInterval(spin); spinning = false; btn.disabled = false; msg.textContent = "오류 — 다시 시도"; setBtn(); });
      }
    });
  }
  function openTitleShop() {
    if (!window.KickComments || !KickComments.user || !KickComments.user()) { if (window.KickComments) KickComments.promptLogin(); return; }
    var bg = document.createElement("div"); bg.className = "rate-sheet-bg";
    bg.innerHTML = '<div class="rate-sheet tshop"><div class="rs-head"><b>🎨 칭호 꾸미기</b><button class="rs-x">✕</button></div>' +
      '<div class="ts-hint">칭호를 사면 댓글·채팅 이름 옆에 표시돼요. 한 번 사면 영구 보유 🎀</div>' +
      '<div class="ts-body"><div class="empty">불러오는 중…</div></div></div>';
    document.body.appendChild(bg);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); if (parseHash().name === "my") renderMy(); }
    ktModalOpen(close);
    function render() {
      var body = bg.querySelector(".ts-body"); if (!body) return;
      Promise.all([KickComments.cosmetics(), KickComments.myCosmetics()]).then(function (a) {
        var cat = a[0] || [], mine = a[1] || {}, owned = mine.owned_titles || [], cur = mine.title || null;
        if (!cat.length) { body.innerHTML = '<div class="empty">준비된 칭호가 없어요.</div>'; return; }
        var rows = cat.map(function (t) {
          var has = owned.indexOf(t.id) >= 0, on = cur === t.id;
          var btn = on ? '<button class="ts-btn on" disabled>장착중 ✓</button>'
            : has ? '<button class="ts-btn equip" data-tid="' + esc(t.id) + '">장착</button>'
            : '<button class="ts-btn buy" data-tid="' + esc(t.id) + '">' + (t.cost || 0).toLocaleString() + " KP</button>";
          return '<div class="ts-row"><span class="title-badge" style="color:' + t.color + '">' + esc(t.label) + "</span>" + btn + "</div>";
        }).join("");
        body.innerHTML = rows + (cur ? '<button class="ts-btn unequip" data-tid="">칭호 떼기</button>' : "");
      }).catch(function () { body.innerHTML = '<div class="empty">불러오기 실패 — 다시 시도</div>'; });
    }
    render();
    bg.addEventListener("click", function (e) {
      if (e.target === bg || e.target.closest(".rs-x")) { if (ktModalClose) history.back(); else close(); return; }
      var b = e.target.closest(".ts-btn[data-tid]"); if (!b) return;
      var tid = b.getAttribute("data-tid"); b.disabled = true; b.textContent = "…";
      KickComments.buyOrEquipTitle(tid || null).then(function (r) {
        if (r && r.error === "not_enough") { ktToast("포인트가 부족해요 😢"); render(); return; }
        if (r && r.error) { ktToast("다시 시도해주세요"); render(); return; }
        ktToast(tid ? (r && r.bought ? "🎀 칭호 구매 + 장착!" : "✅ 칭호 장착!") : "칭호를 뗐어요"); render();
      }).catch(function () { ktToast("로그인이 필요해요"); render(); });
    });
  }
  function loadCheers() {
    var slot = viewEl.querySelector(".cheer-slot"); if (!slot || !window.KickComments || !KickComments.recentCheers) return;
    var ct = /[?&]cheer=1/.test(location.search);  // ?cheer=1 → 더미 응원 미리보기
    var dummy = [
      { id: "d1", team: "south-korea", name: "축구도사", message: "대한민국 오늘 무조건 이긴다 🇰🇷🔥" },
      { id: "d2", team: "brazil", name: "삼바매니아", message: "헥사 가즈아!! 브라질 화이팅" },
      { id: "d3", team: "south-korea", name: "손케이드", message: "손흥민 멀티골 가자 ⚽⚽" },
      { id: "d4", team: null, name: "중립축구팬", message: "오늘 경기 꿀잼 각이다" }
    ];
    // ★ Supabase 준비 후에 조회 (ready 전엔 sb=null → 빈배열 → 응원 사라져 보이던 버그)
    var ready = (!ct && KickComments.ready) ? KickComments.ready() : Promise.resolve();
    ready.then(function () { return ct ? dummy : KickComments.recentCheers(15); }).then(function (list) {
      if (parseHash().name !== "home") return;
      var isAdmin = KickComments.isAdmin && KickComments.isAdmin();
      var items = (list || []).map(function (c) {
        var t = c.team && teamsById[c.team], flag = t ? esc(t.flag) + " " : "📣 ";
        var nm = KickComments.dispName ? KickComments.dispName(c.name, c.user_id) : (c.name || "익명");
        var msg = KickComments.mask ? KickComments.mask(c.message) : c.message;  // 욕설 마스킹
        return '<span class="ch-item">' + flag + "<b>" + esc(nm) + "</b> " + esc(msg) + (isAdmin ? ' <button class="ch-del" data-cheerdel="' + esc(c.id) + '">✕</button>' : "") + "</span>";
      }).join("");
      slot.innerHTML = '<div class="cheer-bar"><div class="cheer-marquee">' + (items ? '<div class="cheer-track">' + items + "</div>" : '<span class="ch-empty">첫 응원 메시지를 남겨보세요! 📣</span>') + "</div>" +
        '<button class="cheer-send" data-cheer-send>📣 응원</button></div>';
      twem(slot);
      if (items) {  // 넘칠 때만 복제+흐름 애니메이션 (하나면 그냥 1개 정적표시 — 2개로 보이던 버그 수정)
        var mq = slot.querySelector(".cheer-marquee"), tr = slot.querySelector(".cheer-track");
        if (tr && mq && tr.scrollWidth > mq.clientWidth + 8) { tr.innerHTML += tr.innerHTML; tr.classList.add("anim"); }
      }
    }).catch(function () {});
  }
  function openCheerCompose() {
    if (!window.KickComments || !KickComments.user || !KickComments.user()) { if (window.KickComments) KickComments.promptLogin(); return; }
    var bg = document.createElement("div"); bg.className = "rate-sheet-bg";
    bg.innerHTML = '<div class="rate-sheet"><div class="rs-head"><b>📣 응원 메시지 띄우기</b><button class="rs-x">✕</button></div>' +
      '<div class="rs-hint">메인 전광판에 한 줄 노출돼요 · 300 KP (최대 60자)</div>' +
      '<input class="ch-input" maxlength="60" placeholder="예: 대한민국 화이팅!! 🇰🇷">' +
      '<button class="gc-draw ch-post">300 KP로 응원 보내기 📣</button></div>';
    document.body.appendChild(bg);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); }
    ktModalOpen(close);
    setTimeout(function () { var i = bg.querySelector(".ch-input"); if (i) i.focus(); }, 100);
    bg.addEventListener("click", function (e) {
      if (e.target === bg || e.target.closest(".rs-x")) { if (ktModalClose) history.back(); else close(); return; }
      if (e.target.closest(".ch-post")) {
        var inp = bg.querySelector(".ch-input"), msg = (inp.value || "").trim(); if (!msg) { inp.focus(); return; }
        var btn = e.target.closest(".ch-post"); btn.disabled = true; btn.textContent = "전송 중…";
        KickComments.postCheer(msg, null).then(function (r) {
          if (r && r.ok) { ktToast("📣 응원 등록! (잔액 " + (r.points || 0).toLocaleString() + " KP)"); if (ktModalClose) history.back(); else close(); if (parseHash().name === "home") loadCheers(); }
          else { btn.disabled = false; btn.textContent = "300 KP로 응원 보내기 📣"; ktToast(r && r.error === "not_enough" ? "포인트가 부족해요 (300 KP)" : "다시 시도해주세요"); }
        }).catch(function () { btn.disabled = false; btn.textContent = "300 KP로 응원 보내기 📣"; ktToast("로그인이 필요해요"); });
      }
    });
  }
  function betItem(bet) {
    var fx = fixturesById[bet.match_id];
    var matchLabel = fx ? ((fx.homeName || "") + " vs " + (fx.awayName || "")) : bet.match_id;
    var home = (fx && teamsById[fx.homeId]) || {}, away = (fx && teamsById[fx.awayId]) || {};
    function teamDisp(t, nm) { return (t.flag ? esc(t.flag) + " " : "") + esc(nm || ""); }  // 국기+나라이름
    // 내 선택 — 국기 포함(무승부는 국기 제외)
    var pickH = bet.choice === "draw" ? "무승부"
      : bet.choice === "home" ? teamDisp(home, fx ? fx.homeName : "홈")
      : teamDisp(away, fx ? fx.awayName : "원정");
    var stH;
    if (bet.status === "won") stH = '<span class="bh-st bh-won">✅ 적중 +' + (bet.payout || 0).toLocaleString() + "</span>";
    else if (bet.status === "lost") stH = '<span class="bh-st bh-lost">❌ 실패 −' + (bet.stake || 0).toLocaleString() + "</span>";
    else stH = '<span class="bh-st bh-pending">⏳ 대기중</span>';
    // 최종 결과 — 승팀(국기+이름) 먼저, 스코어는 괄호. 무승부는 국기 없이.
    var lv = LIVE[bet.match_id], resRow = "";
    if (lv && lv.hs != null && lv.as != null && fx) {
      var winDisp = lv.hs > lv.as ? teamDisp(home, fx.homeName) : lv.hs < lv.as ? teamDisp(away, fx.awayName) : "무승부";
      resRow = '<span class="bh-k">결과</span><span class="bh-v">' + winDisp + ' <b class="bh-score">(' + lv.hs + ":" + lv.as + ")</b></span>";
    }
    // 시안 A — 카드 키·값 정렬(항목별 줄맞춤)
    return '<div class="bh-row' + (fx ? " bh-clk" : "") + '"' + (fx ? ' data-go="match/' + esc(bet.match_id) + '"' : "") + '>' +
      '<div class="bh-top"><span class="bh-match">⚽ ' + esc(matchLabel) + "</span>" + stH + "</div>" +
      '<div class="bh-kv">' +
        '<span class="bh-k">내 선택</span><span class="bh-v"><b class="bh-pick">' + pickH + "</b></span>" +
        '<span class="bh-k">베팅</span><span class="bh-v">' + (bet.stake || 0).toLocaleString() + " KP · 배당 " + bet.odds + "</span>" +
        resRow +
      "</div>" + (fx ? '<div class="bh-go">경기 상세 →</div>' : "") + "</div>";
  }
  function paintMy() {
    if (!myCache) return;
    var nick = (window.KickComments && KickComments.nick()) || "익명";
    var av = window.KickComments && KickComments.avatar();
    var avH = av ? '<img class="my-av" src="' + esc(av) + '" alt="">' : '<span class="my-av ph">' + esc(nick.slice(0, 1)) + "</span>";
    var listH;
    if (myTab === "bets") { listH = (myCache.bets || []).length ? myCache.bets.map(betItem).join("") : '<div class="empty">베팅 내역이 없어요.<br>경기에서 포인트로 베팅해보세요! 💰</div>'; }
    else { var list = myTab === "mine" ? myCache.mine : myCache.tagged; listH = list.length ? list.map(myItem).join("") : '<div class="empty">' + (myTab === "mine" ? "작성한 댓글이 없어요." : "나를 태그한 댓글이 없어요.") + "</div>"; }
    var pts = myCache.points, ptCard = "", rankH = "";
    if (pts && pts.points != null && KickComments.tierOf) {
      var tp = (pts.tpoints != null ? pts.tpoints : pts.points);  // 등급·표시는 배팅 대기금 포함(아직 내 돈)
      var tr = KickComments.tierOf(tp);
      var cpos = pts.cpos || 0, cdots = "";
      for (var _di = 1; _di <= 5; _di++) { var _rw = _di === 3 ? "+500" : _di === 5 ? "+800" : ""; cdots += '<span class="ci-dot' + (_di <= cpos ? " on" : "") + (_rw ? " rw" : "") + '">' + (_rw ? "<i>" + _rw + "</i>" : "") + "</span>"; }
      var checkBtn = '<div class="ci-box"><div class="ci-h">🔥 연속 출석 <b>' + (pts.cstreak || 0) + "일째</b><span class=\"ci-tag\">3·5일 보너스</span></div>" +
        '<div class="ci-dots">' + cdots + "</div>" +
        (pts.checked ? '<div class="pt-checked">✅ 오늘 출석 완료 · 내일 또 만나요!</div>'
                     : '<button class="pt-checkin" data-checkin>📅 오늘 출석하고 <b>+200 KP</b> 받기</button>') + "</div>";
      var ladder = KickComments.tiers ? '<details class="pt-tiers"><summary>🏅 등급 안내 (탭)</summary>' +
        KickComments.tiers().map(function (t) { var on = t.name === tr.name; return '<div class="pt-tl' + (on ? " on" : "") + '"><span class="pt-tl-n" style="color:' + t.c + '">' + t.name + (on ? " · 현재" : "") + '</span><span class="pt-tl-m">' + (t.min === 0 ? "0" : t.min.toLocaleString()) + " KP~</span></div>"; }).join("") +
        '<div class="pt-tl-hint">베팅 적중 + 매일 출석(+200)으로 포인트를 모으면 자동 승급해요. (현금화 ✕, 재미용)</div></details>' : "";
      ptCard = '<div class="pt-card"><div class="pt-top"><span class="pt-tier" style="background:' + tr.c + '">' + tr.name + "</span>" +
        '<span class="pt-bal">' + tp.toLocaleString() + ' <small>KP</small></span></div>' +
        (pts.pending > 0 ? '<div class="pt-pend">💰 베팅 대기중 ' + pts.pending.toLocaleString() + " KP 포함 (정산 전엔 내 포인트)</div>" : "") +
        '<div class="pt-sub">' + ((KickComments.streakBadge && pts.best_streak >= 2) ? KickComments.streakBadge(pts.best_streak) : "") + "🔥 연승 " + (pts.streak || 0) + " · 최고 " + (pts.best_streak || 0) + '연승 <button class="pt-guide" data-bet-guide>게임 방법 ⓘ</button></div>' +
        checkBtn +
        '<div class="pt-checkrow"><button class="pt-gacha" data-gacha>🎰 럭키 드로우</button><button class="pt-gacha pt-deco" data-titleshop>🎨 칭호 꾸미기</button></div>' + ladder + "</div>";
    }
    if (myCache.ranking && myCache.ranking.length) {
      var myUid = (KickComments.user() || {}).id;
      rankH = '<div class="sec-h" style="margin-top:18px">🏆 포인트 랭킹 TOP 20</div><div class="pt-rank">' +
        myCache.ranking.map(function (r, i) {
          var t = KickComments.tierOf(r.points), me = (r.user_id === myUid);
          return '<div class="pt-rk' + (me ? " me" : "") + '"><span class="pt-rk-n">' + (i + 1) + "</span>" +
            '<span class="pt-rk-tier" style="color:' + t.c + '">' + t.name + "</span>" +
            '<span class="pt-rk-name">' + (me ? "👤 나" : t.name + " 회원") + "</span>" +
            '<span class="pt-rk-pts">' + r.points.toLocaleString() + " KP</span></div>";
        }).join("") + "</div>";
    }
    viewEl.innerHTML = '<div class="my">' +
      '<div class="my-profile">' + avH +
        '<div class="my-meta"><div class="my-nick">' + esc(nick) + "</div>" +
          '<button class="my-edit">닉네임 수정</button>' +
          ((window.KickComments && KickComments.isAdmin && KickComments.isAdmin()) ? ' <button class="my-admin">🛠 관리자</button>' : "") + "</div>" +
        '<button class="my-out">로그아웃</button></div>' +
      ptCard +
      '<div class="my-editbox"></div>' +
      '<div class="my-tabs">' +
        '<button class="my-tabbtn' + (myTab === "mine" ? " on" : "") + '" data-mytab="mine">내가 쓴 댓글 ' + myCache.mine.length + "</button>" +
        '<button class="my-tabbtn' + (myTab === "tagged" ? " on" : "") + '" data-mytab="tagged">나를 태그한 댓글 ' + myCache.tagged.length + "</button>" +
        (IS_TOSS ? "" : '<button class="my-tabbtn' + (myTab === "bets" ? " on" : "") + '" data-mytab="bets">💰 베팅 ' + ((myCache.bets || []).length) + "</button>") + "</div>" +
      '<div class="my-list">' + listH + "</div>" + rankH + "</div>"; pageAd();
  }
  function renderMyLogin() {
    if (IS_TOSS) { viewEl.innerHTML = '<div class="my-login"><div class="my-login-t">댓글·응원은 닉네임으로 자유롭게 이용할 수 있어요. (로그인 기능은 준비 중이에요)</div></div>'; return Promise.resolve(); }  // 토스 웹뷰는 구글 OAuth 불가 → 익명 이용
    return KickComments.providers().then(function (P) {
      P = P || {};
      var btns = (P.google ? '<button class="my-in g" data-p="google"><svg width="16" height="16" viewBox="0 0 48 48" style="flex:none;vertical-align:middle"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> 구글 로그인</button>' : "") +
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
      Promise.all([KickComments.myComments(), KickComments.taggedComments(), KickComments.myPoints(), KickComments.pointsRanking(20), KickComments.myBets ? KickComments.myBets() : Promise.resolve([])]).then(function (res) {
        if (parseHash().name !== "my") return;
        myCache = { mine: res[0] || [], tagged: res[1] || [], points: res[2], ranking: res[3] || [], bets: res[4] || [] };
        paintMy();
      });
    });
  }

  // ===================== 관리자 페이지 (#admin) =====================
  var adminCache = null, adminTab = "reports", adminQ = "", memberSort = "act", adminChatQ = "", _chatSearchT = null, _adminScrollY = null;
  function loadAdminChat() {
    var box = viewEl.querySelector(".chat-admin-results"); if (!box || !window.KickComments) return;
    KickComments.chatSearch(adminChatQ).then(function (list) {
      if (parseHash().name !== "admin" || adminTab !== "chat") return;
      box.innerHTML = list.length ? list.map(function (m) {
        var d = m.created_at ? new Date(m.created_at) : null;
        var ts = d && !isNaN(d.getTime()) ? ((d.getMonth() + 1) + "." + d.getDate() + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2)) : "";
        return '<div class="mgr-item"><div class="mgr-ib"><b>' + esc(m.name || "익명") + '</b> <span class="yc-time">' + esc(ts) + '</span><br>' + esc(m.body || "") + '</div><div class="mgr-act"><button class="mgr-del" data-chatdel="' + esc(m.id) + '">삭제</button></div></div>';
      }).join("") : '<div class="empty">메시지가 없습니다.</div>';
      twem(box);
      if (_adminScrollY != null) { var _sy = _adminScrollY; _adminScrollY = null; requestAnimationFrame(function () { window.scrollTo(0, _sy); }); }  // 채팅 비동기 로드 완료 후 스크롤 복원(맨위로 안 감)
    });
  }
  function fmtJoin(iso) { try { var s = new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }), p = s.split(" "); return '<span class="mb-d">' + p[0].replace(/-/g, ".") + '</span><span class="mb-t">' + (p[1] || "") + "</span>"; } catch (e) { return ""; } }
  function membersTableHtml() {
    var us = (adminCache.users || []).slice();
    if (memberSort === "join") us.sort(function (a, b) { return (b.joined || "").localeCompare(a.joined || ""); });
    else us.sort(function (a, b) { return (b.comments + b.chats + b.ratings + b.posts) - (a.comments + a.chats + a.ratings + a.posts); });
    if (memberSort === "points") us.sort(function (a, b) { return (b.points || 0) - (a.points || 0); });
    var sorts = '<div class="mb-sorts"><button class="mb-sort' + (memberSort === "act" ? " on" : "") + '" data-msort="act">활동순</button><button class="mb-sort' + (memberSort === "points" ? " on" : "") + '" data-msort="points">포인트순</button><button class="mb-sort' + (memberSort === "join" ? " on" : "") + '" data-msort="join">가입순</button></div>';
    var head = '<div class="mb-row mb-head"><span class="mb-n">이름</span><span>가입</span><span>포인트</span><span>댓글</span><span>채팅</span><span>평점</span><span>글</span></div>';
    var rows = us.length ? us.map(function (u) { return '<div class="mb-row mb-clk"' + (u.user_id ? ' data-auid="' + esc(u.user_id) + '"' : "") + '><span class="mb-n">' + esc(u.name) + '</span><span class="mb-j">' + (u.joined ? fmtJoin(u.joined) : "") + '</span><span class="mb-pt">' + (u.points || 0).toLocaleString() + '</span><span>' + u.comments + '</span><span>' + u.chats + '</span><span>' + u.ratings + '</span><span>' + u.posts + "</span></div>"; }).join("") : '<div class="empty">회원이 없습니다.</div>';
    return sorts + '<div class="mb-table">' + head + rows + "</div>";
  }
  var ADM_RSN = { checkin: "출석", draw: "럭키드로우", bet: "베팅", bet_win: "베팅 적중", bet_refund: "베팅 취소", cheer: "응원", purchase: "칭호 구매" };
  function admDT(iso) { try { var d = new Date(iso); return (d.getMonth() + 1) + "." + d.getDate() + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); } catch (e) { return ""; } }
  function renderAdminUser(uid) {
    backBtn.hidden = false; tabsEl.hidden = true;
    if (!window.KickComments || !KickComments.adminUserDetail) { viewEl.innerHTML = '<div class="empty">권한이 없습니다.</div>'; return; }
    viewEl.innerHTML = '<div class="empty">불러오는 중…</div>';
    KickComments.adminUserDetail(uid).then(function (d) {
      if (parseHash().name !== "adminuser") return;
      if (!d) { viewEl.innerHTML = '<div class="empty">불러오기 실패</div>'; return; }
      var led = d.ledger || [], bets = d.bets || [], cmts = d.comments || [], chats = d.chats || [];
      var ledH = led.length ? led.map(function (l) { var up = l.delta >= 0; return '<div class="ul-row"><div class="ul-top"><span class="ul-rsn">' + esc(ADM_RSN[l.reason] || l.reason) + '</span><span class="ul-d ' + (up ? "up" : "dn") + '">' + (up ? "+" : "") + (l.delta || 0).toLocaleString() + '</span></div><div class="ul-meta">잔액 ' + (l.balance_after != null ? l.balance_after.toLocaleString() : "?") + " KP · " + admDT(l.created_at) + "</div></div>"; }).join("") : '<div class="empty">포인트 변동 내역 없음</div>';
      var betH = bets.length ? bets.map(function (b) { var fx = fixturesById[b.match_id]; var lbl = fx ? ((fx.homeName || "") + " vs " + (fx.awayName || "")) : b.match_id; var st = b.status === "won" ? '<span class="up">적중 +' + (b.payout || 0).toLocaleString() + "</span>" : b.status === "lost" ? '<span class="dn">실패 −' + (b.stake || 0).toLocaleString() + "</span>" : '<span class="muted-note">대기중</span>'; return '<div class="ud-item"><div class="ud-b">' + esc(lbl) + '</div><div class="ud-meta">' + esc(b.choice) + " · " + (b.stake || 0).toLocaleString() + "KP · 배당 " + b.odds + " · " + st + "</div></div>"; }).join("") : '<div class="empty">베팅 없음</div>';
      var cmtH = cmts.length ? cmts.map(function (c) { return '<div class="ud-item"><div class="ud-b">' + esc(c.body) + (c.hidden ? ' <span class="mgr-badge">숨김</span>' : "") + '</div><div class="ud-meta">' + esc(threadInfo(c.thread_key).label) + " · " + admDT(c.created_at) + "</div></div>"; }).join("") : '<div class="empty">댓글 없음</div>';
      var chatH = chats.length ? chats.map(function (c) { return '<div class="ud-item"><div class="ud-b">' + esc(c.body) + '</div><div class="ud-meta">' + admDT(c.created_at) + "</div></div>"; }).join("") : '<div class="empty">채팅 없음</div>';
      viewEl.innerHTML = '<div class="usr-page"><div class="usr-back" data-go="admin">← 회원 목록</div>' +
        '<div class="usr-hd"><div class="usr-nm">' + esc(d.name) + '</div><div class="usr-pt">' + (d.points || 0).toLocaleString() + ' KP</div></div>' +
        '<div class="usr-sub">가입 ' + admDT(d.joined) + " · 연승 " + (d.streak || 0) + "(최고 " + (d.best_streak || 0) + ")" + (d.title ? " · 칭호 " + esc(d.title) : "") + "</div>" +
        '<div class="usr-tabs"><button class="usr-tab on" data-ut="led">포인트내역 ' + led.length + '</button><button class="usr-tab" data-ut="bet">베팅 ' + bets.length + '</button><button class="usr-tab" data-ut="cmt">댓글 ' + cmts.length + '</button><button class="usr-tab" data-ut="chat">채팅 ' + chats.length + "</button></div>" +
        '<div class="usr-body" data-pane="led">' + ledH + "</div>" +
        '<div class="usr-body hidden" data-pane="bet">' + betH + "</div>" +
        '<div class="usr-body hidden" data-pane="cmt">' + cmtH + "</div>" +
        '<div class="usr-body hidden" data-pane="chat">' + chatH + "</div></div>";
      twem(viewEl);
      var page = viewEl.querySelector(".usr-page");
      page.addEventListener("click", function (e) {
        var t = e.target.closest(".usr-tab"); if (!t) return;
        var k = t.getAttribute("data-ut");
        Array.prototype.forEach.call(page.querySelectorAll(".usr-tab"), function (x) { x.classList.toggle("on", x === t); });
        Array.prototype.forEach.call(page.querySelectorAll(".usr-body"), function (p) { p.classList.toggle("hidden", p.getAttribute("data-pane") !== k); });
      });
    });
  }
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
  function adminDashHtml(d) {
    if (!d) return "";
    function card(label, val, acc, tab) { return '<div class="dash-card' + (acc ? " acc" : "") + (tab ? " clk" : "") + '"' + (tab ? ' data-adtab="' + tab + '"' : "") + '><div class="dash-v">' + (val != null ? val : "–") + '</div><div class="dash-l">' + label + "</div></div>"; }
    var cards = card("가입자 ›", d.members, true, "members") + card("댓글", d.comments) + card("게시글", d.posts) + card("채팅", d.chats) + card("평점", d.ratings);
    var today = '<div class="dash-today">🔥 오늘 — 신규 <b>' + (d.new_today || 0) + '</b> · 댓글 <b>' + (d.comments_today || 0) + '</b> · 게시글 <b>' + (d.posts_today || 0) + '</b> · 채팅 <b>' + (d.chats_today || 0) + "</b></div>";
    var daily = d.daily || [], maxv = 1;
    daily.forEach(function (x) { maxv = Math.max(maxv, x.signups || 0, x.acts || 0); });
    var bars = '<div class="dash-graph">' + daily.map(function (x) { var sg = x.signups || 0, ac = x.acts || 0, sh = Math.round(sg / maxv * 58), ah = Math.round(ac / maxv * 58); var tip = esc(x.day) + " · 가입 " + sg + " · 활동 " + ac; return '<div class="dash-col" data-tip="' + tip + '"><div class="dash-bars"><div class="db s" title="가입 ' + sg + '" style="height:' + sh + 'px"></div><div class="db a" title="활동 ' + ac + '" style="height:' + ah + 'px"></div></div><div class="dash-day">' + esc(x.day) + "</div></div>"; }).join("") + "</div>";
    var legend = '<div class="dash-leg"><span><i class="db s"></i>가입</span> <span><i class="db a"></i>활동(댓글+글+채팅)</span></div>';
    var recent = (d.recent_members || []).map(function (m) { return '<div class="dash-rm"><span>' + esc(m.nickname || "익명") + '</span><span class="muted-note">' + (m.created_at ? agoShort(m.created_at) : "") + "</span></div>"; }).join("");
    return '<div class="dash"><div class="dash-cards">' + cards + "</div>" + today + '<div class="dash-h">최근 7일</div>' + bars + legend + (recent ? '<div class="dash-h">최근 가입</div>' + recent : "") + "</div>";
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
    } else if (adminTab === "members") {
      html = membersTableHtml();
    } else if (adminTab === "chat") {
      html = '<div class="chat-admin-results"><div class="empty">불러오는 중…</div></div>';
    } else {
      var cs = adminCache.comments;
      if (adminQ) { var q = adminQ.toLowerCase(); cs = cs.filter(function (c) { return (c.body || "").toLowerCase().indexOf(q) >= 0 || (c.name || "").toLowerCase().indexOf(q) >= 0; }); }
      html = cs.length ? cs.map(function (c) { return adminItem(c); }).join("") : '<div class="empty">댓글이 없습니다.</div>';
    }
    viewEl.innerHTML = '<div class="mgr"><h2 class="mgr-h">🛠 관리자</h2>' + adminDashHtml(adminCache.dash) +
      '<div class="my-tabs">' +
        '<button class="mgr-tab my-tabbtn' + (adminTab === "reports" ? " on" : "") + '" data-adtab="reports">신고 내역 ' + adminCache.reports.length + "</button>" +
        '<button class="mgr-tab my-tabbtn' + (adminTab === "all" ? " on" : "") + '" data-adtab="all">전체 댓글 ' + adminCache.comments.length + "</button>" +
        '<button class="mgr-tab my-tabbtn' + (adminTab === "members" ? " on" : "") + '" data-adtab="members">회원 ' + ((adminCache.users || []).length) + "</button>" +
        '<button class="mgr-tab my-tabbtn' + (adminTab === "chat" ? " on" : "") + '" data-adtab="chat">💬 채팅</button></div>' +
      (adminTab === "all" ? '<input class="mgr-search" placeholder="댓글·작성자 검색" value="' + esc(adminQ) + '">' : "") +
      (adminTab === "chat" ? '<input class="mgr-search mgr-chatsearch" placeholder="채팅 내용·닉네임 검색 (비우면 최근 60개)" value="' + esc(adminChatQ) + '">' : "") +
      '<div class="mgr-list">' + html + "</div></div>";
    if (adminTab === "chat") { loadAdminChat(); return; }  // 채팅은 비동기라 loadAdminChat 완료 후 스크롤 복원
    if (_adminScrollY != null) { var _sy = _adminScrollY; _adminScrollY = null; requestAnimationFrame(function () { window.scrollTo(0, _sy); }); }  // 삭제·탭전환 후 그 자리 유지
  }
  function renderAdmin() {
    backBtn.hidden = true; tabsEl.hidden = true;
    if (!window.KickComments || !KickComments.configured()) { viewEl.innerHTML = '<div class="empty">준비 중입니다.</div>'; return; }
    if (adminCache) { _adminScrollY = window.scrollY; } else { viewEl.innerHTML = '<div class="empty">불러오는 중…</div>'; }  // 재렌더(삭제 등)면 스크롤 보존
    KickComments.ready().then(function () {
      if (parseHash().name !== "admin") return;
      if (!KickComments.isAdmin()) { viewEl.innerHTML = '<div class="empty">접근 권한이 없습니다.</div>'; return; }
      Promise.all([KickComments.listReports(), KickComments.listAllComments(""), KickComments.adminDashboard(), KickComments.adminUsers()]).then(function (res) {
        if (parseHash().name !== "admin") return;
        adminCache = { reports: res[0] || [], comments: res[1] || [], dash: res[2] || null, users: res[3] || [] };
        paintAdmin();
      });
    });
  }

  // ===================== 게시판(커뮤니티) =====================
  var boardCat = "전체", boardSort = "new", boardCache = null;
  function agoShort(iso) {
    try { var s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전";
      if (s < 86400) return Math.floor(s / 3600) + "시간 전"; return Math.floor(s / 86400) + "일 전";
    } catch (e) { return ""; }
  }
  function bdAvatar(name) {
    var n = (name || "?").trim(), ch = n.charAt(0).toUpperCase() || "?";
    var cols = ["#4f8cff", "#e5748a", "#5bbf8a", "#f0a93b", "#a986ff", "#46b9c9", "#e0739e"];
    var h = 0, i; for (i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return '<div class="pf-av" style="background:' + cols[h % cols.length] + '">' + esc(ch) + "</div>";
  }
  function postItem(p) {
    var u = KickComments.user && KickComments.user();
    var canMod = (u && u.id === p.user_id) || !!(KickComments.isAdmin && KickComments.isAdmin());
    var st = (boardCache && boardCache.stats && boardCache.stats[p.id]) || { likes: 0, dislikes: 0 };
    var rv = (boardCache && boardCache.mine && boardCache.mine[p.id]) || 0;
    return '<div class="pf-item" data-pid="' + esc(p.id) + '">' + bdAvatar(p.name) +
      '<div class="pf-main"><div class="pf-top"><span class="pf-nick">' + esc(p.name) + "</span>" +
      (p.pinned ? '<span class="pf-tag pin">📌 공지</span>' : '<span class="pf-tag">' + esc(p.category) + "</span>") +
      (canMod ? '<span class="pf-mod"><button class="pf-edit">수정</button><button class="pf-del">삭제</button></span>' : "") +
      '</div><div class="pf-date">' + agoShort(p.created_at) + "</div>" +
      '<div class="pf-content">' + esc(p.body).replace(/\n/g, "<br>") + "</div>" +
      '<div class="pf-react"><button class="pf-like' + (rv === 1 ? " on" : "") + '" data-rv="1">👍 <span>' + (st.likes || 0) + '</span></button>' +
      '<button class="pf-dislike' + (rv === -1 ? " on" : "") + '" data-rv="-1">👎 <span>' + (st.dislikes || 0) + "</span></button></div></div></div>";
  }
  function paintBoard() {
    if (!boardCache) return;
    var cats = ["전체", "자유", "경기예측", "응원", "정보"];
    var chips = '<div class="bd-cats">' + cats.map(function (c) { return '<button class="bd-cat' + (boardCat === c ? " on" : "") + '" data-bcat="' + c + '">' + c + "</button>"; }).join("") + "</div>";
    var fcats = ["자유", "경기예측", "응원", "정보"];
    var adm = !!(KickComments.isAdmin && KickComments.isAdmin());
    var loggedIn = !!(KickComments.user && KickComments.user());
    var form = IS_TOSS ? "" : '<div class="pf-write"><div class="pf-wrow"><select class="pf-wcat">' +
      fcats.map(function (c) { return '<option value="' + c + '"' + (boardCat === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>" +
      (adm ? '<label class="pf-wpin"><input type="checkbox" class="pf-wpinned"> 📌공지</label>' : "") + "</div>" +
      '<div class="pf-wmain"><textarea class="pf-wbody' + (loggedIn ? "" : " locked") + '"' + (loggedIn ? "" : " readonly") + ' maxlength="2000" placeholder="' +
      (loggedIn ? "내용을 입력해 주세요." : "로그인 후 작성할 수 있어요 (눌러서 로그인)") + '"></textarea>' +
      '<button class="pf-submit">완료</button></div></div>';
    var sortUi = '<div class="pf-sort"><button class="pf-s' + (boardSort === "new" ? " on" : "") + '" data-bsort="new">최신순</button><button class="pf-s' + (boardSort === "old" ? " on" : "") + '" data-bsort="old">오래된순</button></div>';
    var all = boardCache.posts.slice();
    var pin = all.filter(function (p) { return p.pinned; });
    var rest = all.filter(function (p) { return !p.pinned; });
    if (boardSort === "old") rest.reverse();
    var posts = pin.concat(rest);
    var listHtml = posts.length ? posts.map(postItem).join("") : '<div class="empty">아직 글이 없어요. 첫 글을 남겨보세요!</div>';
    viewEl.innerHTML = '<div class="bd"><h2 class="bd-h">📋 게시판</h2>' + chips + form + sortUi + '<div class="pf-list">' + listHtml + "</div></div>";
    twem(viewEl); pageAd();
  }
  function renderBoard() {
    backBtn.hidden = true; tabsEl.hidden = true;
    if (!window.KickComments || !KickComments.configured()) { viewEl.innerHTML = '<div class="empty">게시판 준비 중입니다.</div>'; return; }
    viewEl.innerHTML = '<div class="empty">불러오는 중…</div>';
    KickComments.ready().then(function () { return KickComments.listPosts(boardCat); }).then(function (d) {
      if (parseHash().name !== "board") return;
      boardCache = d; paintBoard();
    }).catch(function () { viewEl.innerHTML = '<div class="empty">게시판을 불러오지 못했어요.</div>'; });
  }
  function renderPost(id) {
    backBtn.hidden = false; tabsEl.hidden = true;
    viewEl.innerHTML = '<div class="empty">불러오는 중…</div>';
    KickComments.ready().then(function () { KickComments.bumpView(id); return KickComments.getPost(id); }).then(function (p) {
      if (parseHash().name !== "post") return;
      if (!p) { viewEl.innerHTML = '<div class="empty">삭제되었거나 없는 글이에요.</div>'; return; }
      var u = KickComments.user(), mine = u && u.id === p.user_id, adm = KickComments.isAdmin && KickComments.isAdmin();
      viewEl.innerHTML = '<div class="post">' +
        '<span class="post-cat">' + esc(p.category) + "</span>" +
        '<h2 class="post-title">' + esc(p.title) + "</h2>" +
        '<div class="post-meta">' + esc(p.name) + " · " + agoShort(p.created_at) + " · 조회 " + ((p.views || 0)) + "</div>" +
        '<div class="post-body">' + esc(p.body) + "</div>" +
        '<div class="post-act"><button class="post-like' + (p._liked ? " on" : "") + '" data-pid="' + esc(p.id) + '" data-liked="' + (p._liked ? "1" : "") + '">❤ <span>' + p._likes + "</span></button>" +
          ((mine || adm) ? '<button class="post-edit" data-pid="' + esc(p.id) + '">수정</button>' : "") +
          ((mine || adm) ? '<button class="post-del" data-pid="' + esc(p.id) + '">삭제</button>' : "") + "</div>" +
        '<div class="post-cmt"></div></div>';
      var slot = viewEl.querySelector(".post-cmt");
      if (slot && window.KickComments) KickComments.mount(slot, "post:" + id);
      twem(viewEl);
    });
  }
  function renderWrite(editId) {
    backBtn.hidden = false; tabsEl.hidden = true;
    viewEl.innerHTML = '<div class="empty">불러오는 중…</div>';
    KickComments.ready().then(function () {
      var hn = parseHash();
      if (hn.name !== "write" && hn.name !== "edit") return;
      if (!KickComments.user()) { viewEl.innerHTML = '<div class="empty">글쓰기는 로그인 후 가능해요.<br><br>하단 MY 탭에서 로그인해주세요.</div>'; return; }
      var adm = !!(KickComments.isAdmin && KickComments.isAdmin());
      function form(p) {
        var cats = ["자유", "경기예측", "응원", "정보"], cur = p ? p.category : "자유";
        viewEl.innerHTML = '<div class="write"><h2 class="bd-h">' + (editId ? "✏️ 글 수정" : "✏️ 글쓰기") + "</h2>" +
          '<select class="wr-cat">' + cats.map(function (c) { return '<option value="' + c + '"' + (c === cur ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>" +
          '<input class="wr-title" maxlength="100" placeholder="제목 (100자)" value="' + (p ? esc(p.title) : "") + '">' +
          '<textarea class="wr-body" maxlength="2000" placeholder="내용을 입력하세요 (2000자)">' + (p ? esc(p.body) : "") + "</textarea>" +
          (adm ? '<label class="wr-pin"><input type="checkbox" class="wr-pinned"' + (p && p.pinned ? " checked" : "") + "> 📌 공지사항으로 등록 (상단 고정)</label>" : "") +
          '<button class="wr-submit" data-edit="' + (editId ? esc(editId) : "") + '">' + (editId ? "수정 완료" : "등록") + "</button></div>";
      }
      if (editId) KickComments.getPost(editId).then(function (p) { if (parseHash().name === "edit") { if (p) form(p); else viewEl.innerHTML = '<div class="empty">글을 찾을 수 없어요.</div>'; } });
      else form(null);
    });
  }

  var matchLiveTimer = null;
  function stopMatchLive() { if (matchLiveTimer) { clearInterval(matchLiveTimer); matchLiveTimer = null; } window._matchLiveTick = null; }
  // 공유 넛지 — 앱을 충분히 써본 사용자(경기·선수 상세 3회 이상)에게 하루 1회 '친구에게 공유' 권유. 첫 방문자에겐 안 뜸.
  function _kday() { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); } catch (e) { return ""; } }
  function bumpEngage() {
    try {
      var n = (+localStorage.getItem("kt_engage") || 0) + 1; localStorage.setItem("kt_engage", n);
      if (n < 3) return;                                            // 3회 이상 본 사람만
      if (localStorage.getItem("kt_share_seen") === _kday()) return;  // 하루 1회
      if (document.querySelector(".share-nudge")) return;
      localStorage.setItem("kt_share_seen", _kday());
      showShareNudge();
    } catch (e) {}
  }
  function showShareNudge() {
    var ov = document.createElement("div"); ov.className = "share-nudge";
    ov.innerHTML = '<div class="sn-card"><div class="sn-emoji">⚽👍</div>' +
      '<div class="sn-title">킥톡 재밌게 보고 계신가요?</div>' +
      '<div class="sn-desc">친구에게 공유하면 같이 월드컵을 즐길 수 있어요!</div>' +
      '<div class="sn-btns"><button class="sn-share">친구에게 공유하기</button>' +
      '<button class="sn-close">오늘 하루 안 보기</button></div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.closest(".sn-close")) { close(); return; }
      if (e.target.closest(".sn-share")) {
        var url = "https://kicktalk.xyz/", txt = "⚽ 킥톡 — 실시간 경기 + 모든 선수 정보 | '저 선수 누구지?' 싶을 때 라인업·능력치·평점까지 바로";
        if (navigator.share) { navigator.share({ text: txt, url: url }).catch(function () {}); close(); }
        else { try { navigator.clipboard.writeText(txt + " " + url); ktToast("링크가 복사됐어요! 친구에게 붙여넣기 하세요 📋"); } catch (e2) {} close(); }
      }
    });
  }
  function route() {
    var r = parseHash();
    // 스크롤 복원: 뒤로가기(_isPop)면 기억된 위치로, 아니면 맨위.
    var _restoreY = (_isPop && _scrollMem.hasOwnProperty(hkey())) ? (_scrollMem[hkey()] || 0) : 0;
    _isPop = false;
    restoreScroll(_restoreY);
    stopMatchLive();
    if (r.name === "player") { setTabbar(""); renderPlayer(r.id); renderRating(r.id); mountCmt("player:" + r.id); bumpEngage(); return; }
    if (r.name === "compare") { setTabbar(""); renderCompare(r.a, r.b); return; }
    if (r.name === "rate") { setTabbar(""); renderMatchRate(r.id); return; }
    if (r.name === "team") { setTabbar(""); renderTeam(r.id); mountCmt("team:" + r.id); return; }
    if (r.name === "match") { setTabbar(""); renderMatch(r.id); mountCmt("match:" + r.id, viewEl.querySelector(".cmt-slot")); bumpEngage(); return; }
    if (r.name === "manager") { setTabbar(""); return renderManager(r.id); }
    if (r.name === "search") {
      setTabbar("search"); backBtn.hidden = true; tabsEl.hidden = true;
      return renderSearch(searchEl.value);
    }
    if (r.name === "board") { setTabbar("board"); return renderBoard(); }
    if (r.name === "post") { setTabbar("board"); return renderPost(r.id); }
    if (r.name === "write") { setTabbar("board"); return renderWrite(); }
    if (r.name === "edit") { setTabbar("board"); return renderWrite(r.id); }
    if (r.name === "saved") { setTabbar("saved"); return renderSaved(); }
    if (r.name === "my") { setTabbar("my"); return renderMy(); }
    if (r.name === "admin") { setTabbar(""); return renderAdmin(); }
    if (r.name === "adminuser") { setTabbar(""); return renderAdminUser(r.id); }
    if (r.name === "mvrank") { setTabbar(""); return renderMvRank(r.id); }
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
    if (e.target.classList && e.target.classList.contains("bet-amt")) { updBetWin(e.target.closest(".bet-slot")); return; }
    if (e.target.closest(".mgr-chatsearch")) { adminChatQ = e.target.value; clearTimeout(_chatSearchT); _chatSearchT = setTimeout(loadAdminChat, 280); return; }
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
      if (!window.KickComments || !KickComments.user()) { if (window.KickComments) KickComments.promptLogin(); else alert("로그인이 필요해요."); return; }
      var rpid = my.getAttribute("data-pid"), rsc = parseInt(my.getAttribute("data-s"), 10);
      KickComments.ratePlayer(rpid, rsc).then(function () { renderRating(rpid); }).catch(function () {});
      return;
    }
    var _ss = e.target.closest("[data-squadsort]");
    if (_ss) {  // 나라상세 선수단 정렬 토글 — 그리드만 갱신(스크롤 유지)
      var mode = _ss.getAttribute("data-squadsort");
      if (mode !== squadSort && _squadTeamId) {
        squadSort = mode;
        var _t = teamsById[_squadTeamId];
        if (_t) {
          var sorted = sortRosterBy(DATA.players.filter(function (p) { return p.team === _t.name; }), mode);
          var grid = viewEl.querySelector(".squad-grid");
          if (grid) grid.innerHTML = sorted.map(function (p) { return playerRow(p, false, true); }).join("");
          var btns = viewEl.querySelectorAll("[data-squadsort]");
          for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].getAttribute("data-squadsort") === mode);
        }
      }
      return;
    }
    if ((my = e.target.closest("[data-pred]"))) { var ps = my.closest(".pred-slot"); if (ps && ps._predFx && ps._predOpen && window.KickComments) KickComments.predVote(ps._predFx, my.getAttribute("data-pred")).then(ps._predPaint); return; }
    if ((my = e.target.closest(".bet-loginbtn"))) { if (window.KickComments && KickComments.signIn) KickComments.signIn(my.getAttribute("data-p") || "google"); return; }
    if (e.target.closest("[data-bet-guide]")) { showBetGuide(); return; }
    if (e.target.closest("[data-checkin]")) { if (window.KickComments && KickComments.dailyCheckin) KickComments.dailyCheckin().then(function (r) {
      if (!r || !r.got) { ktToast("오늘은 이미 출석했어요 😊"); }
      else if (r.bonus >= 800) { ktToast("🎊 5일 연속 달성! +200 +🎁800 = +1,000 KP!"); }
      else if (r.bonus >= 500) { ktToast("🔥 3일 연속! +200 +🎁500 = +700 KP!"); }
      else { ktToast("🎉 출석 완료 +200 KP! (연속 " + (r.streak || 1) + "일째)"); }
      renderMy();
    }); return; }
    if (e.target.closest("[data-gacha]")) { openGacha(); return; }
    if (e.target.closest("[data-titleshop]")) { openTitleShop(); return; }
    if (e.target.closest("[data-cheer-send]")) { openCheerCompose(); return; }
    var _chd = e.target.closest("[data-cheerdel]"); if (_chd) { if (window.KickComments && KickComments.deleteCheer) KickComments.deleteCheer(_chd.getAttribute("data-cheerdel")).then(function () { loadCheers(); }); return; }
    if ((my = e.target.closest("[data-betcancel]"))) {
      if (!confirm("베팅을 취소하고 포인트를 돌려받을까요?")) return;
      var bsc = my.closest(".bet-slot");
      if (window.KickComments) KickComments.cancelBet(my.getAttribute("data-betcancel")).then(function () { if (bsc && bsc._betReload) bsc._betReload(); ktToast("베팅 취소 · 포인트 환불 완료"); var psl = document.querySelector(".pred-slot"); if (psl && psl._predReload) psl._predReload(); }).catch(function () { alert("취소 실패 — 경기가 이미 시작됐을 수 있어요."); });
      return;
    }
    if ((my = e.target.closest("[data-betstep]"))) {
      var bss = my.closest(".bet-slot"); var inp = bss && bss.querySelector(".bet-amt"); if (!inp) return;
      var bal = bss._betStakeMax || 0, step = my.getAttribute("data-betstep"), cur = parseInt(inp.value, 10) || 0;
      inp.value = step === "ALLIN" ? bal : Math.max(10, Math.min(bal, cur + parseInt(step, 10)));
      updBetWin(bss); return;
    }
    if ((my = e.target.closest("[data-betch]"))) {
      var bsl = my.closest(".bet-slot"); if (!bsl || !bsl._betFx) return;
      var binp = bsl.querySelector(".bet-amt");
      var amt = Math.max(0, Math.min(parseInt(binp ? binp.value : bsl._betStake, 10) || 0, bsl._betStakeMax || 0));
      if (amt < 10) { alert("최소 10 KP부터 베팅할 수 있어요."); return; }
      if (!confirm(amt.toLocaleString() + " KP를 베팅할까요? (킥오프 전까지 취소 가능)")) return;
      var bch = my.getAttribute("data-betch");
      KickComments.placeBet(bsl._betFx, bch, amt).then(function () { bsl._betReload(); if (KickComments.predVote) KickComments.predVote(bsl._betFx, bch); var psl = document.querySelector(".pred-slot"); if (psl && psl._predReload) psl._predReload(); }).catch(function (err) { alert("베팅 실패: " + ((err && err.message) || "다시 시도해주세요")); });
      return;
    }
    if ((my = e.target.closest("[data-scat]"))) { scoreCat = my.getAttribute("data-scat"); renderScorers(); return; }
    if ((my = e.target.closest(".rank-sb"))) { rankSort = my.getAttribute("data-rsort"); rankLimit = 30; paintRanking(); return; }
    if ((my = e.target.closest(".rank-pb"))) { rankPos = my.getAttribute("data-rpos"); rankLimit = 30; paintRanking(); return; }
    if (e.target.closest(".rank-more")) { rankLimit += 30; paintRanking(); return; }
    if ((my = e.target.closest(".bd-cat"))) { boardCat = my.getAttribute("data-bcat"); renderBoard(); return; }
    if (e.target.closest(".pf-wbody.locked")) { if (window.KickComments) KickComments.promptLogin(); return; }
    if ((my = e.target.closest(".pf-like, .pf-dislike"))) {
      if (!window.KickComments || !KickComments.user()) { if (window.KickComments) KickComments.promptLogin(); return; }
      var ritem = my.closest(".pf-item"); if (!ritem) return;
      var rpid = ritem.getAttribute("data-pid"), rval = parseInt(my.getAttribute("data-rv"), 10);
      var rcur = (boardCache && boardCache.mine && boardCache.mine[rpid]) || 0;
      my.disabled = true;
      KickComments.togglePostReaction(rpid, rval, rcur).then(function () { renderBoard(); }).catch(function () { my.disabled = false; });
      return;
    }
    if ((my = e.target.closest(".pf-s"))) { boardSort = my.getAttribute("data-bsort"); paintBoard(); return; }
    if ((my = e.target.closest(".pf-submit"))) {
      if (!window.KickComments || !KickComments.user()) { if (window.KickComments) KickComments.promptLogin(); return; }
      var pfcat = viewEl.querySelector(".pf-wcat") ? viewEl.querySelector(".pf-wcat").value : "자유";
      var pfta = viewEl.querySelector(".pf-wbody"), pfbody = pfta ? pfta.value.trim() : "";
      if (!pfbody) { alert("내용을 입력해주세요."); return; }
      var pfpin = viewEl.querySelector(".pf-wpinned") ? viewEl.querySelector(".pf-wpinned").checked : false;
      my.disabled = true;
      KickComments.createPost(pfcat, pfbody, pfpin).then(function (r) {
        if (r && r.error) { var em = String(r.error.message || ""); alert(/banned/.test(em) ? "이용이 제한된 계정입니다." : /rate_limit/.test(em) ? "너무 빠르게 작성하고 있어요. 잠시 후 다시." : /has_link/.test(em) ? "링크는 작성할 수 없어요." : /blocked_word/.test(em) ? "부적절한 내용이 포함되어 등록할 수 없어요." : /row-level|policy/.test(em) ? "권한이 없어요 (공지는 관리자만)." : "등록 실패: " + em); my.disabled = false; return; }
        renderBoard();
      }).catch(function () { my.disabled = false; alert("등록 실패"); });
      return;
    }
    if ((my = e.target.closest(".pf-del"))) {
      if (!confirm("이 글을 삭제할까요?")) return;
      var ditem = my.closest(".pf-item"); if (!ditem) return;
      my.disabled = true;
      KickComments.deletePost(ditem.getAttribute("data-pid")).then(function () { renderBoard(); });
      return;
    }
    if ((my = e.target.closest(".pf-edit"))) {
      var eitem = my.closest(".pf-item"); if (!eitem) return;
      var epost = (boardCache && boardCache.posts || []).filter(function (p) { return p.id === eitem.getAttribute("data-pid"); })[0];
      var ec = eitem.querySelector(".pf-content");
      if (epost && ec) ec.innerHTML = '<textarea class="pf-ebody" maxlength="2000">' + esc(epost.body) + '</textarea><div class="pf-eact"><button class="pf-save">저장</button><button class="pf-cancel">취소</button></div>';
      return;
    }
    if (e.target.closest(".pf-cancel")) { paintBoard(); return; }
    if ((my = e.target.closest(".pf-save"))) {
      var sitem = my.closest(".pf-item"); if (!sitem) return;
      var spost = (boardCache && boardCache.posts || []).filter(function (p) { return p.id === sitem.getAttribute("data-pid"); })[0];
      var sta = sitem.querySelector(".pf-ebody"), snb = sta ? sta.value.trim() : "";
      if (!snb) { alert("내용을 입력해주세요."); return; }
      my.disabled = true;
      KickComments.updatePost(sitem.getAttribute("data-pid"), spost ? spost.category : "자유", snb, spost ? spost.pinned : false).then(function () { renderBoard(); });
      return;
    }
    if ((ad = e.target.closest(".mb-clk"))) { var _auid = ad.getAttribute("data-auid"); if (_auid) go("#adminuser/" + _auid); return; }  // 회원 클릭 → 상세 페이지
    if (e.target.closest(".usr-back")) { go("admin"); return; }  // 상세→회원목록
    if ((ad = e.target.closest(".mb-sort"))) { _adminScrollY = window.scrollY; memberSort = ad.getAttribute("data-msort"); paintAdmin(); return; }
    if ((ad = e.target.closest("[data-adtab]"))) { _adminScrollY = window.scrollY; adminTab = ad.getAttribute("data-adtab"); paintAdmin(); return; }  // 탭 전환도 그 자리 유지(맨위로 안 감)
    if ((ad = e.target.closest(".mgr-go"))) { go(ad.getAttribute("data-go")); return; }
    if ((ad = e.target.closest("[data-chatdel]"))) {
      if (!confirm("이 채팅을 삭제할까요?")) return;
      ad.disabled = true; KickComments.chatDelete(ad.getAttribute("data-chatdel")).then(function (ok) { if (ok) loadAdminChat(); else { ad.disabled = false; alert("삭제 실패"); } }); return;
    }
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
      KickComments.setNickname(v).then(function () { renderMy(); }).catch(function (er) { my.disabled = false; var em = String(er && er.message || ""); alert(/chars/.test(em) ? "닉네임은 한글·영문·숫자만 쓸 수 있어요 (특수문자 불가)." : /len/.test(em) ? "닉네임은 2~16자로 해주세요." : /badword/.test(em) ? "사용할 수 없는 단어가 포함돼 있어요." : "닉네임 저장 실패"); });
      return;
    }
    if ((my = e.target.closest(".my-tabbtn"))) { myTab = my.getAttribute("data-mytab"); paintMy(); return; }
    if ((my = e.target.closest(".my-item[data-go], .bh-row[data-go]"))) { go(my.getAttribute("data-go")); return; }
    var dc = e.target.closest("[data-date]");
    if (dc) { selectedDate = dc.getAttribute("data-date"); renderSchedule(); return; }
    var rc = e.target.closest(".rchip");
    if (rc) { searchEl.value = rc.getAttribute("data-q"); renderSearchResults(rc.getAttribute("data-q").toLowerCase()); return; }
    var gb = e.target.closest("[data-grade]");
    if (gb) { renderGradeList(gb.getAttribute("data-grade")); return; }
    var ex = e.target.closest("[data-expand]");
    if (ex) { var elist = ex.parentNode.querySelector(".news-list"); if (elist) elist.classList.remove("news-collapsed"); ex.style.display = "none"; return; }
    var sbtn = e.target.closest(".save-btn");
    if (sbtn) {
      if (sbtn._sbusy) return; sbtn._sbusy = true; setTimeout(function () { sbtn._sbusy = false; }, 350);  // 연타 방지
      var saved = saveToggle(sbtn.getAttribute("data-save"));
      sbtn.classList.toggle("on", saved);
      if (saved) { sbtn.classList.remove("pop"); void sbtn.offsetWidth; sbtn.classList.add("pop"); }  // 저장 시 팝 애니메이션
      return;
    }
    var mvb = e.target.closest("[data-mvp-pid]");
    if (mvb) { if (!KickComments.user || !KickComments.user()) { KickComments.promptLogin(); return; } var mpid = mvb.getAttribute("data-mvp-pid"); (mrCtx.mvpMine === mpid ? KickComments.unvoteMvp(mrCtx.matchId) : KickComments.voteMvp(mrCtx.matchId, mpid)).then(refreshMatchRatings); return; }
    var shc = e.target.closest(".share-card");
    if (shc) { var shp = playersById[shc.getAttribute("data-share-card")]; if (shp) sharePlayerCard(shp); return; }
    var shm = e.target.closest("[data-share-match]");
    if (shm) { var shf = fixturesById[shm.getAttribute("data-share-match")]; if (shf) shareMatch(shf); return; }
    var rsh = e.target.closest("[data-result-share]");
    if (rsh) { var rsf = fixturesById[rsh.getAttribute("data-result-share")]; if (rsf) shareMatchResult(rsf); return; }
    var cgo = e.target.closest(".cmp-go"); if (cgo) { go("compare/" + cgo.getAttribute("data-cmp-go")); return; }
    var rgo = e.target.closest("[data-rate-go]"); if (rgo) { go("rate/" + rgo.getAttribute("data-rate-go")); return; }
    var cpk = e.target.closest("[data-cmp-pick]"); if (cpk) { go("compare/" + cmpA + "/" + cpk.getAttribute("data-cmp-pick")); return; }
    var cch = e.target.closest(".cmp-change"); if (cch) { go("compare/" + cch.getAttribute("data-cmp-change")); return; }
    var mt = e.target.closest("[data-match]");
    if (mt) { go("match/" + mt.getAttribute("data-match")); return; }
    var mg = e.target.closest("[data-manager]");
    if (mg) { go("manager/" + mg.getAttribute("data-manager")); return; }
    var rt = e.target.closest("[data-rate]");  // 종료경기 잔디 선수 탭 → 평점 시트
    if (rt) { openRateSheet(rt.getAttribute("data-rate"), rt.getAttribute("data-rmatch")); return; }
    var pl = e.target.closest("[data-player]");
    if (pl) { go("player/" + pl.getAttribute("data-player")); return; }
    var mvr = e.target.closest("[data-mvrank]");  // 몸값 카드 → 시장가치 순위 페이지
    if (mvr) { go("mvrank/" + (mvr.getAttribute("data-mvrank") || "")); return; }
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
      else if (nav === "search") { searchEl.focus(); go("search"); }  // iOS: 포커스는 탭 제스처 내에서 동기 호출해야 키보드+커서 함께 뜸(setTimeout이면 커서 안 감)
      else if (nav === "board") { go("board"); }
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
    if (window.history.length > 1) { window.history.back(); } else { go(""); }
  });

  document.getElementById("homeLink").addEventListener("click", function () {
    searchEl.value = ""; homeTab = "schedule";
    if (parseHash().name === "home") renderHome(); else go("");  // 홈의 다른 탭(조별/대진표/기록)에 있어도 일정으로 복귀
  });

  // ===== 테마(라이트/다크) 토글 — localStorage, 기본 다크 =====
  (function () {
    var KEY = "kt_theme";
    function apply(t) {
      document.documentElement.classList.toggle("light", t === "light");
      var mb = document.getElementById("themeBtn"); if (mb) mb.textContent = t === "light" ? "☀️" : "🌙";
      var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", t === "light" ? "#f3f5f8" : "#0b1220");
    }
    var cur = "light";
    // 저장된 선택 없으면 OS/브라우저 다크설정 따름 → 웨일/삼성 강제다크가 라이트앱을 뭉개는 것 방지(이미 다크면 force-dark 안 함)
    try { cur = localStorage.getItem(KEY) || ((window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"); } catch (e) {}
    apply(cur);
    var btn = document.getElementById("themeBtn");
    if (btn) btn.addEventListener("click", function () {
      cur = document.documentElement.classList.contains("light") ? "dark" : "light";
      try { localStorage.setItem(KEY, cur); } catch (e) {}
      apply(cur);
    });
  })();

  // ===== 모달 뒤로가기 닫기 (응원하기·채팅) — 열 때 history state push, 뒤로가기면 페이지 대신 모달 닫기 =====
  var ktModalClose = null;
  function ktModalOpen(closeFn) { ktModalClose = closeFn; try { history.pushState({ ktModal: 1 }, ""); } catch (e) {} }
  window.addEventListener("popstate", function () { if (ktModalClose) { var f = ktModalClose; ktModalClose = null; f(); return; } _isPop = true; });  // 모달 아닌 실제 뒤로가기 → 스크롤 복원

  // ===== 후원(응원하기) =====
  (function () {
    var btn = document.getElementById("donateBtn"); if (!btn) return;
    if (IS_TOSS) {  // 토스 미니앱: 외부 송금링크 금지 → 토스페이 인앱결제(IAP). 금액별 sku는 콘솔 등록, .ait 빌드의 main.ts가 window.tossPay.donate 제공
      if (!window.__TOSS_IAP__) { btn.style.display = "none"; return; }  // 인앱결제(사업자·sku) 준비 전엔 후원 숨김 → 앱 먼저 출시 가능. main.ts에서 켜면 노출
      var TT = [["⚽ 골", 3900], ["🎩 해트트릭", 6900], ["🏆 발롱도르", 9900], ["🐐 GOAT", 19900]];
      btn.addEventListener("click", function () {
        var ov = document.createElement("div"); ov.className = "donate-ov on";
        var tiers = TT.map(function (t) { return '<button class="ds-tier" data-amt="' + t[1] + '"><span>' + t[0] + "</span><b>" + t[1].toLocaleString() + "원</b></button>"; }).join("");
        ov.innerHTML = '<div class="donate-sheet"><button class="ds-x" aria-label="닫기">✕</button><div class="ds-title">⚽ 개발자에게 한 골!</div><div class="ds-sub">여러분의 응원이 킥톡을 계속 뛰게 합니다 🙌</div>' + tiers + '<div class="ds-status"></div><div class="ds-note muted-note">토스페이로 안전하게 후원돼요 💙</div></div>';
        document.body.appendChild(ov); twem(ov);
        ov.addEventListener("click", function (e) {
          if (e.target === ov || e.target.closest(".ds-x")) { ov.remove(); return; }
          var tb = e.target.closest(".ds-tier"); if (!tb) return;
          var amt = +tb.getAttribute("data-amt");
          if (window.tossPay && window.tossPay.donate) { window.tossPay.donate(amt); ov.remove(); }
          else { var st = ov.querySelector(".ds-status"); if (st) st.textContent = "토스 앱에서 후원할 수 있어요."; }
        });
      });
      return;
    }
    var ACCT = "100004130027", BANK = "토스뱅크";
    var KAKAO_3900 = "https://qr.kakaopay.com/28100601119492440100760579e06997";  // 3,900원 카카오페이 송금 QR(고정금액)
    var TIERS = [["⚽ 골", 3900], ["🎩 해트트릭", 6900], ["🏆 발롱도르", 9900], ["🐐 GOAT", 19900]];
    function tossLink(amt) { return "supertoss://send?amount=" + amt + "&bank=%ED%86%A0%EC%8A%A4%EB%B1%85%ED%81%AC&accountNo=" + ACCT + "&origin=qr"; }
    var ov = null;
    function close() { if (ov) ov.classList.remove("on"); }
    function acctFallbackHtml() { return '<div class="ds-fall">토스·카카오 앱이 없으신가요? 😅 계좌로 후원해주세요<br><b>' + BANK + " " + ACCT + '</b> <button class="ds-copy" data-acct="' + ACCT + '">복사</button></div>'; }
    var tossBusy = false;
    function tryToss(amt) {
      if (tossBusy) return; tossBusy = true; setTimeout(function () { tossBusy = false; }, 1800);
      var st = ov && ov.querySelector(".ds-status");
      if (st) st.innerHTML = '<div class="ds-loading"><span class="ds-spin"></span>토스 앱 여는 중…</div>';
      var start = Date.now();
      window.location.href = tossLink(amt);
      setTimeout(function () {
        if (!st) return;
        if (!document.hidden && (Date.now() - start) < 2500) {   // 토스 미설치
          if (amt === 3900) {  // 클릭 유도 없이 카카오페이 자동 실행 → 그것도 안 되면 계좌
            st.innerHTML = '<div class="ds-loading"><span class="ds-spin"></span>카카오페이 여는 중…</div>';
            window.location.href = KAKAO_3900;
            setTimeout(function () { if (st && !document.hidden) { st.innerHTML = acctFallbackHtml(); twem(st); } }, 1600);  // 카카오도 미설치(페이지에 그대로) → 계좌 안내
          } else {
            st.innerHTML = acctFallbackHtml(); twem(st);
          }
        } else { st.innerHTML = ""; }   // 토스 열림 → 로딩 제거
      }, 1400);
    }
    function open() {
      if (!ov) {
        ov = document.createElement("div"); ov.className = "donate-ov";
        var tiers = TIERS.map(function (t) { return '<button class="ds-tier" data-amt="' + t[1] + '"><span>' + t[0] + "</span><b>" + t[1].toLocaleString() + "원</b></button>"; }).join("");
        ov.innerHTML = '<div class="donate-sheet"><button class="ds-x" aria-label="닫기">✕</button>' +
          '<div class="ds-title">⚽ 개발자에게 한 골!</div>' +
          '<div class="ds-sub">여러분의 응원이 킥톡을 계속 뛰게 합니다 🙌</div>' + tiers +
          '<div class="ds-status"></div>' +
          '<div class="ds-note muted-note">금액을 누르면 토스 송금창이 열려요. 보내주신 마음은 서버비·개선에 쓰입니다 💙</div></div>';
        document.body.appendChild(ov);
        ov.addEventListener("click", function (e) {
          if (e.target === ov || e.target.closest(".ds-x")) { if (ktModalClose) history.back(); else close(); return; }
          var cp = e.target.closest(".ds-copy");
          if (cp) { try { navigator.clipboard.writeText(cp.getAttribute("data-acct")); cp.textContent = "복사됨!"; setTimeout(function () { cp.textContent = "복사"; }, 1500); } catch (e2) {} return; }
          var tr = e.target.closest(".ds-tier");
          if (tr) { tryToss(+tr.getAttribute("data-amt")); return; }
        });
      }
      var st0 = ov.querySelector(".ds-status"); if (st0) st0.innerHTML = "";   // 열 때마다 초기화(계좌 숨김)
      ov.classList.add("on"); twem(ov); ktModalOpen(close);
    }
    btn.addEventListener("click", open);
  })();

  window.addEventListener("hashchange", function (e) {
    try { var oh = (e.oldURL && e.oldURL.indexOf("#") >= 0) ? e.oldURL.slice(e.oldURL.indexOf("#")) : "#"; _scrollMem[oh] = window.scrollY; } catch (_) {}  // 떠나는 화면 스크롤 저장
    route();
  });

  // 동적 영역이 다시 그려질 때마다 이모지→이미지 변환(국기 포함)
  if (window.MutationObserver) {
    new MutationObserver(function () { twem(viewEl); }).observe(viewEl, { childList: true });
  }

  // ===== PWA 홈 화면 설치 배너 — 안드로이드 원터치(beforeinstallprompt) / 아이폰 1초 그림 안내. ✕=이번만, "다시 보지 않기"=영구 =====
  (function () {
    if (location.protocol.indexOf("http") !== 0 || IS_TOSS) return;  // 토스 미니앱 안에선 설치배너 불필요
    var deferred = null, shown = false;
    function isStandalone() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; }
    function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
    function isSamsung() { return /SamsungBrowser/i.test(navigator.userAgent); }
    function isAndroid() { return /android/i.test(navigator.userAgent); }
    function flag(s) { try { return localStorage.getItem("kk_install_never") === "1" || sessionStorage.getItem("kk_install_closed") === "1"; } catch (e) { return false; } }
    function hide(bn) { bn.classList.remove("on"); setTimeout(function () { if (bn.parentNode) bn.parentNode.removeChild(bn); }, 250); }
    function show() {
      if (shown || isStandalone() || flag() || document.getElementById("kk-install")) return;
      if (!deferred && !isIOS() && !isAndroid()) return;  // 모바일(설치 가능 환경)에서만. 안드로이드는 프롬프트 or 메뉴안내 폴백
      shown = true;
      var bn = document.createElement("div"); bn.className = "kk-install"; bn.id = "kk-install";
      bn.innerHTML = '<img class="kki-ic" src="apple-touch-icon.png" alt="킥톡">' +
        '<div class="kki-tx"><b>킥톡 앱으로 추가</b><span>홈 화면에서 바로 실행 · 주소창 없이</span><a class="kki-never">다시 보지 않기</a></div>' +
        '<button class="kki-btn">설치</button><button class="kki-x" aria-label="닫기">✕</button>';
      document.body.appendChild(bn);
      requestAnimationFrame(function () { bn.classList.add("on"); });
      bn.querySelector(".kki-x").addEventListener("click", function () { try { sessionStorage.setItem("kk_install_closed", "1"); } catch (e) {} hide(bn); });
      bn.querySelector(".kki-never").addEventListener("click", function () { try { localStorage.setItem("kk_install_never", "1"); } catch (e) {} hide(bn); });
      bn.querySelector(".kki-btn").addEventListener("click", function () {
        if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; hide(bn); }); }  // 크롬 등 원터치
        else if (isIOS()) { iosGuide(); }
        else { menuGuide(); }  // 삼성인터넷 등 프롬프트 미지원 브라우저
      });
    }
    function sheet(html) {
      var ov = document.createElement("div"); ov.className = "kk-ios"; ov.id = "kk-ios";
      ov.innerHTML = '<div class="kk-ios-card"><img class="kki-ic" src="apple-touch-icon.png" alt="">' + html + '<button class="kki-ios-close">알겠어요</button></div>';
      document.body.appendChild(ov);
      function cl() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.addEventListener("click", function (e) { if (e.target === ov) cl(); });
      ov.querySelector(".kki-ios-close").addEventListener("click", cl);
      twem(ov);
    }
    function iosGuide() {
      if (document.getElementById("kk-ios")) return;
      sheet('<b>홈 화면에 추가하기</b><div class="kki-step"><span class="kki-sn">1</span><span>아래 <b>공유 ⬆️</b> 버튼 누르기</span></div><div class="kki-step"><span class="kki-sn">2</span><span><b>홈 화면에 추가 ➕</b> 선택</span></div>');
    }
    function menuGuide() {  // 삼성 인터넷·기타 안드로이드 브라우저 — 설치 프롬프트 미지원 시 메뉴 안내
      if (document.getElementById("kk-ios")) return;
      sheet('<b>홈 화면에 추가하기</b><div class="kki-step"><span class="kki-sn">1</span><span>브라우저 메뉴 <b>(≡ 또는 ⋮)</b> 열기</span></div><div class="kki-step"><span class="kki-sn">2</span><span><b>현재 페이지를 홈 화면에 추가</b> 선택</span></div>');
    }
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; show(); });
    // iOS·삼성 등은 프롬프트 없거나 늦으니 로드 후 폴백으로 배너 노출(프롬프트 오면 위에서 먼저 뜸)
    if (isIOS() || isAndroid()) window.addEventListener("load", function () { setTimeout(show, 2800); });
  })();

  // 서비스워커 (PWA, http(s)에서만) — 새 버전 배포 시 자동 새로고침(캐시된 옛 화면 방지)
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        var pendingReload = false;
        function reloadSafe() {  // 입력 중이면 방해 않고 보류 → 입력 끝/탭 복귀 때 적용
          var ae = document.activeElement;
          if (ae && /INPUT|TEXTAREA/.test(ae.tagName)) { pendingReload = true; return; }
          location.reload();
        }
        try { reg.update(); } catch (e) {}
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener("statechange", function () {
            // 새 SW 설치완료 + 기존 컨트롤러 있음(=업데이트) → 새 코드/CSS로 자동 리로드
            if (nw.state === "installed" && navigator.serviceWorker.controller) reloadSafe();
          });
        });
        // ★열려있는 세션도 새 배포 자동 반영 — 부하 최소화: '탭 복귀 시'가 주(主), 화면 켜둔 채 안 떠나는 경우만 백업으로 15분 간격(숨김 상태선 체크 안 함)
        var lastUpd = 0;
        function checkUpd() { var now = +new Date(); if (now - lastUpd < 60000) return; lastUpd = now; try { reg.update(); } catch (e) {} }
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState !== "visible") return;
          if (pendingReload) { location.reload(); return; }
          checkUpd();
        });
        setInterval(function () { if (document.visibilityState === "visible") checkUpd(); }, 900000);  // 15분 백업(보이는 동안만)
      }).catch(function () {});
    });
  }

  restoreLiveCache();   // ★route 전에 캐시된 라이브 상태 복원 → 첫 렌더부터(재방문 사용자) 라이브카드 보이게
  route();
  twem(document.body); // 상단바·탭바·초기 화면의 이모지 변환
  bootLiveState();      // 신규 사용자: DB 공유캐시에서 라이브 상태 즉시 fetch(SDK 대기 X)
  fetchLive();          // 라이브 경기 폴링 시작(ESPN 공개 API, 경기중 60초/임박 3분) — 곧 최신값으로 갱신
  loadStoredResults();  // 저장된 종료경기 결과 병합(ESPN이 내려도 카드에 결과 유지)
  // 모바일은 백그라운드에서 타이머가 멈춤 → 앱으로 돌아오는 즉시 점수 재요청 + 화면 즉시 재렌더(스테일 방지)
  function onAppReturn() {
    if (!window.fetch) return;
    fetchLive();  // 최신 점수 비동기 요청(도착 시 자동 재렌더)
    if (onHomeSchedule()) renderSchedule();          // 홈이면 현재 점수로 즉시 재렌더
    else if (window._matchLiveTick) window._matchLiveTick();  // 경기페이지면 점수 즉시 갱신
    if (window._teamLiveTick) window._teamLiveTick(); if (window._teamSchedRefresh) window._teamSchedRefresh();  // 나라상세 라이브 배너
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") onAppReturn(); });
  window.addEventListener("focus", onAppReturn);

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

  // ===== 실시간 채팅(플로팅 버튼 + 오버레이, Supabase Realtime) =====
  (function initChat() {
    if (!window.KickComments || !KickComments.configured || !KickComments.configured()) return;
    var fab = document.createElement("button"); fab.className = "chat-fab"; fab.type = "button"; fab.innerHTML = "💬"; fab.setAttribute("aria-label", "실시간 채팅");
    var panel = document.createElement("div"); panel.className = "chat-panel"; panel.hidden = true;
    panel.innerHTML = '<div class="chat-head"><span>💬 실시간 채팅</span><button class="chat-close" type="button">✕</button></div>' +
      '<div class="chat-msgs"></div>' +
      '<div class="chat-inbar"><input class="chat-in" maxlength="300" placeholder="메시지 입력…"><button class="chat-send" type="button">전송</button></div>';
    document.body.appendChild(panel); document.body.appendChild(fab); twem(fab);
    var ch = null, open = false, pollT = null, lastSig = "";
    function msgsEl() { return panel.querySelector(".chat-msgs"); }
    function ncolor(name) { var cols = ["#5b9dff", "#e5748a", "#5bbf8a", "#f0a93b", "#b18cff", "#46c2d6", "#e0739e"], h = 0, i; for (i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return cols[h % cols.length]; }
    function chatTime(iso) {
      if (!iso) return ""; var d = new Date(iso); if (isNaN(d.getTime())) return "";
      var hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2), n = new Date();
      var today = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
      return (today ? "" : (d.getMonth() + 1) + "." + d.getDate() + " ") + hh + ":" + mm;
    }
    function bubble(m) {
      var nm = (window.KickComments && KickComments.dispName) ? KickComments.dispName(m.name, m.user_id) : (m.name || "익명");
      var col = ncolor(m.name), ch0 = (nm || "?").trim().charAt(0).toUpperCase() || "?";
      var tierH = "";
      if (m._pts != null && window.KickComments && KickComments.tierOf) {
        var tr = KickComments.tierOf(m._pts), kp = KickComments.fmtKP ? KickComments.fmtKP(m._pts) : m._pts;
        var tInfo = "포인트 등급 — 보유 포인트(KP)로 결정돼요. 댓글·출석·베팅 적중으로 모아요. (대기중 베팅 포함)";
        tierH = '<span class="chat-tier badge-info" data-binfo="' + tInfo + '" title="' + tInfo + '" style="color:' + tr.c + ';border-color:' + tr.c + '">' + esc(tr.name) + " " + esc(kp) + "</span> ";
      }
      var titH = (m._title && KickComments.titleBadge) ? KickComments.titleBadge(m._title) : "";  // 칭호(꾸미기)
      var medH = (m._streak && KickComments.streakBadge) ? KickComments.streakBadge(m._streak) : "";  // 연속적중 훈장
      return '<div class="yc-row"><span class="yc-av" style="background:' + col + '">' + esc(ch0) + "</span>" +
        '<span class="yc-body">' + titH + '<span class="yc-name" style="color:' + col + '">' + esc(nm) + "</span> " + tierH + medH +
        '<span class="yc-time">' + esc(chatTime(m.created_at)) + "</span> " +
        '<span class="yc-msg">' + esc(m.body) + "</span></span></div>";
    }
    function loadRender(forceBottom) {
      var m = msgsEl(); if (!m) return;
      var atBottom = forceBottom || (m.scrollHeight - m.scrollTop - m.clientHeight < 70);
      KickComments.chatRecent(100).then(function (list) {
        if (!open) return;
        var sig = list.map(function (x) { return x.id; }).join(",");
        if (sig === lastSig && !forceBottom) return;  // 변동 없으면 재렌더 생략
        lastSig = sig;
        m.innerHTML = list.length ? list.map(bubble).join("") : '<div class="chat-empty">아직 메시지가 없어요.<br>첫 메시지를 남겨보세요!</div>';
        twem(m);
        if (atBottom) m.scrollTop = m.scrollHeight;
      }).catch(function () {});
    }
    function toggle() {
      open = !open; panel.hidden = !open; fab.classList.toggle("open", open); fab.innerHTML = open ? "✕" : "💬"; twem(fab);
      if (open) {
        lastSig = ""; msgsEl().innerHTML = '<div class="chat-empty">불러오는 중…</div>';
        KickComments.ready().then(function () { loadRender(true); });
        ch = KickComments.chatSubscribe(function () { loadRender(false); });  // 실시간 신호 → 최신 재조회
        pollT = setInterval(function () { loadRender(false); }, 6000);        // 백업 폴링(실시간 누락 방지)
      } else {
        if (ch) { KickComments.chatUnsubscribe(ch); ch = null; }
        if (pollT) { clearInterval(pollT); pollT = null; }
      }
    }
    function send() {
      var inp = panel.querySelector(".chat-in"); var v = (inp.value || "").trim(); if (!v) return;
      inp.disabled = true;
      KickComments.chatSend(v).then(function (r) {
        inp.disabled = false;
        if (r && r.error) { var em = String(r.error.message || ""); alert(/banned/.test(em) ? "이용이 제한된 계정입니다." : /rate_limit/.test(em) ? "너무 빠르게 보내고 있어요. 잠시 후." : /has_link/.test(em) ? "링크는 보낼 수 없어요." : /blocked_word/.test(em) ? "부적절한 내용이에요." : "전송 실패"); return; }
        inp.value = ""; inp.focus();
      }).catch(function () { inp.disabled = false; alert("전송 실패"); });
    }
    fab.addEventListener("click", function () { if (open) { if (ktModalClose) history.back(); else toggle(); } else { toggle(); ktModalOpen(function () { if (open) toggle(); }); } });
    // 채팅 열려있을 때 바깥(패널·버블 외부) 누르면 닫기
    document.addEventListener("pointerdown", function (e) { if (open && !panel.contains(e.target) && !fab.contains(e.target)) { if (ktModalClose) history.back(); else toggle(); } });
    panel.querySelector(".chat-close").addEventListener("click", function () { if (ktModalClose) history.back(); else toggle(); });
    panel.querySelector(".chat-send").addEventListener("click", send);
    panel.querySelector(".chat-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); send(); } });
  })();

  // 토스트 + 일일 출석 +200 KP
  function ktToast(msg) {
    var t = document.createElement("div"); t.className = "kt-toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 3500);
  }
  // 배지(등급·칭호·훈장) 탭하면 설명 토스트(모바일). 데스크톱은 title 호버로도 표시.
  // 연타 방지 = 쓰로틀(throttle): 한 번 뜨면 2.5초간 재실행 차단.
  var _binfoCool = 0;
  document.addEventListener("click", function (e) {
    var bi = e.target.closest("[data-binfo]");
    if (!bi) return;
    e.stopPropagation(); e.preventDefault();
    var now = Date.now(); if (now < _binfoCool) return; _binfoCool = now + 2500;
    ktToast(bi.getAttribute("data-binfo"));
  }, true);
  // 출석은 MY 탭의 '출석 체크' 버튼으로 직접(자동지급 X)
})();
