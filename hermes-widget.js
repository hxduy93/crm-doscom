// Hermes Chat — floating widget (FAB) injection.
// Tự inject CSS + DOM + JS vào bất kỳ trang nào include <script src="/hermes-widget.js">.
// Hiện trên CRM Doscom (FB Ads / Google Ads / GEO / Noma911…).
//
// Persistence: session_id lưu vào localStorage (key 'hermes_session_id') —
// tiếp tục conversation khi reload hoặc chuyển tab.

(function () {
  // Skip nếu đang load trong iframe — parent page sẽ render widget của riêng nó.
  // Same-origin nên window.top truy cập được không throw.
  try { if (window !== window.top) return; } catch { return; }
  if (window.__hermesWidgetInjected) return;
  window.__hermesWidgetInjected = true;

  // ─── CSS ──────────────────────────────────────────────────────────────
  const css = `
    #hermes-fab {
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white; border: none; cursor: pointer;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      font-size: 24px; display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #hermes-fab:hover { transform: scale(1.08); box-shadow: 0 6px 18px rgba(59, 130, 246, 0.5); }
    #hermes-fab:active { transform: scale(0.96); }
    #hermes-fab.open { background: linear-gradient(135deg, #6b7280, #4b5563); }

    #hermes-panel {
      position: fixed; bottom: 90px; right: 20px; z-index: 99998;
      width: 380px; height: 580px; max-height: calc(100vh - 110px);
      background: white; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.2);
      display: flex; flex-direction: column; overflow: hidden;
      transform-origin: bottom right; transition: opacity 0.2s, transform 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #hermes-panel.hidden { opacity: 0; transform: scale(0.95) translateY(20px); pointer-events: none; }

    .hermes-header {
      padding: 12px 14px; background: linear-gradient(135deg, #3b82f6, #1e40af); color: white;
      display: flex; justify-content: space-between; align-items: center;
    }
    .hermes-header .title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .hermes-header .title .badge { background: rgba(255,255,255,0.25); padding: 1px 6px; border-radius: 3px; font-size: 10px; }
    .hermes-header .actions { display: flex; gap: 4px; }
    .hermes-header button { background: rgba(255,255,255,0.15); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .hermes-header button:hover { background: rgba(255,255,255,0.3); }

    .hermes-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: #f9fafb; }
    .hermes-msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
    .hermes-msg.user { background: #3b82f6; color: white; align-self: flex-end; border-bottom-right-radius: 3px; }
    .hermes-msg.assistant { background: white; color: #111827; align-self: flex-start; border-bottom-left-radius: 3px; border: 1px solid #e5e7eb; }
    .hermes-msg.system { background: #fef3c7; color: #78350f; align-self: center; font-size: 11.5px; max-width: 90%; }
    .hermes-msg table { border-collapse: collapse; margin: 6px 0; font-size: 11.5px; width: 100%; }
    .hermes-msg th, .hermes-msg td { border: 1px solid #d1d5db; padding: 3px 6px; text-align: left; }
    .hermes-msg th { background: #f3f4f6; }
    .hermes-msg code { background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; font-size: 11.5px; }
    .hermes-msg .meta { margin-top: 5px; padding-top: 5px; border-top: 1px dashed #d1d5db; font-size: 10px; opacity: 0.7; }

    .hermes-empty { color: #6b7280; text-align: center; padding: 20px 12px; font-size: 12.5px; }
    .hermes-empty .title { font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 6px; }

    .hermes-suggestions { padding: 6px 12px; display: flex; flex-wrap: wrap; gap: 5px; background: white; border-top: 1px solid #e5e7eb; }
    .hermes-chip { padding: 4px 8px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 12px; font-size: 11px; cursor: pointer; }
    .hermes-chip:hover { background: #dbeafe; }

    .hermes-input-row { padding: 8px 10px; display: flex; gap: 6px; background: white; border-top: 1px solid #e5e7eb; }
    .hermes-input-row textarea { flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 18px; padding: 7px 12px; font-size: 13px; font-family: inherit; min-height: 34px; max-height: 100px; outline: none; }
    .hermes-input-row textarea:focus { border-color: #3b82f6; }
    .hermes-input-row button { background: #3b82f6; color: white; border: none; border-radius: 18px; padding: 0 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .hermes-input-row button:hover { background: #2563eb; }
    .hermes-input-row button:disabled { background: #9ca3af; cursor: not-allowed; }

    .hermes-typing { font-size: 11px; color: #6b7280; padding: 2px 14px 4px; font-style: italic; background: #f9fafb; }
    .hermes-typing::after { content: '...'; animation: hermes-dots 1s steps(4, end) infinite; }
    @keyframes hermes-dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }

    /* Token-expiry alert badge (chấm đỏ trên FAB) */
    #hermes-fab-badge {
      position: absolute; top: -2px; right: -2px;
      width: 14px; height: 14px; border-radius: 50%;
      background: #ef4444; border: 2px solid white;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
    }
    /* Banner cảnh báo trong panel */
    .hermes-alert {
      padding: 9px 12px; background: #fef2f2; color: #991b1b;
      border-bottom: 1px solid #fecaca; font-size: 12px; line-height: 1.45;
      display: flex; align-items: flex-start; gap: 6px;
    }

    /* Mobile responsive */
    @media (max-width: 540px) {
      #hermes-panel {
        right: 8px; left: 8px; width: auto; bottom: 80px;
        height: calc(100vh - 100px);
      }
      #hermes-fab { right: 12px; bottom: 12px; }
    }

    /* Ẩn widget khi loading-overlay đang hiện (không có class .hide) */
    body.hermes-loading-active #hermes-fab,
    body.hermes-loading-active #hermes-panel {
      display: none !important;
    }
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ─── HTML ─────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.innerHTML = `
    <button id="hermes-fab" title="Chat với Hermes" aria-label="Mở Hermes chat">💬</button>
    <div id="hermes-panel" class="hidden" role="dialog" aria-label="Hermes Chat">
      <div class="hermes-header">
        <div class="title">💬 Hermes <span class="badge">AI</span></div>
        <div class="actions">
          <button id="hermes-new" title="Hội thoại mới">+ Mới</button>
          <button id="hermes-close" title="Đóng">✕</button>
        </div>
      </div>
      <div class="hermes-alert" id="hermes-alert" style="display:none"></div>
      <div class="hermes-messages" id="hermes-messages"></div>
      <div class="hermes-typing" id="hermes-typing" style="display:none">Hermes đang suy nghĩ</div>
      <div class="hermes-suggestions" id="hermes-suggestions">
        <span class="hermes-chip" data-q="Spend Phương Nam tháng này">PN tháng này</span>
        <span class="hermes-chip" data-q="Spend DUY tháng này">DUY tháng này</span>
        <span class="hermes-chip" data-q="KPI tháng này đạt bao nhiêu %">KPI tháng</span>
        <span class="hermes-chip" data-q="Có bài GEO nào chờ duyệt không">GEO chờ duyệt</span>
      </div>
      <div class="hermes-input-row">
        <textarea id="hermes-input" placeholder="Hỏi Hermes... (Enter gửi, Shift+Enter xuống dòng)" rows="1"></textarea>
        <button id="hermes-send">Gửi</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ─── State ─────────────────────────────────────────────────────────────
  const SESSION_KEY = "hermes_session_id";
  let sessionId = null;
  try { sessionId = localStorage.getItem(SESSION_KEY) || null; } catch {}
  let isOpen = false;
  let isSending = false;
  let hasLoadedHistory = false;

  const fab = document.getElementById("hermes-fab");
  const panel = document.getElementById("hermes-panel");
  const messagesEl = document.getElementById("hermes-messages");
  const inputEl = document.getElementById("hermes-input");
  const sendBtn = document.getElementById("hermes-send");
  const typingEl = document.getElementById("hermes-typing");
  const suggestionsEl = document.getElementById("hermes-suggestions");

  // ─── Helpers ───────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    const lines = html.split("\n");
    let inTable = false, tableHtml = "";
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*\|.+\|\s*$/.test(line)) {
        if (!inTable) { inTable = true; tableHtml = "<table>"; }
        const isSep = /^\s*\|[\s\-:|]+\|\s*$/.test(line);
        if (isSep) continue;
        const cells = line.trim().slice(1, -1).split("|").map(c => c.trim());
        const tag = (i + 1 < lines.length && /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])) ? "th" : "td";
        tableHtml += "<tr>" + cells.map(c => "<" + tag + ">" + c + "</" + tag + ">").join("") + "</tr>";
      } else {
        if (inTable) { tableHtml += "</table>"; out.push(tableHtml); inTable = false; tableHtml = ""; }
        out.push(line);
      }
    }
    if (inTable) { tableHtml += "</table>"; out.push(tableHtml); }
    return out.join("<br>");
  }

  function showEmpty() {
    messagesEl.innerHTML = `
      <div class="hermes-empty">
        <div class="title">💬 Chào! Tôi là Hermes</div>
        Hỏi tôi về spend FB, KPI, hoặc content GEO. Click chip dưới hoặc gõ câu hỏi.
      </div>`;
  }

  function appendMessage(role, content, meta) {
    if (messagesEl.querySelector(".hermes-empty")) messagesEl.innerHTML = "";
    const div = document.createElement("div");
    div.className = "hermes-msg " + role;
    div.innerHTML = renderMarkdown(content);
    if (meta) {
      const m = document.createElement("div");
      m.className = "meta";
      m.textContent = meta;
      div.appendChild(m);
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadHistory() {
    if (!sessionId || hasLoadedHistory) return;
    hasLoadedHistory = true;
    try {
      const r = await fetch("/api/hermes/history?session_id=" + encodeURIComponent(sessionId), { credentials: "same-origin" });
      const j = await r.json();
      if (!j.ok) { showEmpty(); return; }
      if (!j.messages?.length) { showEmpty(); return; }
      messagesEl.innerHTML = "";
      for (const m of j.messages) appendMessage(m.role, m.content);
    } catch (e) {
      console.warn("Hermes: load history fail", e);
      showEmpty();
    }
  }

  async function sendMessage(text) {
    if (isSending || !text.trim()) return;
    isSending = true;
    sendBtn.disabled = true;
    typingEl.style.display = "block";
    appendMessage("user", text);
    inputEl.value = "";
    inputEl.style.height = "auto";

    try {
      const r = await fetch("/api/hermes/chat", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      const j = await r.json();
      if (!j.ok) {
        appendMessage("system", "❌ Lỗi: " + (j.error || ("HTTP " + r.status)));
      } else {
        sessionId = j.session_id;
        try { localStorage.setItem(SESSION_KEY, sessionId); } catch {}
        const meta = `🔧 ${j.provider || "?"} · ${j.tools_used?.length || 0} tool · $${(j.cost_usd || 0).toFixed(4)}`;
        appendMessage("assistant", j.response, meta);
      }
    } catch (e) {
      appendMessage("system", "❌ Lỗi mạng: " + e.message);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      typingEl.style.display = "none";
      inputEl.focus();
    }
  }

  function openPanel() {
    panel.classList.remove("hidden");
    fab.classList.add("open");
    fab.textContent = "✕";
    isOpen = true;
    if (sessionId && !hasLoadedHistory) loadHistory();
    else if (!messagesEl.children.length) showEmpty();
    setTimeout(() => inputEl.focus(), 200);
  }

  function closePanel() {
    panel.classList.add("hidden");
    fab.classList.remove("open");
    fab.textContent = "💬";
    isOpen = false;
  }

  function newConversation() {
    sessionId = null;
    hasLoadedHistory = false;
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    messagesEl.innerHTML = "";
    showEmpty();
    inputEl.focus();
  }

  // ─── Event handlers ────────────────────────────────────────────────────
  fab.addEventListener("click", () => { isOpen ? closePanel() : openPanel(); });
  document.getElementById("hermes-close").addEventListener("click", closePanel);
  document.getElementById("hermes-new").addEventListener("click", newConversation);
  sendBtn.addEventListener("click", () => sendMessage(inputEl.value));

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); }
  });
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
  });

  suggestionsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".hermes-chip");
    if (chip) sendMessage(chip.dataset.q);
  });

  // ESC to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closePanel();
  });

  // ─── Token-expiry alert ───────────────────────────────────────────────
  // Gọi /api/hermes/alerts (kiểm hạn token FB). Còn ≤2 ngày hoặc token chết →
  // chấm đỏ trên FAB (thấy ngay không cần mở) + banner đỏ trong panel.
  const alertEl = document.getElementById("hermes-alert");
  async function checkAlert() {
    try {
      const r = await fetch("/api/hermes/alerts", { credentials: "same-origin" });
      const j = await r.json();
      if (j && j.ok && j.alert && j.alert.active) {
        alertEl.textContent = j.alert.msg;
        alertEl.style.display = "flex";
        if (!document.getElementById("hermes-fab-badge")) {
          const b = document.createElement("span");
          b.id = "hermes-fab-badge";
          fab.appendChild(b);
        }
      }
    } catch { /* im lặng — alert là phụ, không chặn widget */ }
  }
  checkAlert();

  showEmpty();

  // ─── Loading overlay detection ─────────────────────────────────────────
  // Nếu trang có #loading-overlay (chưa có class .hide) → ẩn widget.
  // Observe class changes để show widget khi overlay biến mất.
  function syncLoadingState() {
    const overlay = document.getElementById("loading-overlay");
    const isLoading = overlay && !overlay.classList.contains("hide");
    document.body.classList.toggle("hermes-loading-active", !!isLoading);
  }
  syncLoadingState();
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    const mo = new MutationObserver(syncLoadingState);
    mo.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  }
})();
