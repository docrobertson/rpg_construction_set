// Tiny synthesised sound effects (no audio files needed).
import { getPref, setPref } from './storage.js';

let ctx = null;
let muted = getPref('muted', false);

// Browsers refuse (and warn about) audio before the first click or key press,
// so no AudioContext is made until then; whatever wanted sound waits for it.
let unlocked = typeof navigator !== 'undefined' && !!navigator.userActivation?.hasBeenActive;
const waiting = [];
function unlock() {
  if (unlocked) return;
  unlocked = true;
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
  for (const fn of waiting.splice(0)) { try { fn(); } catch { /* audio unavailable */ } }
}
if (typeof window !== 'undefined' && !unlocked) {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
export const audioUnlocked = () => unlocked;
// run fn once the player has clicked or pressed a key (now, if they have)
export function whenAudioUnlocked(fn) { if (unlocked) fn(); else waiting.push(fn); }

function ac() {
  if (!unlocked) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'square', vol = 0.06, slide = 0, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.08, freq = 1200, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

const SFX = {
  step: () => noise(0.04, 0.025, 600),
  bump: () => tone(90, 0.08, 'square', 0.05),
  hit: () => { noise(0.12, 0.12, 1800); tone(160, 0.1, 'square', 0.04, -80); },
  miss: () => noise(0.1, 0.04, 3000),
  shoot: () => { tone(330, 0.09, 'triangle', 0.05, -180); noise(0.12, 0.03, 4000); },
  crit: () => { noise(0.18, 0.16, 2500); tone(260, 0.15, 'sawtooth', 0.05, -150); },
  hurt: () => tone(200, 0.15, 'sawtooth', 0.06, -120),
  die: () => { tone(220, 0.4, 'sawtooth', 0.06, -180); noise(0.3, 0.05, 500); },
  spell: () => { tone(440, 0.25, 'sine', 0.06, 440); tone(660, 0.3, 'triangle', 0.04, 220, 0.05); },
  fire: () => { noise(0.4, 0.12, 900); tone(120, 0.3, 'sawtooth', 0.04, -60); },
  heal: () => { tone(523, 0.12, 'sine', 0.05); tone(659, 0.12, 'sine', 0.05, 0, 0.1); tone(784, 0.2, 'sine', 0.05, 0, 0.2); },
  gold: () => { tone(988, 0.08, 'square', 0.04); tone(1319, 0.15, 'square', 0.04, 0, 0.07); },
  door: () => { tone(110, 0.15, 'triangle', 0.06, 40); noise(0.1, 0.04, 400); },
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.045, 0, i * 0.11)),
  victory: () => [392, 523, 659, 784, 659, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.06, 0, i * 0.13)),
  defeat: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.06, 0, i * 0.25)),
  encounter: () => { tone(196, 0.15, 'square', 0.05); tone(185, 0.3, 'square', 0.05, 0, 0.15); },
  click: () => tone(880, 0.03, 'square', 0.025),
  error: () => tone(130, 0.15, 'square', 0.05, -40),
  portal: () => { tone(300, 0.5, 'sine', 0.05, 600); tone(450, 0.5, 'sine', 0.03, 900, 0.1); },
  splash: () => noise(0.25, 0.06, 1200),
  // (puzzles) levers, plates, gates, runes and braziers
  lever: () => { tone(140, 0.08, 'square', 0.05, -40); noise(0.08, 0.06, 900, 0.04); tone(70, 0.18, 'triangle', 0.07, -20, 0.1); },
  plate: () => { tone(90, 0.14, 'triangle', 0.08, -30); noise(0.12, 0.07, 500); tone(180, 0.05, 'square', 0.03, 0, 0.12); },
  plateUp: () => { tone(120, 0.08, 'triangle', 0.05, 30); noise(0.06, 0.04, 700); },
  gateOpen: () => { for (let i = 0; i < 6; i++) { tone(70 + i * 6, 0.12, 'sawtooth', 0.025, 10, i * 0.09); noise(0.08, 0.04, 1600, i * 0.09); } tone(55, 0.6, 'triangle', 0.06, 20); },
  gateShut: () => { tone(160, 0.1, 'sawtooth', 0.04, -100); noise(0.3, 0.12, 600, 0.05); tone(50, 0.4, 'triangle', 0.08, -10, 0.06); },
  rumble: () => { noise(0.7, 0.1, 260); tone(45, 0.7, 'triangle', 0.07, -10); },
  wrong: () => { tone(220, 0.18, 'sawtooth', 0.05, -90); tone(165, 0.3, 'sawtooth', 0.05, -60, 0.14); },
  solved: () => [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, 0.5, 'sine', 0.045, 0, i * 0.09); tone(f * 2, 0.3, 'sine', 0.012, 0, i * 0.09 + 0.02); }),
  chime: () => { tone(1568, 0.5, 'sine', 0.035); tone(2093, 0.4, 'sine', 0.015, 0, 0.03); },
  ignite: () => { noise(0.5, 0.1, 1400); tone(90, 0.4, 'sawtooth', 0.03, 60); noise(0.3, 0.05, 3000, 0.15); },
  // runes: a rising scale, so a sequence is heard as it is walked
  ...Object.fromEntries([523, 587, 659, 784, 880, 1047, 1175, 1319].map((f, i) => ['rune' + (i + 1), () => { tone(f, 0.55, 'sine', 0.05); tone(f * 1.5, 0.4, 'sine', 0.018, 0, 0.02); tone(f / 2, 0.3, 'triangle', 0.02); }])),
};

export function sfx(name) {
  if (muted) return;
  try { SFX[name] && SFX[name](); } catch { /* audio unavailable */ }
}

export function isMuted() { return muted; }
export function setMuted(m) { muted = m; setPref('muted', m); }
