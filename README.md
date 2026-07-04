# ready steady bang.

A fan-made, personal-use clone of **Ready Steady Bang** — the 2011 minimalist
quick-draw duelling game by Chambers Judd / Animade (published by Cowboy Games).
All art, code and audio here are original and procedural; the mechanics and
greyscale spirit follow the original as documented in press, store listings
and gameplay footage.

## Play

No build step, no dependencies. Either open `index.html` directly, or serve
the folder (needed on some browsers because the game uses ES modules):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Works with mouse, touch, or keyboard (Space to draw in one-player; **A** vs
**L** in two-player).

## It's an installable web app

The game ships as a PWA: a web app manifest, app icons, and an
offline-first service worker that precaches everything. Serve it from any
static host over HTTPS (GitHub Pages, Vercel, Netlify...) and:

- on iPhone: Safari → Share → **Add to Home Screen**
- on Android: Chrome → menu → **Install app**

It then launches fullscreen in portrait with its own icon and works with
no connection.

**Live deployment:** the game is served by GitHub Pages from the
`gh-pages` branch at https://treyfish.github.io/Ready-steady-bang/ .
To ship an update, copy the game files onto that branch and push:

```sh
git worktree add /tmp/ghp gh-pages
cp -r index.html css js icons manifest.webmanifest sw.js /tmp/ghp/
cd /tmp/ghp && git add -A && git commit -m "deploy" && git push
```

(An Actions-based deploy workflow also exists in
`.github/workflows/pages.yml` for manual dispatch if you switch the Pages
source to "GitHub Actions".)

## How it plays (faithful to the original)

- A deadpan voice counts **ready… steady…** and then, after a *random* delay
  (sometimes instantly, sometimes an agonising lull), **bang!**
- Tap/click/press once to draw. First shot wins the duel.
- Draw **before** the bang and you've false-started — the other cowboy calmly
  guns you down.
- **One player**: face 10 outlaws, each with a faster draw. Win **5 standoffs**
  against an outlaw to take him down (and take his gun); he draws a little
  faster after every kill you score. Losses never reset you — square up again.
- **Two player**: one device laid flat, each player taps their own half
  (sets of 1, 3 or 5 duels). False starts lose the duel.
- Your draw time is shown in fractional seconds after every duel, alongside
  your opponent's.
- **31 unique cowboy deaths**, one unlocked per kill, replayable from the
  **Kill Gallery**.
- **Stats**: fastest draw, average draw, rank, wins/losses, false starts.
  Progress persists in `localStorage`.

## Structure

```
index.html      screens & layout
css/style.css   greyscale minimal styling
js/main.js      state machine, duel controller, menus, persistence
js/data.js      opponents, timing constants, the 31 deaths
js/cowboy.js    procedural cowboy silhouette renderer (canvas)
js/deaths.js    the 31 procedural death animations + props
js/audio.js     Web Audio synthesized SFX + speech-synthesis announcer
```

## Deliberate deviations from the original

- The game runs in a portrait frame like the original app (letterboxed to a
  phone-shaped column on wide screens), with the original's mirrored duel
  layout: your cowboy stands at the bottom, the opponent hangs reflected
  from the top, each owning half the screen. In 2P the second player takes
  the top half with an upside-down word display.
- The 10 outlaws each have a distinct silhouette (build, hat, and signature
  props — The Doc's spectacles, Bill's bottle, Thomas's hammer, Aberdeen
  Bangus's massive iron, the Mystery Man's grey ghost figure...); these
  designs are original, since no imagery of the real roster is documented.
- Winners celebrate: a pistol-twirl re-holster after each round, and one of
  five victory dances (hat-wave, gun-twirl, heel-click, jig, stage bow)
  after taking a series — echoing the original's victory dance.
- The 10 outlaws use the original's real roster, recovered from its
  achievement list (Sloe Jim, Arthur Rightus, The Doc, Van Queef, Aberdeen
  Bangus, Bill, Thomas, Chaps, Texas, The Mystery Man — each dropping his
  documented trophy). Their reaction times are tuned estimates; the real
  values were never published.
- Death animations are original inventions in the original's slapstick
  spirit; the three documented ones (clutch-and-slump, 360° spin, stiff
  backward flop) are included, and — as in the original — the 31st death
  only unlocks when you beat the final outlaw.
- Game Center / online leaderboards replaced by local stats and a rank table
  whose bullet tiers mirror the original's bronze/silver/gold average-draw
  achievements (<0.25s / <0.20s / <0.16s).
