# Skribbl Clone

A real-time multiplayer drawing & guessing game (like skribbl.io), built with React, Node.js, and Socket.IO.

**Live demo:** https://skribbl-io-clone-jp6s.onrender.com/

---

## Setup Instructions

### Backend
```bash
cd server
npm install
node server.js
```

### Frontend
```bash
cd client
npm install
npm run dev
```

Open the frontend's local URL (usually `http://localhost:5173`) in two browser tabs to test with multiple players.

---

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Real-time:** Socket.IO (WebSockets)
- **Deployment:** Render (single service — Express serves both the API/WebSocket connections and the built React app)