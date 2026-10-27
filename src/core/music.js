// A tiny procedural soundtrack: plucked melodies over a soft drone, with a
// mood per kind of place. Generated on the fly with WebAudio — no files.
import { getPref, setPref } from './storage.js';
import { mulberry32 } from './rng.js';

const MOODS = {
  world: { root: 50, scale: [0, 2, 4, 7, 9], bpm: 84, density: 0.62, wave: 'triangle', seed: 11 },
  town: { root: 55, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 104, density: 0.72, wave: 'triangle', seed: 23 },
  dungeon: { root: 45, scale: [0, 2, 3, 7, 8], bpm: 60, density: 0.35, wave: 'sine', seed: 37 },
  combat: { root: 47, scale: [0, 3, 5, 7, 10], bpm: 138, density: 0.85, wave: 'square', seed: 41 },
  title: { root: 52, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 72, density: 0.55, wave: 'triangle', seed: 5 },
};

let ctx = null;
let master = null;
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
  }
  return ctx;
}

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function pluck(t, midi, dur, wave, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = wave === 'square' ? 1400 : 2600;
  o.type = wave;
  o.frequency.setValueAtTime(freq(midi), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function pad(t, midi, dur, vol) {
  for (const det of [-4, 4]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq(midi);
    o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// Build a looping 4-bar phrase for a mood
function compose(m) {
  const r = mulberry32(m.seed);
  const steps = 32;
  const notes = [];
  let deg = 2;
  for (let i = 0; i < steps; i++) {
    if (r() > m.density && i % 8 !== 0) { notes.push(null); continue; }
    deg += Math.floor(r() * 5) - 2;
    deg = Math.max(0, Math.min(m.scale.length * 2 - 1, deg));
    const oct = Math.floor(deg / m.scale.length);
    notes.push(m.root + 12 + m.scale[deg % m.scale.length] + oct * 12);
  }
  // each bar ends on a chord tone
  for (let b = 7; b < steps; b += 8) notes[b] = m.root + 12 + m.scale[[0, 2, 4][(b >> 3) % 3] % m.scale.length];
  const bass = [0, 0, m.scale[3 % m.scale.length], m.scale[4 % m.scale.length]].map((d) => m.root - 12 + d);
  return { notes, bass };
}

function start(mood) {
  const m = MOODS[mood] || MOODS.world;
  const song = compose(m);
  const step = 60 / m.bpm / 2;
  let i = 0;
  let next = ctx.currentTime + 0.1;
  let variation = 0;
  const tick = () => {
    while (next < ctx.currentTime + 0.4) {
      const s = i % song.notes.length;
      if (s === 0) variation++;
      let n = song.notes[s];
      // occasional variation keeps the loop from feeling mechanical
      if (n != null && variation % 3 === 2 && s % 4 === 2) n += m.scale[1];
      if (n != null) pluck(next, n, step * (mood === 'dungeon' ? 3 : 1.8), m.wave, mood === 'combat' ? 0.05 : 0.07);
      if (s % 8 === 0) {
        const b = song.bass[(s >> 3) % song.bass.length];
        pad(next, b, step * 8, mood === 'dungeon' ? 0.05 : 0.04);
        if (mood === 'combat') pluck(next, b + 12, step * 0.8, 'sawtooth', 0.03);
      }
      if (mood === 'combat' && s % 2 === 0) pluck(next, song.bass[(s >> 3) % song.bass.length], step * 0.5, 'square', 0.02);
      next += step;
      i++;
    }
  };
  tick();
  timer = setInterval(tick, 120);
}

export function playMusic(mood) {
  if (current === mood && timer) return;
  current = mood;
  stopTimer();
  if (!enabled || !mood) return;
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
