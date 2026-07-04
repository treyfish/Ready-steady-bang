// The 31 cowboy deaths. Each is a pure function of normalized time t (0..1)
// that puppets the victim's pose and may emit props (coffin, vulture, dust...)
// into the fx list. Props are drawn in the victim's local space (same
// facing-aware, ~100-unit-tall coordinate system as cowboy.js).

const clamp01 = t => Math.max(0, Math.min(1, t));
// progress within sub-segment [a,b] of t
const seg = (t, a, b) => clamp01((t - a) / (b - a));
// a puff of ground dust when a body lands, starting at time fraction `at`
function landDust(t, at, fx, x = 0) {
  const u = seg(t, at, at + 0.3);
  if (u > 0 && u < 1) fx.push({ type: 'dust', x, y: 0, r: 8 + 22 * u, alpha: 0.8 * (1 - u) });
}
const easeIn = t => t * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeInCubic = t => t * t * t;
const HPI = Math.PI / 2;

// Each entry: { dur: ms, update(t, p, fx) }
export const DEATH_ANIMS = {
  'stiff-back': { dur: 900, update(t, p, fx) {
    p.rot = -HPI * easeIn(seg(t, 0.1, 0.75));
    if (t > 0.75) p.rot = -HPI + Math.sin(seg(t, 0.75, 1) * Math.PI) * 0.06;
    landDust(t, 0.75, fx, -50);
  }},

  'stiff-front': { dur: 900, update(t, p, fx) {
    p.rot = HPI * easeIn(seg(t, 0.1, 0.75));
    if (t > 0.75) p.rot = HPI - Math.sin(seg(t, 0.75, 1) * Math.PI) * 0.06;
    landDust(t, 0.75, fx, 50);
  }},

  'knees-first': { dur: 1400, update(t, p, fx) {
    p.kneel = easeOut(seg(t, 0, 0.35));
    p.lean = 0.15 * seg(t, 0.2, 0.4);
    p.rot = HPI * easeIn(seg(t, 0.5, 0.9));
    landDust(t, 0.9, fx, 40);
  }},

  'spin-360': { dur: 1300, update(t, p, fx) {
    const spin = seg(t, 0, 0.55);
    p.scaleX = Math.cos(spin * Math.PI * 2) || 0.02; // one full pirouette
    p.rot = -HPI * easeIn(seg(t, 0.55, 0.95));
    landDust(t, 0.95, fx, -50);
  }},

  'hat-clutch': { dur: 1600, update(t, p) {
    p.armGun = 0.55 - 1.9 * easeOut(seg(t, 0, 0.25));      // reach up
    if (t > 0.25) { p.hatGone = true; p.armGun = -1.35 + 2.2 * seg(t, 0.35, 0.55); } // hat to chest
    p.rot = -HPI * easeIn(seg(t, 0.6, 0.95));
  }},

  'stagger-fall': { dur: 1600, update(t, p) {
    const steps = seg(t, 0, 0.6) * 3;
    p.x = -14 * Math.floor(steps) - 14 * easeOut(steps % 1);
    p.lean = Math.sin(steps * Math.PI) * 0.22;
    p.legSplit = 0.16 + Math.abs(Math.sin(steps * Math.PI)) * 0.1;
    p.rot = -HPI * easeIn(seg(t, 0.65, 0.95));
  }},

  'launch-up': { dur: 1100, update(t, p, fx) {
    const u = seg(t, 0.02, 0.85);
    p.y = -(140 * Math.sin(u * Math.PI)) * (1 - u * 0.3);
    p.x = -70 * u;
    p.rot = -Math.PI * easeOut(u);
    if (t > 0.85) { p.y = 0; p.rot = -HPI; }
    landDust(t, 0.85, fx, -70);
  }},

  'coffin': { dur: 1500, update(t, p, fx) {
    const drop = seg(t, 0.1, 0.4);
    fx.push({ type: 'coffin', x: 0, y: -260 * (1 - easeIn(drop)), alpha: 1 });
    if (drop >= 1) { p.visible = false; }
    if (t > 0.5) fx.push({ type: 'dust', x: 0, y: 0, r: 30 * seg(t, 0.5, 0.8), alpha: 1 - seg(t, 0.5, 1) });
  }},

  'angel': { dur: 2000, update(t, p, fx) {
    p.rot = -HPI * easeIn(seg(t, 0.05, 0.35));
    const fly = seg(t, 0.45, 1);
    if (fly > 0) fx.push({ type: 'angel', x: 0, y: -30 - 190 * fly, alpha: 1 - fly * 0.85, wing: t * 30 });
  }},

  'tumbleweed': { dur: 1600, update(t, p, fx) {
    const curl = seg(t, 0, 0.25);
    p.scaleY = 1 - 0.7 * curl;
    p.kneel = curl;
    if (t > 0.25) {
      p.visible = false;
      const roll = seg(t, 0.25, 1);
      fx.push({ type: 'weed', x: -260 * roll, y: -14 - Math.abs(Math.sin(roll * Math.PI * 3)) * 22, rot: -roll * 12, alpha: 1 - easeIn(roll) * 0.6 });
    }
  }},

  'crumble': { dur: 1400, update(t, p, fx) {
    const s = seg(t, 0.1, 0.8);
    p.scaleY = 1 - s;
    p.scaleX = 1 + s * 0.4;
    fx.push({ type: 'dust', x: 0, y: 0, r: 10 + 26 * s, alpha: 0.7 * (1 - seg(t, 0.6, 1)) });
    if (t > 0.85) { p.visible = false; fx.push({ type: 'mound', x: 0, y: 0, alpha: 1 }); }
  }},

  'hat-fly': { dur: 1200, update(t, p, fx) {
    p.hatGone = true;
    const u = seg(t, 0, 0.9);
    fx.push({ type: 'hat', x: 20 * u, y: -95 - 160 * easeOut(u) + 60 * u * u, rot: u * 7, alpha: 1 });
    p.rot = -HPI * easeIn(seg(t, 0.15, 0.7));
  }},

  'sit-slump': { dur: 1800, update(t, p) {
    p.kneel = easeOut(seg(t, 0, 0.4)) * 1.4;
    p.lean = 0.1 * seg(t, 0.3, 0.5);
    p.rot = -HPI * easeIn(seg(t, 0.55, 0.95)) * 0.9;
    p.headTilt = 0.5 * seg(t, 0.4, 0.7);
  }},

  'backflip': { dur: 1300, update(t, p, fx) {
    const u = seg(t, 0.05, 0.8);
    p.y = -110 * Math.sin(u * Math.PI);
    p.rot = -2 * Math.PI * easeOut(u);
    if (t > 0.8) p.rot = -HPI;   // sticks the landing... flat
    landDust(t, 0.8, fx, -50);
  }},

  'melt': { dur: 1800, update(t, p, fx) {
    const m = seg(t, 0.1, 0.85);
    p.scaleY = Math.max(0.04, 1 - m);
    p.scaleX = 1 + m * 0.25;
    fx.push({ type: 'puddle', x: 0, y: 0, r: 6 + 34 * m, alpha: 1 });
  }},

  'bounce': { dur: 1500, update(t, p) {
    p.rot = -HPI * easeIn(seg(t, 0.05, 0.4));
    const b = seg(t, 0.4, 1);
    p.y = -Math.abs(Math.sin(b * Math.PI * 2)) * 40 * (1 - b);
  }},

  'moonwalk': { dur: 1800, update(t, p) {
    const u = seg(t, 0.1, 1);
    p.x = -300 * easeIn(u);
    p.legSplit = 0.16 + Math.sin(t * 40) * 0.08;
    p.lean = -0.12;
    p.headTilt = 0.3;
  }},

  'headstand': { dur: 1400, update(t, p) {
    const u = easeIn(seg(t, 0.1, 0.6));
    p.rot = Math.PI * u;
    p.y = -100 * u;
    if (t > 0.6) p.rot = Math.PI + Math.sin(seg(t, 0.6, 1) * Math.PI * 2) * 0.04; // wobble, holds it
  }},

  'shatter': { dur: 1300, update(t, p, fx) {
    if (t > 0.15) {
      p.visible = false;
      const u = seg(t, 0.15, 1);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI - Math.PI * 0.1;
        fx.push({ type: 'shard', x: Math.cos(a) * 60 * u * (1 + i % 3 * 0.3), y: -50 + Math.sin(-a) * 40 * u + 90 * u * u, rot: u * (i + 2), alpha: 1 - easeIn(u), i });
      }
    }
  }},

  'deflate': { dur: 1600, update(t, p) {
    const u = seg(t, 0.1, 0.9);
    p.scaleY = 1 - 0.95 * easeOut(u);
    p.scaleX = 1 - 0.7 * easeOut(u);
    p.x = Math.sin(u * Math.PI * 5) * 26 * u;
    p.y = -Math.sin(u * Math.PI * 3) * 30 * (1 - u);
  }},

  'lasso-up': { dur: 1100, update(t, p, fx) {
    const grab = seg(t, 0.15, 0.35);
    fx.push({ type: 'rope', x: 0, y: -90, len: 400, alpha: grab > 0 ? 1 : 0 });
    if (grab >= 1) {
      const u = seg(t, 0.35, 0.9);
      p.y = -450 * easeIn(u);
      p.scaleY = 1 + 0.25 * u;
    }
  }},

  'gravestone': { dur: 1400, update(t, p, fx) {
    const drop = seg(t, 0.1, 0.35);
    fx.push({ type: 'stone', x: 0, y: -240 * (1 - easeIn(drop)), alpha: 1 });
    if (drop >= 1) {
      p.scaleY = Math.max(0.03, 1 - seg(t, 0.35, 0.45) * 1);
      fx.push({ type: 'dust', x: 0, y: 0, r: 26 * seg(t, 0.35, 0.7), alpha: 1 - seg(t, 0.4, 1) });
    }
  }},

  'spin-drill': { dur: 1500, update(t, p, fx) {
    p.scaleX = Math.cos(t * 45) * 0.9 + 0.1;
    const sink = seg(t, 0.15, 0.85);
    p.y = 95 * sink;               // straight down into the dirt
    p.clipGround = true;
    fx.push({ type: 'dust', x: 0, y: 0, r: 12 + 10 * Math.sin(t * 20), alpha: sink < 1 ? 0.8 : 0 });
    if (sink >= 1) { p.visible = false; fx.push({ type: 'mound', x: 0, y: 0, alpha: 1 }); }
  }},

  'firework': { dur: 1300, update(t, p, fx) {
    if (t > 0.12) {
      p.visible = false;
      const u = seg(t, 0.12, 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        fx.push({ type: 'spark', x: Math.cos(a) * 90 * easeOut(u), y: -55 + Math.sin(a) * 90 * easeOut(u) + 50 * u * u, alpha: 1 - u, i });
      }
    }
  }},

  'flatten': { dur: 1400, update(t, p) {
    p.scaleY = Math.max(0.05, 1 - easeIn(seg(t, 0.1, 0.35)) * 1);
    const drift = seg(t, 0.45, 1);
    p.x = Math.sin(drift * Math.PI * 2) * 16;
    p.alpha = 1 - drift * 0.4;
  }},

  'crawl': { dur: 2000, update(t, p) {
    p.rot = HPI * easeIn(seg(t, 0.05, 0.35));
    const c = seg(t, 0.4, 0.85);
    p.x = 26 * c;
    p.armGun = 0.55 - Math.sin(c * Math.PI * 3) * 0.4;
    if (t > 0.85) p.armGun = 0.55;
  }},

  'vulture': { dur: 1800, update(t, p, fx) {
    const swoop = seg(t, 0, 0.4);
    const vx = 220 * (1 - swoop), vy = -240 * (1 - swoop) - 88;
    if (t <= 0.4) fx.push({ type: 'vulture', x: vx, y: vy, alpha: 1, flap: t * 40 });
    else {
      const carry = seg(t, 0.4, 1);
      const cy = -88 - 320 * easeIn(carry);
      fx.push({ type: 'vulture', x: -60 * carry, y: cy, alpha: 1, flap: t * 40 });
      p.y = cy + 88;
      p.rot = 0.25;
    }
  }},

  'split': { dur: 1400, update(t, p, fx) {
    if (t > 0.2) {
      p.visible = false;
      const u = seg(t, 0.2, 0.8);
      fx.push({ type: 'half', side: -1, x: -18 * u, rot: -0.9 * easeIn(u), alpha: 1 });
      fx.push({ type: 'half', side: 1, x: 18 * u, rot: 0.9 * easeIn(u), alpha: 1 });
    }
  }},

  'bury-self': { dur: 2200, update(t, p, fx) {
    // digs (lean bobbing), then sinks in; cross marks the spot
    const dig = seg(t, 0, 0.4);
    p.lean = Math.sin(dig * Math.PI * 4) * 0.3;
    const sink = seg(t, 0.45, 0.8);
    p.y = 100 * sink;
    p.clipGround = true;
    fx.push({ type: 'mound', x: 0, y: 0, alpha: seg(t, 0.4, 0.6) });
    if (t > 0.8) fx.push({ type: 'cross', x: 0, y: 0, alpha: seg(t, 0.8, 1) });
    if (sink >= 1) p.visible = false;
  }},

  'star-spin': { dur: 1900, update(t, p, fx) {
    const dizzy = seg(t, 0, 0.6);
    p.lean = Math.sin(t * 25) * 0.18 * dizzy;
    p.headTilt = Math.sin(t * 25 + 1) * 0.3 * dizzy;
    if (t < 0.7) for (let i = 0; i < 3; i++) {
      const a = t * 12 + (i / 3) * Math.PI * 2;
      fx.push({ type: 'star', x: Math.cos(a) * 22, y: -100 + Math.sin(a) * 7, alpha: 0.9 });
    }
    p.rot = -HPI * easeIn(seg(t, 0.68, 0.95));
  }},

  'salute': { dur: 1900, update(t, p) {
    p.armGun = 0.55 - 2.15 * easeOut(seg(t, 0.05, 0.3));  // hand to brow
    p.gunGone = t > 0.25;
    p.rot = -HPI * easeIn(seg(t, 0.6, 0.95));
  }},
};

// --- Prop drawing --------------------------------------------------------
// Called inside the victim's local space (unit ≈ figure of height 100).
export function drawProp(ctx, prop) {
  const INK = '#1c1c1c';
  ctx.save();
  ctx.globalAlpha *= clamp01(prop.alpha ?? 1);
  ctx.translate(prop.x || 0, prop.y || 0);
  ctx.rotate(prop.rot || 0);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  switch (prop.type) {
    case 'coffin':
      ctx.beginPath();
      ctx.moveTo(-16, 0); ctx.lineTo(-11, -95); ctx.lineTo(11, -95); ctx.lineTo(16, 0);
      ctx.closePath(); ctx.fill();
      break;
    case 'stone':
      ctx.beginPath();
      ctx.moveTo(-18, 0); ctx.lineTo(-18, -34);
      ctx.arc(0, -34, 18, Math.PI, 0);
      ctx.lineTo(18, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-9, -38, 18, 2.5);
      ctx.fillRect(-9, -30, 18, 2.5);
      break;
    case 'cross':
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -34);
      ctx.moveTo(-11, -24); ctx.lineTo(11, -24);
      ctx.stroke();
      break;
    case 'mound':
      ctx.beginPath();
      ctx.ellipse(0, -2, 26, 8, 0, Math.PI, 0);
      ctx.fill();
      break;
    case 'dust':
      ctx.globalAlpha *= 0.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * prop.r, -Math.abs(Math.sin(a)) * prop.r * 0.5 - 4, 6 + (i % 3) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'puddle':
      ctx.beginPath();
      ctx.ellipse(0, -1, prop.r, prop.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'weed': // tumbleweed ball: scribbly circle
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 16 - i * 3.5, i * 0.8 + (prop.rot || 0), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'hat':
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5, 0); ctx.lineTo(-4.5, -8);
      ctx.quadraticCurveTo(0, -11, 6.5, -8); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
      break;
    case 'angel': {
      // little soul: circle head + halo + flapping wings
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -14, 9, 2.5, 0, 0, Math.PI * 2); ctx.stroke(); // halo
      const w = Math.sin(prop.wing || 0) * 6;
      ctx.beginPath();
      ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-24, -6 - w, -26, 6 - w); ctx.quadraticCurveTo(-16, 8, -8, 6);
      ctx.moveTo(8, 2); ctx.quadraticCurveTo(24, -6 - w, 26, 6 - w); ctx.quadraticCurveTo(16, 8, 8, 6);
      ctx.fill();
      break;
    }
    case 'vulture': {
      const f = Math.sin(prop.flap || 0) * 10;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();      // body
      ctx.beginPath(); ctx.arc(9, -4, 3.5, 0, Math.PI * 2); ctx.fill();   // head
      ctx.beginPath();                                                    // wings
      ctx.moveTo(-2, -2); ctx.quadraticCurveTo(-18, -14 - f, -30, -6 - f);
      ctx.moveTo(2, -2); ctx.quadraticCurveTo(14, -16 - f, 26, -8 - f);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-2, 14); ctx.moveTo(3, 6); ctx.lineTo(3, 14); ctx.stroke(); // dangling legs
      break;
    }
    case 'rope':
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -(prop.len || 300));
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(0, 6, 14, 9, 0, 0, Math.PI * 2); ctx.stroke(); // loop
      break;
    case 'shard':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10 + (prop.i % 3) * 4, 4);
      ctx.lineTo(4, 12 + (prop.i % 2) * 5);
      ctx.closePath(); ctx.fill();
      break;
    case 'spark':
      ctx.beginPath();
      ctx.arc(0, 0, 3.5 + (prop.i % 3), 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'smoke':
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, prop.r || 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star': {
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const px = Math.cos(a) * 6, py = Math.sin(a) * 6;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'half': {
      // one vertical half of a fallen silhouette, sliding apart
      ctx.beginPath();
      ctx.rect(prop.side < 0 ? -14 : 2, -92, 12, 92);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
