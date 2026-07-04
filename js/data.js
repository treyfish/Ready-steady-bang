// Game data: opponents, death animations, timing constants.
// All timings in milliseconds.

export const TIMING = {
  // Delay after duel starts before "ready" appears
  readyDelay: 900,
  // Gap between ready -> steady (fixed, ~1.5-2s in the original)
  steadyGap: 1700,
  // Random window between steady -> bang ("sometimes immediately,
  // sometimes a long drawn-out lull")
  bangDelayMin: 600,
  bangDelayMax: 4800,
  // 2P only: if nobody draws within this window the round is re-run
  maxReaction: 1500,
  // Post-shot pause before death animation begins
  deathPause: 220,
  // Result card display time before next duel
  resultTime: 2600,
};

// The 10 outlaws — the REAL roster, recovered from the original's
// achievement list ("Beat Sloe Jim to get a hold of his revolver", etc.).
// Beat one and you take his trophy. Reaction means/spreads are tuned
// estimates (the original's exact values were never published); each
// outlaw also draws a touch faster with every standoff you win.
// Each outlaw carries a distinct silhouette via `look`:
// hat style, build (w/h), and signature props.
export const OPPONENTS = [
  { id: 1,  name: 'Sloe Jim',        trophy: 'his .22 revolver',           mean: 520, spread: 130,
    look: { hat: 'droop', w: 0.88, h: 0.94, slouch: 0.09 } },
  { id: 2,  name: 'Arthur Rightus',  trophy: 'his snubby',                 mean: 460, spread: 112,
    look: { hat: 'flat', w: 0.86, h: 1.08 } },
  { id: 3,  name: 'The Doc',         trophy: 'his .44 magnum',             mean: 410, spread: 96,
    look: { hat: 'bowler', w: 0.95, h: 0.97, glasses: true } },
  { id: 4,  name: 'Van Queef',       trophy: 'his .357 magnum',            mean: 365, spread: 82,
    look: { hat: 'stetson', w: 1.02, h: 1.04, coat: true } },
  { id: 5,  name: 'Aberdeen Bangus', trophy: 'his massive .500 magnum',    mean: 330, spread: 68,
    look: { hat: 'stetson', w: 1.32, h: 0.96, gunScale: 1.7 } },
  { id: 6,  name: 'Bill',            trophy: 'a bottle of his finest whiskey', mean: 298, spread: 56,
    look: { hat: 'crumpled', w: 1.02, h: 0.98, bottle: true, sway: true } },
  { id: 7,  name: 'Thomas',          trophy: 'his hammer',                 mean: 268, spread: 46,
    look: { hat: 'bowler', w: 1.16, h: 1.02, hammer: true } },
  { id: 8,  name: 'Chaps',           trophy: 'his copy of Cowboy Gossip',  mean: 240, spread: 36,
    look: { hat: 'wide', w: 1.05, h: 0.99, chaps: true } },
  { id: 9,  name: 'Texas',           trophy: 'his prized cowboy skull collection', mean: 214, spread: 27,
    look: { hat: 'stetson', w: 1.1, h: 1.05, star: true, buckle: true, gunScale: 1.2 } },
  { id: 10, name: 'The Mystery Man', trophy: 'the mystery prize',          mean: 188, spread: 18,
    look: { hat: 'flat', w: 0.98, h: 1.06, ink: '#8f8e8a', alpha: 0.92 } },
];

// Victory dances — the winner celebrates with one of these after taking
// a series (the original's "victory dance").
export const DANCES = ['hat-wave', 'gun-twirl', 'heel-click', 'jig', 'bow'];

// Beat an outlaw by winning this many standoffs against him (losses don't
// reset your tally — you just square up again).
export const KILLS_TO_BEAT = 5;
// How much faster the outlaw gets per standoff you've already won (fraction of mean).
export const OPPONENT_RAMP = 0.035;

// 2-player: a match is a set of 1, 3 or 5 duels.
export const TWO_P_SETS = [1, 3, 5];

// 31 unique cowboy deaths, unlocked one per new kill (in shuffled-but-stable order).
// Each id maps to a procedural animation in deaths.js.
export const DEATHS = [
  { id: 'stiff-back',    name: 'Timber',            desc: 'Falls flat on his back, stiff as a board.' },
  { id: 'stiff-front',   name: 'Face Plant',        desc: 'Tips forward like a felled tree.' },
  { id: 'knees-first',   name: 'Repentance',        desc: 'Drops to his knees, then keels over.' },
  { id: 'spin-360',      name: 'Pirouette',         desc: 'Spins a full turn before crumpling.' },
  { id: 'hat-clutch',    name: 'Last Respects',     desc: 'Takes his hat off, holds it to his chest, drops.' },
  { id: 'stagger-fall',  name: 'Three Steps West',  desc: 'Staggers three steps, then collapses.' },
  { id: 'launch-up',     name: 'Sky Burial',        desc: 'Blasted clean off his feet.' },
  { id: 'coffin',        name: 'Express Checkout',  desc: 'A coffin drops from above and takes him.' },
  { id: 'angel',         name: 'The Ascension',     desc: 'His soul floats up and away.' },
  { id: 'tumbleweed',    name: 'Tumbleweed',        desc: 'Rolls away like a tumbleweed.' },
  { id: 'crumble',       name: 'Dust to Dust',      desc: 'Crumbles into a pile of dust.' },
  { id: 'hat-fly',       name: 'Hat Trick',         desc: 'Hat flies sky-high, body follows the other way.' },
  { id: 'sit-slump',     name: 'Taking Five',       desc: 'Sits down slowly, then slumps sideways.' },
  { id: 'backflip',      name: 'Showman',           desc: 'A full backflip, stuck landing... flat.' },
  { id: 'melt',          name: 'The Big Melt',      desc: 'Melts into a puddle of shadow.' },
  { id: 'bounce',        name: 'Rubber Bones',      desc: 'Bounces twice before settling.' },
  { id: 'moonwalk',      name: 'The Slow Goodbye',  desc: 'Moonwalks off the edge of the screen.' },
  { id: 'headstand',     name: 'Wrong Way Up',      desc: 'Dies in a perfect headstand.' },
  { id: 'shatter',       name: 'Glass Jaw',         desc: 'Shatters like dropped china.' },
  { id: 'deflate',       name: 'Full of Hot Air',   desc: 'Deflates like a punctured balloon.' },
  { id: 'lasso-up',      name: 'The Hook',          desc: 'Yanked offstage by an unseen rope.' },
  { id: 'gravestone',    name: 'Instant Memorial',  desc: 'A gravestone falls and plants itself on him.' },
  { id: 'spin-drill',    name: 'Six Feet Under',    desc: 'Spins like a drill straight into the ground.' },
  { id: 'firework',      name: 'Roman Candle',      desc: 'Pops into a shower of sparks.' },
  { id: 'flatten',       name: 'Steamrolled',       desc: 'Flattens into a paper-thin cutout that drifts down.' },
  { id: 'crawl',         name: 'Not Like This',     desc: 'Crawls one last foot, then gives up the ghost.' },
  { id: 'vulture',       name: 'Carrion Call',      desc: 'A vulture swoops down and carries him off.' },
  { id: 'split',         name: 'Clean Cut',         desc: 'Slides apart in two neat halves.' },
  { id: 'bury-self',     name: 'DIY Funeral',       desc: 'Digs his own grave and climbs in.' },
  { id: 'star-spin',     name: 'Seeing Stars',      desc: 'Stars circle his head as he wobbles and drops.' },
  { id: 'salute',        name: 'The Long Salute',   desc: 'One last salute, then down he goes.' },
];

// Rank by average draw speed. The bullet tiers mirror the original's
// achievements: gold < 0.16s, silver < 0.20s, bronze < 0.25s average.
export const RANK_TABLE = [
  { max: 160,      label: 'Gold Bullet' },
  { max: 200,      label: 'Silver Bullet' },
  { max: 250,      label: 'Bronze Bullet' },
  { max: 300,      label: 'Deadeye' },
  { max: 360,      label: 'Deputy' },
  { max: 450,      label: 'Ranch Hand' },
  { max: Infinity, label: 'Tenderfoot' },
];
