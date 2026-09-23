# Architecture Overview

This document explains how the three core systems — WebSockets, the drawing canvas, and game logic — integrate to make the app work in real time.

---

## High-Level Structure

- **Client** (`/client`) — React app. Renders UI and forwards user actions to the server. Holds no authoritative game state — it only displays what the server sends it.
- **Server** (`/server`) — Node.js + Express + Socket.IO. Owns all game state and logic. Every meaningful decision (whose turn it is, whether a guess is correct, scoring, round progression) happens here, never on the client.

This split matters because the client's code is fully visible and editable by the player (via browser dev tools). Keeping the server as the single source of truth prevents cheating — a player can't fake a correct guess or skip another player's turn, because the server independently verifies everything before broadcasting it to the room.

---

## WebSockets (Socket.IO)

Regular HTTP is one request → one response, then the connection closes — fine for loading pages, but unusable for a game where the server needs to push updates (a drawn stroke, a correct guess, a score change) to multiple clients the instant they happen, without being asked.

WebSockets solve this with a **single, persistent, two-way connection** between each client and the server. Once open, either side can send data at any time with minimal latency.

**Connection flow:**
1. Client loads the React app from the server (normal HTTP, just serving static files)
2. `socket.io-client` immediately opens a WebSocket connection back to the same server
3. The server assigns that connection a unique `socket.id`
4. From then on, client and server exchange named events (`create_room`, `draw`, `guess`, etc.) over that one open connection

**Rooms:** Socket.IO's `socket.join(roomCode)` tags a connection with a room label. `io.to(roomCode).emit(...)` then broadcasts only to sockets in that room — this is how multiple games run concurrently on one server without players in different rooms seeing each other's events.

---

## Canvas & Drawing Sync

There is no shared canvas on the server — each client renders its own independent `<canvas>` element using the HTML5 Canvas API. They all draw the same picture because they all receive the same stream of coordinate events.

**Flow per stroke:**
1. Drawer moves their mouse → browser captures `(x, y)` on every `mousemove`
2. Coordinates are emitted to the server (`draw` event) along with the room code
3. Server verifies the sender is the room's current drawer (ignores the event otherwise, preventing guessers from drawing)
4. Server re-broadcasts those coordinates to everyone else in the room
5. Each receiving client calls `ctx.lineTo(x, y); ctx.stroke();` on its own canvas

**Stroke history (for Undo):** each client keeps a local array of completed strokes (`{ points, color, size, isEraser }`). Undo pops the last stroke from that array and replays every remaining stroke from scratch (`clearRect` + redraw) — necessary because strokes can visually overlap, so a single stroke can't just be "erased" in place. An `draw_undo` event keeps this in sync: the drawer undoes locally, tells the server, and the server relays it so every guesser's canvas replays the same way.

---

## Game Logic & State

Each active room is a single JavaScript object held in server memory:

```js
{
  code, players: [{ id, name, score }],
  currentDrawer, currentPlayerIndex, currentRound,
  selectedWord, wordOptions, guessedPlayers, revealedIndices
}
```

**Turn/round flow:**
- `startTurn()` picks the next player as drawer, generates word options, resets per-turn tracking, and starts the draw timer + hint timers
- `choose_word` locks in the word and broadcasts only the blank length (never the word itself) to guessers
- `guess` checks the normalized guess against the normalized word server-side, awards decreasing points based on guess order, and broadcasts the result
- `endTurn()` fires when either the timer runs out or every guesser has guessed correctly — it advances `currentPlayerIndex`, rolls over to the next round when everyone's had a turn, and triggers `game_over` once all rounds are complete
- **Winner determination:** at game end, `players` is sorted by `score` descending — the top entry is the winner. No separate "winner" logic is needed since sorting the scores is the whole calculation.

**Hints:** three `setTimeout` calls spaced evenly across the draw timer each reveal one random un-revealed letter position, broadcast as an updated masked word.

**Known limitation:** state lives only in server memory, so it's lost on server restart/redeploy. A production version would persist this in Redis or a database instead.

---

## Why Deployment Is a Single Combined Service

Vercel/Netlify run backend code as short-lived serverless functions, which can't hold a persistent WebSocket connection open. Render runs the backend as a long-running process instead, so this app deploys as **one Render Web Service**: Express serves the built React static files for normal page loads, and the same server handles all Socket.IO connections — one URL, no cross-origin config needed.