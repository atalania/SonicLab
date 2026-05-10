# Sonic Lab — Portal leaderboard & cloud save (hub integration)

This game is embedded on the course portal at `/games/sonic-lab`. The portal owns auth and the database; **the iframe does not call Supabase directly**. Progress (including the number used for leaderboards) is stored in `game_data.data_json` via `postMessage` + portal APIs.

## Game identity

- **Slug (must match hub):** `sonic-lab`
- Leaderboard is **per-game, single track:** `overall` (no extra `?track=` values are defined for Sonic Lab on the hub).

## What the hub reads for “best score”

When building the leaderboard, the hub loads all rows for that game’s `game_id` and, **for each user**, takes the **maximum** score it can extract from saved JSON.

For `sonic-lab`, it uses the **first path that yields a finite number**, in this order:

1. `highScore`
2. `score`
3. `points`
4. `sonicLab.highScore`
5. `sonicLab.points`

**Rules:**

- Prefer **higher = better**. If your natural metric is lower-is-better (e.g. time), convert before save (e.g. invert or map to points).
- Use a real **number** (numeric strings are accepted by the hub, but prefer numbers).
- **Always persist at least one** of the paths above after the player beats their previous best, or the leaderboard will not update.

**Recommended saved shape (clearest for tooling and docs):**

```json
{
  "highScore": 12345,
  "score": 12345,
  "points": 12345,
  "lastPlayedAt": "2026-05-09T12:00:00.000Z"
}
```

You may also nest under `sonicLab` if that fits your state model:

```json
{
  "sonicLab": {
    "highScore": 12345,
    "points": 12345
  }
}
```

Because the hub walks paths in order, a **root `highScore`** is enough; nested fields are optional aliases.

## How data gets to the hub (iframe bridge)

**Flow:**

1. User opens the game in the portal iframe.
2. Portal loads `GET /api/game-data/sonic-lab` and sends the JSON into the iframe.
3. Your game merges local state with that payload.
4. On progress / new best score, your game sends **`PORTAL_GAME_DATA_SAVE`** with the **full merged** JSON object as `payload`.
5. Portal writes `PUT /api/game-data/sonic-lab` with `{ "data": <payload> }`.

**Message types (Protocol A):**

| Direction   | `type`                          | Notes |
|------------|----------------------------------|--------|
| Game → hub | `PORTAL_GAME_DATA_LOAD_REQUEST` | Ask for current cloud JSON |
| Hub → game | `PORTAL_GAME_DATA_LOADED`       | `payload` = object (may be `{}`) |
| Game → hub | `PORTAL_GAME_DATA_SAVE`         | `payload` = full merged save object |

Use `window.parent.postMessage({ type, payload }, targetOrigin)`. In practice the hub listens from the iframe; use `"*"` only if you must for local testing—tighten origin in production if you add validation on your side.

## Minimal vanilla JS helpers (copy into the game repo)

Create something like `js/portalGameData.js`:

```js
let portalOrigin = null;
const listeners = new Set();

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function post(type, payload) {
  if (!inIframe()) return;
  window.parent.postMessage({ type, payload }, portalOrigin || "*");
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function onMessage(event) {
  const data = event?.data;
  if (!data || typeof data !== "object") return;
  if (!portalOrigin) portalOrigin = event.origin;
  if (data.type === "PORTAL_GAME_DATA_LOADED") {
    const payload = normalizeObject(data.payload);
    listeners.forEach((fn) => fn(payload));
  }
}

export function initPortalGameDataBridge() {
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

export function fetchPortalGameData(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      listeners.delete(onLoaded);
      reject(new Error("Timed out waiting for PORTAL_GAME_DATA_LOADED"));
    }, timeoutMs);

    const onLoaded = (payload) => {
      window.clearTimeout(timer);
      listeners.delete(onLoaded);
      resolve(payload);
    };

    listeners.add(onLoaded);
    post("PORTAL_GAME_DATA_LOAD_REQUEST");
  });
}

export function savePortalGameData(data) {
  post("PORTAL_GAME_DATA_SAVE", normalizeObject(data));
}

/** Merge patch into current cloud snapshot and save (returns next full object). */
export function mergeAndSavePortalGameData(currentData, patch) {
  const next = { ...normalizeObject(currentData), ...normalizeObject(patch) };
  savePortalGameData(next);
  return next;
}

/** Keep portalData in sync: only increase highScore/score when run beats prior best. */
export function persistBestScore(portalData, runScore) {
  const base = normalizeObject(portalData);
  const prev = Number(base.highScore ?? base.score ?? base.points ?? 0);
  const run = Number(runScore);
  if (!Number.isFinite(run)) return base;
  const best = Math.max(prev, run);
  return mergeAndSavePortalGameData(base, {
    highScore: best,
    score: best,
    points: best,
  });
}
```

**Bootstrap in your entry (or main init):**

```js
import {
  initPortalGameDataBridge,
  fetchPortalGameData,
  persistBestScore,
} from "./portalGameData.js";

let portalData = {};
const cleanup = initPortalGameDataBridge();

fetchPortalGameData()
  .then((loaded) => {
    portalData = loaded;
    // TODO: merge loaded fields into your game state (volume, level, etc.)
  })
  .catch(() => {
    portalData = {};
  });

// When the player’s score increases and you want the leaderboard to see it:
// portalData = persistBestScore(portalData, state.points);
```

## Where to call save in Sonic Lab (suggested hook)

The hub’s integration notes point at:

- **Score source:** `state.points` (or your canonical “best run” number).
- **Hook:** right after points are updated from server/dialog logic (e.g. after you set `state.points` from a round result).

Whenever `state.points` (or your session total) **exceeds** the best already reflected in `portalData`, call:

```js
portalData = persistBestScore(portalData, state.points);
```

If you only save on “game over”, ensure that path still runs when the player sets a new record (not only on full completion).

## Verifying from the hub

1. Sign in on the portal, play Sonic Lab, trigger a save with a numeric `highScore` / `score` / `points`.
2. Open **Profile → Leaderboards**, choose **Sonic Lab**, confirm your row and score.
3. Optional (logged-in session / cookies as the portal uses):

   ```http
   GET /api/leaderboards?slug=sonic-lab&scope=global
   GET /api/leaderboards?slug=sonic-lab&scope=friends
   ```

   Success body includes `"ok": true`, `"slug": "sonic-lab"`, `"track": "overall"`, and `entries[]` with `bestScore`.

**Query params:** `scope` = `global` | `friends`; `limit` default 20, max 100.

## Common failures

- Saving only under a custom key not in the list above → **no leaderboard score**.
- Saving strings that are not numeric → ignored.
- Not calling `PORTAL_GAME_DATA_SAVE` after a new best → **stale** leaderboard.
- Testing while logged out → bridge may skip API writes; cloud JSON stays `{}`.

## Hub reference (for maintainers)

- Leaderboard score paths for `sonic-lab`: portal `TRACKED_SCORE_PATHS` / `extractHighScore` in leaderboards API route.
- Iframe bridge: portal `GameEmbed.tsx` (`PORTAL_GAME_DATA_*`).
- Persistence: `GET` / `PUT` `/api/game-data/[slug]`.
