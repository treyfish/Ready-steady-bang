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

function show(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-select') buildSelect();
  if (id === 'screen-gallery') buildGallery();
  if (id === 'screen-stats') buildStats();
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
const scene = {
  left:  { pose: defaultPose(), fx: [], death: null, deathStart: 0, walk: null },
  right: { pose: defaultPose(), fx: [], death: null, deathStart: 0, walk: null },
  flash: 0,          // full-screen white flash 0..1
  running: false,
};

function resetScene() {
  scene.left  = { pose: defaultPose(), fx: [], death: null, deathStart: 0, walk: null };
  scene.right = { pose: defaultPose(), fx: [], death: null, deathStart: 0, walk: null };
  scene.flash = 0;
}

function figureMetrics() {
  // figure height scales with BOTH axes so narrow portrait screens
  // don't push the two cowboys into each other
  const h = Math.min(H * 0.34, W * 0.36, 190);
  const groundY = H * 0.66;
  const inset = Math.min(Math.max(W * 0.22, h * 0.9), W * 0.3);
  return { h, groundY, lx: inset, rx: W - inset };
}

function updateSide(side, now) {
  const s = scene[side];
  // walk-in
  if (s.walk) {
    const t = Math.min(1, (now - s.walk.start) / s.walk.dur);
    s.pose.x = s.walk.from * (1 - t);
    s.pose.legSplit = 0.16 + Math.sin(t * Math.PI * 8) * 0.12 * (t < 1 ? 1 : 0);
    if (t >= 1) { s.walk = null; s.pose.x = 0; s.pose.legSplit = 0.16; }
  }
  // victory dance: a little hop, gun waved overhead
  if (s.dance) {
    const t = (now - s.dance) / 1000;
    s.pose.y = -Math.abs(Math.sin(t * 7)) * 10;
    s.pose.armGun = -1.1 + Math.sin(t * 14) * 0.3;
    s.pose.rot = Math.sin(t * 7) * 0.05;
  }
  // death animation
  if (s.death) {
    const anim = DEATH_ANIMS[s.death];
    const t = Math.min(1, (now - s.deathStart) / anim.dur);
    s.fx = [];
    anim.update(t, s.pose, s.fx);
  }
}

function render(now) {
  ctx.clearRect(0, 0, W, H);
  const m = figureMetrics();

  // ground line
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.06, m.groundY + 1);
  ctx.lineTo(W * 0.94, m.groundY + 1);
  ctx.stroke();

  updateSide('left', now);
  updateSide('right', now);

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

// --- Word / caption overlay ----------------------------------------------

const wordEl = $('#duel-word');
const capEl = $('#duel-caption');
const timesEl = $('#duel-times');
const scoreEl = $('#duel-score');

function setWord(txt, cls = '') {
  wordEl.textContent = txt;
  wordEl.className = cls;
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
    scene.flash = 0.5;
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
      fireArm(winnerSide === 0 ? scene.left : scene.right, t);
      const humanKill = winnerSide === 0 || this.mode === '2p';
      const death = pickDeath(humanKill);
      const victim = loserSide === 0 ? scene.left : scene.right;
      setTimeout(() => {
        victim.death = death.id;
        victim.deathStart = performance.now();
      }, TIMING.deathPause);
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

// quick draw-arm animation for the shooter
function fireArm(side, start) {
  const animate = () => {
    const t = Math.min(1, (performance.now() - start) / 90);
    side.pose.armGun = 0.55 * (1 - t);
    side.pose.flash = t >= 1 ? 1 : 0;
    if (t < 1) requestAnimationFrame(animate);
    else setTimeout(() => { side.pose.flash = 0; }, 130);
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
  $('#duel-zones').classList.remove('two-player');
  duel = new Duel({ mode: '1p', opponent: opp, winsNeeded: KILLS_TO_BEAT });
}

function startDuel2P(bestOf) {
  show('screen-duel');
  $('#duel-zones').classList.add('two-player');
  duel = new Duel({ mode: '2p', winsNeeded: Math.ceil(bestOf / 2) });
}

// --- Input ----------------------------------------------------------------

function duelPointer(e) {
  if (!duel) return;
  audio.unlock();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
  const side = duel.mode === '2p' ? (x < rect.width / 2 ? 0 : 1) : 0;
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
  $('#duel-zones').classList.remove('two-player');
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

// title screen whistle, once, after first interaction is available
let whistled = false;
document.addEventListener('pointerdown', () => {
  if (!whistled) { whistled = true; audio.unlock(); }
}, { once: true });

resize();
show('screen-title');
