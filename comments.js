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
  var BADWORDS = ["시발", "씨발", "씨발", "개새끼", "병신", "좆", "니애미", "fuck", "shit", "asshole"];

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
    return sb.auth.getUser()
      .then(function (r) { user = (r && r.data && r.data.user) || null; return user; })
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
        return sb.from("comment_reactions").select("comment_id,user_id,value").in("comment_id", ids)
          .then(function (rr) {
            var rx = {};
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
    return '<div class="cmt' + (isReply ? " reply" : "") + '" data-id="' + esc(c.id) + '" data-name="' + esc(c.name || "익명") + '" data-root="' + esc(root) + '" data-uid="' + esc(c.user_id) + '">' +
      '<div class="cmt-top"><span class="cmt-name">' + esc(c.name || "익명") + "</span>" +
        '<span class="cmt-time">' + timeago(c.created_at) + "</span></div>" +
      '<div class="cmt-body">' + mentionize(esc(c.body)) + "</div>" +
      '<div class="cmt-act">' + react +
        '<button class="cmt-reply" data-id="' + esc(c.id) + '">답글</button>' +
        '<span class="cmt-more-wrap"><button class="cmt-more" aria-label="더보기">⋯</button>' +
          '<div class="cmt-menu" hidden>' +
          (mine ? '<button class="cmt-del" data-id="' + esc(c.id) + '">삭제</button>'
                : '<button class="cmt-report" data-id="' + esc(c.id) + '">🚩 신고</button>') +
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
    var head = user
      ? '<div class="cmt-me">' + esc(uname(user)) + ' · <button class="cmt-out">로그아웃</button></div>' +
        '<div class="cmt-form"><textarea class="cmt-ta" maxlength="300" placeholder="댓글을 남겨보세요"></textarea><button class="cmt-send">등록</button></div><div class="cmt-count"><span>0</span>/300</div>'
      : '<div class="cmt-login"><span class="cmt-login-t">로그인하고 댓글 남기기</span>' +
        ((PROVIDERS && PROVIDERS.google) ? '<button class="cmt-in g" data-p="google">' + GICON + "Google</button>" : "") +
        ((PROVIDERS && PROVIDERS.kakao) ? '<button class="cmt-in kakao" data-p="kakao">카카오</button>' : "") + "</div>";
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
      if (e.target.closest(".cmt-send")) { return send(m, null, m.el.querySelector(".cmt-form .cmt-ta")); }
      if ((t = e.target.closest(".cmt-reply"))) { return toggleReply(m, t); }
      if ((t = e.target.closest(".cmt-del"))) { return del(m, t.getAttribute("data-id")); }
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
    if (!user) { alert("로그인 후 답글을 남길 수 있어요."); return; }
    var isReply = cmt.classList.contains("reply");
    var prefill = isReply ? "@" + cmt.getAttribute("data-name") + " " : "";
    node.innerHTML = '<textarea class="cmt-ta" maxlength="300" placeholder="답글">' + esc(prefill) + "</textarea>" +
      '<button class="cmt-rsend" data-root="' + esc(cmt.getAttribute("data-root")) + '" data-replyuid="' + esc(cmt.getAttribute("data-uid")) + '">답글 등록</button>';
    var ta = node.querySelector(".cmt-ta");
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e2) {} }
  }

  function send(m, parentId, ta, replyToUser) {
    if (!ta) return;
    var body = (ta.value || "").trim();
    if (!body) return;
    if (!user) { alert("로그인이 필요합니다."); return; }
    var rec = {
      thread_key: m.key, parent_id: parentId || null, user_id: user.id,
      reply_to_user: replyToUser || null,
      name: uname(user), avatar: avatarOf(user),
      body: mask(body).slice(0, 300)
    };
    ta.disabled = true;
    sb.from("comments").insert(rec).then(function (r) {
      if (r.error) {
        var em = String(r.error.message || "");
        alert(/banned/.test(em) ? "이용이 제한된 계정입니다." :
              /rate_limit/.test(em) ? "너무 빠르게 작성하고 있어요. 잠시 후 다시 시도해주세요." :
              /duplicate/.test(em) ? "방금 같은 내용을 작성했어요. (도배 방지)" :
              /has_link/.test(em) ? "링크는 작성할 수 없어요." :
              /blocked_word/.test(em) ? "부적절한 내용이 포함되어 등록할 수 없어요." :
              /spam_campaign/.test(em) ? "스팸으로 감지되어 차단되었어요." :
              "등록 실패: " + em);
        ta.disabled = false; return;
      }
      render(m);
    });
  }

  function del(m, id) {
    if (!confirm("댓글을 삭제할까요?")) return;
    sb.from("comments").delete().eq("id", id).then(function () { render(m); });
  }
  function react(m, commentId, value) {
    if (!user) { alert("로그인이 필요합니다."); return; }
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
    nick = mask(nick).slice(0, 30);
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
    if (!user) { alert("로그인이 필요합니다."); return; }
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
    return sb.from("player_ratings").upsert({ player_id: pid, user_id: user.id, score: score, updated_at: new Date().toISOString() }, { onConflict: "player_id,user_id" });
  }

  function inAppBrowser() {
    var ua = (navigator.userAgent || "").toLowerCase();
    return /kakaotalk|instagram|fban|fbav|fb_iab|line\/|naver\(inapp|daumapps|everytimeapp|whale/.test(ua);
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
      ".cmt-form{display:flex;gap:8px;margin-bottom:14px}",
      ".cmt-replybox{margin:6px 0 0 0}",
      ".cmt-ta{flex:1;min-height:44px;resize:vertical;background:var(--bg-soft,#0f1a2a);color:var(--text,#fff);border:1px solid var(--line,#1e2a3a);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px}",
      ".cmt-send,.cmt-rsend{align-self:flex-end;background:var(--accent,#2ee6a6);color:#06281d;font-weight:800;border:0;border-radius:10px;padding:0 16px;height:44px;cursor:pointer}",
      ".cmt-rsend{height:36px;margin-top:6px;font-size:13px}",
      ".cmt-list{display:flex;flex-direction:column;gap:14px}",
      ".cmt-empty{color:var(--muted,#9fb0c3);font-size:13px;padding:8px 0}",
      ".cmt{}",
      ".cmt-top{display:flex;align-items:baseline;gap:8px}",
      ".cmt-name{font-weight:500;font-size:13.5px}",
      ".cmt-time{color:var(--muted,#9fb0c3);font-size:11.5px}",
      ".cmt-body{font-size:14px;line-height:1.5;margin:3px 0;white-space:pre-wrap;word-break:break-word}",
      ".cmt-act{display:flex;gap:12px}",
      ".cmt-act button{background:none;border:0;color:var(--muted,#9fb0c3);font-size:12px;cursor:pointer;padding:0}",
      ".cmt-children{margin:10px 0 0 16px;padding-left:12px;border-left:2px solid var(--line,#1e2a3a);display:flex;flex-direction:column;gap:12px}",
      ".cmt.reply .cmt-body{font-size:13.5px}",
      ".cmt-sort{display:flex;gap:6px;margin-bottom:12px}",
      ".cmt-sortbtn{background:none;border:1px solid var(--line,#1e2a3a);color:var(--muted,#9fb0c3);font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;cursor:pointer}",
      ".cmt-sortbtn.on{background:var(--accent,#2ee6a6);color:#06281d;border-color:var(--accent,#2ee6a6)}",
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

  window.KickComments = {
    mount: mount, configured: configured, ready: ready,
    user: function () { return user; },
    nick: function () { return user ? uname(user) : null; },
    avatar: function () { return avatarOf(user); },
    signIn: signIn,
    signOut: function () { return sb ? sb.auth.signOut() : Promise.resolve(); },
    setNickname: setNickname, myComments: myComments, taggedComments: taggedComments,
    providers: function () { return loadProviders(); },
    isAdmin: isAdmin, listReports: listReports, listAllComments: listAllComments,
    adminDeleteComment: adminDeleteComment, ignoreReport: ignoreReport,
    banUser: banUser, unbanUser: unbanUser, unhideComment: unhideComment,
    ratingStats: ratingStats, playerRating: playerRating, ratePlayer: ratePlayer
  };
})();
