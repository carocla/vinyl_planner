// --- State & Variables ---
let tracks = [];
let nextId = 1;
let unknownIndex = 0;
let currentEditingEl = null;
let selection = new Set();
let lastClickedInfo = null;
let dragAnchorEl = null;
let displayMode = "T_DASH"; // T_DASH, T_SLASH, T_COMMA
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const HISTORY_CAP = 200;
let undoStack = [];
let redoStack = [];

// --- Utilities ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(msg, kind = "info", ms = 1800) {
  const box = document.getElementById("toastbox");
  
  if (!box.classList.contains("ready")) {
    box.classList.add("ready");
    box.style.position = "fixed";
    box.style.bottom = "18px";
    box.style.right = "18px";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.gap = "8px";
    box.style.zIndex = "70";
  }
  
  const t = document.createElement("div");
  t.style.background = "#0f172a";
  t.style.color = "#fff";
  t.style.padding = "10px 12px";
  t.style.borderRadius = "10px";
  t.style.boxShadow = "0 6px 18px rgba(2,6,23,.22)";
  t.style.fontSize = "13px";
  t.style.maxWidth = "58vw";
  t.style.opacity = "0";
  t.style.transform = "translateY(6px)";
  t.style.transition = "opacity .16s ease, transform .16s ease";
  t.textContent = msg;
  
  if (kind === "warn") {
    t.style.background = "#92400e";
  }
  if (kind === "bad") {
    t.style.background = "#991b1b";
  }
  
  box.appendChild(t);
  
  requestAnimationFrame(() => {
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
  });
  
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 180);
  }, ms);
}

function mmssToSec(s) {
  const [m, sec] = (s || "").split(":").map(Number);
  return (m * 60 + sec) || 0;
}

function secToMMSS(n) {
  const m = Math.floor(n / 60);
  const s = Math.max(0, n % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeLen(raw) {
  raw = (raw || "").trim();
  if (!raw) return raw;
  
  if (/^\d+$/.test(raw)) return `${Number(raw)}:00`;
  
  if (/^:\d{1,2}$/.test(raw)) {
    const s = raw.slice(1);
    return `0:${String(Number(s)).padStart(2, "0")}`;
  }
  
  const m = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    if (Number.isFinite(mm) && Number.isFinite(ss)) {
      return `${mm}:${String(ss).padStart(2, "0")}`;
    }
  }
  return raw;
}

function isMMSS(s) {
  return /^\d{1,2}:\d{2}$/.test((s || "").trim());
}

function nextUnknown() {
  const idx = unknownIndex++ % letters.length;
  const x = letters[idx];
  return { artist: `Artist ${x}`, title: `Track ${x}` };
}

// --- History / State Management ---
function snapshot() {
  return JSON.stringify(serialize());
}

function pushHistory() {
  const snap = snapshot();
  if (!undoStack.length || undoStack[undoStack.length - 1] !== snap) {
    undoStack.push(snap);
    if (undoStack.length > HISTORY_CAP) {
      undoStack.shift();
    }
  }
  redoStack = [];
}

function restoreFromSnap(s) {
  try {
    loadFrom(JSON.parse(s));
  } catch (e) {}
}

function doUndo() {
  if (!undoStack.length) return;
  const cur = snapshot();
  const prev = undoStack.pop();
  redoStack.push(cur);
  restoreFromSnap(prev);
  showToast("Undid last action.");
}

function doRedo() {
  if (!redoStack.length) return;
  const cur = snapshot();
  const nxt = redoStack.pop();
  undoStack.push(cur);
  restoreFromSnap(nxt);
  showToast("Redo.");
}

function displayTitle(t) {
  const a = (t.artist || "").trim();
  const name = (t.title || "").trim();
  
  if (!name && !a) return "Unknown";
  
  if (displayMode === "T_DASH") {
    if (name && a) return `${name} - ${a}`;
    if (name && !a) return name;
    if (!name && a) return `(untitled) - ${a}`;
    return "Unknown";
  } else if (displayMode === "T_SLASH") {
    if (name && a) return `${name} / ${a}`;
    if (name && !a) return name;
    if (!name && a) return `(untitled) / ${a}`;
    return "Unknown";
  } else {
    // T_COMMA
    if (name && a) return `${name}, ${a}`;
    if (name && !a) return name;
    if (!name && a) return `(untitled), ${a}`;
    return "Unknown";
  }
}

// --- UI rendering & Drag and Drop ---
function buildDragGhost(el) {
  const id = Number(el.dataset.id);
  const t = tracks.find((x) => x.id === id);
  const g = document.createElement("div");
  
  g.style.position = "fixed";
  g.style.left = "-9999px";
  g.style.top = "0";
  g.style.pointerEvents = "none";
  g.style.padding = "8px 12px";
  g.style.borderRadius = "10px";
  g.style.background = "#fff";
  g.style.border = "2px solid var(--ring)";
  g.style.boxShadow = "0 6px 18px rgba(2,6,23,.15)";
  g.style.font = "14px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  g.textContent = `${displayTitle(t)}  ·  ${t.len}`;
  
  document.body.appendChild(g);
  return g;
}

function makeItem(t) {
  const el = document.createElement("div");
  el.className = "item";
  el.draggable = true;
  el.dataset.id = t.id;
  el.tabIndex = 0;
  
  const label = document.createElement("div");
  label.className = "title";
  label.textContent = displayTitle(t);
  
  if (!(t.artist || "").trim() && !(t.title || "").trim()) {
    label.classList.add("unknown");
  }
  
  const len = document.createElement("div");
  len.className = "len";
  len.textContent = t.len;
  
  const edit = document.createElement("button");
  edit.className = "editbtn";
  edit.title = "Edit track";
  edit.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  edit.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    enterEdit(el);
  });
  
  const x = document.createElement("button");
  x.className = "xbtn";
  x.title = "Remove track";
  x.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  x.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    removeItem(el);
  });
  
  el.append(label, len, edit, x);

  el.addEventListener("click", (e) => {
    if (el.classList.contains("editing")) return;
    handleSelectionClick(el, e);
  });
  
  el.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const parentBin = el.parentElement?.dataset?.bin || "U";
    if (parentBin === "U") {
      return;
    }
    
    if (currentEditingEl && currentEditingEl !== el) {
      if (!commitCurrentEdit()) return;
    }

    const uni = document.getElementById("unassigned");
    uni.appendChild(el);
    el.classList.add("fade-in", "flash-blue");
    calcAndPaintTotals();
    showToast("Sent to Unassigned");
    
    setTimeout(() => {
      el.classList.remove("fade-in", "flash-blue");
    }, 420);
  });
  
  el.addEventListener("dragstart", (e) => {
    dragAnchorEl = el;
    const group = getDragGroup(el);
    group.forEach((n) => n.classList.add("dragging"));
    
    e.dataTransfer.setData("text/plain", "drag");
    const ghost = buildDragGhost(el);
    e.dataTransfer.setDragImage(ghost, 10, 10);
    setTimeout(() => ghost.remove(), 0);
    e.dataTransfer.effectAllowed = "move";
  });
  
  el.addEventListener("dragend", () => {
    $$(".item.dragging").forEach((n) => n.classList.remove("dragging"));
    clearDropIndicator();
    dragAnchorEl = null;
  });
  
  return el;
}

function handleSelectionClick(el, e) {
  const bin = el.parentElement;
  const items = Array.from(bin.querySelectorAll(".item"));
  const idx = items.indexOf(el);
  const id = Number(el.dataset.id);
  
  if (e.shiftKey && lastClickedInfo && lastClickedInfo.binId === bin.id) {
    const start = Math.min(lastClickedInfo.index, idx);
    const end = Math.max(lastClickedInfo.index, idx);
    clearSelection();
    for (let i = start; i <= end; i++) {
      selectItem(items[i]);
    }
  } else if (e.ctrlKey || e.metaKey) {
    if (selection.has(id)) {
      deselectItem(el);
    } else {
      selectItem(el);
    }
    lastClickedInfo = { binId: bin.id, index: idx };
  } else {
    clearSelection();
    selectItem(el);
    lastClickedInfo = { binId: bin.id, index: idx };
  }
}

function selectItem(el) {
  selection.add(Number(el.dataset.id));
  el.classList.add("selected");
}

function deselectItem(el) {
  selection.delete(Number(el.dataset.id));
  el.classList.remove("selected");
}

function clearSelection() {
  selection.clear();
  $$(".item.selected").forEach((n) => n.classList.remove("selected"));
}

function getSelectedItems() {
  if (!selection.size) return [];
  const nodes = $$(".item").filter((n) => selection.has(Number(n.dataset.id)));
  return nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

function getDragGroup(anchorEl) {
  const selected = getSelectedItems();
  if (selected.length && selected.includes(anchorEl)) return selected;
  return [anchorEl];
}

function removeItem(el) {
  if (currentEditingEl === el) currentEditingEl = null;
  el.remove();
  calcAndPaintTotals();
}

["sideA", "sideB", "unassigned"].forEach((id) => enableDnD($("#" + id)));

let indicatorEl = null;
function ensureIndicator(bin) {
  if (!indicatorEl) {
    indicatorEl = document.createElement("div");
    indicatorEl.className = "drop-indicator";
  }
  indicatorEl.classList.remove("drop-A", "drop-B", "drop-U");
  const binKey = bin.dataset.bin || "U";
  indicatorEl.classList.add(binKey === "A" ? "drop-A" : binKey === "B" ? "drop-B" : "drop-U");
  return indicatorEl;
}

function clearDropIndicator() {
  if (indicatorEl && indicatorEl.parentElement) {
    indicatorEl.parentElement.removeChild(indicatorEl);
  }
}

function enableDnD(bin) {
  bin.addEventListener("dragenter", (e) => {
    if (!dragAnchorEl) return;
    ensureIndicator(bin);
    if (!bin.querySelector(".item")) {
      bin.appendChild(indicatorEl);
    }
  }, true);
  
  bin.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragAnchorEl) return;
    
    ensureIndicator(bin);
    const group = getDragGroup(dragAnchorEl);
    const y = e.clientY;
    const items = Array.from(bin.querySelectorAll(".item")).filter((n) => !group.includes(n));
    let placed = false;
    
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) {
        if (item.previousSibling !== indicatorEl) {
          bin.insertBefore(indicatorEl, item);
        }
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      if (indicatorEl.parentElement !== bin || indicatorEl.nextSibling !== null) {
        bin.appendChild(indicatorEl);
      }
    }
  }, true);
  
  bin.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragAnchorEl) return;
    
    const group = getDragGroup(dragAnchorEl);
    if (indicatorEl && indicatorEl.parentElement === bin) {
      group.forEach((node) => bin.insertBefore(node, indicatorEl));
    } else {
      const targetItem = e.target.closest(".item");
      if (targetItem && targetItem.parentElement === bin) {
        group.forEach((node) => bin.insertBefore(node, targetItem));
      } else {
        group.forEach((node) => bin.appendChild(node));
      }
    }
    
    clearDropIndicator();
    calcAndPaintTotals();
  }, true);
  
  bin.addEventListener("click", (e) => {
    if (!e.target.closest(".item")) clearSelection();
  });
}

// --- Edit UI functionality ---
function enterEdit(el) {
  clearSelection();
  if (currentEditingEl && currentEditingEl !== el) {
    if (!commitCurrentEdit()) return;
  }
  
  const id = Number(el.dataset.id);
  const t = tracks.find((x) => x.id === id);
  currentEditingEl = el;
  el.classList.add("editing");
  el.draggable = false;
  el.innerHTML = "";
  
  const wrap = document.createElement("div");
  wrap.className = "editcard";
  wrap.addEventListener("click", (e) => e.stopPropagation());

  const titleWrap = document.createElement("div");
  titleWrap.className = "chip-input";
  const nIn = document.createElement("input");
  nIn.className = "edit-title";
  nIn.type = "text";
  nIn.placeholder = "Title";
  nIn.value = t.title || "";
  titleWrap.append(nIn);

  const artistWrap = document.createElement("div");
  artistWrap.className = "chip-input";
  const aIn = document.createElement("input");
  aIn.className = "edit-artist";
  aIn.type = "text";
  aIn.placeholder = "Artist";
  aIn.value = t.artist || "";
  artistWrap.append(aIn);

  const lenWrap = document.createElement("div");
  lenWrap.className = "chip-input mono";
  const lenTag = document.createElement("span");
  lenTag.className = "chip-label";
  lenTag.textContent = "mm:ss";
  const lIn = document.createElement("input");
  lIn.className = "edit-len";
  lIn.type = "text";
  lIn.placeholder = "mm:ss";
  lIn.value = t.len;
  attachLenFormatter(lIn);
  lenWrap.append(lenTag, lIn);

  const actions = document.createElement("div");
  actions.className = "actions";
  
  const save = document.createElement("button");
  save.className = "btn primary";
  save.textContent = "Save";
  save.addEventListener("click", () => {
    pushHistory();
    if (exitEdit(el, id, aIn.value, nIn.value, lIn.value)) {
      currentEditingEl = null;
    }
  });
  
  const cancel = document.createElement("button");
  cancel.className = "btn ghost";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    renderItem(el, t);
    currentEditingEl = null;
  });

  wrap.append(titleWrap, artistWrap, lenWrap, actions);
  actions.append(cancel, save);
  el.appendChild(wrap);
  nIn.focus();
  
  [aIn, nIn, lIn].forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        pushHistory();
        if (exitEdit(el, id, aIn.value, nIn.value, lIn.value)) {
          currentEditingEl = null;
        }
      }
    })
  );
}

function attachLenFormatter(input) {
  input.addEventListener("blur", () => {
    const out = normalizeLen(input.value);
    if (isMMSS(out)) input.value = out;
  });
}

function handleGlobalPointerDown(e) {
  if (!currentEditingEl) return;
  if (currentEditingEl.contains(e.target)) return;
  
  const id = Number(currentEditingEl.dataset.id);
  const aIn = currentEditingEl.querySelector(".edit-artist");
  const nIn = currentEditingEl.querySelector(".edit-title");
  const lIn = currentEditingEl.querySelector(".edit-len");
  
  lIn.value = normalizeLen(lIn.value);
  pushHistory();
  
  if (!exitEdit(currentEditingEl, id, aIn.value, nIn.value, lIn.value)) {
    e.preventDefault();
    lIn.focus();
  } else {
    currentEditingEl = null;
  }
}

document.addEventListener("pointerdown", handleGlobalPointerDown, true);
document.addEventListener("click", (e) => {
  if (!currentEditingEl) return;
  if (currentEditingEl.contains(e.target)) return;
  
  const id = Number(currentEditingEl.dataset.id);
  const aIn = currentEditingEl.querySelector(".edit-artist");
  const nIn = currentEditingEl.querySelector(".edit-title");
  const lIn = currentEditingEl.querySelector(".edit-len");
  
  lIn.value = normalizeLen(lIn.value);
  pushHistory();
  
  if (!exitEdit(currentEditingEl, id, aIn.value, nIn.value, lIn.value)) {
    lIn.focus();
  } else {
    currentEditingEl = null;
  }
}, true);

function exitEdit(el, id, artist, title, lenRaw) {
  const len = normalizeLen(lenRaw);
  if (!isMMSS(len)) {
    showToast("Enter length as mm:ss (e.g., 3:45).", "bad", 2200);
    return false;
  }
  
  const t = tracks.find((x) => x.id === id);
  t.artist = (artist || "").trim();
  t.title = (title || "").trim();
  t.len = len;
  
  renderItem(el, t);
  calcAndPaintTotals();
  return true;
}

function commitCurrentEdit() {
  if (!currentEditingEl) return true;
  
  const id = Number(currentEditingEl.dataset.id);
  const aIn = currentEditingEl.querySelector(".edit-artist");
  const nIn = currentEditingEl.querySelector(".edit-title");
  const lIn = currentEditingEl.querySelector(".edit-len");
  
  lIn.value = normalizeLen(lIn.value);
  if (!isMMSS(lIn.value)) {
    showToast("Fix the length (mm:ss) before saving.", "bad");
    return false;
  }
  
  pushHistory();
  const ok = exitEdit(currentEditingEl, id, aIn.value, nIn.value, lIn.value);
  if (ok) currentEditingEl = null;
  return ok;
}

function renderItem(el, t) {
  el.classList.remove("editing");
  el.draggable = true;
  el.innerHTML = "";
  
  const label = document.createElement("div");
  label.className = "title";
  label.textContent = displayTitle(t);
  
  const len = document.createElement("div");
  len.className = "len";
  len.textContent = t.len;
  
  const edit = document.createElement("button");
  edit.className = "editbtn";
  edit.title = "Edit track";
  edit.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  edit.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    enterEdit(el);
  });
  
  const x = document.createElement("button");
  x.className = "xbtn";
  x.title = "Remove track";
  x.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  x.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    removeItem(el);
  });
  
  el.append(label, len, edit, x);
}

function renderAllTitles() {
  $$(".item").forEach((el) => {
    const id = Number(el.dataset.id);
    const t = tracks.find((x) => x.id === id);
    if (!t) return;
    const label = el.querySelector(".title");
    if (label) label.textContent = displayTitle(t);
  });
}

// --- Import Parsing & Utilities ---
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSepValueForRegex(v) {
  return v === "TAB" ? "\\t" : escapeRegex(v);
}

function getSepValueForExample(v) {
  return v === "TAB" ? "\t" : v;
}

function parseWithCustomSeps(line) {
  const raw = line.trim();
  if (!raw) return null;
  
  const sepTA = $("#sepTA").value;
  const sepAT = $("#sepAT").value;
  const s1 = getSepValueForRegex(sepTA);
  const s2 = getSepValueForRegex(sepAT);
  
  const re = new RegExp(`^\\s*(.+?)\\s*${s1}\\s*(.+?)\\s*${s2}\\s*(\\d{1,2}:\\d{2})\\s*$`);
  const m = raw.match(re);
  if (m) return { title: m[1].trim(), artist: m[2].trim(), len: m[3] };
  
  const re2 = new RegExp(`^\\s*(.+?)\\s*${s2}\\s*(\\d{1,2}:\\d{2})\\s*$`);
  const m2 = raw.match(re2);
  if (m2) return { title: m2[1].trim(), artist: "", len: m2[2] };
  
  const m3 = raw.match(/^(.+?)\s*,\s*(\d{1,2}:\d{2})\s*$/);
  if (m3) return { title: m3[1].trim(), artist: "", len: m3[2] };
  
  return null;
}

function updateImportExample() {
  const sepTA = $("#sepTA").value;
  const sepAT = $("#sepAT").value;
  const sTA = getSepValueForExample(sepTA);
  const sAT = getSepValueForExample(sepAT);
  
  const ex = [
    `Fade Into You${sTA}Mazzy Star${sAT}4:56`,
    `Just Like Heaven${sTA}The Cure${sAT}3:32`,
    `Bizarre Love Triangle${sTA}New Order${sAT}4:23`
  ].join("\n");
  
  const ta = $("#bulk");
  if (!ta.value.trim()) {
    ta.placeholder = ex;
  }
}

// --- Serialization & Data Management ---
function calcAndPaintTotals() {
  const disc = $("#disc").value;
  const max = { "12": 1200, "10": 840, "7": 300 }[disc];
  const ideal = { "12": 1020, "10": 720, "7": 240 }[disc];
  
  ["sideA", "sideB"].forEach((binId) => {
    const items = $$("#" + binId + " .item");
    const sum = items.reduce((acc, i) => {
      const t = tracks.find((x) => x.id === Number(i.dataset.id));
      return acc + (t ? mmssToSec(t.len) : 0);
    }, 0);
    
    $("#" + (binId === "sideA" ? "aCount" : "bCount")).textContent = `${items.length} ${items.length === 1 ? "track" : "tracks"}`;
    
    const node = $("#" + (binId === "sideA" ? "aTime" : "bTime"));
    node.textContent = secToMMSS(sum);
    node.className = "total";
    
    if (sum > max) {
      node.classList.add("bad");
    } else if (sum > ideal) {
      node.classList.add("warn");
    }
  });
  
  persistToHash();
}

function serialize() {
  const idsIn = (binId) => $$("#" + binId + " .item").map((n) => Number(n.dataset.id));
  return {
    disc: $("#disc").value,
    display: displayMode,
    tracks,
    bins: {
      A: idsIn("sideA"),
      B: idsIn("sideB"),
      U: idsIn("unassigned")
    },
    nextId,
    unknownIndex
  };
}

function loadFrom(obj) {
  if (!obj) return;
  
  $("#disc").value = obj.disc || "12";
  displayMode = obj.display || "T_DASH";
  $("#display").value = displayMode;
  
  tracks = Array.isArray(obj.tracks) ? obj.tracks : [];
  nextId = obj.nextId || (tracks.reduce((m, t) => Math.max(m, t.id), 0) + 1);
  unknownIndex = obj.unknownIndex || 0;
  
  const map = new Map(tracks.map((t) => [t.id, t]));
  ["sideA", "sideB", "unassigned"].forEach((id) => ($("#" + id).innerHTML = ""));
  
  (obj.bins?.A || []).forEach((id) => {
    const t = map.get(id);
    if (t) $("#sideA").appendChild(makeItem(t));
  });
  
  (obj.bins?.B || []).forEach((id) => {
    const t = map.get(id);
    if (t) $("#sideB").appendChild(makeItem(t));
  });
  
  (obj.bins?.U || []).forEach((id) => {
    const t = map.get(id);
    if (t) $("#unassigned").appendChild(makeItem(t));
  });
  
  renderAllTitles();
  calcAndPaintTotals();
  clearSelection();
  updateImportExample();
}

function persistToHash() {
  const data = serialize();
  try {
    const json = JSON.stringify(data);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    location.hash = "#" + b64;
    localStorage.setItem("vinyl_planner_v3_29", json);
  } catch (e) {}
}

function addTrack(title, artist, lenRaw, bin = "unassigned") {
  if (!commitCurrentEdit()) return;
  
  artist = (artist || "").trim();
  title = (title || "").trim();
  const len = normalizeLen((lenRaw || "").trim());
  
  if (!/^\d{1,2}:\d{2}$/.test(len)) {
    showToast("Enter length as mm:ss.", "bad");
    return;
  }
  
  pushHistory();
  
  if (artist || title) {
    if (!artist || !title) {
      const d = nextUnknown();
      artist = artist || d.artist;
      title = title || d.title;
    }
  }
  
  const t = { id: nextId++, artist, title, len };
  tracks.push(t);
  $("#" + bin).appendChild(makeItem(t));
  calcAndPaintTotals();
  
  $("#artist").value = "";
  $("#tname").value = "";
  $("#tlen").value = "";
}

// --- Listeners & Application Logic ---
$("#sepTA").addEventListener("change", updateImportExample);
$("#sepAT").addEventListener("change", updateImportExample);

$("#bulkToUnassigned").addEventListener("click", () => {
  const ta = $("#bulk");
  const lines = ta.value.split(/\r?\n/);
  let added = 0;
  let failed = [];
  
  for (let i = 0; i < lines.length; i++) {
    const p = parseWithCustomSeps(lines[i]);
    if (!p) {
      if (lines[i].trim()) failed.push(i + 1);
      continue;
    }
    addTrack(p.title, p.artist, p.len, "unassigned");
    added++;
  }
  
  if (added) showToast(`Added ${added} ${added === 1 ? "track" : "tracks"} to Unassigned.`);
  if (failed.length) showToast(`Skipped lines: ${failed.join(", ")}`, "warn", 2600);
  
  ta.value = "";
  updateImportExample();
});

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleFit() {
  if (!commitCurrentEdit()) return;
  pushHistory();
  
  const disc = $("#disc").value;
  const max = { "12": 1200, "10": 840, "7": 300 }[disc];
  const allIds = [...$$("#sideA .item"), ...$$("#sideB .item"), ...$$("#unassigned .item")].map((n) => Number(n.dataset.id));
  const pool = shuffleArray(allIds.slice());
  
  $("#sideA").innerHTML = "";
  $("#sideB").innerHTML = "";
  $("#unassigned").innerHTML = "";
  
  let aSum = 0;
  let bSum = 0;
  
  for (const id of pool) {
    const t = tracks.find((x) => x.id === id);
    if (!t) continue;
    
    const len = mmssToSec(t.len);
    if (aSum + len <= max) {
      $("#sideA").appendChild(makeItem(t));
      aSum += len;
    } else if (bSum + len <= max) {
      $("#sideB").appendChild(makeItem(t));
      bSum += len;
    } else {
      $("#unassigned").appendChild(makeItem(t));
    }
  }
  
  calcAndPaintTotals();
  showToast("Shuffled & fit into A/B. Overflow in Unassigned.");
}

$("#shuffleBtn").addEventListener("click", shuffleFit);

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    doUndo();
  }
});

$("#addBtn").addEventListener("click", () => addTrack($("#tname").value, $("#artist").value, $("#tlen").value));

const mb = $("#modalBackdrop");
$("#clearAll").addEventListener("click", () => {
  mb.style.display = "flex";
});
$("#mCancel").addEventListener("click", () => {
  mb.style.display = "none";
});
$("#mConfirm").addEventListener("click", () => {
  doClearAll();
  mb.style.display = "none";
});
mb.addEventListener("click", (e) => {
  if (e.target === mb) mb.style.display = "none";
});

function doClearAll() {
  pushHistory();
  tracks = [];
  nextId = 1;
  unknownIndex = 0;
  ["sideA", "sideB", "unassigned"].forEach((id) => ($("#" + id).innerHTML = ""));
  calcAndPaintTotals();
  clearSelection();
  showToast("Cleared.");
}

$("#disc").addEventListener("change", () => {
  pushHistory();
  calcAndPaintTotals();
});

$("#display").addEventListener("change", () => {
  displayMode = $("#display").value;
  renderAllTitles();
  persistToHash();
});

const menuBtn = $("#menuBtn");
const menu = $("#menu");
function closeMenu() {
  menu.style.display = "none";
}

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  menu.style.display = menu.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", () => closeMenu());

$("#exportBtn").addEventListener("click", () => {
  if (!commitCurrentEdit()) return;
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vinyl_planner_layout.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported JSON.");
  closeMenu();
});

$("#importBtn").addEventListener("click", () => {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "application/json";
  inp.onchange = () => {
    const file = inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      pushHistory();
      loadFrom(JSON.parse(e.target.result));
      showToast("Imported.");
      closeMenu();
    };
    reader.readAsText(file);
  };
  inp.click();
});

const dz = $("#dz");
function showDZ() {
  dz.style.display = "flex";
}
function hideDZ() {
  dz.style.display = "none";
}

window.addEventListener("dragenter", (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
    showDZ();
  }
});

window.addEventListener("dragover", (e) => {
  if (dz.style.display === "flex") {
    e.preventDefault();
  }
});

window.addEventListener("dragleave", (e) => {
  if (e.target === dz) hideDZ();
});

dz.addEventListener("drop", (e) => {
  e.preventDefault();
  hideDZ();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      pushHistory();
      loadFrom(JSON.parse(evt.target.result));
      showToast("Imported from dropped file.");
      closeMenu();
    } catch (err) {
      showToast("Invalid JSON.", "bad");
    }
  };
  reader.readAsText(file);
});

// --- Boot ---
const seed = {
  disc: "12",
  display: "T_DASH",
  tracks: [
    { id: 1, artist: "", title: "Señora Diana la vi", len: "2:46" },
    { id: 2, artist: "", title: "Looking Out for You", len: "2:59" },
    { id: 3, artist: "The Cure", title: "Just Like Heaven", len: "3:32" },
    { id: 4, artist: "", title: "Wichita Lineman", len: "3:07" },
    { id: 5, artist: "The Radio Dept.", title: "Pulling Our Weight", len: "3:20" },
    { id: 6, artist: "Carpenters", title: "(They Long to Be) Close to You", len: "4:36" },
    { id: 7, artist: "", title: "Did I Flounder", len: "4:00" },
    { id: 8, artist: "New Order", title: "Bizarre Love Triangle", len: "4:23" },
    { id: 9, artist: "10cc", title: "I'm Not in Love", len: "6:07" },
    { id: 10, artist: "Mazzy Star", title: "Fade Into You", len: "4:56" }
  ],
  bins: { A: [1, 2, 3, 4, 5, 6], B: [7, 8, 9, 10], U: [] },
  nextId: 11,
  unknownIndex: 0
};

function boot() {
  const fromHash = location.hash.length > 1;
  const fromLocal = localStorage.getItem("vinyl_planner_v3_29");
  
  loadFrom(
    fromHash
      ? JSON.parse(decodeURIComponent(escape(atob(location.hash.substring(1)))))
      : fromLocal
      ? JSON.parse(fromLocal)
      : seed
  );
  
  pushHistory();
  updateImportExample();
}

boot();
