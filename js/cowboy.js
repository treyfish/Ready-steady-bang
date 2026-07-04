// Procedural cowboy: a minimal black silhouette in profile, drawn on canvas.
// Everything is parameterized through a mutable `pose` so death animations
// can puppet the figure.
//
// Local coordinate system: origin at the ground point between the feet,
// y up is negative. The figure is ~100 units tall. `facing` = +1 means
// facing right (player on the left side), -1 faces left.

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
    kneel: 0,              // 0..1 knees bend / body drop
    headTilt: 0,
    hatY: 0,               // hat offset (for hat-fly deaths)
    hatRot: 0,
    hatGone: false,
    gunGone: false,
    flash: 0,              // muzzle flash intensity 0..1
    visible: true,
  };
}

// Draw one cowboy. h = desired figure height in canvas px.
export function drawCowboy(ctx, anchorX, anchorY, h, facing, pose) {
  if (!pose.visible || pose.alpha <= 0) return;
  const s = h / 100;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pose.alpha));
  ctx.translate(anchorX + pose.x * s, anchorY + pose.y * s);
  ctx.rotate(pose.rot * facing);
  ctx.scale(facing * s * pose.scaleX, s * pose.scaleY);

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drop = pose.kneel * 16;        // body drops when kneeling
  const hipY = -46 + drop;
  const shoulderY = -74 + drop;

  // Legs
  ctx.lineWidth = 5.5;
  const bend = pose.kneel * 10;
  ctx.beginPath(); // rear leg
  ctx.moveTo(0 - pose.legSplit * 40, 0);
  ctx.lineTo(-2 - bend * 0.4, hipY + bend * 0.5);
  ctx.moveTo(pose.legSplit * 40, 0); // front leg
  ctx.lineTo(2 + bend * 0.4, hipY + bend * 0.5);
  ctx.stroke();

  // Torso (leans from the hip)
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.lean);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, shoulderY - hipY);
  ctx.stroke();

  const shY = shoulderY - hipY;

  // Off arm (far side) — slightly grey to read as behind
  ctx.lineWidth = 4.5;
  ctx.save();
  ctx.translate(-1, shY + 4);
  ctx.rotate(Math.PI / 2 - pose.armOff * 0.35);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(22, 0);
  ctx.stroke();
  ctx.restore();

  // Gun arm: rotates from shoulder. armGun 0.55 = down at holster, 0 = aim.
  ctx.save();
  ctx.translate(1, shY + 5);
  ctx.rotate(pose.armGun);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(24, 0);
  ctx.stroke();
  if (!pose.gunGone) {
    // Pistol: L shape at the hand
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(24, 2);
    ctx.lineTo(24, -4);
    ctx.lineTo(38, -4);
    ctx.stroke();
    if (pose.flash > 0) {
      // Muzzle flash: spiky star
      ctx.save();
      ctx.translate(42, -4);
      ctx.globalAlpha *= pose.flash;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = 7 + (i % 2) * 6;
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
  // neck
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -3); ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(1, -10, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // hat
  if (!pose.hatGone) {
    ctx.save();
    ctx.translate(0, -16 + pose.hatY);
    ctx.rotate(pose.hatRot);
    ctx.beginPath(); // brim
    ctx.ellipse(1, 0, 13, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // crown
    ctx.moveTo(-5, 0);
    ctx.lineTo(-4.5, -8);
    ctx.quadraticCurveTo(1, -11, 6.5, -8);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore(); // head

  ctx.restore(); // torso
  ctx.restore(); // whole figure
}
