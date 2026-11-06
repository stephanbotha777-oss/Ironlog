'use strict';
/* IronLog: offline workout tracker. Everything is stored in localStorage on this device. */

const STORE_KEY = 'ironlog:v1';
const LB = 2.20462;

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const num = (v, d = 0) => { const n = parseFloat(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0) => Math.round(num(v, d));
const pad = n => String(n).padStart(2, '0');
const roundTo = (x, step) => Math.round(x / step) * step;
const fmt = (n, dp = 2) => String(Number((+n).toFixed(dp)));
const mmss = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- defaults: 4-day Upper/Lower for hypertrophy + strength ---------- */
// [id, name, type, loaded, increment in kg]
const EX_DEFAULTS = [
  ['bench', 'Barbell Bench Press', 'compound', true, 2.5],
  ['row', 'Barbell Row', 'compound', true, 2.5],
  ['ohp', 'Overhead Press', 'compound', true, 2.5],
  ['pulldown', 'Lat Pulldown', 'compound', true, 2.5],
  ['bbcurl', 'Barbell Curl', 'isolation', true, 1],
  ['pushdown', 'Triceps Pushdown', 'isolation', true, 2.5],
  ['squat', 'Back Squat', 'compound', true, 5],
  ['rdl', 'Romanian Deadlift', 'compound', true, 5],
  ['legpress', 'Leg Press', 'compound', true, 10],
  ['legcurl', 'Lying Leg Curl', 'isolation', true, 2.5],
  ['calf', 'Standing Calf Raise', 'isolation', true, 5],
  ['hlr', 'Hanging Leg Raise', 'isolation', false, 0],
  ['incdb', 'Incline Dumbbell Press', 'compound', true, 2],
  ['pullup', 'Pull-up (added weight)', 'compound', true, 2.5],
  ['cablerow', 'Seated Cable Row', 'compound', true, 2.5],
  ['lateral', 'Dumbbell Lateral Raise', 'isolation', true, 1],
  ['inccurl', 'Incline Dumbbell Curl', 'isolation', true, 1],
  ['ohtri', 'Overhead Triceps Extension', 'isolation', true, 2.5],
  ['deadlift', 'Deadlift', 'compound', true, 5],
  ['bss', 'Bulgarian Split Squat', 'compound', true, 2],
  ['hipthrust', 'Barbell Hip Thrust', 'compound', true, 5],
  ['legext', 'Leg Extension', 'isolation', true, 2.5],
  ['seatcalf', 'Seated Calf Raise', 'isolation', true, 2.5],
  ['cablecrunch', 'Cable Crunch', 'isolation', true, 2.5],
];
const P = (exId, sets, repMin, repMax) => ({ exId, sets, repMin, repMax });

function defaultState() {
  const exercises = {};
  EX_DEFAULTS.forEach(([id, name, type, loaded, inc]) => { exercises[id] = { id, name, type, loaded, inc }; });
  return {
    v: 1,
    profile: { name: '', goal: 'Hypertrophy & strength', level: 'Intermediate', unit: 'kg' },
    settings: { weeklyTarget: 4, restCompound: 150, restIsolation: 90, autoRest: true, sound: true, vibrate: true, wakeLock: true },
    exercises,
    program: {
      next: 0,
      days: [
        { id: 'ua', name: 'Upper A · Strength', items: [P('bench', 4, 5, 7), P('row', 4, 6, 8), P('ohp', 3, 6, 8), P('pulldown', 3, 8, 10), P('bbcurl', 3, 8, 12), P('pushdown', 3, 10, 12)] },
        { id: 'la', name: 'Lower A · Strength', items: [P('squat', 4, 5, 7), P('rdl', 3, 8, 10), P('legpress', 3, 10, 12), P('legcurl', 3, 10, 12), P('calf', 4, 10, 15), P('hlr', 3, 10, 15)] },
        { id: 'ub', name: 'Upper B · Hypertrophy', items: [P('incdb', 4, 8, 10), P('pullup', 4, 6, 10), P('cablerow', 3, 10, 12), P('lateral', 4, 12, 15), P('inccurl', 3, 10, 12), P('ohtri', 3, 10, 12)] },
        { id: 'lb', name: 'Lower B · Hypertrophy', items: [P('deadlift', 3, 4, 6), P('bss', 3, 8, 10), P('hipthrust', 3, 8, 12), P('legext', 3, 12, 15), P('seatcalf', 3, 12, 15), P('cablecrunch', 3, 12, 15)] },
      ],
    },
    progress: {},   // exId -> { weight (kg), misses, kind }
    sessions: [],   // finished workouts, oldest first
    body: [],       // [{ t, kg }]
    active: null,   // workout in progress
    lastBackup: 0,
  };
}

function load() {
  const d = defaultState();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      ...d, ...s,
      profile: { ...d.profile, ...(s.profile || {}) },
      settings: { ...d.settings, ...(s.settings || {}) },
      program: s.program && Array.isArray(s.program.days) ? s.program : d.program,
      exercises: s.exercises || d.exercises,
      sessions: Array.isArray(s.sessions) ? s.sessions : [],
      body: Array.isArray(s.body) ? s.body : [],
      progress: s.progress || {},
    };
  } catch (e) { return d; }
}

let S = load();
let saveWarned = false;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { if (!saveWarned) { saveWarned = true; toast('Could not save. Storage is full or blocked. Export a backup.'); } }
}

/* ---------- units (all weights stored in kg) ---------- */
const isLb = () => S.profile.unit === 'lbs';
const U = () => S.profile.unit;
const toD = kg => isLb() ? kg * LB : kg;
const fromD = v => isLb() ? v / LB : v;
const showW = kg => fmt(roundTo(toD(kg || 0), isLb() ? 0.5 : 0.25));
const incD = x => isLb() ? Math.max(2.5, roundTo((x.inc || 0) * LB, 2.5)) : (x.inc || 0);
const fmtVol = kg => { const v = toD(kg || 0); return v >= 100000 ? `${fmt(v / 1000, 0)}k` : v >= 10000 ? `${fmt(v / 1000, 1)}k` : Math.round(v).toLocaleString('en-US'); };

/* ---------- data helpers ---------- */
const ex = id => S.exercises[id] || { id, name: '(deleted exercise)', type: 'isolation', loaded: true, inc: 2.5 };
const restFor = x => x.type === 'compound' ? S.settings.restCompound : S.settings.restIsolation;
const e1rm = (w, r) => r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30);
const doneSets = e => e.sets.filter(s => s.done);

function lastEntry(exId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const e = S.sessions[i].entries.find(x => x.exId === exId && x.sets.some(s => s.done));
    if (e) return e;
  }
  return null;
}
const topWeight = e => Math.max(0, ...doneSets(e).map(s => s.w));

function bestScore(exId, loaded) {
  let b = 0;
  S.sessions.forEach(s => s.entries.forEach(e => {
    if (e.exId !== exId) return;
    doneSets(e).forEach(st => { b = Math.max(b, loaded ? e1rm(st.w, st.r) : st.r); });
  }));
  return b;
}

function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function prevWeek(k) { const d = new Date(k); d.setDate(d.getDate() - 7); return weekStart(d.getTime()); }

function weekStats() {
  const ws = weekStart(Date.now());
  const counts = {};
  S.sessions.forEach(s => { const k = weekStart(s.end); counts[k] = (counts[k] || 0) + 1; });
  const T = S.settings.weeklyTarget;
  let streak = 0, k = ws;
  if ((counts[k] || 0) >= T) streak++;            // this week counts once you hit the target
  k = prevWeek(k);
  while ((counts[k] || 0) >= T) { streak++; k = prevWeek(k); }  // an unfinished week doesn't break it
  const thisWeek = S.sessions.filter(s => s.end >= ws);
  return {
    count: thisWeek.length, target: T, streak,
    volume: thisWeek.reduce((n, s) => n + (s.volume || 0), 0),
    total: S.sessions.length,
    trained: new Set(thisWeek.map(s => (new Date(s.end).getDay() + 6) % 7)),
  };
}

/* ---------- workout lifecycle ---------- */
function makeEntry(it) {
  const x = ex(it.exId), prev = lastEntry(it.exId), pr = S.progress[it.exId];
  const loaded = x.loaded !== false;
  const prevW = prev ? topWeight(prev) : 0;
  const w = loaded ? (pr ? pr.weight : prevW) : 0;
  const prevDone = prev ? doneSets(prev) : [];
  const sameW = prev && Math.abs(w - prevW) < 0.01;
  const sets = [];
  for (let i = 0; i < it.sets; i++) {
    const ps = prevDone[i];
    sets.push({ w, r: sameW && ps ? clamp(ps.r, 0, 999) : it.repMin, done: false });
  }
  return { exId: it.exId, repMin: it.repMin, repMax: it.repMax, sets, kind: pr ? pr.kind : null, prev: prevDone.map(s => ({ w: s.w, r: s.r })) };
}

async function startWorkout(dayIdx) {
  const day = S.program.days[dayIdx];
  if (!day) return;
  if (S.active && !(await confirmBox('Replace current workout?', `"${S.active.dayName}" is still in progress. Starting a new one discards it.`, 'Discard & start', true))) return;
  S.active = { id: uid(), dayId: day.id, dayName: day.name, start: Date.now(), entries: day.items.map(makeEntry), timer: null };
  rest = null;
  save();
  unlockAudio();
  keepAwake(true);
  go('workout');
}

function applyProgression(session) {
  session.entries.forEach(e => {
    const x = ex(e.exId);
    if (x.loaded === false) return;
    const done = doneSets(e);
    if (!done.length) return;                 // skipped entirely: leave the plan alone
    const w = Math.max(...done.map(s => s.w));
    const allTop = e.sets.every(s => s.done && s.r >= e.repMax);
    const missed = e.sets.some(s => !s.done || s.r < e.repMin);
    const p = S.progress[e.exId] || { misses: 0 };
    const step = incD(x);
    let next = w, misses = 0, kind = 'hold';
    if (allTop && step > 0) { next = fromD(toD(w) + step); kind = 'up'; }
    else if (missed) {
      misses = (p.misses || 0) + 1;
      if (misses >= 2) { next = fromD(Math.max(0, roundTo(toD(w) * 0.9, step || (isLb() ? 2.5 : 1)))); kind = 'deload'; misses = 0; }
      else kind = 'miss';
    }
    S.progress[e.exId] = { weight: next, misses, kind };
  });
}

function detectPRs(a) {
  const out = [];
  a.entries.forEach(e => {
    const x = ex(e.exId), loaded = x.loaded !== false, done = doneSets(e);
    if (!done.length) return;
    const prev = bestScore(e.exId, loaded);
    if (!prev) return;                         // first time doing it: no PR fanfare
    let best = null, bv = 0;
    done.forEach(s => { const v = loaded ? e1rm(s.w, s.r) : s.r; if (v > bv) { bv = v; best = s; } });
    if (bv > prev + 0.01) out.push(loaded ? `${x.name}: ${showW(best.w)} ${U()} × ${best.r}` : `${x.name}: ${best.r} reps`);
  });
  return out;
}

async function finishWorkout() {
  const a = S.active;
  if (!a) return;
  const total = a.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = a.entries.reduce((n, e) => n + doneSets(e).length, 0);
  if (!done) {
    if (await confirmBox('No sets completed', 'Nothing was ticked off. Discard this workout?', 'Discard', true)) discardWorkout(true);
    return;
  }
  if (done < total && !(await confirmBox('Finish workout?', `${total - done} set(s) aren't ticked off. They'll be logged as missed.`, 'Finish'))) return;

  const prs = detectPRs(a);
  const session = {
    id: a.id, dayId: a.dayId, dayName: a.dayName, start: a.start, end: Date.now(),
    entries: a.entries.map(e => {
      const x = ex(e.exId);
      return { exId: e.exId, name: x.name, loaded: x.loaded !== false, repMin: e.repMin, repMax: e.repMax, sets: e.sets.map(s => ({ w: s.w, r: s.r, done: s.done })) };
    }),
  };
  session.volume = session.entries.reduce((n, e) => n + (e.loaded ? doneSets(e).reduce((m, s) => m + s.w * s.r, 0) : 0), 0);
  applyProgression(session);
  S.sessions.push(session);
  const n = S.program.days.length;
  const idx = S.program.days.findIndex(d => d.id === a.dayId);
  if (n) S.program.next = ((idx >= 0 ? idx : S.program.next) + 1) % n;
  S.active = null;
  rest = null;
  save();
  keepAwake(false);
  go('today');
  showSummary(session, prs, done, total);
}

async function discardWorkout(skipConfirm) {
  if (!S.active) return;
  if (!skipConfirm && !(await confirmBox('Discard workout?', 'Nothing from this session will be saved.', 'Discard', true))) return;
  S.active = null;
  rest = null;
  save();
  keepAwake(false);
  go('today');
}

function showSummary(s, prs, done, total) {
  const mins = Math.max(1, Math.round((s.end - s.start) / 60000));
  modal(`
    <p class="eyebrow">Workout complete</p>
    <h3>${esc(s.dayName)}</h3>
    <div class="stats" style="margin:14px 0">
      <div class="stat"><div class="v num">${mins}<small> min</small></div><div class="l">Duration</div></div>
      <div class="stat"><div class="v num">${done}<small>/${total}</small></div><div class="l">Sets done</div></div>
      <div class="stat"><div class="v num">${fmtVol(s.volume)}<small> ${U()}</small></div><div class="l">Volume</div></div>
      <div class="stat"><div class="v num">${prs.length}</div><div class="l">New records</div></div>
    </div>
    ${prs.length ? `<p style="color:var(--text);font-weight:650;margin-bottom:4px">New personal records</p><ul>${prs.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    <p>Next session's weights have been set from today's reps.</p>
    <button class="btn primary block" data-m="1">Done</button>`);
  $('#modal').onclick = e => { if (e.target.closest('[data-m]') || e.target.id === 'modal') closeModal(); };
}

/* ---------- rest timer ---------- */
let rest = null; // { end, total, label, done }
let actx = null;

function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* audio unsupported */ }
}
function beep() {
  if (!actx) return;
  try {
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + 0.02;
    [0, 0.28, 0.56].forEach((d, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square';
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + (i === 2 ? 0.4 : 0.18));
      o.connect(g).connect(actx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.45);
    });
  } catch (e) { /* ignore */ }
}
function restAlert() {
  if (S.settings.sound) beep();
  if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 450]);
  document.body.classList.remove('flash');
  void document.body.offsetWidth;
  document.body.classList.add('flash');
}
function startRest(sec, label) {
  rest = { end: Date.now() + sec * 1000, total: sec, label, done: false };
  if (S.active) { S.active.timer = rest; save(); }
  drawRest();
}
function stopRest() {
  rest = null;
  if (S.active) { S.active.timer = null; save(); }
  drawRest();
}
function drawRest() {
  const el = $('#rest');
  const elapsed = $('#elapsed');
  if (elapsed && S.active) elapsed.textContent = mmss((Date.now() - S.active.start) / 1000);
  if (!rest) { if (!el.hidden) { el.hidden = true; document.body.classList.remove('resting'); } return; }
  el.hidden = false;
  document.body.classList.add('resting');
  const left = rest.end - Date.now();
  if (left > 0) {
    el.classList.remove('over');
    $('.rest-time', el).textContent = mmss(Math.ceil(left / 1000));
    $('.rest-lbl', el).textContent = rest.label;
    $('.rest-bar i', el).style.width = `${clamp(left / (rest.total * 1000) * 100, 0, 100)}%`;
    return;
  }
  if (!rest.done) {
    rest.done = true;
    if (-left < 30000) restAlert();                         // fresh finish: full alert
    else toast(`Rest finished ${mmss(-left / 1000)} ago`);  // came back to the app late
  }
  el.classList.add('over');
  $('.rest-time', el).textContent = 'GO';
  $('.rest-lbl', el).textContent = 'Rest over · next set';
  $('.rest-bar i', el).style.width = '0%';
  if (-left > 10000) stopRest();
}
setInterval(drawRest, 250);

/* ---------- keep the screen awake during workouts (so the timer keeps running) ---------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && S.settings.wakeLock && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (S.active) keepAwake(true);
    drawRest();
  }
});

/* ---------- toast + modal ---------- */
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2800);
}
function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  const f = $('button', m);
  if (f) f.focus();
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; m.onclick = null; }
function confirmBox(title, msg, ok = 'OK', danger = false) {
  return new Promise(res => {
    modal(`<h3>${esc(title)}</h3><p>${esc(msg)}</p>
      <div class="row end"><button class="btn ghost" data-m="0">Cancel</button>
      <button class="btn ${danger ? 'danger-fill' : 'primary'}" data-m="1">${esc(ok)}</button></div>`);
    $('#modal').onclick = e => {
      const b = e.target.closest('[data-m]');
      if (!b && e.target.id !== 'modal') return;
      closeModal();
      res(!!b && b.dataset.m === '1');
    };
  });
}

/* ---------- views ---------- */
const openKeys = new Set();
document.addEventListener('toggle', e => {
  const k = e.target.dataset && e.target.dataset.key;
  if (k) e.target.open ? openKeys.add(k) : openKeys.delete(k);
}, true);
const op = k => openKeys.has(k) ? ' open' : '';

function planLine(it) {
  const x = ex(it.exId), pr = S.progress[it.exId];
  const w = x.loaded === false ? 'BW' : pr && pr.weight > 0 ? `${showW(pr.weight)} ${U()}` : '';
  return `<li><span>${esc(x.name)}</span><span>${it.sets} × ${it.repMin}–${it.repMax}${w ? ` · ${w}` : ''}</span></li>`;
}

function viewToday() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const st = weekStats();
  const days = S.program.days;
  const nextIdx = clamp(S.program.next || 0, 0, Math.max(0, days.length - 1));
  const day = days[nextIdx];
  let out = `<p class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    <h1>${greet}${S.profile.name ? `, ${esc(S.profile.name)}` : ''}</h1>
    <p class="sub">${esc(S.profile.goal)}</p>`;

  if (!S.profile.name && !S.sessions.length) {
    out += `<div class="card tip"><b>Welcome to IronLog.</b>
      <p class="muted" style="margin:6px 0 12px">A 4-day Upper/Lower plan is loaded. Your first session sets your starting weights. Enter what you lift and the app progresses you from there.</p>
      <button class="btn sm" data-act="tab" data-v="settings">Set name &amp; units</button></div>`;
  }

  if (S.active) {
    const a = S.active, tot = a.entries.reduce((n, e) => n + e.sets.length, 0), dn = a.entries.reduce((n, e) => n + doneSets(e).length, 0);
    out += `<div class="card hero"><p class="eyebrow">In progress</p><h3>${esc(a.dayName)}</h3>
      <p class="muted">${dn} of ${tot} sets done · started ${new Date(a.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      <button class="btn primary block lg" data-act="tab" data-v="workout">Resume workout</button></div>`;
  } else if (day) {
    out += `<div class="card hero"><p class="eyebrow">Up next · Day ${nextIdx + 1} of ${days.length}</p>
      <h3>${esc(day.name)}</h3>
      <ul class="plan">${day.items.map(planLine).join('')}</ul>
      <button class="btn primary block lg" data-act="start" data-d="${nextIdx}">Start workout</button>
      ${days.length > 1 ? `<div class="chips"><span class="muted" style="align-self:center;font-size:13px">Or:</span>${days.map((d, i) => i === nextIdx ? '' : `<button class="chip" data-act="start" data-d="${i}">${esc(d.name)}</button>`).join('')}</div>` : ''}
    </div>`;
  } else {
    out += `<div class="card empty">No workout days yet.<br><br><button class="btn primary" data-act="tab" data-v="settings">Build your program</button></div>`;
  }

  const pct = clamp(st.count / st.target * 100, 0, 100);
  out += `<h2>This week</h2>
  <div class="card">
    <div class="week">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<div class="${st.trained.has(i) ? 'on' : ''} ${i === (new Date().getDay() + 6) % 7 ? 'today' : ''}">${d}<b>${st.trained.has(i) ? '✓' : ''}</b></div>`).join('')}</div>
  </div>
  <div class="stats">
    <div class="card stat"><div class="v">${st.count}<small>/${st.target}</small></div><div class="l">Workouts this week</div><div class="meter"><i style="width:${pct}%"></i></div></div>
    <div class="card stat"><div class="v">${st.streak}<small> wk${st.streak === 1 ? '' : 's'}</small></div><div class="l">Streak (weeks on target)</div></div>
    <div class="card stat"><div class="v">${fmtVol(st.volume)}<small> ${U()}</small></div><div class="l">Volume this week</div></div>
    <div class="card stat"><div class="v">${st.total}</div><div class="l">Workouts completed</div></div>
  </div>`;

  const last = S.sessions[S.sessions.length - 1];
  if (last) {
    const sd = last.entries.reduce((n, e) => n + doneSets(e).length, 0);
    out += `<h2>Last workout</h2><div class="card"><div class="row"><div class="grow"><b>${esc(last.dayName)}</b>
      <div class="kv" style="margin-top:4px"><span>${dayLabel(last.end)}</span><span><b>${sd}</b> sets</span><span><b>${fmtVol(last.volume)}</b> ${U()}</span></div></div>
      <button class="btn sm" data-act="tab" data-v="progress">History</button></div></div>`;
  }

  if (S.sessions.length >= 5 && Date.now() - (S.lastBackup || 0) > 30 * 864e5) {
    out += `<div class="card tip row"><div class="grow"><b>Back up your log</b><div class="muted" style="font-size:13px">Clearing Chrome data deletes it. Takes 2 seconds.</div></div>
      <button class="btn sm" data-act="export">Export</button></div>`;
  }
  return out;
}

function viewWorkout() {
  const a = S.active;
  if (!a) {
    const days = S.program.days;
    return `<h1>Workout</h1><p class="sub">No workout in progress. Pick a day to start.</p>
      ${days.map((d, i) => `<div class="card"><div class="row"><div class="grow"><b>${esc(d.name)}</b>
        <div class="muted" style="font-size:13px">${d.items.length} exercises${i === S.program.next ? ' · up next' : ''}</div></div>
        <button class="btn ${i === S.program.next ? 'primary' : ''}" data-act="start" data-d="${i}">Start</button></div></div>`).join('')
      || `<div class="card empty">No program days. Add one in Settings.</div>`}`;
  }
  const total = a.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = a.entries.reduce((n, e) => n + doneSets(e).length, 0);
  const NOTE = {
    up: x => `Weight up ${fmt(incD(x))} ${U()}. You hit the top of the range on every set last time.`,
    hold: () => 'Same weight. Beat last time by a rep where you can.',
    miss: () => 'Reps were short last time. Repeat this weight.',
    deload: () => 'Deloaded 10% after two tough sessions. Rebuild from here.',
  };

  let out = `<div class="wk-head"><div class="row"><div class="grow"><p class="eyebrow" style="margin:0">Active workout</p>
      <h1 style="font-size:22px;margin:2px 0 0">${esc(a.dayName)}</h1></div>
      <div style="text-align:right"><div class="elapsed" id="elapsed">${mmss((Date.now() - a.start) / 1000)}</div><small class="muted">${done}/${total} sets</small></div></div>
      <div class="meter"><i style="width:${total ? done / total * 100 : 0}%"></i></div></div>`;

  a.entries.forEach((e, i) => {
    const x = ex(e.exId), loaded = x.loaded !== false;
    const note = e.kind && NOTE[e.kind] ? NOTE[e.kind](x) : (!e.prev.length && loaded ? 'First time: pick a weight you could lift for ~2 more reps than the target.' : '');
    out += `<section class="card ex-card">
      <h3>${esc(x.name)}</h3>
      <div class="ex-meta">${e.sets.length} × ${e.repMin}–${e.repMax} reps · rest ${mmss(restFor(x))}</div>
      ${note ? `<div class="note ${e.kind === 'miss' || e.kind === 'deload' ? 'warn' : ''}">${esc(note)}</div>` : ''}
      <div class="set-h"><span>Set</span><span>Prev</span><span>${loaded ? U() : ''}</span><span>Reps</span><span></span></div>
      ${e.sets.map((s, j) => {
        const pv = e.prev[j];
        const cls = s.done ? (s.r < e.repMin ? 'miss' : 'done') : '';
        return `<div class="set ${cls}" data-e="${i}" data-s="${j}">
          <span class="sn">${j + 1}</span>
          <span class="pv">${pv ? (loaded ? `${showW(pv.w)}×${pv.r}` : `${pv.r}`) : '—'}</span>
          ${loaded ? `<input class="in" data-f="w" type="text" inputmode="decimal" enterkeyhint="next" value="${showW(s.w)}" aria-label="Set ${j + 1} weight in ${U()}">` : '<span class="bw">BW</span>'}
          <input class="in" data-f="r" type="text" inputmode="numeric" enterkeyhint="done" value="${s.r}" aria-label="Set ${j + 1} reps">
          <button class="chk" data-act="check" aria-pressed="${s.done}" aria-label="Mark set ${j + 1} complete">${ICON_CHECK}</button>
        </div>`;
      }).join('')}
      <div class="ex-actions">
        <button class="btn sm" data-act="addset" data-e="${i}">+ Set</button>
        <button class="btn sm" data-act="delset" data-e="${i}" ${e.sets.length <= 1 ? 'disabled' : ''}>− Set</button>
        <button class="btn sm" data-act="restnow" data-e="${i}">Rest</button>
        <span class="grow"></span>
        <button class="btn sm ghost" data-act="rmex" data-e="${i}" aria-label="Remove ${esc(x.name)}">Remove</button>
      </div>
    </section>`;
  });

  out += `<div class="card"><div class="field"><span>Add an exercise to this session</span>
      <div class="row"><select class="in grow" id="addExSel" style="text-align:left;font-size:16px">${exOptions()}</select>
      <button class="btn" data-act="addex">Add</button></div></div></div>
    <button class="btn primary block lg" data-act="finish">Finish workout</button>
    <div style="height:10px"></div>
    <button class="btn danger block" data-act="discard">Discard workout</button>`;
  return out;
}

function exOptions(sel) {
  return Object.values(S.exercises).sort((a, b) => a.name.localeCompare(b.name))
    .map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
}

let progTab = 'history';
let historyLimit = 30;
function viewProgress() {
  const seg = ['history', 'records', 'body'].map(t => `<button data-act="ptab" data-t="${t}" aria-pressed="${progTab === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  const body = progTab === 'records' ? viewRecords() : progTab === 'body' ? viewBody() : viewHistory();
  return `<h1>Progress</h1><div class="seg" style="margin:12px 0 16px">${seg}</div>${body}`;
}

function viewHistory() {
  if (!S.sessions.length) return `<div class="card empty">No workouts logged yet.<br>Finish your first session and it will show up here.</div>`;
  const list = S.sessions.slice().reverse();
  return list.slice(0, historyLimit).map(s => {
    const all = s.entries.reduce((n, e) => n + e.sets.length, 0);
    const dn = s.entries.reduce((n, e) => n + doneSets(e).length, 0);
    const miss = s.entries.reduce((n, e) => n + e.sets.filter(x => !x.done || x.r < e.repMin).length, 0);
    const mins = Math.max(1, Math.round((s.end - s.start) / 60000));
    return `<details class="card" data-key="s-${esc(s.id)}"${op('s-' + s.id)}>
      <summary><div class="grow"><span class="nm">${esc(s.dayName)}</span>
        <small>${dayLabel(s.end)} · ${mins} min · ${dn}/${all} sets${miss ? ` · ${miss} missed` : ''} · ${fmtVol(s.volume)} ${U()}</small></div></summary>
      <div class="body">
        ${s.entries.map(e => `<div style="font-weight:650;font-size:15px">${esc(ex(e.exId).name !== '(deleted exercise)' ? ex(e.exId).name : e.name)}</div>
          <div class="sets">${e.sets.map(x => `<span class="${!x.done ? 'skip' : x.r < e.repMin ? 'miss' : ''}">${e.loaded ? `${showW(x.w)}×` : ''}${x.r}</span>`).join('')}</div>`).join('')}
        <button class="btn sm danger" data-act="sessdel" data-id="${esc(s.id)}">Delete workout</button>
      </div></details>`;
  }).join('') + (list.length > historyLimit ? `<button class="btn block" data-act="more">Show older workouts</button>` : '');
}

function spark(vals, w = 110, h = 36) {
  const v = vals.slice(-12);
  if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1;
  const pts = v.map((y, i) => [2 + i / (v.length - 1) * (w - 6), h - 4 - (y - mn) / rg * (h - 8)]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="var(--accent)"/></svg>`;
}

function viewRecords() {
  const map = {};
  S.sessions.forEach(s => s.entries.forEach(e => {
    const done = doneSets(e);
    if (!done.length) return;
    const m = map[e.exId] || (map[e.exId] = { exId: e.exId, name: S.exercises[e.exId] ? S.exercises[e.exId].name : e.name, loaded: e.loaded !== false, bestE: 0, best: null, maxW: 0, maxR: 0, series: [], last: 0 });
    let sb = 0;
    done.forEach(x => {
      if (m.loaded) { const v = e1rm(x.w, x.r); if (v > m.bestE) { m.bestE = v; m.best = x; } m.maxW = Math.max(m.maxW, x.w); sb = Math.max(sb, v); }
      else { m.maxR = Math.max(m.maxR, x.r); sb = Math.max(sb, x.r); }
    });
    m.series.push(sb);
    m.last = s.end;
  }));
  const rows = Object.values(map).sort((a, b) => b.last - a.last);
  if (!rows.length) return `<div class="card empty">Personal records appear after your first workout.</div>`;
  return `<p class="sub" style="font-size:13px">e1RM = estimated one-rep max (Epley). The chart shows your best set per session.</p>` + rows.map(m => `
    <div class="card rec"><div class="grow">
      <div>${esc(m.name)}</div>
      ${m.loaded
        ? `<div class="kv"><span>Best <b>${showW(m.best.w)}×${m.best.r}</b></span><span>e1RM <b>${showW(m.bestE)}</b></span><span>Top <b>${showW(m.maxW)}</b> ${U()}</span></div>`
        : `<div class="kv"><span>Best <b>${m.maxR}</b> reps</span></div>`}
    </div>${spark(m.series)}</div>`).join('');
}

function lineChart(pts) {
  const W = 340, H = 160, L = 40, R = 10, T = 12, B = 24;
  const xs = pts.map(p => p.t), ys = pts.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const yr = (y1 - y0) || 1, lo = y0 - yr * 0.15, hi = y1 + yr * 0.15;
  const X = t => L + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Body weight trend">
    ${grid.map(g => `<line x1="${L}" x2="${W - R}" y1="${Y(g).toFixed(1)}" y2="${Y(g).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 6}" y="${(Y(g) + 4).toFixed(1)}" text-anchor="end">${fmt(g, 1)}</text>`).join('')}
    <polyline points="${pts.map(p => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.length <= 40 ? pts.map(p => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3" fill="var(--accent)"/>`).join('') : ''}
    <text x="${L}" y="${H - 6}">${esc(new Date(x0).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(new Date(x1).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</text>
  </svg>`;
}

function viewBody() {
  const pts = S.body.slice().sort((a, b) => a.t - b.t);
  const last = pts[pts.length - 1];
  const today = localISO();
  let out = `<div class="card form">
    <div class="grid2">
      <label class="field"><span>Body weight (${U()})</span><input id="bwIn" type="text" inputmode="decimal" placeholder="${last ? showW(last.kg) : ''}"></label>
      <label class="field"><span>Date</span><input id="bwDate" type="date" value="${today}" max="${today}"></label>
    </div>
    <button class="btn primary block" data-act="bodysave">Save weigh-in</button>
  </div>`;
  if (pts.length >= 2) {
    const first = pts[0], diff = toD(last.kg) - toD(first.kg);
    out += `<div class="card"><div class="kv" style="margin-bottom:8px"><span>Latest <b>${showW(last.kg)} ${U()}</b></span><span>Change <b>${diff >= 0 ? '+' : ''}${fmt(diff, 1)} ${U()}</b></span></div>
      ${lineChart(pts.slice(-60).map(p => ({ t: p.t, v: toD(p.kg) })))}</div>`;
  }
  if (pts.length) {
    out += `<div class="card">${pts.slice().reverse().slice(0, 30).map(p => `<div class="list-item"><span>${dayLabel(p.t)}</span>
      <span class="row"><b class="num">${showW(p.kg)} ${U()}</b><button class="btn icon ghost" data-act="bodydel" data-t="${p.t}" aria-label="Delete entry">×</button></span></div>`).join('')}</div>`;
  } else out += `<div class="card empty">Log a weigh-in to start your trend line.</div>`;
  return out;
}

const REST_OPTS = [45, 60, 75, 90, 120, 150, 180, 210, 240, 300];
const restSelect = key => `<select data-bind="settings.${key}" data-type="int">${REST_OPTS.map(s => `<option value="${s}" ${S.settings[key] === s ? 'selected' : ''}>${mmss(s)}</option>`).join('')}</select>`;
const toggle = (key, label, hint) => `<label class="toggle"><span>${label}${hint ? `<br><small class="muted">${hint}</small>` : ''}</span><input type="checkbox" data-bind="settings.${key}" ${S.settings[key] ? 'checked' : ''}></label>`;

function viewSettings() {
  const st = S.settings, days = S.program.days;
  let out = `<h1>Settings</h1>
  <h2>Profile</h2>
  <div class="card form">
    <label class="field"><span>Name</span><input data-bind="profile.name" value="${esc(S.profile.name)}" placeholder="Your name" autocomplete="given-name"></label>
    <label class="field"><span>Goal</span><input data-bind="profile.goal" value="${esc(S.profile.goal)}"></label>
    <label class="field"><span>Experience</span><select data-bind="profile.level">${['Beginner', 'Intermediate', 'Advanced'].map(l => `<option ${S.profile.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="field"><span>Units</span><div class="seg">
      <button data-act="unit" data-u="kg" aria-pressed="${!isLb()}">Kilograms (kg)</button>
      <button data-act="unit" data-u="lbs" aria-pressed="${isLb()}">Pounds (lbs)</button></div></div>
  </div>

  <h2>Training</h2>
  <div class="card form">
    <div class="toggle"><span>Weekly target<br><small class="muted">Drives your week streak</small></span>
      <div class="stepper"><button class="btn icon" data-act="target" data-d="-1" aria-label="Fewer">−</button><b>${st.weeklyTarget}</b><button class="btn icon" data-act="target" data-d="1" aria-label="More">+</button></div></div>
    <div class="grid2">
      <label class="field"><span>Rest · compound</span>${restSelect('restCompound')}</label>
      <label class="field"><span>Rest · isolation</span>${restSelect('restIsolation')}</label>
    </div>
    ${toggle('autoRest', 'Auto-start rest timer', 'Starts when you tick off a set')}
    ${toggle('sound', 'Beep when rest ends')}
    ${toggle('vibrate', 'Vibrate when rest ends')}
    ${toggle('wakeLock', 'Keep screen on during workouts', 'So the timer and alert keep running')}
    <button class="btn block" data-act="testalert">Test alert</button>
  </div>

  <h2>Program</h2>
  <p class="sub" style="font-size:14px">Days rotate in order. Train whenever you like and the next day comes up automatically.</p>
  ${days.length ? `<div class="card"><label class="field"><span>Next workout</span><select data-ch="next">${days.map((d, i) => `<option value="${i}" ${i === S.program.next ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label></div>` : ''}
  ${days.map((d, di) => `<details class="card" data-key="d-${esc(d.id)}"${op('d-' + d.id)}>
    <summary><div class="grow"><span class="nm">${esc(d.name)}</span><small>${d.items.length} exercises</small></div></summary>
    <div class="body">
      <label class="field" style="margin-bottom:12px"><span>Day name</span><input data-ch="dayName" data-d="${di}" value="${esc(d.name)}"></label>
      ${d.items.map((it, ii) => `<div class="pitem">
        <div class="pitem-h"><b>${esc(ex(it.exId).name)}</b><div class="mini">
          <button class="btn icon" data-act="pmove" data-d="${di}" data-i="${ii}" data-dir="-1" aria-label="Move up" ${ii === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn icon" data-act="pmove" data-d="${di}" data-i="${ii}" data-dir="1" aria-label="Move down" ${ii === d.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn icon danger" data-act="pdel" data-d="${di}" data-i="${ii}" aria-label="Remove">×</button></div></div>
        <div class="grid3">
          <label class="field"><span>Sets</span><input data-ch="pi" data-k="sets" data-d="${di}" data-i="${ii}" inputmode="numeric" value="${it.sets}"></label>
          <label class="field"><span>Min reps</span><input data-ch="pi" data-k="repMin" data-d="${di}" data-i="${ii}" inputmode="numeric" value="${it.repMin}"></label>
          <label class="field"><span>Max reps</span><input data-ch="pi" data-k="repMax" data-d="${di}" data-i="${ii}" inputmode="numeric" value="${it.repMax}"></label>
        </div></div>`).join('')}
      <div class="row" style="margin:12px 0"><select class="in grow" id="padd-${di}" style="text-align:left;font-size:16px">${exOptions()}</select>
        <button class="btn" data-act="padd" data-d="${di}">Add</button></div>
      <button class="btn sm danger" data-act="pdelday" data-d="${di}">Delete this day</button>
    </div></details>`).join('')}
  <button class="btn block" data-act="paddday">+ Add workout day</button>

  <h2>Exercise library</h2>
  <div class="card form">
    <label class="field"><span>New custom exercise</span><input id="newExName" placeholder="e.g. Cable Fly"></label>
    <div class="grid2">
      <label class="field"><span>Type</span><select id="newExType"><option value="compound">Compound</option><option value="isolation" selected>Isolation</option></select></label>
      <label class="field"><span>Load</span><select id="newExLoaded"><option value="1">Weighted</option><option value="0">Bodyweight only</option></select></label>
    </div>
    <button class="btn primary block" data-act="exadd">Add exercise</button>
  </div>
  ${Object.values(S.exercises).sort((a, b) => a.name.localeCompare(b.name)).map(x => {
    const pr = S.progress[x.id], loaded = x.loaded !== false;
    return `<details class="card" data-key="x-${esc(x.id)}"${op('x-' + x.id)}>
    <summary><div class="grow"><span class="nm">${esc(x.name)}</span><small>${x.type === 'compound' ? 'Compound' : 'Isolation'}${loaded ? ` · +${fmt(incD(x))} ${U()} steps${pr && pr.weight ? ` · next ${showW(pr.weight)} ${U()}` : ''}` : ' · bodyweight'}</small></div></summary>
    <div class="body form">
      <label class="field"><span>Name</span><input data-ch="exName" data-id="${esc(x.id)}" value="${esc(x.name)}"></label>
      <div class="grid2">
        <label class="field"><span>Type</span><select data-ch="exType" data-id="${esc(x.id)}"><option value="compound" ${x.type === 'compound' ? 'selected' : ''}>Compound</option><option value="isolation" ${x.type !== 'compound' ? 'selected' : ''}>Isolation</option></select></label>
        <label class="field"><span>Load</span><select data-ch="exLoaded" data-id="${esc(x.id)}"><option value="1" ${loaded ? 'selected' : ''}>Weighted</option><option value="0" ${!loaded ? 'selected' : ''}>Bodyweight only</option></select></label>
      </div>
      ${loaded ? `<div class="grid2">
        <label class="field"><span>Increase step (${U()})</span><input data-ch="exInc" data-id="${esc(x.id)}" inputmode="decimal" value="${fmt(incD(x))}"></label>
        <label class="field"><span>Next weight (${U()})</span><input data-ch="exW" data-id="${esc(x.id)}" inputmode="decimal" value="${pr ? showW(pr.weight) : ''}" placeholder="auto"></label>
      </div>` : ''}
      <button class="btn sm danger" data-act="exdel" data-id="${esc(x.id)}">Delete exercise</button>
    </div></details>`;
  }).join('')}

  <h2>Your data</h2>
  <div class="card form">
    <p class="muted" style="font-size:14px;margin:0">Everything is stored only on this phone. Export a backup now and then. It saves a small .json file to Downloads.</p>
    <div class="grid2"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>
    ${installPrompt ? '<button class="btn primary block" data-act="install">Install app on this phone</button>' : ''}
    <button class="btn danger block" data-act="reset">Reset everything</button>
  </div>
  <p class="foot">IronLog 1.0 · works offline · ${S.sessions.length} workouts stored</p>`;
  return out;
}

/* ---------- render + navigation ---------- */
let view = 'today';
const VIEWS = { today: viewToday, workout: viewWorkout, progress: viewProgress, settings: viewSettings };

function render() {
  const y = window.scrollY;
  $('#view').innerHTML = VIEWS[view]();
  $$('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.v === view ? 'page' : 'false'));
  $('#tabs [data-v="workout"]').classList.toggle('live', !!S.active);
  window.scrollTo(0, y);
  drawRest();
}
function go(v, push = true) {
  if (!VIEWS[v]) v = 'today';
  if (push && v !== view) history.pushState({ v }, '', '#' + v);
  view = v;
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { const v = location.hash.slice(1); view = VIEWS[v] ? v : 'today'; render(); window.scrollTo(0, 0); });

/* ---------- actions ---------- */
const act = el => el.dataset;
const entryOf = el => S.active && S.active.entries[+act(el).e];

const ACT = {
  tab: el => go(act(el).v),
  start: el => startWorkout(+act(el).d),
  finish: () => finishWorkout(),
  discard: () => discardWorkout(),

  check: el => {
    const row = el.closest('.set'), a = S.active;
    if (!row || !a) return;
    const e = a.entries[+row.dataset.e], s = e.sets[+row.dataset.s];
    const rIn = $('[data-f="r"]', row), wIn = $('[data-f="w"]', row);
    s.r = Math.max(0, int(rIn.value, s.r));
    if (wIn) s.w = Math.max(0, fromD(num(wIn.value, toD(s.w))));
    s.done = !s.done;
    if (s.done) {
      unlockAudio();
      if (S.settings.vibrate && navigator.vibrate) navigator.vibrate(25);
      const remaining = a.entries.some(en => en.sets.some(x => !x.done));
      const x = ex(e.exId);
      if (S.settings.autoRest && remaining) startRest(restFor(x), `${x.name} · set ${+row.dataset.s + 1} done`);
      if (!remaining) { stopRest(); toast('All sets done. Tap Finish workout.'); }
    }
    save();
    render();
  },
  addset: el => {
    const e = entryOf(el); if (!e) return;
    const l = e.sets[e.sets.length - 1] || { w: 0, r: e.repMin };
    e.sets.push({ w: l.w, r: l.r, done: false });
    save(); render();
  },
  delset: el => { const e = entryOf(el); if (e && e.sets.length > 1) { e.sets.pop(); save(); render(); } },
  restnow: el => { const e = entryOf(el); if (e) { unlockAudio(); const x = ex(e.exId); startRest(restFor(x), `${x.name} · rest`); } },
  rmex: async el => {
    const e = entryOf(el); if (!e) return;
    if (doneSets(e).length && !(await confirmBox('Remove exercise?', `${ex(e.exId).name} has completed sets. Remove it from this session?`, 'Remove', true))) return;
    S.active.entries.splice(+act(el).e, 1);
    save(); render();
  },
  addex: () => {
    const id = $('#addExSel').value;
    if (!S.active || !S.exercises[id]) return;
    S.active.entries.push(makeEntry({ exId: id, sets: 3, repMin: 8, repMax: 12 }));
    save(); render();
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50);
  },

  'rest-adj': el => {
    if (!rest) return;
    const d = +act(el).d * 1000;
    rest.end = Math.max(Date.now() + 1000, rest.end + d);
    rest.total = Math.max(rest.total, Math.ceil((rest.end - Date.now()) / 1000));
    rest.done = false;
    if (S.active) { S.active.timer = rest; save(); }
    drawRest();
  },
  'rest-skip': () => stopRest(),

  ptab: el => { progTab = act(el).t; render(); },
  more: () => { historyLimit += 30; render(); },
  sessdel: async el => {
    if (!(await confirmBox('Delete workout?', 'This removes it from your history and records. Next weights stay as they are.', 'Delete', true))) return;
    S.sessions = S.sessions.filter(s => s.id !== act(el).id);
    save(); render();
  },
  bodysave: () => {
    const kg = fromD(num($('#bwIn').value, 0));
    const date = $('#bwDate').value || localISO();
    if (!(kg > 0)) { toast('Enter your weight first'); return; }
    const t = new Date(date + 'T12:00:00').getTime();
    S.body = S.body.filter(b => localISO(new Date(b.t)) !== date);
    S.body.push({ t, kg });
    S.body.sort((a, b) => a.t - b.t);
    save(); render(); toast('Weigh-in saved');
  },
  bodydel: el => { S.body = S.body.filter(b => b.t !== +act(el).t); save(); render(); },

  unit: el => { S.profile.unit = act(el).u; save(); render(); toast(`Showing weights in ${U()}`); },
  target: el => { S.settings.weeklyTarget = clamp(S.settings.weeklyTarget + +act(el).d, 1, 7); save(); render(); },
  testalert: () => { unlockAudio(); setTimeout(restAlert, 60); },

  pmove: el => {
    const d = S.program.days[+act(el).d], i = +act(el).i, j = i + +act(el).dir;
    if (!d || j < 0 || j >= d.items.length) return;
    [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
    save(); render();
  },
  pdel: el => { const d = S.program.days[+act(el).d]; if (d) { d.items.splice(+act(el).i, 1); save(); render(); } },
  padd: el => {
    const di = +act(el).d, d = S.program.days[di], id = $(`#padd-${di}`).value;
    if (!d || !S.exercises[id]) return;
    const comp = S.exercises[id].type === 'compound';
    d.items.push(comp ? P(id, 3, 6, 10) : P(id, 3, 10, 15));
    save(); render(); toast(`Added ${S.exercises[id].name}`);
  },
  pdelday: async el => {
    const di = +act(el).d, d = S.program.days[di];
    if (!d || !(await confirmBox('Delete day?', `Remove "${d.name}" from your program? History is kept.`, 'Delete', true))) return;
    S.program.days.splice(di, 1);
    S.program.next = S.program.days.length ? S.program.next % S.program.days.length : 0;
    save(); render();
  },
  paddday: () => {
    const id = uid();
    S.program.days.push({ id, name: `Day ${S.program.days.length + 1}`, items: [] });
    openKeys.add('d-' + id);
    save(); render();
  },

  exadd: () => {
    const name = $('#newExName').value.trim();
    if (!name) { toast('Give the exercise a name'); return; }
    const id = 'c-' + uid();
    const loaded = $('#newExLoaded').value === '1';
    const type = $('#newExType').value;
    S.exercises[id] = { id, name, type, loaded, inc: loaded ? (type === 'compound' ? 2.5 : 1) : 0 };
    save(); render(); toast(`${name} added to your library`);
  },
  exdel: async el => {
    const id = act(el).id, x = S.exercises[id];
    if (!x) return;
    const used = S.program.days.filter(d => d.items.some(i => i.exId === id)).length;
    if (!(await confirmBox('Delete exercise?', `${x.name} will be removed from the library${used ? ` and from ${used} program day(s)` : ''}. Past workouts keep it.`, 'Delete', true))) return;
    S.program.days.forEach(d => { d.items = d.items.filter(i => i.exId !== id); });
    delete S.exercises[id];
    delete S.progress[id];
    save(); render();
  },

  export: () => {
    S.lastBackup = Date.now();
    save();
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ironlog-backup-${localISO()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Backup saved to Downloads');
    if (view === 'today') render();
  },
  import: () => $('#importFile').click(),
  reset: async () => {
    if (!(await confirmBox('Reset everything?', 'This deletes all workouts, records and settings on this phone. Export a backup first if you want to keep them.', 'Delete all', true))) return;
    localStorage.removeItem(STORE_KEY);
    S = defaultState();
    rest = null;
    save(); keepAwake(false); go('today');
    toast('App reset');
  },
  install: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el);
});

/* inputs inside the logger: update state without re-rendering (keeps focus and keyboard) */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('.set [data-f="r"]') && S.active) {
    const row = t.closest('.set');
    const s = S.active.entries[+row.dataset.e].sets[+row.dataset.s];
    s.r = Math.max(0, int(t.value, s.r));
    save();
  }
});

function setPath(path, val) {
  const keys = path.split('.');
  let o = S;
  keys.slice(0, -1).forEach(k => { o = o[k]; });
  o[keys[keys.length - 1]] = val;
}

const CH = {
  next: t => { S.program.next = +t.value; },
  dayName: t => { const d = S.program.days[+t.dataset.d]; if (d) { d.name = t.value.trim() || 'Workout'; const nm = $('summary .nm', t.closest('details')); if (nm) nm.textContent = d.name; } },
  pi: t => {
    const d = S.program.days[+t.dataset.d], it = d && d.items[+t.dataset.i];
    if (!it) return;
    const k = t.dataset.k;
    it[k] = clamp(int(t.value, it[k]), 1, k === 'sets' ? 12 : 100);
    if (k === 'repMin' && it.repMax < it.repMin) it.repMax = it.repMin;
    if (k === 'repMax' && it.repMin > it.repMax) it.repMin = it.repMax;
    const box = t.closest('.grid3');
    ['sets', 'repMin', 'repMax'].forEach(kk => { const inp = $(`[data-k="${kk}"]`, box); if (inp && inp !== document.activeElement) inp.value = it[kk]; });
    t.value = it[k];
  },
  exName: t => { const x = S.exercises[t.dataset.id]; if (x) { x.name = t.value.trim() || x.name; t.value = x.name; const nm = $('summary .nm', t.closest('details')); if (nm) nm.textContent = x.name; } },
  exType: t => { const x = S.exercises[t.dataset.id]; if (x) x.type = t.value; },
  exLoaded: t => { const x = S.exercises[t.dataset.id]; if (x) { x.loaded = t.value === '1'; if (x.loaded && !x.inc) x.inc = 2.5; setTimeout(render, 0); } },
  exInc: t => { const x = S.exercises[t.dataset.id]; if (x) { x.inc = Math.max(0, fromD(num(t.value, incD(x)))); t.value = fmt(incD(x)); } },
  exW: t => {
    const id = t.dataset.id;
    if (t.value.trim() === '') { delete S.progress[id]; return; }
    S.progress[id] = { weight: Math.max(0, fromD(num(t.value, 0))), misses: 0, kind: null };
    t.value = showW(S.progress[id].weight);
  },
};

document.addEventListener('change', e => {
  const t = e.target;
  // Logger weight: update this set and carry the new weight to later, unticked sets that matched it
  if (t.matches('.set [data-f="w"]') && S.active) {
    const row = t.closest('.set'), ei = +row.dataset.e, si = +row.dataset.s;
    const en = S.active.entries[ei], s = en.sets[si], old = s.w;
    s.w = Math.max(0, fromD(num(t.value, toD(old))));
    t.value = showW(s.w);
    en.sets.forEach((o, k) => {
      if (k > si && !o.done && Math.abs(o.w - old) < 0.01) {
        o.w = s.w;
        const inp = $(`.set[data-e="${ei}"][data-s="${k}"] [data-f="w"]`);
        if (inp) inp.value = showW(o.w);
      }
    });
    save();
    return;
  }
  if (t.id === 'importFile') { if (t.files[0]) importData(t.files[0]); t.value = ''; return; }
  if (t.dataset.bind) {
    const v = t.type === 'checkbox' ? t.checked : t.dataset.type === 'int' ? int(t.value) : t.value;
    setPath(t.dataset.bind, v);
    save();
    if (t.dataset.bind === 'settings.wakeLock' && S.active) keepAwake(!!v);
    return;
  }
  const h = CH[t.dataset.ch];
  if (h) { h(t); save(); }
});

/* Enter on the weight field jumps to reps; Enter on reps closes the keyboard */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (t.matches('.set [data-f="w"]')) { e.preventDefault(); const r = $('[data-f="r"]', t.closest('.set')); if (r) { r.focus(); r.select(); } }
  else if (t.matches('.set [data-f="r"], .field input')) { e.preventDefault(); t.blur(); }
});
document.addEventListener('focusin', e => { if (e.target.matches('.set .in')) setTimeout(() => e.target.select(), 0); });

async function importData(file) {
  try {
    const s = JSON.parse(await file.text());
    if (!s || typeof s !== 'object' || !s.exercises || !Array.isArray(s.sessions)) throw new Error('bad');
    if (!(await confirmBox('Restore backup?', `Replace everything on this phone with the backup (${s.sessions.length} workouts)?`, 'Restore'))) return;
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
    S = load();
    S.sessions.sort((a, b) => a.end - b.end);
    rest = S.active && S.active.timer ? S.active.timer : null;
    save();
    render();
    toast('Backup restored');
  } catch (err) {
    toast("That file isn't a valid IronLog backup");
  }
}

/* ---------- install + offline ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (view === 'settings') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('IronLog installed'); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- boot ---------- */
(function boot() {
  if (S.active && S.active.timer) rest = S.active.timer;
  const v = location.hash.slice(1);
  view = VIEWS[v] ? v : (S.active ? 'workout' : 'today');
  history.replaceState({ v: view }, '', '#' + view);
  render();
  if (S.active) keepAwake(true);
})();
