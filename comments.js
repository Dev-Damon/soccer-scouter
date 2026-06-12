/* ============================================================================
 * comments.js — 킥톡 댓글 모듈 (Supabase · 정적 PWA · 백엔드 없음)
 *
 * 활성화 방법:
 *   1) Supabase 프로젝트의 URL / anon key 를 아래 CONFIG 에 입력
 *   2) index.html <head> 또는 body 끝에 supabase-js + 이 파일 로드:
 *        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *        <script src="comments.js"></script>
 *   3) 페이지 렌더 끝에서 마운트(예: 선수/경기/나라 상세):
 *        KickComments.mount(containerEl, "player:son-heung-min")
 *        KickComments.mount(containerEl, "match:match-2")
 *        KickComments.mount(containerEl, "team:south-korea")
 *
 * CONFIG 가 비어 있으면 "댓글 준비 중" 안내만 표시(사이트 깨지지 않음).
 * 보안은 Supabase RLS(comments.sql)에서 처리 — anon key 공개는 안전.
 * ==========================================================================*/
(function () {
  "use strict";

  var CONFIG = {
    url: "https://jhzchgvnkwdroxfrgjvm.supabase.co",
    anonKey: "sb_publishable_AsDWJPjKDg1S5wqezB9Vtw_uxKFmE26"  // Supabase publishable(=공개 anon) key — RLS로 보호되어 공개 안전
  };

  // 간단 욕설 마스킹(필요 시 확장). RLS/신고와 병행.
  var BADWORDS = ["시발", "씨발", "씨바", "시바", "쌍놈", "쌍년", "개새끼", "개색", "개세끼", "병신", "븅신", "좆", "좇", "존나", "니애미", "느금", "씹", "보지", "자지", "썅", "꺼져", "닥쳐", "지랄", "썅놈", "fuck", "fuckin", "shit", "bitch", "asshole", "nigger"];

  var sb = null;
  var user = null;
  var stylesInjected = false;
  var ADMIN_UID = "257f98fc-fc1f-4701-b310-ecc4b7fdb6be";  // 관리자(실제 권한은 서버 RLS가 강제, id 노출 안전)
  var sortMode = "likes";  // 'likes'(기본) | 'latest'
  var GICON = '<svg class="gico" width="15" height="15" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>';

  function configured() { return !!(CONFIG.url && CONFIG.anonKey); }

  // supabase-js SDK 를 필요할 때(설정됨 + 마운트 시)만 동적 로드 — 미설정 시 로드 안 함
  var sdkPromise = null;
  function loadSDK() {
    if (window.supabase) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = function () { resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return sdkPromise;
  }
  // 실제로 Supabase에서 켜진 로그인 제공자만 버튼 표시(미설정 제공자 버튼 숨김)
  var PROVIDERS = null;
  function loadProviders() {
    if (PROVIDERS) return Promise.resolve(PROVIDERS);
    return fetch(CONFIG.url + "/auth/v1/settings", { headers: { apikey: CONFIG.anonKey } })
      .then(function (r) { return r.json(); })
      .then(function (d) { PROVIDERS = (d && d.external) || {}; return PROVIDERS; })
      .catch(function () { PROVIDERS = { google: true }; return PROVIDERS; });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mask(body) {
    var b = String(body || "");
    BADWORDS.forEach(function (w) {
      if (!w) return;
      var re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      b = b.replace(re, function (m) { return new Array(m.length + 1).join("*"); });
    });
    return b;
  }
  function timeago(iso) {
    try {
      var s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 60) return "방금";
      if (s < 3600) return Math.floor(s / 60) + "분 전";
      if (s < 86400) return Math.floor(s / 3600) + "시간 전";
      return Math.floor(s / 86400) + "일 전";
    } catch (e) { return ""; }
  }
  var profile = null;  // {nickname}
  function uname(u) {
    if (profile && profile.nickname) return profile.nickname;
    var m = (u && u.user_metadata) || {};
    return m.name || m.full_name || m.nickname || (u && u.email) || "익명";
  }
  function avatarOf(u) { var m = (u && u.user_metadata) || {}; return m.avatar_url || m.picture || null; }
  // 본명 노출 방지: 가운데 글자 * 마스킹 (홍길동→홍*동, 남궁민수→남**수, John→J**n)
  function maskName(n) {
    n = String(n || "").trim(); if (!n) return "익명";
    return n.split(/\s+/).map(function (w) { return w.length <= 1 ? w : w.length === 2 ? w[0] + "*" : w[0] + new Array(w.length - 1).join("*") + w[w.length - 1]; }).join(" ");
  }
  // 로그인 사용자(user_id 있음) 표시명은 마스킹, 익명(랜덤닉)은 그대로
  function dispName(name, userId) { return userId ? maskName(name) : (name || "익명"); }
  // 포인트 등급(티어)
  var TIERS = [
    { min: 0, name: "브론즈", c: "#cd7f32" }, { min: 2000, name: "실버", c: "#8fa0b8" },
    { min: 5000, name: "골드", c: "#e8a90c" }, { min: 20000, name: "플래티넘", c: "#16b8a8" },
    { min: 50000, name: "다이아", c: "#5b9bd5" }, { min: 200000, name: "챌린저", c: "#e5484d" }
  ];
  function tierOf(pts) { var t = TIERS[0], i; for (i = 0; i < TIERS.length; i++) if ((pts || 0) >= TIERS[i].min) t = TIERS[i]; return t; }
  function fmtKP(p) { p = p || 0; return p < 1000 ? String(p) : Math.floor(p / 1000) + "k"; }  // 3456→3k, 소수점 버림

  var mounts = [];
  function client() {
    if (sb) return sb;
    if (!configured() || !window.supabase) return null;
    sb = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
    });
    // 로그인/로그아웃·OAuth 코드교환 완료 시 마운트된 댓글창 자동 갱신
    sb.auth.onAuthStateChange(function () {
      refreshUser().then(function () {
        mounts.forEach(function (m) { if (document.body.contains(m.el)) render(m); });
      });
    });
    return sb;
  }
  function refreshUser() {
    if (!client()) return Promise.resolve(null);
    // getSession()=로컬 세션(자동갱신, 네트워크 실패에 강함). getUser()는 매번 서버검증이라 일시적 실패 시 로그아웃처럼 보임.
    return sb.auth.getSession()
      .then(function (r) { user = (r && r.data && r.data.session && r.data.session.user) || null; return user; })
      .then(function (u) {
        if (!u) { profile = null; return u; }
        return sb.from("profiles").select("nickname").eq("user_id", u.id).maybeSingle()
          .then(function (pr) { profile = (pr && pr.data) || null; return u; })
          .catch(function () { return u; });
      })
      .catch(function () { user = null; profile = null; return null; });
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────
  function mount(parentEl, threadKey) {
    if (!parentEl || !threadKey) return;
    if (!configured()) return;  // 키 미설정 → 아무것도 렌더 안 함(설정 입력 시 자동 활성화)
    injectStyles();
    var box = document.createElement("div");
    box.className = "cmt-box";
    box.innerHTML = '<h3 class="cmt-h">댓글</h3><div class="cmt-soon">불러오는 중…</div>';
    parentEl.appendChild(box);
    var m = { el: box, key: threadKey };
    mounts.push(m);
    loadSDK().then(function () { render(m); }).catch(function () {
      box.innerHTML = '<h3 class="cmt-h">댓글</h3><div class="cmt-soon">댓글 모듈을 불러오지 못했습니다.</div>';
    });
  }

  function render(m) {
    if (!client()) return;
    Promise.all([refreshUser(), loadProviders()])
      .then(function () { return load(m.key); })
      .then(function (data) { m._data = data; paint(m); })
      .catch(function () { m.el.style.display = "none"; });  // 테이블 미생성/일시오류 → 조용히 숨김
  }
  function paint(m) {
    var d = m._data || { list: [], rx: {} };
    m.el.style.display = "";
    m.el.innerHTML = boxHtml(d.list, d.rx);
    bind(m);
  }
  function score(e) { return e ? e.like : 0; }
  function mentionize(s) { return s.replace(/(^|[\s(])@([^\s@]{1,30})/g, '$1<span class="cmt-at">@$2</span>'); }

  function load(key) {
    return sb.from("comments").select("*").eq("thread_key", key).eq("hidden", false)
      .then(function (r) {
        if (r.error) throw r.error;
        var list = r.data || [];
        if (!list.length) return { list: list, rx: {} };
        var ids = list.map(function (c) { return c.id; });
        var uids = list.map(function (c) { return c.user_id; }).filter(Boolean);
        var ptsP = uids.length ? sb.rpc("points_for", { ids: uids }).then(function (pr) {
          var pm = {}; (pr.data || []).forEach(function (x) { pm[x.user_id] = x.points; });
          list.forEach(function (c) { if (c.user_id && pm[c.user_id] != null) c._pts = pm[c.user_id]; });
        }).catch(function () {}) : Promise.resolve();
        var titP = uids.length ? sb.from("profiles").select("user_id,title,best_streak").in("user_id", uids).then(function (pr) {  // 칭호(꾸미기) + 연속적중 훈장
          var tmm = {}, smm = {}; (pr.data || []).forEach(function (x) { if (x.title) tmm[x.user_id] = x.title; if (x.best_streak) smm[x.user_id] = x.best_streak; });
          list.forEach(function (c) { if (c.user_id && tmm[c.user_id]) c._title = tmm[c.user_id]; if (c.user_id && smm[c.user_id]) c._streak = smm[c.user_id]; });
        }).catch(function () {}) : Promise.resolve();
        return Promise.all([sb.from("comment_reactions").select("comment_id,user_id,value").in("comment_id", ids), ptsP, titP])
          .then(function (arr) {
            var rr = arr[0], rx = {};
            (rr.data || []).forEach(function (x) {
              var e = rx[x.comment_id] || (rx[x.comment_id] = { like: 0, dislike: 0, mine: 0 });
              if (x.value === 1) e.like++; else e.dislike++;
              if (user && x.user_id === user.id) e.mine = x.value;
            });
            return { list: list, rx: rx };
          })
          .catch(function () { return { list: list, rx: {} }; });
      });
  }

  function toTree(list) {
    var roots = [], by = {};
    list.forEach(function (c) { c._ch = []; by[c.id] = c; });
    list.forEach(function (c) {
      if (c.parent_id && by[c.parent_id]) by[c.parent_id]._ch.push(c);
      else roots.push(c);
    });
    return roots;
  }

  function cHtml(c, isReply, rx) {
    var mine = user && user.id === c.user_id;
    var rr = rx[c.id] || { like: 0, dislike: 0, mine: 0 };
    var root = isReply ? (c.parent_id || c.id) : c.id;
    var react = '<button class="cmt-rx up' + (rr.mine === 1 ? " on" : "") + '" data-id="' + esc(c.id) + '" data-v="1">▲ ' + rr.like + "</button>" +
      '<button class="cmt-rx down' + (rr.mine === -1 ? " on" : "") + '" data-id="' + esc(c.id) + '" data-v="-1">▼ ' + rr.dislike + "</button>";
    var dn = dispName(c.name, c.user_id);
    var tier = (c._pts != null) ? tierOf(c._pts) : null;
    var tierBadge = tier ? '<span class="cmt-tier" style="color:' + tier.c + ';border-color:' + tier.c + '">' + tier.name + ' <b class="cmt-kp">' + fmtKP(c._pts) + "</b></span>" : "";
    var titB = c._title ? titleBadge(c._title) : "";  // 칭호(꾸미기)
    var medB = c._streak ? streakBadge(c._streak) : "";  // 연속적중 훈장
    return '<div class="cmt' + (isReply ? " reply" : "") + '" data-id="' + esc(c.id) + '" data-name="' + esc(dn) + '" data-root="' + esc(root) + '" data-uid="' + esc(c.user_id) + '">' +
      '<div class="cmt-top">' + titB + tierBadge + medB + '<span class="cmt-name">' + esc(dn) + "</span>" +
        '<span class="cmt-time">' + timeago(c.created_at) + "</span></div>" +
      '<div class="cmt-body">' + mentionize(esc(c.body)) + "</div>" +
      '<div class="cmt-act">' + react +
        '<button class="cmt-reply" data-id="' + esc(c.id) + '">답글</button>' +
        '<span class="cmt-more-wrap"><button class="cmt-more" aria-label="더보기">⋯</button>' +
          '<div class="cmt-menu" hidden>' +
          (mine ? '<button class="cmt-del" data-id="' + esc(c.id) + '">삭제</button>'
                : (!c.user_id ? '<button class="cmt-del" data-id="' + esc(c.id) + '" data-anon="1">삭제</button>' : "") + '<button class="cmt-report" data-id="' + esc(c.id) + '">🚩 신고</button>') +
          "</div></span>" +
      "</div>" +
      '<div class="cmt-replybox"></div>' +
      (c._ch && c._ch.length ? '<div class="cmt-children">' + c._ch.map(function (r) { return cHtml(r, true, rx); }).join("") + "</div>" : "") +
      "</div>";
  }

  function boxHtml(list, rx) {
    var roots = toTree(list);
    roots.sort(function (a, b) {
      if (sortMode === "likes") { var d = score(rx[b.id]) - score(rx[a.id]); if (d) return d; }
      return new Date(b.created_at) - new Date(a.created_at);
    });
    roots.forEach(function (c) { (c._ch || []).sort(function (x, y) { return new Date(x.created_at) - new Date(y.created_at); }); });
    var sortUi = '<div class="cmt-sort">' +
      '<button class="cmt-sortbtn' + (sortMode === "likes" ? " on" : "") + '" data-sort="likes">좋아요순</button>' +
      '<button class="cmt-sortbtn' + (sortMode === "latest" ? " on" : "") + '" data-sort="latest">최신순</button></div>';
    var an = anonGet();
    var anonRow = user ? "" : '<div class="cmt-anon"><input class="cmt-nick cmt-nick-full" maxlength="20" placeholder="닉네임" value="' + esc(an.name || funName()) + '"><button class="cmt-dice" title="순한맛 랜덤 닉네임" type="button">순한맛</button><button class="cmt-spicy" title="매운맛 랜덤 닉네임" type="button">매운맛</button><input class="cmt-pw" type="password" maxlength="20" placeholder="비밀번호" value="' + esc(an.pw || "") + '"></div>';
    var form = '<div class="cmt-form">' + anonRow + '<textarea class="cmt-ta" maxlength="300" placeholder="댓글을 남겨보세요"></textarea><button class="cmt-send">등록</button></div><div class="cmt-count"><span>0</span>/300</div>';
    var head = user
      ? '<div class="cmt-me">' + esc(uname(user)) + ' · <button class="cmt-out">로그아웃</button></div>' + form
      : '<div class="cmt-loginrow"><button class="cmt-in g" data-p="google"><svg width="15" height="15" viewBox="0 0 48 48" style="flex:none"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>구글 로그인</button><span class="cmt-loginhint">로그인하면 닉네임 고정 · 내 댓글 관리</span></div>' + form;  // 비로그인: 익명 작성 + 선택적 구글로그인
    return '<h3 class="cmt-h">댓글 <span class="cmt-cnt">' + list.length + "</span></h3>" +
      '<div class="cmt-guide">댓글로 좋아하는 선수를 응원해보세요! ⚽</div>' + head +
      (roots.length ? sortUi : "") +
      '<div class="cmt-list">' +
      (roots.length ? roots.map(function (c) { return cHtml(c, false, rx); }).join("") : '<div class="cmt-empty">첫 댓글을 남겨보세요!</div>') +
      "</div>";
  }

  function bind(m) {
    m.el.onclick = function (e) {
      var t;
      // 다른 곳 클릭 시 열린 더보기 메뉴 닫기
      if (!e.target.closest(".cmt-more") && !e.target.closest(".cmt-menu")) {
        Array.prototype.forEach.call(m.el.querySelectorAll(".cmt-menu:not([hidden])"), function (x) { x.hidden = true; });
      }
      if ((t = e.target.closest(".cmt-more"))) {
        var menu = t.parentNode.querySelector(".cmt-menu");
        var willShow = menu && menu.hidden;
        Array.prototype.forEach.call(m.el.querySelectorAll(".cmt-menu"), function (x) { x.hidden = true; });
        if (menu) menu.hidden = !willShow;
        return;
      }
      if ((t = e.target.closest(".cmt-in"))) { return signIn(t.getAttribute("data-p")); }
      if (e.target.closest(".cmt-out")) { return sb.auth.signOut().then(function () { render(m); }); }
      if ((t = e.target.closest(".cmt-sortbtn"))) { sortMode = t.getAttribute("data-sort"); return paint(m); }
      if ((t = e.target.closest(".cmt-rx"))) { return react(m, t.getAttribute("data-id"), parseInt(t.getAttribute("data-v"), 10)); }
      if (e.target.closest(".cmt-dice")) { var ni = m.el.querySelector(".cmt-form .cmt-nick"); if (ni) ni.value = funName(); return; }
      if (e.target.closest(".cmt-spicy")) { var ns = m.el.querySelector(".cmt-form .cmt-nick"); if (ns) ns.value = spicyName(); return; }
      if (e.target.closest(".cmt-send")) { return send(m, null, m.el.querySelector(".cmt-form .cmt-ta")); }
      if ((t = e.target.closest(".cmt-reply"))) { return toggleReply(m, t); }
      if ((t = e.target.closest(".cmt-del"))) { return del(m, t.getAttribute("data-id"), t.getAttribute("data-anon") === "1"); }
      if ((t = e.target.closest(".cmt-report"))) { return report(t.getAttribute("data-id")); }
      if ((t = e.target.closest(".cmt-rsend"))) {
        return send(m, t.getAttribute("data-root"), t.parentNode.querySelector(".cmt-ta"), t.getAttribute("data-replyuid"));
      }
    };
    m.el.oninput = function (e) {
      var ta = e.target;
      if (ta && ta.classList && ta.classList.contains("cmt-ta") && ta.closest(".cmt-form")) {
        var cnt = m.el.querySelector(".cmt-count span");
        if (cnt) cnt.textContent = ta.value.length;
      }
    };
  }

  function toggleReply(m, btn) {
    var cmt = btn.closest(".cmt");
    var node = cmt && cmt.querySelector(":scope > .cmt-replybox");
    if (!node) return;
    if (node.innerHTML) { node.innerHTML = ""; return; }
    var isReply = cmt.classList.contains("reply");
    var prefill = isReply ? "@" + cmt.getAttribute("data-name") + " " : "";
    node.innerHTML = '<textarea class="cmt-ta" maxlength="300" placeholder="답글">' + esc(prefill) + "</textarea>" +
      '<button class="cmt-rsend" data-root="' + esc(cmt.getAttribute("data-root")) + '" data-replyuid="' + esc(cmt.getAttribute("data-uid")) + '">답글 등록</button>';
    var ta = node.querySelector(".cmt-ta");
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e2) {} }
  }

  // ── 익명(디시식) 헬퍼 ──
  function sha256(s) { try { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }); } catch (e) { return Promise.resolve("x" + s); } }
  // 재미있는 랜덤 닉네임 ("노래하는 강아지" 식)
  var FN_MOD = ["노래하는", "춤추는", "수영하는", "하늘 나는", "졸고있는", "배고픈", "신난", "용감한", "게으른", "수줍은", "반짝이는", "통통 튀는", "엉뚱한", "느긋한", "호기심 많은", "잠 못 드는", "질주하는", "웃고있는", "당당한", "구르는", "점프하는", "산책하는", "명상하는", "골 넣는", "드리블하는", "응원하는", "헤딩하는", "수다스런", "초롱초롱한", "두근대는", "하품하는", "기지개 켜는", "간식 찾는", "낮잠 자는", "별 보는", "우다다 뛰는", "꼬리 흔드는", "데굴데굴 구르는", "신중한", "까불대는", "늠름한", "폭신폭신한", "보들보들한", "야무진", "똘똘한", "천진난만한", "부끄럼타는", "호탕한", "의젓한", "엉금엉금 기는"];
  var FN_NOUN = ["강아지", "고양이", "펭귄", "코끼리", "판다", "너구리", "다람쥐", "여우", "부엉이", "돌고래", "거북이", "햄스터", "고슴도치", "알파카", "카피바라", "수달", "라쿤", "사자", "호랑이", "곰", "토끼", "병아리", "오리", "문어", "미어캣", "나무늘보", "고라니", "로버트", "제임스", "토마스", "철수", "만수", "봉구", "감자", "꽈배기", "골키퍼", "두더지", "직박구리", "고래", "물범", "비버", "친칠라", "펠리컨", "플라밍고", "코알라", "웜뱃", "염소", "당나귀", "수리부엉이", "치타"];
  function funName() { return FN_MOD[Math.floor(Math.random() * FN_MOD.length)] + " " + FN_NOUN[Math.floor(Math.random() * FN_NOUN.length)]; }
  // 🌶 매운맛: [장소]+[짓궂은 행동]+[이름]
  var SP_LOC = ["강남", "동탄", "출근길", "한강", "노래방", "PC방", "지하철", "헬스장", "탕비실", "고시원", "관중석", "벤치", "옥상", "분식집", "찜질방", "시내버스", "독서실", "편의점", "당구장", "라커룸", "매점", "단톡방", "운동장", "만화방", "회식자리", "동네축구장", "응원석", "엘리베이터"];
  var SP_ACT = ["수건도둑", "마이크 독점러", "새치기 장인", "라면국물 흡입러", "무한리필 학살자", "와이파이 빌런", "단톡방 잠수왕", "치킨다리 강탈범", "오프사이드 함정러", "헛발슛 장인", "할리우드 액션왕", "셀카 30장러", "탕수육 부먹파", "민초 수호자", "역주행 드리블러", "백패스 셔틀", "알람 무시러", "카톡 감옥수", "떡밥 투척러", "야식 요정", "지박령", "터줏대감", "푸드파이터", "잔반 처리반", "오버액션 장인", "새벽감성러", "월급 요정", "갈취왕", "절대강자", "침대 수호자", "단무지 추가러", "컵라면 국물러", "닫힘버튼 연타러", "노쇼 예약러", "줄임말 번역가", "지각 마스터"];
  var SP_NAME = ["엄준식", "김철수", "박영희", "이만수", "최봉구", "정대만", "옥동자", "감자", "도라에몽", "김첨지", "맹구", "훈이", "영구", "길동"];
  function spicyName() { return SP_LOC[Math.floor(Math.random() * SP_LOC.length)] + " " + SP_ACT[Math.floor(Math.random() * SP_ACT.length)] + " " + SP_NAME[Math.floor(Math.random() * SP_NAME.length)]; }
  function anonGet() { try { return JSON.parse(localStorage.getItem("kc_anon") || "{}"); } catch (e) { return {}; } }
  function anonSet(n, p) { try { localStorage.setItem("kc_anon", JSON.stringify({ name: n, pw: p })); } catch (e) {} }
  function cmtErr(em) { return /banned/.test(em) ? "이용이 제한된 계정입니다." : /rate_limit/.test(em) ? "너무 빠르게 작성하고 있어요. 잠시 후 다시 시도해주세요." : /duplicate/.test(em) ? "방금 같은 내용을 작성했어요. (도배 방지)" : /has_link/.test(em) ? "링크는 작성할 수 없어요." : /blocked_word/.test(em) ? "부적절한 내용이 포함되어 등록할 수 없어요." : /spam_campaign/.test(em) ? "스팸으로 감지되어 차단되었어요." : /row-level|policy/.test(em) ? "닉네임/비밀번호를 확인해주세요." : "등록 실패: " + em; }
  function doInsert(m, ta, rec) {
    ta.disabled = true;
    sb.from("comments").insert(rec).then(function (r) {
      if (r.error) { alert(cmtErr(String(r.error.message || ""))); ta.disabled = false; return; }
      render(m);
    });
  }
  function send(m, parentId, ta, replyToUser) {
    if (!ta) return;
    var body = (ta.value || "").trim(); if (!body) return;
    var base = { thread_key: m.key, parent_id: parentId || null, reply_to_user: replyToUser || null, body: mask(body).slice(0, 300) };
    if (user) { base.user_id = user.id; base.name = uname(user); base.avatar = avatarOf(user); doInsert(m, ta, base); return; }
    // 익명: 닉네임 + 비번(메인 폼 입력값 또는 이전에 저장한 값)
    var nickEl = m.el.querySelector(".cmt-form .cmt-nick"), pwEl = m.el.querySelector(".cmt-form .cmt-pw"), an = anonGet();
    var nick = ((nickEl && nickEl.value) || an.name || "").trim(), pw = ((pwEl && pwEl.value) || an.pw || "").trim();
    if (!nick) { alert("닉네임을 입력해주세요."); return; }
    if (!pw) { alert("비밀번호를 입력해주세요. (내 댓글 삭제할 때 필요해요)"); return; }
    anonSet(nick, pw);
    sha256(pw).then(function (h) { base.user_id = null; base.name = nick.slice(0, 12); base.pw_hash = h; base.avatar = null; doInsert(m, ta, base); });
  }

  function del(m, id, isAnon) {
    if (isAnon) {
      var pw = prompt("이 댓글의 비밀번호를 입력하세요:"); if (!pw) return;
      sha256(pw.trim()).then(function (h) {
        sb.rpc("delete_anon_comment", { cid: id, pw: h }).then(function (r) {
          if (r.error || r.data !== true) { alert("비밀번호가 일치하지 않아요."); return; }
          render(m);
        });
      });
      return;
    }
    if (!confirm("댓글을 삭제할까요?")) return;
    sb.from("comments").delete().eq("id", id).then(function () { render(m); });
  }
  function react(m, commentId, value) {
    if (!user) { confirmLogin(); return; }
    var cur = (m._data && m._data.rx[commentId]) ? m._data.rx[commentId].mine : 0;
    var op = (cur === value)
      ? sb.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_id", user.id)
      : sb.from("comment_reactions").upsert({ comment_id: commentId, user_id: user.id, value: value }, { onConflict: "comment_id,user_id" });
    op.then(function () { render(m); });
  }

  // ── 마이페이지용 (app.js renderMy 에서 사용) ──
  function setNickname(nick) {
    nick = (nick || "").trim();
    if (!user || !nick) return Promise.reject(new Error("invalid"));
    if (nick.length < 2 || nick.length > 16) return Promise.reject(new Error("len"));
    if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 _]+$/.test(nick)) return Promise.reject(new Error("chars"));
    if (/(씨발|시발|씨바|시바|쌍놈|병신|븅신|개새|개색|좆|좇|존나|보지|자지|씹|섹스|sex|f.?u.?c.?k|shit|bitch|asshole|nigger|썅|꺼져|닥쳐|운영자|관리자|어드민|admin|야동|도박|토토|카지노)/i.test(nick.replace(/\s/g, ""))) return Promise.reject(new Error("badword"));
    nick = mask(nick).slice(0, 16);
    return sb.from("profiles").upsert({ user_id: user.id, nickname: nick, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .then(function (r) {
        if (r.error) throw r.error;
        profile = { nickname: nick };
        return sb.from("comments").update({ name: nick }).eq("user_id", user.id);  // 기존 댓글 표시이름 일괄 갱신
      });
  }
  function myComments() {
    if (!user) return Promise.resolve([]);
    return sb.from("comments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)
      .then(function (r) { return r.data || []; }).catch(function () { return []; });
  }
  function taggedComments() {
    if (!user) return Promise.resolve([]);
    return sb.from("comments").select("*").eq("reply_to_user", user.id).order("created_at", { ascending: false }).limit(100)
      .then(function (r) { return r.data || []; }).catch(function () { return []; });
  }
  function ready() { if (!configured()) return Promise.resolve(null); return loadSDK().then(function () { return refreshUser(); }); }
  function report(commentId) {
    if (!user) { confirmLogin(); return; }
    var reason = prompt("신고 사유를 적어주세요 (예: 욕설/스팸/혐오/기타)");
    if (reason == null) return;
    sb.from("comment_reports").insert({ comment_id: commentId, reporter: user.id, reason: (reason || "").slice(0, 200) })
      .then(function (r) {
        if (r.error) { alert(/duplicate|unique|23505/i.test(String(r.error.message || r.error.code || "")) ? "이미 신고한 댓글이에요." : "신고 처리 중 오류가 발생했어요."); return; }
        alert("신고되었습니다. 감사합니다.");
      });
  }
  // ── 관리자용 ──
  function isAdmin() { return !!(user && user.id === ADMIN_UID); }
  function adminDashboard() { if (!isAdmin()) return Promise.resolve(null); return sb.rpc("admin_dashboard").then(function (r) { return r.data || null; }).catch(function () { return null; }); }
  function adminUsers() { if (!isAdmin()) return Promise.resolve([]); return sb.rpc("admin_users").then(function (r) { return r.data || []; }).catch(function () { return []; }); }
  // 경기 평점·MVP (match_id = fixture id)
  function matchRatings(matchId) {
    return sb.from("match_player_ratings").select("player_id,score,user_id").eq("match_id", matchId).then(function (r) {
      var rows = r.data || [], by = {}, mine = {};
      rows.forEach(function (x) { var b = by[x.player_id] || (by[x.player_id] = { sum: 0, cnt: 0 }); b.sum += x.score; b.cnt++; if (user && x.user_id === user.id) mine[x.player_id] = x.score; });
      var out = {}; Object.keys(by).forEach(function (pid) { out[pid] = { avg: by[pid].sum / by[pid].cnt, cnt: by[pid].cnt }; });
      return { byPlayer: out, mine: mine };
    }).catch(function () { return { byPlayer: {}, mine: {} }; });
  }
  function rateMatchPlayer(matchId, playerId, score) { if (!user) return Promise.resolve(null); return sb.from("match_player_ratings").upsert({ match_id: matchId, player_id: playerId, user_id: user.id, score: score }, { onConflict: "match_id,player_id,user_id" }); }
  function unrateMatchPlayer(matchId, playerId) { if (!user) return Promise.resolve(null); return sb.from("match_player_ratings").delete().eq("match_id", matchId).eq("player_id", playerId).eq("user_id", user.id); }
  function matchMvp(matchId) {
    return sb.from("match_mvp_votes").select("player_id,user_id").eq("match_id", matchId).then(function (r) {
      var rows = r.data || [], votes = {}, mine = null;
      rows.forEach(function (x) { votes[x.player_id] = (votes[x.player_id] || 0) + 1; if (user && x.user_id === user.id) mine = x.player_id; });
      return { votes: votes, mine: mine, total: rows.length };
    }).catch(function () { return { votes: {}, mine: null, total: 0 }; });
  }
  function voteMvp(matchId, playerId) { if (!user) return Promise.resolve(null); return sb.from("match_mvp_votes").upsert({ match_id: matchId, player_id: playerId, user_id: user.id }, { onConflict: "match_id,user_id" }); }
  function unvoteMvp(matchId) { if (!user) return Promise.resolve(null); return sb.from("match_mvp_votes").delete().eq("match_id", matchId).eq("user_id", user.id); }
  function listReports() {
    if (!isAdmin()) return Promise.resolve([]);
    return sb.from("comment_reports").select("*,comments(*)").order("created_at", { ascending: false }).limit(300)
      .then(function (r) { return r.data || []; }).catch(function () { return []; });
  }
  function listAllComments(q) {
    if (!isAdmin()) return Promise.resolve([]);
    return sb.from("comments").select("*").order("created_at", { ascending: false }).limit(300)
      .then(function (r) {
        var d = r.data || [];
        if (q) { q = q.toLowerCase(); d = d.filter(function (c) { return (c.body || "").toLowerCase().indexOf(q) >= 0 || (c.name || "").toLowerCase().indexOf(q) >= 0; }); }
        return d;
      }).catch(function () { return []; });
  }
  function adminDeleteComment(id) { return sb.from("comments").delete().eq("id", id); }
  function ignoreReport(id) { return sb.from("comment_reports").delete().eq("id", id); }
  function banUser(userId, reason) { if (!isAdmin() || !userId) return Promise.resolve(); return sb.from("banned_users").upsert({ user_id: userId, reason: reason || null, banned_by: user.id }, { onConflict: "user_id" }); }
  function unbanUser(userId) { if (!isAdmin()) return Promise.resolve(); return sb.from("banned_users").delete().eq("user_id", userId); }
  function unhideComment(id) { if (!isAdmin()) return Promise.resolve(); return sb.from("comments").update({ hidden: false }).eq("id", id); }
  // ── 선수 평점(별점 1~5) ──
  function ratingStats() {
    if (!client()) return Promise.resolve({});
    return sb.from("player_rating_stats").select("*").then(function (r) {
      var m = {}; (r.data || []).forEach(function (x) { m[x.player_id] = { avg: Number(x.avg) || 0, cnt: x.cnt || 0 }; }); return m;
    }).catch(function () { return {}; });
  }
  function playerRating(pid) {
    if (!client()) return Promise.resolve({ avg: 0, cnt: 0, mine: 0 });
    return Promise.all([
      sb.from("player_rating_stats").select("avg,cnt").eq("player_id", pid).maybeSingle(),
      user ? sb.from("player_ratings").select("score").eq("player_id", pid).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null })
    ]).then(function (res) {
      var s = (res[0] && res[0].data) || null, mn = (res[1] && res[1].data) || null;
      return { avg: s ? Number(s.avg) : 0, cnt: s ? s.cnt : 0, mine: mn ? mn.score : 0 };
    }).catch(function () { return { avg: 0, cnt: 0, mine: 0 }; });
  }
  function ratePlayer(pid, score) {
    if (!user) return Promise.reject(new Error("login"));
    // 같은 점수를 다시 누르면 평점 취소(삭제)
    return sb.from("player_ratings").select("score").eq("player_id", pid).eq("user_id", user.id).maybeSingle().then(function (r) {
      if (r.data && r.data.score === score) return sb.from("player_ratings").delete().eq("player_id", pid).eq("user_id", user.id);
      return sb.from("player_ratings").upsert({ player_id: pid, user_id: user.id, score: score, updated_at: new Date().toISOString() }, { onConflict: "player_id,user_id" });
    });
  }
  // ── 게시판 ──
  function listPosts(category) {
    if (!client()) return Promise.resolve({ posts: [], stats: {} });
    var qy = sb.from("board_posts").select("*").eq("hidden", false);
    if (category && category !== "전체") qy = qy.eq("category", category);
    return qy.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100).then(function (r) {
      var posts = r.data || [];
      if (!posts.length) return { posts: posts, stats: {}, mine: {} };
      var ids = posts.map(function (p) { return p.id; });
      return Promise.all([
        sb.from("board_post_stats").select("*").in("post_id", ids),
        user ? sb.from("board_post_likes").select("post_id,val").in("post_id", ids).eq("user_id", user.id) : Promise.resolve({ data: [] })
      ]).then(function (res) {
        var st = {}; ((res[0] && res[0].data) || []).forEach(function (x) { st[x.post_id] = { likes: x.likes || 0, dislikes: x.dislikes || 0, comments: x.comments || 0 }; });
        var mine = {}; ((res[1] && res[1].data) || []).forEach(function (x) { mine[x.post_id] = x.val; });
        return { posts: posts, stats: st, mine: mine };
      }).catch(function () { return { posts: posts, stats: {}, mine: {} }; });
    }).catch(function () { return { posts: [], stats: {}, mine: {} }; });
  }
  function getPost(id) {
    if (!client()) return Promise.resolve(null);
    return Promise.all([
      sb.from("board_posts").select("*").eq("id", id).maybeSingle(),
      sb.from("board_post_stats").select("*").eq("post_id", id).maybeSingle(),
      user ? sb.from("board_post_likes").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null })
    ]).then(function (res) {
      var p = res[0] && res[0].data; if (!p) return null;
      var st = (res[1] && res[1].data) || {};
      p._likes = st.likes || 0; p._comments = st.comments || 0;
      p._liked = !!(res[2] && res[2].data);
      return p;
    }).catch(function () { return null; });
  }
  function bumpView(id) { if (sb) { try { sb.rpc("increment_post_view", { pid: id }); } catch (e) {} } }
  function createPost(category, body, pinned) {
    if (!user) return Promise.reject(new Error("login"));
    var b = mask((body || "").trim()).slice(0, 2000);
    var rec = { category: pinned ? "공지" : (category || "자유"), title: (b.slice(0, 50) || "(내용)"), body: b, user_id: user.id, name: uname(user) };
    if (pinned) rec.pinned = true;
    return sb.from("board_posts").insert(rec).select("id").maybeSingle();
  }
  function updatePost(id, category, body, pinned) {
    if (!user) return Promise.reject(new Error("login"));
    var b = mask((body || "").trim()).slice(0, 2000);
    return sb.from("board_posts").update({ category: pinned ? "공지" : (category || "자유"), title: (b.slice(0, 50) || "(내용)"), body: b, pinned: !!pinned }).eq("id", id);
  }
  function deletePost(id) { return sb.from("board_posts").delete().eq("id", id); }
  function togglePostReaction(id, val, cur) {
    if (!user) return Promise.reject(new Error("login"));
    if (cur === val) return sb.from("board_post_likes").delete().eq("post_id", id).eq("user_id", user.id);
    return sb.from("board_post_likes").upsert({ post_id: id, user_id: user.id, val: val }, { onConflict: "post_id,user_id" });
  }
  function togglePostLike(id, liked) {
    if (!user) return Promise.reject(new Error("login"));
    return liked ? sb.from("board_post_likes").delete().eq("post_id", id).eq("user_id", user.id)
                 : sb.from("board_post_likes").insert({ post_id: id, user_id: user.id });
  }
  function listAllPostsAdmin() { if (!isAdmin()) return Promise.resolve([]); return sb.from("board_posts").select("*").order("created_at", { ascending: false }).limit(200).then(function (r) { return r.data || []; }).catch(function () { return []; }); }
  function adminHidePost(id, hide) { return sb.from("board_posts").update({ hidden: hide }).eq("id", id); }

  function inAppBrowser() {
    var ua = (navigator.userAgent || "").toLowerCase();
    return /kakaotalk|instagram|fban|fbav|fb_iab|line\/|naver\(inapp|daumapps|everytimeapp/.test(ua);
  }
  function confirmLogin() {
    if (confirm("로그인 후 작성할 수 있어요.\n구글로 로그인하시겠습니까?")) signIn("google");
  }
  function signIn(provider) {
    if (!client()) return;
    // 구글은 인앱 브라우저(카카오톡 등)에서 OAuth 차단(disallowed_useragent) → 외부 브라우저로 유도
    var ua = (navigator.userAgent || "").toLowerCase();
    if (provider === "google" && inAppBrowser()) {
      if (ua.indexOf("kakaotalk") >= 0) {
        location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
        return;
      }
      alert("인앱 브라우저에서는 구글 로그인이 제한됩니다.\n우측 상단 메뉴에서 '다른 브라우저로 열기'(크롬/사파리)를 선택한 뒤 로그인해 주세요.");
      return;
    }
    try { localStorage.setItem("kc_return", location.hash || ""); } catch (e) {}  // 로그인 후 돌아올 페이지 저장
    sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: location.origin + location.pathname } });
  }

  // ── 스타일(자체 주입) ───────────────────────────────────────────────────
  function injectStyles() {
    if (stylesInjected) return; stylesInjected = true;
    var css = [
      ".cmt-box{margin-top:18px;border-top:1px solid var(--line,#1e2a3a);padding-top:16px}",
      ".cmt-h{font-size:15px;font-weight:800;margin:0 0 12px}",
      ".cmt-cnt{color:var(--accent,#2ee6a6)}",
      ".cmt-soon{color:var(--muted,#9fb0c3);font-size:13px;padding:8px 0}",
      ".cmt-login{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}",
      ".cmt-login-t{color:var(--muted,#9fb0c3);font-size:13px;margin-right:auto}",
      ".cmt-in{border:1px solid var(--line,#1e2a3a);background:#fff;color:#222;font-weight:700;font-size:13px;padding:8px 14px;border-radius:10px;cursor:pointer}",
      ".cmt-in.kakao{background:#FEE500;color:#3c1e1e;border-color:#FEE500}",
      ".cmt-me{display:flex;align-items:center;gap:8px;color:var(--muted,#9fb0c3);font-size:12.5px;margin-bottom:10px}",
      ".cmt-out{background:none;border:0;color:var(--muted,#9fb0c3);text-decoration:underline;cursor:pointer;font-size:12px}",
      ".cmt-form{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}",
      ".cmt-anon{flex-basis:100%;width:100%;display:flex;gap:6px}",
      ".cmt-anon input{flex:1;min-width:0;background:var(--bg-soft,#0f1a2a);color:var(--text,#fff);border:1px solid var(--line,#1e2a3a);border-radius:8px;padding:8px 10px;font-size:13px}",
      ".cmt-anon{flex-wrap:wrap}",
      ".cmt-anon input.cmt-nick-full{flex:0 0 100%}",
      ".cmt-dice,.cmt-spicy{flex:none;padding:0 11px;background:var(--bg-soft,#0f1a2a);border:1px solid var(--line,#1e2a3a);border-radius:8px;font-size:12px;font-weight:700;color:var(--text,#fff);cursor:pointer;line-height:1;white-space:nowrap}",
      ".cmt-spicy{color:#e5644d;border-color:#e5644d}",
      ".cmt-replybox{margin:6px 0 0 0}",
      ".cmt-ta{flex:1;min-height:44px;resize:vertical;background:var(--bg-soft,#0f1a2a);color:var(--text,#fff);border:1px solid var(--line,#1e2a3a);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px}",
      ".cmt-send,.cmt-rsend{align-self:flex-end;background:var(--accent,#2ee6a6);color:#fff;font-weight:800;border:0;border-radius:10px;padding:0 16px;height:44px;cursor:pointer}",
      ".cmt-loginrow{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:10px}",
      ".cmt-loginhint{font-size:11.5px;color:var(--muted,#9fb0cc)}",
      ".cmt-rsend{height:36px;margin-top:6px;font-size:13px}",
      ".cmt-list{display:flex;flex-direction:column;gap:14px}",
      ".cmt-empty{color:var(--muted,#9fb0c3);font-size:13px;padding:8px 0}",
      ".cmt{}",
      ".cmt-top{display:flex;align-items:baseline;gap:8px}",
      ".cmt-name{font-weight:500;font-size:13.5px}",
      ".cmt-tier{font-size:10px;font-weight:800;border:1px solid;border-radius:5px;padding:1px 5px;margin-right:5px;vertical-align:middle}",
      ".cmt-kp{font-weight:700;opacity:.8;font-size:9.5px}",
      ".cmt-time{color:var(--muted,#9fb0c3);font-size:11.5px}",
      ".cmt-body{font-size:14px;line-height:1.5;margin:3px 0;white-space:pre-wrap;word-break:break-word}",
      ".cmt-act{display:flex;gap:12px}",
      ".cmt-act button{background:none;border:0;color:var(--muted,#9fb0c3);font-size:12px;cursor:pointer;padding:0}",
      ".cmt-children{margin:10px 0 0 16px;padding-left:12px;border-left:2px solid var(--line,#1e2a3a);display:flex;flex-direction:column;gap:12px}",
      ".cmt.reply .cmt-body{font-size:13.5px}",
      ".cmt-sort{display:flex;gap:6px;margin-bottom:12px}",
      ".cmt-sortbtn{background:none;border:1px solid var(--line,#1e2a3a);color:var(--muted,#9fb0c3);font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;cursor:pointer}",
      ".cmt-sortbtn.on{background:var(--accent,#2ee6a6);color:#fff;border-color:var(--accent,#2ee6a6)}",
      ".cmt-act{flex-wrap:wrap;align-items:center;gap:10px}",
      ".cmt-rx{background:none;border:1px solid var(--line,#1e2a3a);color:var(--muted,#9fb0c3);font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;cursor:pointer}",
      ".cmt-rx.up.on{color:#2ee6a6;border-color:#2ee6a6}",
      ".cmt-rx.down.on{color:#e5484d;border-color:#e5484d}",
      ".cmt-at{color:var(--accent,#2ee6a6);font-weight:700}",
      ".cmt-in.g{display:inline-flex;align-items:center;gap:7px}",
      ".gico{flex:none;display:block}",
      ".cmt-more-wrap{position:relative;display:inline-block}",
      ".cmt-more{font-size:16px;line-height:1;letter-spacing:1px;padding:0 4px}",
      ".cmt-menu{position:absolute;right:0;top:100%;margin-top:4px;background:var(--card,#18233a);border:1px solid var(--line,#2a3a5c);border-radius:10px;padding:4px;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,.4);min-width:96px}",
      ".cmt-menu[hidden]{display:none}",
      ".cmt-menu button{display:block;width:100%;text-align:left;padding:8px 12px;font-size:13px;white-space:nowrap}",
      ".cmt-guide{background:var(--bg-soft,#131c2e);border:1px solid var(--line,#2a3a5c);border-radius:10px;padding:9px 12px;font-size:13px;color:var(--muted,#9fb0cc);margin-bottom:12px}",
      ".cmt-count{text-align:right;font-size:11.5px;color:var(--muted,#9fb0cc);margin:-6px 2px 12px}"
    ].join("");
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  }

  // OAuth 복귀 처리: ①원래 페이지(해시)로 즉시 복원 ②코드 교환(세션 생성)
  (function handleOAuthReturn() {
    if (!configured() || !/[?&]code=/.test(location.search)) return;
    try {
      var rh = localStorage.getItem("kc_return");
      localStorage.removeItem("kc_return");
      if (rh && location.hash !== rh) location.hash = rh;  // app.js route() 전에 복원
    } catch (e) {}
    loadSDK().then(function () { client(); });  // detectSessionInUrl 가 ?code= → 세션, onAuthStateChange 가 박스 갱신
  })();

  // ── 실시간 채팅(통합 채팅방, Supabase Realtime) ──
  function chatRecent(limit) {
    if (!client()) return Promise.resolve([]);
    return sb.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(limit || 100)
      .then(function (r) {
        var list = (r.data || []).slice().reverse();
        var uids = [], seen = {}; list.forEach(function (m) { if (m.user_id && !seen[m.user_id]) { seen[m.user_id] = 1; uids.push(m.user_id); } });
        if (!uids.length) return list;
        return sb.from("profiles").select("user_id,points,title,best_streak").in("user_id", uids).then(function (pr) {  // 채팅 티어+칭호+훈장
          var pm = {}, tmm = {}, smm = {}; (pr.data || []).forEach(function (x) { pm[x.user_id] = x.points; if (x.title) tmm[x.user_id] = x.title; if (x.best_streak) smm[x.user_id] = x.best_streak; });
          list.forEach(function (m) { if (m.user_id != null && pm[m.user_id] != null) m._pts = pm[m.user_id]; if (m.user_id != null && tmm[m.user_id]) m._title = tmm[m.user_id]; if (m.user_id != null && smm[m.user_id]) m._streak = smm[m.user_id]; });
          return list;
        }).catch(function () { return list; });
      }).catch(function () { return []; });
  }
  // 관리자 채팅 검색/삭제(RLS: 관리자 UID만)
  function chatSearch(q) {
    if (!client()) return Promise.resolve([]);
    var qy = sb.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(60);
    if (q && q.trim()) { var s = q.trim().replace(/[,()*%\\]/g, ""); if (s) qy = qy.or("name.ilike.%" + s + "%,body.ilike.%" + s + "%"); }
    return qy.then(function (r) { return r.data || []; }).catch(function () { return []; });
  }
  function chatDelete(id) { if (!sb) return Promise.resolve(false); return sb.from("chat_messages").delete().eq("id", id).then(function (r) { return !r.error; }).catch(function () { return false; }); }
  function anonChatName() {
    var n; try { n = localStorage.getItem("kc_chatnick"); } catch (e) {}
    if (!n) { n = "익명" + Math.floor(1000 + Math.random() * 9000); try { localStorage.setItem("kc_chatnick", n); } catch (e) {} }  // 채팅은 익명+숫자
    return n;
  }
  function chatSend(body) {
    var b = mask((body || "").trim()).slice(0, 300);
    if (!b) return Promise.resolve({ skip: true });
    if (user) return sb.from("chat_messages").insert({ body: b, user_id: user.id, name: uname(user) });
    return sb.from("chat_messages").insert({ body: b, user_id: null, name: anonChatName() });  // 비로그인=랜덤 닉네임
  }
  function chatSubscribe(onMsg) {
    if (!sb) return null;
    try {
      return sb.channel("kc_chat_room").on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, function (p) { if (p && p.new) onMsg(p.new); }).subscribe();
    } catch (e) { return null; }
  }
  function chatUnsubscribe(ch) { try { if (ch && sb) sb.removeChannel(ch); } catch (e) {} }

  // ===== 승부예측(익명 투표, 기기당 1표) =====
  function predDevice() { var d; try { d = localStorage.getItem("kc_device"); } catch (e) {} if (!d) { d = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); try { localStorage.setItem("kc_device", d); } catch (e) {} } return d; }
  function predMine(mid) { try { return localStorage.getItem("kc_pred_" + mid) || null; } catch (e) { return null; } }
  function predCounts(mid) {
    if (!sb) return Promise.resolve({ home: 0, draw: 0, away: 0, total: 0 });
    return sb.rpc("predict_counts", { mid: mid }).then(function (r) {
      var c = { home: 0, draw: 0, away: 0, total: 0 };
      (r.data || []).forEach(function (row) { c[row.choice] = +row.n; c.total += +row.n; });
      return c;
    }).catch(function () { return { home: 0, draw: 0, away: 0, total: 0 }; });
  }
  function predVote(mid, choice) {
    try { localStorage.setItem("kc_pred_" + mid, choice); } catch (e) {}
    if (!sb) return predCounts(mid);
    return sb.from("match_predictions").upsert({ match_id: mid, device_id: predDevice(), choice: choice }, { onConflict: "match_id,device_id" }).then(function () { return predCounts(mid); }).catch(function () { return predCounts(mid); });
  }

  // ===== 포인트 게임(베팅) =====
  function myPoints() { if (!sb || !user) return Promise.resolve(null); return sb.rpc("my_points").then(function (r) { return r.data; }).catch(function () { return null; }); }
  function dailyCheckin() { if (!sb || !user) return Promise.resolve(null); return sb.rpc("daily_checkin").then(function (r) { return r.data; }).catch(function () { return null; }); }
  function placeBet(mid, ch, amt) { if (!sb || !user) return Promise.reject(new Error("login")); return sb.rpc("place_bet", { mid: mid, ch: ch, amt: amt }).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function myBet(mid) { if (!sb || !user) return Promise.resolve(null); return sb.from("bets").select("*").eq("user_id", user.id).eq("match_id", mid).maybeSingle().then(function (r) { return r.data; }).catch(function () { return null; }); }
  function cancelBet(mid) { if (!sb || !user) return Promise.reject(new Error("login")); return sb.rpc("cancel_bet", { mid: mid }).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function myBets() { if (!sb || !user) return Promise.resolve([]); return sb.from("bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).then(function (r) { return r.data || []; }).catch(function () { return []; }); }
  // 럭키 드로우(가챠) — 하루 첫판 무료, 이후 100KP. 서버에서 추첨(원자적).
  function luckyDraw() { if (!sb || !user) return Promise.reject(new Error("login")); return sb.rpc("lucky_draw").then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function freeDrawAvailable() { if (!sb || !user) return Promise.resolve(false); return sb.rpc("free_draw_available").then(function (r) { return !!r.data; }).catch(function () { return false; }); }
  // 응원 메시지(전광판) — 300KP로 메인에 한 줄 노출
  function postCheer(msg, team) { if (!sb || !user) return Promise.reject(new Error("login")); msg = mask(String(msg || "").trim()).slice(0, 80); if (!msg) return Promise.reject(new Error("empty")); return sb.rpc("post_cheer", { msg: msg, team: team || null }).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function recentCheers(lim) { if (!client()) return Promise.resolve([]); return sb.from("cheers").select("*").order("created_at", { ascending: false }).limit(lim || 20).then(function (r) { return r.data || []; }).catch(function () { return []; }); }
  function deleteCheer(id) { if (!sb) return Promise.resolve(false); return sb.from("cheers").delete().eq("id", id).then(function (r) { return !r.error; }).catch(function () { return false; }); }
  // 꾸미기(칭호) — 상점 카탈로그 + 구매/장착 + 표시
  var _cosCat = null;
  function cosmetics() { if (_cosCat) return Promise.resolve(_cosCat); if (!client()) return Promise.resolve([]); return sb.from("cosmetics").select("*").order("sort").then(function (r) { _cosCat = r.data || []; return _cosCat; }).catch(function () { return []; }); }
  function titleInfo(id) { if (!id || !_cosCat) return null; for (var i = 0; i < _cosCat.length; i++) if (_cosCat[i].id === id) return _cosCat[i]; return null; }
  function titleBadge(id) { var t = titleInfo(id); return t ? '<span class="title-badge" style="color:' + t.color + '">' + esc(t.label) + "</span> " : ""; }
  function buyOrEquipTitle(id) { if (!sb || !user) return Promise.reject(new Error("login")); return sb.rpc("buy_or_equip_title", { tid: id }).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  // 예측 연속적중 훈장 — 최고 연속(best_streak) 기준 메달
  function streakMedal(n) { n = n || 0; if (n >= 10) return { e: "🏆", n: n, c: "#e5484d" }; if (n >= 7) return { e: "🥇", n: n, c: "#e8a90c" }; if (n >= 5) return { e: "🥈", n: n, c: "#8fa0b8" }; if (n >= 3) return { e: "🥉", n: n, c: "#cd7f32" }; return null; }
  function streakBadge(n) { var m = streakMedal(n); return m ? '<span class="streak-medal" style="border-color:' + m.c + '" title="최고 ' + m.n + '연속 적중">' + m.e + m.n + "</span> " : ""; }
  function myCosmetics() { if (!sb || !user) return Promise.resolve(null); return sb.from("profiles").select("title,owned_titles").eq("user_id", user.id).maybeSingle().then(function (r) { return r.data || null; }).catch(function () { return null; }); }
  ready().then(cosmetics).catch(function () {});  // 카탈로그 미리 로드(댓글/채팅 칭호 표시용) — sb 준비 후에
  function pointsRanking(lim) { if (!sb) return Promise.resolve([]); return sb.rpc("points_ranking", { lim: lim || 50 }).then(function (r) { return r.data || []; }).catch(function () { return []; }); }
  function settleMatch(mid) { if (!sb) return Promise.resolve(null); return sb.rpc("settle_match", { mid: mid }).then(function (r) { return r.data; }).catch(function () { return null; }); }
  // 종료 경기 결과로 즉시 정산(멱등·킥오프 가드) — 크론 안 기다리고 보는 사람이 트리거
  function settleWithResult(mid, result) { if (!sb || !mid || !result) return Promise.resolve(null); return sb.rpc("settle_with_result", { mid: mid, res: result }).then(function (r) { return r.data; }).catch(function () { return null; }); }
  // 득점왕/기록 — 경기별 행(stats:매치id)을 모아 선수별 합산. 크론 + 라이브 보는 클라이언트가 같은 행을 갱신
  function matchStats() {
    if (!sb) return Promise.resolve(null);
    return sb.from("app_data").select("key,data").then(function (r) {
      var rows = (r.data || []).filter(function (row) { return row.key && row.key.indexOf("stats:") === 0; });
      if (!rows.length) return null;
      var agg = {};
      rows.forEach(function (row) {
        ((row.data && row.data.players) || []).forEach(function (p) {
          var k = p.key || p.pid || ("n:" + p.name);
          var a = agg[k] || (agg[k] = { name: p.name, team: p.team, flag: p.flag, pid: p.pid || null, goals: 0, assists: 0, og: 0, yellow: 0, red: 0, apps: 0 });
          ["goals", "assists", "og", "yellow", "red", "apps"].forEach(function (f) { a[f] += (p[f] || 0); });
          if (!a.flag && p.flag) { a.flag = p.flag; a.team = p.team; }
        });
      });
      return { players: Object.keys(agg).map(function (k) { return agg[k]; }) };
    }).catch(function () { return null; });
  }
  // 라이브 경기 보는 사람이 그 경기 기록을 즉시 DB에 갱신(20분 크론 안 기다림)
  function pushMatchStats(mid, players) { if (!sb || !mid || !players || !players.length) return Promise.resolve(null); return sb.rpc("set_match_stats", { mid: mid, d: { players: players } }).then(function () { return true; }).catch(function () { return null; }); }
  // 한 경기 기록(평점 산출용)
  function matchStatsOne(mid) { if (!sb || !mid) return Promise.resolve(null); return sb.from("app_data").select("data").eq("key", "stats:" + mid).maybeSingle().then(function (r) { return (r.data && r.data.data) || null; }).catch(function () { return null; }); }
  // 확정 라인업 DB 저장/조회(영구 보존 + 종료경기 빠른 로딩, ESPN 백업)
  function pushLineup(mid, d) { if (!sb || !mid || !d) return Promise.resolve(null); return sb.rpc("set_match_lineup", { mid: mid, d: d }).then(function () { return true; }).catch(function () { return null; }); }
  function getLineup(mid) { if (!sb || !mid) return Promise.resolve(null); return sb.from("app_data").select("data").eq("key", "lineup:" + mid).maybeSingle().then(function (r) { return (r.data && r.data.data) || null; }).catch(function () { return null; }); }

  window.KickComments = {
    matchStats: matchStats, pushMatchStats: pushMatchStats, matchStatsOne: matchStatsOne, pushLineup: pushLineup, getLineup: getLineup,
    predCounts: predCounts, predMine: predMine, predVote: predVote, dispName: dispName, maskName: maskName,
    myPoints: myPoints, dailyCheckin: dailyCheckin, placeBet: placeBet, luckyDraw: luckyDraw, freeDrawAvailable: freeDrawAvailable, postCheer: postCheer, recentCheers: recentCheers, deleteCheer: deleteCheer, cosmetics: cosmetics, titleBadge: titleBadge, titleInfo: titleInfo, buyOrEquipTitle: buyOrEquipTitle, myCosmetics: myCosmetics, mask: mask, streakMedal: streakMedal, streakBadge: streakBadge, myBet: myBet, myBets: myBets, cancelBet: cancelBet, pointsRanking: pointsRanking, settleMatch: settleMatch, settleWithResult: settleWithResult, tierOf: tierOf, tiers: function () { return TIERS; }, fmtKP: fmtKP,
    mount: mount, configured: configured, ready: ready,
    user: function () { return user; },
    nick: function () { return user ? uname(user) : null; },
    avatar: function () { return avatarOf(user); },
    signIn: signIn, promptLogin: confirmLogin,
    signOut: function () { return sb ? sb.auth.signOut() : Promise.resolve(); },
    setNickname: setNickname, myComments: myComments, taggedComments: taggedComments,
    providers: function () { return loadProviders(); },
    isAdmin: isAdmin, adminDashboard: adminDashboard, adminUsers: adminUsers, listReports: listReports, listAllComments: listAllComments,
    matchRatings: matchRatings, rateMatchPlayer: rateMatchPlayer, unrateMatchPlayer: unrateMatchPlayer, matchMvp: matchMvp, voteMvp: voteMvp, unvoteMvp: unvoteMvp,
    adminDeleteComment: adminDeleteComment, ignoreReport: ignoreReport,
    banUser: banUser, unbanUser: unbanUser, unhideComment: unhideComment,
    ratingStats: ratingStats, playerRating: playerRating, ratePlayer: ratePlayer,
    listPosts: listPosts, getPost: getPost, bumpView: bumpView, createPost: createPost,
    deletePost: deletePost, updatePost: updatePost, togglePostLike: togglePostLike, togglePostReaction: togglePostReaction,
    listAllPostsAdmin: listAllPostsAdmin, adminHidePost: adminHidePost,
    chatRecent: chatRecent, chatSend: chatSend, chatSubscribe: chatSubscribe, chatUnsubscribe: chatUnsubscribe,
    chatSearch: chatSearch, chatDelete: chatDelete
  };
})();
