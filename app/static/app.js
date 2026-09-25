/* Tafrigh — local transcription app (no build step, no external requests). */
"use strict";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");

function clock(t) {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function human(t) {
  if (t == null || !isFinite(t)) return "";
  t = Math.round(t);
  if (t < 60) return `${t} s`;
  const m = Math.round(t / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
function bytes(n) {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${u[i]}`;
}
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }) + ` ${time}`;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ICON = {
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 9.5 4.75 4.75 0 0 0 7 19z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="m6 9 6 6 6-6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  gpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="9" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M6 18v2M18 18v2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>',
};

function toast(msg, kind = "") {
  const box = $("#toasts"), el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.append(el);
  raiseToasts(box);
  setTimeout(() => {
    el.remove();
    if (!box.children.length && box.hidePopover) try { box.hidePopover(); } catch { /* already hidden */ }
  }, kind === "error" ? 7000 : 3500);
}

// Show the toasts in the top layer (a popover), above a modal dialog and its blurred backdrop. Showing it
// again puts it above a dialog opened after it. Browsers without popovers keep it under dialogs.
function raiseToasts(box) {
  if (!box.showPopover) return;
  try {
    if (box.matches(":popover-open")) box.hidePopover();
    box.showPopover();
  } catch { /* not supported here */ }
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------
const api = {
  async req(method, path, body) {
    const opt = { method, headers: { "X-Tafrigh": "1" } };
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    const r = await fetch(path, opt);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
    return data;
  },
  get: (p) => api.req("GET", p),
  post: (p, b = {}) => api.req("POST", p, b),
  patch: (p, b) => api.req("PATCH", p, b),
  del: (p) => api.req("DELETE", p),
  upload(file, params, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/jobs?" + new URLSearchParams(params));
      xhr.setRequestHeader("X-Tafrigh", "1");
      xhr.setRequestHeader("Content-Type", file.type && file.type !== "application/json" ? file.type : "application/octet-stream");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
        xhr.status < 300 ? resolve(data) : reject(new Error(data.error || `${xhr.status} ${xhr.statusText}`));
      };
      xhr.onerror = () => reject(new Error("the upload failed (connection closed)"));
      xhr.send(file);
      S.uploadXhr = xhr;
    });
  },
};

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------
const S = {
  status: null, jobs: [], route: { name: "new" },
  job: null, lines: [], edited: false, partial: false, hasAudio: false, log: "",
  editing: false, dirty: false, search: "", matchIndex: -1, follow: true,
  form: { file: null, path: null, seconds: null, model: null, speakers: null, language: null, prompt: "", title: "", confirm: false },
  uploading: null, uploadXhr: null, lastUserScroll: 0, currentLine: -1, jobPoll: null, lineSig: "",
};
const ACTIVE = new Set(["preparing", "queued", "running"]);
const model = (id) => (S.status?.models || []).find((m) => m.id === id);
const spkColor = (sid) => (sid ? `var(--s${((parseInt(sid, 10) - 1) % 8 + 8) % 8 + 1})` : "var(--faint)");
const spkName = (sid) => (sid == null ? "" : (S.job?.speaker_names || {})[sid] || `Speaker ${sid}`);
// Inside the desktop app's native window: open/save dialogs and the system browser for links.
const desktopApi = () => (window.pywebview && window.pywebview.api) || null;
// A line's direction from its mix of scripts rather than its first letter: Egyptian speech often opens
// with an English word ("order", "the project") and goes on in Arabic, which dir="auto" lays out left to
// right. Mostly Arabic words (a word with an Arabic prefix like الـdata counts as Arabic) means rtl.
const AR_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;
function mixDir(text) {
  let ar = 0, la = 0;
  for (const w of String(text || "").split(/\s+/)) {
    if (AR_LETTER.test(w)) ar++;
    else if (LATIN_LETTER.test(w)) la++;
  }
  if (!ar && !la) return "auto";
  return ar && ar >= 0.3 * (ar + la) ? "rtl" : "ltr";
}
const EXPORT_TYPES = { txt: ["Text", "text/plain"], srt: ["Subtitles", "application/x-subrip"], vtt: ["Web subtitles", "text/vtt"],
  md: ["Markdown", "text/markdown"], json: ["JSON", "application/json"] };
// the same file name the server suggests (server.py slug): letters, digits, _ and -, spaces to -
const fileSlug = (t) => (t || "").replace(/[^\p{L}\p{N}_\s-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 80) || "transcript";
const DL_ACTIVE = new Set(["queued", "downloading", "verifying", "unpacking", "converting"]);
const downloading = () => (S.status?.models || []).some((m) => m.download && DL_ACTIVE.has(m.download.state))
  || [S.status?.voiceprints, S.status?.cuda].some((d) => d && DL_ACTIVE.has(d.state));
// "Intel(R) Iris(R) Xe Graphics (ADL GT2)" -> "Intel Iris Xe Graphics"; short: "Iris Xe"
const gpuName = (n) => (n || "").replace(/\((R|TM)\)/gi, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();
const gpuShort = (n) => gpuName(n).replace(/\b(Intel|NVIDIA|AMD|Radeon\(TM\)|Graphics|Laptop|GPU)\b/gi, "").replace(/\s+/g, " ").trim() || gpuName(n);
function deviceLabel(d) {
  if (!d) return "";
  const [kind, ...rest] = String(d).split(":");
  if (!rest.length) return kind.startsWith("cpu (") ? "Processor (the graphics card failed, so it finished there)" : "Processor";
  const name = gpuName(rest.join(":").replace(/\s*\((int8_float16|float16)\)\s*$/, ""));
  return `Graphics card: ${name} (${kind === "cuda" ? "CUDA" : kind === "vulkan" ? "Vulkan" : kind})`;
}

function downloadBlock(id, d, compact = false) {
  if (!d) return "";
  if (DL_ACTIVE.has(d.state)) {
    const pct = d.total ? Math.min(100, d.done / d.total * 100) : 0;
    const what = { verifying: "Checking the download", queued: "Waiting", unpacking: "Unpacking", converting: "Converting for faster-whisper" }[d.state]
      || `Downloading ${Math.round(pct)}%`;
    return `<div class="dl"><div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="dl-row"><span>${what}${d.total ? ` · ${bytes(d.done)} of ${bytes(d.total)}` : ""}</span>
      <button type="button" class="linkish" data-dl-cancel="${esc(id)}">Cancel</button></div></div>`;
  }
  const left = Math.max(0, d.missing - d.partial);
  const error = d.state === "error" ? `<div class="mc-missing">${esc(d.error || "The download failed")}</div>` : "";
  if (d.installed) return compact ? "" : `<span class="pill ok">Downloaded · ${bytes(d.size)}</span>`;
  const convert = !left && model(id)?.hub?.kind === "transformers";  // downloaded, not converted yet
  return `${error}<button type="button" class="btn btn-sm btn-primary" data-dl="${esc(id)}">${ICON.download} ${convert ? "Convert" : `${d.partial ? "Resume" : "Download"} (${bytes(left)})`}</button>`;
}

async function startDownload(id) {
  try { S.status = await api.post(`/api/downloads/${id}`); renderTop(); refreshDownloadViews(); scheduleStatus(); }
  catch (e) { toast(e.message, "error"); }
}
async function cancelDownload(id) {
  try { S.status = await api.post(`/api/downloads/${id}/cancel`); refreshDownloadViews(); } catch (e) { toast(e.message, "error"); }
}
function refreshDownloadViews() {
  if (S.route.name === "new") renderModelGrid();
  if ($("#settings").open) renderSettings();
}

// ---------------------------------------------------------------------------------------------
// Top bar, sidebar
// ---------------------------------------------------------------------------------------------
function renderTop() {
  const st = S.status;
  if (!st) return;
  const ready = st.models.filter((m) => m.ready);
  const local = ready.filter((m) => m.kind === "local").length, hosted = ready.filter((m) => m.kind === "hosted").length;
  const pills = [`<span class="pill accent" title="${esc(ready.map((m) => m.title).join(", "))}">${ICON.laptop} ${local} local${hosted ? ` · ${ICON.cloud} ${hosted} hosted` : ""} ready</span>`];
  if (st.power === "power-saver") pills.push(`<button class="pill warn" data-open-settings="power" title="Local models run 3–5× slower in power-saver mode">${ICON.bolt} Power-saver: slower</button>`);
  else if (st.power === "performance") pills.push(`<span class="pill ok">${ICON.bolt} Performance mode</span>`);
  const gpu = st.gpu?.devices?.[0];
  if (gpu && st.settings?.device !== "cpu") pills.push(`<button class="pill ok" data-open-settings="speed" title="Local models use ${esc(gpuName(gpu.name))} where they can">${ICON.gpu} GPU: ${esc(gpuShort(gpu.name))}</button>`);
  const active = S.jobs.filter((j) => ACTIVE.has(j.status)).length;
  if (active) pills.push(`<span class="pill accent"><span class="dot pulse"></span>${active} in progress</span>`);
  if (downloading()) pills.push(`<button class="pill accent" data-open-settings="models">${ICON.download} Downloading</button>`);
  $("#topStatus").innerHTML = pills.join("");
  $("#storageInfo").textContent = `${S.jobs.length} transcription${S.jobs.length === 1 ? "" : "s"} · ${st.storage.free_gb} GB free`;
}

function statusLabel(j) {
  switch (j.status) {
    case "done": return `<span class="s" style="color:var(--ok)">Done</span>`;
    case "failed": return `<span class="s" style="color:var(--danger)">Failed</span>`;
    case "cancelled": return `<span class="s" style="color:var(--faint)">Cancelled</span>`;
    case "interrupted": return `<span class="s" style="color:var(--warn)">Interrupted</span>`;
    case "queued": return `<span class="s" style="color:var(--muted)">Queued</span>`;
    default: return `<span class="s" style="color:var(--accent)"><span class="dot pulse" style="display:inline-block"></span></span>`;
  }
}

function jobPercent(j) {
  if (j.status === "preparing" && j.total) return (j.done || 0) / j.total * 30;
  if (j.status === "running" && j.stage === "transcribing" && j.total) return 5 + (j.done || 0) / j.total * 95;
  if (j.status === "running" && j.stage === "uploading" && j.total) return (j.done || 0) / j.total * 50;
  if (j.status === "running") return 5;
  return 0;
}

function renderSidebar() {
  const q = $("#jobSearch").value.trim().toLowerCase();
  const jobs = S.jobs.filter((j) => !q || (j.title || "").toLowerCase().includes(q) || (j.model_title || "").toLowerCase().includes(q));
  if (!jobs.length) {
    $("#jobList").innerHTML = `<div class="empty-list">${S.jobs.length ? "No matches" : "Your transcriptions will appear here."}</div>`;
    return;
  }
  const today = new Date().toDateString();
  let group = null;
  $("#jobList").innerHTML = jobs.map((j) => {
    const g = new Date(j.created).toDateString() === today ? "Today" : "Earlier";
    const head = g !== group ? `<div class="job-group">${(group = g)}</div>` : "";
    const activeCls = S.route.name === "job" && S.route.id === j.id ? " active" : "";
    const bar = ACTIVE.has(j.status) ? `<div class="bar"><i style="width:${jobPercent(j).toFixed(1)}%"></i></div>` : "";
    return `${head}<a class="job-item${activeCls}" href="#/job/${j.id}">
      <span class="t" dir="${mixDir(j.title || "Untitled")}">${esc(j.title || "Untitled")}</span>${statusLabel(j)}
      <span class="d">${j.kind === "hosted" ? ICON.cloud.replace("<svg", '<svg style="width:13px;height:13px"') : ""}${esc(j.model_title || j.model)}${j.audio_s ? ` · ${clock(j.audio_s)}` : ""}</span>
      ${bar}</a>`;
  }).join("");
}

// ---------------------------------------------------------------------------------------------
// New transcription
// ---------------------------------------------------------------------------------------------
function formDefaults() {
  const d = S.status.defaults, f = S.form;
  if (!f.model) {
    const pick = model(d.model)?.ready ? d.model : (S.status.models.find((m) => m.ready) || {}).id;
    f.model = pick || d.model;
  }
  if (f.speakers == null) f.speakers = String(d.speakers ?? "auto");
  if (f.language == null) f.language = d.language || "ar";
}

function estimateText(m, seconds, short = false) {
  if (!m) return "";
  if (m.kind === "hosted") return short ? "Usually a few minutes, plus the upload" : `${esc(m.service)} usually takes a few minutes, plus the upload`;
  const sp = m.speed || { rtf: m.rtf };
  const slow = S.status.power === "power-saver" && !sp.measured;  // a measured speed already includes it
  const where = sp.runs_on === "gpu" ? " on the graphics card" : "";
  if (!seconds) return `About <b>${sp.rtf}×</b> the recording's length here${where}${slow ? " (more in power-saver mode)" : ""}`;
  const t = seconds * (sp.rtf || 1) * (slow ? 3.5 : 1);
  if (short) return `About <b>${human(t)}</b> here${slow ? " (power-saver)" : ""}`;
  return `About <b>${human(t)}</b> on this computer${where}${sp.measured ? " (measured on earlier runs)" : ""}${slow ? " in power-saver mode. Performance mode (Settings) is about 3–5× faster" : ""}`;
}

function speakerHint(m, speakers) {
  if (speakers === "none") return "One block of text with timestamps, no names.";
  if (m?.speakers_hint) return esc(m.speakers_hint);
  if (m?.id === "speechmatics") return "Speechmatics works out the number of speakers itself; any choice here other than No labels turns labels on.";
  if (m?.id === "elevenlabs" && speakers !== "auto") return "ElevenLabs treats the number as the most speakers to find.";
  return "Labels Speaker 1, Speaker 2… by voice. Give the real number of people if you know it; auto-detect works well for larger meetings.";
}

function modelCard(m) {
  const f = S.form, sel = f.model === m.id;
  const badges = m.kind === "local"
    ? `<span class="pill accent">${ICON.laptop} On this computer</span>${m.hub ? '<span class="pill">From Hugging Face</span>' : ""}`
    : `<span class="pill cloud">${ICON.cloud} Uploads to ${esc(m.service)}</span>`;
  let state = "";
  if (!m.ready && m.kind === "hosted") state = `<span class="mc-missing">Needs an API key — <button type="button" class="linkish" data-open-settings="${esc(m.id)}">add it</button></span>`;
  else if (!m.ready && m.download) state = `<span class="mc-missing">Not downloaded yet</span>${downloadBlock(m.id, m.download)}`;
  else if (!m.ready) state = `<span class="mc-missing">${esc(m.reason)}</span>`;
  const foot = m.ready ? `<div class="mc-foot">${estimateText(m, f.seconds, true)}</div>` : `<div class="mc-foot">${state}</div>`;
  return `<div class="model-card${m.ready ? "" : " unavailable"}" role="radio" tabindex="0" aria-checked="${sel && m.ready}" data-model="${esc(m.id)}">
    <div class="mc-badges">${badges}</div>
    <div class="mc-title">${esc(m.title)}</div>
    <div class="mc-tag">${esc(m.tagline || "")}</div>
    <ul>${(m.facts || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${foot}
  </div>`;
}

function renderNew() {
  stopJobPoll();
  hidePlayer();
  formDefaults();
  const f = S.form, m = model(f.model), st = S.status;
  const src = f.file ? { name: f.file.name, size: f.file.size } : f.path;
  const speakerOpts = [["none", "No labels"], ["auto", "Auto-detect"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]];
  const custom = !speakerOpts.some(([v]) => v === f.speakers);
  const hosted = m && m.kind === "hosted";
  const ok = src && m && m.ready && (!hosted || f.confirm) && !S.uploading;
  view.innerHTML = `
  <h1>New transcription</h1>
  <p class="lead">Audio or video recordings of meetings and calls, in Egyptian Arabic with English terms. Local models keep everything on this computer.</p>

  <div class="card">
    <div class="step-head"><span class="step-num">1</span> Recording</div>
    ${src ? `
      <div class="chosen">
        <div class="ico">${ICON.wave}</div>
        <div class="grow">
          <div class="name" dir="auto">${esc(src.name)}</div>
          <div class="sub">${[bytes(src.size), f.seconds ? clock(f.seconds) : "", f.path ? "read in place (not copied)" : ""].filter(Boolean).join(" · ")}</div>
          ${f.file && f.previewUrl ? `<audio controls preload="metadata" src="${f.previewUrl}"></audio>` : ""}
        </div>
        <button class="btn btn-sm" id="changeFile" ${S.uploading ? "disabled" : ""}>Change</button>
      </div>` : `
      <div class="dropzone" id="drop" tabindex="0" role="button" aria-label="Choose a recording">
        ${ICON.upload}
        <div class="big">Drop a recording here</div>
        <div class="small">or <span class="linkish">choose a file</span> — mp3, m4a, wav, ogg, mp4, mkv, webm… up to ${st ? "4" : ""} GB</div>
      </div>
      <details class="path">
        <summary>Or use a file already on this computer (no upload, no copy)</summary>
        <div class="row"><input type="text" id="pathInput" placeholder="/home/you/Videos/meeting.mp4" spellcheck="false"><button class="btn" id="pathBtn">Use file</button></div>
      </details>`}
    <input type="file" id="fileInput" accept="audio/*,video/*,.mkv,.opus,.flac,.amr,.3gp" hidden>
  </div>

  <div class="card">
    <div class="step-head"><span class="step-num">2</span> Model <span class="aside">Local models are free and private; hosted ones are usually more accurate</span></div>
    <div class="model-grid" id="modelGrid" role="radiogroup" aria-label="Model">${st.models.map(modelCard).join("")}</div>
  </div>

  <div class="card">
    <div class="step-head"><span class="step-num">3</span> Options</div>
    <div class="field">
      <span class="field-label">Speakers</span>
      <div class="segmented" id="spk">${speakerOpts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${f.speakers === v}">${t}</button>`).join("")}<input type="number" id="spkN" min="1" max="20" placeholder="7+" value="${custom ? esc(f.speakers) : ""}" aria-label="Number of speakers"></div>
      <p class="hint">${speakerHint(m, f.speakers)}${!st.speakers_ready && m?.kind === "local" ? " <b>The voiceprint model is not downloaded, so local models will skip speaker labels.</b>" : ""}</p>
    </div>
    <div class="grid2">
      <div class="field">
        <span class="field-label">Language</span>
        <div class="segmented" id="lang">${[["ar", "Arabic + English"], ["en", "English"], ["auto", "Auto-detect"]].map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${f.language === v}">${t}</button>`).join("")}</div>
        <p class="hint">${m?.id === "cohere" && f.language === "auto" ? "Cohere can't detect the language, so it will use Arabic." : "Arabic + English is right for code-switched meetings."}</p>
      </div>
      <div class="field">
        <label for="titleInput">Title</label>
        <input type="text" id="titleInput" dir="${mixDir(f.title)}" data-mixdir value="${esc(f.title)}" placeholder="${esc(src ? src.name.replace(/\.[^.]+$/, "") : "Meeting title")}">
      </div>
    </div>
    ${m?.prompt ? `<div class="field">
      <label for="promptInput">Vocabulary <span class="opt">optional</span></label>
      <textarea id="promptInput" dir="auto" rows="2" placeholder="Names and terms, comma-separated: Jira, GitHub, backend, deployment">${esc(f.prompt)}</textarea>
      <p class="hint">${esc(m.prompt_hint) || { elevenlabs: "Sent as key terms (up to 5 words each). ElevenLabs charges about 20% more for requests with key terms.",
        speechmatics: "Sent as custom vocabulary (up to 6 words per term)." }[m.id] || "Given to Whisper as a hint. Plausible but untested; leave empty if unsure."}</p>
    </div>` : ""}
  </div>

  ${hosted && m.ready ? `<div class="card consent">
    ${ICON.cloud}
    <div>
      <p><b>This model uploads the recording to ${esc(m.service)}.</b> It leaves this computer and is processed on their servers under their terms. ${esc(m.privacy) || (m.id === "elevenlabs" ? "ElevenLabs may use it for training unless you opted out (Profile → Data use)." : "Speechmatics does not train on it unless you opted in; the app deletes the job there after fetching the transcript.")}</p>
      <label><input type="checkbox" id="confirmUpload" ${f.confirm ? "checked" : ""}> Upload this recording to ${esc(m.service)}</label>
    </div>
  </div>` : ""}

  <div class="start-row">
    <div class="estimate">${m?.ready ? estimateText(m, f.seconds) : ""}</div>
    <button class="btn btn-primary btn-lg" id="startBtn" ${ok ? "" : "disabled"}>${S.uploading ? "Uploading…" : "Start transcription"}</button>
  </div>
  ${S.uploading ? `<div class="card" style="margin-top:14px"><div class="row" style="display:flex;justify-content:space-between;margin-bottom:8px"><b>Uploading to the app</b><span class="hint" id="uploadText" style="margin:0">${bytes(S.uploading.loaded)} of ${bytes(S.uploading.total)}</span></div><div class="progress"><i style="width:${(S.uploading.loaded / S.uploading.total * 100).toFixed(1)}%"></i></div><p class="hint">Copying the file into the app's folder on this computer — nothing is sent anywhere else yet.</p></div>` : ""}
  `;
  bindNew();
}

function renderModelGrid() {
  const grid = $("#modelGrid");
  if (!grid) return;
  grid.innerHTML = S.status.models.map(modelCard).join("");
  bindModelCards();
}

function bindModelCards() {
  const f = S.form;
  $$(".model-card").forEach((card) => {
    const pick = (e) => {
      if (e.target.closest("[data-open-settings], [data-dl], [data-dl-cancel]")) return;
      const m = model(card.dataset.model);
      if (!m.ready) { if (m.kind === "hosted") openSettings(m.id); return; }
      if (f.model !== m.id) { f.model = m.id; f.confirm = false; renderNew(); }
    };
    card.onclick = pick;
    card.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(e));
  });
}

async function usePath(p) {
  try {
    const info = await api.post("/api/probe", { path: p });
    Object.assign(S.form, { file: null, path: info, seconds: info.seconds, previewUrl: null });
    renderNew();
  } catch (e) { toast(e.message, "error"); }
}

async function chooseFile(input) {
  const d = desktopApi();
  if (d && d.pick_file) {  // native dialog: the file is read in place, not copied
    try { const p = await d.pick_file(); if (p) await usePath(p); } catch (e) { toast(e.message, "error"); }
    return;
  }
  input.click();
}

function setFile(file) {
  const f = S.form;
  if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  Object.assign(f, { file, path: null, seconds: null, previewUrl: URL.createObjectURL(file) });
  const a = new Audio();
  a.preload = "metadata";
  a.onloadedmetadata = () => { if (isFinite(a.duration)) { f.seconds = a.duration; if (S.route.name === "new") renderNew(); } };
  a.src = f.previewUrl;
  renderNew();
}

function bindNew() {
  const f = S.form;
  const input = $("#fileInput");
  input.onchange = () => input.files[0] && setFile(input.files[0]);
  const drop = $("#drop");
  if (drop) {
    drop.onclick = () => chooseFile(input);
    drop.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && chooseFile(input);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && setFile(e.dataTransfer.files[0]); };
  }
  const change = $("#changeFile");
  if (change) change.onclick = () => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); Object.assign(f, { file: null, path: null, seconds: null, previewUrl: null }); renderNew(); };
  const pathBtn = $("#pathBtn");
  if (pathBtn) {
    const use = () => { const p = $("#pathInput").value.trim(); if (p) usePath(p); };
    pathBtn.onclick = use;
    $("#pathInput").onkeydown = (e) => e.key === "Enter" && use();
  }
  bindModelCards();
  $$("#spk button").forEach((b) => (b.onclick = () => { f.speakers = b.dataset.v; renderNew(); }));
  const spkN = $("#spkN");
  spkN.oninput = () => { const n = parseInt(spkN.value, 10); if (n >= 1 && n <= 20) { f.speakers = String(n); $$("#spk button").forEach((b) => b.setAttribute("aria-pressed", "false")); } };
  $$("#lang button").forEach((b) => (b.onclick = () => { f.language = b.dataset.v; renderNew(); }));
  $("#titleInput").oninput = (e) => (f.title = e.target.value);
  const pr = $("#promptInput");
  if (pr) pr.oninput = (e) => (f.prompt = e.target.value);
  const cu = $("#confirmUpload");
  if (cu) cu.onchange = () => { f.confirm = cu.checked; renderNew(); };
  $("#startBtn").onclick = start;
}

async function start() {
  const f = S.form, m = model(f.model);
  const params = { model: m.id, speakers: f.speakers, language: f.language, prompt: m.prompt ? f.prompt : "",
    title: f.title.trim(), confirm_upload: m.kind === "hosted" && f.confirm ? "1" : "0" };
  try {
    let job;
    if (f.path) {
      job = await api.post("/api/jobs", { ...params, path: f.path.path });
    } else {
      S.uploading = { loaded: 0, total: f.file.size };
      renderNew();
      job = await api.upload(f.file, { ...params, name: f.file.name }, (loaded, total) => {
        S.uploading = { loaded, total };
        const bar = $(".progress i"), text = $("#uploadText");
        if (bar) bar.style.width = `${(loaded / total * 100).toFixed(1)}%`;
        if (text) text.textContent = `${bytes(loaded)} of ${bytes(total)}`;
      });
    }
    S.uploading = null;
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    S.form = { file: null, path: null, seconds: null, model: f.model, speakers: f.speakers, language: f.language, prompt: f.prompt, title: "", confirm: false };
    await refreshJobs();
    location.hash = `#/job/${job.id}`;
  } catch (e) {
    S.uploading = null;
    toast(e.message, "error");
    renderNew();
  }
}

// ---------------------------------------------------------------------------------------------
// Job view
// ---------------------------------------------------------------------------------------------
const STAGES = {
  waiting: "Waiting to prepare the audio",
  converting: "Preparing the audio",
  starting: "Starting",
  decoding: "Reading the audio",
  loading: "Loading the model",
  speakers: "Telling speakers apart by voice",
  transcribing: "Transcribing",
  uploading: "Uploading",
  remote: "Transcribing on the service",
};

function stageInfo(j) {
  const m = model(j.model);
  if (j.status === "queued") return { label: j.kind === "local" ? "Waiting for the previous local job" : "Waiting to start", pct: null };
  if (j.status === "preparing") {
    const pct = j.stage === "converting" && j.total ? (j.done || 0) / j.total * 100 : null;
    return { label: STAGES[j.stage] || "Preparing", pct, detail: pct != null ? `${Math.round(pct)}%` : "" };
  }
  let label = STAGES[j.stage] || "Working", pct = null, detail = "";
  if (j.stage === "transcribing" && j.total) {
    pct = (j.done || 0) / j.total * 100;
    detail = `part ${j.done} of ${j.total}`;
  } else if (j.stage === "uploading" && j.total) {
    pct = (j.done || 0) / j.total * 100;
    label = `Uploading to ${m?.service || "the service"}`;
    detail = `${bytes(j.done)} of ${bytes(j.total)}`;
  } else if (j.stage === "remote") {
    label = `${m?.service || "The service"} is transcribing`;
  }
  return { label, pct, detail };
}

function etaText(j) {
  if (j.status !== "running" || j.elapsed == null) return "";
  let eta = null;
  if (j.stage === "transcribing" && j.total && j.done > 0) eta = j.elapsed / j.done * (j.total - j.done);
  return `${human(j.elapsed)} elapsed${eta != null ? ` · about ${human(eta)} left` : ""}`;
}

function speakerStats() {
  const talk = {};
  let total = 0;
  for (const x of S.lines) {
    if (x.speaker == null) continue;
    const d = Math.max(0, x.end - x.start);
    talk[x.speaker] = (talk[x.speaker] || 0) + d;
    total += d;
  }
  const ids = Object.keys(talk).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return { ids, talk, total };
}

function renderJob() {
  const j = S.job;
  if (!j) { view.innerHTML = `<div class="welcome">Loading…</div>`; return; }
  const m = model(j.model);
  const active = ACTIVE.has(j.status);
  const opts = j.options || {};
  const stats = speakerStats();
  const meta = [
    `<span>${j.kind === "hosted" ? ICON.cloud : ICON.laptop} ${esc(j.model_title || j.model)}</span>`,
    j.audio_s ? `<span>${ICON.clock} ${clock(j.audio_s)}</span>` : "",
    stats.ids.length ? `<span>${ICON.users} ${stats.ids.length} speaker${stats.ids.length === 1 ? "" : "s"}</span>` : "",
    j.seconds ? `<span>${ICON.cpu} took ${human(j.seconds)}${j.rtf ? ` (${Number(j.rtf).toFixed(2)}× real time)` : ""}</span>` : "",
    `<span>${esc(when(j.created))}</span>`,
  ].filter(Boolean).join("");
  const otherModels = (S.status?.models || []).filter((x) => x.ready);
  const exportMenu = ["txt", "srt", "vtt", "md", "json"].map((fmt) => `<a href="/api/jobs/${j.id}/export/${fmt}" data-fmt="${fmt}" download>${ICON.download} ${{ txt: "Text (.txt)", srt: "Subtitles (.srt)", vtt: "Web subtitles (.vtt)", md: "Markdown (.md)", json: "JSON (.json)" }[fmt]}</a>`).join("");
  const rerunMenu = otherModels.map((x) => `<button data-rerun="${esc(x.id)}">${x.kind === "hosted" ? ICON.cloud : ICON.laptop} ${esc(x.title)}<span class="sub">${x.id === j.model ? "same" : x.kind === "hosted" ? "uploads" : "local"}</span></button>`).join("");
  const hasLines = S.lines.length > 0;

  let statusCard = "";
  if (active) {
    const si = stageInfo(j);
    statusCard = `<div class="card progress-card" id="progressCard">
      <div class="row"><span class="stage" id="stageLabel">${esc(si.label)}</span><span class="hint" id="stageDetail" style="margin:0">${esc(si.detail || "")}</span><span class="times" id="stageTimes">${etaText(j)}</span></div>
      <div class="progress${si.pct == null ? " indeterminate" : ""}" id="stageBar"><i style="width:${(si.pct || 0).toFixed(1)}%"></i></div>
      <p class="note">${j.kind === "local" ? "Running on this computer. You can leave this page; it keeps going while the app is open." : `Sent to ${esc(m?.service || "the service")}. You can leave this page.`}</p>
      <div style="margin-top:12px"><button class="btn btn-sm btn-danger" id="cancelBtn">${ICON.stop} Cancel</button></div>
    </div>`;
  } else if (["failed", "interrupted", "cancelled"].includes(j.status)) {
    const title = { failed: "The transcription failed", interrupted: "The transcription was interrupted", cancelled: "The transcription was cancelled" }[j.status];
    statusCard = `<div class="card ${j.status === "failed" ? "error-card" : ""}">
      <div class="step-head" style="margin-bottom:6px">${esc(title)}</div>
      ${j.error ? `<div dir="auto">${esc(j.error).replace(/\n/g, "<br>")}</div>` : ""}
      ${hasLines ? `<p class="hint">The transcript below is what was finished before it stopped.</p>` : ""}
      ${S.log ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">Show log</summary><pre class="log">${esc(S.log)}</pre></details>` : ""}
      <div style="margin-top:12px"><button class="btn btn-sm" data-rerun="${esc(j.model)}">${ICON.redo} Try again</button></div>
    </div>`;
  }

  view.innerHTML = `
  <div class="job-head">
    <div class="title-row">
      <h1 class="job-title" id="jobTitle" contenteditable="plaintext-only" spellcheck="false" dir="${mixDir(j.title || "Untitled")}" data-mixdir title="Click to rename">${esc(j.title || "Untitled")}</h1>
    </div>
    <div class="meta">${meta}</div>
    <div class="actions">
      <div class="menu-wrap"><button class="btn" data-menu="exportMenu" ${hasLines ? "" : "disabled"}>${ICON.download} Export ${ICON.chevron}</button><div class="menu" id="exportMenu">${exportMenu}</div></div>
      <button class="btn" id="copyBtn" ${hasLines ? "" : "disabled"}>${ICON.copy} Copy text</button>
      <div class="menu-wrap"><button class="btn" data-menu="rerunMenu" ${S.hasAudio ? "" : "disabled"}>${ICON.redo} Run again with ${ICON.chevron}</button><div class="menu" id="rerunMenu">${rerunMenu || '<button disabled>No other model is ready</button>'}</div></div>
      <button class="btn${S.editing ? " btn-primary" : ""}" id="editBtn" ${hasLines && !active ? "" : "disabled"}>${ICON.edit} ${S.editing ? "Done editing" : "Edit"}</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-danger" id="deleteBtn">${ICON.trash} Delete</button>
    </div>
  </div>
  ${statusCard}
  ${hasLines || !active ? `
  <div class="job-body">
    <div>
      <div class="tools">
        <div class="search-wrap">${ICON.search}<input type="search" id="lineSearch" placeholder="Search the transcript" value="${esc(S.search)}" aria-label="Search the transcript"></div>
        <span class="count" id="matchCount"></span>
        <button class="icon-btn" id="prevMatch" title="Previous match" aria-label="Previous match">${ICON.up}</button>
        <button class="icon-btn" id="nextMatch" title="Next match" aria-label="Next match">${ICON.down}</button>
        ${S.hasAudio ? `<label class="toggle"><input type="checkbox" id="followToggle" ${S.follow ? "checked" : ""}> Follow playback</label>` : ""}
      </div>
      <div class="transcript" id="transcript">${renderLines()}</div>
      ${S.dirty ? `<div class="editbar"><span>Unsaved changes</span><button class="btn btn-sm" id="discardBtn">Discard</button><button class="btn btn-sm btn-primary" id="saveBtn">Save</button></div>` : ""}
    </div>
    <div class="side-col">
      ${stats.ids.length ? `<div class="panel"><h3>Speakers</h3>${stats.ids.map((sid) => speakerRow(sid, stats)).join("")}</div>` : ""}
      ${detailsPanel()}
    </div>
  </div>` : ""}`;
  bindJob();
  updateMatches();
  if (S.hasAudio) showPlayer(j); else hidePlayer();
}

function speakerRow(sid, stats) {
  const share = stats.total ? stats.talk[sid] / stats.total * 100 : 0;
  const others = stats.ids.filter((x) => x !== sid);
  return `<div class="spk" style="--c:${spkColor(sid)}">
    <span class="sw"></span><input type="text" dir="auto" data-name="${esc(sid)}" value="${esc((S.job.speaker_names || {})[sid] || "")}" placeholder="Speaker ${esc(sid)}" aria-label="Name for speaker ${esc(sid)}">
    <div class="share-bar"><i style="width:${share.toFixed(1)}%"></i></div>
    <div class="share"><span>${human(stats.talk[sid])} · ${Math.round(share)}%</span>${others.length ? `<div class="menu-wrap">
      <button type="button" class="merge-btn" data-menu="merge-${esc(sid)}" aria-haspopup="menu" aria-label="Merge ${esc(spkName(sid))} into another speaker" ${ACTIVE.has(S.job.status) ? "disabled" : ""}>Merge into ${ICON.chevron}</button>
      <div class="menu merge-menu" id="merge-${esc(sid)}" role="menu">${others.map((o) => `<button type="button" role="menuitem" data-merge-from="${esc(sid)}" data-merge-into="${esc(o)}"><span class="sw" style="background:${spkColor(o)}"></span>${esc(spkName(o))}</button>`).join("")}</div>
    </div>` : ""}</div>
  </div>`;
}

// How the transcript was made (recording, model, run, computer), worded by the server (app/report.py).
// The main lines show; the rest are under More details. Older transcriptions simply have fewer lines.
// The lines that name hardware or a system get the vendors' logos (brands.js).
function detailsPanel() {
  const groups = S.detailGroups || [];
  if (!groups.length) return "";
  const branded = new Set(["Ran on", "Computer", "Processor", "Graphics", "System"]);
  const logos = (r) => (branded.has(r.label) && typeof brandIcons === "function" ? brandIcons(r.value) : "");
  const block = (more) => groups.map((g) => {
    const rows = g.rows.filter((r) => r.more === more);
    return rows.length ? `<h4>${esc(g.title)}</h4><dl class="kv">${rows.map((r) => `<dt>${esc(r.label)}</dt><dd dir="${mixDir(r.value)}">${logos(r)}${esc(r.value)}</dd>`).join("")}</dl>` : "";
  }).join("");
  const more = block(true);
  return `<div class="panel job-details"><h3>Details</h3>${block(false)}
    ${more ? `<details class="more" id="moreDetails"${S.moreDetails ? " open" : ""}><summary>More details</summary>${more}</details>` : ""}
    <button type="button" class="btn btn-sm" id="copyDetails">${ICON.copy} Copy details</button></div>`;
}

function detailsText() {
  const groups = S.detailGroups.map((g) => [g.title, ...g.rows.map((r) => `${r.label}: ${r.value}`)].join("\n"));
  return [S.job.title || "Untitled", ...groups].join("\n\n") + "\n";
}

function highlight(text) {
  const q = S.search.trim();
  if (!q) return esc(text);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let out = "", last = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function renderLines() {
  const j = S.job;
  if (!S.lines.length) {
    if (ACTIVE.has(j.status)) return `<div class="empty-transcript">The transcript appears here as it is made.</div>`;
    return `<div class="empty-transcript">No speech was found in this recording.</div>`;
  }
  const ids = speakerStats().ids;
  let prev = null;
  const html = S.lines.map((x, i) => {
    const first = !prev || prev.speaker !== x.speaker || x.start - prev.end > 20;
    prev = x;
    let who = "";
    if (S.editing) {
      const opts = ids.map((sid) => `<option value="${esc(sid)}" ${sid === x.speaker ? "selected" : ""}>${esc(spkName(sid))}</option>`).join("");
      who = `<div class="who"><select data-line="${i}" aria-label="Speaker"><option value="" ${x.speaker == null ? "selected" : ""}>No speaker</option>${opts}<option value="__new">New speaker…</option></select></div>`;
    } else if (first && x.speaker != null) {
      who = `<div class="who">${esc(spkName(x.speaker))}</div>`;
    }
    return `<div class="line${first ? " first" : ""}" data-i="${i}" style="--c:${spkColor(x.speaker)}">
      <button class="ts" data-t="${x.start}" title="Play from here" ${S.hasAudio ? "" : "disabled"}>${clock(x.start)}</button>
      ${who}<p class="text" dir="${mixDir(x.text)}" data-mixdir${S.editing ? ' contenteditable="plaintext-only"' : ""}>${S.editing ? esc(x.text) : highlight(x.text)}</p>
    </div>`;
  }).join("");
  const note = S.partial && ACTIVE.has(j.status) ? `<div class="partial-note">Transcript so far — it updates as the model works.</div>` : "";
  return html + note;
}

function bindJob() {
  const j = S.job;
  const title = $("#jobTitle");
  title.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); title.blur(); } if (e.key === "Escape") { title.textContent = j.title; title.blur(); } };
  title.onblur = async () => {
    const t = title.textContent.trim();
    if (t && t !== j.title) {
      try { await api.patch(`/api/jobs/${j.id}`, { title: t }); S.job.title = t; refreshJobs(); } catch (e) { toast(e.message, "error"); }
    } else title.textContent = j.title;
  };
  $$("[data-menu]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); toggleMenu(b.dataset.menu); }));
  $$("[data-rerun]").forEach((b) => (b.onclick = () => rerun(b.dataset.rerun)));
  $$("#exportMenu a").forEach((a) => (a.onclick = async (e) => {
    const fmt = a.dataset.fmt, d = desktopApi();
    if (d && d.save_export) {  // the native window: its own Save dialog
      e.preventDefault();
      closeMenus();
      try { const saved = await d.save_export(j.id, fmt); if (saved) toast(`Saved ${saved}`); } catch (err) { toast(err.message, "error"); }
      return;
    }
    if (!window.showSaveFilePicker) return;  // other browsers: the link downloads the file
    e.preventDefault();
    closeMenus();
    let handle;
    try {  // ask first, while the click still counts as the user's action
      const [description, mime] = EXPORT_TYPES[fmt];
      handle = await window.showSaveFilePicker({ suggestedName: `${fileSlug(j.title)}.${fmt}`, types: [{ description, accept: { [mime]: [`.${fmt}`] } }] });
    } catch (err) {
      if (err.name !== "AbortError") location.href = a.href;  // the picker isn't allowed here: download instead
      return;
    }
    try {
      const r = await fetch(a.href);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const out = await handle.createWritable();
      await out.write(await r.blob());
      await out.close();
      toast(`Saved ${handle.name}`);
    } catch (err) { toast(`Could not save: ${err.message}`, "error"); }
  }));
  const copy = $("#copyBtn");
  if (copy) copy.onclick = async () => {
    try {
      const r = await fetch(`/api/jobs/${j.id}/export/txt?details=0`);  // the text only; Copy details has the rest
      await navigator.clipboard.writeText(await r.text());
      toast("Transcript copied");
    } catch (e) { toast("Could not copy: " + e.message, "error"); }
  };
  const copyDetails = $("#copyDetails");
  if (copyDetails) copyDetails.onclick = async () => {
    try { await navigator.clipboard.writeText(detailsText()); toast("Details copied"); } catch (e) { toast("Could not copy: " + e.message, "error"); }
  };
  const moreDetails = $("#moreDetails");
  if (moreDetails) moreDetails.ontoggle = () => (S.moreDetails = moreDetails.open);  // stays open across re-renders
  const edit = $("#editBtn");
  if (edit) edit.onclick = () => {
    if (S.editing && S.dirty && !confirm("Discard your unsaved changes?")) return;
    S.editing = !S.editing; S.dirty = false; renderJob();
  };
  const cancel = $("#cancelBtn");
  if (cancel) cancel.onclick = async () => {
    if (!confirm("Stop this transcription?")) return;
    try { await api.post(`/api/jobs/${j.id}/cancel`); await loadJob(j.id); } catch (e) { toast(e.message, "error"); }
  };
  $("#deleteBtn").onclick = async () => {
    if (!confirm(`Delete “${j.title}”? Its audio and transcript are removed from this computer.`)) return;
    try { await api.del(`/api/jobs/${j.id}`); toast("Deleted"); await refreshJobs(); location.hash = "#/new"; } catch (e) { toast(e.message, "error"); }
  };
  $$("[data-name]").forEach((inp) => {
    const save = async () => {
      const names = { ...(S.job.speaker_names || {}), [inp.dataset.name]: inp.value.trim() };
      try { const r = await api.patch(`/api/jobs/${j.id}`, { speaker_names: names }); applyJob(r); renderTranscriptOnly(); } catch (e) { toast(e.message, "error"); }
    };
    inp.onchange = save;
    inp.onkeydown = (e) => e.key === "Enter" && inp.blur();
  });
  $$("[data-merge-into]").forEach((b) => (b.onclick = async () => {
    const from = b.dataset.mergeFrom, into = b.dataset.mergeInto;
    closeMenus();
    if (!confirm(`Merge ${spkName(from)} into ${spkName(into)}? All their lines move over.`)) return;
    try { const r = await api.patch(`/api/jobs/${j.id}`, { merge: { from, into } }); applyJob(r); renderJob(); toast("Speakers merged"); } catch (e) { toast(e.message, "error"); }
  }));
  const search = $("#lineSearch");
  if (search) {
    search.oninput = debounce(() => { S.search = search.value; S.matchIndex = -1; renderTranscriptOnly(); }, 150);
    search.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); } };
    $("#nextMatch").onclick = () => stepMatch(1);
    $("#prevMatch").onclick = () => stepMatch(-1);
  }
  const follow = $("#followToggle");
  if (follow) follow.onchange = () => (S.follow = follow.checked);
  bindTranscript();
  const save = $("#saveBtn");
  if (save) save.onclick = saveEdits;
  const discard = $("#discardBtn");
  if (discard) discard.onclick = () => { S.dirty = false; renderJob(); };
}

function bindTranscript() {
  const tr = $("#transcript");
  if (!tr) return;
  tr.onclick = (e) => {
    const ts = e.target.closest(".ts");
    if (ts && S.hasAudio) { const a = $("#audio"); a.currentTime = parseFloat(ts.dataset.t); a.play(); }
  };
  if (S.editing) {
    tr.oninput = () => markDirty();
    $$("select[data-line]", tr).forEach((sel) => (sel.onchange = () => {
      if (sel.value === "__new") {
        const ids = speakerStats().ids.map((x) => parseInt(x, 10));
        const next = String((ids.length ? Math.max(...ids) : 0) + 1);
        sel.insertAdjacentHTML("beforeend", `<option value="${next}">Speaker ${next}</option>`);
        sel.value = next;
      }
      sel.closest(".line").style.setProperty("--c", spkColor(sel.value || null));
      markDirty();
    }));
  }
}

function markDirty() {
  if (S.dirty) return;
  S.dirty = true;
  const col = $("#transcript").parentElement;
  col.insertAdjacentHTML("beforeend", `<div class="editbar"><span>Unsaved changes</span><button class="btn btn-sm" id="discardBtn">Discard</button><button class="btn btn-sm btn-primary" id="saveBtn">Save</button></div>`);
  $("#saveBtn").onclick = saveEdits;
  $("#discardBtn").onclick = () => { S.dirty = false; renderJob(); };
}

async function saveEdits() {
  const lines = S.lines.map((x, i) => {
    const el = $(`.line[data-i="${i}"]`);
    if (!el) return x;
    const text = el.querySelector(".text").innerText.replace(/\s+/g, " ").trim();
    const sel = el.querySelector("select[data-line]");
    return { ...x, text, speaker: sel ? sel.value || null : x.speaker };
  });
  try {
    const r = await api.patch(`/api/jobs/${S.job.id}`, { lines });
    S.dirty = false;
    applyJob(r);
    renderJob();
    toast("Saved");
  } catch (e) { toast(e.message, "error"); }
}

async function rerun(modelId) {
  const m = model(modelId);
  if (!m) return;
  closeMenus();
  let confirmUpload = false;
  if (m.kind === "hosted") {
    if (!confirm(`Upload this recording to ${m.service} to transcribe it? It leaves this computer.`)) return;
    confirmUpload = true;
  }
  try {
    const r = await api.post(`/api/jobs/${S.job.id}/rerun`, { model: modelId, confirm_upload: confirmUpload });
    await refreshJobs();
    location.hash = `#/job/${r.id}`;
  } catch (e) { toast(e.message, "error"); }
}

function renderTranscriptOnly() {
  const tr = $("#transcript");
  if (!tr) return renderJob();
  tr.innerHTML = renderLines();
  S.currentLine = -1;
  bindTranscript();
  updateMatches();
  syncCurrentLine(true);
}

function updateMatches() {
  const count = $("#matchCount");
  if (!count) return;
  const marks = $$("#transcript mark");
  count.textContent = S.search.trim() ? `${marks.length} match${marks.length === 1 ? "" : "es"}` : "";
}

function stepMatch(dir) {
  const marks = $$("#transcript mark");
  if (!marks.length) return;
  marks.forEach((m) => m.classList.remove("focus"));
  S.matchIndex = (S.matchIndex + dir + marks.length) % marks.length;
  const m = marks[S.matchIndex];
  m.classList.add("focus");
  m.scrollIntoView({ block: "center", behavior: "smooth" });
  $("#matchCount").textContent = `${S.matchIndex + 1} of ${marks.length}`;
}

function applyJob(r) {
  S.job = r.job;
  S.lines = r.lines || [];
  S.edited = r.edited;
  S.partial = r.partial;
  S.hasAudio = r.has_audio;
  S.log = r.log || "";
  S.detailGroups = r.detail_groups || [];
}

async function loadJob(id) {
  try {
    const r = await api.get(`/api/jobs/${id}`);
    if (S.route.name !== "job" || S.route.id !== id) return;
    const wasActive = S.job && S.job.id === id && ACTIVE.has(S.job.status);
    const sig = `${r.lines.length}|${r.edited}|${r.job.status}`;
    const sameJob = S.job && S.job.id === id;
    applyJob(r);
    if (sameJob && wasActive && ACTIVE.has(r.job.status) && sig === S.lineSig) {
      updateProgress();  // only the progress moved: keep scroll position and focus
    } else if (!S.editing || !sameJob) {
      S.lineSig = sig;
      renderJob();
    }
    S.lineSig = sig;
    if (ACTIVE.has(r.job.status)) startJobPoll(id); else stopJobPoll();
    if (wasActive && !ACTIVE.has(r.job.status)) {
      refreshJobs();
      if (r.job.status === "done") toast("Transcription finished");
    }
  } catch (e) {
    stopJobPoll();
    view.innerHTML = `<div class="welcome"><h1>Not found</h1><p>${esc(e.message)}</p><p><a href="#/new">New transcription</a></p></div>`;
  }
}

function updateProgress() {
  const j = S.job, si = stageInfo(j);
  const label = $("#stageLabel");
  if (!label) return renderJob();
  label.textContent = si.label;
  $("#stageDetail").textContent = si.detail || "";
  $("#stageTimes").textContent = etaText(j);
  const bar = $("#stageBar");
  bar.classList.toggle("indeterminate", si.pct == null);
  bar.firstElementChild.style.width = `${(si.pct || 0).toFixed(1)}%`;
}

function startJobPoll(id) {
  if (S.jobPoll) return;
  S.jobPoll = setInterval(() => loadJob(id), 1200);
}
function stopJobPoll() {
  clearInterval(S.jobPoll);
  S.jobPoll = null;
}

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------
const audio = $("#audio");

function showPlayer(j) {
  const src = `/api/jobs/${j.id}/audio`;
  if (!audio.src.endsWith(src)) { audio.src = src; S.currentLine = -1; }
  $("#nowTitle").textContent = j.title || "";
  $("#player").hidden = false;
}
function hidePlayer() {
  if (!audio.paused) audio.pause();
  $("#player").hidden = true;
}
function setPlayIcon() {
  $("#playIcon").innerHTML = audio.paused ? ICON.play : ICON.pause;
  $("#playBtn").setAttribute("aria-label", audio.paused ? "Play" : "Pause");
}

function lineAt(t) {
  let lo = 0, hi = S.lines.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (S.lines[mid].start <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best >= 0 && t <= S.lines[best].end + 1.5 ? best : -1;
}

function syncCurrentLine(force = false) {
  const i = lineAt(audio.currentTime);
  if (i === S.currentLine && !force) return;
  $$("#transcript .line.current").forEach((el) => el.classList.remove("current"));
  S.currentLine = i;
  if (i < 0) return;
  const el = $(`#transcript .line[data-i="${i}"]`);
  if (!el) return;
  el.classList.add("current");
  if (S.follow && !audio.paused && Date.now() - S.lastUserScroll > 4000 && !S.editing) el.scrollIntoView({ block: "center", behavior: "smooth" });
}

audio.ontimeupdate = () => {
  $("#curTime").textContent = clock(audio.currentTime);
  if (isFinite(audio.duration) && document.activeElement !== $("#seek")) $("#seek").value = Math.round(audio.currentTime / audio.duration * 1000);
  syncCurrentLine();
};
audio.onloadedmetadata = () => ($("#durTime").textContent = clock(audio.duration));
audio.onplay = audio.onpause = setPlayIcon;
$("#playBtn").onclick = () => (audio.paused ? audio.play() : audio.pause());
$("#backBtn").onclick = () => (audio.currentTime = Math.max(0, audio.currentTime - 5));
$("#fwdBtn").onclick = () => (audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5));
$("#seek").oninput = (e) => { if (isFinite(audio.duration)) audio.currentTime = e.target.value / 1000 * audio.duration; };
$("#rate").onchange = (e) => (audio.playbackRate = parseFloat(e.target.value));
["wheel", "touchmove", "keydown"].forEach((ev) => $("#main").addEventListener(ev, () => (S.lastUserScroll = Date.now()), { passive: true }));

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
function openSettings(focus) {
  if (!S.status) return;  // still starting up
  renderSettings(focus);
  $("#settings").showModal();
}

function renderSettings(focus) {
  const st = S.status;
  const hosted = st.models.filter((m) => m.kind === "hosted");
  const keyRows = hosted.map((m) => {
    const src = m.key_source === "environment" ? `<span class="pill ok">From the environment</span>` : m.key_source === "app" ? `<span class="pill ok">Saved</span>` : `<span class="pill warn">Not set</span>`;
    return `<div class="key-row" id="key-${esc(m.id)}">
      <div class="top"><b>${esc(m.title)}</b>${src}</div>
      <form class="row" data-key-form="${esc(m.id)}"><input type="text" name="username" value="${esc(m.id)}" autocomplete="off" hidden>
        <input type="password" data-key="${esc(m.id)}" placeholder="${m.key_source ? "Replace the key" : "Paste your API key"}" autocomplete="new-password" spellcheck="false">
        ${m.region != null ? `<input type="text" data-region value="${esc(m.region)}" placeholder="Region, e.g. westeurope" aria-label="${esc(m.service)} region" title="The region of your resource: the key works only there" autocomplete="off" spellcheck="false" style="flex:0 1 11em;min-width:7em">` : ""}
        <button class="btn" type="submit">Save</button>
        ${m.key_source === "app" ? `<button class="btn btn-ghost btn-danger" type="button" data-clear-key="${esc(m.id)}">Remove</button>` : ""}</form>
      <p>${m.key_url ? `Get a key: <a href="${esc(m.key_url)}" target="_blank" rel="noopener noreferrer">${esc(m.key_url.replace(/^https:\/\//, ""))}</a>. ` : ""}${esc((m.facts || []).slice(-1)[0] || "")}.</p>
    </div>`;
  }).join("");
  const local = st.models.filter((m) => m.kind === "local" && m.download);
  const items = [...local.map((m) => [m.id, m.title, m.download, m.hub]), ...(st.voiceprints ? [["voiceprints", "Voiceprint model (speaker labels)", st.voiceprints]] : [])];
  const modelRows = items.map(([id, title, d, hub]) => {
    const cached = !d.installed && model(id)?.ready;  // found elsewhere, e.g. the Hugging Face cache
    const pill = d.installed ? `<span class="pill ok">Downloaded</span>` : cached ? `<span class="pill ok">Ready</span>` : `<span class="pill warn">Not downloaded</span>`;
    const actions = cached && !DL_ACTIVE.has(d.state) ? `<span class="hint" style="margin:0">Uses the copy already in the Hugging Face cache</span>`
      : downloadBlock(id, d, true) + (d.installed && !DL_ACTIVE.has(d.state) ? `<span class="hint" style="margin:0">${bytes(d.on_disk || d.size)}</span><button type="button" class="btn btn-sm btn-ghost btn-danger" data-dl-remove="${esc(id)}">Delete</button>` : "");
    const from = hub ? `<div class="hint" style="margin:0 0 6px">From <a href="https://huggingface.co/${esc(hub.repo)}" target="_blank" rel="noopener noreferrer">${esc(hub.repo)}</a> · ${esc(hub.label || hub.kind)}</div>` : "";
    const forget = hub && !DL_ACTIVE.has(d.state) ? `<button type="button" class="btn btn-sm btn-ghost" data-forget-model="${esc(id)}">Remove from the app</button>` : "";
    return `<div class="key-row"><div class="top"><b>${esc(title)}</b>${pill}</div>${from}<div class="dl-actions">${actions}${forget}</div></div>`;
  }).join("");

  // Speed: graphics card, power mode, threads
  const set = st.settings || {};
  const gpu = st.gpu || {};
  const devices = gpu.devices || [];
  const best = devices[0];
  const nvidia = (gpu.cuda_devices || 0) > 0;
  const cudaReady = !!gpu.cuda_libs || !!st.cuda?.installed;
  let gpuText;
  if (!st.gpu && st.gpu_probing) gpuText = "Looking for a graphics card…";
  else if (gpu.error) gpuText = `Couldn't check the graphics card: ${esc(gpu.error)}`;
  else if (!devices.length && !nvidia) gpuText = "No graphics card that can help was found, so everything runs on the processor.";
  else if (set.device === "cpu") gpuText = `Off: everything runs on the processor. Found: ${devices.map((d) => esc(gpuName(d.name))).join(", ")}.`;
  else {
    const mem = (d) => d.type === "igpu" ? "shared memory" : d.memory ? `${Math.round(d.memory / 2 ** 30)} GB` : "";
    gpuText = `${devices.map((d) => `<b>${esc(gpuName(d.name))}</b>${mem(d) ? ` (${mem(d)})` : ""}`).join(", ")}<br>`
      + (best ? `Cohere runs on ${esc(gpuName(best.name))} through Vulkan. ` : "")
      + (nvidia ? (cudaReady ? "Whisper models run on the NVIDIA GPU through CUDA." : "Whisper models can run on the NVIDIA GPU once NVIDIA's libraries are downloaded:")
        : "Whisper models run on the processor (they can only use NVIDIA GPUs).");
  }
  const cudaRow = nvidia && st.cuda && set.device !== "cpu" && !cudaReady
    ? `<div class="set-sub">${downloadBlock("cuda", st.cuda)}<span class="hint" style="margin:0">cuBLAS from NVIDIA, ${bytes(st.cuda.on_disk)} on disk</span></div>` : "";
  const p = st.power;
  const powerRows = p ? `
      <div class="set-row">
        <div class="set-text"><b>Power mode</b><span class="hint">Local models run about 3–5× slower in power-saver mode.</span></div>
        <div class="seg">${["performance", "balanced", "power-saver"].map((x) => `<button type="button" class="${p === x ? "on" : ""}" data-power="${x}">${x === "performance" ? ICON.bolt + " " : ""}${x[0].toUpperCase() + x.slice(1).replace("-s", "-s")}</button>`).join("")}</div>
      </div>
      <label class="set-row">
        <div class="set-text"><b>Performance mode while transcribing</b><span class="hint">Switch to performance while a local model runs, and back to ${esc(p === "performance" ? "the previous mode" : p)} when it's done.</span></div>
        <input type="checkbox" class="switch" data-setting="performance_while_running" ${set.performance_while_running ? "checked" : ""}>
      </label>` : "";
  const threads = set.threads || 10, cores = st.cpu_threads || threads;
  $("#settingsBody").innerHTML = `
    <section>
      <h3>Models on this computer</h3>
      ${modelRows || '<p class="hint">No downloadable models are configured.</p>'}
      ${hubBlock()}
      <p class="hint">Downloads resume if the connection drops and are checked against a pinned checksum before use.</p>
    </section>
    <section id="set-speed">
      <h3>Speed</h3>
      <div class="set-list">
        <label class="set-row">
          <div class="set-text"><b>${ICON.gpu} Use the graphics card</b><span class="hint">${gpuText}</span></div>
          <input type="checkbox" class="switch" data-setting="device" ${set.device !== "cpu" ? "checked" : ""} ${!devices.length && !nvidia ? "disabled" : ""}>
        </label>
        ${cudaRow}
        ${powerRows}
        <div class="set-row">
          <div class="set-text"><b>Processor threads</b><span class="hint">How many of this computer's ${cores} threads the local models use.</span></div>
          <div class="num"><input type="number" min="1" max="${cores}" value="${Math.min(threads, cores)}" data-setting="threads" aria-label="Processor threads"><span>of ${cores}</span></div>
        </div>
      </div>
    </section>
    <section>
      <h3>API keys for hosted models</h3>
      ${keyRows}
      <p class="hint">${ICON.lock.replace("<svg", '<svg style="width:13px;height:13px;vertical-align:-2px"')} Keys are saved in <code class="mono">${esc(st.storage.dir)}/secrets.json</code>, readable only by your user, and are sent only to their own service. A recording is uploaded only when you pick a hosted model and confirm.</p>
    </section>
    <section>
      <h3>About</h3>
      <div class="about">
        <img src="/static/icon.svg" alt="" width="44" height="44">
        <div class="about-text">
          <b>Tafrigh ${esc(st.version || "")}</b>
          <span>Transcripts of Egyptian Arabic–English meetings, made on your own computer.</span>
          <span>By Mohammed El-sayed Ahmed. Free software under the AGPL-3.0; commercial licences are available.</span>
          <span class="links"><a href="https://github.com/MohammedEl-sayedAhmed/arabic-stt" target="_blank" rel="noopener noreferrer">${ICON.external} Source code</a>
            <a href="https://github.com/MohammedEl-sayedAhmed/arabic-stt/releases" target="_blank" rel="noopener noreferrer">${ICON.external} Releases</a>
            <a href="https://github.com/MohammedEl-sayedAhmed/arabic-stt/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${ICON.external} Licence</a></span>
        </div>
      </div>
      <div class="set-list">
        <div class="set-row">
          <div class="set-text"><b>Your data</b><span class="hint">${st.storage.jobs} transcription${st.storage.jobs === 1 ? "" : "s"} · ${bytes(st.storage.used_mb * 1e6)} · ${st.storage.free_gb} GB free on this disk</span>
            <code class="mono path">${esc(st.storage.dir)}</code></div>
          <button type="button" class="btn btn-sm" id="openFolder">${ICON.folder} Open folder</button>
        </div>
      </div>
      <p class="hint">Models are kept in <code class="mono">${esc(st.home)}/models</code>. The port, defaults and model list are set in <code class="mono">app/config.toml</code>; your own changes can go in <code class="mono">${esc(st.storage.dir)}/config.toml</code>.</p>
    </section>`;
  $$("[data-key-form]").forEach((form) => (form.onsubmit = (e) => { e.preventDefault(); saveKey(form.dataset.keyForm, $("[data-key]", form).value, $("[data-region]", form)?.value); }));
  $$("[data-clear-key]").forEach((b) => (b.onclick = () => confirm("Remove the saved key?") && saveKey(b.dataset.clearKey, "")));
  $$("[data-power]").forEach((b) => (b.onclick = async () => {
    try { await api.post("/api/power", { profile: b.dataset.power }); await refreshStatus(); renderSettings(); toast(`Power mode: ${b.dataset.power}`); } catch (e) { toast(e.message, "error"); }
  }));
  $$("input[data-setting]").forEach((el) => (el.onchange = async () => {
    const key = el.dataset.setting;
    const value = key === "device" ? (el.checked ? "auto" : "cpu") : key === "threads" ? parseInt(el.value, 10) : el.checked;
    if (key === "threads" && !(value >= 1 && value <= cores)) { el.value = threads; return; }
    try { S.status = await api.post("/api/settings", { [key]: value }); renderTop(); renderSettings(); if (S.route.name === "new") renderModelGrid(); toast("Saved"); }
    catch (e) { toast(e.message, "error"); }
  }));
  const open = $("#openFolder");
  if (open) open.onclick = async () => { try { await api.post("/api/open-folder"); } catch (e) { toast(e.message, "error"); } };
  bindHub();
  $$("[data-forget-model]").forEach((b) => (b.onclick = () => forgetModel(b.dataset.forgetModel)));
  if (focus === "speed") setTimeout(() => $("#set-speed")?.scrollIntoView({ block: "start" }), 50);
  else if (focus && focus !== "power") { const el = $(`[data-key="${focus}"]`); if (el) setTimeout(() => el.focus(), 50); }
}

// Adding models from Hugging Face (Settings → Models). The state lives here, not in the dialog, which is
// rebuilt on every status poll while a download runs; the caret in the link field is put back too.
const HUB = { url: "", busy: false, found: null, error: "", caret: null, catalogOpen: true, pick: {} };
const GPU_USE = { any: "Can use any graphics card (Vulkan)", nvidia: "Can use NVIDIA graphics cards only (CUDA)" };
const quant = (file) => (String(file).match(/[-_.]((?:I?Q\d\w*?)|BF16|F16|F32)\.gguf$/i) || [null, file])[1];

// Recommended models (app/catalog.toml): built in, added, or added here in one click through the importer.
function catalogBlock() {
  const list = S.status?.catalog || [];
  if (!list.length) return "";
  return `<details id="catalog"${HUB.catalogOpen ? " open" : ""}>
    <summary class="hint" style="margin:0 0 8px;cursor:pointer"><b>Recommended models</b> for Egyptian Arabic–English meetings and calls</summary>
    ${list.map(catalogRow).join("")}
  </details>`;
}

function catalogRow(c) {
  const builtin = c.builtin ? model(c.builtin) : null;
  const file = (c.added && c.added_file) || HUB.pick[c.key] || c.files?.[0]?.file;
  const size = builtin ? builtin.download?.size : c.files ? c.files.find((f) => f.file === file)?.size : c.size;
  const pick = c.files?.length > 1 && !c.added && !builtin
    ? `<select data-catalog-file="${esc(c.key)}" aria-label="File for ${esc(c.name)}">${c.files.map((f) => `<option value="${esc(f.file)}"${f.file === file ? " selected" : ""}>${esc(quant(f.file))} (${bytes(f.size)})</option>`).join("")}</select>` : "";
  const action = builtin ? `<span class="pill">Built in</span>`
    : c.added ? `<span class="pill ok">Added${c.added_file && c.files?.length > 1 ? `: ${esc(quant(c.added_file))}` : ""}</span>`
    : c.problem ? "" : `<button type="button" class="btn btn-sm btn-primary" data-catalog-add="${esc(c.key)}" ${HUB.busy ? "disabled" : ""}>${ICON.download} Add (${bytes(size)})</button>`;
  const facts = [size ? bytes(size) : "", `Licence: ${esc(c.licence)}`, esc(GPU_USE[c.gpu] || c.gpu)];
  return `<div class="key-row"><div class="top"><b>${esc(c.name)}</b>${pick}${action}</div>
    <p style="margin-top:0">${esc(c.good_for)}</p>
    <p>${esc(c.evidence)}</p>
    <p>${facts.filter(Boolean).join(" · ")}</p>
    ${c.problem ? `<p class="mc-missing">${esc(c.problem)}</p>` : ""}
  </div>`;
}

function hubBlock() {
  const h = HUB, input = $("#hubUrl");
  h.caret = input && document.activeElement === input ? [input.selectionStart, input.selectionEnd] : null;
  return `${catalogBlock()}<div class="hub">
    <p class="hint" style="margin:0 0 8px"><b>Add a model from Hugging Face.</b> Paste the link to its page, or its name (org/name). Whisper models for faster-whisper or in Transformers format, and GGUF speech models for transcribe.cpp, can be added.</p>
    <form class="row" id="hubForm"><input type="text" id="hubUrl" value="${esc(h.url)}" placeholder="https://huggingface.co/org/name" spellcheck="false" autocomplete="off" aria-label="Hugging Face link or model name">
      <button class="btn" type="submit" ${h.busy ? "disabled" : ""}>${h.busy ? "Checking…" : "Check"}</button></form>
    ${h.found ? hubFound(h.found) : ""}
    ${h.error ? `<div class="hub-found error" role="alert">${esc(h.error)}</div>` : ""}
  </div>`;
}

function hubFound(f) {
  const file = f.choices && f.choices.length > 1
    ? `<select id="hubFile" aria-label="Model file" ${HUB.busy ? "disabled" : ""}>${f.choices.map((c) => `<option value="${esc(c.file)}"${c.file === f.file ? " selected" : ""}>${esc(c.file)} (${bytes(c.size)})</option>`).join("")}</select>`
    : `<code>${esc(f.file)}</code>`;
  const action = f.problem ? `<p class="mc-missing" style="margin:0">${esc(f.problem)}</p>`
    : f.added ? `<span class="pill ok">Already in the app</span>`
    : `<button type="button" class="btn btn-sm btn-primary" id="hubAdd" ${HUB.busy ? "disabled" : ""}>${ICON.download} Add and download (${bytes(f.size)})</button>`;
  return `<div class="hub-found"><dl class="kv">
      <dt>Model</dt><dd><a href="https://huggingface.co/${esc(f.repo)}" target="_blank" rel="noopener noreferrer">${esc(f.repo)}</a></dd>
      <dt>Kind</dt><dd>${esc(f.label)}</dd>
      ${f.architecture ? `<dt>Architecture</dt><dd><code>${esc(f.architecture)}</code></dd>` : ""}
      ${f.file ? `<dt>File</dt><dd>${file}</dd>` : ""}
      <dt>Size</dt><dd>${bytes(f.size)}${f.kind === "transformers" ? ", then converted on this computer" : ""}</dd>
      <dt>Licence</dt><dd>${esc(f.licence || "Not stated on the model page")}</dd>
      <dt>Revision</dt><dd><code>${esc(f.revision.slice(0, 7))}</code></dd>
    </dl>${action}</div>`;
}

function bindHub() {
  const form = $("#hubForm"), input = $("#hubUrl");
  if (!form) return;
  input.oninput = () => (HUB.url = input.value);
  form.onsubmit = (e) => { e.preventDefault(); hubCheck(); };
  if (HUB.caret) { input.focus(); input.setSelectionRange(...HUB.caret); }
  const file = $("#hubFile");
  if (file) file.onchange = () => hubCheck(file.value);
  const add = $("#hubAdd");
  if (add) add.onclick = hubAdd;
  const list = $("#catalog");
  if (list) list.ontoggle = () => (HUB.catalogOpen = list.open);
  $$("[data-catalog-file]").forEach((sel) => (sel.onchange = () => { HUB.pick[sel.dataset.catalogFile] = sel.value; rerenderHub(); }));
  $$("[data-catalog-add]").forEach((b) => (b.onclick = () => catalogAdd(b.dataset.catalogAdd)));
}

const rerenderHub = () => $("#settings").open && renderSettings();

async function hubCheck(file) {
  const url = HUB.url.trim();
  if (!url || HUB.busy) return;
  Object.assign(HUB, { busy: true, error: "" }, file ? {} : { found: null });
  rerenderHub();
  try { HUB.found = await api.post("/api/hub/inspect", file ? { url, file } : { url }); }
  catch (e) { Object.assign(HUB, { found: null, error: e.message }); }
  HUB.busy = false;
  rerenderHub();
}

// Adds a model and starts its download; returns the error message, if any.
async function addModel(body, name) {
  Object.assign(HUB, { busy: true, error: "" });
  rerenderHub();
  try {
    S.status = await api.post("/api/hub/add", body);
    toast(`Added ${name}. The download has started.`);
    renderTop(); scheduleStatus();
    if (S.route.name === "new") renderNew();
    return null;
  } catch (e) { return e.message; }
  finally { HUB.busy = false; }
}

async function hubAdd() {
  const f = HUB.found;
  if (!f || HUB.busy) return;
  const error = await addModel({ url: HUB.url.trim(), file: f.file || undefined, revision: f.revision }, f.repo);
  Object.assign(HUB, error ? { error } : { url: "", found: null });
  rerenderHub();
}

async function catalogAdd(key) {
  const c = (S.status?.catalog || []).find((x) => x.key === key);
  if (!c || HUB.busy) return;
  const file = c.files ? HUB.pick[key] || c.files[0].file : undefined;
  const error = await addModel({ url: c.repo, file, revision: c.revision }, c.name);
  if (error) toast(error, "error");
  rerenderHub();
}

async function forgetModel(id) {
  const m = model(id);
  if (!confirm(`Remove ${m ? m.title : id} from the app? Its files are deleted from this computer. You can add it again later.`)) return;
  try {
    S.status = await api.del(`/api/models/${id}`);
    if (S.form.model === id) S.form.model = null;
    renderTop(); refreshDownloadViews();
    if (S.route.name === "new") renderNew();
    toast("Removed");
  } catch (e) { toast(e.message, "error"); }
}

async function removeDownload(id) {
  if (!confirm("Delete this model's files from this computer? You can download them again later.")) return;
  try { S.status = await api.del(`/api/downloads/${id}`); renderTop(); refreshDownloadViews(); toast("Deleted"); }
  catch (e) { toast(e.message, "error"); }
}

async function saveKey(id, key, region) {
  key = key.trim();
  const body = { model: id };
  if (region !== undefined) body.region = region.trim();
  if (key || region === undefined) body.key = key;  // with a region field, an empty key box keeps the saved key
  try {
    await api.post("/api/keys", body);
    await refreshStatus();
    renderSettings();
    toast(key ? "Key saved" : region !== undefined ? "Region saved" : "Key removed");
    if (S.route.name === "new") renderNew();
  } catch (e) { toast(e.message, "error"); }
}

$$("#settings [data-close]").forEach((b) => (b.onclick = () => $("#settings").close()));
$("#settingsBtn").onclick = () => openSettings();
$("#quitBtn").onclick = async () => {
  const active = S.jobs.filter((j) => ACTIVE.has(j.status)).length;
  if (!confirm(active ? `${active} transcription${active > 1 ? "s are" : " is"} still running and will be stopped. Quit Tafrigh?` : "Quit Tafrigh? You can start it again with ./app.sh.")) return;
  try { await api.post("/api/quit"); } catch (e) { /* the server is going away */ }
  document.body.innerHTML = `<div class="welcome" style="padding-top:20vh"><h1>Tafrigh has stopped</h1><p>Start it again with <code>./app.sh</code> in the project folder.</p></div>`;
};

// ---------------------------------------------------------------------------------------------
// Menus, theme, routing, polling
// ---------------------------------------------------------------------------------------------
function toggleMenu(id) {
  const m = document.getElementById(id);
  const open = m.classList.contains("open");
  closeMenus();
  if (!open) m.classList.add("open");
}
function closeMenus() { $$(".menu.open").forEach((m) => m.classList.remove("open")); }
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu")) closeMenus();
  const dl = e.target.closest("[data-dl]"), dlc = e.target.closest("[data-dl-cancel]"), dlr = e.target.closest("[data-dl-remove]");
  if (dl) { e.preventDefault(); e.stopPropagation(); startDownload(dl.dataset.dl); return; }
  if (dlc) { e.preventDefault(); e.stopPropagation(); cancelDownload(dlc.dataset.dlCancel); return; }
  if (dlr) { e.preventDefault(); e.stopPropagation(); removeDownload(dlr.dataset.dlRemove); return; }
  const ext = e.target.closest('a[target="_blank"]');
  if (ext && desktopApi()) { e.preventDefault(); desktopApi().open_url(ext.href); }
  const s = e.target.closest("[data-open-settings]");
  if (s) { e.preventDefault(); e.stopPropagation(); openSettings(s.dataset.openSettings); }
});

$("#themeBtn").onclick = () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("tafrigh-theme", dark ? "dark" : "light"); } catch (e) { /* private mode */ }
};
$("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");
$("#jobSearch").oninput = renderSidebar;

// keep the direction right while a line, title or name is being typed
document.addEventListener("input", (e) => {
  const el = e.target.closest && e.target.closest("[data-mixdir]");
  if (el) el.dir = mixDir(el.value ?? el.textContent);
});
document.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, textarea, select, button, [contenteditable]");
  if (e.key === "Escape") closeMenus();
  if (typing || $("#player").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === " ") { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
  if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
  if (e.key === "ArrowRight") audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
});

window.addEventListener("beforeunload", (e) => {
  if (S.dirty || S.uploading) { e.preventDefault(); e.returnValue = ""; }
});

function route() {
  const h = location.hash;
  const m = h.match(/^#\/job\/([\w-]+)$/);
  if (S.dirty && !(m && S.job && m[1] === S.job.id) && !confirm("Discard your unsaved changes?")) {
    history.replaceState(null, "", `#/job/${S.job.id}`);
    return;
  }
  S.dirty = false;
  $("#sidebar").classList.remove("open");
  if (m) {
    const changed = S.route.id !== m[1];
    S.route = { name: "job", id: m[1] };
    if (changed) { S.job = null; S.lines = []; S.editing = false; S.search = ""; S.lineSig = ""; stopJobPoll(); renderJob(); }
    loadJob(m[1]);
  } else {
    S.route = { name: "new" };
    renderNew();
  }
  renderSidebar();
}

async function refreshStatus() {
  try { S.status = await api.get("/api/status"); renderTop(); } catch (e) { /* server restarting */ }
}

let statusTimer = null;
function scheduleStatus() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(async () => {
    const was = downloading();
    await refreshStatus();
    if (was || downloading()) refreshDownloadViews();
    if (was && !downloading() && S.route.name === "new") renderNew();
    scheduleStatus();
  }, downloading() ? 1500 : 20000);
}
async function refreshJobs() {
  try {
    S.jobs = (await api.get("/api/jobs")).jobs;
    renderSidebar();
    renderTop();
  } catch (e) { /* server restarting */ }
}

let jobsTimer = null;
function scheduleJobs() {
  clearTimeout(jobsTimer);
  const busy = S.jobs.some((j) => ACTIVE.has(j.status));
  jobsTimer = setTimeout(async () => { await refreshJobs(); scheduleJobs(); }, busy ? 2000 : 10000);
}

(async function init() {
  await refreshStatus();
  if (!S.status) { view.innerHTML = `<div class="welcome"><h1>Can't reach the app</h1><p>Start it with <code>./app.sh</code>.</p></div>`; return; }
  await refreshJobs();
  window.addEventListener("hashchange", route);
  route();
  scheduleJobs();
  scheduleStatus();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
