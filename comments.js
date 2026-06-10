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
  var sortMode = "likes";  // 'likes'(기본) | 'latest'

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
  function uname(u) {
    var m = (u && u.user_metadata) || {};
    return m.name || m.full_name || m.nickname || (u && u.email) || "익명";
  }

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
      .catch(function () { user = null; return null; });
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
    return sb.from("comments").select("*").eq("thread_key", key)
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
    return '<div class="cmt' + (isReply ? " reply" : "") + '" data-id="' + esc(c.id) + '" data-name="' + esc(c.name || "익명") + '" data-root="' + esc(root) + '">' +
      '<div class="cmt-top"><span class="cmt-name">' + esc(c.name || "익명") + "</span>" +
        '<span class="cmt-time">' + timeago(c.created_at) + "</span></div>" +
      '<div class="cmt-body">' + mentionize(esc(c.body)) + "</div>" +
      '<div class="cmt-act">' + react +
        '<button class="cmt-reply" data-id="' + esc(c.id) + '">답글</button>' +
        (mine ? '<button class="cmt-del" data-id="' + esc(c.id) + '">삭제</button>' : "") +
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
        '<div class="cmt-form"><textarea class="cmt-ta" maxlength="1000" placeholder="댓글을 남겨보세요"></textarea><button class="cmt-send">등록</button></div>'
      : '<div class="cmt-login"><span class="cmt-login-t">로그인하고 댓글 남기기</span>' +
        ((PROVIDERS && PROVIDERS.google) ? '<button class="cmt-in" data-p="google">Google</button>' : "") +
        ((PROVIDERS && PROVIDERS.kakao) ? '<button class="cmt-in kakao" data-p="kakao">카카오</button>' : "") + "</div>";
    return '<h3 class="cmt-h">댓글 <span class="cmt-cnt">' + list.length + "</span></h3>" + head +
      (roots.length ? sortUi : "") +
      '<div class="cmt-list">' +
      (roots.length ? roots.map(function (c) { return cHtml(c, false, rx); }).join("") : '<div class="cmt-empty">첫 댓글을 남겨보세요!</div>') +
      "</div>";
  }

  function bind(m) {
    m.el.onclick = function (e) {
      var t;
      if ((t = e.target.closest(".cmt-in"))) { return signIn(t.getAttribute("data-p")); }
      if (e.target.closest(".cmt-out")) { return sb.auth.signOut().then(function () { render(m); }); }
      if ((t = e.target.closest(".cmt-sortbtn"))) { sortMode = t.getAttribute("data-sort"); return paint(m); }
      if ((t = e.target.closest(".cmt-rx"))) { return react(m, t.getAttribute("data-id"), parseInt(t.getAttribute("data-v"), 10)); }
      if (e.target.closest(".cmt-send")) { return send(m, null, m.el.querySelector(".cmt-form .cmt-ta")); }
      if ((t = e.target.closest(".cmt-reply"))) { return toggleReply(m, t); }
      if ((t = e.target.closest(".cmt-del"))) { return del(m, t.getAttribute("data-id")); }
      if ((t = e.target.closest(".cmt-rsend"))) {
        return send(m, t.getAttribute("data-root"), t.parentNode.querySelector(".cmt-ta"));
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
    node.innerHTML = '<textarea class="cmt-ta" maxlength="1000" placeholder="답글">' + esc(prefill) + "</textarea>" +
      '<button class="cmt-rsend" data-root="' + esc(cmt.getAttribute("data-root")) + '">답글 등록</button>';
    var ta = node.querySelector(".cmt-ta");
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e2) {} }
  }

  function send(m, parentId, ta) {
    if (!ta) return;
    var body = (ta.value || "").trim();
    if (!body) return;
    if (!user) { alert("로그인이 필요합니다."); return; }
    var md = user.user_metadata || {};
    var rec = {
      thread_key: m.key, parent_id: parentId || null, user_id: user.id,
      name: uname(user), avatar: md.avatar_url || md.picture || null,
      body: mask(body).slice(0, 1000)
    };
    ta.disabled = true;
    sb.from("comments").insert(rec).then(function (r) {
      if (r.error) { alert("등록 실패: " + r.error.message); ta.disabled = false; return; }
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

  function signIn(provider) {
    if (!client()) return;
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
      ".cmt-at{color:var(--accent,#2ee6a6);font-weight:700}"
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

  window.KickComments = { mount: mount, configured: configured };
})();
