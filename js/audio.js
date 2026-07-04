// Audio: synthesized with Web Audio API — no asset files needed.
// The original uses a muted robotic voice for "ready / steady / bang",
// a dry gunshot, and sparse western ambience. We approximate all of it
// procedurally so the clone is fully self-contained.

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

// Unlock audio on first user gesture (mobile requirement).
export function unlock() { ac(); }

// --- The voice ---------------------------------------------------------
// A flat, lo-fi robotic voice. Prefer SpeechSynthesis (matches the
// original's deadpan robot delivery); fall back to nothing (words are
// always shown on screen anyway).
function speak(word, { rate = 0.95, pitch = 0.55, volume = 0.9 } = {}) {
  if (muted) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(word);
    u.rate = rate;
    u.pitch = pitch;   // low pitch = deadpan robot
    u.volume = volume;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /en[-_](US|GB)/i.test(v.lang) && /male|daniel|alex|david/i.test(v.name))
      || voices.find(v => /^en/i.test(v.lang));
    if (preferred) u.voice = preferred;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* voice is optional */ }
}

export function sayReady()  { speak('ready'); }
export function saySteady() { speak('steady'); }
export function sayBang()   { speak('bang', { rate: 1.1, volume: 1 }); }

// --- SFX ----------------------------------------------------------------

// Dry, punchy gunshot: noise burst through a fast lowpass sweep + thump.
export function gunshot() {
  if (muted) return;
  const c = ac();
  const t = c.currentTime;

  // Crack: white noise burst
  const len = Math.floor(c.sampleRate * 0.22);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(9000, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.9, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  noise.connect(lp).connect(ng).connect(c.destination);
  noise.start(t);

  // Thump: sine drop
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
  const og = c.createGain();
  og.gain.setValueAtTime(0.7, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}

// Ricochet whine for a false start (you fired into nothing).
export function ricochet() {
  if (muted) return;
  const c = ac();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(2400, t);
  osc.frequency.exponentialRampToValueAtTime(500, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 4;
  osc.connect(bp).connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.55);
}

// Dull body-hits-the-dirt thud.
export function thud() {
  if (muted) return;
  const c = ac();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.13);
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.18);
  // a little dirt scatter
  const len = Math.floor(c.sampleRate * 0.08);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.3;
  const n = c.createBufferSource();
  n.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 700;
  n.connect(lp).connect(c.destination);
  n.start(t + 0.01);
}

// Soft UI tick for menu taps.
export function tick() {
  if (muted) return;
  const c = ac();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.07);
}

// Two-note lonely whistle for the title screen.
export function whistle() {
  if (muted) return;
  const c = ac();
  const t = c.currentTime;
  const notes = [[1175, 0, 0.35], [880, 0.4, 0.6]];
  for (const [freq, at, dur] of notes) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + at);
    osc.frequency.linearRampToValueAtTime(freq * 0.97, t + at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(0.08, t + at + 0.05);
    g.gain.linearRampToValueAtTime(0, t + at + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t + at);
    osc.stop(t + at + dur + 0.02);
  }
}
