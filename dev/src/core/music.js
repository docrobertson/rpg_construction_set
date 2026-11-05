// The soundtrack: little chiptune songs played live with WebAudio, a theme
// for each kind of place (the tunes are in songs.js). A pulse-wave lead with
// a touch of vibrato and echo, a triangle bass, pulse arpeggios, noise drums
// and a soft pad; the second time round a second voice sings a third or so
// below the tune. No sound files.
import { getPref, setPref } from './storage.js';
import { audioUnlocked, whenAudioUnlocked } from './sound.js';
import { SONGS, BAR, parseSong } from './songs.js';

let ctx = null;
let master = null;
let out = null; // the song now playing (each song has its own, faded out when the next begins)
let echoIn = null;
let noiseBuf = null;
const waves = {};
let enabled = getPref('music', true);
let current = null;
let timer = null;

function audio() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // white noise for the drums
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// A song's own output, with a soft echo the lead and the drips are sent through
function songBus(beat, gain = 1) {
  const bus = ctx.createGain();
  bus.gain.value = gain; // (some tunes are sparser, and want a touch more)
  bus.connect(master);
  echoIn = ctx.createGain();
  const delay = ctx.createDelay(1);
  const fb = ctx.createGain(), tone = ctx.createBiquadFilter(), wet = ctx.createGain();
  delay.delayTime.value = Math.min(0.9, beat * 0.75); // a dotted quaver
  fb.gain.value = 0.32;
  tone.type = 'lowpass'; tone.frequency.value = 2200;
  wet.gain.value = 0.55;
  echoIn.connect(delay).connect(tone).connect(fb).connect(delay);
  tone.connect(wet).connect(bus);
  return bus;
}

// pulse waves of a given duty (the narrow ones sound thin and bright, like
// the old sound chips), built once
function pulse(duty) {
  if (waves[duty]) return waves[duty];
  const n = 40, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return (waves[duty] = ctx.createPeriodicWave(re, im));
}

function osc(kind) {
  const o = ctx.createOscillator();
  if (kind === 'pulse25') o.setPeriodicWave(pulse(0.25));
  else if (kind === 'pulse12') o.setPeriodicWave(pulse(0.125));
  else if (kind === 'pulse50') o.type = 'square';
  else if (kind === 'tri') o.type = 'triangle';
  else o.type = kind;
  return o;
}

// one note: attack, a little decay to sustain, release at the end; long
// notes get a gentle vibrato once they have settled
function note(t, midi, dur, o) {
  const v = osc(o.wave);
  const g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = o.cut || 3000;
  v.frequency.setValueAtTime(freq(midi), t);
  const vol = o.vol, rel = Math.min(0.12, dur * 0.4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(vol * (o.sustain ?? 0.7), t + 0.08);
  g.gain.setValueAtTime(vol * (o.sustain ?? 0.7), t + Math.max(0.09, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (o.vibrato && dur > 0.35) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(o.vibrato, t + 0.3);
    lfo.connect(depth).connect(v.detune);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  v.connect(f).connect(g).connect(out);
  if (o.echo) { const s = ctx.createGain(); s.gain.value = o.echo; g.connect(s).connect(echoIn); }
  v.start(t);
  v.stop(t + dur + 0.05);
}

function pad(t, midis, dur, vol) {
  for (const midi of midis) for (const det of [-6, 6]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq(midi);
    o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

function drum(t, kind, vol = 1) {
  if (kind === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.18 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.2);
    return;
  }
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = noiseBuf;
  const hat = kind === 'hat' || kind === 'shaker';
  f.type = hat ? 'highpass' : 'bandpass';
  f.frequency.value = hat ? (kind === 'shaker' ? 5200 : 7500) : 1800;
  const len = kind === 'hat' ? 0.035 : kind === 'shaker' ? 0.06 : 0.12;
  g.gain.setValueAtTime((kind === 'snare' ? 0.11 : kind === 'shaker' ? 0.025 : 0.035) * vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random() * 0.5); n.stop(t + len + 0.02);
  if (kind === 'snare') {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 190;
    og.gain.setValueAtTime(0.06 * vol, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.09);
  }
}

// a chord's notes near a pitch: tones (from the root) placed at or above `low`
function chordNotes(chord, low, count = 3) {
  const out = [];
  for (let m = low; out.length < count && m < low + 24; m++) if (chord.tones.includes((m - chord.root + 120) % 12)) out.push(m);
  return out;
}
const rootNear = (chord, low) => { let m = low; while ((m - chord.root + 120) % 12) m++; return m; };

// The second voice: the nearest note of the chord a third to a sixth below
function under(chord, midi) {
  for (let d = 3; d <= 9; d++) if (chord.tones.includes((midi - d - chord.root + 120) % 12)) return midi - d;
  return null;
}

// Everything that sounds in one bar, scheduled from its start time
function playBar(song, bar, t0, step, pass, last) {
  const c = bar.chord;
  const lead = { wave: song.lead, cut: song.leadCut, vol: song.lead === 'tri' ? 0.11 : 0.055, vibrato: 14, echo: song.echo };
  for (const n of bar.notes) {
    note(t0 + n.at * step, n.midi, n.len * step * 0.95, lead);
    // every other time round, a second voice below the tune
    if (pass % 2 === 1) { const h = under(c, n.midi); if (h != null) note(t0 + n.at * step, h, n.len * step * 0.9, { wave: 'pulse12', cut: 2400, vol: 0.026, vibrato: 8 }); }
  }
  // bass
  const R = rootNear(c, 38), F = R + 7 - (R + 7 > 52 ? 12 : 0);
  const bass = (at, m, len, vol = 0.12) => note(t0 + at * step, m, len * step, { wave: 'tri', cut: 900, vol, sustain: 0.8 });
  switch (song.bass) {
    case 'roots': bass(0, R, 8); bass(8, F, 8, 0.1); break;
    case 'pedal': bass(0, R - (R > 40 ? 12 : 0), 16, 0.13); break;
    case 'walk': {
      // root, fifth, and a step leading into the next bar's root
      const next = last.chord, N = rootNear(next, 38);
      bass(0, R, 4); bass(4, F, 4, 0.1); bass(8, R + 12 > 55 ? R : R + 12, 4, 0.1); bass(12, N + (N > R ? -1 : 1), 4, 0.09);
      break;
    }
    case 'bounce': bass(0, R, 3); bass(8, F, 3, 0.1); break;
    case 'drive': for (let s = 0; s < BAR; s += 2) bass(s, s % 8 === 6 ? R + 12 : R, 1.6, s % 4 ? 0.09 : 0.12); break;
    default: break;
  }
  // harmony underneath
  const tri = chordNotes(c, 55, 3);
  const pluck = (at, m, len, vol) => note(t0 + at * step, m, len * step, { wave: 'pulse12', cut: 2600, vol, sustain: 0.4 });
  switch (song.arp) {
    case 'broken': [0, 4, 8, 12].forEach((s, i) => pluck(s, [tri[0], tri[1], tri[2], tri[1]][i], 3.6, 0.022)); break;
    case 'eighths': for (let s = 0; s < BAR; s += 2) pluck(s, tri[[0, 1, 2, 1][(s / 2) % 4]], 1.6, 0.018); break;
    case 'sixteenths': for (let s = 0; s < BAR; s++) pluck(s, chordNotes(c, 64, 3)[[0, 1, 2, 1][s % 4]], 0.9, 0.014); break;
    case 'oompah': for (const s of [4, 12]) for (const m of tri) pluck(s, m, 2.5, 0.016); break;
    case 'drips': {
      // a few high, ringing drops of the chord, never quite in time
      const hi = chordNotes(c, 76, 3);
      for (const [s, k] of [[2, 0], [7, 2], [11, 1]]) {
        if ((pass + s) % 3 === 0) continue;
        note(t0 + (s + Math.random() * 0.6) * step, hi[k], 2.5 * step, { wave: 'sine', cut: 4000, vol: 0.03, sustain: 0.3, echo: 0.6 });
      }
      break;
    }
    default: break;
  }
  if (song.pad) pad(t0, chordNotes(c, 50, 3), BAR * step, song.pad);
  // drums
  const hit = (s, k, v) => drum(t0 + s * step, k, v);
  switch (song.drums) {
    case 'full':
      for (const s of [0, 8]) hit(s, 'kick');
      hit(10, 'kick', 0.6);
      for (const s of [4, 12]) hit(s, 'snare');
      for (let s = 0; s < BAR; s += 2) hit(s, 'hat', s % 4 ? 0.7 : 1);
      if (last.fill) { hit(14, 'snare', 0.7); hit(15, 'snare', 0.9); }
      break;
    case 'light':
      hit(0, 'kick', 0.7); hit(8, 'kick', 0.6);
      for (const s of [4, 12]) hit(s, 'hat');
      break;
    case 'soft': for (const s of [2, 6, 10, 14]) hit(s, 'shaker'); break;
    case 'heart': hit(0, 'kick', 0.45); hit(3, 'kick', 0.3); break;
    default: break;
  }
}

function start(mood) {
  const song = SONGS[mood] || SONGS.world;
  let bars;
  try { bars = parseSong(song); } catch (e) { console.error(e); return; }
  const step = 60 / song.bpm / 4;
  out = songBus(step * 4, song.gain);
  let i = 0;
  let next = ctx.currentTime + 0.15;
  const tick = () => {
    // schedule a bar or so ahead, so nothing stutters behind a busy frame
    while (next < ctx.currentTime + 0.6) {
      const b = i % bars.length, pass = Math.floor(i / bars.length);
      const after = bars[(b + 1) % bars.length];
      // a drum fill into each half
      playBar(song, bars[b], next, step, pass, { chord: after.chord, fill: b % 8 === 7 });
      next += BAR * step;
      i++;
    }
  };
  tick();
  timer = setInterval(tick, 150);
}

let pending = false;
export function playMusic(mood) {
  if (current === mood && timer) return;
  current = mood;
  stopTimer();
  if (!enabled || !mood) return;
  // before the first click: remember the mood and start it on that click
  if (!audioUnlocked()) {
    if (!pending) {
      pending = true;
      whenAudioUnlocked(() => { pending = false; const m = current; current = null; if (m) playMusic(m); });
    }
    return;
  }
  if (!audio()) return;
  if (ctx.state === 'suspended') {
    // browsers only allow audio after a user gesture; try again on the next one
    const resume = () => { ctx.resume(); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }
  start(mood);
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
  // what was already scheduled fades away rather than playing on into the next song
  if (out && ctx) {
    const old = out;
    old.gain.setValueAtTime(old.gain.value, ctx.currentTime);
    old.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, 600);
  }
  out = null;
}

export function stopMusic() {
  current = null;
  stopTimer();
}

export function musicEnabled() { return enabled; }

export function setMusicEnabled(on) {
  enabled = on;
  setPref('music', on);
  const mood = current;
  current = null;
  stopTimer();
  if (on && mood) playMusic(mood);
  else current = mood;
}

// Render a few seconds of a mood's song without playing it (for tests, and
// to check the mix): resolves to an AudioBuffer
export async function renderSong(mood, seconds = 8, rate = 22050) {
  const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!C) return null;
  const saved = { ctx, master, out, echoIn, noiseBuf, waves: { ...waves } };
  for (const k of Object.keys(waves)) delete waves[k];
  try {
    ctx = new C(1, Math.ceil(seconds * rate), rate);
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, rate, rate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const song = SONGS[mood] || SONGS.world;
    const bars = parseSong(song);
    const step = 60 / song.bpm / 4;
    out = songBus(step * 4, song.gain);
    for (let i = 0, t = 0.05; t < seconds; i++, t += BAR * step) {
      const b = i % bars.length;
      playBar(song, bars[b], t, step, Math.floor(i / bars.length), { chord: bars[(b + 1) % bars.length].chord, fill: b % 8 === 7 });
    }
    return await ctx.startRendering();
  } finally {
    ({ ctx, master, out, echoIn, noiseBuf } = saved);
    for (const k of Object.keys(waves)) delete waves[k];
    Object.assign(waves, saved.waves);
  }
}

if (typeof window !== 'undefined') window.__music = { renderSong, SONGS };
