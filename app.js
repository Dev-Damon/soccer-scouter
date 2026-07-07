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
  // 일본 선수: 한국식 표기는 '성 이름' 순(예: 스즈키 자이온) → 성=첫 단어. 전체 4글자 이하면 풀네임(예: 도안 리츠).
  function _isJp(pid) { var p = pid && playersById[pid]; return !!(p && p.team === "일본"); }
  function _jpName(name) { var full = String(name || ""); return full.replace(/\s/g, "").length <= 4 ? full : full.split(" ")[0]; }
  function pitchSurname(name, pid) { if (pid && PITCH_OVERRIDE[pid]) return PITCH_OVERRIDE[pid]; if (_isJp(pid)) return _jpName(name); return String(name || "").split(" ").slice(-1)[0]; }
  function pitchName(name, pid) { if (pid && PITCH_OVERRIDE[pid]) return PITCH_OVERRIDE[pid]; if (_isJp(pid)) return _jpName(name); return (pid && _surnameDup[pid]) ? (name || "") : String(name || "").split(" ").slice(-1)[0]; }
  function pitchNameHtml(name, pid) { var nm = pitchName(name, pid); if ((pid && PITCH_OVERRIDE[pid]) || _isJp(pid)) return esc(nm); return nm.split(" ").map(esc).join("<br>"); }  // 풀네임이면 단어마다 줄바꿈(오버라이드명·일본선수는 한 줄)
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

  // ===== 스포일러 방지 모드 — 켜지면 경기결과(스코어·순위·득점왕·대진승자·폼·라이브 등) 전부 숨김. 하이라이트 링크는 유지. 기본 ON. =====
  var SPOILER_ON = true;
  try { SPOILER_ON = (localStorage.getItem("kt_spoiler") || "1") === "1"; } catch (e) {}
  function spoiler() { return SPOILER_ON; }  // true면 결과 숨김
  // 스포일러 모드에선 LIVE(스코어·상태·승자·골) 데이터를 렌더에 노출하지 않음(결과 원천 차단)
  function lvOf(id) { return SPOILER_ON ? null : LIVE[id]; }

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
  // 2026 월드컵 16개 경기장 정보(고정) — 경기상세 경기장명 클릭 시 표시. 출처: Wikimedia Commons(사진 CC 라이선스, 위키피디아 수용인원=월드컵 기준).
  var VENUE_INFO = {
    "Estadio Azteca": { nameKo: "에스타디오 아스테카", city: "멕시코시티", country: "멕시코", capacity: 80824, opened: 1966, roof: "야외", grass: "하이브리드 천연잔디", note: "1970·1986·2026 월드컵 개최, 역대 3회 본선을 치르는 유일한 경기장", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Vista_a%C3%A9rea_del_Estadio_Azteca_-_2026_-_02.jpg/1280px-Vista_a%C3%A9rea_del_Estadio_Azteca_-_2026_-_02.jpg", imgCredit: "Wikimedia Commons / ProtoplasmaKid, CC BY 4.0" },
    "Estadio Akron": { nameKo: "에스타디오 아크론", city: "과달라하라", country: "멕시코", capacity: 45664, opened: 2010, roof: "야외", grass: "천연잔디", note: "멕시코 명문 클럽 과달라하라(치바스)의 홈구장, 화산 분화구를 닮은 디자인", img: "https://upload.wikimedia.org/wikipedia/commons/1/10/Estadio_Akron_02-07-2022_cabecera_sur_lado_derecho_%283%29.jpg", imgCredit: "Wikimedia Commons / Alejan98, CC0 1.0" },
    "Mercedes-Benz Stadium": { nameKo: "메르세데스-벤츠 스타디움", city: "애틀랜타", country: "미국", capacity: 68239, opened: 2017, roof: "개폐식", grass: "임시 천연잔디", note: "여덟 개의 삼각 패널이 풍차처럼 열리는 독특한 개폐식 지붕으로 유명하다", img: "https://upload.wikimedia.org/wikipedia/commons/2/29/Mercedes-Benz_Stadium%2C_July_2018.jpg", imgCredit: "Wikimedia Commons / Thomson200, CC0 1.0" },
    "Estadio BBVA": { nameKo: "에스타디오 BBVA", city: "몬테레이", country: "멕시코", capacity: 51243, opened: 2015, roof: "야외", grass: "하이브리드 천연잔디", note: "철골 외피로 '강철 거인'이라 불리며, 세로 산맥을 배경으로 한 절경의 구장", img: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Estadio_BBVA_Bancomer_%281%29.jpg", imgCredit: "Wikimedia Commons / Presidencia de la República Mexicana, CC BY 2.0" },
    "BMO Field": { nameKo: "BMO 필드", city: "토론토", country: "캐나다", capacity: 43036, opened: 2007, roof: "야외", grass: "하이브리드 천연잔디", note: "월드컵을 위해 평소 약 2.8만석에서 4만석 이상으로 임시 증축된 토론토 FC의 홈구장", img: "https://upload.wikimedia.org/wikipedia/commons/9/91/Toronto_BMO_Field_in_2024.jpg", imgCredit: "Wikimedia Commons / H4stings, CC BY-SA 4.0" },
    "Levi's Stadium": { nameKo: "리바이스 스타디움", city: "샌타클래라", country: "미국", capacity: 68827, opened: 2014, roof: "야외", grass: "천연잔디", note: "NFL 샌프란시스코 포티나이너스의 홈구장으로 슈퍼볼 50회를 개최한 친환경 경기장", img: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Levi%27s_Stadium_in_February_2016_prior_to_Super_Bowl_50_%2824398261729%29.jpg", imgCredit: "Wikimedia Commons / Glenn Fawcett, Public Domain" },
    "SoFi Stadium": { nameKo: "소파이 스타디움", city: "잉글우드", country: "미국", capacity: 70492, opened: 2020, roof: "돔", grass: "임시 천연잔디", note: "약 50억 달러로 지어진 세계에서 가장 비싼 경기장 중 하나로, NFL 두 팀(램스·차저스)이 함께 쓴다", img: "https://upload.wikimedia.org/wikipedia/commons/b/b3/SoFi_Stadium_2023.jpg", imgCredit: "Wikimedia Commons / Troutfarm27, CC BY-SA 4.0" },
    "BC Place": { nameKo: "BC 플레이스", city: "밴쿠버", country: "캐나다", capacity: 52497, opened: 1983, roof: "개폐식", grass: "임시 천연잔디", note: "2010 밴쿠버 동계올림픽 개·폐막식이 열린 곳으로, 2011년 세계 최대급 개폐식 지붕으로 개조됐다", img: "https://upload.wikimedia.org/wikipedia/commons/f/ff/BC_Place_2015_Women%27s_FIFA_World_Cup.jpg", imgCredit: "Wikimedia Commons / GoToVan, CC BY 2.0" },
    "Lumen Field": { nameKo: "루멘 필드", city: "시애틀", country: "미국", capacity: 66925, opened: 2002, roof: "야외", grass: "임시 천연잔디", note: "관중 함성이 지진계에 잡힐 정도로 시끄러워 북미에서 손꼽히는 '홈 어드밴티지' 경기장으로 유명하다", img: "https://upload.wikimedia.org/wikipedia/commons/c/c8/2026_FIFA_World_Cup_-_Belgium_v._Egypt_in_Seattle_-_04.jpg", imgCredit: "Wikimedia Commons / SounderBruce, CC BY-SA 4.0" },
    "MetLife Stadium": { nameKo: "메트라이프 스타디움", city: "이스트러더퍼드", country: "미국", capacity: 80663, opened: 2010, roof: "야외", grass: "임시 천연잔디", note: "2026 월드컵 결승전이 열리는 무대로, 평소엔 NFL 뉴욕 자이언츠와 제츠가 함께 쓴다", img: "https://upload.wikimedia.org/wikipedia/commons/0/04/Metlife_stadium_%28Aerial_view%29.jpg", imgCredit: "Wikimedia Commons / Anthony Quintano, CC BY 2.0" },
    "Gillette Stadium": { nameKo: "질레트 스타디움", city: "폭스버러", country: "미국", capacity: 64146, opened: 2002, roof: "야외", grass: "임시 천연잔디", note: "NFL 명문 뉴잉글랜드 패트리어츠의 홈구장으로, 보스턴 인근에 있다", img: "https://upload.wikimedia.org/wikipedia/commons/d/db/Gillette_Stadium_%28Top_View%29.jpg", imgCredit: "Wikimedia Commons / Art N., CC BY 2.0" },
    "Lincoln Financial Field": { nameKo: "링컨 파이낸셜 필드", city: "필라델피아", country: "미국", capacity: 68324, opened: 2003, roof: "야외", grass: "임시 천연잔디", note: "필라델피아 이글스의 홈구장으로, 개방된 코너 너머로 도심 스카이라인이 보인다", img: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Lincoln_Financial_Field_%28Aerial_view%29.jpg", imgCredit: "Wikimedia Commons / Ron Reiring, CC BY 2.0" },
    "Hard Rock Stadium": { nameKo: "하드록 스타디움", city: "마이애미가든스", country: "미국", capacity: 64478, opened: 1987, roof: "야외", grass: "임시 천연잔디", note: "2016년 좌석 위에 대형 캐노피를 씌워 뜨거운 마이애미 햇볕과 비를 막아준다", img: "https://upload.wikimedia.org/wikipedia/commons/c/ce/Hard_Rock_Stadium_for_Super_Bowl_LIV_%2849606710103%29.jpg", imgCredit: "Wikimedia Commons / elisfkc2, CC BY-SA 2.0" },
    "NRG Stadium": { nameKo: "NRG 스타디움", city: "휴스턴", country: "미국", capacity: 68777, opened: 2002, roof: "개폐식", grass: "임시 천연잔디", note: "NFL 최초의 개폐식 지붕 경기장으로, 지붕을 약 7분 만에 여닫을 수 있다", img: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Nrg_stadium.jpg", imgCredit: "Wikimedia Commons / Carlos.dkfi, CC0 1.0" },
    "Arrowhead Stadium": { nameKo: "애로헤드 스타디움", city: "캔자스시티", country: "미국", capacity: 69045, opened: 1972, roof: "야외", grass: "천연잔디", note: "야외 경기장 중 가장 시끄러운 관중 기록(142.2데시벨)을 가진 곳으로 기네스북에 올랐다", img: "https://upload.wikimedia.org/wikipedia/commons/a/ac/Aerial_view_of_Arrowhead_Stadium_08-31-2013.jpg", imgCredit: "Wikimedia Commons / Ichabod, CC BY-SA 3.0" },
    "AT&T Stadium": { nameKo: "AT&T 스타디움", city: "알링턴", country: "미국", capacity: 70649, opened: 2009, roof: "개폐식", grass: "임시 천연잔디", note: "농구 코트보다 큰 초대형 중앙 전광판으로 유명하며 구단주 이름을 따 '제리 월드'로 불린다", img: "https://upload.wikimedia.org/wikipedia/commons/1/11/Arlington_June_2020_4_%28AT%26T_Stadium%29.jpg", imgCredit: "Wikimedia Commons / Michael Barera, CC BY-SA 4.0" }
  };
  function venueModal(name) {
    var v = VENUE_INFO[name]; if (!v) return;
    var ov = document.createElement("div"); ov.className = "venue-pop-bg";
    function row(ic, lb, val) { return val ? '<div class="vp-row"><span>' + ic + " " + lb + '</span><b>' + esc(val) + "</b></div>" : ""; }
    ov.innerHTML = '<div class="venue-pop">' +
      (v.img ? '<div class="vp-img" style="background-image:url(\'' + esc(v.img) + '\')"></div>' : "") +
      '<div class="vp-body"><div class="vp-name">' + esc(v.nameKo || name) + "</div>" +
      '<div class="vp-sub">' + esc(name) + "</div>" +
      '<div class="vp-rows">' +
        row("📍", "위치", (v.city || "") + (v.country ? ", " + v.country : "")) +
        row("👥", "수용", v.capacity ? (v.capacity.toLocaleString() + "명") : "") +
        row("🏟️", "개장", v.opened) +
        row("🔝", "지붕", v.roof) +
        row("🌱", "잔디", v.grass) +
      "</div>" +
      (v.note ? '<div class="vp-note">💡 ' + esc(v.note) + "</div>" : "") +
      (v.imgCredit ? '<div class="vp-credit">사진: ' + esc(v.imgCredit) + "</div>" : "") +
      '<button class="vp-x">닫기</button></div></div>';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".vp-x")) { if (ktModalClose) history.back(); else close(); } });
    document.body.appendChild(ov);
    ktModalOpen(close);  // 뒤로가기 시 페이지 이동 대신 팝업이 닫히도록
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
  function shortDate(iso) { var m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso || ""); return m ? (+m[1]) + "." + (+m[2]) : (iso || ""); }  // 2026-06-28 → 6.28
  function shortTime(t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? (("0" + m[1]).slice(-2) + ":" + m[2]) : (t || ""); }  // 2:00 → 02:00, 8:30 → 08:30 (24시간 HH:MM)
  var SHORT_TEAM = { "south-africa": "남아공", "bosnia-and-herzegovina": "보스니아", "dr-congo": "콩고", "saudi-arabia": "사우디", "uzbekistan": "우즈벡", "ivory-coast": "코트디부" };  // 좁은 화면 일정용 약칭
  function shortTeamName(id, full) { return SHORT_TEAM[id] || full; }
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
  // 스크롤 복원: "보던 요소(앵커) 기준 상대 위치"로 복원 → cheer·라인업·뉴스 등 비동기 콘텐츠가 늦게 떠도 따라감.
  // + 광고 슬롯은 insertAdFit에서 높이를 미리 예약(레이아웃 불변)하므로 앵커가 광고 타이밍에 휘둘리지 않음. 둘 다 적용.
  function _anchorHeadH() { var tb = document.querySelector(".topbar"); return tb ? tb.getBoundingClientRect().height : 0; }
  function _anchorCands() { return viewEl ? viewEl.querySelectorAll("[data-player],[data-match],.player-row,.fixture-card,.news-item,.dash-card,.scn-sc,.sec-h,.block>h3,.detail h3") : []; }
  function _txtKey(el) { return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28); }
  function _anchorKey(el) { var d = el.getAttribute("data-player") || el.getAttribute("data-match"); if (d) return "d:" + d; var t = _txtKey(el); return t ? "t:" + t : null; }
  // 화면 "중앙"에 가장 가까운 후보를 앵커로 — 보던 주 콘텐츠가 잡혀 정확히 따라감.
  function captureAnchor() {
    if (!viewEl) return null;
    var cands = _anchorCands(), headH = _anchorHeadH(), refY = headH + (window.innerHeight - headH) / 2, best = null, bd = 1e9;
    for (var i = 0; i < cands.length; i++) { var r = cands[i].getBoundingClientRect(); if (r.height <= 0) continue; var ad = Math.abs(r.top - refY); if (ad < bd) { var k = _anchorKey(cands[i]); if (k) { bd = ad; best = { key: k, top: r.top }; } } }
    return best;
  }
  function findAnchor(key) {
    var cands = _anchorCands();
    if (key.indexOf("d:") === 0) { var v = key.slice(2); for (var i = 0; i < cands.length; i++) { var c = cands[i]; if ((c.getAttribute("data-player") || c.getAttribute("data-match")) === v) return c; } return null; }
    if (key.indexOf("t:") === 0) { var tv = key.slice(2); for (var j = 0; j < cands.length; j++) { if (_txtKey(cands[j]) === tv) return cands[j]; } }
    return null;
  }
  var _scrollGen = 0;
  function restoreScroll(mem) {
    var gen = ++_scrollGen;  // 새 복원 시작 → 이전 화면의 복원 루프 무효화(스테일 루프가 새 페이지 스크롤 잡는 것 방지)
    var y = typeof mem === "number" ? mem : (mem && mem.y) || 0;
    var anchor = (mem && typeof mem === "object") ? mem.anchor : null;
    if (!y && !anchor) { window.scrollTo(0, 0); return; }
    var start = null, hits = 0, userScrolled = false;
    function onUser() { userScrolled = true; }  // 사용자가 스크롤 시도(휠/터치/키) → 복원 즉시 중단해 손 제어권 넘김
    function cleanup() { window.removeEventListener("wheel", onUser); window.removeEventListener("touchmove", onUser); window.removeEventListener("keydown", onUser, true); }
    window.addEventListener("wheel", onUser, { passive: true }); window.addEventListener("touchmove", onUser, { passive: true }); window.addEventListener("keydown", onUser, true);
    function step(ts) {
      if (gen !== _scrollGen || userScrolled) { cleanup(); return; }  // 새 네비게이션이 시작됐거나 사용자가 스크롤하면 멈춤 → 떨림 방지
      if (start == null) start = ts;
      var el = anchor ? findAnchor(anchor.key) : null;
      if (el) {
        var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        var target = Math.max(0, Math.min(window.scrollY + (el.getBoundingClientRect().top - anchor.top), max));
        window.scrollTo(0, target);
        if (Math.abs(el.getBoundingClientRect().top - anchor.top) <= 2) { if (++hits >= 3 && ts - start > 120) { cleanup(); return; } } else { hits = 0; }
      } else { window.scrollTo(0, y); }
      if (ts - start < 1500) requestAnimationFrame(step); else cleanup();  // 최대 1.5초로 단축(과거 2.5초)
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
    if (parts[0] === "scenario") return { name: "scenario", id: parts[1] };
    if (parts[0] === "kr32") return { name: "kr32" };
    if (parts[0] === "groupscn") return { name: "groupscn", id: parts[1] };
    if (parts[0] === "fifa") return { name: "fifa" };
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
  var BL_R32 = [74, 77, 73, 75, 83, 84, 81, 82], BR_R32 = [76, 78, 79, 80, 86, 88, 85, 87];
  // ===== 킥톡 예측 대진표 — 전력(지수+몸값+FIFA랭킹)으로 조 순위·승자 예측. 잉글랜드는 매 경기 승리 강제(우승 고정). 참고용. =====
  var PRED = null, PRED_CHAMP = "england", KO_WIN = {};  // KO_WIN[fid]=진출팀id(승부차기 승자 등 ko_teams.json·ESPN winner 플래그로 채움)
  function brkStrength(id) { var t = teamsById[id]; if (!t) return 0; var x = t.indices || {}; var mv = TEAM_MV[id] || 0; return (x.attack || 60) + (x.defense || 60) + (x.organization || 60) + (x.experience || 40) * 0.4 + Math.sqrt(mv) * 2 + (60 - (t.fifaRank || 60)) * 0.5; }
  function predictBracket() {
    // 조별 끝난 조 = 실제 ESPN 순위(STAND)로 32강 자리 채움 / 진행중 조 = 킥톡 전력지수 예측. (마지막 조 종료 시 실제 진출 32팀 자동 반영)
    var st = STAND || {};
    function grpFinished(ids) { return ids.length >= 4 && ids.every(function (id) { var s = st[id]; return s && s.p >= 3; }); }
    function realOrder(ids) { return ids.slice().sort(function (a, b) { var sa = st[a] || {}, sb = st[b] || {}; return (sb.pts || 0) - (sa.pts || 0) || (sb.gd || 0) - (sa.gd || 0) || (sb.gf || 0) - (sa.gf || 0) || brkStrength(b) - brkStrength(a); }); }
    var gr = {}, realG = {};
    (DATA.groups || []).forEach(function (g) {
      var ids = (g.teamIds || []).slice();
      if (grpFinished(ids)) { gr[g.group] = realOrder(ids); realG[g.group] = 1; }
      else gr[g.group] = ids.sort(function (a, b) { return brkStrength(b) - brkStrength(a); });
    });
    // 각 조 3위 중 상위 8팀: 끝난 조 3위는 실제 성적으로 상위 배치(모든 조 종료 시 실제 8팀 정확), 진행중 조는 예측.
    function thirdScore(o) { var s = st[o.id]; return (realG[o.L] && s) ? 1e7 + (s.pts || 0) * 1e4 + (s.gd || 0) * 100 + (s.gf || 0) : brkStrength(o.id); }
    var thirds = Object.keys(gr).map(function (L) { return { L: L, id: gr[L][2] }; }).filter(function (o) { return o.id; }).sort(function (a, b) { return thirdScore(b) - thirdScore(a); });
    var usedThird = {};
    function slotTeam(s) {
      var m = /^([12])([A-L])$/.exec(s); if (m) { var arr = gr[m[2]] || []; return arr[m[1] === "1" ? 0 : 1]; }
      var t = /3rd\s+([A-L/]+)/.exec(s);
      if (t) { var cands = t[1].split("/"); var pick = thirds.filter(function (o) { return cands.indexOf(o.L) >= 0 && !usedThird[o.L]; })[0] || thirds.filter(function (o) { return !usedThird[o.L]; })[0]; if (pick) { usedThird[pick.L] = 1; return pick.id; } }
      return null;
    }
    function win(a, b) { if (!a) return b; if (!b) return a; if (a === PRED_CHAMP || b === PRED_CHAMP) return PRED_CHAMP; return brkStrength(a) >= brkStrength(b) ? a : b; }
    var r32 = {}; BRACKET.r32.forEach(function (m) { r32[m.m] = { a: slotTeam(m.a), b: slotTeam(m.b) }; });
    // 실제 대진 확정/교정된 32강 경기는 예측 대신 fixture 실제 팀 사용(ko_teams.json·resolveKnockout 반영). 예측이 빗나간 대진표를 실제로.
    BRACKET.r32.forEach(function (m) { var fx = fixturesById["match-" + m.m]; if (fx && fx.homeId && fx.awayId) r32[m.m] = { a: fx.homeId, b: fx.awayId }; });
    var node = {}, r32win = {};
    // 끝난 경기는 ESPN 실제 진출팀(승부차기 승자 포함), 진행전은 전력 예측. 라운드별 실제 승자가 위로 전파됨 → 32강 결과 실시간 반영.
    function nodeWin(mn, a, b) { var fx = fixturesById["match-" + mn]; var w = fx && advancerOf(fx); return w || win(a, b); }
    function side(arr, pfx, r16m, r8m, sfm) {
      var w = arr.map(function (mn) { var wn = nodeWin(mn, r32[mn].a, r32[mn].b); r32win[mn] = wn; return wn; });
      var l16 = []; for (var i = 0; i < 4; i++) { node[pfx + "16_" + i] = nodeWin(r16m[i], w[2 * i], w[2 * i + 1]); l16.push(node[pfx + "16_" + i]); }
      var l8 = []; for (i = 0; i < 2; i++) { node[pfx + "8_" + i] = nodeWin(r8m[i], l16[2 * i], l16[2 * i + 1]); l8.push(node[pfx + "8_" + i]); }
      node[pfx + "sf"] = nodeWin(sfm, l8[0], l8[1]); return node[pfx + "sf"];
    }
    var lf = side(BL_R32, "l", [89, 90, 93, 94], [97, 98], 101), rf = side(BR_R32, "r", [91, 92, 95, 96], [99, 100], 102);
    node.fin = nodeWin(104, lf, rf);
    var lLose = node.lsf === node.l8_0 ? node.l8_1 : node.l8_0, rLose = node.rsf === node.r8_0 ? node.r8_1 : node.r8_0;  // 3·4위전 = 양 4강 패자
    return { r32: r32, r32win: r32win, node: node, champion: node.fin, runnerUp: node.fin === lf ? rf : lf, third: [lLose, rLose] };
  }
  // ===== 녹아웃 자동 채움 — 슬롯 라벨을 실제 팀으로 해석. 32강=실제 조 순위, 16강~결승=실제 경기 승자/패자. =====
  // 라운드가 끝날 때마다 다음 경기 팀이 자동으로 채워진다(스케줄·경기상세·대진표 공통). 원본 슬롯 라벨은 _slotA/_slotB에 보존해 매번 재해석.
  function resolveKnockout() {
    var st = STAND || {}, changed = false;
    function grpFin(ids) { return ids.length >= 4 && ids.every(function (id) { var s = st[id]; return s && s.p >= 3; }); }
    function ordOf(ids) { return ids.slice().sort(function (a, b) { var sa = st[a] || {}, sb = st[b] || {}; return (sb.pts || 0) - (sa.pts || 0) || (sb.gd || 0) - (sa.gd || 0) || (sb.gf || 0) - (sa.gf || 0) || brkStrength(b) - brkStrength(a); }); }
    var gr = {}, realG = {};
    (DATA.groups || []).forEach(function (g) { var ids = (g.teamIds || []).slice(); if (grpFin(ids)) { gr[g.group] = ordOf(ids); realG[g.group] = 1; } });
    var thirds = Object.keys(gr).map(function (L) { return { L: L, id: gr[L][2] }; }).filter(function (o) { return o.id; })
      .sort(function (a, b) { var sa = st[a.id] || {}, sb = st[b.id] || {}; return (sb.pts || 0) - (sa.pts || 0) || (sb.gd || 0) - (sa.gd || 0) || (sb.gf || 0) - (sa.gf || 0); });
    var usedThird = {};
    function slotTeam(label) {
      var m = /^([A-L])조\s*([12])위$/.exec(label || ""); if (m) { var arr = gr[m[1]]; return (realG[m[1]] && arr) ? arr[m[2] === "1" ? 0 : 1] : null; }
      var t = /^([A-L/]+)조\s*3위$/.exec(label || ""); if (t) { var cands = t[1].split("/"); var pick = thirds.filter(function (o) { return cands.indexOf(o.L) >= 0 && realG[o.L] && !usedThird[o.L]; })[0]; if (pick) { usedThird[pick.L] = 1; return pick.id; } }
      return null;
    }
    function koWinner(label) {
      var m = /(\d+)경기\s*(승자|패자)/.exec(label || ""); if (!m) return null;
      var fx = fixturesById["match-" + m[1]]; if (!fx || !matchEnded(fx)) return null;
      var win = advancerOf(fx); if (!win || !fx.homeId || !fx.awayId) return null;  // 진출팀(승부차기 winId 포함). 승자 미확정이면 null
      var lose = win === fx.homeId ? fx.awayId : fx.homeId;
      return m[2] === "승자" ? win : lose;
    }
    (DATA.fixtures || []).forEach(function (fx) {
      if (fx.group) return;
      if (fx._espnFixed) return;  // 실제 ESPN 경기로 교정된 대진은 예측으로 덮지 않음
      if (fx._slotA == null) { fx._slotA = fx.homeName; fx._slotB = fx.awayName; }  // 원본 슬롯 라벨 보존
      var r32 = fx.stage === "32강";
      var ha = r32 ? slotTeam(fx._slotA) : koWinner(fx._slotA);
      var hb = r32 ? slotTeam(fx._slotB) : koWinner(fx._slotB);
      if (ha && fx.homeId !== ha) { fx.homeId = ha; var ta = teamsById[ha]; if (ta) fx.homeName = ta.name; changed = true; }
      if (hb && fx.awayId !== hb) { fx.awayId = hb; var tb = teamsById[hb]; if (tb) fx.awayName = tb.name; changed = true; }
    });
    return changed;
  }
  // 세로형 32강 대진표 — 한 경기 = 팀카드(조/순위 2줄) 위아래로 쌓음. 가운데 결승.
  // ★카드 크기는 고정, 너비가 넓어지면 '연결선(컬럼 간격)'만 좌우로 늘림(전체 확대 X). 리사이즈 시 재배치.
  var _brkRO = null, _brkLastW = -1;
  function layoutBracket() {
    var fit = viewEl.querySelector(".brk2-fit"); if (!fit) return;
    var avail = Math.floor(fit.clientWidth) || 320;  // 가용 폭(ResizeObserver 콜백에서 측정 = 패딩 적용된 정확값)
    if (avail === _brkLastW) return;  // 폭 변화 없으면 스킵(높이 변경에 의한 RO 무한루프 방지)
    _brkLastW = avail;
    var W = Math.max(320, avail), H = 625, CY = H / 2, i;  // 경기 사이 세로 간격(한 경기 두 팀은 붙고 경기끼리는 살짝 벌어져 페어 구분). 560=붙음 820=과다 → 625
    function cyA(n) { var a = [], k; for (k = 0; k < n; k++) a.push(H / (2 * n) * (2 * k + 1)); return a; }
    var r32cy = cyA(8), c16cy = cyA(4), c8cy = cyA(2);
    var cardW = 58, Wp = 26, Wf = 42, OFF = PRED ? 18 : 15, edge = cardW / 2 + 5;  // R32 카드 중심 = 좌측 여백 (예측 모드는 세로카드라 간격↑). Wp=16강+ 국기박스 너비
    var span = (W / 2) - edge;  // R32열 → 중앙(결승)까지 가로 거리(넓을수록 길어짐 = 연결선만 늘어남)
    var XL = edge, X16 = edge + span * 0.426, X8 = edge + span * 0.618, X4 = edge + span * 0.765, XF = W / 2;  // 비율은 원본 360px 디자인과 동일
    var XR = W - edge, XR16 = W - X16, XR8 = W - X8, XR4 = W - X4;
    var boxes = [], BX = {}, P = [];
    function box(cx, cy, w, h, cls, html, attr) { boxes.push('<div class="bx ' + cls + '"' + (attr || "") + ' style="left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;width:' + w + 'px;min-height:' + h + 'px">' + html + "</div>"); }
    function teamAttr(tid) { var t = teamsById[tid]; return t ? ' data-team="' + esc(tid) + '" title="' + esc(t.name) + '"' : ""; }  // 클릭→나라상세 + 마우스오버 툴팁
    function vbox(id, cx, cy, w) { BX[id] = { cx: cx, cy: cy, w: w }; }
    // 노드 id → FIFA 경기번호. isReal = 그 경기가 끝나 실제 진출팀 확정(예측 아님).
    var NODE_MN = { l16_0: 89, l16_1: 90, l16_2: 93, l16_3: 94, r16_0: 91, r16_1: 92, r16_2: 95, r16_3: 96, l8_0: 97, l8_1: 98, r8_0: 99, r8_1: 100, lsf: 101, rsf: 102, fin: 104 };
    function isReal(mn) { var fx = mn && fixturesById["match-" + mn]; return !!(fx && advancerOf(fx)); }
    function tcard(s, cx, cy, tid, isWin, real) {
      var t = brkSlot(s), sp = t.lastIndexOf(" "), g = sp > 0 ? t.slice(0, sp) : t, r = sp > 0 ? t.slice(sp + 1) : "";
      if (PRED && tid) {
        var tm = teamsById[tid];
        // 3위 슬롯: 후보 조 목록(A·B·C·D·F 3위) 유지 + 실제 올라온 조만 굵게·강조색. 1·2위는 그대로.
        var labelHtml, is3 = g.indexOf("·") >= 0;
        if (is3) { var tg = tm && tm.group; labelHtml = g.split("·").map(function (x) { return x === tg ? '<b class="hl3">' + esc(x) + "</b>" : esc(x); }).join("·") + " " + esc(r); }
        else labelHtml = esc(g + " " + r);
        box(cx, cy, cardW, 32, "tc pred" + (isWin ? (real ? " win real" : " win pw") : ""), '<span class="bxf">' + esc(tm ? tm.flag : "") + '</span><span class="bxl' + (is3 ? " bxl3" : "") + '">' + labelHtml + "</span>" + (isWin && real ? '<span class="rmark">✓</span>' : ""), teamAttr(tid));
        return;
      }
      box(cx, cy, cardW, 26, "tc", "<b>" + esc(g) + "</b>" + (r ? "<i>" + esc(r) + "</i>" : ""));
    }
    function conBox(id, cx, cy, w, lbl) {  // 16강~4강 노드: 실제 진출팀(초록+✓) or 킥톡 예측(점선) or 라벨
      var tid = PRED && PRED.node[id], t = tid && teamsById[tid];
      var real = !!(t && isReal(NODE_MN[id]));
      box(cx, cy, w, 14, "con" + (t ? (real ? " real" : " pred") : ""), t ? '<span class="bxf">' + esc(t.flag) + "</span>" + (real ? '<span class="cmark">✓</span>' : "") : lbl, t ? teamAttr(tid) : "");
      vbox(id, cx, cy, w);
    }
    function pair(id, mn, cx, cy, ed) { var m = R32M[mn]; var pt = PRED && PRED.r32[mn]; var wn = PRED && PRED.r32win[mn]; var rl = isReal(mn); tcard(m.a, cx, cy - OFF, pt && pt.a, pt && wn === pt.a, rl); tcard(m.b, cx, cy + OFF, pt && pt.b, pt && wn === pt.b, rl); vbox(id, cx, cy, cardW); P.push("M" + ed + " " + (cy - OFF) + " V" + (cy + OFF)); }
    for (i = 0; i < 8; i++) pair("lr" + i, BL_R32[i], XL, r32cy[i], XL + cardW / 2);
    for (i = 0; i < 4; i++) conBox("l16_" + i, X16, c16cy[i], Wp, "16강");
    for (i = 0; i < 2; i++) conBox("l8_" + i, X8, c8cy[i], Wp, "8강");
    conBox("lsf", X4, CY, Wp, "4강");
    vbox("fin", XF, CY, Wf); box(XF, CY, Wf, Wf, "fin" + (PRED && PRED.champion ? (isReal(104) ? " real" : " pred") : ""), PRED && PRED.champion ? '<div class="trophy">🏆</div><div class="bxf champf">' + esc((teamsById[PRED.champion] || {}).flag || "") + "</div>" + (isReal(104) ? '<span class="cmark">✓</span>' : "") : '<div class="trophy">🏆</div><div class="finlbl">결승</div>', PRED && PRED.champion ? teamAttr(PRED.champion) : "");
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
    // 가용폭보다 stage가 넓으면(좁은 기기) 통째로 축소해 잘림 방지. 넓은 화면은 sc=1(그대로).
    var sc = avail < W ? avail / W : 1, stageEl = fit.firstChild;
    if (stageEl) { stageEl.style.transformOrigin = "top left"; stageEl.style.transform = sc < 1 ? "scale(" + sc + ")" : ""; }
    fit.style.height = (sc < 1 ? Math.ceil(H * sc) : H) + "px";
    twem(fit);
  }
  window.addEventListener("resize", function () { if (viewEl.querySelector(".brk2-fit")) layoutBracket(); });
  function renderBracket() {
    if (SPOILER_ON) { viewEl.innerHTML = '<div class="spoiler-note">🙈 <b>스포일러 방지 모드</b><br>대진표는 진출 결과가 드러나서 숨겼어요.<br><span class="muted-note">오른쪽 위 🙈 버튼을 눌러 끄면 볼 수 있어요.</span></div>'; return; }
    fetchStandings();  // 실제 순위 비동기 로드 → 도착 시 자동 재렌더(끝난 조는 실제 진출팀으로 채움)
    PRED = predictBracket();
    var champ = teamsById[PRED.champion] || {}, ru = teamsById[PRED.runnerUp] || {};
    viewEl.innerHTML = '<div class="adslot"></div><div class="brk-note">🏆 킥톡 예측 <span class="muted-note">자체 지수 기반 · 참고용</span><br>우승 ' + esc(champ.flag || "") + " " + esc(champ.name || "") + " · 준우승 " + esc(ru.flag || "") + " " + esc(ru.name || "") + '<br><span class="brk-legend"><span class="lg-real">✅ 실제 진출(초록 카드)</span> · <span class="lg-pred">┄ 킥톡 예측(회색 카드)</span></span></div><div class="brk2-fit"></div>';
    _brkLastW = -1;  // 새 fit → 강제 재측정
    var _bfit = viewEl.querySelector(".brk2-fit");
    if (window.ResizeObserver && _bfit) { if (_brkRO) _brkRO.disconnect(); _brkRO = new ResizeObserver(function () { layoutBracket(); }); _brkRO.observe(_bfit); }
    else requestAnimationFrame(layoutBracket);  // RO 미지원 폴백
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

  // 홈 하단 소개 — 렌더 후에도 DOM에 남는 한국어 본문(크롤러 인덱싱 + 사용자 안내). #seo-home(초기 HTML)과 함께 콘텐츠 신호 보강.
  function homeAboutHtml() {
    return '<section class="home-about">' +
      '<h2>2026 북중미 월드컵, 킥톡으로 즐기는 법</h2>' +
      '<p>2026 FIFA 월드컵은 사상 처음으로 <b>48개국</b>이 참가하는 대회로, 미국·캐나다·멕시코 3개국이 공동 개최합니다. 2026년 <b>6월 11일</b> 멕시코시티 에스타디오 아스테카에서 개막해 <b>7월 19일</b> 뉴욕·뉴저지 메트라이프 스타디움에서 막을 내립니다. 16개 도시에서 총 <b>104경기</b>가 열리며, 4팀씩 12개 조로 나뉘어 각 조 1·2위와 성적이 좋은 3위 여덟 팀까지 32강 토너먼트에 오릅니다. 킥톡은 이 모든 경기를 한국어로, 폰 하나로 빠짐없이 따라갈 수 있게 돕습니다.</p>' +
      '<h3>킥톡에서 할 수 있는 것</h3>' +
      '<ul class="ha-list">' +
      '<li><b>실시간 경기</b> — 진행 중인 경기의 스코어·라인업·주심을 실시간으로 확인합니다.</li>' +
      '<li><b>선수 평점</b> — 경기마다 선수별 평점을 색상 배지로 보여주고(6점 미만 빨강 ~ 9점 이상 파랑) 팀 평균 평점까지 제공합니다.</li>' +
      '<li><b>전력 분석</b> — 48개국 대표팀의 스타일과 전력 지표, 선수 능력치·등번호·프로필을 정리했습니다.</li>' +
      '<li><b>승부예측 &amp; 랭킹</b> — 무료 승부예측과 포인트 랭킹, 경기 MVP 투표에 참여할 수 있습니다.</li>' +
      '<li><b>하이라이트</b> — 치지직·JTBC 중계 하이라이트를 한곳에 모았습니다.</li>' +
      '</ul>' +
      '<h3>경기 평점은 어떻게 보나요?</h3>' +
      '<p>경기 상세 화면의 라인업에서 각 선수 위에 평점 배지가 표시됩니다. 색상이 활약도를 한눈에 보여줘요 — <b>빨강</b>(6.0 미만), <b>주황</b>(6.0~6.4), <b>노랑</b>(6.5~6.9), <b>초록</b>(7.0~7.9), <b>청록</b>(8.0~8.9), <b>파랑</b>(9.0 이상). 교체 투입된 선수와 팀 전체 평균 평점도 함께 확인할 수 있습니다.</p>' +
      '<h3>자주 묻는 질문</h3>' +
      '<p class="ha-q"><b>Q. 2026 월드컵은 언제 시작하나요?</b><br>2026년 6월 11일 멕시코시티에서 개막해 7월 19일 결승을 치릅니다.</p>' +
      '<p class="ha-q"><b>Q. 몇 개국이 참가하나요?</b><br>역대 최다인 48개국이 참가해 16개 도시에서 104경기를 치릅니다.</p>' +
      '<p class="ha-q"><b>Q. 킥톡은 무료인가요?</b><br>네, 모든 기능을 무료로 이용할 수 있습니다. 설치 없이 웹에서 바로 쓰고, 홈 화면에 추가하면 앱처럼 사용할 수 있어요.</p>' +
      '<h3>월드컵 가이드 · 칼럼</h3>' +
      '<ul class="ha-list">' +
      '<li><a href="news/worldcup-2026-guide.html">2026 월드컵 완전 가이드 — 일정·개최지·새 포맷</a></li>' +
      '<li><a href="news/title-contenders.html">우승후보 전격 분석 — 프랑스·스페인·아르헨티나·브라질</a></li>' +
      '<li><a href="news/korea-team.html">손흥민·김민재의 대한민국 — A조 분석·16강 시나리오</a></li>' +
      '<li><a href="news/superstars-11.html">꼭 봐야 할 슈퍼스타 11인</a></li>' +
      '<li><a href="news/player-rating-guide.html">축구 경기 평점 보는 법</a></li>' +
      '<li><a href="news/groups-preview.html">조별리그 12개 조 완벽 정리</a></li>' +
      '</ul>' +
      '<p><a href="news/">월드컵 가이드 전체 보기 →</a></p>' +
      '<p class="ha-foot"><a href="about.html">킥톡 소개</a> · <a href="privacy.html">개인정보처리방침</a> · <a href="terms.html">서비스 약관</a> · <a href="patchnotes.html">패치노트</a></p>' +
      '</section>';
  }

  // ===================== 월드컵 기록(득점왕·도움·자책골·카드) =====================
  var statsData = null, statsLoading = null, scoreCat = "goals";
  var SCORE_CATS = [["goals", "⚽ 득점"], ["assists", "🅰️ 도움"], ["og", "🥅 자책골"], ["cards", "🟨 카드"]];
  function ensureStats() {
    if (statsData) return Promise.resolve(statsData);
    if (statsLoading) return statsLoading;
    // ★정적 stats.json 우선(GitHub Pages CDN ~150KB) → Supabase egress 회피. 기존엔 Supabase matchStats가 app_data 전체(약 18MB)를 매 호출마다 가져와 무료한도 초과의 주범이었음. 정적이 비었을 때만 Supabase 폴백.
    statsLoading = fetch("https://kicktalk.xyz/stats.json?b=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; })
      .then(function (j) {
        if (j && j.players && j.players.length) return j;
        var ready = (window.KickComments && KickComments.ready) ? KickComments.ready() : Promise.resolve();
        return ready.then(function () { return (window.KickComments && KickComments.matchStats) ? KickComments.matchStats() : null; });
      }).then(function (j) { statsData = j || { players: [] }; return statsData; }).catch(function () { statsData = { players: [] }; return statsData; });
    return statsLoading;
  }
  function scVal(p) { return scoreCat === "cards" ? ((p.yellow || 0) + (p.red || 0) * 2) : (p[scoreCat] || 0); }
  function renderScorers() {
    if (SPOILER_ON) { viewEl.innerHTML = '<div class="spoiler-note">🙈 <b>스포일러 방지 모드</b><br>득점 순위·기록은 경기 결과가 드러나서 숨겼어요.<br><span class="muted-note">오른쪽 위 🙈 버튼을 눌러 끄면 볼 수 있어요.</span></div>'; return; }
    // 통계(Supabase) 로딩 동안 빈 화면 대신 탭+스피너 즉시 표시
    if (!viewEl.querySelector(".rank-sb")) viewEl.innerHTML = '<div class="rank-sorts">' + SCORE_CATS.map(function (c) { return '<button class="rank-sb' + (scoreCat === c[0] ? " on" : "") + '" data-scat="' + esc(c[0]) + '">' + c[1] + "</button>"; }).join("") + '</div><div class="sc-loading"><span class="sc-spin"></span><span>기록 불러오는 중…</span></div>';
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
      var html = '<div class="adslot ad-top"></div><div class="sec-h">👟 월드컵 기록 <span class="muted-note">실시간 집계 · ESPN</span></div><div class="hb-scn clickable fifa-entry" data-fifago>🌍 라이브 FIFA 랭킹 보기 →</div>' + subs;
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
      if (nextKr) { var d2 = ddayCount(fxDate(nextKr), today); dday = "🇰🇷 대한민국 경기 " + (d2 <= 0 ? "D-DAY · 오늘!" : "D-" + d2); }
      else { dday = "🇰🇷 대한민국 월드컵 일정 종료"; }
    }
    var ddayTap = nextKr ? ' data-match="' + esc(nextKr.id) + '"' : "";  // 클릭 시 다음 한국경기 상세로
    var witty = WITTY[wittyIdx];  // 현재 회전 중인 문구(렌더돼도 끊김 없이 이어짐)
    var krGroupRemain = fxs.filter(isKoreaFx).filter(function (f) { return f.group && !matchEnded(f); }).length;  // 한국 조별 잔여경기 있을 때만 경우의수 노출(32강 확정/조별종료 시 자동 숨김)
    return '<div class="hero-banner">' +
      '<div class="hb-kicker">KICKTALK · 2026 WORLD CUP</div>' +
      '<div class="hb-title">국가와 선수를 한눈에</div>' +
      '<div class="hb-sub">' + esc(witty) + "</div>" +
      (SPOILER_ON
        // 스포일러 방지: 한국 결과(무산/진출/일정종료·녹아웃 상대) 노출 금지. 조별 예정경기 D-day만 안전.
        ? ((nextKr && nextKr.group)
            ? '<div class="hb-dday clickable"' + ddayTap + ">" + dday + " ›</div>"
            : '<div class="hb-dday">🇰🇷 대한민국 대표팀</div>')
        : (kr32Active() ? kr32BannerHtml()  // 한국 조별 종료(3위 확정) → D-day 대신 '32강 가려면?' 요약
          : '<div class="hb-dday' + (nextKr ? " clickable" : "") + '"' + ddayTap + ">" + dday + (nextKr ? " ›" : "") + "</div>")) +
      (krGroupRemain ? '<div class="hb-scn clickable" data-scngo>🇰🇷 한국 32강 진출 경우의 수 보기 ›</div>' : "") + "</div>";
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
  // ===== 토스 광고/로그인 — 미리 구현. main.ts가 window.tossAd/tossUser 브릿지 제공. 키/위치만 채우면 바로 동작 =====
  // [광고 ID] 검수 전 QR 테스트는 테스트 ID 필수(라이브 ID는 검수 통과 후에야 노출됨, 실제 ID로 테스트하면 정책위반).
  // ★검수 제출 전 USE_TEST_AD = false 로 되돌릴 것.
  var USE_TEST_AD = false;
  var TOSS_AD_GROUP    = USE_TEST_AD ? "ait-ad-test-interstitial-id"  : "ait.v2.live.a45bb57c5ead4cdd";  // 전면광고
  var TOSS_BANNER_BIG  = USE_TEST_AD ? "ait-ad-test-native-image-id"  : "ait.v2.live.83d0588683ff49a2";  // 320x100 "배너큰이미지"(피드/네이티브)
  var TOSS_BANNER_SMALL= USE_TEST_AD ? "ait-ad-test-banner-id"        : "ait.v2.live.95355b5db1f745e9";  // 320x50 "배너"(리스트형)
  // 토스 전면광고 표시: 위치(트리거)는 정해지면 이 함수를 그 지점에서 호출. onDone은 광고 닫힌 뒤 콜백(없어도 됨).
  function tossShowAd(onDone) {
    if (IS_TOSS && TOSS_AD_GROUP && window.tossAd && window.tossAd.isSupported && window.tossAd.isSupported()) {
      window.tossAd.load(TOSS_AD_GROUP, function () { window.tossAd.show(TOSS_AD_GROUP, onDone); });  // loaded 이벤트 받은 뒤 show(문서 권장 흐름)
    } else if (onDone) { onDone(); }
  }
  // 토스 사용자 식별(익명 고유키) — 응원/MVP/평점 로그인 대체. Promise<string|null>. (서버 복호화 불필요)
  function tossUserKey() { return (IS_TOSS && window.tossUser && window.tossUser.key) ? window.tossUser.key() : Promise.resolve(null); }
  // 토스 인증 로그인(프로필 필요 시) — Promise<{authorizationCode,referrer}|null>. 서버에서 코드로 토스 API+복호화.
  function tossLogin() { return (IS_TOSS && window.tossUser && window.tossUser.login) ? window.tossUser.login() : Promise.resolve(null); }
  void tossUserKey; void tossLogin;  // 로그인은 방식 확정 시 연결(현재 준비만)
  function insertAdFit(el, unit, w, h) {
    if (IS_TOSS) {  // 토스: 애드핏 대신 토스 배너(320x50→배너, 그 외→배너큰이미지). 키 있을 때만, 없으면 빈슬롯(:empty 숨김)
      if (!el || el.getAttribute("data-done")) return;
      var gid = (String(h) === "50") ? TOSS_BANNER_SMALL : TOSS_BANNER_BIG;
      if (gid && window.tossBanner) {
        el.setAttribute("data-done", "1");
        el.innerHTML = '<div class="ad-label">광고</div>';
        var box = document.createElement("div"); el.appendChild(box);
        window.tossBanner.attach(gid, box);
      }
      return;
    }
    if (!el || el.getAttribute("data-done")) return;
    el.setAttribute("data-done", "1");
    el.style.boxSizing = "border-box"; el.style.minHeight = (parseInt(h || "100", 10) + 60) + "px";  // 광고 자리 미리 예약(광고높이+라벨+패딩 여유, border-box) → 광고가 늦게 떠도 슬롯 높이 불변 → 뒤로가기 스크롤 정확
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
    fetchStandings(); resolveKnockout();  // 녹아웃(32강~) 일정에 실제 진출팀 자동 채움(순위 도착 시 재렌더)
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
    // 스와이프 안내(한 번 보고 닫으면 다시 안 뜸 · 첫 스와이프 시 자동 사라짐)
    var _seenSwipe = false; try { _seenSwipe = localStorage.getItem("kt_swipehint") === "1"; } catch (e) {}
    var hintHtml = (!_seenSwipe && dates.length > 1) ? '<div id="swipeHint" style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:#9aa7b8;padding:5px 0 1px">↔ 좌우로 스와이프하면 날짜 이동<button id="swipeHintX" style="border:none;background:transparent;color:#9aa7b8;font-size:12px;cursor:pointer;padding:1px 5px">✕</button></div>' : "";

    var dayFixtures = (DATA.fixtures || []).filter(function (f) { return fxDate(f) === selectedDate; })
      .sort(function (a, b) { return (a.time || "99:99") < (b.time || "99:99") ? -1 : 1; });

    // 빅매치 히어로: FIFA 랭킹이 가장 높은 나라가 포함된 경기 (라이브 경기는 상단 라이브카드로 빠지므로 제외)
    var hero = pickBigMatch(dayFixtures.filter(function (f) { return !isLiveOrBcast(f); }));
    var heroHtml = hero ? heroCard(hero) : "";

    // 그 날의 경기 리스트
    var listHtml = '<div class="sec-h">' + fmtDate(selectedDate).d + " " +
      (fmtDate(selectedDate).dow ? fmtDate(selectedDate).dow + "요일" : "") +
      ' · ' + dayFixtures.length + '경기 <span class="kst-note">한국시간</span></div>';
    dayFixtures.forEach(function (fx) { if ((!hero || fx !== hero) && !isLiveOrBcast(fx)) listHtml += fixtureCard(fx); });  // 라이브/방송중 경기는 상단 라이브카드에만
    // 주요 소식 (팀 뉴스가 있을 때만) — 스포일러 모드면 결과가 새어나갈 수 있어 숨김
    var hn = SPOILER_ON ? [] : homeNews(8);
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
          (!IS_TOSS && nw.summary ? '<div class="news-sum"><span class="ai-tag">AI 요약</span>' + esc(nw.summary) + "</div>" : "") +
          (foot ? '<div class="news-meta">' + foot + "</div>" : "") +
          "</" + tag + ">";
      });
      listHtml += "</div>";
    }
    listHtml += '<div class="adslot cpang-m"></div>';  // 모바일 쿠팡(320x50)

    viewEl.innerHTML = topBanner() + liveSection() + strip + hintHtml + '<div class="adslot home-ad"></div>' + heroHtml + '<div class="cheer-slot"></div>' + listHtml + homeAboutHtml();  // 광고(320x100): 날짜 스트립 밑 · 빅매치 위 / 하단: 소개 본문(SEO)
    var _shx = viewEl.querySelector("#swipeHintX");
    if (_shx) _shx.addEventListener("click", function () { try { localStorage.setItem("kt_swipehint", "1"); } catch (e) {} var h = viewEl.querySelector("#swipeHint"); if (h) h.remove(); });
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

    // 좌우 스와이프로 날짜 이동 — viewEl에 1회만 부착(재렌더마다 중복 방지). 날짜 스트립 위 스와이프는 제외(스트립 자체 스크롤).
    if (!window._dateSwipeAttached) {
      window._dateSwipeAttached = true;
      var _sx = 0, _sy = 0, _trk = false, _fromStrip = false;
      viewEl.addEventListener("touchstart", function (e) {
        if (!onHomeSchedule() || !e.touches || e.touches.length !== 1) { _trk = false; return; }
        var t = e.touches[0]; _sx = t.clientX; _sy = t.clientY; _trk = true;
        _fromStrip = !!(e.target.closest && e.target.closest(".datestrip-wrap"));
      }, { passive: true });
      viewEl.addEventListener("touchend", function (e) {
        if (!_trk) return; _trk = false; if (_fromStrip || !onHomeSchedule()) return;
        var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
        var dx = t.clientX - _sx, dy = t.clientY - _sy;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;  // 가로 우세 스와이프만(세로 스크롤과 구분)
        var ds = fixtureDates(), i = ds.indexOf(selectedDate); if (i < 0) return;
        var ni = dx < 0 ? i + 1 : i - 1;  // 왼쪽으로 밀면 다음 날, 오른쪽으로 밀면 이전 날
        if (ni < 0 || ni >= ds.length) return;
        try { localStorage.setItem("kt_swipehint", "1"); } catch (e2) {}  // 첫 스와이프 후 안내 자동 제거
        selectedDate = ds[ni]; renderSchedule();
      }, { passive: true });
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
      var s = Math.min(hr, ar) * 1000 + Math.max(hr, ar);  // FIFA 랭킹 가장 높은 한 팀이 포함된 경기 우선(동률 시 상대팀 랭킹으로 보조)
      if (s < bestScore) { bestScore = s; best = fx; }
    });
    return best;
  }

  // 메인 상단 '지금 라이브' 카드 — 라이브 경기 있을 때만 노출, 탭하면 경기상세
  var LIVE_DEMO = 0;  // 0=실제 라이브만. (?live=1/2 파라미터로는 여전히 더미 테스트 가능)
  // 라이브 판정은 ESPN 'in'만 신뢰 — 스케줄 킥오프(예:4시) 시각으로 라이브를 단정하지 않음.
  // (예정시각이 지났어도 실제 시작이 늦으면 라이브 아님. 방송 선행 표시는 isLiveOrBcast/LIVE_STREAM가 담당.)
  function isLiveFix(f) { var lv = LIVE[f.id]; if (lv && lv.state === "in") { var ko = matchKickoff(f); if (ko && Date.now() > ko + 210 * 60000) return false; return true; } return false; }  // 스테일(킥오프+210분 경과(연장·승부차기 포함)) 'in'은 라이브 아님 — 오염 방어
  function isLiveOrBcast(f) { if (SPOILER_ON) return false; return isLiveFix(f) || !!(LIVE_STREAM && LIVE_STREAM[f.id]); }  // ESPN 라이브 or JTBC 방송 감지(스포일러 모드면 라이브카드로 안 뺌)
  function liveFixtures() { return (DATA.fixtures || []).filter(isLiveFix); }
  function liveKey() { return liveFixtures().map(function (f) { return f.id; }).sort().join(","); }
  function liveSection() {
    if (SPOILER_ON) return "";  // 스포일러 방지: 라이브 스코어 섹션 숨김
    var tn = +((location.search.match(/[?&]live=(\d)/) || [])[1] || 0);  // ?live=1 / ?live=2 → 더미 라이브카드 테스트
    if (!tn && LIVE_DEMO && !liveFixtures().length) tn = LIVE_DEMO;
    var live, dummy = null;
    if (tn) {
      live = (DATA.fixtures || []).filter(function (f) { return f.homeId && f.awayId; }).slice(0, tn);
      dummy = [{ hs: 1, as: 0, clock: "67'", state: "in" }, { hs: 2, as: 2, clock: "81'", state: "in" }];
    } else {
      live = liveFixtures();
      if (LIVE_STREAM) { Object.keys(LIVE_STREAM).forEach(function (mid) { var _bf = fixturesById[mid]; if (_bf && live.indexOf(_bf) < 0) live = [_bf].concat(live); }); }  // JTBC 방송 감지 경기들 메인 라이브카드에
    }
    if (!live.length) return "";
    // 오늘의 빅매치 카드(heroCard) 스타일 재사용 — 2경기면 세로로 나열. ESPN 데이터 없으면 '곧 시작' 0:0 표시
    var cards = live.map(function (fx, i) {
      var lv = dummy ? dummy[i] : (LIVE[fx.id] || null);  // ESPN 데이터 없으면 null → heroCard가 'pre-라이브'(방송 선행/킥오프 직후 지연)로 처리
      return heroCard(fx, lv, true);
    }).join("");
    return '<div class="live-sec"><div class="live-sec-h"><span class="lv-pip"></span> 지금 라이브 <span class="live-sec-n">' + live.length + "경기</span></div><div class=\"live-cards\">" + cards + "</div></div>";
  }
  // 라이브 시계 라벨: 숫자 시계는 "LIVE 67'", 텍스트 상태(전반 종료 등)는 그대로
  // 경기 분 — ESPN displayClock("10'"/"HT") 그대로 사용. 스케줄 킥오프(예:4시) 기준 시각계산 안 함:
  // 실제 킥오프가 지연되면 시각경과가 ESPN 실제분보다 커져 과다표시(7분인데 9분)되던 버그 → 제거하고 ESPN 신뢰.
  function liveMin(fx, lv) {
    var c = (lv && lv.clock) || "";
    if (/종료|HT|하프/.test(c)) return "전반 종료";  // 하프타임은 "전반 종료"로 표기
    return c;  // ESPN 시계 그대로(빈값이면 빈값 → liveClk가 'LIVE'로 처리)
  }
  function liveClk(fx, lv) { var c = liveMin(fx, lv); return /^\d/.test(c) ? "LIVE " + esc(c) : (c ? esc(c) : "LIVE"); }
  function heroCard(fx, lvOverride, asLiveCard) {
    var groupLabel = fx.group ? fx.group + "조" : (fx.stage || "");
    var meta = [fx.venue, fx.city, hostCountry(fx)].filter(Boolean).map(esc).join(" · ");
    var heroAttr = (fx.homeId && fx.awayId) ? ' data-match="' + esc(fx.id) + '"'
      : ' data-team="' + esc(fx.homeId || fx.awayId) + '"';
    var swap = (fx.awayId === "south-korea");  // 대한민국 무조건 왼쪽
    var lId = swap ? fx.awayId : fx.homeId, lName = swap ? fx.awayName : fx.homeName;
    var rId = swap ? fx.homeId : fx.awayId, rName = swap ? fx.homeName : fx.awayName;
    var lv = lvOverride || lvOf(fx.id);  // 스포일러 모드면 null → 빅매치 히어로도 스코어 대신 예정(VS/시간)
    var espnIn = !!(lv && lv.state === "in");            // ESPN 실시간 스코어 확보됨
    var ended = !!(lv && lv.state === "post");
    var ko = matchKickoff(fx), started = !!(ko && Date.now() >= ko);
    var preLive = !!(asLiveCard && !espnIn && !ended);   // 라이브 섹션이지만 ESPN 데이터 전(방송 선행/킥오프 직후 지연) → '불러오는 중' 대신 '라이브'·킥오프 안내
    var live = espnIn || preLive;                         // 카드 라이브 톤
    var lS = lv ? (swap ? lv.as : lv.hs) : 0, rS = lv ? (swap ? lv.hs : lv.as) : 0;
    var mid = (asLiveCard && espnIn)
      ? '<div class="hero-mid"><span class="hero-score">' + (lS | 0) + " : " + (rS | 0) + "</span></div>"  // 실라이브: 실제 스코어
      : (asLiveCard && preLive)
      ? '<div class="hero-mid">' + (started
          ? '<span class="hero-score hero-loading">– : –</span>'                                            // 킥오프 지남·ESPN 지연: 스코어 자리만('불러오는 중' 금지)
          : '<span class="hero-kick">' + esc(fxTime(fx) || "시간 미정") + '</span><span class="hero-vs">킥오프 예정</span>') + "</div>"  // 방송 선행: 킥오프 시간 안내
      : espnIn
      ? '<div class="hero-mid"><span class="hero-score">' + (lS | 0) + " : " + (rS | 0) + '</span><span class="hero-fin">경기 중 ' + esc(liveMin(fx, lv) || "") + "</span></div>"  // 빅매치는 라이브 강조 X(전용 라이브카드가 위에 있음)
      : ended
      ? '<div class="hero-mid"><span class="hero-score">' + (lS | 0) + " : " + (rS | 0) + '</span><span class="hero-fin">종료' + (fxTime(fx) ? " · " + esc(fxTime(fx)) : "") + "</span></div>"
      : '<div class="hero-mid"><span class="hero-kick">' + esc(fxTime(fx) || "시간 미정") + "</span><span class=\"hero-vs\">VS</span></div>";
    var lvG = teamGoals(fx, lv, lName, "l"), rvG = teamGoals(fx, lv, rName, "r");  // 좌/우 팀별 득점자(가운데로 수렴)
    return '<div class="hero' + (live && asLiveCard ? " hero-live" : "") + (asLiveCard ? " live-hero" : "") + '"' + heroAttr + ">" +
      '<div class="hero-grid"></div>' +
      '<div class="hero-tag"><span class="dot"></span>' + (asLiveCard ? "" : "오늘의 빅매치 · ") + esc(groupLabel) + ((asLiveCard && live) ? '<span class="hero-taglive"><span class="hlv-dot"></span>' + (espnIn ? liveClk(fx, lv) : "라이브") + "</span>" : "") + "</div>" +
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

  // 특정 팀의 득점자 목록(풀네임). 너무 길면 CSS로 …처리(모바일 잘림 방지). 한국골은 한국쪽, 상대골은 상대쪽 배치용.
  function teamGoals(fx, lv, teamName, side) {
    if (!lv || !lv.events || !lv.events.length) return "";
    var oppName = (teamName === fx.homeName) ? fx.awayName : fx.homeName;
    return lv.events.filter(function (g) {
      var p = playerByName(g.who); if (!p) return false;
      return g.og ? (p.team === oppName) : (p.team === teamName);  // 자책골은 상대 선수가 우리 쪽 득점 → 우리 쪽에 표시
    }).map(function (g) {
      var p = playerByName(g.who), nm = p ? p.name : g.who;  // 풀네임(성만→전체)
      var label = esc(nm) + (g.og ? " (자책골)" : "") + (g.clk ? " " + esc(g.clk) : "");
      var pid = p ? p.id : null;
      return '<span class="hg-goal' + (pid ? " hg-clk" : "") + '"' + (pid ? ' data-player="' + esc(pid) + '"' : "") + ">" + (side === "r" ? ("⚽ " + label) : (label + " ⚽")) + "</span>";  // 득점자 클릭 → 선수상세. 공이 가운데쪽: 좌팀=뒤, 우팀=앞

    }).join("");
  }

  // 미확정 녹아웃 슬롯("N경기 승자")에서 그 경기 두 후보국 id를 뽑음(두 팀 다 확정된 경우만).
  function slotCands(label) {
    if (SPOILER_ON) return null;  // 스포일러 방지: 앞 경기 진출팀(후보국) 노출 안 함 → "N경기 승자" 그대로
    var m = /(\d+)경기\s*승자/.exec(label || ""); if (!m) return null;
    var g = fixturesById["match-" + m[1]]; if (!g || !g.homeId || !g.awayId) return null;
    return [g.homeId, g.awayId];
  }
  // 국기 이모지 → ISO2 코드(리저널 인디케이터/잉글랜드 등 태그시퀀스). twemoji 없이도 이미지로 확실히 렌더하기 위함.
  var FLAG_SUB = { "england": "gb-eng", "scotland": "gb-sct", "wales": "gb-wls" };
  function isoFromFlag(emoji) {
    if (!emoji) return null;
    var cps = Array.from(emoji).map(function (c) { return c.codePointAt(0); }).filter(function (p) { return p >= 0x1F1E6 && p <= 0x1F1FF; });
    if (cps.length === 2) return String.fromCharCode(cps[0] - 0x1F1E6 + 97) + String.fromCharCode(cps[1] - 0x1F1E6 + 97);
    return null;  // 태그시퀀스(잉글랜드 등)는 팀id로 별도 처리
  }
  // 후보국 국기 — flagcdn 이미지(토스/기기 무관하게 표시). 실패 시 이모지 폴백.
  function candFlagHtml(id) {
    var t = teamsById[id];
    var iso = FLAG_SUB[id] || isoFromFlag(t && t.flag);
    if (iso) return '<img class="fx-cand-img" src="https://flagcdn.com/h24/' + iso + '.png" srcset="https://flagcdn.com/h48/' + iso + '.png 2x" alt="" loading="lazy">';
    return '<span class="fx-cand-fl">' + esc(flagOf(id)) + "</span>";  // 폴백
  }
  // 일정 카드 한쪽 슬롯을 두 후보국(국기 위·이름 아래 · 나란히)으로 렌더. side='home'|'away'.
  // 그 슬롯을 누르면 앞 경기(예: 90경기) 상세로 이동 — data-match="match-N"(공용 [data-match] 핸들러가 처리).
  function candSideHtml(ids, label, side) {
    var mm = /(\d+)경기/.exec(label || "");
    var mAttr = mm ? ' data-match="match-' + mm[1] + '"' : "";
    var cells = ids.map(function (id) {
      var t = teamsById[id];
      return '<span class="fx-cand">' + candFlagHtml(id) +
        '<span class="fx-cand-nm">' + esc(SHORT_TEAM[id] || (t ? t.name : id)) + "</span></span>";
    }).join('<span class="fx-cand-x">/</span>');
    return '<div class="fx-side cand ' + side + (mAttr ? " tap" : "") + '"' + mAttr + '>' +
      '<span class="fx-cand-lbl">' + esc(label) + (mAttr ? ' <span class="fx-cand-go">›</span>' : "") + "</span>" +
      '<span class="fx-cand-row">' + cells + "</span></div>";
  }
  function fixtureCard(fx) {
    var both = !!(fx.homeId && fx.awayId);
    var clickable = !!(fx.homeId || fx.awayId);
    var attr = both ? ' data-match="' + esc(fx.id) + '"'
      : (clickable ? ' data-team="' + esc(fx.homeId || fx.awayId) + '"' : "");
    var timeLabel = fxTime(fx) ? esc(fxTime(fx)) : "시간 미정";
    var groupLabel = fx.group ? esc(fx.group) + "조" : esc(fx.stage || "");
    var meta = [fx.venue, fx.city, hostCountry(fx)].filter(Boolean).map(esc).join(" · ");
    var lv = lvOf(fx.id);  // 스포일러 모드면 null → 스코어/라이브/종료 대신 예정(VS/시간)으로 표시
    var live = !!(lv && lv.state === "in"), ended = !!(lv && lv.state === "post");
    var swap = (fx.awayId === "south-korea");  // 대한민국은 무조건 왼쪽
    var lId = swap ? fx.awayId : fx.homeId, lName = swap ? fx.awayName : fx.homeName;
    var rId = swap ? fx.homeId : fx.awayId, rName = swap ? fx.homeName : fx.awayName;
    var lScore = lv ? (swap ? lv.as : lv.hs) : 0, rScore = lv ? (swap ? lv.hs : lv.as) : 0;
    var penX = (ended && lv && lv.hs === lv.as && lv.ph != null && lv.pa != null) ? (swap ? [lv.pa, lv.ph] : [lv.ph, lv.pa]) : null;  // 승부차기 스코어(좌-우, swap 반영)
    var mid;
    if (live || ended) {
      mid = '<span class="fx-stage">' + groupLabel + "</span>" +
        '<span class="fx-score">' + (lScore | 0) + ' <i>-</i> ' + (rScore | 0) + "</span>" +
        (live ? '<span class="fx-live"><span class="lv-dot"></span>' + liveClk(fx, lv) + "</span>"
              : penX ? '<span class="fx-final fx-pen">승부차기 ' + penX[0] + '-' + penX[1] + "</span>"
              : '<span class="fx-final">종료' + (fxTime(fx) ? " · " + esc(fxTime(fx)) : "") + "</span>");
    } else {
      mid = '<span class="fx-stage">' + groupLabel + "</span>" +
        '<span class="fx-time">' + timeLabel + '</span><span class="fx-vs">VS</span>';
    }
    var lG = teamGoals(fx, lv, lName, "l"), rG = teamGoals(fx, lv, rName, "r");  // 좌(홈쪽)/우(원정쪽) 득점자(가운데로 수렴)
    var goals = (lG || rG) ? '<div class="fx-goals"><div class="fx-g-l">' + lG + '</div><div class="fx-g-r">' + rG + "</div></div>" : "";
    // 미확정 녹아웃 슬롯은 후보 두 나라로 표시(경기 전만). 앞 경기 두 팀이 확정된 경우에 한함.
    var lCand = (!lId && !live && !ended) ? slotCands(lName) : null;
    var rCand = (!rId && !live && !ended) ? slotCands(rName) : null;
    var homeSide = lCand ? candSideHtml(lCand, lName, "home")
      : '<div class="fx-side home"><span class="fx-flag">' + esc(flagOf(lId)) + "</span>" +
        '<span class="fx-team">' + esc(lName) + "</span></div>";
    var awaySide = rCand ? candSideHtml(rCand, rName, "away")
      : '<div class="fx-side away"><span class="fx-flag">' + esc(flagOf(rId)) + "</span>" +
        '<span class="fx-team">' + esc(rName) + "</span></div>";
    return '<div class="fixture' + (clickable ? " clickable" : "") + (live ? " is-live" : "") + '"' + attr + ">" +
      homeSide +
      '<div class="fx-mid">' + mid + "</div>" +
      awaySide +
      goals + (meta ? '<div class="fx-meta">' + meta + "</div>" : "") +
      "</div>";
  }

  // 팀 최근 경기 폼(✓승 ✗패 –무) — LIVE(=match_results 로드됨)에서 도출, 최대 5개
  function formDots(teamId) {
    if (SPOILER_ON) return "";  // 스포일러 방지: 최근 폼(승/무/패) 숨김
    var fxs = (DATA.fixtures || []).filter(function (f) { return f.homeId === teamId || f.awayId === teamId; })
      .filter(function (f) { var lv = LIVE[f.id]; return lv && lv.state === "post" && lv.hs != null; })
      .sort(function (a, b) { return (fxDate(a) || "") < (fxDate(b) || "") ? -1 : 1; });
    var arr = fxs.map(function (f) { var lv = LIVE[f.id]; var my = f.homeId === teamId ? lv.hs : lv.as, op = f.homeId === teamId ? lv.as : lv.hs; return my > op ? "w" : my < op ? "l" : "d"; }).slice(-5);
    var out = "";
    for (var i = 0; i < 5; i++) { var r = arr[i]; out += '<span class="fd ' + (r || "e") + '">' + (r === "w" ? "✓" : r === "l" ? "✗" : r === "d" ? "–" : "") + "</span>"; }
    return out;
  }
  // 공용 순위표(사진형): #·팀·경기·승·무·패·득·실·득실·승점·최근5. opt.group=조컬럼, opt.thirds=상위8 강조
  function standTableHTML(rows, opt) {
    opt = opt || {};
    var GDS = ' style="text-align:right;padding-right:9px"';  // 득실: 표 본문과 같은 일반 폰트(baseline 일치) + 우측정렬. 부호 크기/색은 값 span에서 처리. 인라인이라 CSS 캐시 무관
    var h = '<table class="stand stand2"><thead><tr><th class="c">#</th><th>팀</th>' + (opt.group ? '<th class="c">조</th>' : "") + "<th>승</th><th>무</th><th>패</th><th>득</th><th>실</th><th class=\"gd\"" + GDS + ">득실</th><th class=\"pts\">승점</th></tr></thead><tbody>";
    rows.forEach(function (row, i) {
      var t = row.t, s = row.s, id = row.id, grp = row.g;
      if (row.r) { t = row.r.t; s = row.r.s; id = row.r.id; }  // 3위표 형태 {g, r:{...}}
      // 득실: 부호칸(고정폭) + 숫자칸(tabular)을 grid로 분리 → 부호 유무·숫자 폭과 무관하게 세로 정렬 일치(모바일 폰트 폭 가변 문제 해결)
      var _gv = Math.abs(s.gd), _gs = s.gd > 0 ? "+" : s.gd < 0 ? "−" : "";
      var gd = '<span class="gdcell" style="color:' + (s.gd > 0 ? "#2ec56e" : s.gd < 0 ? "#ef5350" : "inherit") + '"><span class="gdsign">' + _gs + '</span><span class="gdnum">' + _gv + "</span></span>";
      var qual = opt.thirds ? (i < 8) : (i < 2);
      var prov = opt.markProvisional && ((s.w || 0) + (s.d || 0) + (s.l || 0)) < 3;  // 2경기만 치른 팀(순위 미확정) → 흐리게 + '잔여1'
      var clb = "";  // 진출 확정/탈락/경합 뱃지
      if (opt.clinch && row.clinch) clb = row.clinch === "in" ? '<span class="clb cin">✅확정</span>' : row.clinch === "out" ? '<span class="clb cout">❌탈락</span>' : row.clinch === "contest" ? '<span class="clb cct">⚔️경합</span>' : "";
      h += '<tr class="' + (qual ? "qual" : "") + (id === "south-korea" ? " krrow" : "") + (prov ? " prov" : "") + '"' + (t ? ' data-team="' + esc(t.id) + '"' : "") + ">" +
        '<td class="c rk">' + (i + 1) + "</td>" +
        '<td class="tm"><span class="team-flag">' + esc(t ? t.flag : "🏳️") + '</span><span class="tm-n">' + esc(t ? t.name : id) + "</span>" + clb + (prov ? '<span class="prov-note">·잔여1</span>' : "") + "</td>" +
        (opt.group ? '<td class="c">' + esc(grp) + "</td>" : "") +
        "<td>" + s.w + "</td><td>" + s.d + "</td><td>" + s.l + "</td><td>" + s.gf + "</td><td>" + s.ga + '</td><td class="gd"' + GDS + ">" + gd + '</td><td class="pts">' + s.pts + "</td></tr>";
    });
    return '<div class="stand-scroll">' + h + "</tbody></table></div>";
  }
  function fifaAgo(ts) { var s = (Date.now() - ts) / 1000; if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전"; if (s < 86400) return Math.floor(s / 3600) + "시간 전"; return Math.floor(s / 86400) + "일 전"; }
  // 펼침 상세: 그 나라 최근 결과 + 다음 일정
  function fifaTeamFix(teamId) {
    var fx = (DATA.fixtures || []).filter(function (f) { return f.homeId === teamId || f.awayId === teamId; }).sort(function (a, b) { return (fxDate(a) || "") < (fxDate(b) || "") ? -1 : 1; });
    var ended = fx.filter(matchEnded), up = fx.filter(function (f) { return !matchEnded(f); });
    var rows = ended.slice(-2).concat(up.slice(0, 2));
    if (!rows.length) return '<div class="fde-empty">경기 정보 없음</div>';
    return rows.map(function (f) {
      var opId = f.homeId === teamId ? f.awayId : f.homeId, op = teamsById[opId] || {}, home = f.homeId === teamId;
      var lv = LIVE[f.id], done = lv && lv.state === "post" && lv.hs != null;
      var mid;
      if (done) { var my = home ? lv.hs : lv.as, ot = home ? lv.as : lv.hs; var res = my > ot ? "w" : my < ot ? "l" : "d"; mid = '<span class="fde-sc ' + res + '">' + my + " : " + ot + "</span>"; }
      else mid = '<span class="fde-when">' + esc((fmtDate(fxDate(f)) || {}).d || fxDate(f) || "") + (fxTime(f) ? " " + esc(fxTime(f)) : "") + "</span>";
      return '<div class="fde-row" data-match="' + esc(f.id) + '"><span class="fde-vs">vs ' + esc(op.flag || "") + " " + esc(op.name || opId) + "</span>" + mid + "</div>";  // 월드컵은 중립 개최 → 홈/어웨이(@/vs) 구분 없이 vs로 통일
    }).join("");
  }
  // 🌍 라이브 FIFA 랭킹 페이지 — 전체 FIFA 랭킹. 본선팀은 나라상세, 비본선팀은 토스트.
  var FIFA_ALL = [];
  // FIFA 코드 → 한글 국가명 (월드컵 비출전팀 표시용 — 본선 48개국은 data.teams에서 옴)
  var NQ_KO = {
    ITA: "이탈리아", DEN: "덴마크", NGA: "나이지리아", UKR: "우크라이나", RUS: "러시아", POL: "폴란드", WAL: "웨일스",
    HUN: "헝가리", SRB: "세르비아", CMR: "카메룬", SVK: "슬로바키아", GRE: "그리스", VEN: "베네수엘라", CHI: "칠레",
    PER: "페루", CRC: "코스타리카", ROU: "루마니아", MLI: "말리", IRL: "아일랜드", SVN: "슬로베니아", NIR: "북아일랜드",
    ALB: "알바니아", MKD: "북마케도니아", ISL: "아이슬란드", FIN: "핀란드", MNE: "몬테네그로", GAB: "가봉", BFA: "부르키나파소",
    ZAM: "잠비아", BEN: "베냉", COG: "콩고", GUI: "기니", LBY: "리비아", UGA: "우간다", GEO: "조지아", BOL: "볼리비아",
    JAM: "자메이카", OMA: "오만", BHR: "바레인", UAE: "아랍에미리트", CHN: "중국", PAN: "파나마", LUX: "룩셈부르크",
    KVX: "코소보", IND: "인도", SYR: "시리아", PLE: "팔레스타인", HON: "온두라스", SLV: "엘살바도르",
  };
  function renderFifa() {
    setTabbar("");
    var rows = FIFA_ALL.length ? FIFA_ALL.map(function (x) {
      var t = x.id && teamsById[x.id];
      return { id: x.id || "", code: x.code || "", name: t ? t.name : (NQ_KO[x.code] || x.name || x.code || ""), flag: t ? t.flag : "", flagUrl: x.flagUrl || "", fifaRank: x.r, fifaPts: x.p, fifaCh: x.ch || 0, fifaChR: x.chR || 0, wc: !!t };
    }) : (DATA.teams || []).filter(function (t) { return t.fifaRank; }).map(function (t) {
      return { id: t.id, code: "", name: t.name, flag: t.flag || "", flagUrl: "", fifaRank: t.fifaRank, fifaPts: t.fifaPts, fifaCh: t.fifaCh || 0, fifaChR: t.fifaChR || 0, wc: true };
    });
    rows = rows.filter(function (t) { return t.fifaRank && (t.fifaRank <= 60 || t.wc); }).sort(function (a, b) { return a.fifaRank - b.fifaRank; });
    var ago = FIFA_TS ? " · " + fifaAgo(FIFA_TS) + " 업데이트" : "";
    var html = '<div class="sec-h">🌍 FIFA 랭킹 <span class="muted-note">실시간' + ago + "</span></div>";
    html += '<div class="scn-note">FIFA가 2026년 도입한 <b>실시간 세계 랭킹</b> — 60위까지 전체 국가, 이후는 2026 월드컵 출전국만 표시합니다.</div>';
    html += '<div class="fifa-list">';
    rows.forEach(function (t) {
      var pts = t.fifaPts != null ? t.fifaPts.toFixed(2) : "", ch = t.fifaCh || 0, chR = t.fifaChR || 0;
      var mv = chR > 0 ? '<span class="fr-mv up">▲' + chR + "</span>" : chR < 0 ? '<span class="fr-mv down">▼' + Math.abs(chR) + "</span>" : '<span class="fr-mv flat">–</span>';
      var chHtml = ch ? '<span class="fr-ch ' + (ch > 0 ? "up" : "down") + '">' + (ch > 0 ? "▲" : "▼") + Math.abs(ch).toFixed(2) + "</span>" : "";
      var flagHtml = t.flag ? esc(t.flag) : (t.flagUrl ? '<img class="fr-img" src="' + esc(t.flagUrl) + '" alt="">' : "🏳️");
      var rowAttr = t.wc ? ' data-team="' + esc(t.id) + '"' : ' data-fifa-nq="' + esc(t.name) + '"';
      html += '<div class="fifa-rowwrap">' +
        '<div class="fifa-row' + (t.id === "south-korea" ? " kr" : "") + (t.wc ? "" : " nq") + '"' + rowAttr + '>' +
          '<span class="fr-rank">' + t.fifaRank + "</span>" + mv +
          '<span class="fr-flag">' + flagHtml + "</span>" +
          '<span class="fr-name">' + esc(t.name) + (t.code && !t.wc && /[A-Za-z]/.test(t.name) ? ' <small>' + esc(t.code) + "</small>" : "") + "</span>" +  // 한글 매핑되면 코드 숨김, 영어 폴백일 때만 코드 병기
          '<span class="fr-pts">' + (pts ? pts + chHtml : "") + "</span>" +
          (t.wc ? '<button class="fr-more" data-fifaexp="' + esc(t.id) + '">▾</button>' : '<span class="fr-more fr-empty"></span>') +
        "</div>" +
        (t.wc ? '<div class="fifa-detail" id="fde-' + esc(t.id) + '" hidden></div>' : "") +
        "</div>";
    });
    html += "</div>";
    viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
    twem(viewEl);
    insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");
  }
  function renderGroups() {
    var groups = DATA.groups || [];
    if (!groups.length) {
      viewEl.innerHTML = '<div class="empty">조 편성 데이터를 채우는 중입니다.</div>';
      return;
    }
    if (SPOILER_ON) {  // 스포일러 방지: 순위·승패 숨기고 조 편성(팀)만 표시
      var sh = '<div class="spoiler-note">🙈 <b>스포일러 방지 모드</b> · 순위·승패는 숨겼어요 (조 편성만 표시)<br><span class="muted-note">오른쪽 위 🙈 버튼으로 끌 수 있어요.</span></div>';
      groups.forEach(function (g) {
        sh += '<div class="grp-card"><div class="grp-h">' + esc(g.group) + '조</div><div class="grp-teams">' +
          (g.teamIds || []).map(function (id) { var t = teamsById[id]; return t ? '<div class="grp-team clickable" data-team="' + esc(id) + '"><span class="gt-fl">' + esc(t.flag || "") + "</span>" + esc(t.name) + "</div>" : ""; }).join("") +
          "</div></div>";
      });
      viewEl.innerHTML = sh + '<div class="adslot ad-bot"></div>';
      twem(viewEl); insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");
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
    if ((DATA.fixtures || []).filter(isKoreaFx).filter(function (f) { return f.group && !matchEnded(f); }).length) html += '<div class="hb-scn clickable" data-scngo style="margin:2px 0 12px">🇰🇷 한국 32강 진출 경우의 수 →</div>';
    var thirds = [];
    groups.forEach(function (g) {
      var rows = (g.teamIds || []).map(function (id) {
        return { id: id, t: teamsById[id], s: STAND[id] || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 } };
      });
      rows.sort(cmp);
      if (rows[2]) thirds.push({ g: g.group, r: rows[2] });
      html += '<div class="group-card"><h3 class="gc-head" data-grpscn="' + esc(g.group) + '"><span class="group-letter">' + esc(g.group) + "</span>" + esc(g.group) + '조<span class="gc-scn">🧮 32강 경우의 수 ›</span></h3>' + standTableHTML(rows) + "</div>";  // 조 제목 클릭 → 경우의수 페이지
    });
    // 각 조 3위팀 순위 — 32강 페이지와 동일 UI(진출확정/탈락/경합 뱃지 + 2경기 진행중 흐림)
    var thirdSec = kr32ThirdSectionHtml();
    if (thirdSec) html += '<div class="group-card gc-third">' + thirdSec + "</div>";
    viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
    insertAdFit(viewEl.querySelector(".ad-top")); insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");  // 맨위 320x100 / 맨밑 320x50
  }

  // ===================== 🇰🇷 한국 32강 진출 경우의 수 (풀 시뮬레이터) =====================
  // 2026 포맷: 각 조 1·2위 직행 + 12개 조 3위 중 상위 8팀 진출. 한국 조 남은 경기를 시뮬레이션하고,
  // 3위 시 다른 11개 조 3위(현재 순위 기준)와 비교해 8위 이내인지 판정. 골득실은 '1골차' 가정.
  var scenPick = {};  // {fixtureId: 'h'(홈승)|'d'(무)|'a'(원정승)}
  var KR = "south-korea";
  function scnStats(id) { var s = STAND[id]; return s ? { p: s.p, w: s.w, d: s.d, l: s.l, gf: s.gf, ga: s.ga, gd: s.gd, pts: s.pts } : { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; }
  // 두 팀 맞대결 결과(승자승) — 이미 치른 경기 기준. A 우선=-1, B 우선=1, 없으면 0
  var STORED_RESULTS = {};  // {mid:{hs,as}} — 종료경기 결과 캐시(loadStoredResults가 채움). 과거 맞대결 승자승을 LIVE 로드 타이밍과 무관하게 항상 인식
  function resultOf(fx) {  // 종료 결과 {hs,as} or null — LIVE(post) 우선, 없으면 저장 결과
    var lv = LIVE[fx.id]; if (lv && lv.state === "post" && lv.hs != null) return { hs: lv.hs, as: lv.as };
    var s = STORED_RESULTS[fx.id]; return (s && s.hs != null) ? { hs: s.hs, as: s.as } : null;
  }
  function advancerOf(fx) {  // 녹아웃 진출팀 id(승부차기 포함) or null — ESPN winner 플래그(winId) 우선, 없으면 승패 스코어. 동점인데 winId 없으면 null(아직 미확정)
    if (!fx) return null;
    var lv = LIVE[fx.id];
    if (lv && lv.state === "post" && lv.winId) return lv.winId;
    if (KO_WIN[fx.id]) return KO_WIN[fx.id];
    var r = resultOf(fx);
    if (r && r.hs != null && r.hs !== r.as && fx.homeId && fx.awayId) return r.hs > r.as ? fx.homeId : fx.awayId;
    return null;
  }
  function h2hFx(idA, idB) { return (DATA.fixtures || []).filter(function (f) { return (f.homeId === idA && f.awayId === idB) || (f.homeId === idB && f.awayId === idA); })[0]; }
  function scnH2H(idA, idB) {
    var fx = h2hFx(idA, idB); if (!fx) return 0;
    var r = resultOf(fx); if (!r) return 0;
    var aS = fx.homeId === idA ? r.hs : r.as, bS = fx.homeId === idA ? r.as : r.hs;
    return aS > bS ? -1 : aS < bS ? 1 : 0;
  }
  function scnCmp(a, b) {
    var d = b.s.pts - a.s.pts; if (d) return d;          // 1) 승점
    var h = scnH2H(a.id, b.id); if (h) return h;          // 2) 승자승(2026 규칙: 전체 골득실보다 먼저!)
    d = (b.s.gd - a.s.gd) || (b.s.gf - a.s.gf); if (d) return d;  // 3) 전체 골득실·다득점
    return ((a.t && a.t.fifaRank) || 999) - ((b.t && b.t.fifaRank) || 999);  // 4) FIFA 랭킹(추첨 폐지)
  }
  function scnApply(rows, fx, out) {  // 1골차 가정으로 결과 반영
    var h = rows[fx.homeId], a = rows[fx.awayId]; if (!h || !a) return;
    h.p++; a.p++;
    if (out === "d") { h.d++; a.d++; h.pts++; a.pts++; }
    else if (out === "h") { h.w++; a.l++; h.pts += 3; h.gf++; h.ga += 0; a.ga++; h.gd++; a.gd--; }
    else { a.w++; h.l++; a.pts += 3; a.gf++; h.ga++; a.gd++; h.gd--; }
  }
  function scnSimGroup(gids, remaining, picks) {  // 조 최종 순위 산출
    var rows = {}; gids.forEach(function (id) { rows[id] = scnStats(id); });
    remaining.forEach(function (fx) { var o = picks[fx.id]; if (o) scnApply(rows, fx, o); });
    var arr = gids.map(function (id) { return { id: id, t: teamsById[id], s: rows[id] }; });
    arr.sort(scnCmp); return arr;
  }
  // picks(남은경기 결과)로 각 팀 최종 승점만 계산 — 골득실은 스코어 모르니 가정 안 함.
  function scnPtsAfter(gids, remaining, picks) {
    var r = {}; gids.forEach(function (id) { r[id] = scnStats(id).pts; });
    remaining.forEach(function (f) { var o = picks[f.id]; if (!o) return; if (o === "h") r[f.homeId] += 3; else if (o === "a") r[f.awayId] += 3; else { r[f.homeId] += 1; r[f.awayId] += 1; } });
    return r;
  }
  // 승점만으로 순위 범위(best~worst). 승점 동률 팀은 골득실로 갈리지만 스코어를 모르므로 "그 동률 구간 어디든 가능"으로 보수적 판정 → 골득실 의존 케이스를 '확정'으로 오판하지 않음.
  // 두 팀 맞대결 승자 — 이미 끝났거나 picks(시나리오)로 정해진 결과 반영. A우위 -1 / B우위 1 / 미정(무·맞대결없음) 0
  function h2hWinner(idA, idB, picks) {
    var fx = h2hFx(idA, idB);
    if (!fx) return 0;
    var r = resultOf(fx), out;  // 종료 결과(LIVE post or 저장) 우선 — 과거 맞대결 승자승 항상 반영
    if (r) out = r.hs > r.as ? "h" : r.hs < r.as ? "a" : "d";
    else out = picks[fx.id];
    if (!out || out === "d") return 0;
    var aWin = (fx.homeId === idA && out === "h") || (fx.awayId === idA && out === "a");
    return aWin ? -1 : 1;
  }
  function scnRankRange(teamId, gids, remaining, picks) {
    var p = scnPtsAfter(gids, remaining, picks), my = p[teamId], above = 0, tie = [];
    gids.forEach(function (id) { if (id === teamId) return; if (p[id] > my) above++; else if (p[id] === my) tie.push(id); });
    // 승점 동률 해소: 2팀 동률이면 맞대결 승자승으로 확정. 맞대결 무면 골득실(무승부는 양팀 동일 변동이라, 서로 마지막 경기면 현재 골득실 차이가 유지됨 → 확정).
    var ambiguous;
    if (tie.length === 1) {
      var oid = tie[0], h = h2hWinner(teamId, oid, picks);
      if (h > 0) { above++; ambiguous = 0; }           // 맞대결 패 → 상대가 위
      else if (h < 0) ambiguous = 0;                    // 맞대결 승 → 내가 위
      else {                                            // 맞대결 무(또는 미정)
        var myFx = remaining.filter(function (f) { return f.homeId === teamId || f.awayId === teamId; });
        var oFx = remaining.filter(function (f) { return f.homeId === oid || f.awayId === oid; });
        if (myFx.length === 1 && oFx.length === 1 && myFx[0] === oFx[0]) {  // 둘의 유일한 남은 경기가 '서로의 맞대결'일 때만 → 무승부면 양팀 골득실이 똑같이 변해 현재 차이가 유지됨
          var dgd = scnStats(teamId).gd - scnStats(oid).gd, dgf = scnStats(teamId).gf - scnStats(oid).gf;
          if (dgd > 0 || (dgd === 0 && dgf > 0)) ambiguous = 0;                  // 골득실/다득점 우위 → 확정 위
          else if (dgd < 0 || (dgd === 0 && dgf < 0)) { above++; ambiguous = 0; }  // 열위 → 확정 아래
          else ambiguous = 1;                           // 완전 동일 → 페어플레이·FIFA(미정)
        } else ambiguous = 1;                           // 각자 다른 상대와 마지막 경기 → 골 변동으로 현재 골득실 무효 → 보수적(미정)
      }
    } else ambiguous = tie.length;                      // 3팀+ 동률은 미니리그 골득실 의존 → 보수적
    return { best: above + 1, worst: above + 1 + ambiguous };  // 동률 미정 ambiguous명이면 worst=best+ambiguous
  }
  function scnThirdRank(krGroup, projectedKrThird) {  // 12개 조 3위 비교 → 한국(3위) 순위
    var thirds = [];
    (DATA.groups || []).forEach(function (g) {
      if (g.group === krGroup) { if (projectedKrThird) thirds.push({ g: g.group, r: projectedKrThird }); return; }
      var rows = (g.teamIds || []).map(function (id) { return { id: id, t: teamsById[id], s: scnStats(id) }; }).sort(scnCmp);
      if (rows[2]) thirds.push({ g: g.group, r: rows[2] });
    });
    thirds.sort(function (a, b) { return scnCmp(a.r, b.r); });
    return thirds;
  }
  // 한국 최종 결과 판정: 'q12'(1·2위 직행)/'q3'(3위·8위내 진출)/'p3'(3위·경쟁 탈락권)/'out'(4위)
  function scnVerdict(krGroup, gids, remaining, picks) {
    var fin = scnSimGroup(gids, remaining, picks);
    var rank = fin.map(function (r) { return r.id; }).indexOf(KR) + 1;
    if (rank <= 2) return { code: "q12", rank: rank, fin: fin };
    if (rank === 4) return { code: "out", rank: rank, fin: fin };
    var krRow = fin.filter(function (r) { return r.id === KR; })[0];
    var thirds = scnThirdRank(krGroup, krRow);
    var ti = thirds.map(function (o) { return o.r.id; }).indexOf(KR);
    return { code: ti >= 0 && ti < 8 ? "q3" : "p3", rank: 3, thirdRank: ti + 1, fin: fin };
  }
  function renderScenario() {
    setTabbar("");
    if (kr32Active()) { try { history.replaceState(null, "", "#kr32"); } catch (e) {} return renderKr32(); }  // 한국 조별 종료 → 옛 경우의수 페이지는 '한국이 32강 가려면?'로 이동
    if (!DATA.groups || !teamsById[KR]) { viewEl.innerHTML = '<div class="empty">데이터를 불러오는 중입니다.</div>'; return; }
    fetchStandings();
    var krGroup = teamsById[KR].group;
    var g = DATA.groups.filter(function (x) { return x.group === krGroup; })[0];
    var gids = (g && g.teamIds) || [];
    var allFx = (DATA.fixtures || []).filter(function (f) { return gids.indexOf(f.homeId) >= 0 && gids.indexOf(f.awayId) >= 0; });
    var remaining = allFx.filter(function (f) { return !matchEnded(f); });
    var cur = gids.map(function (id) { return { id: id, t: teamsById[id], s: scnStats(id) }; }).sort(scnCmp);
    var krRank = cur.map(function (r) { return r.id; }).indexOf(KR) + 1;
    var krS = scnStats(KR);
    var flag = (teamsById[KR] || {}).flag || "🇰🇷";

    var loaded = Object.keys(STAND).length > 0;
    var html = '<div class="scn-top"><div class="sec-h scn-toph">🇰🇷 한국 32강 진출 경우의 수</div>' + (IS_TOSS ? "" : '<button class="scn-share" data-scn-share>📤 공유</button>') + "</div>";
    html += '<div class="scn-note">2026 월드컵: 각 조 <b>1·2위 직행</b> + 12개 조 <b>3위 중 상위 8팀</b> 32강 진출.</div>';
    html += '<div class="scn-cur">' + flag + ' 현재 <b>' + esc(krGroup) + '조 ' + krRank + '위</b> · 승점 ' + krS.pts + ' · 득실 ' + (krS.gd > 0 ? "+" : "") + krS.gd + ' · ' + krS.p + '경기 / 남은 ' + remaining.filter(function (f) { return f.homeId === KR || f.awayId === KR; }).length + '경기</div>';

    if (!loaded) { viewEl.innerHTML = html + '<div class="muted-note">순위를 불러오는 중…</div>'; return; }

    var krFx = remaining.filter(function (f) { return f.homeId === KR || f.awayId === KR; })[0];
    if (!krFx) {  // 한국 조별 경기 종료
      var done = scnVerdict(krGroup, gids, remaining, {});
      html += '<div class="scn-head ' + done.code + '">' + scnVerdictText(done) + "</div>";
      _scnShareData = { head: scnVerdictText(done).replace(/^[^가-힣A-Za-z0-9]+/, ""), headCls: done.code === "q12" || done.code === "q3" ? "q12" : done.code === "p3" ? "p3" : "out", cur: esc(krGroup) + "조 " + krRank + "위 · 승점 " + krS.pts + " · 득실 " + (krS.gd > 0 ? "+" : "") + krS.gd, oppName: "", summary: [] };
      viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
      insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50"); return;
    }
    var others = remaining.filter(function (f) { return f !== krFx; });
    var krHome = krFx.homeId === KR, oppId = krHome ? krFx.awayId : krFx.homeId, opp = teamsById[oppId] || {};
    function krOut(res) { return res === "win" ? (krHome ? "h" : "a") : res === "loss" ? (krHome ? "a" : "h") : "d"; }
    function evalKr(res, otherPicks) { var picks = {}; picks[krFx.id] = krOut(res); (otherPicks || []).forEach(function (o, i) { picks[others[i].id] = o; }); return scnRankRange(KR, gids, remaining, picks); }  // 상단 rrng와 동일하게 승점 기반(골득실 동률은 보수적) → 상·하위 결과 일치
    // 그룹 순위 기준(1·2위=직행 / 3위=와일드카드 경쟁 / 4위=탈락) — 다른 조 3위 비교는 불확실해 순위로 정직하게.
    function rrng(res) { var combos = scnEnum(others), mn = 9, mx = 0; combos.forEach(function (c) { var picks = {}; picks[krFx.id] = krOut(res); others.forEach(function (f, i) { picks[f.id] = c[i]; }); var rr = scnRankRange(KR, gids, remaining, picks); mn = Math.min(mn, rr.best); mx = Math.max(mx, rr.worst); }); return { mn: mn, mx: mx }; }  // 승점 기반(골득실 동률은 보수적으로 worst까지)
    var rrWin = rrng("win"), rrDraw = rrng("draw"), rrLoss = rrng("loss");
    function adv(rr) { return rr.mx <= 2; }

    // 헤드라인 — 가장 쉬운 '직행 확정' 결과
    var head, hcls = "q12";
    if (adv(rrLoss)) head = "🎉 져도 32강 직행 확정!";
    else if (adv(rrDraw)) head = "🇰🇷 비기기만 해도 32강 직행 확정!";
    else if (adv(rrWin)) head = "🔥 이기면 32강 직행 확정!";
    else if (rrWin.mn <= 3) { head = "⚔️ 남은 경기 결과에 운명이 갈려요"; hcls = "p3"; }
    else { head = "😢 자력 진출이 어려운 상황"; hcls = "out"; }
    html += '<div class="scn-head ' + hcls + '">' + head + "</div>";

    // 현재 조 순위표
    html += '<div class="scn-mini-wrap"><div class="scn-mini-h">🏆 현재 ' + esc(krGroup) + '조 순위</div>' + standTableHTML(cur) + "</div>";

    // 마지막 경기 헤더
    html += '<div class="scn-last">🏁 마지막 경기 · ' + flag + " 대한민국 vs " + esc(opp.flag || "") + " " + esc(opp.name || oppId) + "</div>";

    // 번호별 시나리오 카드(설명형)
    var leadId = cur[0].id;
    var chaserMax = Math.max.apply(null, gids.filter(function (id) { return id !== KR && id !== leadId; }).map(function (id) { var s = scnStats(id); var rem = remaining.some(function (f) { return f.homeId === id || f.awayId === id; }); return s.pts + (rem ? 3 : 0); }).concat([0]));
    [["승리", "win", 3], ["무승부", "draw", 1], ["패배", "loss", 0]].forEach(function (kv, idx) {
      var res = kv[1], krPts = krS.pts + kv[2], rr = rrng(res);
      var cls = rr.mx <= 2 ? "q12" : rr.mn >= 4 ? "out" : "p3";
      var concl = rr.mx <= 2 ? ("✅ 32강 직행 확정" + (rr.mn === rr.mx ? " · 조 " + rr.mn + "위" : "")) : rr.mn <= 2 ? "🟡 직행 또는 조 3위 (다른 경기 따라)" : rr.mx === 3 ? "🟡 조 3위 · 와일드카드 경쟁" : rr.mn >= 4 ? "❌ 탈락" : "🟡 조 3위 또는 탈락 (다른 경기 따라)";
      var reason;
      if (res === "win") reason = esc(opp.name || "남아공") + "을 이기면 승점 " + krPts + "점. 추격팀이 최대 " + chaserMax + "점이라 한국이 앞서 " + (rr.mx <= 2 ? "조 " + (rr.mn === rr.mx ? rr.mn + "위로 " : "") + "직행합니다." : "유리합니다.");
      else if (res === "draw") reason = "비기면 승점 " + krPts + "점. " + (rr.mx <= 2 ? "체코·멕시코 결과와 무관하게 직행 확정." : "체코-멕시코 결과에 따라 갈립니다.");
      else reason = "지면 승점 " + krPts + "점 유지. 조 3위(승점 " + krPts + ")는 12개 조 3위 중 8팀 안에 들어야 진출(불확실). 다른 경기(체코-멕시코) 결과별로:";
      // 결과에 따라 갈리는 경우 → 다른 경기 결과별 세부 분기 표시(레퍼런스 스타일)
      var bd = "";
      if (others.length === 1 && rr.mn !== rr.mx) {
        var of = others[0], oh = teamsById[of.homeId] || {}, oa = teamsById[of.awayId] || {};
        bd = '<div class="sc-bd">';
        [["h", esc(oh.flag || "") + " " + esc(oh.name || of.homeId) + " 승"], ["d", "무승부"], ["a", esc(oa.flag || "") + " " + esc(oa.name || of.awayId) + " 승"]].forEach(function (oc) {
          var v = evalKr(res, [oc[0]]);  // 승점 기반 best~worst (골득실 동률이면 범위)
          var lbl, cc;
          if (v.worst <= 2) { lbl = "✅ 32강 직행"; cc = "q"; }
          else if (v.best >= 4) { lbl = "❌ 탈락"; cc = "o"; }
          else if (v.best === v.worst) { lbl = v.best === 3 ? "🟡 조 3위(경쟁)" : "✅ 32강 직행"; cc = v.best === 3 ? "p" : "q"; }
          else if (v.best <= 2 && v.worst === 3) { lbl = "🟡 직행 또는 3위"; cc = "p"; }
          else { lbl = "🟡 3위 또는 탈락"; cc = "p"; }
          bd += '<div class="sc-bd-row"><span class="bd-l">' + oc[1] + '</span><span class="bd-v ' + cc + '">' + lbl + "</span></div>";
        });
        bd += "</div>";
      }
      html += '<div class="scn-sc ' + cls + '"><div class="sc-no">' + (idx + 1) + '</div><div class="sc-body"><div class="sc-tit">' + esc(opp.name || "남아공") + "에 " + kv[0] + ' <span class="sc-pt">승점 ' + krPts + '</span></div><div class="sc-concl">' + concl + '</div><div class="sc-rsn">' + reason + "</div>" + bd + "</div></div>";
    });

    // 한 줄 요약
    html += '<div class="scn-sum"><div class="ss-h">📌 한 줄 요약</div>';
    [["승리", rrWin], ["무승부", rrDraw], ["패배", rrLoss]].forEach(function (kv, i) { var rr = kv[1]; var t = rr.mx <= 2 ? "32강 직행 확정" : rr.mn >= 4 ? "탈락" : rr.mn <= 2 ? "직행 또는 3위 경쟁" : "조 3위 경쟁"; html += '<div class="ss-row"><b>' + (i + 1) + ". " + esc(opp.name || "남아공") + "전 " + kv[0] + "</b> → " + t + "</div>"; });
    html += "</div>";

    html += '<div class="muted-note" style="font-size:11px;margin-top:4px">※ 골득실 1골차 가정 · 다른 조 3위는 현재 순위 기준 추정</div>';
    // 공유 카드 데이터
    _scnShareData = {
      head: head, headCls: hcls,
      cur: esc(krGroup) + "조 " + krRank + "위 · 승점 " + krS.pts + " · 득실 " + (krS.gd > 0 ? "+" : "") + krS.gd,
      oppName: opp.name || "남아공",
      summary: [["승리", rrWin], ["무승부", rrDraw], ["패배", rrLoss]].map(function (kv) { var rr = kv[1]; return { label: kv[0], verdict: rr.mx <= 2 ? "✅ 직행 확정" : rr.mn >= 4 ? "❌ 탈락" : rr.mn <= 2 ? "🟡 직행/3위" : "🟡 3위 경쟁", q: rr.mx <= 2, out: rr.mn >= 4 }; })
    };
    viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
    insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");
  }
  function scnVerdictText(v) {
    if (v.code === "q12") return "✅ " + v.rank + "위로 32강 직행!";
    if (v.code === "q3") return "✅ 3위 — 3위 팀 중 " + v.thirdRank + "위로 32강 진출! (상위 8팀)";
    if (v.code === "p3") return "🟡 3위 — 3위 팀 중 " + v.thirdRank + "위, 현재로선 진출권(8위) 밖. 다른 조 결과 따라 달라질 수 있음";
    return "❌ 4위 — 탈락";
  }
  function scnEnum(fxs) {  // 남은 경기들의 모든 결과 조합 (3^n)
    if (!fxs.length) return [[]];
    var rest = scnEnum(fxs.slice(1)), out = [];
    ["h", "d", "a"].forEach(function (o) { rest.forEach(function (r) { out.push([o].concat(r)); }); });
    return out;
  }
  // 경기상세용: 이 경기(조별·미종료) 결과별 양팀 32강 진출 경우의 수 + 현재 조 순위. 한국 전용 로직을 모든 팀에 일반화.
  function matchScenarioHtml(fx) {
    if (!fx || !fx.group || !DATA.groups) return "";  // 종료 경기도 조 순위+경기결과는 표시(경우의수 버튼만 미종료+3R)
    var g = DATA.groups.filter(function (x) { return x.group === fx.group; })[0]; if (!g) return "";
    var gids = g.teamIds || []; if (gids.indexOf(fx.homeId) < 0 || gids.indexOf(fx.awayId) < 0) return "";
    if (!Object.keys(STAND).length) return '<div class="block"><h3>🏆 ' + esc(fx.group) + '조 현황</h3><div class="muted-note">순위 불러오는 중…</div></div>';
    var allFx = (DATA.fixtures || []).filter(function (f) { return gids.indexOf(f.homeId) >= 0 && gids.indexOf(f.awayId) >= 0; });
    var remaining = allFx.filter(function (f) { return !matchEnded(f); });
    var cur = gids.map(function (id) { return { id: id, t: teamsById[id], s: scnStats(id) }; }).sort(scnCmp);

    // 양팀의 조별 종료 경기 결과(상대 + 스코어 + 승무패) — 좌우 배치
    function teamResults(teamId) {
      return allFx.filter(function (f) { return (f.homeId === teamId || f.awayId === teamId) && matchEnded(f); })
        .sort(function (a, b) { return (fxDate(a) || "") < (fxDate(b) || "") ? -1 : 1; })
        .map(function (f) {
          var lv = LIVE[f.id] || {}, home = f.homeId === teamId, op = teamsById[home ? f.awayId : f.homeId] || {};
          var my = home ? lv.hs : lv.as, ot = home ? lv.as : lv.hs;
          if (my == null) window._mscNeedsLive = true;  // 스코어 미로드 → 저장 결과 도착 시 재렌더 트리거
          var res = my == null ? "" : my > ot ? "w" : my < ot ? "l" : "d";
          return '<div class="mr-g ' + res + '" data-match="' + esc(f.id) + '"><span class="mr-opp">' + esc(op.flag || "") + " " + esc(op.name || "") + '</span><span class="mr-sc">' + (my != null ? my + ":" + ot : "-") + "</span></div>";  // 클릭 시 그 경기 상세로(기존 [data-match] 핸들러)
        }).join("");
    }
    var hf = teamsById[fx.homeId] || {}, af = teamsById[fx.awayId] || {};
    var hRes = teamResults(fx.homeId), aRes = teamResults(fx.awayId);

    var html = '<div class="block"><h3>🏆 ' + esc(fx.group) + '조 현황</h3>' + standTableHTML(cur);
    if (hRes || aRes) {  // 2라운드부터(종료 경기 있을 때)만 결과 표시
      html += '<div class="mr-wrap">' +
        '<div class="mr-side"><div class="mr-team">' + esc(hf.flag || "") + " " + esc(fx.homeName) + "</div>" + (hRes || '<div class="muted-note">경기 전</div>') + "</div>" +
        '<div class="mr-side"><div class="mr-team">' + esc(af.flag || "") + " " + esc(fx.awayName) + "</div>" + (aRes || '<div class="muted-note">경기 전</div>') + "</div>" +
        "</div>";
    }

    // 경우의 수 버튼: 미종료 & 조별 3라운드(=양팀 모두 이 경기가 마지막 조별 경기)일 때만. 종료 경기는 결과 확정이라 버튼 X(조 순위+결과는 위에 그대로 표시).
    var _fd = fxDate(fx) || "";
    var isLastRound = [fx.homeId, fx.awayId].every(function (tid) { return !allFx.some(function (f) { return f !== fx && (f.homeId === tid || f.awayId === tid) && (fxDate(f) || "") > _fd; }); });
    if (!matchEnded(fx) && isLastRound) {
      var isKr = fx.homeId === "south-korea" || fx.awayId === "south-korea";
      html += '<button class="scn-go-btn"' + (isKr ? " data-scngo" : ' data-grpscn="' + esc(fx.group) + '"') + '>🧮 ' + (isKr ? "한국 " : esc(fx.group) + "조 ") + "32강 진출 경우의 수 보기 →</button>";
    }
    html += "</div>";
    return html;
  }
  // 조별 32강 진출 경우의 수 통합 페이지 (한국 외 모든 조) — 조 4팀 각각 현재 상황 + 다음 경기 결과별 진출 판정
  // 승점 동률 시 순위 결정 규칙 팝업(FIFA 2026 타이브레이커)
  function tieRulePopup() {
    var ov = document.createElement("div"); ov.className = "tie-pop-bg";
    ov.innerHTML = '<div class="tie-pop"><div class="tie-pop-h">⚖️ 승점 동률 시 순위 결정</div>' +
      '<div class="tie-pop-sub">조별리그에서 2팀 이상 승점이 같으면 아래 순서로 순위를 가립니다.</div>' +
      '<div class="tie-step"><b>1단계 · 승자승 (해당 팀들끼리)</b><ol><li>맞대결 승점</li><li>맞대결 골득실</li><li>맞대결 총 득점</li></ol></div>' +
      '<div class="tie-step"><b>2단계 · 전체 조별리그 성적</b><ol><li>전체 골득실</li><li>전체 총 득점</li><li>페어플레이 점수(경고·퇴장)</li></ol></div>' +
      '<div class="tie-step"><b>3단계</b><ol><li>그래도 동률이면 최신 FIFA 랭킹</li></ol></div>' +
      '<button class="tie-pop-x">닫기</button></div>';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".tie-pop-x")) { if (ktModalClose) history.back(); else close(); } });
    document.body.appendChild(ov);
    ktModalOpen(close);  // 뒤로가기 시 팝업이 닫히도록
  }
  function renderGroupScenario(group) {
    setTabbar(""); backBtn.hidden = false; tabsEl.hidden = true;
    if (!DATA.groups || !group) { viewEl.innerHTML = '<div class="empty">데이터를 불러오는 중입니다.</div>'; return; }
    fetchStandings();
    var g = DATA.groups.filter(function (x) { return x.group === group; })[0];
    if (!g) { viewEl.innerHTML = '<div class="empty">조를 찾을 수 없어요.</div>'; return; }
    var gids = g.teamIds || [];
    var allFx = (DATA.fixtures || []).filter(function (f) { return gids.indexOf(f.homeId) >= 0 && gids.indexOf(f.awayId) >= 0; });
    var remaining = allFx.filter(function (f) { return !matchEnded(f); });
    if (!remaining.length && kr32Active()) { try { history.replaceState(null, "", "#kr32"); } catch (e) {} return renderKr32(); }  // 조별 끝난 조의 경우의수는 의미 없음 → '한국이 32강 가려면?'로 이동
    var html = '<div class="sec-h">🧮 ' + esc(group) + "조 32강 진출 경우의 수</div>";
    html += '<div class="scn-note">2026 월드컵: 각 조 <b>1·2위 직행</b> + 12개 조 <b>3위 중 상위 8팀</b> 진출.</div>';
    if (group === "B") html += '<div class="gsc-krhint">🇰🇷 B조 <b>2위</b>는 32강 73경기에서 <b>한국</b>(A조 2위 통과 시)과 맞붙어요 — 누가 1위·2위로 직행하는지가 한국의 상대를 결정!</div>';
    if (!Object.keys(STAND).length) { viewEl.innerHTML = html + '<div class="muted-note">순위를 불러오는 중…</div>'; return; }
    var cur = gids.map(function (id) { return { id: id, t: teamsById[id], s: scnStats(id) }; }).sort(scnCmp);
    html += '<div class="scn-mini-wrap"><div class="scn-mini-h">🏆 현재 ' + esc(group) + "조 순위</div>" + standTableHTML(cur) + "</div>";

    function vd(rr) {
      if (rr.mx <= 2) {  // 직행권(1·2위)
        if (rr.mn === rr.mx) return { t: "✅ " + rr.mn + "위 직행" + (group === "B" && rr.mn === 2 ? " 🇰🇷한국과 32강" : ""), c: "q12" };  // 순위 확정
        return { t: '✅ 1·2위 직행 <span class="tie-tag">승점 동률<span class="tie-q" data-tiehelp>?</span></span>', c: "q12" };  // 직행 확정, 1·2위만 골득실 등으로 갈림
      }
      return rr.mn >= 4 ? { t: "❌ 탈락 확정", c: "out" } : rr.mn <= 2 ? { t: "🟡 직행 가능 / 최소 3위 경쟁", c: "p3" } : (rr.mn >= 3 && rr.mx === 3) ? { t: "🟡 조 3위 (와일드카드 경쟁)", c: "p3" } : { t: "🟡 3위 또는 탈락", c: "p3" };
    }
    function teamFullRange(teamId) {  // 남은 경기 전체 조합 → 승점 기반 순위 범위(골득실 동률은 보수적)
      var combos = scnEnum(remaining), mn = 9, mx = 0;
      combos.forEach(function (c) { var picks = {}; remaining.forEach(function (f, i) { picks[f.id] = c[i]; }); var rr = scnRankRange(teamId, gids, remaining, picks); mn = Math.min(mn, rr.best); mx = Math.max(mx, rr.worst); });
      return { mn: mn, mx: mx };
    }
    function teamOut(fx, teamId, res) { var home = fx.homeId === teamId; return res === "win" ? (home ? "h" : "a") : res === "loss" ? (home ? "a" : "h") : "d"; }
    function rrngNext(teamId, nextFx, res) {  // 그 팀 다음 경기 결과 고정 + 나머지 조합 → 승점 기반 범위
      var others = remaining.filter(function (f) { return f !== nextFx; });
      var combos = scnEnum(others), mn = 9, mx = 0;
      combos.forEach(function (c) { var picks = {}; picks[nextFx.id] = teamOut(nextFx, teamId, res); others.forEach(function (f, i) { picks[f.id] = c[i]; }); var rr = scnRankRange(teamId, gids, remaining, picks); mn = Math.min(mn, rr.best); mx = Math.max(mx, rr.worst); });
      return { mn: mn, mx: mx };
    }
    // 동시에 열리는 같은 조 다른 경기 결과별 분기(누가 누굴 이기면 → 직행/3위/탈락). 다른 경기가 1개일 때만(보통 3라운드).
    function branchLine(teamId, nextFx, res) {
      var others = remaining.filter(function (f) { return f !== nextFx; });
      if (others.length !== 1) return "";
      var of = others[0], oh = teamsById[of.homeId] || {}, oa = teamsById[of.awayId] || {};
      var rows = [["h", esc(oh.name || "") + " 승"], ["d", "무"], ["a", esc(oa.name || "") + " 승"]].map(function (oc) {
        var picks = {}; picks[nextFx.id] = teamOut(nextFx, teamId, res); picks[of.id] = oc[0];
        var rr = scnRankRange(teamId, gids, remaining, picks);
        var lab, cls;
        if (rr.worst <= 2) { lab = (rr.best === rr.worst) ? (rr.best + "위") : "1·2위"; cls = "q"; }  // 직행이어도 1위 확정/1·2위 미정 구분
        else if (rr.best >= 4) { lab = "탈락"; cls = "o"; }
        else if (rr.best === rr.worst) { lab = rr.best + "위"; cls = rr.best <= 2 ? "q" : rr.best === 3 ? "p" : "o"; }
        else if (rr.best <= 2 && rr.worst === 3) { lab = "직행/3위"; cls = "p"; }  // 골득실 따라
        else { lab = "3위/탈락"; cls = "p"; }
        return { txt: oc[1], lab: lab, cls: cls };
      });
      var uniq = {}; rows.forEach(function (r) { uniq[r.lab] = 1; });
      if (Object.keys(uniq).length <= 1) return "";  // 다른 경기 결과와 무관하게 내 순위가 같으면 분기 의미 없음 → 숨김
      return '<div class="gsc-branch">└ ' + rows.map(function (r) { return r.txt + "→<b class=\"" + r.cls + "\">" + r.lab + "</b>"; }).join(" / ") + "</div>";
    }

    cur.forEach(function (row, i) {
      var t = row.t || {}, s = row.s;
      var nextFx = remaining.filter(function (f) { return f.homeId === row.id || f.awayId === row.id; })[0];
      var overall = nextFx ? vd(teamFullRange(row.id)) : null;
      html += '<div class="gsc-card ' + (overall ? overall.c : "q12") + '">' +
        '<div class="gsc-head"><span class="gsc-rank">' + (i + 1) + "위</span>" + esc(t.flag || "") + ' <b>' + esc(t.name || row.id) + "</b>" +
        '<span class="gsc-pts">승점 ' + s.pts + " · 득실 " + (s.gd > 0 ? "+" : "") + s.gd + "</span></div>";
      if (!nextFx) {
        html += '<div class="gsc-done">조별리그 종료</div>';
      } else {
        var op = teamsById[nextFx.homeId === row.id ? nextFx.awayId : nextFx.homeId] || {};
        html += '<div class="gsc-next muted-note">다음 상대: ' + esc(op.flag || "") + " " + esc(op.name || "") + "</div>";  /* 종합판정 줄(gsc-verdict)은 혼란 방지로 제거 — 승/무/패별 결과로 충분 */
        html += '<div class="gsc-lines">';
        [["win", "승"], ["draw", "무"], ["loss", "패"]].forEach(function (kv) {
          var rr = rrngNext(row.id, nextFx, kv[0]), v = vd(rr);
          html += '<div class="gsc-line"><span class="gscl-r">' + kv[1] + '</span><span class="gscl-v ' + v.c + '">' + v.t + "</span></div>";
          html += branchLine(row.id, nextFx, kv[0]);  // 다른 경기 결과로 순위가 갈릴 때만 표시(1·2위 미정 포함). 내부에서 uniq<=1이면 숨김
        });
        html += "</div>";
      }
      html += "</div>";
    });
    html += '<div class="muted-note" style="font-size:11px;margin-top:8px">※ 같은 조 남은 경기 결과 조합을 모두 계산 · 3위는 12개 조 3위 비교라 다른 조 결과에 따라 달라질 수 있어요(추정).</div>';
    viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
    twem(viewEl);
    insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");
  }

  // ===================== 🇰🇷 한국이 32강 가려면? (3위 와일드카드 — 사진 기반 9개 조건) =====================
  // 한국은 A조 3위 확정. 12개 조 3위 중 상위 8팀이 32강 진출. 아래 9개는 "한국에 유리한 3차전 시나리오"(제공 이미지)
  // 그대로 — 우리가 계산하는 게 아니라 사진 기준. 실제 스코어(resultOf)로 ✅성공/❌실패/⏳진행중만 자동 판정.
  // 9개 중 3개 성공 시 진출. 조건/득실차 기준은 제공 이미지(한국 32강 경우의 수) 그대로 반영. 실제 스코어로 자동 판정.
  function kr32res(mid) { var fx = fixturesById[mid]; return fx ? resultOf(fx) : null; }  // {hs,as}|null(미종료)
  function kr32goals(mid, teamId) { var fx = fixturesById[mid], r = fx && resultOf(fx); if (!fx || !r) return null; return fx.homeId === teamId ? { gf: r.hs, ga: r.as } : { gf: r.as, ga: r.hs }; }
  var KR32 = [
    { group: "D", mids: ["match-24"], teams: ["australia", "paraguay"], desc: "호주 승 또는 파라과이 2골차 이상 승",
      ev: function () { var au = kr32goals("match-24", "australia"); if (!au) return "pending"; if (au.gf > au.ga) return "success"; var pa = kr32goals("match-24", "paraguay"); return (pa.gf - pa.ga >= 2) ? "success" : "fail"; } },
    { group: "E", mids: ["match-30", "match-29"], teams: ["ecuador", "curacao"], desc: "에콰도르·퀴라소 둘 다 승리 X",
      ev: function () { var ec = kr32goals("match-30", "ecuador"), cu = kr32goals("match-29", "curacao"); if ((ec && ec.gf > ec.ga) || (cu && cu.gf > cu.ga)) return "fail"; return (ec && cu) ? "success" : "pending"; } },
    { group: "F", mids: ["match-35"], teams: ["japan", "sweden"], desc: "일본이 스웨덴에 2골차 이상 승",
      ev: function () { var jp = kr32goals("match-35", "japan"); if (!jp) return "pending"; return (jp.gf - jp.ga >= 2) ? "success" : "fail"; } },
    { group: "G", mids: ["match-41"], teams: ["egypt", "iran"], desc: "이집트 승 (무승부 안 됨)",
      ev: function () { var eg = kr32goals("match-41", "egypt"); if (!eg) return "pending"; return (eg.gf > eg.ga) ? "success" : "fail"; } },
    { group: "H", mids: ["match-48"], teams: ["spain", "uruguay"], desc: "스페인 승 (무승부 안 됨)",
      ev: function () { var sp = kr32goals("match-48", "spain"); if (!sp) return "pending"; return (sp.gf > sp.ga) ? "success" : "fail"; } },
    { group: "I", mids: ["match-54"], teams: ["senegal", "iraq"], desc: "무승부 · 세네갈 1골차 승 · 이라크 4골차 이하 승",
      ev: function () { var se = kr32goals("match-54", "senegal"); if (!se) return "pending"; var d = se.gf - se.ga; if (d === 0) return "success"; if (d > 0) return d <= 1 ? "success" : "fail"; return (-d) <= 4 ? "success" : "fail"; } },
    { group: "J", mids: ["match-59"], teams: ["austria", "algeria"], desc: "오스트리아 승 또는 알제리 2골차 이상 승",
      ev: function () { var au = kr32goals("match-59", "austria"); if (!au) return "pending"; if (au.gf > au.ga) return "success"; var al = kr32goals("match-59", "algeria"); return (al.gf - al.ga >= 2) ? "success" : "fail"; } },
    { group: "K", mids: ["match-66"], teams: ["dr-congo", "uzbekistan"], desc: "무승부 또는 우즈벡 6골차 이하 승",
      ev: function () { var uz = kr32goals("match-66", "uzbekistan"); if (!uz) return "pending"; var d = uz.gf - uz.ga; if (d === 0) return "success"; return (d > 0 && d <= 6) ? "success" : "fail"; } },
    { group: "L", mids: ["match-72"], teams: ["ghana", "croatia"], desc: "가나 승 (무승부 안 됨)",
      ev: function () { var gh = kr32goals("match-72", "ghana"); if (!gh) return "pending"; return (gh.gf > gh.ga) ? "success" : "fail"; } }
  ];
  var KR32_NEED = 3;
  function kr32Eval() {
    var conds = KR32.map(function (c) { return { c: c, st: c.ev() }; });
    var s = conds.filter(function (x) { return x.st === "success"; }).length;
    var f = conds.filter(function (x) { return x.st === "fail"; }).length;
    var p = conds.filter(function (x) { return x.st === "pending"; }).length;
    return { conds: conds, success: s, fail: f, pending: p, verdict: s >= KR32_NEED ? "in" : (s + p < KR32_NEED ? "out" : "live") };
  }
  function kr32Lab(st) { return st === "success" ? "✅ 성공" : st === "fail" ? "❌ 실패" : "⏳ 진행중"; }
  // 한국 조별리그 종료(=3위 확정 와일드카드 국면)일 때만 노출
  function kr32Active() {
    var krFx = (DATA.fixtures || []).filter(isKoreaFx).filter(function (f) { return f.group; });
    return krFx.length > 0 && krFx.every(matchEnded);
  }
  // 메인 히어로용 한 줄 요약 배너 (D-day 자리 대체)
  function kr32BannerHtml() {
    var ev = kr32Eval();
    var txt = ev.verdict === "in" ? "🎉 한국 32강 진출 확정! (" + ev.success + "/" + KR32_NEED + ")"
      : ev.verdict === "out" ? "😢 한국 32강 무산"
      : "🇰🇷 한국 32강 가려면? · 성공 " + ev.success + "/" + KR32_NEED + " (⏳" + ev.pending + ")";
    return '<div class="hb-dday kr32-banner ' + ev.verdict + ' clickable" data-kr32go>' + txt + " ›</div>";
  }
  // 12개 조 3위 와일드카드 진출 '확정/탈락' 판정. 조가 끝난(3위 확정) 팀만 in/out 판정, 진행중 조의 3위는 'live'(미확정).
  // 안전(보수)판정: 다른 조 3위가 '위로 올라갈 가능성'을 worst-case로 세어 8위 밖 불가 → 확정 / 최선의 경우에도 8위 밖 → 탈락. 동점은 골득실로 역전 가능하다고 보수적으로 처리.
  function kr32Clinch() {
    var groups = DATA.groups || [];
    if (!groups.length || !Object.keys(STAND).length) return {};
    function gInfo(g) {
      var gids = g.teamIds || [];
      var allFx = (DATA.fixtures || []).filter(function (f) { return gids.indexOf(f.homeId) >= 0 && gids.indexOf(f.awayId) >= 0; });
      var remaining = allFx.filter(function (f) { return !matchEnded(f); });
      var rows = gids.map(function (id) { return { id: id, t: teamsById[id], s: scnStats(id) }; }).sort(scnCmp);
      return { gids: gids, remaining: remaining, third: rows[2], done: remaining.length === 0 };
    }
    var infos = {}; groups.forEach(function (g) { infos[g.group] = gInfo(g); });
    function thirdPtsRange(gi) {  // 조 3위팀이 가질 수 있는 최종 승점 범위(남은 경기 모든 조합)
      if (gi.done) { var p = gi.third ? gi.third.s.pts : 0; return { min: p, max: p }; }
      var combos = scnEnum(gi.remaining), mn = 99, mx = -1;
      combos.forEach(function (c) {
        var picks = {}; gi.remaining.forEach(function (f, i) { picks[f.id] = c[i]; });
        var pts = scnPtsAfter(gi.gids, gi.remaining, picks);
        var arr = gi.gids.map(function (id) { return pts[id]; }).sort(function (a, b) { return b - a; });
        var third = arr[2] || 0; if (third < mn) mn = third; if (third > mx) mx = third;
      });
      return { min: mn, max: mx };
    }
    var ranges = {}; groups.forEach(function (g) { ranges[g.group] = thirdPtsRange(infos[g.group]); });
    var out = {};
    groups.forEach(function (g) {
      var gi = infos[g.group];
      if (!gi.done || !gi.third) { out[g.group] = "live"; return; }
      var T = gi.third.s, P = T.pts, worstAbove = 0, bestAbove = 0;
      groups.forEach(function (g2) {
        if (g2.group === g.group) return;
        var gi2 = infos[g2.group], r2 = ranges[g2.group];
        if (gi2.done) {
          var C = gi2.third.s;
          var above = C.pts > P || (C.pts === P && (C.gd > T.gd || (C.gd === T.gd && C.gf > T.gf)));
          if (above) { worstAbove++; bestAbove++; }
        } else {
          if (r2.max >= P) worstAbove++;   // 동점 가능 → 골득실로 역전 가능(보수적으로 위)
          if (r2.min > P) bestAbove++;      // 최악(그 조 입장 약체)에도 T보다 승점 높음 → 무조건 위
        }
      });
      out[g.group] = worstAbove <= 7 ? "in" : (bestAbove >= 8 ? "out" : "contest");
    });
    return out;
  }
  // '실시간 3위 팀 순위' 섹션(헤더+한국안내+표) — 32강 페이지·조별탭 공용. 진출확정/탈락/경합 뱃지 + 2경기 진행중 흐림.
  function kr32ThirdSectionHtml() {
    if (!Object.keys(STAND).length) return "";
    var thirds = [];
    (DATA.groups || []).forEach(function (g) {
      var rows = (g.teamIds || []).map(function (id) { return { id: id, t: teamsById[id], s: scnStats(id) }; }).sort(scnCmp);
      if (rows[2]) thirds.push({ g: g.group, r: rows[2] });
    });
    thirds.sort(function (a, b) { return scnCmp(a.r, b.r); });
    if (!thirds.length) return "";
    var clinch = kr32Clinch();
    thirds.forEach(function (o) { o.clinch = clinch[o.g]; });
    var nDone = 0; thirds.forEach(function (o) { if (o.clinch === "in") nDone++; });
    var krTi = thirds.map(function (o) { return o.r.id; }).indexOf(KR) + 1;
    var krCl = clinch[(teamsById[KR] || {}).group];
    var krNote = krCl === "in" ? "🎉 한국 32강 진출 <b>확정!</b> (어떤 경우의 수에도 8위 이내)"
      : krCl === "out" ? "😢 한국 32강 진출 <b>무산</b> (어떤 경우에도 8위 밖)"
      : krTi ? "🇰🇷 한국은 현재 3위 팀 중 <b>" + krTi + "위</b> · " + (krTi <= 8 ? "진출권(8위 이내) — 아직 확정은 아님" : "진출권 밖 (8위 밖)") + ", 남은 경기로 변동"
      : "";
    return '<div class="kr32-third"><div class="scn-mini-h">🥉 실시간 3위 팀 순위 <span class="muted-note">상위 8팀 진출 · 확정 ' + nDone + "팀</span></div>" +
      (krNote ? '<div class="kr32-third-note ' + (krCl || "") + '">' + krNote + "</div>" : "") +
      standTableHTML(thirds, { group: true, thirds: true, markProvisional: true, clinch: true }) + "</div>";
  }
  function renderKr32() {
    setTabbar(""); backBtn.hidden = false; tabsEl.hidden = true;
    fetchStandings();
    var ev = kr32Eval();
    var head = ev.verdict === "in" ? "🎉 32강 진출 확정! (" + ev.success + "개 성공)"
      : ev.verdict === "out" ? "😢 남은 조건으로 3개 불가 — 진출 무산"
      : "⚔️ 9개 중 3개 성공 시 진출 · 현재 " + ev.success + "개 성공";
    var hcls = ev.verdict === "in" ? "q12" : ev.verdict === "out" ? "out" : "p3";
    var html = '<div class="adslot ad-top"></div><div class="sec-h">🇰🇷 한국이 32강 가려면?</div>';
    html += '<div class="scn-note">한국은 <b>A조 3위 확정</b>. 12개 조 3위 중 <b>상위 8팀</b>이 32강. 아래 <b>9개 조건 중 3개</b>가 성공하면 진출!</div>';
    html += '<div class="kr32-head ' + hcls + '">' + head + "</div>";
    html += '<div class="kr32-prog">✅ 성공 ' + ev.success + " · ❌ 실패 " + ev.fail + " · ⏳ 진행중 " + ev.pending + "</div>";
    html += '<div class="kr32-grid">';
    ev.conds.forEach(function (x) {
      var c = x.c, flags = c.teams.map(function (t) { return (teamsById[t] || {}).flag || ""; }).join(" ");
      html += '<div class="kr32-card ' + x.st + '" data-match="' + esc(c.mids[0]) + '">' +
        '<div class="kr32-c-top"><span class="kr32-grp">' + esc(c.group) + '조</span><span class="kr32-flags">' + flags + '</span><span class="kr32-st ' + x.st + '">' + kr32Lab(x.st) + "</span></div>" +
        '<div class="kr32-desc">' + esc(c.desc) + "</div>" +
        '<div class="kr32-go muted-note">경기 상세 보기 ›</div>' +
        "</div>";
    });
    html += "</div>";
    html += kr32ThirdSectionHtml();  // 실시간 3위 팀 순위(진출확정/탈락/경합)
    html += '<div class="muted-note" style="font-size:11px;margin-top:8px">※ 한국에 유리한 3차전 각 조 시나리오 기준 · 실제 결과로 자동 갱신.</div>';
    viewEl.innerHTML = html + '<div class="adslot ad-bot"></div>';
    twem(viewEl);
    insertAdFit(viewEl.querySelector(".ad-top"));  // 맨위 320x100
    insertAdFit(viewEl.querySelector(".ad-bot"), "DAN-SWWhds5NegoTMohB", "320", "50");  // 맨밑 320x50
  }
  // 경기상세용: 그 조에 한국 32강 조건이 걸려 있으면 조건+상태 표시(D~L조). 한국과 무관한 조(A·B·C)는 미표시.
  function kr32MatchBlock(fx) {
    if (!fx || !fx.group || !kr32Active()) return "";
    var c = KR32.filter(function (x) { return x.group === fx.group; })[0];
    if (!c) return "";
    var st = c.ev();
    return '<div class="block kr32-mblock ' + st + '" data-kr32go>' +
      "<h3>🇰🇷 한국 32강 조건 · " + esc(c.group) + "조</h3>" +
      '<div class="kr32-mb-row"><span class="kr32-mb-desc">' + esc(c.desc) + '</span><span class="kr32-st ' + st + '">' + kr32Lab(st) + "</span></div>" +
      '<div class="kr32-mb-foot muted-note">이 조건이 성공해야 한국에 유리 · 전체 9개 보기 ›</div>' +
      "</div>";
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
          '<div class="team-rank"><span class="tr-fifa" data-fifago>FIFA ' + esc(t.fifaRank) + "위 ›</span> · " + esc(t.group) + "조</div></div></div>";
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
  // 한국 32강 경우의 수 공유 카드(캔버스) — 헤드라인 + 한 줄 요약. 커뮤니티 시딩용 떡밥 이미지.
  var _scnShareData = null;
  function scenarioCardCanvas(d) {
    var rows = d.summary || [], W = 720, H = rows.length ? 430 + rows.length * 58 + 90 : 380;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var c = cv.getContext("2d");
    var light = document.documentElement.classList.contains("light");
    var C = light ? { b1: "#ffffff", b2: "#eef2f8", b3: "#e1e8f3", name: "#1c2536", sub: "#62718c", acc: "#2f6fe0", card: "#f4f7fc", line: "#dde5f0", barTxt: "#ffffff" }
                  : { b1: "#1b2d60", b2: "#0c1530", b3: "#070d18", name: "#eaf0fb", sub: "#9fb0cc", acc: "#4f8cff", card: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.12)", barTxt: "#0a1020" };
    var headCol = d.headCls === "q12" ? (light ? "#16a34a" : "#34d399") : d.headCls === "out" ? "#ef4444" : "#f5b301";
    var bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, C.b1); bg.addColorStop(.55, C.b2); bg.addColorStop(1, C.b3); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.textAlign = "left"; c.fillStyle = C.name; c.font = "900 30px -apple-system,sans-serif"; c.fillText("KICKTALK", 40, 60);
    c.fillStyle = C.acc; c.font = "bold 19px -apple-system,sans-serif"; c.fillText("2026 월드컵 · 한국 32강 경우의 수", 205, 58);
    // 국기 + 현재 상황
    c.textAlign = "left"; c.font = "54px -apple-system,sans-serif"; c.fillText("🇰🇷", 40, 150);
    c.fillStyle = C.name; c.font = "900 46px -apple-system,sans-serif"; c.fillText("대한민국", 120, 142);
    c.fillStyle = C.sub; c.font = "600 22px -apple-system,sans-serif"; c.fillText(d.cur, 42, 196);
    // 헤드라인 박스
    rr(c, 40, 222, W - 80, 76, 18); c.fillStyle = hexA(headCol, light ? .12 : .16); c.fill(); c.strokeStyle = headCol; c.lineWidth = 2; c.stroke();
    c.textAlign = "center"; c.fillStyle = headCol; c.font = "900 30px -apple-system,sans-serif"; c.fillText(String(d.head).slice(0, 22), W / 2, 270);
    // 한 줄 요약
    if (rows.length) { c.textAlign = "left"; c.fillStyle = C.name; c.font = "bold 22px -apple-system,sans-serif"; c.fillText("📌 " + d.oppName + "전 결과별", 42, 348); }
    var y = 372;
    rows.forEach(function (r) {
      rr(c, 40, y, W - 80, 46, 12); c.fillStyle = C.card; c.fill(); c.strokeStyle = C.line; c.lineWidth = 1; c.stroke();
      c.textAlign = "left"; c.fillStyle = C.name; c.font = "bold 21px -apple-system,sans-serif"; c.fillText(r.label, 58, y + 30);
      c.textAlign = "right"; c.fillStyle = r.q ? (light ? "#16a34a" : "#34d399") : r.out ? "#ef4444" : "#f5b301"; c.font = "bold 20px -apple-system,sans-serif"; c.fillText(r.verdict, W - 58, y + 30);
      y += 58;
    });
    rr(c, 40, H - 70, W - 80, 50, 25); c.fillStyle = C.acc; c.fill();
    c.textAlign = "center"; c.fillStyle = C.barTxt; c.font = "900 23px -apple-system,sans-serif"; c.fillText("kicktalk.xyz · 한국 진출 경우의 수 자세히 보기", W / 2, H - 37);
    return cv;
  }
  function shareScenario() {
    var d = _scnShareData;
    var url = "https://kicktalk.xyz/#scenario";
    var txt = "🇰🇷 " + (d ? d.head : "한국 32강 경우의 수") + " — 킥톡에서 확인\n" + url;
    if (!d) { if (navigator.share) navigator.share({ text: txt, url: url }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { ktToast("🔗 링크 복사됨!"); }); return; }
    scenarioCardCanvas(d).toBlob(function (blob) {
      if (!blob) { if (navigator.share) navigator.share({ text: txt, url: url }).catch(function () {}); return; }
      var fname = "korea-32-kicktalk.png";
      try { var file = new File([blob], fname, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "한국 32강 경우의 수", text: txt, url: url }).catch(function () {}); return; } } catch (e) {}
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { ktToast("🖼️ 이미지 저장 + 🔗 링크 복사됨"); }).catch(function () {});
    }, "image/png");
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
    if (SPOILER_ON) return;  // 스포일러 방지: 이번 월드컵 출전·득점(결과) 미반영
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
  (function(){ if(!window.fetch) return; fetch("https://kicktalk.xyz/bio.json?b=2").then(function(r){return r.json();}).then(function(d){ if(d) Object.assign(PLAYER_BIO, d); var h=parseHash(); if(h.name==="player"&&h.id) renderPlayer(h.id); }).catch(function(){}); })();
  // 골키퍼 국가대표 실점·무실점 — gk.json(나무위키 등 정확 소스 수집). {pid:{g:경기,c:실점,cs:무실점}}
  var PLAYER_GK = {};
  (function(){ if(!window.fetch) return; fetch("https://kicktalk.xyz/gk.json?b=1").then(function(r){return r.json();}).then(function(d){ if(d) Object.assign(PLAYER_GK, d); var h=parseHash(); if(h.name==="player"&&h.id) renderPlayer(h.id); }).catch(function(){}); })();
  // 역대 소속팀(연도별) — 주요선수(ovr 상위)만. careers.json(위키피디아 실제 이력 수집). {pid:[{years,club,loan}]}
  var PLAYER_CAREER = {};
  (function(){ if(!window.fetch) return; fetch("https://kicktalk.xyz/careers.json?b=1").then(function(r){return r.json();}).then(function(d){ if(d) Object.assign(PLAYER_CAREER, d); var h=parseHash(); if(h.name==="player"&&h.id) renderPlayer(h.id); }).catch(function(){}); })();
  // FIFA 랭킹 — fifa.json(scripts/update_fifa.js가 2h마다 갱신)에서 런타임 로드 → 토스도 재빌드 없이 최신 랭킹 반영.
  var FIFA_TS = 0;  // FIFA 랭킹 갱신 시각(fifa.json _ts)
  (function(){ if(!window.fetch) return; fetch("https://kicktalk.xyz/fifa.json?b="+Date.now()).then(function(r){return r.json();}).then(function(d){ if(!d) return; if(d._ts) FIFA_TS=d._ts; if(Array.isArray(d._all)) FIFA_ALL=d._all; var ch=false; DATA.teams.forEach(function(t){ var e=d[t.id]; if(e==null) return; var r=(typeof e==="object")?e.r:e; if(r!=null && t.fifaRank!==r){ t.fifaRank=r; ch=true; } if(typeof e==="object"){ t.fifaPts=e.p; t.fifaCh=e.ch; t.fifaChR=e.chR; } }); var h=parseHash(); if((ch||FIFA_TS||FIFA_ALL.length) && (h.name==="home"||h.name==="team"||h.name==="fifa")) route(); }).catch(function(){}); })();
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

    var powerHtml = p.power ? (powerRadar(p.power) + (IS_TOSS ? "" : '<button class="share-card" data-share-card="' + esc(p.id) + '">📤 능력치 카드 이미지로 공유</button>') + '<button class="cmp-go" data-cmp-go="' + esc(p.id) + '">⚖️ 다른 선수와 능력치 비교</button>') : "";  /* 토스는 외부 공유 숨김 */
    var strengths = (p.strengths || []).map(function (s) { return '<span class="tag">' + esc(s) + "</span>"; }).join("");
    var weaknesses = (p.weaknesses || []).map(function (s) { return '<span class="tag weak">' + esc(s) + "</span>"; }).join("");

    // 커리어 타임라인 — 역대 소속팀(주요선수, careers.json) + honours + 이적을 한 타임라인에 최신순으로 섞음.
    var career = PLAYER_CAREER[p.id];
    var tlItems = [];
    (career || []).forEach(function (c) {
      var yss = (c.years || "").match(/\b(?:19|20)\d{2}\b/g);
      var ongoing = /[–\-]\s*$/.test(c.years || "");  // "2024–" 진행중
      var yr = ongoing ? 9999 : (yss ? Math.max.apply(null, yss.map(Number)) : 0);
      var yLabel = ongoing ? "현재" : (yss ? yss[yss.length - 1] : "");
      tlItems.push({ yr: yr, kind: "club", yLabel: yLabel,
        html: "<b>" + esc(c.club || "") + "</b>" + (c.loan ? ' <span class="career-loan">임대</span>' : "") + ' <span class="muted-note">' + esc(c.years || "") + "</span>" });
    });
    (p.honours || []).forEach(function (h) { var ys = h.match(/\b(?:19|20)\d{2}\b/g); tlItems.push({ yr: ys ? Math.max.apply(null, ys.map(Number)) : 0, kind: "hon", yLabel: ys ? Math.max.apply(null, ys.map(Number)) : "", html: esc(h) }); });
    if (p.notableTransfer) { var yst = p.notableTransfer.match(/\b(?:19|20)\d{2}\b/g); tlItems.push({ yr: yst ? Math.max.apply(null, yst.map(Number)) : 0, kind: "hon", yLabel: yst ? Math.max.apply(null, yst.map(Number)) : "", html: esc(p.notableTransfer) }); }
    tlItems.sort(function (a, b) { return b.yr - a.yr; });  // 최신이 맨 위
    var timeline = tlItems.map(function (o) {
      return '<div class="tl-item' + (o.kind === "club" ? " tl-club" : "") + '"><span class="tl-year">' + (o.yLabel || "") + '</span><span class="tl-dot' + (o.kind === "club" ? " cl" : "") + '"></span>' +
        '<span class="tl-text">' + o.html + "</span></div>";
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
      var oppNm = opp ? (esc(opp.flag) + " " + esc(shortTeamName(opp.id, opp.name))) : esc((f.homeId === t.id ? f.awayName : f.homeName) || "미정");
      var when = esc(shortDate(fxDate(f)) + (fxTime(f) ? " " + shortTime(fxTime(f)) : ""));  // 6/12 10시 (조 표기 제거, 년도 제거)
      var lv = lvOf(f.id), live = !!(lv && lv.state === "in"), ended = !SPOILER_ON && matchEnded(f);
      var hasScore = !!(lv && (lv.state === "in" || lv.state === "post") && lv.hs != null);
      var badge;
      if (hasScore) {  // 종료/진행 경기는 우리팀 기준 스코어 표시(승=초록·무=회색·패=빨강)
        var myS = (f.homeId === t.id) ? lv.hs : lv.as, opS = (f.homeId === t.id) ? lv.as : lv.hs;
        var rcls = live ? "live" : (myS > opS ? "win" : myS < opS ? "lose" : "draw");
        badge = ' <span class="ts-score ' + rcls + '">' + (myS | 0) + " : " + (opS | 0) + (live ? " <b>LIVE</b>" : "") + "</span>";
      } else { badge = live ? ' <span class="ts-live">🔴 LIVE</span>' : ended ? ' <span class="ts-done">종료</span>' : ""; }
      return '<div class="ts-row' + (ended ? " past" : "") + '" data-match="' + esc(f.id) + '"><div class="ts-opp">🆚 ' + oppNm + badge + '</div><div class="ts-when">' + when + "</div></div>";
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
  // 역대 월드컵 전적(팩트, 1930~2022 각 대회 결과 [연도,단계]). 첫 본선국(2026 데뷔)=빈 배열. czech=체코슬로바키아 포함, dr-congo 1974=자이르, germany=서독 포함.
  var WC_ALL = {
    "mexico": [["1930","조별리그"],["1950","조별리그"],["1954","조별리그"],["1958","조별리그"],["1962","조별리그"],["1966","조별리그"],["1970","8강"],["1978","조별리그"],["1986","8강"],["1994","16강"],["1998","16강"],["2002","16강"],["2006","16강"],["2010","16강"],["2014","16강"],["2018","16강"],["2022","조별리그"]],
    "south-africa": [["1998","조별리그"],["2002","조별리그"],["2010","조별리그"]],
    "south-korea": [["1954","조별리그"],["1986","조별리그"],["1990","조별리그"],["1994","조별리그"],["1998","조별리그"],["2002","4강"],["2006","조별리그"],["2010","16강"],["2014","조별리그"],["2018","조별리그"],["2022","16강"]],
    "czech-republic": [["1934","준우승"],["1938","8강"],["1954","조별리그"],["1958","조별리그"],["1962","준우승"],["1970","조별리그"],["1982","조별리그"],["1990","8강"],["2006","조별리그"]],
    "canada": [["1986","조별리그"],["2022","조별리그"]],
    "bosnia-and-herzegovina": [["2014","조별리그"]],
    "qatar": [["2022","조별리그"]],
    "switzerland": [["1934","8강"],["1938","8강"],["1950","조별리그"],["1954","8강"],["1962","조별리그"],["1966","조별리그"],["1994","16강"],["2006","16강"],["2010","조별리그"],["2014","16강"],["2018","16강"],["2022","16강"]],
    "brazil": [["1930","조별리그"],["1934","16강"],["1938","4강"],["1950","준우승"],["1954","8강"],["1958","우승"],["1962","우승"],["1966","조별리그"],["1970","우승"],["1974","4강"],["1978","4강"],["1982","8강"],["1986","8강"],["1990","16강"],["1994","우승"],["1998","준우승"],["2002","우승"],["2006","8강"],["2010","8강"],["2014","4강"],["2018","8강"],["2022","8강"]],
    "morocco": [["1970","조별리그"],["1986","16강"],["1994","조별리그"],["1998","조별리그"],["2018","조별리그"],["2022","4강"]],
    "haiti": [["1974","조별리그"]],
    "scotland": [["1954","조별리그"],["1958","조별리그"],["1974","조별리그"],["1978","조별리그"],["1982","조별리그"],["1986","조별리그"],["1990","조별리그"],["1998","조별리그"]],
    "united-states": [["1930","4강"],["1934","16강"],["1950","조별리그"],["1990","조별리그"],["1994","16강"],["1998","조별리그"],["2002","8강"],["2006","조별리그"],["2010","16강"],["2014","16강"],["2022","16강"]],
    "paraguay": [["1930","조별리그"],["1950","조별리그"],["1958","조별리그"],["1986","16강"],["1998","16강"],["2002","16강"],["2006","조별리그"],["2010","8강"]],
    "australia": [["1974","조별리그"],["2006","16강"],["2010","조별리그"],["2014","조별리그"],["2018","조별리그"],["2022","16강"]],
    "turkey": [["1954","조별리그"],["2002","4강"]],
    "germany": [["1934","4강"],["1938","16강"],["1954","우승"],["1958","4강"],["1962","8강"],["1966","준우승"],["1970","4강"],["1974","우승"],["1978","8강"],["1982","준우승"],["1986","준우승"],["1990","우승"],["1994","8강"],["1998","8강"],["2002","준우승"],["2006","4강"],["2010","4강"],["2014","우승"],["2018","조별리그"],["2022","조별리그"]],
    "curacao": [],
    "ivory-coast": [["2006","조별리그"],["2010","조별리그"],["2014","조별리그"]],
    "ecuador": [["2002","조별리그"],["2006","16강"],["2014","조별리그"],["2022","조별리그"]],
    "netherlands": [["1934","16강"],["1938","16강"],["1974","준우승"],["1978","준우승"],["1990","16강"],["1994","8강"],["1998","4강"],["2006","16강"],["2010","준우승"],["2014","4강"],["2022","8강"]],
    "japan": [["1998","조별리그"],["2002","16강"],["2006","조별리그"],["2010","16강"],["2014","조별리그"],["2018","16강"],["2022","16강"]],
    "sweden": [["1934","8강"],["1938","4강"],["1950","4강"],["1958","준우승"],["1970","조별리그"],["1974","8강"],["1978","조별리그"],["1990","조별리그"],["1994","4강"],["2002","16강"],["2006","16강"],["2018","8강"]],
    "tunisia": [["1978","조별리그"],["1998","조별리그"],["2002","조별리그"],["2006","조별리그"],["2018","조별리그"],["2022","조별리그"]],
    "belgium": [["1930","조별리그"],["1934","16강"],["1938","16강"],["1954","조별리그"],["1970","조별리그"],["1982","8강"],["1986","4강"],["1990","16강"],["1994","16강"],["1998","조별리그"],["2002","16강"],["2014","8강"],["2018","4강"],["2022","조별리그"]],
    "egypt": [["1934","16강"],["1990","조별리그"],["2018","조별리그"]],
    "iran": [["1978","조별리그"],["1998","조별리그"],["2006","조별리그"],["2014","조별리그"],["2018","조별리그"],["2022","조별리그"]],
    "new-zealand": [["1982","조별리그"],["2010","조별리그"]],
    "spain": [["1934","8강"],["1950","4강"],["1962","조별리그"],["1966","조별리그"],["1978","조별리그"],["1982","8강"],["1986","8강"],["1990","16강"],["1994","8강"],["1998","조별리그"],["2002","8강"],["2006","16강"],["2010","우승"],["2014","조별리그"],["2018","16강"],["2022","16강"]],
    "cape-verde": [],
    "saudi-arabia": [["1994","16강"],["1998","조별리그"],["2002","조별리그"],["2006","조별리그"],["2018","조별리그"],["2022","조별리그"]],
    "uruguay": [["1930","우승"],["1950","우승"],["1954","4강"],["1962","조별리그"],["1966","8강"],["1970","4강"],["1974","조별리그"],["1986","16강"],["1990","16강"],["2002","조별리그"],["2010","4강"],["2014","16강"],["2018","8강"],["2022","조별리그"]],
    "france": [["1930","조별리그"],["1934","16강"],["1938","8강"],["1954","조별리그"],["1958","4강"],["1966","조별리그"],["1978","조별리그"],["1982","4강"],["1986","4강"],["1998","우승"],["2002","조별리그"],["2006","준우승"],["2010","조별리그"],["2014","8강"],["2018","우승"],["2022","준우승"]],
    "senegal": [["2002","8강"],["2018","조별리그"],["2022","16강"]],
    "iraq": [["1986","조별리그"]],
    "norway": [["1938","16강"],["1994","조별리그"],["1998","16강"]],
    "argentina": [["1930","준우승"],["1934","16강"],["1958","조별리그"],["1962","조별리그"],["1966","8강"],["1974","8강"],["1978","우승"],["1982","8강"],["1986","우승"],["1990","준우승"],["1994","16강"],["1998","8강"],["2002","조별리그"],["2006","8강"],["2010","8강"],["2014","준우승"],["2018","16강"],["2022","우승"]],
    "algeria": [["1982","조별리그"],["1986","조별리그"],["2010","조별리그"],["2014","16강"]],
    "austria": [["1934","4강"],["1954","4강"],["1958","조별리그"],["1978","8강"],["1982","8강"],["1990","조별리그"],["1998","조별리그"]],
    "jordan": [],
    "portugal": [["1966","4강"],["1986","조별리그"],["2002","조별리그"],["2006","4강"],["2010","16강"],["2014","조별리그"],["2018","16강"],["2022","8강"]],
    "dr-congo": [["1974","조별리그"]],
    "uzbekistan": [],
    "colombia": [["1962","조별리그"],["1990","16강"],["1994","조별리그"],["1998","조별리그"],["2014","8강"],["2018","16강"]],
    "england": [["1950","조별리그"],["1954","8강"],["1958","조별리그"],["1962","8강"],["1966","우승"],["1970","8강"],["1982","8강"],["1986","8강"],["1990","4강"],["1998","16강"],["2002","8강"],["2006","8강"],["2010","16강"],["2014","조별리그"],["2018","4강"],["2022","8강"]],
    "croatia": [["1998","4강"],["2002","조별리그"],["2006","조별리그"],["2014","조별리그"],["2018","준우승"],["2022","4강"]],
    "ghana": [["2006","16강"],["2010","8강"],["2014","조별리그"],["2022","조별리그"]],
    "panama": [["2018","조별리그"]]
  };
  var WC_RANK = { "우승": 6, "준우승": 5, "4강": 4, "8강": 3, "16강": 2, "조별리그": 1 };
  var WC_NOTE = { "czech-republic": "1934~1990은 체코슬로바키아", "dr-congo": "1974는 자이르" };
  var WC_STAGE_CLS = { "우승": "wc-win", "준우승": "wc-ru", "4강": "wc-sf", "8강": "wc-qf", "16강": "wc-r16", "조별리그": "wc-gs" };
  // WC_ALL에서 최고 성적·횟수·본선수 파생(단일 진실원천)
  function wcAgg(id) {
    var arr = WC_ALL[id]; if (!arr || !arr.length) return null;
    var best = ""; arr.forEach(function (r) { if ((WC_RANK[r[1]] || 0) > (WC_RANK[best] || 0)) best = r[1]; });
    var years = arr.filter(function (r) { return r[1] === best; }).map(function (r) { return r[0]; });
    return { best: best, years: years, count: years.length, apps: arr.length + 1 };  // +1 = 2026
  }
  // 표면 '역대 최고' 요약(우승/준우승 N회 / 최고 단계·연도)
  function wcBestText(id) {
    var g = wcAgg(id); if (!g) return "";
    var title = g.best === "우승" || g.best === "준우승";
    return esc(g.best) + (title ? (g.count > 1 ? " " + g.count + "회" : " · " + g.years[0]) : (g.best === "조별리그" ? "" : " · " + g.years[g.years.length - 1]));
  }
  // 더보기: 연도별 전체 전적 표
  function wcMoreHtml(id) {
    var g = wcAgg(id); if (!g) return "";
    var rows = WC_ALL[id].map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td class="wc-r ' + (WC_STAGE_CLS[r[1]] || "") + '">' + esc(r[1]) + "</td></tr>"; }).join("");
    var note = WC_NOTE[id] ? '<div class="wc-note">* ' + esc(WC_NOTE[id]) + "</div>" : "";
    return '<details class="wc-more"><summary>역대 월드컵 전적 (본선 ' + g.apps + '회)</summary><div class="wc-more-body"><table class="wc-tbl">' + rows + "</table>" + note + "</div></details>";
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
        '<div class="team-rank"><span class="tr-fifa" data-fifago>🌍 FIFA 랭킹 ' + esc(t.fifaRank) + "위 ›</span> · " + esc(t.group) + "조</div>" +
        (t.lastWc ? '<div class="team-wc">🏆 ' + (t.lastWc.inLast2022
          ? "직전 월드컵 2022 · " + esc(t.lastWc.stage)
          : (t.lastWc.year ? "최근 월드컵 " + esc(t.lastWc.year) + " · " + esc(t.lastWc.stage) : "2026 첫 본선 진출")) + "</div>" : "") +
        (wcAgg(t.id) ? '<div class="team-wc best">🏅 역대 최고 ' + wcBestText(t.id) + "</div>" + wcMoreHtml(t.id) : "") +
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
          (!IS_TOSS && nw.summary ? '<div class="news-sum"><span class="ai-tag">AI 요약</span>' + esc(nw.summary) + "</div>" : "") +
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
        statusH = '<span class="tlv-badge' + (isLive ? " live" : "") + '">' + (isLive ? "🔴 " + liveClk(fx, lv) : "경기 종료") + "</span>" +
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

  // 라인업 OVR 테두리 링 색 — ?ovrpal=N 일 때만(시안 미리보기). 0/없음=기본(production 무영향). null이면 기본 테두리.
  function ovrRing(pid) {
    var pal = +((location.search.match(/[?&]ovrpal=(\d)/) || [])[1] || 0); if (!pal) pal = 2;  // 기본=금/은/동 OVR 링(88+금·83+은·78+동·이하 기본). ?ovrpal=N으로 다른 팔레트 테스트.
    var p = pid && playersById[pid], o = p && p.ovr; if (!o) return null;
    if (pal === 1) return o >= 88 ? "#7c3aed" : o >= 83 ? "#1f5fd6" : o >= 78 ? "#168a52" : "#9aa7bd";          // 등급(보라/파랑/초록/회색)
    if (pal === 2) return o >= 88 ? "#e8b923" : o >= 83 ? "#c0c8d4" : o >= 78 ? "#cd7f32" : null;               // 금/은/동(나머지 기본)
    if (pal === 3) return o >= 88 ? "#ffcf4d" : o >= 84 ? "#ffffff" : null;                                      // 핵심만(88+금링·84+흰링)
    if (pal === 4) return o >= 86 ? "#2ecf83" : o >= 80 ? "#a8d05a" : o >= 74 ? "#f5b301" : "#e57a46";           // 히트(초록→주황)
    if (pal === 5) return o >= 88 ? "#ff4d6d" : o >= 83 ? "#ff9f1c" : o >= 78 ? "#2ec4b6" : "#9aa7bd";           // 비비드(핑크/주황/민트/회색)
    if (pal === 6) return o >= 88 ? "#ffd24a" : o >= 84 ? "#ffe9a8" : null;                                       // 골드 단일강조(스타만)
    if (pal === 7) return o >= 88 ? "#1e3a8a" : o >= 83 ? "#3b82f6" : o >= 78 ? "#7dd3fc" : "#cbd5e1";            // 블루 그라데이션
    if (pal === 8) return o >= 88 ? "#e11d48" : o >= 83 ? "#fb923c" : o >= 78 ? "#facc15" : "#94a3b8";           // 레드→옐로
    return null;
  }
  // OVR 숫자 뱃지(?ovrbadge=N 미리보기) — 원 하단 중앙(이름 안 가림). N=색상 모드.
  function ovrBadgeSvg(pid, px, py) {
    var mode = +((location.search.match(/[?&]ovrbadge=(\d)/) || [])[1] || 0); if (!mode) return "";
    var p = pid && playersById[pid], o = p && p.ovr; if (!o) return "";
    var col;
    if (mode === 1) col = o >= 88 ? "#d4af37" : o >= 83 ? "#aeb6c2" : o >= 78 ? "#cd7f32" : "#6b7686";      // 금/은/동/철
    else if (mode === 2) col = o >= 88 ? "#7c3aed" : o >= 83 ? "#1f5fd6" : o >= 78 ? "#168a52" : "#64748b"; // 등급색
    else if (mode === 3) col = "#0b1f4d";                                                                    // 단색(남색·FIFA식)
    else if (mode === 4) col = o >= 86 ? "#16a34a" : o >= 80 ? "#84cc16" : o >= 74 ? "#f59e0b" : "#ea580c";  // 히트
    else if (mode === 5) col = o >= 88 ? "#e11d48" : o >= 83 ? "#f97316" : o >= 78 ? "#0ea5e9" : "#64748b";  // 비비드
    else col = "#0b1f4d";
    var bx = px - 12, by = py + 6;  // 원 하단 중앙(이름 위) — 이름 안 가림
    return '<rect x="' + bx.toFixed(0) + '" y="' + by.toFixed(0) + '" width="24" height="15" rx="3.5" fill="' + col + '" stroke="#fff" stroke-width="1"/>' +
      '<text x="' + (bx + 12).toFixed(0) + '" y="' + (by + 11.5).toFixed(0) + '" fill="#fff" font-size="11" font-weight="800" text-anchor="middle">' + o + "</text>";
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
    // 정수 합이 정확히 100이 되도록(최대잔여법) — 안 하면 게이지 끝이 1~2% 비거나 넘침
    var pct = pct100([winA * 100, draw * 100, winB * 100]);
    return {
      winA: pct[0], draw: pct[1], winB: pct[2],
      ga: ga, gb: gb, pa: Math.round(pa), pb: Math.round(pb),
    };
  }
  // 실수 배열을 합 100인 정수 배열로 — 내림 후 잔여(소수부 큰 순)에 +1 분배
  function pct100(vals) {
    var fl = vals.map(function (v) { return Math.floor(v); });
    var rem = 100 - fl.reduce(function (a, b) { return a + b; }, 0);
    var idx = vals.map(function (v, i) { return { i: i, f: v - Math.floor(v) }; }).sort(function (a, b) { return b.f - a.f; });
    for (var k = 0; k < rem && k < idx.length; k++) fl[idx[k].i]++;
    return fl;
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
      (!IS_TOSS && nw.summary ? '<div class="news-sum"><span class="ai-tag">AI 요약</span>' + esc(nw.summary) + "</div>" : "") +
      (foot ? '<div class="news-meta">' + foot + "</div>" : "") +
      "</" + tag + ">";
  }
  function matchNews(team, max) {
    if (SPOILER_ON) return "";  // 스포일러 방지: 뉴스에 결과가 섞일 수 있어 숨김
    if (!team || !team.news || !team.news.length) return "";
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
  // 포지션 약어 → 깊이점수(0=GK ~ 6=최전방 스트라이커). 포메이션 라벨대로 라인 배치할 때 정렬 기준.
  // ★F(=원톱 스트라이커)를 CF(=그 뒤 섀도/공미)보다 더 전진으로 둬야 3-4-2-1의 '2-1'이 안 뭉침(예전엔 둘 다 한 밴드라 3으로 보임)
  function espnDepth(abbr) {
    var a = (abbr || "").toUpperCase();
    if (a === "G" || a === "GK") return 0;
    if (/^(CD|CB|RB|LB|RWB|LWB|WB|D)(-|$)/.test(a)) return 1;
    if (/^(DM|CDM)(-|$)/.test(a)) return 2;
    if (/^(CM|RM|LM|M)(-|$)/.test(a)) return 3;
    if (/AM/.test(a)) return 4;
    if (/^(W|RW|LW|RF|LF)(-|$)/.test(a)) return 4.5;
    if (/^(CF|SS)(-|$)/.test(a)) return 5;
    if (/^(F|ST)(-|$)/.test(a)) return 6;
    return 3;
  }
  function parseFormationCounts(f) {  // "3-4-2-1" → [3,4,2,1] (아웃필드 합 10일 때만)
    if (!f) return null;
    var parts = String(f).split(/[^0-9]+/).filter(Boolean).map(Number);
    if (parts.length < 2) return null;
    var sum = parts.reduce(function (a, b) { return a + b; }, 0);
    return sum === 10 ? parts : null;
  }
  function espnLineupCoords(rs) {
    var starters = (rs.roster || []).filter(function (p) { return p.starter && p.athlete && p.athlete.displayName; });  // 이름 없는 슬롯 제외(빈 동그라미 방지)
    if (starters.length < 9) return null;
    // ① 포메이션 라벨이 있고 11명 정상 → 라벨(3-4-2-1)대로 라인 수·라인별 인원 정확히 배치 (ESPN이 섀도와 원톱을 같은 F계열로 줘 밴드가 뭉치는 문제 해결)
    var counts = (starters.length === 11) ? parseFormationCounts(rs.formation) : null;
    if (counts) {
      var gk = null, outs = [];
      starters.forEach(function (p) {
        var abbr = (p.position && p.position.abbreviation) || "";
        var it = { p: p, sv: espnSideV(abbr), fp: p.formationPlace || 0, dp: espnDepth(abbr) };
        if (it.dp === 0 && !gk) gk = it; else outs.push(it);
      });
      if (gk && outs.length === 10) {
        outs.sort(function (a, b) { return (a.dp - b.dp) || (a.fp - b.fp); });  // 깊이순(수비→공격)으로 줄세운 뒤 라벨 인원수대로 슬라이스
        var lines = [[gk]], idx = 0;
        counts.forEach(function (c) { lines.push(outs.slice(idx, idx + c)); idx += c; });
        var nl = lines.length, outF = [];
        lines.forEach(function (line, li) {
          var y = nl <= 1 ? 50 : 86 - (li / (nl - 1)) * 74;  // 86(GK) ~ 12(최전방) 균등
          line.sort(function (x, y2) { return (x.sv - y2.sv) || (x.fp - y2.fp); });
          line.forEach(function (it, i) { outF.push({ p: it.p, x: line.length === 1 ? 50 : (i + 0.5) / line.length * 100, y: y }); });
        });
        return outF;
      }
    }
    // ② 폴백: 포메이션 라벨 없을 때 포지션 밴드 기반 균등 분포
    var bands = {};
    starters.forEach(function (p) { var abbr = (p.position && p.position.abbreviation) || ""; var bk = espnBand(abbr); (bands[bk] = bands[bk] || []).push({ p: p, sv: espnSideV(abbr), fp: p.formationPlace || 0 }); });
    var usedBands = Object.keys(bands).map(Number).sort(function (a, b) { return a - b; });
    var n = usedBands.length, out = [];
    usedBands.forEach(function (bk, bi) {
      var y = n <= 1 ? 50 : 86 - (bi / (n - 1)) * 74;
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
        // GK는 골대쪽(5%/95%) 고정, 모든 세로선 가로 간격 균등. 마지막 라인→센터(50%)는 '반 칸'으로 둬서 양 팀 최전방 사이 간격까지 다른 라인 간격과 동일하게.
        var gap = 0.45 / (n - 0.5);  // 5%~50% 구간을 (n-0.5)칸으로 분할 → 한 칸 = 모든 간격(팀내·센터 건너편)이 동일
        var px = left ? W * (0.05 + bi * gap) : W * (0.95 - bi * gap);
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
          var pd = d.pid ? ' data-player="' + esc(d.pid) + '"' : "";  // 잔디 선수 탭 → 선수 상세(평점은 하단 버튼에서만)
          var _mp = d.pid ? playersById[d.pid] : null;  // 소속팀 즉시 툴팁(마우스 호버) — data-club을 커스텀 툴팁이 읽음
          var clubAttr = (_mp && _mp.club) ? ' data-club="' + esc(raw + " · " + _mp.club) + '"' : "";
          var rbsvg = "";
          if (d.rating != null) {
            var rc = ratingHex(d.rating);
            var bx = px + 5, by = py - 27;
            rbsvg = '<rect x="' + bx.toFixed(0) + '" y="' + by.toFixed(0) + '" width="29" height="18" rx="3.5" fill="' + rc + '" stroke="#0b1220" stroke-width="1" class="rbox-tap" style="cursor:pointer"/>' +
              '<text x="' + (bx + 14.5).toFixed(0) + '" y="' + (by + 13.5).toFixed(0) + '" fill="#fff" font-size="13.5" font-weight="800" text-anchor="middle" style="pointer-events:none">' + d.rating.toFixed(1) + "</text>";
          }
          var ico = (d.goal ? "⚽" : "") + (d.subIn ? "🔺" : "") + (d.subOff ? "⇄" : "");  // 골·교체투입(🔺=교체로 들어온 선수)·교체아웃
          var icoSvg = ico ? '<text x="' + (px - 20).toFixed(0) + '" y="' + (py - 12).toFixed(0) + '" font-size="13" text-anchor="middle">' + ico + "</text>" : "";
          var ovrBadge = ovrBadgeSvg(d.pid, px, py);  // OVR 숫자뱃지 미리보기(?ovrbadge=N)
          var _ovrc = ovrRing(d.pid);  // OVR 링(?ovrpal=N 미리보기), 없으면 기본 테두리
          out.push('<g class="mf-p"' + pd + clubAttr + '><circle cx="' + px.toFixed(0) + '" cy="' + py.toFixed(0) + '" r="17" fill="' + col + '" stroke="' + (_ovrc || "#0b1220") + '" stroke-width="' + (_ovrc ? "4" : "2") + '"/>' +
            '<text x="' + px.toFixed(0) + '" y="' + (py + 6).toFixed(0) + '" fill="#fff" font-size="17" font-weight="800" text-anchor="middle">' + esc(num) + '</text>' +
            '<text x="' + px.toFixed(0) + '" y="' + (py + 31).toFixed(0) + '" fill="#fff" font-size="' + nameFont + '" font-weight="700" text-anchor="middle" style="paint-order:stroke;stroke:rgba(0,0,0,.4);stroke-width:3px">' + nmSvg + "</text>" + rbsvg + icoSvg + ovrBadge + "</g>");
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
    // 나라(팀) 평균 평점 배지 제거 — 선수 평점만 표시(사용자 요청 2026-06-29).
    return '<div class="mf-head"><span class="mf-a"><span class="mf-tm" data-team="' + esc(a.id) + '">' + esc(a.flag) + " " + esc(shortTeamName(a.id, a.name)) + '</span> <b>' + esc(fa || "") + '</b></span><span class="mf-b"><b>' + esc(fb || "") + "</b> " + '<span class="mf-tm" data-team="' + esc(b.id) + '">' + esc(shortTeamName(b.id, b.name)) + " " + esc(b.flag) + "</span></span></div>";
  }
  function matchFormation(a, b) {
    if (!(a.lineup && a.lineup.length && b.lineup && b.lineup.length)) return "";
    function toPl(t) { return (t.lineup || []).map(function (d) { var p = playersById[d.playerId] || {}; return { name: p.name || "", number: p.number, x: d.x, y: d.y, pid: p.id }; }); }
    return '<h3>📋 예상 라인업 <span class="muted-note">탭하면 선수 상세</span></h3>' + mfHead(a, a.formation, b, b.formation) + pitchSVG(toPl(a), toPl(b));
  }
  function espnPitch(d, a, b, matchId) {
    var rosters = d.rosters || [];
    // ★방어: 받아온 데이터(d)의 팀이 이 경기(a,b)와 다르면 거부 — 다른 경기 라인업이 섞여 들어오는 버그 차단
    var _rt = rosters.map(function (rs) { return espnTeamId(rs.team && rs.team.displayName); }).filter(Boolean);
    if (_rt.length && (_rt.indexOf(a.id) < 0 || _rt.indexOf(b.id) < 0)) return "";
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
    window._mscNeedsLive = false;  // 조현황 경기결과에 '-'(스코어 미로드)가 있으면 teamResults가 true로 → 저장 스코어 도착 시 재렌더
    if (fx.group || !fx.homeId || !fx.awayId) fetchStandings();  // 조별=순위표용 / 녹아웃 미확정=실제 진출팀 해석용 순위 로드 → 도착 시 자동 재렌더
    if (!fx.homeId || !fx.awayId) resolveKnockout();  // STAND/결과 이미 있으면 즉시 실제 팀으로 해석
    var a = teamsById[fx.homeId], b = teamsById[fx.awayId];
    if (fx.awayId === "south-korea" && a && b) { var _sw = a; a = b; b = _sw; }  // 대한민국 경기는 항상 한국을 왼쪽에
    var when = fmtDate(fxDate(fx)).d + (fxTime(fx) ? " " + esc(fxTime(fx)) : "");
    if (fx.venue && VENUE_INFO[fx.venue] && VENUE_INFO[fx.venue].img) { try { var _pi = new Image(); _pi.src = VENUE_INFO[fx.venue].img; } catch (e) {} }  // 경기장 사진 미리 받아두기(클릭 시 즉시 표시)
    var _vn = fx.venue ? (VENUE_INFO[fx.venue] ? '<span class="mv-venue" data-venue="' + esc(fx.venue) + '">' + esc(fx.venue) + ' ⓘ</span>' : esc(fx.venue)) : "";  // 정보 있는 경기장은 클릭 가능
    var where = [_vn, esc(fx.city), hostCountry(fx)].filter(Boolean).join(" · ");
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
    if (!/조별/.test(fx.stage || "") && pr.draw) {  // 토너먼트(32강~결승)는 무승부 없음 → 무 확률을 양팀 승률에 비례 배분, 무=0
      var _sab = pr.winA + pr.winB || 1, _wa = Math.round(pr.winA + pr.draw * pr.winA / _sab);
      pr = { winA: _wa, draw: 0, winB: 100 - _wa };
    }
    var mf = (!SPOILER_ON && (isLiveFix(fx) || matchEnded(fx))) ? "" : matchFormation(a, b);  // 라이브/종료는 실제 라인업(espnPitch)으로 대체 — 단 스포일러 모드면 실제 라인업 대신 예상 포메이션 유지
    var ia = a.indices || {}, ib = b.indices || {};
    var cmp = cmpRow("공격력", ia.attack, ib.attack) + cmpRow("수비력", ia.defense, ib.defense) +
      cmpRow("조직력", ia.organization, ib.organization) + cmpRow("경험치", ia.experience, ib.experience) +
      cmpRow("종합", pr.pa, pr.pb);
    var pv = fx.preview, previewHtml = "";
    if (pv) {
      var wpts = (pv.watchPoints || []).map(function (p) { return "<li>" + esc(stripFormation(p)) + "</li>"; }).join("");
      // 전략은 fx의 home/away 기준이므로 a/b(한국경기는 swap됨) 대신 실제 home/away 팀명으로 매칭 — 안 그러면 제목·내용 뒤바뀜
      var strat = (pv.homeStrategy ? '<div class="strat-box"><div class="strat-team">' + esc(fx.homeName) + '</div><div class="strat-txt">' + esc(stripFormation(pv.homeStrategy)) + "</div></div>" : "") +
        (pv.awayStrategy ? '<div class="strat-box"><div class="strat-team">' + esc(fx.awayName) + '</div><div class="strat-txt">' + esc(stripFormation(pv.awayStrategy)) + "</div></div>" : "");
      previewHtml = (wpts ? '<div class="block"><h3>관전 포인트</h3><ul class="watch-list">' + wpts + "</ul></div>" : "") +
        (strat ? '<div class="block"><h3>예상 전략</h3><div class="strat">' + strat + "</div></div>" : "");
    }

    viewEl.innerHTML =
      '<div class="adslot ad-top"></div>' +  /* 작은 배너(320x50) — 경기 분석 카드 위, 바깥 별도 공간(맨 위) */
      '<div class="detail match-view">' +
        '<div class="match-top-btns">' + saveBtnHtml("match:" + fx.id) + (IS_TOSS ? "" : '<button class="share-btn" data-share-match="' + esc(fx.id) + '" aria-label="공유">📤</button>') + "</div>" +  /* 토스는 외부 공유 숨김 */
        '<div class="var-title"><span class="var-tag">VAR</span> 경기 분석</div>' +
        '<div class="match-meta-top">' + top + "</div>" +
        '<div class="vs-head">' +
          '<div class="vs-team" data-team="' + esc(a.id) + '"><span class="vs-flag">' + esc(a.flag) + "</span>" +
            '<span class="vs-name">' + esc(a.name) + '</span><span class="vs-rank">FIFA ' + esc(a.fifaRank) + "위</span><span class=\"vs-go\">전력 보기 ›</span></div>" +
          '<div class="vs-center"><div class="vs-x">VS</div></div>' +
          '<div class="vs-team" data-team="' + esc(b.id) + '"><span class="vs-flag">' + esc(b.flag) + "</span>" +
            '<span class="vs-name">' + esc(b.name) + '</span><span class="vs-rank">FIFA ' + esc(b.fifaRank) + "위</span><span class=\"vs-go\">전력 보기 ›</span></div>" +
        "</div>" +
        '<div class="vs-goals"></div>' +  /* 골 표기는 스코어 바로 아래 */
        mvCompareHtml(a, b) +  /* 1) 스쿼드 몸값 게이지(위로) */
        '<div class="block"><h3>승부 예상</h3>' +  /* 2) 승부예상 게이지(몸값 밑) */
          '<div class="prob"><div class="prob-seg a" style="width:' + pr.winA + '%">' + (pr.winA >= 12 ? pr.winA + "%" : "") + '</div><div class="prob-seg d" style="width:' + pr.draw + '%">' + (pr.draw >= 12 ? pr.draw + "%" : "") + '</div><div class="prob-seg b" style="width:' + pr.winB + '%">' + (pr.winB >= 12 ? pr.winB + "%" : "") + "</div></div>" +
          '<div class="prob-legend"><span>' + esc(a.name) + ' 승</span>' + (pr.draw ? '<span class="pl-draw" style="left:' + (pr.winA + pr.draw / 2) + '%">무</span>' : "") + '<span>' + esc(b.name) + " 승</span></div></div>" +
        kr32MatchBlock(fx) +  /* D~L조 경기면 한국 32강 와일드카드 조건 표시 */
        matchScenarioHtml(fx) +  /* 조별 경기면 32강 진출 경우의 수 + 조 순위 */
        '<div class="block pred-slot"></div>' +  /* 3) 경기 예측 투표(맞혀보세요) */
        '<div class="block bet-slot"></div>' +  /* 4) 포인트 베팅 */
        '<div class="live-btn-slot"></div>' +  /* 라이브 중(치지직 JTBC 송출 감지)이면 updScore가 버튼 채움 */
        ((MATCH_HIGHLIGHTS[fx.id] && matchEnded(fx)) ? (IS_TOSS ? '<button class="hl-btn" data-ext="' + esc(MATCH_HIGHLIGHTS[fx.id]) + '">▶ 하이라이트 보기</button>' : '<a class="hl-btn" href="' + esc(MATCH_HIGHLIGHTS[fx.id]) + '" target="_blank" rel="noopener">▶ 하이라이트 보기</a>') : "") +  /* 토스는 openURL(외부브라우저), 웹은 새 탭 */
        /* 경기 결과 이미지 공유 버튼 제거(우측상단 📤 공유로 일원화) */
        '<div class="adslot ad-mid"></div>' +
        '<div class="block h2h-slot"></div>' +
        '<div class="block mf-block"' + (mf ? "" : ' style="display:none"') + ">" + (mf || "") + "</div>" +
        '<div class="block card-slot" style="display:none"></div>' +
        '<div class="ref-slot"></div>' +
        '<div class="block lineup-slot"></div>' +
        '<div class="mom-slot"></div>' +
        /* 선수 평점·MVP 버튼은 종료 후에만(MOM 포디움이 진입점) — 예정/진행 경기엔 표시 안 함 */
        '<div class="block"><h3>전력 비교</h3>' + cmp + "</div>" +
        previewHtml +
        '<div class="cmt-slot"></div>' +
        ((a.news && a.news.length) || (b.news && b.news.length) ?
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
    insertAdFit(viewEl.querySelector(".ad-top"), "DAN-SWWhds5NegoTMohB", "320", "50"); insertAdFit(viewEl.querySelector(".ad-mid")); insertAdSense(viewEl.querySelector(".adsense-slot")); coupangBottom();

    // 라이브 자동 갱신: 스코어(VS 자리) + 라인업/이벤트
    var aIsHome = (a.id === fx.homeId);
    loadPrediction(viewEl.querySelector(".pred-slot"), fx, a, b, aIsHome);
    if (!IS_TOSS) loadBetting(viewEl.querySelector(".bet-slot"), fx, a, b, aIsHome);  // 토스 미니앱은 포인트 베팅 숨김(사행성 정책) — 무료 예측만
    if (matchEnded(fx) && window.KickComments) {  // 종료경기 정산 트리거(크론 안 기다리고 즉시)
      var _lv = LIVE[fx.id];
      if (_lv && _lv.state === "post" && _lv.hs != null && _lv.as != null && KickComments.settleWithResult) {
        var _isGrp = /조별/.test(fx.stage || ""), _outcome;
        if (_isGrp) _outcome = _lv.hs > _lv.as ? "home" : _lv.hs < _lv.as ? "away" : "draw";
        else {  // 녹아웃: 진출팀(승부차기 승자 포함)으로 정산. 무승부(1-1 PK)인데 승자 미정이면 보류
          var _adv = advancerOf(fx);
          if (_adv) _outcome = _adv === fx.homeId ? "home" : "away";
          else if (_lv.hs !== _lv.as) _outcome = _lv.hs > _lv.as ? "home" : "away";
          else _outcome = null;
        }
        if (_outcome) KickComments.settleWithResult(fx.id, _outcome);  // 최종 결과로 즉시 정산(멱등)
      } else if (KickComments.settleMatch) { KickComments.settleMatch(fx.id); }
    }
    function updScore() {
      if (SPOILER_ON) return;  // 스포일러 방지: 경기 상세 스코어·골·라이브 버튼 미표시(하이라이트 버튼은 별도 유지)
      if (parseHash().id !== fx.id) return;  // 다른 경기로 이동했으면 이 경기 갱신 안 함(섞임 방지)
      var lv = LIVE[fx.id], c = viewEl.querySelector(".vs-center"); if (!c) return;
      if (lv && (lv.state === "in" || lv.state === "post")) {
        var _ko = matchKickoff(fx), _stale = _ko && Date.now() > _ko + 210 * 60000;  // 종료 시간 경과인데 'in'으로 남은 스테일 라이브 → 종료 처리
        var _ended = lv.state === "post" || _stale, _isLive = lv.state === "in" && !_stale;
        var as_ = aIsHome ? lv.hs : lv.as, bs_ = aIsHome ? lv.as : lv.hs;
        var penHtml = "";
        if (_ended && lv.hs === lv.as && lv.ph != null && lv.pa != null) {  // 승부차기 결과(무승부일 때)
          var pA = aIsHome ? lv.ph : lv.pa, pB = aIsHome ? lv.pa : lv.ph;
          var pwId = lv.ph > lv.pa ? fx.homeId : fx.awayId, pwT = teamsById[pwId];
          penHtml = '<div class="vs-pen">🥅 승부차기 <b>' + pA + " : " + pB + "</b>" + (pwT ? ' · ' + esc(flagOf(pwId)) + " " + esc(pwT.name) + " 승" : "") + "</div>";
        }
        c.innerHTML = '<div class="vs-score">' + (as_ | 0) + ' <span>-</span> ' + (bs_ | 0) + "</div>" +
          '<div class="vs-clock' + (_isLive ? " live" : "") + '">' + (_ended ? "경기 종료" : esc(liveMin(fx, lv) || "LIVE")) + "</div>" + penHtml;
      }
      var gw = viewEl.querySelector(".vs-goals");  // 경기카드처럼 득점자 표시(좌=홈, 우=원정)
      if (gw) { var lg = teamGoals(fx, lv, a.name, "l"), rg = teamGoals(fx, lv, b.name, "r"); gw.innerHTML = (lg || rg) ? '<div class="vg-l">' + lg + '</div><div class="vg-r">' + rg + "</div>" : ""; twem(gw); }
      var lbs = viewEl.querySelector(".live-btn-slot");  // 치지직 JTBC 라이브 송출 감지 시 "라이브 보기" 버튼(경기종료면 숨김)
      if (lbs) { var _bc = LIVE_STREAM && LIVE_STREAM[fx.id]; lbs.innerHTML = (_bc && _bc.url && !(lv && lv.state === "post")) ? (IS_TOSS ? '<button class="live-btn" data-ext="' + esc(_bc.url) + '"><span class="lb-dot"></span>라이브 보기 (JTBC)</button>' : '<a class="live-btn" href="' + esc(_bc.url) + '" target="_blank" rel="noopener"><span class="lb-dot"></span>라이브 보기 (JTBC)</a>') : ""; }  /* 토스는 openURL, 웹은 새 탭 */
    }
    function refreshLineup() {
      var slot = viewEl.querySelector(".lineup-slot"); if (!slot) return;
      var wasOpen = !!((slot.querySelector(".lu-subs-d") || {}).open);  // 교체명단 펼침 상태 보존(라이브 새로고침 시 접힘 방지)
      var eid = espnIdCache[fx.id]; if (eid) delete summaryCache[eid];
      fetchSummary(fx).then(function (d) {
        if (!d || parseHash().name !== "match" || parseHash().id !== fx.id) return;  // 현재 보고 있는 경기와 fx 일치할 때만(이전 경기의 늦은 응답 차단)
        renderLineup(slot, d, a, b, fx);
        if (viewEl.querySelector(".ref-slot")) ensureRefHtml(fx, d).then(function (html) { var rs = viewEl.querySelector(".ref-slot"); if (rs && parseHash().name === "match" && parseHash().id === fx.id) { rs.innerHTML = html; twem(rs); } });  // 주심 정보(국가·카드성향) — DB본이라 gameInfo 없으면 ESPN officials 직접 보강. 국기 twemoji 변환(PC/윈도우 대응)
        var _det = slot.querySelector(".lu-subs-d"); if (_det && wasOpen) _det.open = true;  // 펼침 복원
        var lv = LIVE[fx.id];  // 라이브면 이 경기 기록을 즉시 DB에 반영(기록탭 새로고침 시 최신)
        if (lv && lv.state === "in" && window.KickComments && KickComments.pushMatchStats) { var pl = computeMatchPlayers(d); if (pl.length) KickComments.pushMatchStats(fx.id, pl); }
      });
    }
    // fetchLive(스코어 폴링)가 끝날 때마다 즉시 이 경기 점수 갱신(다음 20초 틱 안 기다림)
    window._matchLiveTick = function () { updScore(); var lv = LIVE[fx.id]; if (lv && lv.state === "in") refreshLineup(); };  // ESPN 'in'일 때만 라인업/통계 즉시 갱신(킥오프 전·ESPN 지연은 타이머 60초 폴링이 처리)
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
  var LIVE_STREAM = {};   // {mid: {mid,url,title}} 맵 — 치지직 JTBC/JTBCSPORTS 채널 라이브 송출 감지(서버 update_live가 live_state.ls 배열에 기록, 동시 2경기 중계 대응)
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
      if (d.shootout === true) return;  // 승부차기 PK는 득점자 목록서 제외(스코어는 정규+연장 기준이라 1-1인데 골 4개로 보이던 버그)
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
    // fixByPair 재생성 — 녹아웃(32강~)은 로드시 homeId가 null(슬롯)이라 정적표에 없음.
    // resolveKnockout가 진출팀을 채운 뒤 현재 팀ID로 매번 다시 만들어야 녹아웃 라이브도 매칭됨.
    fixByPair = {};
    (DATA.fixtures || []).forEach(function (f) { if (f.homeId && f.awayId) fixByPair[[f.homeId, f.awayId].sort().join("|")] = f.id; });
    (d.events || []).forEach(function (e) {
      var c = (e.competitions || [])[0]; if (!c) return;
      var comp = c.competitors || [];
      var H = comp.filter(function (t) { return t.homeAway === "home"; })[0] || comp[0];
      var A = comp.filter(function (t) { return t.homeAway === "away"; })[0] || comp[1];
      if (!H || !A) return;
      var hid = espnTeamId(H.team && H.team.displayName), aid = espnTeamId(A.team && A.team.displayName);
      if (!hid || !aid) return;
      // 녹아웃 대진이 예측과 달라 실제 ESPN 팀과 안 맞으면(예: 독일-스웨덴 예측인데 실제 독일-파라과이) → 킥오프 시각(±2h)으로 매칭해 실제 팀으로 교정.
      var pairKey = [hid, aid].sort().join("|");
      if (!fixByPair[pairKey]) {
        var ed = Date.parse(e.date), best = null, bestD = Infinity;
        (DATA.fixtures || []).forEach(function (f) { if (f.group) return; var ko = matchKickoff(f); if (!ko) return; var dd = Math.abs(ko - ed); if (dd < bestD) { bestD = dd; best = f; } });
        // 한 팀이라도 일치하는 근접시각 녹아웃 경기일 때만 상대팀 교정(엉뚱한 경기 재배정 방지).
        var overlap = best && (best.homeId === hid || best.awayId === aid || best.homeId === aid || best.awayId === hid);
        if (best && bestD < 2 * 3600000 && overlap && (best.homeId !== hid || best.awayId !== aid)) {
          best.homeId = hid; best.awayId = aid;
          best.homeName = (teamsById[hid] || {}).name || best.homeName;
          best.awayName = (teamsById[aid] || {}).name || best.awayName;
          best._espnFixed = true;  // 예측 resolveKnockout이 다시 덮지 않게
          fixByPair[pairKey] = best.id; changed = true;
        }
      }
      var fid = fixByPair[pairKey]; if (!fid) return;
      seen[fid] = 1;
      var fx = fixturesById[fid]; if (!fx) return;
      var st = (e.status && e.status.type) || {}; var state = st.state;
      if (state === "in") anyLive = true;
      if (state === "in" || state === "post" || state === "pre") anyToday = true;
      if (state === "pre") { if (LIVE[fid]) { delete LIVE[fid]; changed = true; } return; }
      var hs = +H.score, as = +A.score;
      var ht = state === "in" && (st.name === "STATUS_HALFTIME" || st.detail === "HT" || st.description === "Halftime");  // 하프타임 감지
      var winId = (H.winner === true) ? hid : ((A.winner === true) ? aid : null);  // 진출팀(녹아웃 승부차기 포함) — ESPN가 종료 시 표시
      var Hp = H.shootoutScore, Ap = A.shootoutScore, ph = null, pa = null;  // 승부차기 스코어(ESPN) — fx 기준 정렬
      if (Hp != null && Ap != null) { ph = (fx.homeId === hid) ? +Hp : +Ap; pa = (fx.homeId === hid) ? +Ap : +Hp; }
      var rec = {
        state: state, clock: ht ? "전반 종료" : ((e.status && e.status.displayClock) || ""),
        hs: (fx.homeId === hid) ? hs : as, as: (fx.homeId === hid) ? as : hs,
        events: parseGoals(c), winId: winId, ph: ph, pa: pa
      };
      if (winId) KO_WIN[fid] = winId;
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
      KickComments.pushLiveState({ t: Date.now(), live: lm, ls: Object.keys(LIVE_STREAM).map(function (k) { return LIVE_STREAM[k]; }) });  // ls 배열 보존(서버 60초마다 갱신, 클라 push가 덮어쓰지 않게)
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
        if (changed) { if (onHomeSchedule()) renderSchedule(); if (window._matchLiveTick) window._matchLiveTick(); if (window._teamLiveTick) window._teamLiveTick(); if (window._teamSchedRefresh) window._teamSchedRefresh(); if (parseHash().name === "kr32") renderKr32(); if (parseHash().name === "match" && parseHash().id && window._mscNeedsLive) renderMatch(parseHash().id); }  // 저장 스코어 도착 시 경기상세 조현황(경기결과) 갱신
      }).catch(function () {});
  }
  // live_state.ls(서버 감지 JTBC 라이브) → LIVE_STREAM 반영. 변동 시 경기페이지 버튼 즉시 갱신.
  function applyLiveStream(d, fresh) {
    // d.ls: 배열[{mid,url,title}](신) 또는 단일{mid,url}(구) 호환 → LIVE_STREAM 맵 {mid: {mid,url,title}}
    var arr = !fresh || !d ? [] : Array.isArray(d.ls) ? d.ls : (d.ls && d.ls.mid ? [d.ls] : []);
    var next = {}; arr.forEach(function (x) { if (x && x.mid && x.url) next[x.mid] = x; });
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
    function apply(res) {
      var changed = false, srChanged = false;
      Object.keys(res || {}).forEach(function (mid) {
        // 종료경기 결과. LIVE가 비었거나 '아직 in(스테일)'이면 post로 덮어씀.
        if (!(res[mid] && res[mid].hs != null)) return;
        var sr = { hs: res[mid].hs, as: res[mid].as };
        if (JSON.stringify(STORED_RESULTS[mid]) !== JSON.stringify(sr)) { STORED_RESULTS[mid] = sr; srChanged = true; }
        if (LIVE[mid] && LIVE[mid].state === "post") {
          if (res[mid].ph != null && LIVE[mid].ph == null) { LIVE[mid].ph = res[mid].ph; LIVE[mid].pa = res[mid].pa; changed = true; }  // 이미 post(applyEspn 등)여도 승부차기 스코어는 병합
          return;
        }
        LIVE[mid] = { state: "post", hs: res[mid].hs, as: res[mid].as, clock: "", events: res[mid].ev || [], ph: res[mid].ph, pa: res[mid].pa, stored: true }; changed = true;
      });
      if (resolveKnockout() && parseHash().name === "home" && !searchEl.value.trim()) renderHome();  // 녹아웃 결과 도착 → 다음 라운드 자동 채움
      if (changed) { if (onHomeSchedule()) renderSchedule(); else if (parseHash().name === "home" && homeTab === "scorers" && !searchEl.value.trim()) renderScorers(); if (window._matchLiveTick) window._matchLiveTick(); if (window._teamLiveTick) window._teamLiveTick(); if (window._teamSchedRefresh) window._teamSchedRefresh(); if (parseHash().name === "match" && parseHash().id && window._mscNeedsLive) renderMatch(parseHash().id); }
      if (changed || srChanged) {
        var ph = parseHash();
        if (ph.name === "scenario") renderScenario();
        else if (ph.name === "kr32") renderKr32();
        else if (ph.name === "groupscn" && ph.id) renderGroupScenario(ph.id);
        else if (ph.name === "match" && ph.id) renderMatch(ph.id);
      }
    }
    // ★정적 results.json 우선(GitHub Pages CDN, 즉시·무료) → Supabase egress 회피 + "-" 깜빡임 제거. Supabase가 한도초과로 막혀도 결과는 정적으로 표시됨. Supabase는 라이브 갱신 보조.
    fetch("https://kicktalk.xyz/results.json?b=" + Date.now()).then(function (r) { return r.json(); }).then(apply).catch(function () {});
    if (window.KickComments && KickComments.matchResults) KickComments.ready().then(KickComments.matchResults).then(apply).catch(function () {});
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
      var _liveCh = (res.changed || lk !== _lastLiveKey || res.anyLive);
      if (_liveCh && onHomeSchedule()) renderSchedule();  // 라이브 중엔 매 폴링 재렌더(ESPN clock 정체여도 시각 기반 분 갱신)
      else if (_liveCh && parseHash().name === "home" && homeTab === "scorers" && !searchEl.value.trim()) renderScorers();  // ★라이브 골 감지 → 득점순위 즉시 갱신(goalsFromResults가 LIVE 골 병합, 20분 크론 안 기다림)
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
      var _koCh = resolveKnockout();  // 순위 도착 → 녹아웃 32강 실제 팀 자동 채움
      if (parseHash().name === "home" && homeTab === "groups" && !searchEl.value.trim()) renderGroups();
      else if (parseHash().name === "home" && homeTab === "bracket" && !searchEl.value.trim()) renderBracket();  // 대진표: 순위 도착 시 끝난 조 실제 진출팀 반영
      else if (_koCh && parseHash().name === "home" && homeTab === "schedule" && !searchEl.value.trim()) renderSchedule();  // 일정: 녹아웃 32강 실제 팀 반영
      else if (parseHash().name === "scenario") renderScenario();  // 순위 도착 시 경우의수 페이지 재렌더
      else if (parseHash().name === "kr32") renderKr32();
      else if (parseHash().name === "groupscn" && parseHash().id) renderGroupScenario(parseHash().id);  // 조별 경우의수 페이지 갱신
      else if (parseHash().name === "match" && parseHash().id) renderMatch(parseHash().id);  // 경기상세 진출 경우의수 표 갱신
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
          // 방어: d의 팀이 이 경기(fx)와 일치할 때만 DB 저장(다른 경기 데이터로 DB 오염 방지)
          var _dt = (d.rosters || []).map(function (rs) { return espnTeamId(rs.team && rs.team.displayName); }).filter(Boolean);
          var _ok = _dt.indexOf(fx.homeId) >= 0 && _dt.indexOf(fx.awayId) >= 0;
          if (_ok && hasLineupData(d) && KC && KC.pushLineup) KC.pushLineup(fx.id, { rosters: d.rosters, keyEvents: d.keyEvents, header: d.header, headToHeadGames: d.headToHeadGames, boxscore: d.boxscore, gameInfo: d.gameInfo });  // gameInfo 포함 → 종료경기 DB본에서도 주심 정보 유지
          return _ok ? d : dbGet();  // 팀 불일치 데이터면 버리고 DB 백업 사용
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
    h2hLoading = fetch("https://kicktalk.xyz/h2h.json").then(function (r) { return r.json(); }).then(function (j) { H2HPRE = j || {}; return H2HPRE; }).catch(function () { H2HPRE = {}; return H2HPRE; });
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
      var mine = bet ? bet.choice : KickComments.predMine(fx.id), op = isOpen() && !locked;
      var opts = [{ ch: leftCh, name: a.name, flag: a.flag, n: c[leftCh] || 0 }];
      if (/조별/.test(fx.stage || "")) opts.push({ ch: "draw", name: "무승부", flag: "", n: c.draw || 0 });  // 토너먼트는 무승부 선택지 제외
      opts.push({ ch: rightCh, name: b.name, flag: b.flag, n: c[rightCh] || 0 });
      // ★표시되는 선택지 합으로 % 계산(녹아웃은 무승부 표 제외) + pct100으로 합 100% 보장. (c.total로 나누면 안 보이는 무승부 표 때문에 67%+0%처럼 100%가 안 됐음)
      var shown = opts.reduce(function (s, o) { return s + o.n; }, 0);
      var pcts = shown > 0 ? pct100(opts.map(function (o) { return o.n / shown * 100; })) : opts.map(function () { return 0; });
      var cols = opts.map(function (o, i) {
        var on = mine === o.ch;
        return '<button class="pred-col' + (on ? " on" : "") + '"' + (op ? ' data-pred="' + o.ch + '"' : " disabled") + '>' +
          '<span class="pred-col-team">' + (o.flag ? '<span class="pred-col-flag">' + esc(o.flag) + "</span>" : "") + esc(o.name) + "</span>" +
          '<span class="pred-col-pct">' + pcts[i] + "%</span></button>";
      }).join("");
      slot.innerHTML = '<div class="pred-box"><div class="pred-q">이 경기의 승리팀을 맞혀보세요! 🔮</div>' +
        '<div class="pred-cols">' + cols + "</div>" +
        '<div class="pred-foot">' + (shown ? "<b>" + shown.toLocaleString() + "</b>명 참여중" : "첫 예측을 남겨보세요") + " · ⏱ " + cd() + (locked ? " · 💰 베팅완료(예측 고정)" : "") + "</div></div>";
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
      var betChs = /조별/.test(fx.stage || "") ? [L, "draw", R] : [L, R];  // 녹아웃(32강~)은 무승부 없음 → 두 팀만(연장·승부차기로 승자 결정)
      var opts = betChs.map(function (ch) {
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
      // 주심 정보(국가·카드성향) — 최초 진입(종료/예정 포함)에도 표시. d에 gameInfo 없으면(DB본) ESPN officials 직접 보강.
      if (viewEl.querySelector(".ref-slot")) ensureRefHtml(fx, d).then(function (html) { var rs = viewEl.querySelector(".ref-slot"); if (rs && parseHash().name === "match" && parseHash().id === fx.id) { rs.innerHTML = html; twem(rs); } });
    }).catch(function () { if (!cached) slot.style.display = "none"; });
  }
  // 경기 하이라이트 URL — 종료경기 풀하이라이트(치지직/JTBC). scripts/fetch_highlights.js가 종료경기를 자동 매칭해 마커 사이를 갱신.
  var MATCH_HIGHLIGHTS = {
    /* HL-AUTO-START */
    "match-1": "https://chzzk.naver.com/video/13663676", // 멕시코-남아프리카공화국
    "match-2": "https://chzzk.naver.com/video/13666274", // 대한민국-체코
    "match-3": "https://chzzk.naver.com/video/13775195", // 체코-남아프리카공화국
    "match-4": "https://chzzk.naver.com/video/13779536", // 멕시코-대한민국
    "match-5": "https://chzzk.naver.com/video/13878250", // 체코-멕시코
    "match-6": "https://chzzk.naver.com/video/13877815", // 남아프리카공화국-대한민국
    "match-7": "https://chzzk.naver.com/video/13680813", // 캐나다-보스니아 헤르체고비나
    "match-8": "https://chzzk.naver.com/video/13697795", // 카타르-스위스
    "match-9": "https://chzzk.naver.com/video/13776758", // 스위스-보스니아 헤르체고비나
    "match-10": "https://chzzk.naver.com/video/13777438", // 캐나다-카타르
    "match-11": "https://chzzk.naver.com/video/13875334", // 스위스-캐나다
    "match-12": "https://chzzk.naver.com/video/13875245", // 보스니아 헤르체고비나-카타르
    "match-13": "https://chzzk.naver.com/video/13698656", // 브라질-모로코
    "match-14": "https://chzzk.naver.com/video/13699342", // 아이티-스코틀랜드
    "match-15": "https://chzzk.naver.com/video/13795597", // 스코틀랜드-모로코
    "match-16": "https://chzzk.naver.com/video/13796304", // 브라질-아이티
    "match-17": "https://chzzk.naver.com/video/13876101", // 스코틀랜드-브라질
    "match-18": "https://chzzk.naver.com/video/13876210", // 모로코-아이티
    "match-19": "https://chzzk.naver.com/video/13682431", // 미국-파라과이
    "match-20": "https://chzzk.naver.com/video/13700637", // 호주-튀르키예
    "match-21": "https://chzzk.naver.com/video/13795010", // 미국-호주
    "match-22": "https://chzzk.naver.com/video/13797374", // 튀르키예-파라과이
    "match-23": "https://chzzk.naver.com/video/13894943", // 튀르키예-미국
    "match-24": "https://chzzk.naver.com/video/13894987", // 파라과이-호주
    "match-25": "https://chzzk.naver.com/video/13713371", // 독일-퀴라소
    "match-26": "https://chzzk.naver.com/video/13714960", // 코트디부아르-에콰도르
    "match-27": "https://chzzk.naver.com/video/13812303", // 독일-코트디부아르
    "match-28": "https://chzzk.naver.com/video/13813214", // 에콰도르-퀴라소
    "match-29": "https://chzzk.naver.com/video/13893340", // 퀴라소-코트디부아르
    "match-30": "https://chzzk.naver.com/video/13893344", // 에콰도르-독일
    "match-31": "https://chzzk.naver.com/video/13714387", // 네덜란드-일본
    "match-32": "https://chzzk.naver.com/video/13716097", // 스웨덴-튀니지
    "match-33": "https://chzzk.naver.com/video/13810944", // 네덜란드-스웨덴
    "match-34": "https://chzzk.naver.com/video/13814841", // 튀니지-일본
    "match-35": "https://chzzk.naver.com/video/13894102", // 일본-스웨덴
    "match-36": "https://chzzk.naver.com/video/13894055", // 튀니지-네덜란드
    "match-37": "https://chzzk.naver.com/video/13728955", // 벨기에-이집트
    "match-38": "https://chzzk.naver.com/video/13730200", // 이란-뉴질랜드
    "match-39": "https://chzzk.naver.com/video/13828559", // 벨기에-이란
    "match-40": "https://chzzk.naver.com/video/13829909", // 뉴질랜드-이집트
    "match-41": "https://chzzk.naver.com/video/13912380", // 이집트-이란
    "match-42": "https://chzzk.naver.com/video/13912305", // 뉴질랜드-벨기에
    "match-43": "https://chzzk.naver.com/video/13727569", // 스페인-카보베르데
    "match-44": "https://chzzk.naver.com/video/13729415", // 사우디아라비아-우루과이
    "match-45": "https://chzzk.naver.com/video/13827138", // 스페인-사우디아라비아
    "match-46": "https://chzzk.naver.com/video/13829279", // 우루과이-카보베르데
    "match-47": "https://chzzk.naver.com/video/13911167", // 카보베르데-사우디아라비아
    "match-48": "https://chzzk.naver.com/video/13911135", // 우루과이-스페인
    "match-49": "https://chzzk.naver.com/video/13744157", // 프랑스-세네갈
    "match-50": "https://chzzk.naver.com/video/13744863", // 이라크-노르웨이
    "match-51": "https://chzzk.naver.com/video/13844343", // 프랑스-이라크
    "match-52": "https://chzzk.naver.com/video/13844670", // 노르웨이-세네갈
    "match-53": "https://chzzk.naver.com/video/13909832", // 노르웨이-프랑스
    "match-54": "https://chzzk.naver.com/video/13909985", // 세네갈-이라크
    "match-55": "https://chzzk.naver.com/video/13745669", // 아르헨티나-알제리
    "match-56": "https://chzzk.naver.com/video/13746888", // 오스트리아-요르단
    "match-57": "https://chzzk.naver.com/video/13842853", // 아르헨티나-오스트리아
    "match-58": "https://chzzk.naver.com/video/13845549", // 요르단-알제리
    "match-59": "https://chzzk.naver.com/video/13929037", // 알제리-오스트리아
    "match-60": "https://chzzk.naver.com/video/13929001", // 요르단-아르헨티나
    "match-62": "https://chzzk.naver.com/video/13762270", // 우즈베키스탄-콜롬비아
    "match-63": "https://chzzk.naver.com/video/13858502", // 포르투갈-우즈베키스탄
    "match-64": "https://chzzk.naver.com/video/13861060", // 콜롬비아-콩고민주공화국
    "match-65": "https://chzzk.naver.com/video/13927987", // 콜롬비아-포르투갈
    "match-66": "https://chzzk.naver.com/video/13928125", // 콩고민주공화국-우즈베키스탄
    "match-67": "https://chzzk.naver.com/video/13760610", // 잉글랜드-크로아티아
    "match-68": "https://chzzk.naver.com/video/13761281", // 가나-파나마
    "match-69": "https://chzzk.naver.com/video/13859553", // 잉글랜드-가나
    "match-70": "https://chzzk.naver.com/video/13860139", // 파나마-크로아티아
    "match-71": "https://chzzk.naver.com/video/13927371", // 파나마-잉글랜드
    "match-72": "https://chzzk.naver.com/video/13927378", // 크로아티아-가나
    "match-73": "https://chzzk.naver.com/video/13943390", // A조 2위-B조 2위
    "match-74": "https://chzzk.naver.com/video/13960528", // E조 1위-A/B/C/D/F조 3위
    "match-75": "https://chzzk.naver.com/video/13959896", // F조 1위-C조 2위
    "match-76": "https://chzzk.naver.com/video/13957443", // C조 1위-F조 2위
    "match-77": "https://chzzk.naver.com/video/13974385", // I조 1위-C/D/F/G/H조 3위
    "match-78": "https://chzzk.naver.com/video/13973145", // E조 2위-I조 2위
    "match-79": "https://chzzk.naver.com/video/13975768", // A조 1위-C/E/F/H/I조 3위
    "match-80": "https://chzzk.naver.com/video/13988742", // L조 1위-E/H/I/J/K조 3위
    "match-81": "https://chzzk.naver.com/video/13991420", // D조 1위-B/E/F/I/J조 3위
    "match-82": "https://chzzk.naver.com/video/13990715", // G조 1위-A/E/H/I/J조 3위
    "match-83": "https://chzzk.naver.com/video/14007311", // K조 2위-L조 2위
    "match-84": "https://chzzk.naver.com/video/14006308", // H조 1위-J조 2위
    "match-85": "https://chzzk.naver.com/video/14008538", // B조 1위-E/F/G/I/J조 3위
    "match-86": "https://chzzk.naver.com/video/14024062", // J조 1위-H조 2위
    "match-87": "https://chzzk.naver.com/video/14024866", // K조 1위-D/E/I/J/L조 3위
    "match-88": "https://chzzk.naver.com/video/14022980", // D조 2위-G조 2위
    "match-89": "https://chzzk.naver.com/video/14040738", // 파라과이-프랑스
    "match-90": "https://chzzk.naver.com/video/14039158", // 캐나다-모로코
    "match-91": "https://chzzk.naver.com/video/14056738", // 브라질-노르웨이
    "match-92": "https://chzzk.naver.com/video/14057875", // 멕시코-잉글랜드
    "match-93": "https://chzzk.naver.com/video/14071386", // 포르투갈-스페인
    "match-94": "https://chzzk.naver.com/video/14072446", // 미국-벨기에
    "match-95": "https://chzzk.naver.com/video/14085998", // 아르헨티나-이집트
    "match-96": "https://chzzk.naver.com/video/14087721" // 스위스-콜롬비아
    /* HL-AUTO-END */
  };
  // 하이라이트도 런타임 JSON(highlights.json)으로 갱신 — 토스 미니앱은 app.js를 번들 스냅샷으로 갖기 때문에, 빌드 이후 추가된 하이라이트가 안 보였음. 평점/주심과 동일하게 런타임 fetch로 양쪽(웹/토스) 자동 반영.
  (function () {
    if (!window.fetch) return;
    fetch("https://kicktalk.xyz/highlights.json?b=" + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d === "object") { for (var k in d) MATCH_HIGHLIGHTS[k] = d[k]; }
      var h = parseHash(); if (h.name === "match" && h.id) renderMatch(h.id);  // 도착 시 하이라이트 버튼 반영
    }).catch(function () {});
  })();
  // 녹아웃(32강~) 실제 대진 — 런타임 JSON(ko_teams.json)으로 교정. 예측 resolveKnockout이 실제와 다를 때(예: 독일-스웨덴 예측 → 실제 독일-파라과이) 실제 ESPN 팀으로 덮음. 라이브 폴링 윈도우 지난 종료경기도 교정됨.
  (function () {
    if (!window.fetch) return;
    fetch("https://kicktalk.xyz/ko_teams.json?b=" + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || typeof d !== "object") return;
      var any = false;
      for (var id in d) {
        var fx = fixturesById[id], t = d[id]; if (!fx || !t || !t.homeId || !t.awayId) continue;
        if (fx.homeId !== t.homeId || fx.awayId !== t.awayId) {
          fx.homeId = t.homeId; fx.awayId = t.awayId;
          fx.homeName = t.homeName || (teamsById[t.homeId] || {}).name || fx.homeName;
          fx.awayName = t.awayName || (teamsById[t.awayId] || {}).name || fx.awayName;
          any = true;
        }
        if (t.winId && KO_WIN[id] !== t.winId) { KO_WIN[id] = t.winId; any = true; }  // 진출팀(승부차기 승자) 반영 → 대진표 윗라운드 자동 채움
        fx._espnFixed = true;  // 예측 resolveKnockout이 다시 덮지 않게
      }
      if (any) { resolveKnockout(); var h = parseHash(); if (h.name === "match" && h.id) renderMatch(h.id); else if (onHomeSchedule()) renderSchedule(); else if (h.name === "home" && homeTab === "bracket") renderBracket(); else if (h.name === "kr32") renderKr32(); }
    }).catch(function () {});
  })();
  // 선수 평점 — 외부 JSON(match-ratings.json)에서 런타임 로드. 웹/토스 공통, .ait 재빌드 없이 평점만 갱신 가능(파일 push만으로 양쪽 반영).
  var MATCH_RATINGS = {};
  (function () {
    if (!window.fetch) return;
    fetch("https://kicktalk.xyz/match-ratings.json?b=" + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d === "object") MATCH_RATINGS = d;
      var h = parseHash();
      if (h.name === "rate") renderMatchRate(h.id); else if (h.name === "match") renderMatch(h.id);  // 로드 시 평점화면이면 다시 그려 반영
    }).catch(function () {});
  })();
  // 주심 정보(referees.json) — 이름→{country,flag,conf,yp(경기당옐로),rp(경기당레드),games}. ESPN officials 이름과 매칭. push만으로 웹/토스 반영.
  var REF_INFO = {};
  (function () {
    if (!window.fetch) return;
    fetch("https://kicktalk.xyz/referees.json?b=" + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d === "object") REF_INFO = d;
      var h = parseHash(); if (h.name === "match" && h.id) renderMatch(h.id);
    }).catch(function () {});
  })();
  // ESPN officials(주심) → 표시 HTML. REF_INFO에서 국가·카드성향 보강(정확 이름 우선, 성 매칭 백업).
  function refToks(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean); }
  function refInfoOf(nm) {
    if (!nm) return null;
    if (REF_INFO[nm]) return REF_INFO[nm];
    // 토큰 교집합 매칭 — ESPN 긴이름("Yael Falcón Pérez") vs 위키 short("Yael Falcón") 불일치 대비
    var nt = refToks(nm), best = null;
    Object.keys(REF_INFO).forEach(function (k) {
      var kt = refToks(k), inter = nt.filter(function (t) { return kt.indexOf(t) >= 0; });
      if (inter.length >= 2 && (!best || inter.length > best.n)) best = { k: k, n: inter.length };
    });
    return best ? REF_INFO[best.k] : null;
  }
  function refereeHtml(d) {
    var offs = (d && d.gameInfo && d.gameInfo.officials) || [];
    var ref = offs.filter(function (o) { return /referee/i.test((o.position && o.position.name) || ""); })[0] || offs[0];
    if (!ref) return "";
    var nm = ref.displayName || ref.fullName; if (!nm) return "";
    var info = refInfoOf(nm);
    var flag = info && info.flag ? info.flag + " " : "";
    var ctry = info && info.country ? esc(info.country) : "";
    var card = (info && info.yp != null) ? ' <span class="ref-card">경기당 🟨' + info.yp + (info.rp != null ? " 🟥" + info.rp : "") + (info.foulsPg != null ? " · 파울 " + info.foulsPg : "") + "</span>" : "";
    var games = (info && info.games) ? ' <span class="muted-note">· 통산 ' + info.games + "경기</span>" : "";
    var sex = info ? (info.sex === "F" ? "F" : "M") : null;  // referees.json sex 필드(여성=F). 중립 판사 아이콘 + 색 성별기호(♀분홍/♂파랑). 판사 ZWJ 이모지는 웹(트웨모지)에서 성별 구분이 모호해서 기호로 구분.
    var sym = sex === "F" ? ' <span class="ref-sym f">♀</span>' : sex === "M" ? ' <span class="ref-sym m">♂</span>' : "";
    return '<div class="ref-line">🧑‍⚖️' + sym + " 주심 <b>" + esc(nm) + "</b> " + flag + ctry + card + games + "</div>";
  }
  // 주심 HTML 보장: d(라인업 응답)에 ESPN gameInfo 있으면 즉시, 없으면(과거 DB본) ESPN summary 직접 조회해 officials 보강.
  function ensureRefHtml(fx, d) {
    if (d && d.gameInfo && d.gameInfo.officials && d.gameInfo.officials.length) return Promise.resolve(refereeHtml(d));
    if (!window.fetch) return Promise.resolve("");
    return resolveEspnId(fx).then(function (eid) {
      if (!eid) return "";
      if (summaryCache[eid] && summaryCache[eid].gameInfo && summaryCache[eid].gameInfo.officials && summaryCache[eid].gameInfo.officials.length) return refereeHtml(summaryCache[eid]);
      var sumFallback = function () { return fetch(ESPN_SUM + eid, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (e) { if (e && e.gameInfo) summaryCache[eid] = e; return refereeHtml(e); }).catch(function () { return ""; }); };
      // ESPN core API 우선 — 심판을 킥오프 무렵부터 제공(summary는 경기 진행돼야 채워져 더 늦음). officials 인라인(position.name/displayName)이라 refereeHtml 그대로 호환.
      return fetch("https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events/" + eid + "/competitions/" + eid + "/officials", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (o) { return (o && o.items && o.items.length) ? refereeHtml({ gameInfo: { officials: o.items } }) : sumFallback(); })
        .catch(sumFallback);
    }).catch(function () { return ""; });
  }

  function ratingOf(matchId, name) { var m = MATCH_RATINGS[matchId]; if (!m || !m.byName || !name) return null; if (m.byName[name] != null) return m.byName[name]; var sur = name.split(" ").pop(); return m.byName[sur] != null ? m.byName[sur] : null; }
  // 평점 색 — SofaScore식 풀팔레트(공통). 잔디 배지·팀평균·MVP카드 모두 이 함수 사용.
  function ratingHex(r) { return r >= 9 ? "#2e5bd6" : r >= 8 ? "#1aa5b8" : r >= 7 ? "#1aa55b" : r >= 6.5 ? "#c99a1c" : r >= 6 ? "#cc6b22" : "#cf4639"; }
  function ratingCls(r) { return r >= 9 ? "rb-elite" : r >= 8 ? "rb-great" : r >= 7 ? "rb-good" : r >= 6.5 ? "rb-ok" : r >= 6 ? "rb-mid" : "rb-low"; }
  function ratingBox(r, dec) { if (r == null) return ""; return '<span class="rbox ' + ratingCls(r) + '">' + r.toFixed(dec || 1) + "</span>"; }
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
      if (n) { if (needLogin("⭐ 선수 평점")) return; var sc = +n.getAttribute("data-rs-score"); (bg._mine === sc ? KickComments.unrateMatchPlayer(matchId, pid) : KickComments.rateMatchPlayer(matchId, pid, sc)).then(load); return; }
      if (e.target.closest(".rs-mvp")) { if (needLogin("🏆 MVP 투표")) return; (bg._mvpMine === pid ? KickComments.unvoteMvp(matchId) : KickComments.voteMvp(matchId, pid)).then(function () { ktToast(bg._mvpMine === pid ? "최고의 선수 취소" : "🏆 최고의 선수로 뽑았어요!"); load(); }); return; }
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
    var tap = mp ? ' data-player="' + esc(mp.id) + '"' : "";  // 라인업 선수 탭 → 선수 상세(평점은 하단 버튼에서만)
    return '<div class="lu-p' + (mp ? " clickable" : "") + '"' + tap + '><span class="lu-num">' + esc(num) + '</span><span class="lu-pmain"><span class="lu-nm">' + esc(nm) + gi + "</span>" + sub + "</span>" + (pos && !info && !oinfo ? '<span class="lu-pos">' + esc(pos) + "</span>" : "") + rb + "</div>";
  }
  function enToKo(name, teamKo) { var mp = playerByName(name || "", teamKo); return mp ? mp.name : (name || ""); }
  function luEvent(ev) {
    var evTeamKo = ev.team ? ((teamsById[espnTeamId(ev.team.displayName)] || {}).name) : null;  // 이벤트 팀 → 동명이인 매칭
    function nk(a) { return enToKo((a && a.displayName) || "", evTeamKo); }
    function jn(a) { var n = (a && a.displayName) || "", mp = playerByName(n, evTeamKo); var num = (mp && mp.number != null) ? mp.number : ((a && a.jersey != null && a.jersey !== "") ? a.jersey : ""); return (num !== "" ? num + " " : "") + enToKo(n, evTeamKo); }  // 등번호 + 이름 (예: "14 제이컵 새펄버그")
    var ty = ((ev.type && ev.type.type) || "").toLowerCase(), clk = (ev.clock && ev.clock.displayValue) || "";
    var parts = (ev.participants || ev.athletesInvolved || []).map(function (a) { return a.athlete; }).filter(Boolean);
    var icon, txt;
    if (/own.?goal/.test(ty)) { icon = "⚽"; txt = jn(parts[0]) + " 자책골"; }
    else if (/goal|scored/.test(ty) && !/missed|saved/.test(ty)) { icon = "⚽"; txt = jn(parts[0]) + " 골" + (parts[1] ? " (도움 " + jn(parts[1]) + ")" : ""); }
    else if (/yellow/.test(ty)) { icon = "🟨"; txt = jn(parts[0]) + " 경고"; }
    else if (/red/.test(ty)) { icon = "🟥"; txt = jn(parts[0]) + " 퇴장"; }
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
      '<div class="mstat-leg"><span class="ms-tm" data-team="' + esc(a.id) + '">' + esc(a.flag) + " " + esc(a.name) + '</span><span class="ms-tm" data-team="' + esc(b.id) + '">' + esc(b.name) + " " + esc(b.flag) + "</span></div>" + rows + "</div>";
  }
  function renderLineup(slot, d, a, b, fx) {
    var rosters = d.rosters || [];
    // ★방어: d(라인업 데이터)의 팀이 이 경기(a,b)와 다르면 렌더 거부 — 다른 경기 라인업 섞임 차단(동시 라이브 race·DB 오염 대비)
    var _rt = rosters.map(function (rs) { return espnTeamId(rs.team && rs.team.displayName); }).filter(Boolean);
    if (_rt.length && (_rt.indexOf(a.id) < 0 || _rt.indexOf(b.id) < 0)) { slot.innerHTML = ""; return; }
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
    if (SPOILER_ON) { slot.style.display = "none"; return; }  // 스포일러 방지: 실제 라인업·경기통계·주요이벤트(득점/카드) 숨김
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
        return '<div class="lu-subteam"><div class="lu-tn"' + (t ? ' data-team="' + esc(t.id) + '"' : "") + ">" + esc(nm) + '</div><div class="lu-list subs">' + subs.map(function (p) { return luPlayer(p, matchId, subInfo, _em.goals, fx && matchEnded(fx), outInfo, t && t.name); }).join("") + "</div></div>";
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
        var rc = ratingHex(p.r);  // 평점 색(공통 풀팔레트)
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
    if (SPOILER_ON) { viewEl.innerHTML = '<div class="spoiler-note">🙈 <b>스포일러 방지 모드</b><br>선수 평점은 경기 결과가 드러나서 숨겼어요.<br><span class="muted-note">오른쪽 위 🙈 버튼으로 끌 수 있어요.</span></div>'; return; }
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
      // 블록팀 기준 W/L/D — ESPN gameResult가 스코어와 불일치하는 경우가 있어(브라질 4:0인데 '패'로 표시) 스코어로 직접 판정.
      var gr = (!isNaN(bs) && !isNaN(os)) ? (bs > os ? "W" : bs < os ? "L" : "D") : e.gameResult;
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
    if (!window.KickComments) return;
    if (needLogin("📣 응원 메시지")) return;
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
  function mbSeenTs(u) { return u.last_active || u.last_seen || null; }  // 마지막 접속(없으면 마지막 활동 폴백, RPC가 greatest로 계산)
  function mbSeen(u) {
    var t = mbSeenTs(u); if (!t) return '<span class="mb-seen off">-</span>';
    var s = (Date.now() - new Date(t).getTime()) / 1000;
    var txt = s < 60 ? "방금" : s < 3600 ? Math.floor(s / 60) + "분" : s < 86400 ? Math.floor(s / 3600) + "시간" : s < 2592000 ? Math.floor(s / 86400) + "일" : Math.floor(s / 2592000) + "달";
    var cls = s < 86400 ? " hot" : "";  // 최근 24h 접속 강조
    return '<span class="mb-seen' + cls + '">' + txt + "</span>";
  }
  function membersTableHtml() {
    var us = (adminCache.users || []).slice();
    if (memberSort === "join") us.sort(function (a, b) { return (b.joined || "").localeCompare(a.joined || ""); });
    else if (memberSort === "points") us.sort(function (a, b) { return (b.points || 0) - (a.points || 0); });
    else if (memberSort === "seen") us.sort(function (a, b) { return (new Date(mbSeenTs(b) || 0)).getTime() - (new Date(mbSeenTs(a) || 0)).getTime(); });
    else us.sort(function (a, b) { return (b.comments + b.chats + b.ratings + b.posts) - (a.comments + a.chats + a.ratings + a.posts); });
    var sorts = '<div class="mb-sorts"><button class="mb-sort' + (memberSort === "act" ? " on" : "") + '" data-msort="act">활동순</button><button class="mb-sort' + (memberSort === "seen" ? " on" : "") + '" data-msort="seen">접속순</button><button class="mb-sort' + (memberSort === "points" ? " on" : "") + '" data-msort="points">포인트순</button><button class="mb-sort' + (memberSort === "join" ? " on" : "") + '" data-msort="join">가입순</button></div>';
    var head = '<div class="mb-row mb-head"><span class="mb-n">이름</span><span>가입</span><span>접속</span><span>포인트</span><span>댓글</span><span>채팅</span><span>평점</span><span>글</span></div>';
    var rows = us.length ? us.map(function (u) { return '<div class="mb-row mb-clk"' + (u.user_id ? ' data-auid="' + esc(u.user_id) + '"' : "") + '><span class="mb-n">' + esc(u.name) + '</span><span class="mb-j">' + (u.joined ? fmtJoin(u.joined) : "") + '</span><span>' + mbSeen(u) + '</span><span class="mb-pt">' + (u.points || 0).toLocaleString() + '</span><span>' + u.comments + '</span><span>' + u.chats + '</span><span>' + u.ratings + '</span><span>' + u.posts + "</span></div>"; }).join("") : '<div class="empty">회원이 없습니다.</div>';
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
    var form = IS_TOSS ? '<div class="bd-toss-note">✍️ 글쓰기는 토스 로그인 기능이 열리면 이용할 수 있어요. 지금은 읽기 · 좋아요 · 댓글은 자유롭게 가능해요.</div>' : '<div class="pf-write"><div class="pf-wrow"><select class="pf-wcat">' +
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
    if (IS_TOSS) return;  // 토스 미니앱: '친구에게 공유' 넛지 팝업 숨김(외부 공유)
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
  // 전면광고 빈도: 화면 이동 카운트로 첫 5번째, 이후 15마다, 세션 최대 4회(첫 진입 즉시 노출은 토스 정책 위반+이탈 → 금지)
  var _navCount = 0, _adShownCount = 0, AD_FIRST = 20, AD_EVERY = 25, AD_MAX = 4;
  function maybeShowInterstitial() {
    if (!IS_TOSS || !TOSS_AD_GROUP || _adShownCount >= AD_MAX) return;
    if (_navCount >= AD_FIRST + AD_EVERY * _adShownCount) { _adShownCount++; tossShowAd(); }  // 0회→20, 1회→45, 2회→70, 3회→95
  }
  function route() {
    var _kb = document.getElementById("kt-boot"); if (_kb) _kb.remove();  // 첫 렌더 시 부팅 스플래시 제거
    var r = parseHash();
    var _sw = document.querySelector(".search-wrap"); if (_sw) _sw.hidden = (r.name !== "search");  // 상단 검색창은 검색 탭에서만(일정·경기상세 등은 하단 검색탭으로 일원화)
    _navCount++; maybeShowInterstitial();  // 화면 이동마다 카운트 → 임계 도달 시 전면광고
    // 스크롤 복원: 뒤로가기(_isPop)면 기억된 위치로, 아니면 맨위.
    var _restoreMem = (_isPop && _scrollMem.hasOwnProperty(hkey())) ? _scrollMem[hkey()] : 0;
    _isPop = false;
    restoreScroll(_restoreMem);
    stopMatchLive();
    if (r.name === "player") { setTabbar(""); renderPlayer(r.id); renderRating(r.id); mountCmt("player:" + r.id); bumpEngage(); return; }
    if (r.name === "compare") { setTabbar(""); renderCompare(r.a, r.b); return; }
    if (r.name === "rate") { setTabbar(""); renderMatchRate(r.id); return; }
    if (r.name === "team") { setTabbar(""); renderTeam(r.id); mountCmt("team:" + r.id); return; }
    if (r.name === "match") { setTabbar(""); renderMatch(r.id); mountCmt("match:" + r.id, viewEl.querySelector(".cmt-slot")); bumpEngage(); return; }
    if (r.name === "manager") { setTabbar(""); return renderManager(r.id); }
    if (r.name === "scenario") { setTabbar(""); return renderScenario(r.id); }
    if (r.name === "kr32") { setTabbar(""); return renderKr32(); }
    if (r.name === "groupscn") { setTabbar(""); return renderGroupScenario(r.id); }
    if (r.name === "fifa") { setTabbar(""); return renderFifa(); }
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
    var _ext = e.target.closest("[data-ext]");  // 외부 링크(치지직 등): 토스는 openURL(외부 브라우저), 웹은 새 탭
    if (_ext) { var _u = _ext.getAttribute("data-ext"); if (_u) { if (IS_TOSS && window.tossOpenUrl) window.tossOpenUrl(_u); else window.open(_u, "_blank", "noopener"); } return; }
    if (e.target.closest("[data-tiehelp]")) { tieRulePopup(); return; }  // 승점 동률 순위결정 규칙 팝업
    var _vv = e.target.closest("[data-venue]"); if (_vv) { venueModal(_vv.getAttribute("data-venue")); return; }  // 경기장 정보 팝업
    if ((my = e.target.closest(".my-admin"))) { go("admin"); return; }
    if ((my = e.target.closest(".rate-star"))) {  // 선수 평점 = 익명 허용(로그인 불필요, 기기별 1회)
      if (!window.KickComments) return;
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
      if (!window.KickComments) return;  // 익명도 좋아요 가능(기기별, anon_reactions) — 로그인 불요
      var ritem = my.closest(".pf-item"); if (!ritem) return;
      var rpid = ritem.getAttribute("data-pid"), rval = parseInt(my.getAttribute("data-rv"), 10);
      var rcur = (boardCache && boardCache.mine && boardCache.mine[rpid]) || 0;
      var newVal = (rcur === rval) ? 0 : rval;
      // 낙관적 제자리 업데이트(전체 재렌더 X → 스크롤 위치 유지)
      if (boardCache) {
        boardCache.mine = boardCache.mine || {}; boardCache.mine[rpid] = newVal;
        var s = boardCache.stats[rpid] || (boardCache.stats[rpid] = { likes: 0, dislikes: 0, comments: 0 });
        if (rcur === 1) s.likes = Math.max(0, s.likes - 1); else if (rcur === -1) s.dislikes = Math.max(0, s.dislikes - 1);
        if (newVal === 1) s.likes++; else if (newVal === -1) s.dislikes++;
        var lb = ritem.querySelector(".pf-like"), db = ritem.querySelector(".pf-dislike");
        if (lb) { lb.classList.toggle("on", newVal === 1); var lsp = lb.querySelector("span"); if (lsp) lsp.textContent = s.likes; }
        if (db) { db.classList.toggle("on", newVal === -1); var dsp = db.querySelector("span"); if (dsp) dsp.textContent = s.dislikes; }
      }
      KickComments.togglePostReaction(rpid, rval, rcur).catch(function () { renderBoard(); });  // 실패 시에만 재동기화
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
    if (mvb) { if (needLogin("🏆 MVP 투표")) return; var mpid = mvb.getAttribute("data-mvp-pid"); (mrCtx.mvpMine === mpid ? KickComments.unvoteMvp(mrCtx.matchId) : KickComments.voteMvp(mrCtx.matchId, mpid)).then(refreshMatchRatings); return; }
    var shc = e.target.closest(".share-card");
    if (shc) { var shp = playersById[shc.getAttribute("data-share-card")]; if (shp) sharePlayerCard(shp); return; }
    var shm = e.target.closest("[data-share-match]");
    if (shm) { var shf = fixturesById[shm.getAttribute("data-share-match")]; if (shf) shareMatch(shf); return; }
    var rsh = e.target.closest("[data-result-share]");
    if (rsh) { var rsf = fixturesById[rsh.getAttribute("data-result-share")]; if (rsf) shareMatchResult(rsf); return; }
    if (e.target.closest("[data-scn-share]")) { shareScenario(); return; }
    var cgo = e.target.closest(".cmp-go"); if (cgo) { go("compare/" + cgo.getAttribute("data-cmp-go")); return; }
    var rgo = e.target.closest("[data-rate-go]"); if (rgo) { go("rate/" + rgo.getAttribute("data-rate-go")); return; }
    var cpk = e.target.closest("[data-cmp-pick]"); if (cpk) { go("compare/" + cmpA + "/" + cpk.getAttribute("data-cmp-pick")); return; }
    var cch = e.target.closest(".cmp-change"); if (cch) { go("compare/" + cch.getAttribute("data-cmp-change")); return; }
    var k32 = e.target.closest("[data-kr32go]"); if (k32) { go("kr32"); return; }  // 한국 32강 가려면? 페이지
    var sg = e.target.closest("[data-scngo]"); if (sg) { go("scenario"); return; }  // 한국 경우의 수 진입
    var gsg = e.target.closest("[data-grpscn]"); if (gsg) { go("groupscn/" + gsg.getAttribute("data-grpscn")); return; }  // 조별 경우의 수 페이지 진입
    var fg = e.target.closest("[data-fifago]"); if (fg) { go("fifa"); return; }  // FIFA 랭킹 페이지 진입
    var fe = e.target.closest("[data-fifaexp]");  // FIFA 랭킹 행 펼치기(최근 경기)
    if (fe) { var fid = fe.getAttribute("data-fifaexp"), det = document.getElementById("fde-" + fid); if (det) { if (det.hasAttribute("hidden")) { det.innerHTML = fifaTeamFix(fid); det.removeAttribute("hidden"); fe.textContent = "▴"; twem(det); } else { det.setAttribute("hidden", ""); fe.textContent = "▾"; } } return; }
    var fnq = e.target.closest("[data-fifa-nq]");
    if (fnq) { ktToast((fnq.getAttribute("data-fifa-nq") || "이 나라") + "는 이번 월드컵 출전국이 아니에요"); return; }
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
    try { cur = localStorage.getItem(KEY) || "light"; } catch (e) {}  // 디폴트 라이트모드(OS설정 무시, 저장된 선택은 유지)
    apply(cur);
    var btn = document.getElementById("themeBtn");
    if (btn) btn.addEventListener("click", function () {
      cur = document.documentElement.classList.contains("light") ? "dark" : "light";
      try { localStorage.setItem(KEY, cur); } catch (e) {}
      apply(cur);
    });
  })();

  // ===== 스포일러 방지 모드 토글 — 기본 ON, localStorage(kt_spoiler) =====
  (function () {
    function apply() {
      var b = document.getElementById("spoilerBtn");
      if (b) { b.textContent = SPOILER_ON ? "🙈" : "👀"; b.title = SPOILER_ON ? "스포일러 방지: 켜짐 (결과 숨김)" : "스포일러 방지: 꺼짐 (결과 표시)"; b.classList.toggle("on", SPOILER_ON); }
    }
    apply();
    var btn = document.getElementById("spoilerBtn");
    if (btn) btn.addEventListener("click", function () {
      SPOILER_ON = !SPOILER_ON;
      try { localStorage.setItem("kt_spoiler", SPOILER_ON ? "1" : "0"); } catch (e) {}
      apply();
      ktToast(SPOILER_ON ? "🙈 스포일러 방지 켜짐 — 경기 결과를 숨겨요" : "👀 스포일러 방지 꺼짐 — 결과가 표시돼요");
      route();  // 현재 화면 즉시 다시 그림
    });
  })();

  // ===== 첫 방문 인트로 오버레이 — 스포일러 방지 모드 안내(1회, localStorage kt_intro) =====
  (function () {
    try { if (localStorage.getItem("kt_intro") === "1") return; } catch (e) {}
    function setSpoiler(on) {
      SPOILER_ON = on;
      try { localStorage.setItem("kt_spoiler", on ? "1" : "0"); } catch (e) {}
      var b = document.getElementById("spoilerBtn");
      if (b) { b.textContent = on ? "🙈" : "👀"; b.classList.toggle("on", on); }
      route();
    }
    function show() {
      if (document.getElementById("introOv")) return;
      var sb = document.getElementById("spoilerBtn"); if (sb) sb.classList.add("pulse");
      var ov = document.createElement("div");
      ov.className = "intro-ov"; ov.id = "introOv";
      ov.innerHTML =
        '<div class="intro-card">' +
          '<div class="intro-emoji">🙈</div>' +
          '<div class="intro-title">스포일러 방지 모드가 켜져 있어요</div>' +
          '<div class="intro-body">경기 <b>스코어·순위·대진 결과</b>를 미리 안 보이게 가려뒀어요.<br>나중에 몰아볼 때 김 안 새도록요. (하이라이트 링크는 그대로 볼 수 있어요)</div>' +
          '<div class="intro-hint">오른쪽 위 <b>🙈</b> 버튼으로 언제든 켜고 끌 수 있어요 ☝️</div>' +
          '<div class="intro-btns">' +
            '<button class="intro-btn primary" id="introKeep">이대로 볼게요 · 결과 숨김</button>' +
            '<button class="intro-btn" id="introOff">결과 바로 볼래요</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(ov);
      twem(ov);
      function close() { try { localStorage.setItem("kt_intro", "1"); } catch (e) {} if (sb) sb.classList.remove("pulse"); if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.querySelector("#introKeep").addEventListener("click", function () { close(); });
      ov.querySelector("#introOff").addEventListener("click", function () { close(); setSpoiler(false); ktToast("👀 결과가 표시돼요 — 🙈 버튼으로 다시 숨길 수 있어요"); });
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    }
    // 부팅 스플래시 제거 + 앱 첫 렌더 뒤 잠깐 후 표시
    setTimeout(show, 800);
  })();

  // ===== 모달 뒤로가기 닫기 (응원하기·채팅) — 열 때 history state push, 뒤로가기면 페이지 대신 모달 닫기 =====
  var ktModalClose = null;
  function ktModalOpen(closeFn) { ktModalClose = closeFn; try { history.pushState({ ktModal: 1 }, ""); } catch (e) {} }
  window.addEventListener("popstate", function () { if (ktModalClose) { var f = ktModalClose; ktModalClose = null; f(); return; } _isPop = true; });  // 모달 아닌 실제 뒤로가기 → 스크롤 복원

  // ===== 후원(응원하기) =====
  (function () {
    var btn = document.getElementById("donateBtn"); if (!btn) return;
    if (IS_TOSS) {  // 토스 미니앱: 외부 송금링크 금지 → 토스페이 인앱결제(IAP). 상품(이름/금액/sku)은 콘솔 등록값을 main.ts의 products()로 받아 표시
      if (!window.__TOSS_IAP__) { btn.style.display = "none"; return; }  // 인앱결제 준비 전엔 후원 숨김
      function amtNum(s) { var m = String(s || "").replace(/[^\d]/g, ""); return m ? +m : 0; }  // "3,600원" → 3600 (정렬용)
      btn.addEventListener("click", function () {
        var ov = document.createElement("div"); ov.className = "donate-ov on";
        ov.innerHTML = '<div class="donate-sheet"><button class="ds-x" aria-label="닫기">✕</button><div class="ds-title">⚽ 개발자에게 한 골!</div><div class="ds-sub">여러분의 응원이 킥톡을 계속 뛰게 합니다 🙌</div><div class="ds-tiers"><div class="ds-loading"><span class="ds-spin"></span>상품 불러오는 중…</div></div><div class="ds-status"></div><div class="ds-note muted-note">토스페이로 안전하게 후원돼요 💙</div></div>';
        document.body.appendChild(ov); twem(ov);
        // 콘솔 등록 상품 목록을 받아 금액 오름차순으로 표시(토스 상품 기준 — 이름/금액 그대로)
        (window.tossPay && window.tossPay.products ? window.tossPay.products() : Promise.resolve([])).then(function (list) {
          var box = ov.querySelector(".ds-tiers"); if (!box) return;
          if (!list || !list.length) { box.innerHTML = '<div class="muted-note">상품을 불러오지 못했어요. 토스 앱에서 다시 시도해주세요.</div>'; return; }
          list = list.slice().sort(function (a, b) { return amtNum(a.displayAmount) - amtNum(b.displayAmount); });
          box.innerHTML = list.map(function (p) { return '<button class="ds-tier" data-sku="' + esc(p.sku) + '"><span>' + esc(p.displayName) + "</span><b>" + esc(p.displayAmount) + "</b></button>"; }).join("");
          twem(box);
        }).catch(function () { var box = ov.querySelector(".ds-tiers"); if (box) box.innerHTML = '<div class="muted-note">상품을 불러오지 못했어요.</div>'; });
        ov.addEventListener("click", function (e) {
          if (e.target === ov || e.target.closest(".ds-x")) { ov.remove(); return; }
          var tb = e.target.closest(".ds-tier"); if (!tb) return;
          var sku = tb.getAttribute("data-sku");
          if (sku && window.tossPay && window.tossPay.donate) { window.tossPay.donate(sku); ov.remove(); }
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
    try { var oh = (e.oldURL && e.oldURL.indexOf("#") >= 0) ? e.oldURL.slice(e.oldURL.indexOf("#")) : "#"; _scrollMem[oh] = { y: window.scrollY, anchor: captureAnchor() }; } catch (_) {}  // 떠나는 화면 스크롤+앵커 저장
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
    function isKakao() { return /KAKAOTALK/i.test(navigator.userAgent); }  // 카카오 인앱브라우저(설치 불가 → 기본브라우저로)
    function openExternal() {  // 카카오 인앱 → 기기 기본 브라우저로 현재 URL 열기(안드로이드·아이폰 공통)
      try { location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href); } catch (e) {}
    }
    function flag(s) { try { return localStorage.getItem("kk_install_never") === "1" || sessionStorage.getItem("kk_install_closed") === "1"; } catch (e) { return false; } }
    function hide(bn) { bn.classList.remove("on"); setTimeout(function () { if (bn.parentNode) bn.parentNode.removeChild(bn); }, 250); }
    function show() {
      if (shown || isStandalone() || flag() || document.getElementById("kk-install")) return;
      if (!deferred && !isIOS() && !isAndroid()) return;  // 모바일(설치 가능 환경)에서만. 안드로이드는 프롬프트 or 메뉴안내 폴백
      shown = true;
      var kak = isKakao(), ios = isIOS();
      var label = ios ? "홈 화면에 추가" : (kak ? "브라우저로 열기" : "설치");  // 애플=홈화면추가 통일
      var subtx = ios ? "홈 화면에 추가하면 앱처럼 빠르게" : (kak ? "기본 브라우저로 열면 설치할 수 있어요" : "홈 화면에서 바로 실행 · 주소창 없이");
      var bn = document.createElement("div"); bn.className = "kk-install"; bn.id = "kk-install";
      bn.innerHTML = '<img class="kki-ic" src="apple-touch-icon.png" alt="킥톡">' +
        '<div class="kki-tx"><b>킥톡 앱으로 추가</b><span>' + subtx + '</span><a class="kki-never">다시 보지 않기</a></div>' +
        '<button class="kki-btn">' + label + '</button><button class="kki-x" aria-label="닫기">✕</button>';
      document.body.appendChild(bn);
      requestAnimationFrame(function () { bn.classList.add("on"); });
      bn.querySelector(".kki-x").addEventListener("click", function () { try { sessionStorage.setItem("kk_install_closed", "1"); } catch (e) {} hide(bn); });
      bn.querySelector(".kki-never").addEventListener("click", function () { try { localStorage.setItem("kk_install_never", "1"); } catch (e) {} hide(bn); });
      bn.querySelector(".kki-btn").addEventListener("click", function () {
        if (ios) { iosGuide(kak); return; }  // 애플: 인앱이든 사파리든 '홈 화면에 추가' 안내
        if (kak) { openExternal(); return; }  // 안드 카카오 인앱 → 기본 브라우저로(거기서 설치)
        if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; hide(bn); }); }  // 크롬 등 원터치
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
    function iosGuide(inApp) {
      if (document.getElementById("kk-ios")) return;
      if (inApp) {  // 아이폰 인앱(카카오 등): Safari로 열어야 추가 가능
        sheet('<b>홈 화면에 추가하기</b><div class="kki-step"><span class="kki-sn">1</span><span>먼저 <b>Safari로 열기</b> (아래 버튼)</span></div><div class="kki-step"><span class="kki-sn">2</span><span>Safari에서 <b>공유 ⬆️</b> → <b>홈 화면에 추가 ➕</b></span></div><button class="kki-safari" style="width:100%;background:var(--accent);color:#fff;font-weight:800;font-size:14px;padding:11px;border:0;border-radius:10px;cursor:pointer;margin:4px 0 10px">Safari로 열기</button>');
        var sb = document.querySelector(".kki-safari"); if (sb) sb.addEventListener("click", openExternal);
      } else {  // 아이폰 Safari
        sheet('<b>홈 화면에 추가하기</b><div class="kki-step"><span class="kki-sn">1</span><span>아래 <b>공유 ⬆️</b> 버튼 누르기</span></div><div class="kki-step"><span class="kki-sn">2</span><span><b>홈 화면에 추가 ➕</b> 선택</span></div>');
      }
    }
    function menuGuide() {  // 삼성 인터넷·기타 안드로이드 브라우저 — 설치 프롬프트 미지원 시 메뉴 안내
      if (document.getElementById("kk-ios")) return;
      sheet('<b>홈 화면에 추가하기</b><div class="kki-step"><span class="kki-sn">1</span><span>브라우저 메뉴 <b>(≡ 또는 ⋮)</b> 열기</span></div><div class="kki-step"><span class="kki-sn">2</span><span><b>현재 페이지를 홈 화면에 추가</b> 선택</span></div>');
    }
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; show(); });
    // iOS·삼성 등은 프롬프트 없거나 늦으니 로드 후 폴백으로 배너 노출(프롬프트 오면 위에서 먼저 뜸)
    if (isIOS() || isAndroid()) window.addEventListener("load", function () { setTimeout(show, 2800); });
  })();

  // 토스 미니앱은 .ait 번들이 최신 코드를 제공 — SW 캐시가 구버전을 붙들면 안 되므로 등록 해제 + 캐시 삭제(이전에 등록된 SW 정리)
  if (IS_TOSS) {
    try { if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {}); } catch (e) {}
    try { if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }).catch(function () {}); } catch (e) {}
  }
  // 서비스워커 (PWA 웹에서만, http(s)) — 새 버전 배포 시 자동 새로고침(캐시된 옛 화면 방지). 토스에선 등록 안 함.
  if (!IS_TOSS && "serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
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

  // 라인업 선수 즉시 소속팀 툴팁 — data-club 요소 위에서 지연 없이 표시(네이티브 title은 느림)
  (function () {
    var tip = null;
    function show(el, e) {
      if (!tip) { tip = document.createElement("div"); tip.className = "mf-tip"; document.body.appendChild(tip); }
      tip.textContent = el.getAttribute("data-club");
      tip.style.display = "block";
      var w = tip.offsetWidth, x = e.clientX + 14, y = e.clientY + 16;
      if (x + w > window.innerWidth - 6) x = e.clientX - w - 14;
      if (x < 4) x = 4;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }
    function hide() { if (tip) tip.style.display = "none"; }
    document.addEventListener("mousemove", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-club]") : null;
      if (el) show(el, e); else hide();
    }, { passive: true });
    window.addEventListener("blur", hide);
  }());

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
    fetch("https://kicktalk.xyz/news.json?ts=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
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
    var ch = null, open = false, pollT = null;
    var msgs = [], seenIds = {}, oldestId = null, newestId = null, loadingOld = false, noMore = false;
    var INIT = 30, PAGE = 30;  // 초기 소량 → 빠른 첫 표시, 위로 스크롤 시 이전 페이지
    function msgsEl() { return panel.querySelector(".chat-msgs"); }
    function resetChat() { msgs = []; seenIds = {}; oldestId = null; newestId = null; loadingOld = false; noMore = false; }
    function addMsgs(list, where) {  // where: 'old'(앞에) | 그 외(뒤에) — 중복 id 제거
      var added = [];
      list.forEach(function (x) { if (!seenIds[x.id]) { seenIds[x.id] = 1; added.push(x); } });
      if (!added.length) return added;
      msgs = (where === "old") ? added.concat(msgs) : msgs.concat(added);
      msgs.sort(function (a, b) { return a.id - b.id; });
      oldestId = msgs[0].id; newestId = msgs[msgs.length - 1].id;
      return added;
    }
    function paintChat(scrollMode) {  // 'bottom' | 'keep'(스크롤 위치 유지=이전로드) | null
      var m = msgsEl(); if (!m) return;
      if (!msgs.length) { m.innerHTML = '<div class="chat-empty">아직 메시지가 없어요.<br>첫 메시지를 남겨보세요!</div>'; return; }
      var prevH = m.scrollHeight, prevTop = m.scrollTop;
      m.innerHTML = msgs.map(bubble).join("");
      twem(m);
      if (scrollMode === "bottom") m.scrollTop = m.scrollHeight;
      else if (scrollMode === "keep") m.scrollTop = prevTop + (m.scrollHeight - prevH);  // 위에 붙은 만큼 보정 → 읽던 위치 유지
    }
    var preloaded = false;
    function initialLoad() {
      return KickComments.chatRecent(INIT).then(function (list) {
        resetChat(); addMsgs(list, "init");
        if (list.length < INIT) noMore = true;
        preloaded = true;
        paintChat(open ? "bottom" : null);  // 열려있으면 바로 맨아래로, 프리로드(닫힘)면 DOM만 채워둠(숨김 상태)
      });
    }
    function loadNewMsgs() {  // 폴링/실시간 — 새 메시지만 가볍게
      if (!open || newestId == null) return;
      KickComments.chatNewer(newestId, 80).then(function (list) {
        if (!open || !list.length) return;
        var m = msgsEl(); var atBottom = m ? (m.scrollHeight - m.scrollTop - m.clientHeight < 80) : true;
        if (addMsgs(list, "new").length) paintChat(atBottom ? "bottom" : "keep");
      }).catch(function () {});
    }
    function loadOlderMsgs() {  // 위로 스크롤 → 이전 페이지
      if (loadingOld || noMore || oldestId == null || !open) return;
      loadingOld = true;
      KickComments.chatRecent(PAGE, oldestId).then(function (list) {
        loadingOld = false; if (!open) return;
        if (!list.length) { noMore = true; return; }
        if (list.length < PAGE) noMore = true;
        if (addMsgs(list, "old").length) paintChat("keep");
      }).catch(function () { loadingOld = false; });
    }
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
    function toggle() {
      open = !open; panel.hidden = !open; fab.classList.toggle("open", open); fab.innerHTML = open ? "✕" : "💬"; twem(fab);
      if (open) {
        if (preloaded) {  // 프리로드 완료 → 즉시 표시 후 새 메시지만 보충
          paintChat("bottom"); loadNewMsgs();
        } else {
          msgsEl().innerHTML = '<div class="chat-empty">불러오는 중…</div>';
          var fired = false;
          function go() { if (fired) return; fired = true; initialLoad().catch(function () {}); }
          KickComments.ready().then(go).catch(function () {  // SDK 로드/세션 검증 실패 → 영구 "불러오는 중" 방지: 재시도 버튼
            fired = true;  // 5초 타임아웃의 빈 렌더가 재시도 버튼 덮어쓰지 않게
            var m = msgsEl(); if (!m || !open) return;
            m.innerHTML = '<div class="chat-empty">채팅을 불러오지 못했어요.<br><button class="chat-retry" type="button" style="margin-top:8px">다시 시도</button></div>';
            var rb = m.querySelector(".chat-retry"); if (rb) rb.addEventListener("click", function () { msgsEl().innerHTML = '<div class="chat-empty">불러오는 중…</div>'; fired = false; KickComments.ready().then(go).catch(function () {}); setTimeout(go, 5000); });
          });
          setTimeout(go, 5000);  // ready()가 5초 내 안 끝나면(세션 검증 hang 등) 메시지라도 먼저 로드 — SDK는 이미 떠 있어 chatRecent 동작
        }
        ch = KickComments.chatSubscribe(function () { loadNewMsgs(); });  // 실시간 신호 → 새 메시지만 가볍게
        pollT = setInterval(function () { loadNewMsgs(); }, 6000);        // 백업 폴링(새 메시지만)
      } else {
        if (ch) { KickComments.chatUnsubscribe(ch); ch = null; }
        if (pollT) { clearInterval(pollT); pollT = null; }
      }
    }
    // 위로 스크롤 시 이전 메시지 페이지 로드(맨 위 근처)
    msgsEl().addEventListener("scroll", function () { if (this.scrollTop < 60) loadOlderMsgs(); });
    function send() {
      var inp = panel.querySelector(".chat-in"); var v = (inp.value || "").trim(); if (!v) return;
      inp.disabled = true;
      KickComments.chatSend(v).then(function (r) {
        inp.disabled = false;
        if (r && r.error) { var em = String(r.error.message || ""); alert(/banned/.test(em) ? "이용이 제한된 계정입니다." : /rate_limit/.test(em) ? "너무 빠르게 보내고 있어요. 잠시 후." : /has_link/.test(em) ? "링크는 보낼 수 없어요." : /blocked_word/.test(em) ? "부적절한 내용이에요." : "전송 실패"); return; }
        inp.value = ""; inp.focus(); loadNewMsgs();  // 보낸 메시지 즉시 반영(실시간 신호 대기 안 함)
      }).catch(function () { inp.disabled = false; alert("전송 실패"); });
    }
    fab.addEventListener("click", function () { if (open) { if (ktModalClose) history.back(); else toggle(); } else { toggle(); ktModalOpen(function () { if (open) toggle(); }); } });
    // 채팅 열려있을 때 바깥(패널·버블 외부) 누르면 닫기
    document.addEventListener("pointerdown", function (e) { if (open && !panel.contains(e.target) && !fab.contains(e.target)) { if (ktModalClose) history.back(); else toggle(); } });
    panel.querySelector(".chat-close").addEventListener("click", function () { if (ktModalClose) history.back(); else toggle(); });
    panel.querySelector(".chat-send").addEventListener("click", send);
    panel.querySelector(".chat-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); send(); } });
    // 버튼 누르기 전 백그라운드 프리로드 — 첫 페인트 끝난 뒤(2.5초) 최근 메시지를 미리 받아둠 → 열 때 즉시 표시
    setTimeout(function () { if (!preloaded && !open) KickComments.ready().then(function () { if (!preloaded && !open) initialLoad().catch(function () {}); }).catch(function () {}); }, 2500);
  })();

  // 토스트 + 일일 출석 +200 KP
  // 로그인 필요 동작(평점·MVP) — 토스에선 OAuth 차단이라 조용히 무시 대신 "추후 토스 로그인" 안내. 비로그인 웹은 기존 promptLogin.
  function needLogin(tossMsg) {
    if (KickComments.user && KickComments.user()) return false;
    if (IS_TOSS) ktToast(tossMsg + " — 추후 토스 로그인 기능이 추가되면 이용할 수 있어요");
    else if (window.KickComments) KickComments.promptLogin();
    return true;
  }
  // 토스트 — 연타/중복 방지(debounce): 떠 있으면 새로 안 쌓고 텍스트 갱신 + 사라짐 타이머만 리셋. 모든 토스트가 이 함수 하나를 거침.
  var _toastEl = null, _toastT1 = null, _toastT2 = null;
  function ktToast(msg) {
    if (_toastEl && _toastEl.parentNode) {  // 이미 표시 중 → 같은 엘리먼트 재사용(연타해도 하나만)
      clearTimeout(_toastT1); clearTimeout(_toastT2);
      _toastEl.textContent = msg; _toastEl.classList.add("show");
    } else {
      _toastEl = document.createElement("div"); _toastEl.className = "kt-toast"; _toastEl.textContent = msg;
      document.body.appendChild(_toastEl);
      var t0 = _toastEl; setTimeout(function () { t0.classList.add("show"); }, 10);
    }
    var cur = _toastEl;
    _toastT1 = setTimeout(function () {
      cur.classList.remove("show");
      _toastT2 = setTimeout(function () { if (cur.parentNode) cur.remove(); if (_toastEl === cur) _toastEl = null; }, 300);
    }, 3500);
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
