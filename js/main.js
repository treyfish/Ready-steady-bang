import { TIMING, OPPONENTS, DEATHS, DANCES, KILLS_TO_BEAT, OPPONENT_RAMP, RANK_TABLE } from './data.js';
import { drawCowboy, defaultPose } from './cowboy.js';
import { DEATH_ANIMS, drawProp } from './deaths.js';
import * as audio from './audio.js';

// --- Persistence ---------------------------------------------------------

const SAVE_KEY = 'rsb-save-v1';

function freshSave() {
  return {
    unlocked: 1,               // highest opponent available (1-10)
    beaten: [],                // opponent ids beaten
    deaths: [],                // unlocked death ids, in unlock order
    kills: 0,
    wins: 0, losses: 0, falseStarts: 0,
    fastest: null,             // best reaction ms
    timeSum: 0, timeCount: 0,  // for average
    muted: false,
  };
}

let save = (() => {
  try { return { ...freshSave(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; }
  catch { return freshSave(); }
})();

function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } }

// --- DOM helpers ----------------------------------------------------------

const $ = sel => document.querySelector(sel);
const screens = document.querySelectorAll('.screen');
let activeScreen = 'screen-title';

function show(id) {
  activeScreen = id;
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-select') buildSelect();
  if (id === 'screen-gallery') buildGallery();
  if (id === 'screen-stats') buildStats();
  if (id === 'screen-title') titleStart();
}

function recordTime(ms) {
  if (save.fastest === null || ms < save.fastest) save.fastest = ms;
  save.timeSum += ms; save.timeCount++;
}

function rankFor(ms) { return RANK_TABLE.find(r => ms <= r.max).label; }

// --- Canvas / scene -------------------------------------------------------

const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

// The scene: two cowboys + fx, drawn each frame while a duel or replay runs.
const freshSide = (look = null) => ({
  pose: defaultPose(), fx: [], death: null, deathStart: 0,
  walk: null, dance: null, flourish: 0, afraid: 0, fired: false,
  smoke: 0, hit: 0, look, seed: Math.random() * 7,
});

const scene = {
  left: freshSide(),
  right: freshSide(),
  flash: 0,          // full-screen white flash 0..1
  shake: 0,          // screen shake intensity
  tension: false,    // hands hovering over holsters (ready/steady)
  running: false,
};

function resetScene() {
  scene.left = freshSide();
  scene.right = freshSide();
  scene.flash = 0;
  scene.shake = 0;
  scene.tension = false;
}

// The duel is portrait like the original: your cowboy stands at the
// bottom of the screen, the opponent hangs mirrored from the top —
// two reflected worlds, each player owning their half.
function figureMetrics() {
  const h = Math.min(W * 0.42, H * 0.24, 200);
  return {
    h,
    cx: W * 0.5,
    botY: H * 0.875,   // bottom cowboy's ground line
    topY: H * 0.125,   // top cowboy's (mirrored) ground line
  };
}

// Puppet updater — works for any side object (duel scene or title diorama).
function updatePuppet(s, now, tension) {
  s.fx = [];

  // walk-in: proper little step cycle — feet alternate, body bobs
  if (s.walk) {
    const t = Math.min(1, (now - s.walk.start) / s.walk.dur);
    s.pose.x = s.walk.from * (1 - t);
    const step = t * 7; // ~7 strides
    s.pose.footF = Math.sin(step * Math.PI * 2) * 9;
    s.pose.footB = -Math.sin(step * Math.PI * 2) * 9;
    s.pose.y = -Math.abs(Math.sin(step * Math.PI * 2)) * 2.2;
    s.pose.lean = 0.05;
    s.pose.hatRot = Math.sin(step * Math.PI * 2) * 0.05;
    if (t >= 1) {
      s.walk = null;
      s.pose.x = 0; s.pose.y = 0; s.pose.footF = 0; s.pose.footB = 0;
      s.pose.lean = 0; s.pose.hatRot = 0;
    }
  } else if (!s.death && !s.dance) {
    // idle life: slow breathing, and during ready/steady the gun hand
    // hovers over the holster with a nervous tremor. Look quirks feed in:
    // Sloe Jim slouches, Bill sways on his feet.
    const slouch = (s.look && s.look.slouch) || 0;
    const sway = s.look && s.look.sway ? Math.sin(now / 650 + s.seed) * 0.05 : 0;
    s.pose.breathe = (Math.sin(now / 900 + s.seed) + 1) * 1.1;
    if (!s.fired && !s.flourish) {
      if (tension) {
        s.pose.armGun = 0.42 + Math.sin(now / 55 + s.seed) * 0.018;
        s.pose.lean = 0.045 + slouch + sway;
        s.pose.kneel = 0.08;
      } else {
        s.pose.armGun = 0.55;
        s.pose.lean = slouch + sway;
        s.pose.kneel = 0;
      }
    }
  }

  // scared stiff: he shot his bolt and now trembles, waiting for it
  if (s.afraid && now >= s.afraid && !s.death) {
    s.pose.x = Math.sin(now / 24) * 1.6;
    s.pose.kneel = 0.16;
    s.pose.headTilt = Math.sin(now / 30) * 0.06;
    s.pose.armGun = 0.7;
  }

  // round-win flourish: spin the pistol once and drop it back in leather
  if (s.flourish && !s.dance) {
    const t = (now - s.flourish) / 1000;
    if (t < 0) {
      // still savouring the moment
    } else if (t < 1) {
      s.pose.gunDrawn = true;
      s.pose.armGun = -t * Math.PI * 2 * 1.5;      // one and a half showy turns
    } else {
      s.pose.armGun = 0.55;
      s.pose.gunDrawn = false;
      s.flourish = 0;
      s.fired = false;
    }
  }

  // hit reaction: a sharp jolt backwards the instant the bullet lands
  if (s.hit) {
    const u = (now - s.hit) / 160;
    if (u < 1) s.pose.x = -10 * Math.sin(Math.min(1, u) * Math.PI);
    else s.hit = 0;
  }

  // victory dances — the winner's little celebration, one of several
  if (s.dance) {
    const t = (now - s.dance.start) / 1000;
    switch (s.dance.id) {
      case 'gun-twirl': // pistol spun in flashy circles, then blown out & holstered
        s.pose.gunDrawn = true;
        if (t < 1.3) s.pose.armGun = -t * Math.PI * 2 * 2.3;
        else if (t < 1.8) { s.pose.armGun = -0.9; }          // blow the smoke away
        else { s.pose.armGun = 0.55; s.pose.gunDrawn = false; }
        s.pose.y = -Math.abs(Math.sin(t * 5)) * 4;
        break;
      case 'heel-click': // two sideways heel-click jumps
        {
          const hop = Math.abs(Math.sin(t * 4.2));
          s.pose.y = -hop * 24;
          s.pose.footF = hop * 13;
          s.pose.footB = -hop * 13;
          s.pose.legSplit = 0.16 + hop * 0.12;
          s.pose.rot = Math.sin(t * 4.2) * 0.09;
          s.pose.armOff = 0.5 - hop * 1.2;
        }
        break;
      case 'jig': // happy little tap-dance in place
        s.pose.footF = Math.sin(t * 22) * 7;
        s.pose.footB = -Math.sin(t * 22) * 7;
        s.pose.y = -Math.abs(Math.sin(t * 22)) * 2.5;
        s.pose.lean = Math.sin(t * 11) * 0.06;
        s.pose.headTilt = Math.sin(t * 11 + 1) * 0.1;
        break;
      case 'bow': // sweeps the hat off into a deep stage bow
        {
          const down = Math.sin(Math.min(1, t / 0.8) * Math.PI); // bow and rise
          s.pose.lean = 0.55 * down;
          s.pose.armGun = 0.55 - 1.6 * down;
          s.pose.hatY = down * 10;
          s.pose.hatRot = down * 1.4;
          s.pose.headTilt = 0.3 * down;
          if (t > 1.6) { s.pose.lean = 0; }
        }
        break;
      default: // 'hat-wave': hopping with the hat riding high
        s.pose.gunDrawn = true;
        s.pose.y = -Math.abs(Math.sin(t * 7)) * 11;
        s.pose.armGun = -1.15 + Math.sin(t * 14) * 0.3;
        s.pose.rot = Math.sin(t * 7) * 0.05;
        s.pose.hatY = -6 - Math.abs(Math.sin(t * 7)) * 9;
        s.pose.hatRot = Math.sin(t * 9) * 0.25;
    }
  }

  // muzzle smoke drifting up after a shot
  if (s.smoke) {
    const u = (now - s.smoke) / 1100;
    if (u < 1) {
      for (let i = 0; i < 3; i++) {
        const p = Math.max(0, u - i * 0.12);
        if (p > 0) s.fx.push({
          type: 'smoke',
          x: 41 + Math.sin(now / 300 + i * 2) * 3 + p * 6,
          y: -76 - p * 30 - i * 4,
          r: 3.5 + p * 8 + i * 1.5,
          alpha: Math.max(0, 1 - p * 1.4),
        });
      }
    } else s.smoke = 0;
  }

  // death animation (drawn last so it owns the pose)
  if (s.death) {
    const anim = DEATH_ANIMS[s.death];
    const t = Math.min(1, (now - s.deathStart) / anim.dur);
    anim.update(t, s.pose, s.fx);
  }
}

function render(now) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (scene.shake > 0.02) {
    ctx.translate((Math.random() - 0.5) * 9 * scene.shake, (Math.random() - 0.5) * 7 * scene.shake);
    scene.shake *= 0.86;
  }
  const m = figureMetrics();
  const sc = m.h / 100;

  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); // your ground line, along the bottom
  ctx.moveTo(W * 0.08, m.botY + 1);
  ctx.lineTo(W * 0.92, m.botY + 1);
  ctx.stroke();
  ctx.beginPath(); // the mirrored world's ground line, along the top
  ctx.moveTo(W * 0.08, m.topY - 1);
  ctx.lineTo(W * 0.92, m.topY - 1);
  ctx.stroke();

  updatePuppet(scene.left, now, scene.tension);
  updatePuppet(scene.right, now, scene.tension);

  // bottom cowboy: you / player 1
  {
    const s = scene.left;
    if (s.pose.clipGround) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, m.botY + 2); ctx.clip();
    }
    drawCowboy(ctx, m.cx, m.botY, m.h, 1, s.pose, s.look || {});
    ctx.save();
    ctx.translate(m.cx, m.botY);
    ctx.scale(sc, sc);
    for (const p of s.fx) drawProp(ctx, p);
    ctx.restore();
    if (s.pose.clipGround) ctx.restore();
  }

  // top cowboy: opponent / player 2, reflected across the centre
  {
    const s = scene.right;
    ctx.save();
    if (s.pose.clipGround) {
      ctx.beginPath(); ctx.rect(0, m.topY - 2, W, H); ctx.clip();
    }
    ctx.translate(m.cx, m.topY);
    ctx.scale(1, -1);
    drawCowboy(ctx, 0, 0, m.h, 1, s.pose, s.look || {});
    ctx.save();
    ctx.scale(sc, sc);
    for (const p of s.fx) drawProp(ctx, p);
    ctx.restore();
    ctx.restore();
  }

  ctx.restore(); // shake

  if (scene.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${scene.flash})`;
    ctx.fillRect(0, 0, W, H);
    scene.flash = Math.max(0, scene.flash - 0.08);
  }
}

function loop(now) {
  if (!scene.running) return;
  render(now);
  duel?.tick(now);
  requestAnimationFrame(loop);
}

function startLoop() {
  if (!scene.running) {
    scene.running = true;
    resize();
    requestAnimationFrame(loop);
  }
}
function stopLoop() { scene.running = false; }

// --- Title diorama ---------------------------------------------------------
// The menu isn't a static picture: the two little cowboys live up there,
// endlessly duelling. Every few seconds one of them draws; the loser gets
// a random death from the full catalogue, dusts himself off, walks back in.

const tCanvas = $('#title-canvas');
const tctx = tCanvas ? tCanvas.getContext('2d') : null;
const tScene = {
  left: freshSide(), right: freshSide(),
  phase: 'idle', at: 0, victim: null, running: false, tension: false,
};

function titleStart() {
  if (!tctx || tScene.running) return;
  tScene.running = true;
  tScene.left = freshSide();
  tScene.right = freshSide();
  const now = performance.now();
  tScene.left.walk = { start: now, dur: 1200, from: -170 };
  tScene.right.walk = { start: now, dur: 1200, from: 170 };
  tScene.phase = 'idle';
  tScene.at = now + 2600 + Math.random() * 2400;
  requestAnimationFrame(titleLoop);
}

function titleLoop(now) {
  if (activeScreen !== 'screen-title') { tScene.running = false; return; }

  // keep backing store in sync with layout size
  const cw = tCanvas.clientWidth, ch = tCanvas.clientHeight;
  if (tCanvas.width !== cw * DPR || tCanvas.height !== ch * DPR) {
    tCanvas.width = cw * DPR; tCanvas.height = ch * DPR;
  }
  tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  tctx.clearRect(0, 0, cw, ch);

  // silent little duels on a loop
  if (tScene.phase === 'idle' && now >= tScene.at) {
    tScene.phase = 'tense';
    tScene.tension = true;
    tScene.at = now + 700 + Math.random() * 1300;
  } else if (tScene.phase === 'tense' && now >= tScene.at) {
    tScene.tension = false;
    const shooterLeft = Math.random() < 0.5;
    const shooter = shooterLeft ? tScene.left : tScene.right;
    const victim = shooterLeft ? tScene.right : tScene.left;
    fireArm(shooter, now);
    setTimeout(() => {
      victim.death = DEATHS[Math.floor(Math.random() * DEATHS.length)].id;
      victim.deathStart = performance.now();
    }, 200);
    tScene.victim = shooterLeft ? 'right' : 'left';
    tScene.phase = 'shot';
    tScene.at = now + 3400;
  } else if (tScene.phase === 'shot' && now >= tScene.at) {
    // loser dusts himself off and walks back in; shooter reholsters
    const vSide = tScene.victim;
    tScene[vSide] = freshSide();
    tScene[vSide].walk = { start: now, dur: 1200, from: vSide === 'left' ? -170 : 170 };
    const shooter = tScene[vSide === 'left' ? 'right' : 'left'];
    shooter.fired = false;
    shooter.pose.armGun = 0.55;
    tScene.phase = 'idle';
    tScene.at = now + 2800 + Math.random() * 2600;
  }

  updatePuppet(tScene.left, now, tScene.tension);
  updatePuppet(tScene.right, now, tScene.tension);

  const groundY = ch * 0.82;
  const h = ch * 0.52;
  tctx.strokeStyle = '#1c1c1c';
  tctx.lineWidth = 1.2;
  tctx.beginPath();
  tctx.moveTo(cw * 0.05, groundY + 1);
  tctx.lineTo(cw * 0.95, groundY + 1);
  tctx.stroke();

  for (const [side, x, facing] of [['left', cw * 0.3, 1], ['right', cw * 0.7, -1]]) {
    const s = tScene[side];
    const sc = h / 100;
    drawCowboy(tctx, x, groundY, h, facing, s.pose);
    tctx.save();
    tctx.translate(x, groundY);
    tctx.scale(facing * sc, sc);
    for (const p of s.fx) drawProp(tctx, p);
    tctx.restore();
  }

  requestAnimationFrame(titleLoop);
}

// --- Word / caption overlay ----------------------------------------------

const wordEl = $('#duel-word');
const word2El = $('#duel-word2'); // upside-down copy for face-to-face 2P
const capEl = $('#duel-caption');
const timesEl = $('#duel-times');
const scoreEl = $('#duel-score');

function setWord(txt, cls = '') {
  for (const el of [wordEl, word2El]) {
    el.textContent = txt;
    el.className = cls;
    if (txt) { void el.offsetWidth; el.classList.add('pop'); } // retrigger pop
  }
}

// --- Duel controller ------------------------------------------------------

let duel = null;

const rand = (a, b) => a + Math.random() * (b - a);
// roughly gaussian sample for AI reaction; ramps faster per standoff won
function aiReaction(opp, playerKills = 0) {
  const g = (Math.random() + Math.random() + Math.random()) / 3; // 0..1 centered
  const mean = opp.mean * (1 - OPPONENT_RAMP * playerKills);
  return Math.max(120, mean + (g - 0.5) * 2 * opp.spread);
}

const fmtTime = ms => (ms / 1000).toFixed(3) + 's';

function pickDeath(forKill) {
  // the 31st death only unlocks by beating the final outlaw
  const cap = save.beaten.includes(OPPONENTS.length) ? DEATHS.length : DEATHS.length - 1;
  if (forKill && save.deaths.length < cap) {
    const next = DEATHS[save.deaths.length].id;
    save.deaths.push(next);
    persist();
    return { id: next, isNew: true };
  }
  const pool = save.deaths.length ? save.deaths : [DEATHS[0].id];
  return { id: pool[Math.floor(Math.random() * pool.length)], isNew: false };
}

class Duel {
  // mode: '1p' | '2p'
  constructor(opts) {
    this.mode = opts.mode;
    this.opp = opts.opponent || null;
    this.winsNeeded = opts.winsNeeded;
    this.score = [0, 0]; // [left/player1, right/ai-or-player2]
    this.round = 0;
    this.phase = 'idle';
    this.at = 0;          // phase deadline timestamp
    this.bangAt = 0;
    this.aiShotAt = 0;
    this.shots = [null, null]; // reaction ms per side for this round
    this.newDeath = null;
    startLoop();
    this.nextRound(performance.now() + 400, true);
  }

  updateScoreboard() {
    // race to 5: both tallies count, whoever fills their pips first wins
    const pips = n => '●'.repeat(n) + '○'.repeat(Math.max(0, this.winsNeeded - n));
    const name0 = this.mode === '1p' ? 'YOU' : 'PLAYER 1';
    const name1 = this.mode === '1p' ? this.opp.name.toUpperCase() : 'PLAYER 2';
    scoreEl.innerHTML =
      `<span>${name0} ${pips(this.score[0])}</span>` +
      `<span class="vs">VS</span>` +
      `<span>${pips(this.score[1]).split('').reverse().join('')} ${name1}</span>`;
  }

  nextRound(now, first = false) {
    this.round++;
    this.shots = [null, null];
    this.newDeath = null;
    resetScene();
    if (this.mode === '1p') scene.right.look = this.opp.look;
    if (first) {
      // both cowboys walk in from opposite wings
      scene.right.walk = { start: now, dur: 1100, from: 260 };
      scene.left.walk = { start: now, dur: 1100, from: -260 };
    }
    setWord('');
    capEl.textContent = '';
    timesEl.textContent = '';
    this.updateScoreboard();
    this.phase = 'pre';
    this.at = now + (first ? 1500 : 700);
  }

  tick(now) {
    switch (this.phase) {
      case 'pre':
        if (now >= this.at) {
          this.phase = 'ready';
          scene.tension = true;      // hands drift over holsters
          setWord('ready.');
          audio.sayReady();
          this.at = now + TIMING.steadyGap;
        }
        break;
      case 'ready':
        if (now >= this.at) {
          this.phase = 'steady';
          setWord('steady.');
          audio.saySteady();
          this.at = now + rand(TIMING.bangDelayMin, TIMING.bangDelayMax);
        }
        break;
      case 'steady':
        if (now >= this.at) {
          this.phase = 'bang';
          scene.tension = false;
          setWord('bang!', 'bang');
          audio.sayBang();
          this.bangAt = now;
          // the outlaw draws faster with every standoff you've taken off him
          if (this.mode === '1p') this.aiShotAt = now + aiReaction(this.opp, this.score[0]);
        }
        break;
      case 'bang':
        if (this.mode === '1p' && now >= this.aiShotAt) {
          // AI fires first
          const aiMs = Math.round(this.aiShotAt - this.bangAt);
          this.shots[1] = aiMs;
          this.resolve(now, 1);
        } else if (now - this.bangAt > TIMING.maxReaction) {
          // nobody shot (2p): dead air, replay round
          this.phase = 'pre';
          setWord('');
          capEl.textContent = 'NOBODY DREW';
          this.at = now + 1400;
        }
        break;
      case 'result':
        if (now >= this.at) {
          // first to 5 kills takes the series — the outlaw's kills count
          // against you too, so he can absolutely beat you to it
          const over = this.score[0] >= this.winsNeeded || this.score[1] >= this.winsNeeded;
          if (over) this.end();
          else this.nextRound(now);
        }
        break;
    }
  }

  // side: 0 = left (you / P1), 1 = right (opponent / P2)
  input(side, now) {
    if (this.phase === 'result' || this.phase === 'idle') return;
    if (this.mode === '1p' && side !== 0) return;

    if (this.phase !== 'bang') {
      // FALSE START — you fired before the call. You lose the round.
      if (this.phase === 'pre') return; // walk-in taps are forgiven
      this.falseStart(side, now);
      return;
    }
    const ms = Math.round(now - this.bangAt);
    if (this.shots[side] !== null) return;
    this.shots[side] = ms;
    this.resolve(now, side);
  }

  falseStart(side, now) {
    audio.gunshot();                       // the wasted shot
    setTimeout(() => audio.ricochet(), 140);
    scene.tension = false;
    scene.flash = 0.5;
    scene.shake = 0.6;
    const shooterSide = side === 0 ? 'left' : 'right';
    fireArm(scene[shooterSide], now);
    scene[shooterSide].afraid = now + 480; // realises, and trembles
    if (side === 0) { save.falseStarts++; persist(); }
    setWord('');
    capEl.textContent = side === 0
      ? (this.mode === '1p' ? 'TOO SOON — YOU LOSE THE DUEL' : 'PLAYER 1 DREW TOO SOON')
      : 'PLAYER 2 DREW TOO SOON';
    // the other cowboy calmly guns down the cheat
    const winner = 1 - side;
    this.kill(now + 500, winner, side, { falseStart: true });
  }

  resolve(now, shooterSide) {
    // whoever shot first wins; in 1P you still get to see how fast the
    // outlaw WOULD have drawn (the original shows both times)
    if (this.mode === '1p' && shooterSide === 0 && this.shots[1] === null) {
      this.shots[1] = Math.round(this.aiShotAt - this.bangAt);
    }
    this.kill(now, shooterSide, 1 - shooterSide, {});
  }

  kill(when, winnerSide, loserSide, { falseStart = false } = {}) {
    this.phase = 'resolve';
    const now = performance.now();
    const delay = Math.max(0, when - now);
    setTimeout(() => {
      const t = performance.now();
      audio.gunshot();
      scene.flash = 0.35;
      scene.shake = 1;
      fireArm(winnerSide === 0 ? scene.left : scene.right, t);
      const humanKill = winnerSide === 0 || this.mode === '2p';
      const death = pickDeath(humanKill);
      const victim = loserSide === 0 ? scene.left : scene.right;
      setTimeout(() => {
        victim.hit = performance.now();       // bullet jolt...
        setTimeout(() => {                    // ...then he goes down
          victim.death = death.id;
          victim.deathStart = performance.now();
          setTimeout(() => audio.thud(), DEATH_ANIMS[death.id].dur * 0.72);
        }, 120);
      }, TIMING.deathPause - 120);
      // winner twirls his iron back into the holster
      const winner = winnerSide === 0 ? scene.left : scene.right;
      winner.flourish = performance.now() + 950;
      this.newDeath = death.isNew ? death : null;
      this.finishRound(winnerSide, falseStart);
    }, delay);
  }

  finishRound(winnerSide, falseStart) {
    this.score[winnerSide]++;
    // stats (1p only, and only real draws)
    if (this.mode === '1p') {
      if (winnerSide === 0) { save.wins++; save.kills++; } else save.losses++;
      if (this.shots[0] !== null) recordTime(this.shots[0]);
      persist();
    }
    // captions
    if (!falseStart) {
      const L = this.shots[0], R = this.shots[1];
      const label0 = this.mode === '1p' ? 'YOU' : 'P1';
      const label1 = this.mode === '1p' ? this.opp.name.toUpperCase() : 'P2';
      const parts = [];
      parts.push(`${label0} ${L !== null ? fmtTime(L) : '—'}`);
      parts.push(`${label1} ${R !== null ? fmtTime(R) : '—'}`);
      timesEl.textContent = parts.join('   ·   ');
      capEl.textContent = winnerSide === 0
        ? (this.mode === '1p' ? 'YOU WIN THE DUEL' : 'PLAYER 1 WINS')
        : (this.mode === '1p' ? 'YOU DIED' : 'PLAYER 2 WINS');
    }
    if (this.newDeath) {
      const d = DEATHS.find(x => x.id === this.newDeath.id);
      capEl.textContent += `   ★ NEW KILL: ${d.name.toUpperCase()}`;
    }
    setWord('');
    this.phase = 'result';
    this.at = performance.now() + TIMING.resultTime;
    this.updateScoreboard();
  }

  end() {
    this.phase = 'idle';
    const playerWon = this.score[0] > this.score[1];
    if (this.mode === '1p' && playerWon && !save.beaten.includes(this.opp.id)) {
      save.beaten.push(this.opp.id);
      save.unlocked = Math.max(save.unlocked, Math.min(this.opp.id + 1, OPPONENTS.length));
      persist();
    }
    // winner celebrates with one of the victory dances before the curtain
    const winnerSide = playerWon ? 'left' : 'right';
    scene[winnerSide].flourish = 0;
    scene[winnerSide].dance = {
      start: performance.now(),
      id: DANCES[Math.floor(Math.random() * DANCES.length)],
    };
    capEl.textContent = '';
    timesEl.textContent = '';
    const d = this;
    setTimeout(() => {
      duel = null;
      stopLoop();
      showEndScreen(d, playerWon);
    }, 2100);
  }
}

// the draw: whip the arm level (fast), muzzle flash, recoil kick, settle
function fireArm(side, start) {
  side.fired = true;
  side.pose.gunDrawn = true;   // out of the holster
  const animate = () => {
    const t = performance.now() - start;
    if (t < 70) {                       // whip up
      side.pose.armGun = 0.55 * (1 - t / 70);
    } else if (t < 120) {               // flash frame
      side.pose.armGun = 0;
      side.pose.flash = 1;
      side.pose.lean = -0.05;           // recoil rocks him back
    } else if (t < 300) {               // kick up and settle
      const u = (t - 120) / 180;
      side.pose.flash = Math.max(0, 1 - u * 2.5);
      side.pose.armGun = -0.3 * Math.sin(u * Math.PI);
      side.pose.lean = -0.05 * (1 - u);
    } else {
      side.pose.armGun = 0;
      side.pose.flash = 0;
      side.pose.lean = 0;
      side.smoke = performance.now();   // smoke curls from the barrel
      return;
    }
    requestAnimationFrame(animate);
  };
  animate();
}

function showEndScreen(d, playerWon) {
  const el = $('#end-title');
  const sub = $('#end-sub');
  if (d.mode === '1p') {
    const last = d.opp.id === OPPONENTS.length;
    if (playerWon) {
      el.textContent = last ? 'THE FASTEST GUN IN THE WEST' : `${d.opp.name.toUpperCase()} IS DOWN`;
      sub.textContent = `you took ${d.opp.trophy}.` + (last ? ' the final kill is yours in the gallery.' : '');
      $('#end-rematch').textContent = last ? 'RIDE AGAIN' : 'NEXT COWBOY';
      $('#end-rematch').onclick = () => {
        const target = !last ? OPPONENTS.find(o => o.id === d.opp.id + 1) : OPPONENTS[0];
        startDuel1P(target);
      };
    } else {
      el.textContent = `${d.opp.name.toUpperCase()} GUNNED YOU DOWN`;
      sub.textContent = `${d.score[1]} — ${d.score[0]}. he keeps ${d.opp.trophy}.`;
      $('#end-rematch').textContent = 'REMATCH';
      $('#end-rematch').onclick = () => startDuel1P(d.opp);
    }
  } else {
    el.textContent = playerWon ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS';
    sub.textContent = `${d.score[0]} — ${d.score[1]}`;
    $('#end-rematch').textContent = 'REMATCH';
    $('#end-rematch').onclick = () => startDuel2P(d.winsNeeded * 2 - 1);
  }
  show('screen-end');
}

function startDuel1P(opp) {
  show('screen-duel');
  $('#screen-duel').classList.remove('twop');
  duel = new Duel({ mode: '1p', opponent: opp, winsNeeded: KILLS_TO_BEAT });
}

function startDuel2P(bestOf) {
  show('screen-duel');
  $('#screen-duel').classList.add('twop');
  duel = new Duel({ mode: '2p', winsNeeded: Math.ceil(bestOf / 2) });
}

// --- Input ----------------------------------------------------------------

function duelPointer(e) {
  if (!duel) return;
  audio.unlock();
  const rect = canvas.getBoundingClientRect();
  let side = 0;
  if (duel.mode === '2p') {
    // device flat between two players, like the original: P1 bottom / P2 top
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    side = y > rect.height / 2 ? 0 : 1;
  }
  duel.input(side, performance.now());
}
$('#screen-duel').addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return; // let the quit button be a button
  duelPointer(e);
});

window.addEventListener('keydown', e => {
  if (!duel || e.repeat) return;
  if (duel.mode === '1p' && (e.code === 'Space' || e.code === 'Enter')) duel.input(0, performance.now());
  if (duel.mode === '2p') {
    if (e.code === 'KeyA') duel.input(0, performance.now());
    if (e.code === 'KeyL') duel.input(1, performance.now());
  }
});

// --- Menus ----------------------------------------------------------------

// small standing portrait of an outlaw, for the select list
function facePortrait(look, faint) {
  const c = document.createElement('canvas');
  const dpr = 2;
  c.width = 52 * dpr; c.height = 62 * dpr;
  c.className = 'face';
  const fc = c.getContext('2d');
  fc.scale(dpr, dpr);
  const pose = defaultPose();
  const drawLook = faint ? { ...look, ink: '#d8d7d3', alpha: 1 } : look;
  drawCowboy(fc, 26, 58, 46, 1, pose, drawLook);
  return c;
}

function buildSelect() {
  const list = $('#opponent-list');
  list.innerHTML = '';
  for (const opp of OPPONENTS) {
    const locked = opp.id > save.unlocked;
    const li = document.createElement('button');
    li.className = 'opponent' + (locked ? ' locked' : '') + (save.beaten.includes(opp.id) ? ' beaten' : '');
    li.innerHTML = locked
      ? `<span class="num">${opp.id}</span><span class="name">?????</span><span class="tag">LOCKED</span>`
      : `<span class="num">${opp.id}</span><span class="name">${opp.name.toUpperCase()}</span>` +
        `<span class="tag">${save.beaten.includes(opp.id) ? 'BEATEN'
          : opp.id === OPPONENTS.length ? 'DRAW UNKNOWN'
          : `DRAWS IN ~${(opp.mean / 1000).toFixed(2)}s`}</span>`;
    // silhouette portrait after the number (locked outlaws are a faint tease)
    li.insertBefore(facePortrait(opp.look, locked), li.children[1]);
    if (!locked) li.onclick = () => { audio.tick(); startDuel1P(opp); };
    list.appendChild(li);
  }
}

function buildGallery() {
  const grid = $('#gallery-grid');
  grid.innerHTML = '';
  $('#gallery-count').textContent = `${save.deaths.length} / ${DEATHS.length} KILLS COLLECTED`;
  for (const d of DEATHS) {
    const unlocked = save.deaths.includes(d.id);
    const cell = document.createElement('button');
    cell.className = 'kill' + (unlocked ? '' : ' locked');
    cell.innerHTML = unlocked ? `<span>${d.name.toUpperCase()}</span><small>${d.desc}</small>` : '<span>?</span>';
    if (unlocked) cell.onclick = () => { audio.tick(); replayDeath(d.id); };
    grid.appendChild(cell);
  }
}

// Gallery replay: victim stands alone mid-screen and dies on loop once.
function replayDeath(id) {
  show('screen-duel');
  $('#screen-duel').classList.remove('twop');
  duel = null;
  resetScene();
  scene.right.pose.visible = false;  // stage to ourselves, right way up
  setWord('');
  scoreEl.innerHTML = '';
  timesEl.textContent = '';
  const d = DEATHS.find(x => x.id === id);
  capEl.textContent = d.name.toUpperCase();
  startLoop();
  setTimeout(() => {
    audio.gunshot();
    scene.flash = 0.35;
    scene.left.death = id;
    scene.left.deathStart = performance.now();
    setTimeout(() => audio.thud(), DEATH_ANIMS[id].dur * 0.72);
    setTimeout(() => { stopLoop(); show('screen-gallery'); }, DEATH_ANIMS[id].dur + 1200);
  }, 700);
}

function buildStats() {
  const avg = save.timeCount ? Math.round(save.timeSum / save.timeCount) : null;
  $('#stats-body').innerHTML = `
    <div class="stat"><b>${save.fastest !== null ? fmtTime(save.fastest) : '—'}</b><span>FASTEST DRAW</span></div>
    <div class="stat"><b>${avg !== null ? fmtTime(avg) : '—'}</b><span>AVERAGE DRAW</span></div>
    <div class="stat"><b>${avg !== null ? rankFor(avg).toUpperCase() : 'UNPROVEN'}</b><span>RANK</span></div>
    <div class="stat"><b>${save.wins}</b><span>DUELS WON</span></div>
    <div class="stat"><b>${save.losses}</b><span>DUELS LOST</span></div>
    <div class="stat"><b>${save.falseStarts}</b><span>FALSE STARTS</span></div>
    <div class="stat"><b>${save.deaths.length}</b><span>KILLS COLLECTED</span></div>
    <div class="stat"><b>${save.beaten.length} / ${OPPONENTS.length}</b><span>OUTLAWS BEATEN</span></div>`;
}

// --- Wiring ---------------------------------------------------------------

$('#btn-1p').onclick = () => { audio.unlock(); audio.tick(); show('screen-select'); };
$('#btn-2p').onclick = () => { audio.unlock(); audio.tick(); show('screen-2p'); };
$('#btn-gallery').onclick = () => { audio.tick(); show('screen-gallery'); };
$('#btn-stats').onclick = () => { audio.tick(); show('screen-stats'); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { audio.tick(); show(b.dataset.back); });
document.querySelectorAll('[data-bestof]').forEach(b => b.onclick = () => { audio.tick(); startDuel2P(+b.dataset.bestof); });
$('#btn-quit-duel').onclick = () => { duel = null; stopLoop(); audio.tick(); show('screen-title'); };
$('#end-menu').onclick = () => { audio.tick(); show('screen-title'); };

const muteBtn = $('#btn-mute');
function syncMute() { muteBtn.textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON'; audio.setMuted(save.muted); }
muteBtn.onclick = () => { save.muted = !save.muted; persist(); syncMute(); };
syncMute();

$('#btn-reset').onclick = () => {
  if (confirm('Reset all progress, kills and stats?')) {
    save = freshSave(); persist(); syncMute(); buildStats();
  }
};

// lonely whistle ambience on the title screen (audio needs a first gesture)
let gestured = false;
document.addEventListener('pointerdown', () => { gestured = true; audio.unlock(); }, { once: true });
setInterval(() => {
  if (gestured && activeScreen === 'screen-title') audio.whistle();
}, 16000);

// installable web app: register the offline service worker where supported
// (silently skipped on file:// or sandboxed origins like the artifact host)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not fatal */ });
  });
}

resize();
show('screen-title');
