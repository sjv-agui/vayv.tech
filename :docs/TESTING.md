# TESTING.md
> How to run Soki locally and play through a full game session.
> No experience needed. Follow the steps in order.

---

## Step 1 — Start the backend (the brain)

Open a terminal. Copy and paste this exactly:

```bash
cd "/Users/sejara/Documents/GitHub/vayv.tech/soki" && DEMO_MODE=true node server.js
```

You should see:
```
soki backend → http://localhost:3000
```

**Leave this terminal running.** If you close it, the game stops working.

> `DEMO_MODE=true` means you can test with just 2 people (1 host + 1 player) instead of 10.

---

## Step 2 — Open the lobby (the waiting room)

In VS Code, find the file `soki/join/index.html`.
Right-click it → **Open with Live Server**.

Your browser opens at something like:
```
http://127.0.0.1:5500/soki/join/index.html
```

This is the lobby — where people join before the game starts.

---

## Step 3 — Play a full round (2 browser tabs)

You need **2 tabs** to test — one acting as the host, one as a player.

### Tab A — Host
1. Open the lobby URL above
2. Click **create game_**
3. Enter any name → you're the host
4. You'll see a session code (like `ABC123`) — keep this tab open

### Tab B — Player
1. Open the lobby URL in an **Incognito window** (so it has a separate identity)
2. Click **join game_**
3. Enter the session code from Tab A + any name

### Back to Tab A — Start
- Once the player count shows **1 player** (the joiner), the host can click **start game_**
- Both tabs automatically move to the `/play/` page

---

## Step 4 — Run a round

Once on the play page:

| Who | Does what |
|---|---|
| **Host** | Clicks **start next round_** |
| **Players** | See their character + the fragments they hold |
| **Everyone** | Discusses IRL (the app just shows the info) |
| **Host** | Clicks **open vote_** when ready |
| **Players** | Pick an answer and submit |
| **Host** | Clicks **end round_** → outcome appears (soki or truth) |

Repeat for rounds 2 and 3.

---

## Reset — start completely fresh

If something looks broken or you want to start over:

**Option A — use the button in the app**
- On the play page, the host panel has a **reset session_** button at the bottom
- Click it → confirms → wipes everything → sends you back to the lobby

**Option B — use the terminal**
```bash
curl -X POST http://localhost:3000/api/admin/reset
```
Then clear your browser's saved session:
- Open Chrome DevTools (F12) → Console tab → paste:
```js
localStorage.clear(); location.reload();
```
- Do this in every open tab

---

## Something went wrong?

| What you see | What to do |
|---|---|
| `EADDRINUSE :::3000` | Something else is using port 3000. Run: `lsof -ti:3000 \| xargs kill -9` then start the server again |
| `no active realm` or `connection failed` | The server can't reach the database. Make sure you started it with the full `cd ...` command in Step 1 |
| `need at least 1 players to start` | The host doesn't count — you need at least 1 other person to join |
| Play page is blank or shows "no active session" | Your session expired. Go back to the lobby and join or create again |
| Fragments not visible | Normal — each player holds fragments about *other* characters, not themselves |
| Vote panel not showing | The host hasn't clicked **open vote_** yet |

---

## URLs at a glance

| Page | URL |
|---|---|
| Lobby (join here) | `http://127.0.0.1:5500/soki/join/index.html` |
| Game (auto-redirect) | `http://127.0.0.1:5500/soki/play/index.html` |
| API health check | `http://localhost:3000/` |
