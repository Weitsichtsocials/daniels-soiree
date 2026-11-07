// ─────────────────────────────────────────────────────────────
//  Daniel’s Soirée – App (iPad-Station, Hochformat)
// ─────────────────────────────────────────────────────────────
import { CONFIG } from "./config.js";

const LIVE = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
const ROMAN = ["I", "II", "III", "IV"];
const TABLES = {
  guestbook: "guestbook_entries",
  confessions: "confessions",
  predictions: "baby_predictions",
  quiz: "quiz_results",
};

// ── Lokale Sicherung auf dem iPad ───────────────────────────
// Jeder Eintrag wird ZUERST hier gespeichert und erst dann an
// Supabase gesendet. Was nicht ankommt, wird automatisch nachgesendet.
const ARCHIVE_KEY = "soiree:archive";
let memArchive = [];
const archive = {
  all() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]"); } catch { return memArchive; }
  },
  save(list) {
    memArchive = list;
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list)); return true; } catch { return false; }
  },
  add(rec) { const l = archive.all(); l.push(rec); return archive.save(l); },
  mark(id, patch) { archive.save(archive.all().map((r) => (r.row.id === id ? { ...r, ...patch } : r))); },
  drop(id) { archive.save(archive.all().filter((r) => r.row.id !== id)); },
  pending() { return archive.all().filter((r) => !r.synced); },
};

// ── Daten: Supabase (live) oder Demo (localStorage) ─────────
let sbClient = null;
async function sb() {
  if (!sbClient) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    // Session nur im Speicher: nach Neuladen ist der Admin wieder abgemeldet
    sbClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: true } });
  }
  return sbClient;
}
const demo = {
  read(t) { try { return JSON.parse(localStorage.getItem("soiree:demo:" + t) || "[]"); } catch { return []; } },
  write(t, rows) { try { localStorage.setItem("soiree:demo:" + t, JSON.stringify(rows)); } catch {} },
};

const api = {
  async insert(table, row) {
    if (LIVE) {
      const { error } = await (await sb()).from(table).insert(row);
      if (error && error.code !== "23505") throw error; // 23505 = schon vorhanden → gilt als gespeichert
    } else {
      const rows = demo.read(table);
      if (!rows.some((r) => r.id === row.id)) rows.unshift({ is_read: false, is_favorite: false, ...row });
      demo.write(table, rows);
    }
  },
  async list(table) {
    if (LIVE) {
      const { data, error } = await (await sb()).from(table).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return demo.read(table).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async update(table, id, patch) {
    if (LIVE) {
      const { error } = await (await sb()).from(table).update(patch).eq("id", id);
      if (error) throw error;
    } else demo.write(table, demo.read(table).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  async remove(table, id) {
    if (LIVE) {
      const { error } = await (await sb()).from(table).delete().eq("id", id);
      if (error) throw error;
    } else demo.write(table, demo.read(table).filter((r) => r.id !== id));
  },
  async rank(name) {
    if (LIVE) {
      const { data, error } = await (await sb()).rpc("quiz_rank", { p_name: name });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }
    const board = quizBoard(demo.read("quiz_results"));
    const i = board.findIndex((r) => r.key === nameKey(name));
    return i < 0 ? null : { rank: i + 1, total: board.length, correct: board[i].correct, answered: board[i].answered };
  },
  async signIn(email, password) {
    if (!LIVE) {
      if (password !== "soiree") throw new Error("Falsches Passwort");
      sessionStorage.setItem("soiree:admin", "1");
      return;
    }
    const { error } = await (await sb()).auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!(await api.isAdmin())) { await api.signOut(); throw new Error("Dieser Zugang ist kein Admin."); }
  },
  async signOut() {
    sessionStorage.removeItem("soiree:admin");
    if (LIVE && sbClient) await sbClient.auth.signOut().catch(() => {});
  },
  async isAdmin() {
    if (!LIVE) return sessionStorage.getItem("soiree:admin") === "1";
    const c = await sb();
    const { data: { session } } = await c.auth.getSession();
    if (!session) return false;
    const { data } = await c.from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
    return Boolean(data);
  },
};

// Quiz: Spieler über den Namen zusammenfassen, Rang nach Trefferquote
const nameKey = (n = "") => n.trim().replace(/\s+/g, " ").toLowerCase();
function quizBoard(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const k = nameKey(r.guest_name || "Anonym");
    const e = by.get(k) || { key: k, name: (r.guest_name || "Anonym").trim().replace(/\s+/g, " "), correct: 0, answered: 0, rounds: 0, first: r.created_at, last: r.created_at, ids: [] };
    e.correct += r.score; e.answered += r.total; e.rounds++; e.ids.push(r.id);
    if (String(r.created_at) < String(e.first)) e.first = r.created_at;
    if (String(r.created_at) > String(e.last)) e.last = r.created_at;
    by.set(k, e);
  });
  return [...by.values()].sort((a, b) =>
    b.correct / (b.answered || 1) - a.correct / (a.answered || 1) || b.answered - a.answered || String(a.first).localeCompare(String(b.first)));
}
const pct = (c, a) => `${Math.round((c / (a || 1)) * 100)} %`;

// Jeder Cloud-Aufruf bekommt ein Zeitlimit – nichts darf ewig hängen
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const LIMIT = { insert: 5000, list: 12000, update: 8000, remove: 8000, rank: 5000, isAdmin: 8000, signIn: 12000, signOut: 4000 };
Object.keys(LIMIT).forEach((k) => { const f = api[k]; api[k] = (...a) => withTimeout(f.apply(api, a), LIMIT[k]); });

// Einreichen: lokal sichern → senden → bei Fehler später nachsenden
async function submit(table, fields, { wait: waitForCloud = false } = {}) {
  const row = { id: uuid(), created_at: new Date().toISOString(), ...fields };
  const storedLocally = archive.add({ table, row, synced: false });
  const send = api.insert(table, row)
    .then(() => archive.mark(row.id, { synced: true }))
    .catch((err) => { if (storedLocally) scheduleSync(); else throw err; });
  // Lokal gesichert → Gast muss nicht auf das WLAN warten
  if (storedLocally && !waitForCloud) { send.catch(() => {}); return row; }
  await send;
  return row;
}

let syncing = false, syncTimer = null;
async function syncOutbox() {
  if (syncing) return;
  syncing = true;
  try {
    for (const rec of archive.pending()) {
      try { await api.insert(rec.table, rec.row); archive.mark(rec.row.id, { synced: true }); }
      catch { break; } // Netz weg → später erneut
    }
  } finally {
    syncing = false;
    if (archive.pending().length) scheduleSync();
  }
}
function scheduleSync(ms = 15000) { clearTimeout(syncTimer); syncTimer = setTimeout(syncOutbox, ms); }
window.addEventListener("online", () => syncOutbox());
if (archive.pending().length) scheduleSync(2000);

// ── Hilfen ──────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
}
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || "";
  if (/fetch|network|load failed/i.test(m)) return "Keine Verbindung – bitte gleich noch einmal versuchen.";
  return m || "Das hat leider nicht geklappt. Bitte noch einmal versuchen.";
}
function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return today ? `${t} Uhr` : `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} · ${t} Uhr`;
}
function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<i class="spinner"></i>${label || "Einen Moment"}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
const NOAUTO = 'autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"';

const ICON = {
  star: '<svg viewBox="0 0 24 24" class="fillable"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/></svg>',
  read: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  present: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
};

function armed(btn) {
  if (btn.classList.contains("armed")) return true;
  btn.classList.add("armed");
  toast("Zum Löschen erneut tippen");
  setTimeout(() => btn.classList.remove("armed"), 3200);
  return false;
}

// Emoji-Leiste – Tastatur bleibt offen, Emoji landet an der Cursorposition
function emojiBar() {
  return `<div class="emojis" role="group" aria-label="Emojis">${CONFIG.emojis.map((e) => `<button type="button" tabindex="-1">${e}</button>`).join("")}</div>`;
}
function bindEmojis(root, field) {
  $$(".emojis button", root).forEach((b) => {
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      const em = b.textContent;
      const max = field.maxLength > 0 ? field.maxLength : Infinity;
      if (field.value.length + em.length > max) return toast("Maximale Länge erreicht");
      const focused = document.activeElement === field;
      const s = focused ? field.selectionStart : field.value.length;
      const e2 = focused ? field.selectionEnd : field.value.length;
      field.value = field.value.slice(0, s) + em + field.value.slice(e2);
      const pos = s + em.length;
      if (focused) field.setSelectionRange(pos, pos);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    });
  });
}

// ── Geräusche (im Browser erzeugt, keine Dateien) ─────────────
const SOUND_KEY = "soiree:sound";
let actx = null, master = null;
const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } };
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    master = actx.createGain(); master.gain.value = 0.55;
    const comp = actx.createDynamicsCompressor(); master.connect(comp); comp.connect(actx.destination);
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function noiseBuf(ms) {
  const n = Math.floor(actx.sampleRate * ms / 1000), b = actx.createBuffer(1, n, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function tone({ f, f2, type = "sine", t = 0, dur = 0.2, vol = 0.3, attack = 0.004 }) {
  const c = actx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function hiss({ t = 0, dur = 0.03, vol = 0.2, freq = 2000, q = 1, type = "bandpass" }) {
  const c = actx, src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), t0 = c.currentTime + t;
  src.buffer = noiseBuf(dur * 1000 + 20); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(fl); fl.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + 0.02);
}
const SFX = {
  // hochwertiger mechanischer Knopf: kurzer Anschlag, satter Körper, feiner Nachklang
  click() {
    hiss({ dur: 0.008, vol: 0.32, freq: 5200, q: 0.9 });
    hiss({ dur: 0.045, vol: 0.22, freq: 900, q: 1.4 });
    tone({ f: 150, f2: 92, dur: 0.075, vol: 0.34, attack: 0.002 });
    tone({ f: 1760, type: "triangle", dur: 0.03, vol: 0.035, attack: 0.001 });
  },
  release() {
    hiss({ dur: 0.006, vol: 0.14, freq: 6400, q: 1.1 });
    tone({ f: 240, f2: 170, dur: 0.035, vol: 0.12, attack: 0.002 });
  },
  pop() { tone({ f: 620, f2: 1100, dur: 0.09, vol: 0.22 }); hiss({ dur: 0.02, vol: 0.12, freq: 3000 }); },
  clink() {
    [[0, 1], [0.075, 0.8]].forEach(([t, v]) => [2637, 3951, 5274, 6645].forEach((f, i) =>
      tone({ f: f * (1 + (t ? 0.012 : 0)), t, dur: 1.4 - i * 0.25, vol: (0.11 - i * 0.022) * v, attack: 0.002 })));
  },
  seal() { [523.25, 783.99, 1046.5].forEach((f, i) => tone({ f, t: i * 0.012, dur: 1.8, vol: 0.09 - i * 0.02, attack: 0.02 })); },
  correct() { tone({ f: 659.25, type: "triangle", dur: 0.22, vol: 0.2 }); tone({ f: 880, type: "triangle", t: 0.11, dur: 0.38, vol: 0.2 }); },
  wrong() { tone({ f: 196, f2: 150, type: "sine", dur: 0.32, vol: 0.28 }); hiss({ dur: 0.08, vol: 0.06, freq: 500, type: "lowpass" }); },
  fanfare() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "triangle", t: i * 0.11, dur: i === 3 ? 0.9 : 0.3, vol: 0.16 })); },
  scuttle(ms) {
    let t = 0; const end = ms / 1000;
    while (t < end) { hiss({ t, dur: 0.012, vol: 0.09 + Math.random() * 0.06, freq: 3200 + Math.random() * 2600, q: 4 }); t += 0.028 + Math.random() * 0.022; }
  },
};
function play(name, arg) {
  if (!soundOn()) return;
  try { if (audio()) SFX[name](arg); } catch {}
}
// iOS: Audio beim ersten Antippen freischalten
document.addEventListener("pointerdown", () => { if (soundOn()) audio(); }, { once: true, passive: true });

// ── Fassungen: jeder Knopf bekommt automatisch seine vertiefte Schale ──
function socketize(root = document) {
  $$(".btn, .back, .home__admin, .shuffle, .choice label", root).forEach((el) => {
    if (el.parentElement?.classList.contains("socket")) return;
    const s = document.createElement("div");
    s.className = "socket" + (el.matches(".choice label") ? " socket--choice" : "") + (el.matches(".back, .shuffle, .home__admin, .btn--small") ? " socket--small" : "");
    el.parentNode.insertBefore(s, el); s.appendChild(el);
  });
}
new MutationObserver(() => socketize($("#app"))).observe(document.getElementById("app"), { childList: true, subtree: true });

// ── Sichtbares „Drücken“ bei jedem Antippen ─────────────────
const PRESSABLE = ".tile, .btn, .back, .options button, .choice label, .emojis button, .shuffle, .filters button, .tabs button, .icon, .home__admin, .topbar__crab";
let pressedEl = null;
function release() {
  if (!pressedEl) return;
  const el = pressedEl; pressedEl = null;
  if (!el.matches(".emojis button, .options button")) play("release");
  setTimeout(() => el.classList.remove("is-pressed"), 110);
}
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest?.(PRESSABLE);
  if (!el || el.disabled) return;
  pressedEl = el; el.classList.add("is-pressed");
  if (el.matches(".emojis button")) play("pop");
  else if (!el.matches(".options button")) play("click");
}, { passive: true });
["pointerup", "pointercancel", "pointerleave", "dragstart"].forEach((ev) => document.addEventListener(ev, release, { passive: true }));
// Kacheln: Druck kurz zeigen, dann öffnen
document.addEventListener("click", (e) => {
  const tile = e.target.closest?.(".tile");
  if (!tile) return;
  e.preventDefault();
  tile.classList.add("is-pressed");
  setTimeout(() => { location.hash = tile.getAttribute("href"); }, 120);
});

// ── Kein Scrollen: Inhalt passt immer komplett auf den Bildschirm ──
function fitView() {
  const root = $("#view"), sc = $("#scroll");
  if (!root || current === "admin") { if (root) root.style.zoom = ""; return; }
  root.style.zoom = "";
  const need = root.scrollHeight, have = sc.clientHeight;
  if (need > have + 2) root.style.zoom = String(Math.max(0.7, (have - 4) / need));
}
// Inhalte, die sich nachträglich ändern (Quiz-Fragen, Ergebnis), neu einpassen
let fitTimer;
new MutationObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(fitView, 60); })
  .observe(document.getElementById("view"), { childList: true, subtree: true });
window.addEventListener("resize", () => { if (!kbdOpen()) fitView(); });

// ── iPad-Tastatur: Ansicht danach immer zurücksetzen ──
function resetViewport() { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); }
const isTyping = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["radio", "checkbox", "button", "submit", "date"].includes(el.type)));
const kbdOpen = () => { const vv = window.visualViewport; return !!vv && isTyping(document.activeElement) && window.innerHeight - vv.height > 120; };
document.addEventListener("focusout", () => setTimeout(() => { if (!isTyping(document.activeElement)) { resetViewport(); placeKbdHint(); } }, 80));
document.addEventListener("focusin", () => setTimeout(placeKbdHint, 300));

// Glas-Hinweis „Tastatur ausblenden“ – links über der Tastatur
function placeKbdHint() {
  const h = document.getElementById("kbd-hint"), vv = window.visualViewport;
  if (!h) return;
  const show = isTyping(document.activeElement) && (!vv || window.innerHeight - vv.height > 120 || matchMedia("(pointer: coarse)").matches);
  h.classList.toggle("show", !!show);
  if (show && vv) {
    h.style.top = Math.round(vv.offsetTop + vv.height - h.offsetHeight - 14) + "px";
    h.style.left = Math.round(vv.offsetLeft + 16) + "px";
  }
}
if (window.visualViewport) {
  visualViewport.addEventListener("resize", placeKbdHint);
  visualViewport.addEventListener("scroll", placeKbdHint);
}
(function () {
  const h = document.getElementById("kbd-hint");
  if (!h) return;
  const close = (e) => { e.preventDefault(); play("click"); document.activeElement?.blur?.(); h.classList.remove("show"); setTimeout(resetViewport, 60); };
  h.addEventListener("pointerdown", (e) => e.preventDefault());
  h.addEventListener("click", close);
})();

// ── Router, Übergänge, Inaktivität ──────────────────────────
let teardown = [];
const onLeave = (fn) => teardown.push(fn);
const routes = { "": viewHome, gaestebuch: viewGuestbook, predictions: viewPredictions, quiz: viewQuiz, beichten: viewConfessions, admin: viewAdmin };
let current = "", first = true, stageOpen = false, renderSeq = 0;

// ── Krebs-Übergang: krabbelt nach oben raus, auf der neuen Seite wieder rein ──
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CRAB_OUT = 420, CRAB_IN = 400;
function pageCrab() {
  return $$("#view .crab").find((c) => !c.closest(".seal") && c.offsetWidth > 0) || null;
}
function crabGeom(c) {
  const app = $("#app"), ar = app.getBoundingClientRect();
  const s = ar.width / app.offsetWidth || 1;           // Skalierung in der iPad-Vorschau
  const r = c.getBoundingClientRect();
  return { left: (r.left - ar.left) / s, top: (r.top - ar.top) / s, w: r.width / s, h: r.height / s };
}
function crabClone(g) {
  const f = document.createElement("i");
  f.className = "crab crab-fly";
  Object.assign(f.style, { left: g.left + "px", top: g.top + "px", width: g.w + "px" });
  $("#app").appendChild(f);
  return f;
}
// Trippel-Schritte: seitliches Wackeln, Vorneigung, leichtes Federn
function scuttle(dist, dir) {
  const n = 14, f = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prog = dir === "out" ? Math.pow(t, 1.55) : 1 - Math.pow(1 - t, 1.7);
    const y = dir === "out" ? -dist * prog : -dist * (1 - prog);
    const side = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1);
    const amp = dir === "out" ? 1 - t * 0.25 : 0.4 + 0.6 * (1 - t);
    const tilt = i === 0 || i === n ? 0 : 22;
    let sx = 1, sy = 1;
    if (dir === "out" && i === 1) { sx = 1.07; sy = 0.92; }           // Anlauf
    if (dir === "in" && i === n - 1) { sx = 1.06; sy = 0.94; }        // Aufsetzen
    f.push({
      transform: `perspective(700px) translate(${side * 4 * amp}px, ${y + (i % 2 ? -3 : 0)}px) rotateX(${tilt}deg) rotate(${side * 8 * amp}deg) scale(${sx}, ${sy})`,
      filter: `drop-shadow(0 ${8 + (i % 2 ? 6 : 2)}px ${12 + (i % 2 ? 6 : 0)}px rgba(80,58,34,${i === 0 || i === n ? 0.22 : 0.32}))`,
    });
  }
  return f;
}
async function crabOut() {
  const c = pageCrab();
  if (!c || REDUCED) return;
  const g = crabGeom(c);
  if (g.top + g.h < 0 || g.top > $("#app").offsetHeight) return;   // nicht sichtbar
  const fly = crabClone(g);
  c.style.visibility = "hidden";
  play("scuttle", CRAB_OUT);
  await Promise.race([fly.animate(scuttle(g.top + g.h + 40, "out"), { duration: CRAB_OUT, easing: "linear", fill: "forwards" }).finished.catch(() => {}), wait(CRAB_OUT + 250)]);
  fly.remove();
}
async function crabIn(seq) {
  const c = pageCrab();
  if (!c || REDUCED) return;
  const holder = c.closest(".reveal");
  if (holder) { holder.style.animation = "none"; holder.style.opacity = "1"; }
  c.style.visibility = "hidden";
  c.style.animationPlayState = "paused";
  await new Promise((r) => requestAnimationFrame(r));
  const g = crabGeom(c);
  const fly = crabClone(g);
  play("scuttle", CRAB_IN);
  await Promise.race([fly.animate(scuttle(g.top + g.h + 40, "in"), { duration: CRAB_IN, easing: "linear", fill: "forwards" }).finished.catch(() => {}), wait(CRAB_IN + 250)]);
  // bis die Seite fertig eingeblendet ist, liegt der fliegende Krebs obenauf
  await wait(40);
  if (seq === renderSeq && c.isConnected) { c.style.visibility = ""; c.style.animationPlayState = ""; }
  fly.remove();
}

// ── Lichtschein: zieht regelmäßig über das ganze Bild ──
const SHEEN_EVERY = 9000, SHEEN_DUR = 1800;
function sheenPass() {
  if (REDUCED || document.hidden) return;
  const app = $("#app"), band = $("#sheen");
  if (!band) return;
  const W = app.offsetWidth;
  band.animate([{ transform: `translateX(${-0.6 * W}px)` }, { transform: `translateX(${1.6 * W}px)` }],
    { duration: SHEEN_DUR, easing: "cubic-bezier(.45,.05,.35,1)" });
  // Tasten glänzen genau dann, wenn der Schein sie erreicht
  const ar = app.getBoundingClientRect(), sc = ar.width / W || 1;
  $$(".tile").forEach((t) => {
    const r = t.getBoundingClientRect();
    const cx = (r.left - ar.left + r.width / 2) / sc, cy = (r.top - ar.top + r.height / 2) / sc;
    const pos = (cx + cy * 0.27 + 0.6 * W) / (2.2 * W);           // Lage entlang der Diagonale
    const shine = $(".tile__shine", t);
    shine?.animate([{ backgroundPosition: "160% 0" }, { backgroundPosition: "-60% 0" }],
      { duration: SHEEN_DUR * 0.5, delay: Math.max(0, SHEEN_DUR * pos - SHEEN_DUR * 0.25), easing: "ease-in-out" });
  });
}
setTimeout(() => { sheenPass(); setInterval(sheenPass, SHEEN_EVERY); }, 3200);

async function render() {
  const seq = ++renderSeq;
  const key = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  const view = routes[key] ? key : "";
  teardown.forEach((fn) => { try { fn(); } catch {} });
  teardown = [];
  $$(".confirm, .crab-fly").forEach((n) => n.remove());
  const root = $("#view");
  const wasFirst = first;
  if (!first) {
    root.classList.remove("is-entering");
    await Promise.all([crabOut(), (async () => { await wait(120); root.classList.add("is-leaving"); await wait(300); })()]);
  }
  if (seq !== renderSeq) return; // inzwischen neu navigiert
  first = false;
  current = view;
  document.body.classList.toggle("is-sub", view !== "");
  document.body.classList.toggle("is-admin", view === "admin");
  root.classList.remove("is-leaving");
  root.innerHTML = "";
  document.activeElement?.blur?.();
  resetViewport();
  $("#scroll").scrollTop = 0;
  root.style.zoom = "";
  void root.offsetWidth;
  root.classList.add("is-entering");
  await routes[view](root);
  fitView();
  if (!wasFirst && seq === renderSeq) crabIn(seq);
}
window.addEventListener("hashchange", render);
const go = (hash) => { if (location.hash === hash || (hash === "#/" && !location.hash)) render(); else location.hash = hash; };

let lastActivity = Date.now();
["pointerdown", "keydown", "input", "touchstart", "scroll"].forEach((ev) =>
  window.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true, capture: true }));
// ── Bildschirmschoner: der Krebs krabbelt über den Bildschirm ──
let saver = null;
function startSaver() {
  if (saver) return;
  const el = document.createElement("div");
  el.className = "saver";
  el.innerHTML = `
    <div class="saver__center">
      <div class="eyebrow">${esc(CONFIG.event.date)}</div>
      <div class="display saver__title">${esc(CONFIG.event.title)}</div>
      <div class="saver__tap"><i></i>Tippe, um zu beginnen</div>
    </div>`;
  $("#app").appendChild(el);
  const crab = document.createElement("i");
  crab.className = "crab saver__crab";
  el.appendChild(crab);
  saver = { el, crab, alive: true };
  walk();
}
async function walk() {
  const s = saver; if (!s || !s.alive) return;
  const app = $("#app"), W = app.offsetWidth, H = app.offsetHeight, c = s.crab;
  const size = Math.round(Math.min(W, H) * 0.16); c.style.width = size + "px";
  const fromLeft = Math.random() < 0.5;
  // oben oder unten laufen – nie quer über den Titel in der Mitte
  const top = Math.random() < 0.5;
  const band = top ? [0.06, 0.24] : [0.66, 0.84];
  const y0 = H * (band[0] + Math.random() * (band[1] - band[0])), y1 = H * (band[0] + Math.random() * (band[1] - band[0]));
  const x0 = fromLeft ? -size - 20 : W + 20, x1 = fromLeft ? W + 20 : -size - 20;
  const pauseAt = 0.35 + Math.random() * 0.3, steps = 60, frames = [];
  for (let i = 0; i <= steps; i++) {
    let t = i / steps;
    // kurzer Halt in der Mitte – Krebs schaut sich um
    const p = t < pauseAt ? (t / pauseAt) * pauseAt : t < pauseAt + 0.12 ? pauseAt : pauseAt + ((t - pauseAt - 0.12) / (0.88 - pauseAt)) * (1 - pauseAt);
    const walking = !(t >= pauseAt && t < pauseAt + 0.12);
    const side = walking ? (i % 2 ? 1 : -1) : 0;
    const x = x0 + (x1 - x0) * p, y = y0 + (y1 - y0) * p + (walking ? (i % 2 ? -3 : 0) : 0);
    frames.push({ transform: `translate(${x}px, ${y}px) rotate(${side * 6}deg)`, offset: t });
  }
  const dur = 9000 + Math.random() * 3000;
  try { await c.animate(frames, { duration: dur, easing: "linear", fill: "forwards" }).finished; } catch { return; }
  if (!s.alive) return;
  await wait(2500 + Math.random() * 4000);
  walk();
}
function stopSaver() {
  if (!saver) return;
  const s = saver; saver = null; s.alive = false;
  s.el.classList.add("is-leaving");
  setTimeout(() => s.el.remove(), 600);
}
// Erste Berührung beendet nur den Schoner und löst nichts darunter aus
document.addEventListener("pointerdown", (e) => {
  if (!saver) return;
  e.preventDefault(); e.stopPropagation();
  stopSaver(); lastActivity = Date.now();
}, true);
document.addEventListener("click", (e) => { if (Date.now() - lastActivity < 400 && e.target.closest?.(".saver")) { e.preventDefault(); e.stopPropagation(); } }, true);

setInterval(async () => {
  const idle = (Date.now() - lastActivity) / 1000;
  if (!saver && current !== "admin" && !stageOpen && idle > (CONFIG.kiosk.screensaverSeconds || 300)) {
    if (current !== "") go("#/");
    startSaver();
  }
  if (current === "admin") {
    if (!stageOpen && idle > CONFIG.kiosk.adminIdleSeconds) { await api.signOut(); lastActivity = Date.now(); go("#/"); }
  } else if (current !== "" && idle > CONFIG.kiosk.idleSeconds) {
    lastActivity = Date.now();
    go("#/");
  }
}, 5000);

function shell(i, title, intro, body) {
  return `
  <header class="topbar reveal">
    <a class="back" href="#/"><span>‹</span>Zurück</a>
    <a class="topbar__crab" href="#/" aria-label="Startseite"><i class="crab"></i></a>
    <span></span>
  </header>
  <section class="sheet reveal" style="--d:.08s">
    <h1 class="display sheet__title">${title}</h1>
    <p class="sheet__intro">${intro}</p>
    ${body}
  </section>`;
}

function confirmAndReturn({ title, text, eyebrow = "Zurück zur Soirée", ms = 4600 }) {
  document.activeElement?.blur?.();
  const el = document.createElement("div");
  el.className = "confirm";
  el.innerHTML = `
    <div class="seal">
      <svg viewBox="0 0 168 168"><circle cx="84" cy="84" r="80"/><circle class="inner" cx="84" cy="84" r="70"/></svg>
      <i class="crab"></i>
    </div>
    <h2 class="display confirm__title reveal" style="--d:1.1s">${title}</h2>
    <p class="confirm__text reveal" style="--d:1.35s">${text}</p>
    <div class="confirm__bar reveal" style="--d:1.5s"><i style="--t:${(ms - 1500) / 1000}s;animation-delay:1.5s"></i></div>
    <div class="eyebrow reveal" style="--d:1.6s">${eyebrow}</div>`;
  $("#app").appendChild(el);
  play("clink");
  setTimeout(() => play("seal"), 1050);
  let done = false;
  const finish = () => {
    if (done || !el.isConnected) return; done = true;
    el.style.transition = "opacity .6s"; el.style.opacity = "0";
    setTimeout(() => { el.remove(); go("#/"); }, 450);
  };
  el.addEventListener("click", finish);
  setTimeout(finish, ms);
}

// ── Startbildschirm ─────────────────────────────────────────
function viewHome(root) {
  const items = [
    ["gaestebuch", "The Guestbook", "Hinterlasse Daniel ein paar persönliche Worte."],
    ["predictions", "Baby Predictions", "Verrate uns deine Vorhersagen für unser Baby."],
    ["quiz", "The Party Quiz", "Wie gut kennst du Daniel wirklich?"],
    ["beichten", "Party Beichten", "Was wolltest du schon immer loswerden?"],
  ];
  root.innerHTML = `
  <section class="home">
    <div class="arch">
      <div class="reveal" style="--d:.55s"><div class="crab crab--float" id="crab" role="img" aria-label="Goldener Krebs"></div></div>
      <div class="eyebrow home__date reveal" style="--d:.85s">${esc(CONFIG.event.date)}</div>
      <h1 class="display home__title reveal" style="--d:1.05s">${esc(CONFIG.event.title)}</h1>
      <div class="lede home__sub reveal" style="--d:1.3s">${esc(CONFIG.event.subtitle)}</div>
      <ul class="tiles">
        ${items.map(([h, t, d], i) => `
          <li class="reveal" style="--d:${1.55 + i * 0.13}s">
            <a class="tile" href="#/${h}">
              <span class="tile__t">${t}</span>
              <span class="tile__d">${d}</span>
              <span class="tile__tap" style="--rip:${i * 0.6}s"><i></i>Antippen</span>
              <span class="tile__shine" aria-hidden="true"></span>
            </a>
          </li>`).join("")}
      </ul>
      <div class="home__hint reveal" style="--d:2.3s"><span>Tippe auf eine Station</span></div>
    </div>
    <footer class="home__foot reveal" style="--d:2.4s">
      <div class="eyebrow">${esc(CONFIG.event.place)}</div>
      <a class="home__admin" href="#/admin">Speicher &amp; Ergebnisse</a>
    </footer>
  </section>`;

  let taps = 0, tt;
  $("#crab").addEventListener("click", () => {
    taps++; clearTimeout(tt); tt = setTimeout(() => (taps = 0), 900);
    if (taps >= 3) go("#/admin");
  });
}

// ── I: Gästebuch ───────────────────────────────────────────
function viewGuestbook(root) {
  const MAX = CONFIG.guestbook.maxChars;
  root.innerHTML = shell(0, "The Guestbook",
    "Ein paar persönliche Worte für Daniel – zum Vierzigsten, zum Papa-Werden, für die Erinnerung.",
    `
    <form id="g-form" class="form">
      <label class="field">
        <span class="field__label">Von <span class="field__hint">– dein Name</span></span>
        <input class="input" id="g-name" maxlength="80" placeholder="Wer schreibt?" ${NOAUTO}>
      </label>
      <div class="letter">
        <textarea class="textarea" id="g-text" maxlength="${MAX}" placeholder="Lieber Daniel …" aria-label="Dein Eintrag"></textarea>
        <div class="letter__meta"><span>Gästebuch</span><span class="counter" id="g-count">0 / ${MAX}</span></div>
      </div>
      ${emojiBar()}
      <div class="actions" style="margin-top:28px"><button class="btn" type="submit" id="g-send" disabled>Ins Gästebuch schreiben</button></div>
    </form>`);

  const ta = $("#g-text"), count = $("#g-count"), send = $("#g-send");
  bindEmojis(root, ta);
  ta.addEventListener("input", () => {
    count.textContent = `${ta.value.length} / ${MAX}`;
    count.classList.toggle("warn", ta.value.length > MAX * 0.9);
    send.disabled = !ta.value.trim();
  });
  $("#g-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = ta.value.trim().slice(0, MAX);
    if (!message) return;
    busy(send, true, "Wird eingetragen");
    try {
      await submit(TABLES.guestbook, { guest_name: $("#g-name").value.trim() || null, message });
      confirmAndReturn({ title: "Danke!", text: "Deine Worte stehen jetzt in Daniels Gästebuch." });
    } catch (err) { busy(send, false); toast(errMsg(err)); }
  });
}

// ── II: Baby Predictions ───────────────────────────────────
function viewPredictions(root) {
  root.innerHTML = shell(1, "Baby Predictions",
    "Rosa oder Blau, wann, wie groß, wie schwer? Gib deinen Tipp ab, bevor das Geheimnis gelüftet wird.",
    `
    <form class="form form--compact" id="p-form" novalidate>
      <div class="field">
        <span class="field__label">Ich tippe auf</span>
        <div class="choice">
          <label><input type="radio" name="gender" value="girl"><span>ein Mädchen</span></label>
          <label><input type="radio" name="gender" value="boy"><span>einen Jungen</span></label>
        </div>
      </div>
      <div class="row row--3">
        <label class="field">
          <span class="field__label">Geburtstag</span>
          <input class="input" type="date" name="birth_date" min="2026-11-07" max="2027-12-31">
        </label>
        <label class="field">
          <span class="field__label">Gewicht <span class="field__hint">– g</span></span>
          <input class="input" type="number" inputmode="numeric" name="weight_grams" min="500" max="7000" step="10" placeholder="3400">
        </label>
        <label class="field">
          <span class="field__label">Größe <span class="field__hint">– cm</span></span>
          <input class="input" type="number" inputmode="numeric" name="length_cm" min="30" max="70" placeholder="51">
        </label>
      </div>
      <div class="field">
        <span class="field__label">Kommt nach</span>
        <div class="choice">
          <label><input type="radio" name="looks_like" value="papa"><span>Papa</span></label>
          <label><input type="radio" name="looks_like" value="mama"><span>Mama</span></label>
          <label><input type="radio" name="looks_like" value="both"><span>beiden</span></label>
        </div>
      </div>
      <div class="row">
        <label class="field">
          <span class="field__label">Namensvorschlag</span>
          <input class="input" name="name_suggestion" maxlength="80" placeholder="…" ${NOAUTO}>
        </label>
        <label class="field">
          <span class="field__label">Dein Name</span>
          <input class="input" name="guest_name" maxlength="80" placeholder="Vor- und Nachname" ${NOAUTO}>
        </label>
      </div>
      <label class="field">
        <span class="field__label">Ein Wunsch für das Baby <span class="field__hint">– optional</span></span>
        <input class="input" name="wish" maxlength="400" placeholder="Möge es …">
      </label>
      <div class="actions"><button class="btn" type="submit">Tipp abgeben</button></div>
    </form>`);

  $("#p-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const gender = f.get("gender");
    if (!gender) return toast("Erst die wichtigste Frage: Mädchen oder Junge?");
    const num = (k) => { const v = parseInt(f.get(k), 10); return Number.isFinite(v) ? v : null; };
    const w = num("weight_grams"), l = num("length_cm");
    if (w !== null && (w < 500 || w > 7000)) return toast("Das Gewicht bitte in Gramm, z. B. 3400.");
    if (l !== null && (l < 30 || l > 70)) return toast("Die Größe bitte in Zentimetern, z. B. 51.");
    const btn = $("button[type=submit]", e.currentTarget);
    busy(btn, true);
    try {
      await submit(TABLES.predictions, {
        guest_name: (f.get("guest_name") || "").trim() || null,
        gender,
        birth_date: f.get("birth_date") || null,
        weight_grams: w,
        length_cm: l,
        looks_like: f.get("looks_like") || null,
        name_suggestion: (f.get("name_suggestion") || "").trim() || null,
        wish: (f.get("wish") || "").trim() || null,
      });
      confirmAndReturn({ title: "Notiert.", text: "Dein Tipp ist im Umschlag. Wir sind gespannt, wer am Ende richtig lag." });
    } catch (err) { busy(btn, false); toast(errMsg(err)); }
  });
}

// ── III: Party-Quiz ────────────────────────────────────────
function viewQuiz(root) {
  const ROUND = Math.min(CONFIG.quizPerRound || 10, CONFIG.quiz.length);
  let name = "", asked = new Set(), Q = [], idx = 0, score = 0, answers = [];

  root.innerHTML = shell(2, "The Party Quiz",
    `Wie gut kennst du Daniel wirklich? ${ROUND} Fragen pro Runde – spiel weitere Runden und verbessere deine Trefferquote.`,
    `<div id="quiz"></div>`);
  const box = $("#quiz");

  // Fragen, die diese Person auf diesem iPad schon hatte (auch aus früheren Runden)
  function alreadyAsked(n) {
    const k = nameKey(n), set = new Set();
    archive.all().filter((r) => r.table === TABLES.quiz && nameKey(r.row.guest_name || "") === k)
      .forEach((r) => (r.row.answers || []).forEach((a) => set.add(a.frage)));
    return set;
  }
  function newRound() {
    let pool = CONFIG.quiz.filter((q) => !asked.has(q.q));
    if (!pool.length) { asked = new Set(); pool = [...CONFIG.quiz]; }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    Q = pool.slice(0, ROUND); idx = 0; score = 0; answers = [];
    question();
  }

  function intro() {
    box.innerHTML = `
      <div class="form">
        <label class="field">
          <span class="field__label">Dein Vor- und Nachname <span class="field__hint">– für die Bestenliste</span></span>
          <input class="input" id="q-name" maxlength="80" placeholder="Vorname Nachname" ${NOAUTO}>
        </label>
        <div class="actions"><button class="btn" id="q-start">Quiz starten</button></div>
      </div>`;
    $("#q-start").addEventListener("click", () => {
      name = $("#q-name").value.trim().replace(/\s+/g, " ");
      if (name.split(" ").filter((w) => w.length > 1).length < 2) return toast("Bitte Vor- und Nachnamen eintragen.");
      document.activeElement?.blur?.();
      asked = alreadyAsked(name);
      newRound();
    });
  }

  function question() {
    const q = Q[idx];
    box.innerHTML = `
      <div class="quiz__progress"><span>${String(idx + 1).padStart(2, "0")} / ${String(Q.length).padStart(2, "0")}</span><div><i style="width:${(idx / Q.length) * 100}%"></i></div></div>
      <div class="stage-swap">
        <p class="quiz__q">${esc(q.q)}</p>
        <ul class="options ${q.options.length === 2 ? "two" : ""}">
          ${q.options.map((o, i) => `<li><button data-i="${i}">${q.options.length === 2 ? "" : `<b>${"ABCD"[i] || i + 1}</b>`}${esc(o)}</button></li>`).join("")}
        </ul>
      </div>`;
    requestAnimationFrame(() => { const bar = $(".quiz__progress i", box); if (bar) bar.style.width = `${((idx + 1) / Q.length) * 100}%`; });
    $$(".options button", box).forEach((b) => b.addEventListener("click", async () => {
      const pick = Number(b.dataset.i);
      const ok = pick === q.correct;
      if (ok) score++;
      play(ok ? "correct" : "wrong");
      asked.add(q.q);
      answers.push({ frage: q.q, antwort: q.options[pick], richtig: ok });
      $$(".options button", box).forEach((x) => (x.disabled = true));
      b.classList.add(ok ? "is-right" : "is-false");   // nur der getippte Button leuchtet
      await wait(1300);
      idx++;
      idx < Q.length ? question() : result();
    }));
  }

  function verdict(r) {
    if (r === 1) return ["Seelenverwandt.", "Du kennst Daniel besser als er sich selbst."];
    if (r >= 0.75) return ["Engster Kreis.", "Dir erzählt Daniel offenbar alles."];
    if (r >= 0.5) return ["Gute Gesellschaft.", "Solide – beim nächsten Glas Wein erfährst du den Rest."];
    if (r >= 0.25) return ["Charmanter Gast.", "Heute Abend ist die perfekte Gelegenheit, Daniel besser kennenzulernen."];
    return ["Neu im Club.", "Kein Problem – dafür gibt es ja diese Soirée."];
  }

  async function result() {
    const left = CONFIG.quiz.filter((q) => !asked.has(q.q)).length;
    const [t, d] = verdict(score / Q.length);
    box.innerHTML = `
      <div class="stage-swap">
        <div class="eyebrow" style="margin-top:22px">Diese Runde</div>
        <div class="score">${score}<small> / ${Q.length}</small></div>
        <h2 class="display" style="font-size:clamp(34px,9cqw,54px);margin-top:12px">${t}</h2>
        <p class="sheet__intro">${d}</p>
        <div id="q-top"></div>
        <div class="actions" style="margin-top:26px">
          ${left ? `<button class="btn btn--gold" id="q-more">Weitere ${Math.min(ROUND, left)} Fragen</button>` : ""}
          <a class="btn btn--ghost" href="#/">Zurück zur Soirée</a>
        </div>
        ${left ? "" : `<p class="anon-note">Du hast alle ${CONFIG.quiz.length} Fragen gespielt – Respekt!</p>`}
      </div>`;
    $("#q-more")?.addEventListener("click", newRound);
    try { await submit(TABLES.quiz, { guest_name: name, score, total: Q.length, answers }, { wait: true }); }
    catch (err) { toast("Ergebnis konnte nicht gespeichert werden – " + errMsg(err)); }
    try {
      const r = await api.rank(name);
      if (r && r.rank && $("#q-top")) {
        play("fanfare");
        $("#q-top").innerHTML = `
          <div class="rank stage-swap">
            <div class="eyebrow">Deine Platzierung</div>
            <b>Platz ${r.rank}</b>
            <span>von ${r.total} ${r.total === 1 ? "Teilnehmer" : "Teilnehmern"}</span>
            <p class="rank__sum">Insgesamt ${r.correct} von ${r.answered} richtig · ${pct(r.correct, r.answered)}</p>
          </div>`;
      }
    } catch {}
  }

  intro();
}

// ── IV: Party Beichten ─────────────────────────────────────
function viewConfessions(root) {
  const P = CONFIG.confessions.prompts;
  const MAX = CONFIG.confessions.maxChars;
  // Zufällige Reihenfolge; "Andere Frage" geht sie der Reihe nach durch
  const order = [...P.keys()].sort(() => Math.random() - 0.5);
  let oi = 0, pi = order[0];

  root.innerHTML = shell(3, "Party Beichten",
    "Was wolltest du schon immer loswerden? Ganz anonym – ohne Namen, ohne Spuren.",
    `
    <div class="prompt"><p class="prompt__text" id="c-prompt"></p></div>
    <button class="shuffle" id="c-shuffle" type="button"><b>↻</b>Andere Frage</button>
    <form id="c-form">
      <div class="letter" id="c-letter">
        <textarea class="textarea" id="c-text" maxlength="${MAX}" placeholder="Ich gestehe …" aria-label="Deine Beichte"></textarea>
        <div class="letter__meta"><span>Anonym</span><span class="counter" id="c-count">0 / ${MAX}</span></div>
      </div>
      ${emojiBar()}
      <p class="anon-note">Kein Name, keine Spuren. Nur Daniel liest mit.</p>
      <div class="actions"><button class="btn" type="submit" id="c-send" disabled>Beichte versiegeln</button></div>
    </form>`);

  const ptxt = $("#c-prompt"), ta = $("#c-text"), count = $("#c-count"), send = $("#c-send");
  bindEmojis(root, ta);
  ptxt.textContent = P[pi];

  $("#c-shuffle").addEventListener("click", () => {
    oi = (oi + 1) % order.length;
    pi = order[oi];
    ptxt.classList.add("is-out");
    setTimeout(() => { ptxt.textContent = P[pi]; ptxt.classList.remove("is-out"); }, 450);
  });
  ta.addEventListener("input", () => {
    const n = ta.value.length;
    count.textContent = `${n} / ${MAX}`;
    count.classList.toggle("warn", n > MAX * 0.9);
    send.disabled = !ta.value.trim();
  });

  $("#c-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = ta.value.trim().slice(0, MAX);
    if (!content) return;
    busy(send, true, "Wird versiegelt");
    const letter = $("#c-letter");
    try {
      await Promise.all([
        submit(TABLES.confessions, { content, prompt: P[pi] }),
        (async () => { letter.classList.add("fold"); await wait(950); })(),
      ]);
      confirmAndReturn({ title: "Versiegelt.", text: "Dein Geheimnis ist sicher. Niemand erfährt, von wem es stammt." });
    } catch (err) {
      letter.classList.remove("fold");
      busy(send, false);
      toast(errMsg(err));
    }
  });
}

// ── Export ─────────────────────────────────────────────────
const LBL = {
  gender: { girl: "Mädchen", boy: "Junge" },
  looks: { papa: "Papa", mama: "Mama", both: "beiden" },
};
const dt = (iso) => (iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
function sheets(data) {
  return {
    "Gästebuch": (data.guestbook || []).map((r) => ({ Zeit: dt(r.created_at), Name: r.guest_name || "", Eintrag: r.message })),
    "Beichten": (data.confessions || []).map((r) => ({ Zeit: dt(r.created_at), Frage: r.prompt || "", Beichte: r.content, Gelesen: r.is_read ? "ja" : "", Favorit: r.is_favorite ? "★" : "" })),
    "Baby Predictions": (data.predictions || []).map((r) => ({
      Zeit: dt(r.created_at), Name: r.guest_name || "", Tipp: LBL.gender[r.gender] || "",
      Geburtstermin: r.birth_date ? new Date(r.birth_date).toLocaleDateString("de-DE") : "",
      "Gewicht (g)": r.weight_grams ?? "", "Größe (cm)": r.length_cm ?? "", "Kommt nach": LBL.looks[r.looks_like] || "",
      Namensvorschlag: r.name_suggestion || "", Wunsch: r.wish || "",
    })),
    "Quiz-Rangliste": quizBoard(data.quiz || []).map((r, i) => ({
      Rang: i + 1, Name: r.name, Trefferquote: pct(r.correct, r.answered), Richtig: r.correct, Beantwortet: r.answered, Runden: r.rounds, Zuletzt: dt(r.last),
    })),
    "Quiz-Runden": [...(data.quiz || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((r) => ({
      Zeit: dt(r.created_at), Name: r.guest_name || "Anonym", Punkte: r.score, von: r.total,
      Antworten: Array.isArray(r.answers) ? r.answers.map((a) => (a.richtig ? "✓ " : "✗ ") + (a.frage ? a.frage + " → " : "") + (a.antwort ?? "")).join(" | ") : "",
    })),
  };
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
async function excelBlob(data) {
  await loadScript(new URL("./vendor/xlsx.full.min.js", import.meta.url).href);
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  Object.entries(sheets(data)).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Hinweis: "Noch keine Einträge" }]);
    const keys = Object.keys(rows[0] || { Hinweis: 1 });
    ws["!cols"] = keys.map((k) => ({ wch: Math.min(70, Math.max(k.length + 2, ...rows.map((r) => String(r[k] ?? "").length).slice(0, 200), 10)) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function csvBlob(data) {
  const parts = Object.entries(sheets(data)).map(([name, rows]) => {
    if (!rows.length) return `${name}\nNoch keine Einträge`;
    const keys = Object.keys(rows[0]);
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [name, keys.map(cell).join(";"), ...rows.map((r) => keys.map((k) => cell(r[k])).join(";"))].join("\n");
  });
  return new Blob(["﻿" + parts.join("\n\n\n")], { type: "text/csv;charset=utf-8" });
}
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  // Auf dem iPad: Teilen-Menü (Dateien sichern, AirDrop, Mail …)
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── Speicher & Ergebnisse (Admin) ──────────────────────────
async function viewAdmin(root) {
  if (!(await api.isAdmin())) return adminLogin(root);
  onLeave(() => { api.signOut(); });

  const state = { tab: sessionStorage.getItem("soiree:tab") || "guestbook", filter: "all", data: {}, cloudOk: true };
  root.innerHTML = `
    <div class="admin">
      <header class="topbar reveal" style="max-width:none">
        <a class="back" href="#/"><span>‹</span>Abmelden</a>
        <span></span>
        <span class="actions" style="margin:0;gap:8px;flex-wrap:nowrap">
          <button class="btn btn--ghost btn--small" id="a-sound">${soundOn() ? "Ton: an" : "Ton: aus"}</button>
          <button class="btn btn--ghost btn--small" id="a-refresh">Aktualisieren</button>
        </span>
      </header>
      <div class="admin__head reveal" style="--d:.1s">
        <i class="crab" style="--crab:56px"></i>
        <div class="eyebrow" style="margin-top:12px">Speicher &amp; Ergebnisse${LIVE ? "" : " · Demo-Modus"}</div>
        <h1 class="display">${esc(CONFIG.event.title)}</h1>
        <div id="a-status" class="status"></div>
      </div>
      <nav class="tabs reveal" style="--d:.2s" id="a-tabs"></nav>
      <div id="a-body" class="reveal" style="--d:.3s"></div>
    </div>`;

  const TABS = [["guestbook", "Gästebuch"], ["confessions", "Beichten"], ["predictions", "Predictions"], ["quiz", "Quiz"], ["backup", "Sicherung"]];

  function drawStatus() {
    const p = archive.pending().length;
    $("#a-status").innerHTML = p
      ? `<span class="warn">● ${p} ${p === 1 ? "Eintrag wartet" : "Einträge warten"} auf WLAN – auf dem iPad gesichert, wird automatisch nachgesendet.</span>`
      : state.cloudOk ? `<span>✓ Alles sicher gespeichert</span>` : `<span class="warn">● Cloud gerade nicht erreichbar – angezeigt wird die Sicherung dieses iPads.</span>`;
  }

  function drawTabs() {
    $("#a-tabs").innerHTML = TABS.map(([k, l]) => {
      const n = state.data[k]?.length;
      const unread = k === "confessions" ? (state.data.confessions || []).filter((c) => !c.is_read).length : 0;
      return `<button data-k="${k}" class="${state.tab === k ? "on" : ""}">${l}<sup>${n ?? ""}${unread ? " · " + unread + " neu" : ""}</sup></button>`;
    }).join("");
    $$("#a-tabs button").forEach((b) => b.addEventListener("click", () => {
      state.tab = b.dataset.k; sessionStorage.setItem("soiree:tab", state.tab); drawTabs(); drawBody();
    }));
  }

  async function load() {
    await syncOutbox();
    const local = archive.all();
    state.cloudOk = true;
    await Promise.all(Object.entries(TABLES).map(async ([k, t]) => {
      let rows = [];
      try { rows = await api.list(t); } catch { state.cloudOk = false; }
      // Lokal gesicherte Einträge ergänzen, die (noch) nicht in der Cloud sind
      const ids = new Set(rows.map((r) => r.id));
      local.filter((r) => r.table === t && !ids.has(r.row.id) && (!r.synced || !state.cloudOk))
        .forEach((r) => rows.push({ is_read: false, is_favorite: false, ...r.row, _local: !r.synced }));
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      state.data[k] = rows;
    }));
    drawStatus();
  }

  function drawBody() {
    const body = $("#a-body");
    ({ guestbook: drawGuestbook, confessions: drawConfessions, predictions: drawPredictions, quiz: drawQuiz, backup: drawBackup })[state.tab](body);
  }

  const localBadge = (r) => (r._local ? `<span class="badge">nur auf dem iPad</span>` : "");

  async function del(key, row, rerender) {
    try {
      if (!row._local) await api.remove(TABLES[key], row.id);
      if (row._local) archive.drop(row.id);
      state.data[key] = state.data[key].filter((x) => x.id !== row.id);
      toast("Gelöscht"); drawTabs(); rerender();
    } catch (err) { toast(errMsg(err)); }
  }

  // Gästebuch
  function drawGuestbook(body) {
    const list = state.data.guestbook || [];
    body.innerHTML = `
      <div class="toolbar"><span></span>${list.length ? `<button class="btn btn--small" id="a-present">Präsentation starten</button>` : ""}</div>
      ${list.length ? `<div class="cards">${list.map((g, i) => `
        <article class="card panel" style="animation-delay:${Math.min(i, 12) * 40}ms" data-id="${g.id}">
          <div class="card__prompt">${esc(g.guest_name || "Ohne Namen")}</div>
          <div class="card__text">${esc(g.message)}</div>
          <div class="card__meta">
            <span class="card__time">${fmtTime(g.created_at)} ${localBadge(g)}</span>
            <span class="icons">
              <button class="icon" data-act="present" title="Groß anzeigen">${ICON.present}</button>
              <button class="icon danger" data-act="del" title="Löschen">${ICON.trash}</button>
            </span>
          </div>
        </article>`).join("")}</div>` : `<div class="empty panel">Das Gästebuch ist noch leer.</div>`}`;
    $("#a-present", body)?.addEventListener("click", () => present("guestbook", list, 0));
    $$(".card", body).forEach((card) => {
      const g = list.find((x) => x.id === card.dataset.id);
      $("[data-act=present]", card).addEventListener("click", () => present("guestbook", list, list.indexOf(g)));
      $("[data-act=del]", card).addEventListener("click", (e) => { if (armed(e.currentTarget)) del("guestbook", g, () => drawGuestbook(body)); });
    });
  }

  // Beichten
  function filtered() {
    const all = state.data.confessions || [];
    if (state.filter === "unread") return all.filter((c) => !c.is_read);
    if (state.filter === "fav") return all.filter((c) => c.is_favorite);
    return all;
  }
  function drawConfessions(body) {
    const list = filtered();
    body.innerHTML = `
      <div class="toolbar">
        <div class="filters">
          ${[["all", "Alle"], ["unread", "Ungelesen"], ["fav", "Favoriten"]].map(([k, l]) => `<button data-f="${k}" class="${state.filter === k ? "on" : ""}">${l}</button>`).join("")}
        </div>
        ${list.length ? `<button class="btn btn--small" id="a-present">Präsentation starten</button>` : ""}
      </div>
      ${list.length ? `<div class="cards">${list.map((c, i) => `
        <article class="card panel ${c.is_read ? "" : "is-unread"}" style="animation-delay:${Math.min(i, 12) * 40}ms" data-id="${c.id}">
          ${c.prompt ? `<div class="card__prompt">${esc(c.prompt)}</div>` : ""}
          <div class="card__text">${esc(c.content)}</div>
          <div class="card__meta">
            <span class="card__time">${fmtTime(c.created_at)} ${localBadge(c)}</span>
            <span class="icons">
              <button class="icon ${c.is_read ? "on" : ""}" data-act="read" title="Gelesen">${ICON.read}</button>
              <button class="icon ${c.is_favorite ? "on" : ""}" data-act="fav" title="Favorit">${ICON.star}</button>
              <button class="icon" data-act="present" title="Groß anzeigen">${ICON.present}</button>
              <button class="icon danger" data-act="del" title="Löschen">${ICON.trash}</button>
            </span>
          </div>
        </article>`).join("")}</div>`
      : `<div class="empty panel">${state.filter === "all" ? "Noch keine Beichten. Der Abend ist jung." : "Hier ist gerade nichts."}</div>`}`;

    $$(".filters button", body).forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.f; drawConfessions(body); }));
    $("#a-present", body)?.addEventListener("click", () => present("confessions", filtered(), 0));
    $$(".card", body).forEach((card) => {
      const c = state.data.confessions.find((x) => x.id === card.dataset.id);
      $$("[data-act]", card).forEach((btn) => btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (act === "present") { const l = filtered(); return present("confessions", l, Math.max(0, l.indexOf(c))); }
        if (act === "del") { if (armed(btn)) del("confessions", c, () => drawConfessions(body)); return; }
        if (c._local) return toast("Wird erst nach dem Nachsenden markierbar.");
        try {
          if (act === "read") { await api.update(TABLES.confessions, c.id, { is_read: !c.is_read }); c.is_read = !c.is_read; }
          if (act === "fav") { await api.update(TABLES.confessions, c.id, { is_favorite: !c.is_favorite }); c.is_favorite = !c.is_favorite; }
          drawTabs(); drawConfessions(body);
        } catch (err) { toast(errMsg(err)); }
      }));
    });
  }

  // Präsentationsansicht (Beichten & Gästebuch)
  function present(kind, list, start) {
    if (!list.length) return;
    let i = start;
    stageOpen = true;
    const isConf = kind === "confessions";
    const st = document.createElement("div");
    st.className = "stage";
    st.innerHTML = `
      <div class="stage__arch"></div>
      <div class="stage__side l" data-go="-1"></div><div class="stage__side r" data-go="1"></div>
      <div id="s-inner"></div>
      <div class="stage__nav">
        <button class="btn btn--ghost btn--small" data-go="-1">‹ Zurück</button>
        ${isConf ? `<button class="btn btn--ghost btn--small" id="s-fav">★ Favorit</button>` : ""}
        <button class="btn btn--ghost btn--small" id="s-full">Vollbild</button>
        <button class="btn btn--ghost btn--small" id="s-close">Schließen</button>
        <button class="btn btn--ghost btn--small" data-go="1">Weiter ›</button>
      </div>`;
    $("#app").appendChild(st);
    const inner = $("#s-inner", st);

    function draw() {
      const c = list[i];
      const text = isConf ? c.content : c.message;
      const label = isConf ? (c.prompt || "Party Beichte") : `Gästebuch · ${c.guest_name || "Ohne Namen"}`;
      inner.innerHTML = `
        <div class="stage-swap">
          <i class="crab"></i>
          <div class="eyebrow stage__prompt">${esc(label)}</div>
          <p class="stage__text ${text.length > 220 ? "long" : ""} ${text.length > 600 ? "xlong" : ""}"><span class="q">„</span>${esc(text)}<span class="q">“</span></p>
          <div class="stage__count">${i + 1} / ${list.length}</div>
        </div>`;
      if (isConf) {
        $("#s-fav", st).textContent = c.is_favorite ? "★ Favorit" : "☆ Favorit";
        if (!c.is_read && !c._local) { c.is_read = true; api.update(TABLES.confessions, c.id, { is_read: true }).catch(() => {}); }
      }
    }
    const move = (d) => { i = (i + d + list.length) % list.length; draw(); };
    const close = () => {
      document.removeEventListener("keydown", key);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      st.style.transition = "opacity .6s"; st.style.opacity = "0";
      setTimeout(() => st.remove(), 620);
      stageOpen = false;
      lastActivity = Date.now();
      drawTabs(); drawBody();
    };
    const toggleFull = () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else (st.requestFullscreen || st.webkitRequestFullscreen)?.call(st);
    };
    const key = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); move(1); }
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "Escape" && !document.fullscreenElement) close();
      if (e.key.toLowerCase() === "f") toggleFull();
    };
    $$("[data-go]", st).forEach((b) => b.addEventListener("click", () => move(Number(b.dataset.go))));
    $("#s-close", st).addEventListener("click", close);
    $("#s-full", st).addEventListener("click", toggleFull);
    $("#s-fav", st)?.addEventListener("click", async () => {
      const c = list[i];
      if (c._local) return toast("Wird erst nach dem Nachsenden markierbar.");
      try { await api.update(TABLES.confessions, c.id, { is_favorite: !c.is_favorite }); c.is_favorite = !c.is_favorite; draw(); }
      catch (err) { toast(errMsg(err)); }
    });
    document.addEventListener("keydown", key);
    onLeave(() => { document.removeEventListener("keydown", key); st.remove(); stageOpen = false; });
    draw();
  }

  // Predictions
  function drawPredictions(body) {
    const list = state.data.predictions || [];
    if (!list.length) { body.innerHTML = `<div class="empty panel" style="margin-top:18px">Noch keine Tipps abgegeben.</div>`; return; }
    const girls = list.filter((p) => p.gender === "girl").length, boys = list.filter((p) => p.gender === "boy").length;
    const avg = (k) => { const v = list.map((p) => p[k]).filter((x) => Number.isFinite(x)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const dates = list.map((p) => p.birth_date).filter(Boolean).map((d) => new Date(d).getTime()).sort((a, b) => a - b);
    const median = dates.length ? new Date(dates[Math.floor(dates.length / 2)]).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) : "–";
    const names = {};
    list.forEach((p) => { const n = p.name_suggestion?.trim(); if (n) { const k = n[0].toUpperCase() + n.slice(1).toLowerCase(); names[k] = (names[k] || 0) + 1; } });
    const topNames = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${esc(n)}${c > 1 ? ` (${c})` : ""}`).join(", ") || "–";
    const pg = Math.round((girls / (girls + boys || 1)) * 100);
    const aw = avg("weight_grams"), al = avg("length_cm");
    body.innerHTML = `
      <div class="stats" style="margin-top:18px">
        <div class="stat panel"><span>Mädchen · Junge</span><b>${girls} · ${boys}</b>
          <div class="split"><i class="g" style="width:${pg}%"></i><i class="b" style="width:${100 - pg}%"></i></div>
          <span style="color:var(--muted)">${pg}% tippen auf ein Mädchen</span></div>
        <div class="stat panel"><span>Ø Gewicht</span><b>${aw ? aw + " g" : "–"}</b></div>
        <div class="stat panel"><span>Ø Größe</span><b>${al ? al + " cm" : "–"}</b></div>
        <div class="stat panel"><span>Mittlerer Termin</span><b style="font-size:26px;padding-top:8px">${median}</b></div>
        <div class="stat panel"><span>Beliebteste Namen</span><b style="font-size:24px;padding-top:8px">${topNames}</b></div>
      </div>
      <div class="panel table-wrap">
        <table class="table">
          <thead><tr><th>Gast</th><th>Tipp</th><th>Termin</th><th>Gewicht</th><th>Größe</th><th>Kommt nach</th><th>Name</th><th>Wunsch</th><th></th></tr></thead>
          <tbody>${list.map((p) => `
            <tr data-id="${p.id}">
              <td>${esc(p.guest_name || "–")} ${localBadge(p)}</td>
              <td><i>${LBL.gender[p.gender] || "–"}</i></td>
              <td>${p.birth_date ? new Date(p.birth_date).toLocaleDateString("de-DE") : "–"}</td>
              <td>${p.weight_grams ? p.weight_grams + " g" : "–"}</td>
              <td>${p.length_cm ? p.length_cm + " cm" : "–"}</td>
              <td>${LBL.looks[p.looks_like] || "–"}</td>
              <td>${esc(p.name_suggestion || "–")}</td>
              <td style="max-width:260px">${esc(p.wish || "")}</td>
              <td><button class="icon danger" data-act="del" title="Löschen">${ICON.trash}</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
    $$("tr[data-id]", body).forEach((tr) => $("[data-act=del]", tr).addEventListener("click", (e) => {
      if (armed(e.currentTarget)) del("predictions", list.find((x) => x.id === tr.dataset.id), () => drawPredictions(body));
    }));
  }

  // Quiz
  function drawQuiz(body) {
    const rounds = state.data.quiz || [];
    const board = quizBoard(rounds);
    if (!board.length) { body.innerHTML = `<div class="empty panel" style="margin-top:18px">Noch niemand hat das Quiz gespielt.</div>`; return; }
    const all = board.reduce((s, r) => ({ c: s.c + r.correct, a: s.a + r.answered }), { c: 0, a: 0 });
    body.innerHTML = `
      <div class="stats" style="margin-top:18px">
        <div class="stat panel"><span>Spieler</span><b>${board.length}</b></div>
        <div class="stat panel"><span>Runden</span><b>${rounds.length}</b></div>
        <div class="stat panel"><span>Ø Trefferquote</span><b>${pct(all.c, all.a)}</b></div>
        <div class="stat panel"><span>Spitzenreiter</span><b style="font-size:28px;padding-top:6px">${esc(board[0].name)}</b></div>
      </div>
      <div class="panel table-wrap">
        <table class="table">
          <thead><tr><th>Rang</th><th>Gast</th><th>Quote</th><th>Richtig</th><th>Runden</th><th>Zuletzt</th><th></th></tr></thead>
          <tbody>${board.map((r, i) => `
            <tr data-key="${esc(r.key)}">
              <td class="rank">${i + 1}.</td>
              <td>${esc(r.name)}</td>
              <td><i>${pct(r.correct, r.answered)}</i></td>
              <td>${r.correct} / ${r.answered}</td>
              <td>${r.rounds}</td>
              <td style="font-family:var(--sans);font-size:13px;color:var(--muted)">${fmtTime(r.last)}</td>
              <td><button class="icon danger" data-act="del" title="Spieler löschen">${ICON.trash}</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
    $$("tr[data-key]", body).forEach((tr) => $("[data-act=del]", tr).addEventListener("click", async (e) => {
      if (!armed(e.currentTarget)) return;
      const entry = board.find((x) => x.key === tr.dataset.key);
      try {
        for (const id of entry.ids) {
          const row = rounds.find((x) => x.id === id);
          if (row?._local) archive.drop(id); else await api.remove(TABLES.quiz, id);
        }
        state.data.quiz = rounds.filter((x) => !entry.ids.includes(x.id));
        toast("Spieler gelöscht"); drawTabs(); drawQuiz(body);
      } catch (err) { toast(errMsg(err)); }
    }));
  }

  // Sicherung & Downloads
  function drawBackup(body) {
    const total = Object.values(state.data).reduce((s, l) => s + (l?.length || 0), 0);
    const loc = archive.all();
    body.innerHTML = `
      <div class="backup">
        <article class="panel dl">
          <div class="eyebrow">Alles in einer Datei</div>
          <h3 class="display">Excel-Tabelle</h3>
          <p>Gästebuch, Beichten, Predictions und Quiz – je ein Blatt. ${total} Einträge.</p>
          <button class="btn" data-dl="xlsx">Excel herunterladen</button>
        </article>
        <article class="panel dl">
          <div class="eyebrow">Vollständige Sicherung</div>
          <h3 class="display">Backup-Datei</h3>
          <p>Alle Daten aus der Cloud, maschinenlesbar (JSON). Zum Aufbewahren.</p>
          <button class="btn btn--ghost" data-dl="json">Backup herunterladen</button>
        </article>
        <article class="panel dl">
          <div class="eyebrow">Sicherung dieses iPads</div>
          <h3 class="display">iPad-Kopie</h3>
          <p>Jeder Eintrag, der auf diesem iPad gemacht wurde – auch ohne WLAN. ${loc.length} Einträge, davon ${loc.filter((r) => !r.synced).length} noch nicht in der Cloud.</p>
          <button class="btn btn--ghost" data-dl="local">iPad-Kopie herunterladen</button>
        </article>
      </div>
      <p class="anon-note">Tipp: Direkt nach der Party einmal „Excel“ und „Backup“ herunterladen und in „Dateien“ oder per Mail sichern.</p>`;
    $$("[data-dl]", body).forEach((b) => b.addEventListener("click", async () => {
      const kind = b.dataset.dl;
      busy(b, true, "Wird erstellt");
      try {
        if (kind === "xlsx") {
          try { await deliver(await excelBlob(state.data), `daniels-soiree-${stamp()}.xlsx`); }
          catch { await deliver(csvBlob(state.data), `daniels-soiree-${stamp()}.csv`); toast("Excel nicht verfügbar – als CSV gespeichert."); }
        }
        if (kind === "json") {
          const clean = Object.fromEntries(Object.entries(state.data).map(([k, l]) => [k, (l || []).map(({ _local, ...r }) => r)]));
          await deliver(new Blob([JSON.stringify({ event: CONFIG.event.title, exported_at: new Date().toISOString(), data: clean }, null, 2)], { type: "application/json" }), `daniels-soiree-backup-${stamp()}.json`);
        }
        if (kind === "local") {
          await deliver(new Blob([JSON.stringify({ device: "iPad", exported_at: new Date().toISOString(), entries: archive.all() }, null, 2)], { type: "application/json" }), `daniels-soiree-ipad-${stamp()}.json`);
        }
      } catch (err) { toast(errMsg(err)); }
      busy(b, false);
    }));
  }

  $("#a-sound").addEventListener("click", (e) => {
    const on = !soundOn();
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch {}
    e.currentTarget.textContent = on ? "Ton: an" : "Ton: aus";
    if (on) play("pop");
  });
  $("#a-refresh").addEventListener("click", async (e) => { busy(e.currentTarget, true, "Lädt"); await load(); busy(e.currentTarget, false); drawTabs(); drawBody(); });

  $("#a-body").innerHTML = `<div class="empty">Einen Moment …</div>`;
  await load();
  drawTabs(); drawBody();

  const iv = setInterval(async () => {
    if (stageOpen || document.hidden || state.tab === "backup") return;
    const before = JSON.stringify(Object.values(state.data).map((l) => l?.length));
    await load();
    if (JSON.stringify(Object.values(state.data).map((l) => l?.length)) !== before) { drawTabs(); drawBody(); }
  }, 30000);
  onLeave(() => clearInterval(iv));
}

function adminLogin(root) {
  root.innerHTML = `
    <header class="topbar reveal"><a class="back" href="#/"><span>‹</span>Zurück</a><a class="topbar__crab" href="#/"><i class="crab"></i></a><span></span></header>
    <section class="sheet login reveal" style="--d:.08s">
      <div class="eyebrow">Speicher &amp; Ergebnisse</div>
      <h1 class="display sheet__title" style="font-size:clamp(36px,9vw,52px)">Nur für Gastgeber</h1>
      <form class="form" id="l-form">
        ${LIVE ? `<label class="field"><span class="field__label">E-Mail</span><input class="input" type="email" name="email" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>` : `<p class="anon-note" style="margin-top:0">Demo-Modus · Passwort: soiree</p>`}
        <label class="field"><span class="field__label">Passwort</span><input class="input" type="password" name="password" autocomplete="off" required></label>
        <div class="actions"><button class="btn" type="submit">Öffnen</button></div>
      </form>
    </section>`;
  $("#l-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const btn = $("button", e.currentTarget);
    busy(btn, true);
    try { await api.signIn(f.get("email"), f.get("password")); document.activeElement?.blur?.(); render(); }
    catch (err) { busy(btn, false); toast(/invalid/i.test(err.message) ? "E-Mail oder Passwort stimmt nicht." : errMsg(err)); }
  });
}

// Vorschau des Bildschirmschoners: Seite mit ?schoner aufrufen
if (/[?&]schoner\b/.test(location.search)) setTimeout(startSaver, 2500);

// Beim (Neu-)Laden ist niemand als Admin angemeldet
try { sessionStorage.removeItem("soiree:admin"); } catch {}
render();
