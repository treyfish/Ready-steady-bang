import { TIMING, OPPONENTS, DEATHS, KILLS_TO_BEAT, OPPONENT_RAMP, RANK_TABLE } from './data.js';
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
const freshSide = () => ({
  pose: defaultPose(), fx: [], death: null, deathStart: 0,
  walk: null, dance: 0, fired: false, smoke: 0, hit: 0, seed: Math.random() * 7,
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

function figureMetrics() {
  // figure height scales with BOTH axes so narrow portrait screens
  // don't push the two cowboys into each other
  const h = Math.min(H * 0.34, W * 0.36, 190);
  const groundY = H * 0.66;
  const inset = Math.min(Math.max(W * 0.22, h * 0.9), W * 0.3);
  return { h, groundY, lx: inset, rx: W - inset };
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
    // hovers over the holster with a nervous tremor
    s.pose.breathe = (Math.sin(now / 900 + s.seed) + 1) * 1.1;
    if (!s.fired) {
      if (tension) {
        s.pose.armGun = 0.42 + Math.sin(now / 55 + s.seed) * 0.018;
        s.pose.lean = 0.045;
        s.pose.kneel = 0.08;
      } else {
        s.pose.armGun = 0.55;
        s.pose.lean = 0;
        s.pose.kneel = 0;
      }
    }
  }

  // hit reaction: a sharp jolt backwards the instant the bullet lands
  if (s.hit) {
    const u = (now - s.hit) / 160;
    if (u < 1) s.pose.x = -10 * Math.sin(Math.min(1, u) * Math.PI);
    else s.hit = 0;
  }

  // victory dance: hop, hat lifted high, gun waved overhead
  if (s.dance) {
    const t = (now - s.dance) / 1000;
    s.pose.gunDrawn = true;
    s.pose.y = -Math.abs(Math.sin(t * 7)) * 11;
    s.pose.armGun = -1.15 + Math.sin(t * 14) * 0.3;
    s.pose.rot = Math.sin(t * 7) * 0.05;
    s.pose.hatY = -6 - Math.abs(Math.sin(t * 7)) * 9;   // hat rides up with each hop
    s.pose.hatRot = Math.sin(t * 9) * 0.25;
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

  // ground line
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.06, m.groundY + 1);
  ctx.lineTo(W * 0.94, m.groundY + 1);
  ctx.stroke();

  updatePuppet(scene.left, now, scene.tension);
  updatePuppet(scene.right, now, scene.tension);

  for (const [side, x, facing] of [['left', m.lx, 1], ['right', m.rx, -1]]) {
    const s = scene[side];
    const sc = m.h / 100;
    if (s.pose.clipGround) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, m.groundY + 2); ctx.clip();
    }
    drawCowboy(ctx, x, m.groundY, m.h, facing, s.pose);
    // props live in the same local space as the figure
    ctx.save();
    ctx.translate(x, m.groundY);
    ctx.scale(facing * sc, sc);
    for (const p of s.fx) drawProp(ctx, p);
    ctx.restore();
    if (s.pose.clipGround) ctx.restore();
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
    const pips = n => '●'.repeat(n) + '○'.repeat(Math.max(0, this.winsNeeded - n));
    if (this.mode === '1p') {
      // your kill tally toward the 5 needed; the outlaw can't "win" the
      // series — he can only keep gunning you down
      scoreEl.innerHTML =
        `<span>YOU ${pips(this.score[0])}</span>` +
        `<span class="vs">VS</span>` +
        `<span>${this.opp.name.toUpperCase()}${this.score[1] ? ` (SHOT YOU ×${this.score[1]})` : ''}</span>`;
    } else {
      scoreEl.innerHTML =
        `<span>PLAYER 1 ${pips(this.score[0])}</span>` +
        `<span class="vs">VS</span>` +
        `<span>${pips(this.score[1]).split('').reverse().join('')} PLAYER 2</span>`;
    }
  }

  nextRound(now, first = false) {
    this.round++;
    this.shots = [null, null];
    this.newDeath = null;
    resetScene();
    if (first) {
      // opponent walks in from offscreen
      scene.right.walk = { start: now, dur: 1100, from: 260 };
      if (this.mode === '2p') scene.left.walk = { start: now, dur: 1100, from: -260 };
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
          // 1P: only YOUR kills count toward taking the outlaw — he can't
          // win the series, you just keep squaring up until you have 5
          const over = this.mode === '1p'
            ? this.score[0] >= this.winsNeeded
            : this.score[0] >= this.winsNeeded || this.score[1] >= this.winsNeeded;
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
    audio.ricochet();
    scene.tension = false;
    scene.flash = 0.5;
    scene.shake = 0.6;
    const shooterSide = side === 0 ? 'left' : 'right';
    fireArm(scene[shooterSide], now);
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
      capEl.textContent += `   ★ NEW KILL UNLOCKED: ${d.name.toUpperCase()}`;
    }
    setWord('');
    this.phase = 'result';
    this.at = performance.now() + TIMING.resultTime;
    this.updateScoreboard();
  }

  end() {
    this.phase = 'idle';
    const playerWon = this.mode === '1p' ? true : this.score[0] > this.score[1];
    if (this.mode === '1p' && !save.beaten.includes(this.opp.id)) {
      save.beaten.push(this.opp.id);
      save.unlocked = Math.max(save.unlocked, Math.min(this.opp.id + 1, OPPONENTS.length));
      persist();
    }
    // winner does a little victory dance before the curtain
    const winnerSide = this.mode === '1p' || playerWon ? 'left' : 'right';
    scene[winnerSide].dance = performance.now();
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
    el.textContent = last ? 'THE FASTEST GUN IN THE WEST' : `${d.opp.name.toUpperCase()} IS DOWN`;
    sub.textContent = `you took ${d.opp.trophy}.` + (last ? ' the final kill is yours in the gallery.' : '');
    $('#end-rematch').textContent = last ? 'RIDE AGAIN' : 'NEXT COWBOY';
    $('#end-rematch').onclick = () => {
      const target = !last ? OPPONENTS.find(o => o.id === d.opp.id + 1) : OPPONENTS[0];
      startDuel1P(target);
    };
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
    // landscape: P1 left / P2 right. Portrait (device flat between two
    // players, like the original): P1 bottom / P2 top.
    const portrait = rect.height > rect.width;
    if (portrait) {
      const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
      side = y > rect.height / 2 ? 0 : 1;
    } else {
      const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
      side = x < rect.width / 2 ? 0 : 1;
    }
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
  scene.left.pose.visible = false;
  setWord('');
  scoreEl.innerHTML = '';
  timesEl.textContent = '';
  const d = DEATHS.find(x => x.id === id);
  capEl.textContent = d.name.toUpperCase();
  startLoop();
  setTimeout(() => {
    audio.gunshot();
    scene.flash = 0.35;
    scene.right.death = id;
    scene.right.deathStart = performance.now();
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

resize();
show('screen-title');
