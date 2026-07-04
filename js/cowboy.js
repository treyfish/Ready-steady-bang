// Procedural cowboy: a chunky black silhouette in profile, drawn on canvas.
// Everything is parameterized through a mutable `pose` so death animations
// can puppet the figure, and a static `look` gives each outlaw his own
// silhouette (hat, build, props).
//
// Local coordinate system: origin at the ground point between the feet,
// y up is negative. The figure is ~100 units tall. `facing` = +1 means
// facing right.

export const INK = '#1c1c1c';

export function defaultPose() {
  return {
    x: 0, y: 0,            // world offset (canvas px added on top of anchor)
    rot: 0,                // whole-body rotation (radians) around the feet
    scaleY: 1, scaleX: 1,  // squash/stretch
    alpha: 1,
    lean: 0,               // torso lean (radians)
    armGun: 0.55,          // gun-arm angle: 0.55 rad down = holstered, 0 = level aim
    armOff: 0.5,           // off-arm hang angle
    legSplit: 0.16,        // stance width
    footF: 0, footB: 0,    // per-foot x offsets (walk cycle)
    kneel: 0,              // 0..1 knees bend / body drop
    breathe: 0,            // subtle torso rise (idle life)
    headTilt: 0,
    hatY: 0,               // hat offset (for hat-fly deaths)
    hatRot: 0,
    hatGone: false,
    gunGone: false,
    gunDrawn: false,       // pistol stays in the holster until the draw
    flash: 0,              // muzzle flash intensity 0..1
    visible: true,
  };
}

// Hat styles, drawn with the origin at the base of the crown.
function drawHat(ctx, style) {
  ctx.beginPath();
  switch (style) {
    case 'droop':    // sad, brim flopping down at the edges
      ctx.moveTo(-15, -1);
      ctx.quadraticCurveTo(-13, 3, -10, 1);
      ctx.lineTo(10, 1);
      ctx.quadraticCurveTo(13, 3, 15, -1);
      ctx.quadraticCurveTo(8, -2.5, 0, -2.5);
      ctx.quadraticCurveTo(-8, -2.5, -15, -1);
      ctx.fill();
      ctx.beginPath();       // slumped crown
      ctx.moveTo(-6, -1);
      ctx.quadraticCurveTo(-7, -8, -3, -9);
      ctx.quadraticCurveTo(1, -10, 5, -8);
      ctx.quadraticCurveTo(8, -6, 7, -1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'flat':     // parson's flat crown, dead-straight brim
      ctx.rect(-15, -2.5, 30, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(-6.5, -9.5, 13, 7.5);
      ctx.fill();
      break;
    case 'bowler':   // round dome, stubby brim
      ctx.ellipse(0, -1, 12, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -2, 7.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'wide':     // huge brim, low crown
      ctx.ellipse(0, -1, 19, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.quadraticCurveTo(0, -8.5, 6, -1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'crumpled': // beaten-up crown with a jagged top
      ctx.ellipse(0, -0.5, 13, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5.5, -1);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-2.5, -5.5);
      ctx.lineTo(0.5, -9);
      ctx.lineTo(3.5, -6);
      ctx.lineTo(6.5, -7.5);
      ctx.lineTo(6, -1);
      ctx.closePath();
      ctx.fill();
      break;
    default:         // 'stetson': proper cowboy hat — wide curled brim, creased crown
      ctx.moveTo(-16, -1);
      ctx.quadraticCurveTo(-15, -4.5, -12, -2.6);
      ctx.quadraticCurveTo(-6, -1.4, 0, -1.4);
      ctx.quadraticCurveTo(6, -1.4, 12, -2.6);
      ctx.quadraticCurveTo(15, -4.5, 16, -1);
      ctx.quadraticCurveTo(8, 1.8, 0, 1.8);
      ctx.quadraticCurveTo(-8, 1.8, -16, -1);
      ctx.fill();
      ctx.beginPath();       // creased crown
      ctx.moveTo(-6, -1.5);
      ctx.lineTo(-5.5, -8.5);
      ctx.quadraticCurveTo(-3, -11, -1, -8.6);  // crease dip
      ctx.quadraticCurveTo(1, -7.4, 3, -9.6);
      ctx.quadraticCurveTo(6, -10.5, 6.5, -8);
      ctx.lineTo(7, -1.5);
      ctx.closePath();
      ctx.fill();
  }
}

// Draw one cowboy. h = desired figure height in canvas px.
export function drawCowboy(ctx, anchorX, anchorY, h, facing, pose, look = {}) {
  if (!pose.visible || pose.alpha <= 0) return;
  const s = h / 100;
  const ink = look.ink || INK;
  const bw = look.w || 1;   // build width
  const bh = look.h || 1;   // build height
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pose.alpha * (look.alpha ?? 1)));
  ctx.translate(anchorX + pose.x * s, anchorY + pose.y * s);
  ctx.rotate(pose.rot * facing);
  ctx.scale(facing * s * pose.scaleX * bw, s * pose.scaleY * bh);

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drop = pose.kneel * 16;        // body drops when kneeling
  const hipY = -46 + drop - pose.breathe;
  const shoulderY = -76 + drop - pose.breathe;

  // Legs: slightly bow-legged, ending in proper boots
  ctx.lineWidth = 6.5;
  const bend = pose.kneel * 10;
  const bx = -pose.legSplit * 40 + pose.footB;   // back foot x
  const fx = pose.legSplit * 40 + pose.footF;    // front foot x
  const by = -Math.abs(pose.footB) * 0.18;
  const fy = -Math.abs(pose.footF) * 0.18;
  ctx.beginPath();
  ctx.moveTo(bx, by - 2);
  ctx.quadraticCurveTo(bx - 4, hipY * 0.5, -2.5 - bend * 0.4, hipY + bend * 0.5); // bowed
  ctx.moveTo(fx, fy - 2);
  ctx.quadraticCurveTo(fx + 4, hipY * 0.5, 2.5 + bend * 0.4, hipY + bend * 0.5);
  ctx.stroke();
  // boots: toe forward, little heel at the back
  for (const [X, Y] of [[bx, by], [fx, fy]]) {
    ctx.beginPath();
    ctx.moveTo(X - 3.5, Y - 5);
    ctx.lineTo(X - 3.5, Y);          // heel back
    ctx.lineTo(X - 1, Y);
    ctx.lineTo(X - 1, Y - 1.6);      // heel notch
    ctx.lineTo(X + 3, Y - 1.6);
    ctx.quadraticCurveTo(X + 7.5, Y - 1.6, X + 7.5, Y); // pointed toe
    ctx.lineTo(X + 3.5, Y - 5);
    ctx.closePath();
    ctx.fill();
  }
  // chaps fringe down the outside of each leg
  if (look.chaps) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      ctx.moveTo(bx * (1 - t) + -2.5 * t - 3, (by - 2) * (1 - t) + (hipY + 2) * t);
      ctx.lineTo(bx * (1 - t) + -2.5 * t - 6.5, (by - 2) * (1 - t) + (hipY + 2) * t + 3);
      ctx.moveTo(fx * (1 - t) + 2.5 * t + 3, (fy - 2) * (1 - t) + (hipY + 2) * t);
      ctx.lineTo(fx * (1 - t) + 2.5 * t + 6.5, (fy - 2) * (1 - t) + (hipY + 2) * t + 3);
    }
    ctx.stroke();
  }

  // holster on the front hip
  ctx.save();
  ctx.translate(7, hipY + 3);
  ctx.rotate(0.12);
  ctx.fillRect(-2.5, 0, 5.5, 10);
  ctx.restore();

  // Torso (leans from the hip): tapered — broad shoulders, narrow hip
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.lean);
  const shY = shoulderY - hipY;
  ctx.beginPath();
  ctx.moveTo(-5, 2);
  ctx.lineTo(-8, shY - 2);
  ctx.quadraticCurveTo(0, shY - 6.5, 8, shY - 2);
  ctx.lineTo(5, 2);
  ctx.closePath();
  ctx.fill();

  // long duster coat: skirt flaring down over the legs
  if (look.coat) {
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-10, 18);
    ctx.lineTo(-3, 17);
    ctx.moveTo(6, 0);
    ctx.lineTo(10, 18);
    ctx.lineTo(3, 17);
    ctx.lineTo(-3, 17);
    ctx.lineTo(-10, 18);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
  }

  // gun belt with a pale buckle
  ctx.fillRect(-6, -1, 12, 3.2);
  ctx.fillStyle = '#f4f3f0';
  const buck = look.buckle ? 3.4 : 2;
  ctx.fillRect(3 - buck / 2, -0.4, buck, 2);
  ctx.fillStyle = ink;

  // Off arm (far side)
  ctx.lineWidth = 5;
  ctx.save();
  ctx.translate(-3, shY + 4);
  ctx.rotate(Math.PI / 2 - pose.armOff * 0.35);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(22, 0);
  ctx.stroke();
  if (look.bottle) {
    // Bill's bottle, dangling from the off hand
    ctx.save();
    ctx.translate(24, 0);
    ctx.rotate(-Math.PI / 2 + pose.armOff * 0.35);
    ctx.fillRect(-2.2, 0, 4.4, 9);
    ctx.fillRect(-1, -4, 2, 5);
    ctx.restore();
  }
  ctx.restore();

  // Gun arm: rotates from shoulder. armGun 0.55 = down at holster, 0 = aim.
  ctx.save();
  ctx.translate(2, shY + 5);
  ctx.rotate(pose.armGun);
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(24, 0);
  ctx.stroke();
  if (!pose.gunGone && pose.gunDrawn) {
    if (look.hammer) {
      // Thomas doesn't hold with a pistol. He holds a hammer.
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(24, 2); ctx.lineTo(24, -12);
      ctx.stroke();
      ctx.fillRect(19, -17, 11, 6);
    } else {
      const gs = look.gunScale || 1;
      ctx.lineWidth = 4.5 * gs;
      ctx.beginPath();
      ctx.moveTo(24, 2);
      ctx.lineTo(24, -4 * gs);
      ctx.lineTo(24 + 14 * gs, -4 * gs);
      ctx.stroke();
    }
    if (pose.flash > 0) {
      // Muzzle flash: spiky star
      const gs = look.gunScale || 1;
      ctx.save();
      ctx.translate(24 + 18 * gs, -4 * gs);
      ctx.globalAlpha *= pose.flash;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = (7 + (i % 2) * 6) * gs;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  // Head + hat (on top of torso, inherits lean)
  ctx.save();
  ctx.translate(0, shY - 2);
  ctx.rotate(pose.headTilt);
  // neck + bandana knot
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -3); ctx.stroke();
  ctx.beginPath();               // neckerchief triangle at the back
  ctx.moveTo(-2, -1);
  ctx.lineTo(-8, 5);
  ctx.lineTo(1, 3);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(1, -10, 8, 0, Math.PI * 2);
  ctx.fill();
  if (look.glasses) {
    // The Doc's spectacles
    ctx.strokeStyle = '#f4f3f0';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(4, -11, 2.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(-2.5, -11, 2.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.1, -11); ctx.lineTo(1.4, -11); ctx.stroke();
    ctx.strokeStyle = ink;
  }
  // hat
  if (!pose.hatGone) {
    ctx.save();
    ctx.translate(0, -16 + pose.hatY);
    ctx.rotate(pose.hatRot);
    drawHat(ctx, look.hat);
    if (look.star) {
      // pale star emblem on the crown
      ctx.fillStyle = '#f4f3f0';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const px = Math.cos(a) * 2.6, py = -5 + Math.sin(a) * 2.6;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ink;
    }
    ctx.restore();
  }
  ctx.restore(); // head

  ctx.restore(); // torso
  ctx.restore(); // whole figure
}
