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
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>',
};

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), kind === "error" ? 7000 : 3500);
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
const DL_ACTIVE = new Set(["queued", "downloading", "verifying"]);
const downloading = () => (S.status?.models || []).some((m) => m.download && DL_ACTIVE.has(m.download.state))
  || (S.status?.voiceprints && DL_ACTIVE.has(S.status.voiceprints.state));

function downloadBlock(id, d, compact = false) {
  if (!d) return "";
  if (DL_ACTIVE.has(d.state)) {
    const pct = d.total ? Math.min(100, d.done / d.total * 100) : 0;
    const what = d.state === "verifying" ? "Checking the download" : d.state === "queued" ? "Waiting" : `Downloading ${Math.round(pct)}%`;
    return `<div class="dl"><div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="dl-row"><span>${what}${d.total ? ` · ${bytes(d.done)} of ${bytes(d.total)}` : ""}</span>
      <button type="button" class="linkish" data-dl-cancel="${esc(id)}">Cancel</button></div></div>`;
  }
  const left = Math.max(0, d.missing - d.partial);
  const error = d.state === "error" ? `<div class="mc-missing">${esc(d.error || "The download failed")}</div>` : "";
  if (d.installed) return compact ? "" : `<span class="pill ok">Downloaded · ${bytes(d.size)}</span>`;
  return `${error}<button type="button" class="btn btn-sm btn-primary" data-dl="${esc(id)}">${ICON.download} ${d.partial ? "Resume" : "Download"} (${bytes(left)})</button>`;
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
      <span class="t" dir="auto">${esc(j.title || "Untitled")}</span>${statusLabel(j)}
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
  const slow = S.status.power === "power-saver";
  if (!seconds) return `About <b>${m.rtf}×</b> the recording's length here${slow ? " (more in power-saver mode)" : ""}`;
  const t = seconds * (m.rtf || 1) * (slow ? 3.5 : 1);
  if (short) return `About <b>${human(t)}</b> here${slow ? " (power-saver)" : ""}`;
  return `About <b>${human(t)}</b> on this computer${slow ? " in power-saver mode — switch to performance in Settings for about 3–5× faster" : ""}`;
}

function speakerHint(m, speakers) {
  if (speakers === "none") return "One block of text with timestamps, no names.";
  if (m?.id === "speechmatics") return "Speechmatics works out the number of speakers itself; any choice here other than No labels turns labels on.";
  if (m?.id === "elevenlabs" && speakers !== "auto") return "ElevenLabs treats the number as the most speakers to find.";
  return "Labels Speaker 1, Speaker 2… by voice. Give the real number of people if you know it; auto-detect works well for larger meetings.";
}

function modelCard(m) {
  const f = S.form, sel = f.model === m.id;
  const badges = m.kind === "local"
    ? `<span class="pill accent">${ICON.laptop} On this computer</span>`
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
        <input type="text" id="titleInput" dir="auto" value="${esc(f.title)}" placeholder="${esc(src ? src.name.replace(/\.[^.]+$/, "") : "Meeting title")}">
      </div>
    </div>
    ${m?.prompt ? `<div class="field">
      <label for="promptInput">Vocabulary <span class="opt">optional</span></label>
      <textarea id="promptInput" dir="auto" rows="2" placeholder="Names and terms, comma-separated: ClickUp, Jira, backend, deployment">${esc(f.prompt)}</textarea>
      <p class="hint">${{ elevenlabs: "Sent as key terms (up to 5 words each). ElevenLabs charges about 20% more for requests with key terms.",
        speechmatics: "Sent as custom vocabulary (up to 6 words per term)." }[m.id] || "Given to Whisper as a hint. Plausible but untested; leave empty if unsure."}</p>
    </div>` : ""}
  </div>

  ${hosted && m.ready ? `<div class="card consent">
    ${ICON.cloud}
    <div>
      <p><b>This model uploads the recording to ${esc(m.service)}.</b> It leaves this computer and is processed on their servers under their terms. ${m.id === "elevenlabs" ? "ElevenLabs may use it for training unless you opted out (Profile → Data use)." : "Speechmatics does not train on it unless you opted in; the app deletes the job there after fetching the transcript."}</p>
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
      <h1 class="job-title" id="jobTitle" contenteditable="plaintext-only" spellcheck="false" dir="auto" title="Click to rename">${esc(j.title || "Untitled")}</h1>
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
      <div class="panel"><h3>Details</h3><dl class="kv" style="grid-template-columns: 88px 1fr">
        <dt>Model</dt><dd>${esc(j.model_title || j.model)}</dd>
        <dt>Language</dt><dd>${esc({ ar: "Arabic + English", en: "English", auto: "Auto-detect" }[opts.language] || opts.language || "")}${j.detected_language ? ` (${esc(j.detected_language)})` : ""}</dd>
        <dt>Speakers</dt><dd>${esc(opts.speakers === "none" ? "No labels" : opts.speakers === "auto" ? "Auto-detect" : opts.speakers)}</dd>
        ${opts.prompt ? `<dt>Vocabulary</dt><dd dir="auto">${esc(opts.prompt)}</dd>` : ""}
        ${j.source_name ? `<dt>File</dt><dd dir="auto">${esc(j.source_name)}</dd>` : ""}
        ${S.edited ? `<dt>Edited</dt><dd>yes — exports use your edits</dd>` : ""}
      </dl></div>
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
    <div class="share"><span>${human(stats.talk[sid])} · ${Math.round(share)}%</span>${others.length ? `<select data-merge="${esc(sid)}" aria-label="Merge speaker ${esc(sid)} into another" ${ACTIVE.has(S.job.status) ? "disabled" : ""}><option value="">Merge into…</option>${others.map((o) => `<option value="${esc(o)}">${esc(spkName(o))}</option>`).join("")}</select>` : ""}</div>
  </div>`;
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
      ${who}<p class="text" dir="auto"${S.editing ? ' contenteditable="plaintext-only"' : ""}>${S.editing ? esc(x.text) : highlight(x.text)}</p>
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
    const d = desktopApi();
    if (!d || !d.save_export) return;  // in a browser the link downloads the file
    e.preventDefault();
    closeMenus();
    try { const saved = await d.save_export(j.id, a.dataset.fmt); if (saved) toast(`Saved ${saved}`); } catch (err) { toast(err.message, "error"); }
  }));
  const copy = $("#copyBtn");
  if (copy) copy.onclick = async () => {
    try {
      const r = await fetch(`/api/jobs/${j.id}/export/txt`);
      await navigator.clipboard.writeText(await r.text());
      toast("Transcript copied");
    } catch (e) { toast("Could not copy: " + e.message, "error"); }
  };
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
  $$("[data-merge]").forEach((sel) => (sel.onchange = async () => {
    if (!sel.value) return;
    if (!confirm(`Merge ${spkName(sel.dataset.merge)} into ${spkName(sel.value)}? All their lines move over.`)) { sel.value = ""; return; }
    try { const r = await api.patch(`/api/jobs/${j.id}`, { merge: { from: sel.dataset.merge, into: sel.value } }); applyJob(r); renderJob(); toast("Speakers merged"); } catch (e) { toast(e.message, "error"); }
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
        <button class="btn" type="submit">Save</button>
        ${m.key_source === "app" ? `<button class="btn btn-ghost btn-danger" type="button" data-clear-key="${esc(m.id)}">Remove</button>` : ""}</form>
      <p>${m.key_url ? `Get a key: <a href="${esc(m.key_url)}" target="_blank" rel="noopener noreferrer">${esc(m.key_url.replace(/^https:\/\//, ""))}</a>. ` : ""}${esc((m.facts || []).slice(-1)[0] || "")}.</p>
    </div>`;
  }).join("");
  const p = st.power;
  const local = st.models.filter((m) => m.kind === "local" && m.download);
  const items = [...local.map((m) => [m.id, m.title, m.download]), ...(st.voiceprints ? [["voiceprints", "Voiceprint model (speaker labels)", st.voiceprints]] : [])];
  const modelRows = items.map(([id, title, d]) => {
    const cached = !d.installed && model(id)?.ready;  // found elsewhere, e.g. the Hugging Face cache
    const pill = d.installed ? `<span class="pill ok">Downloaded</span>` : cached ? `<span class="pill ok">Ready</span>` : `<span class="pill warn">Not downloaded</span>`;
    const actions = cached && !DL_ACTIVE.has(d.state) ? `<span class="hint" style="margin:0">Uses the copy already in the Hugging Face cache</span>`
      : downloadBlock(id, d, true) + (d.installed && !DL_ACTIVE.has(d.state) ? `<span class="hint" style="margin:0">${bytes(d.size)}</span><button type="button" class="btn btn-sm btn-ghost btn-danger" data-dl-remove="${esc(id)}">Delete</button>` : "");
    return `<div class="key-row"><div class="top"><b>${esc(title)}</b>${pill}</div><div class="dl-actions">${actions}</div></div>`;
  }).join("");
  $("#settingsBody").innerHTML = `
    <section>
      <h3>Models on this computer</h3>
      ${modelRows || '<p class="hint">No downloadable models are configured.</p>'}
      <p class="hint">Stored under <code class="mono">${esc(st.home)}</code>. Downloads resume if the connection drops and are checked against a fixed checksum before use.</p>
    </section>
    <section>
      <h3>API keys for hosted models</h3>
      ${keyRows}
      <p class="hint">${ICON.lock.replace("<svg", '<svg style="width:13px;height:13px;vertical-align:-2px"')} Keys are saved in <code class="mono">${esc(st.storage.dir)}/secrets.json</code>, readable only by your user, and are sent only to their own service. A recording is uploaded only when you pick a hosted model and confirm.</p>
    </section>
    <section>
      <h3>Power mode</h3>
      <p class="hint" style="margin:0 0 10px">Local models run about 3–5× slower in power-saver mode. Now: <b>${esc(p || "unknown")}</b>.</p>
      <div class="actions">
        <button class="btn${p === "performance" ? " btn-primary" : ""}" data-power="performance" ${p ? "" : "disabled"}>${ICON.bolt} Performance</button>
        <button class="btn${p === "balanced" ? " btn-primary" : ""}" data-power="balanced" ${p ? "" : "disabled"}>Balanced</button>
        <button class="btn${p === "power-saver" ? " btn-primary" : ""}" data-power="power-saver" ${p ? "" : "disabled"}>Power-saver</button>
      </div>
      <p class="hint">To switch automatically while local jobs run and back afterwards, set <code class="mono">performance_while_running = true</code> in <code class="mono">app/config.toml</code> (now: ${st.performance_while_running ? "on" : "off"}).</p>
    </section>
    <section>
      <h3>This app</h3>
      <dl class="kv">
        <dt>Data folder</dt><dd><code>${esc(st.storage.dir)}</code> (${st.storage.free_gb} GB free)</dd>
        <dt>Settings file</dt><dd><code>app/config.toml</code> — models, port, threads, defaults</dd>
        <dt>Local models</dt><dd>${st.models.filter((m) => m.kind === "local").map((m) => `${esc(m.title)}: ${m.ready ? "ready" : esc(m.reason)}`).join("<br>")}</dd>
        <dt>Speaker labels</dt><dd>${st.speakers_ready ? "TitaNet-small voiceprints, on this computer" : "voiceprint model not downloaded"}</dd>
      </dl>
    </section>`;
  $$("[data-key-form]").forEach((form) => (form.onsubmit = (e) => { e.preventDefault(); saveKey(form.dataset.keyForm, $("[data-key]", form).value); }));
  $$("[data-clear-key]").forEach((b) => (b.onclick = () => confirm("Remove the saved key?") && saveKey(b.dataset.clearKey, "")));
  $$("[data-power]").forEach((b) => (b.onclick = async () => {
    try { await api.post("/api/power", { profile: b.dataset.power }); await refreshStatus(); renderSettings(); toast(`Power mode: ${b.dataset.power}`); } catch (e) { toast(e.message, "error"); }
  }));
  if (focus && focus !== "power") { const el = $(`[data-key="${focus}"]`); if (el) setTimeout(() => el.focus(), 50); }
}

async function removeDownload(id) {
  if (!confirm("Delete this model's files from this computer? You can download them again later.")) return;
  try { S.status = await api.del(`/api/downloads/${id}`); renderTop(); refreshDownloadViews(); toast("Deleted"); }
  catch (e) { toast(e.message, "error"); }
}

async function saveKey(id, key) {
  key = key.trim();
  try {
    await api.post("/api/keys", { model: id, key });
    await refreshStatus();
    renderSettings();
    toast(key ? "Key saved" : "Key removed");
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
