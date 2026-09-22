const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const app = express();

const rooms = new Map();

const words = [
    "apple",
    "car",
    "house",
    "tree",
    "guitar",
    "pizza",
    "football",
    "computer",
    "elephant",
    "rocket"
];

const TOTAL_ROUNDS = 3;
const DRAW_TIME_MS = 60 * 1000; // 60 seconds per turn
const HINT_COUNT = 3;


// Generate room code
function generateRoomCode() {

    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
}


// Get random words
function getRandomWords(count) {

    const shuffled = [...words]
        .sort(() => Math.random() - 0.5);

    return shuffled.slice(0, count);
}


// Build the current masked word from revealed indices

function buildMaskedWord(word, revealedIndices) {

    return word
        .split("")
        .map((char, i) => {

            if (char === " ") return " ";

            return revealedIndices.includes(i) ? char : "_";

        });

}


// Reveal one more random un-revealed letter

function revealNextHint(roomCode) {

    const room = rooms.get(roomCode);

    if (!room || !room.selectedWord) return;

    const word = room.selectedWord;

    const availableIndices = word
        .split("")
        .map((char, i) => ({ char, i }))
        .filter(({ char, i }) =>
            char !== " " && !room.revealedIndices.includes(i)
        )
        .map(({ i }) => i);

    if (availableIndices.length === 0) return;

    const randomIndex =
        availableIndices[
            Math.floor(Math.random() * availableIndices.length)
        ];

    room.revealedIndices.push(randomIndex);

    console.log(
        "Hint revealed in",
        roomCode,
        "->",
        buildMaskedWord(word, room.revealedIndices).join("")
    );

    io.to(roomCode).emit(
        "hint",
        {
            masked: buildMaskedWord(word, room.revealedIndices)
        }
    );

}


// =========================
// START A NEW TURN
// (new drawer, new word options)
// =========================

function startTurn(roomCode) {

    const room = rooms.get(roomCode);

    if (!room) return;

    room.currentDrawer =
        room.players[room.currentPlayerIndex].id;

    room.wordOptions = getRandomWords(3);

    room.selectedWord = null;

    room.guessedPlayers = [];

    room.revealedIndices = [];

    clearRoomTimers(room);

    console.log(
        `Round ${room.currentRound} — new turn — drawer: ${room.currentDrawer}`
    );

    io.to(roomCode).emit(
        "round_start",
        {
            currentRound: room.currentRound,
            currentDrawer: room.currentDrawer,
            drawTime: DRAW_TIME_MS
        }
    );

    // Send word options ONLY to the drawer

    io.to(room.currentDrawer).emit(
        "word_options",
        room.wordOptions
    );

}


// Clear all pending timers for a room (main + hints)

function clearRoomTimers(room) {

    if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
    }

    if (room.hintTimers) {
        room.hintTimers.forEach((t) => clearTimeout(t));
    }

    room.hintTimers = [];

}


// =========================
// END CURRENT TURN
// (word guessed by all, or time ran out)
// =========================

function endTurn(roomCode) {

    const room = rooms.get(roomCode);

    if (!room) return;

    clearRoomTimers(room);

    io.to(roomCode).emit(
        "round_end",
        {
            word: room.selectedWord,
            players: room.players
        }
    );

    // Move to next player

    room.currentPlayerIndex += 1;

    // Everyone has drawn this round?

    if (room.currentPlayerIndex >= room.players.length) {

        room.currentPlayerIndex = 0;

        room.currentRound += 1;

    }

    // Game over?

    if (room.currentRound > TOTAL_ROUNDS) {

        const leaderboard = [...room.players]
            .sort((a, b) => (b.score || 0) - (a.score || 0));

        io.to(roomCode).emit(
            "game_over",
            {
                winner: leaderboard[0],
                leaderboard
            }
        );

        console.log("Game over:", roomCode);

        return;

    }

    // Otherwise start the next turn after a short delay
    // so players can see round_end results first

    setTimeout(() => {
        startTurn(roomCode);
    }, 3000);

}


// Check if every guesser has guessed correctly —
// if so, end the turn early

function checkAllGuessed(room, roomCode) {

    const guesserCount = room.players.length - 1;

    if (guesserCount > 0 && room.guessedPlayers.length >= guesserCount) {

        endTurn(roomCode);

    }

}


app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});


// =========================
// SERVE REACT BUILD
// =========================

app.use(express.static(path.join(__dirname, "../client/dist")));


io.on("connection", (socket) => {

    console.log("Player connected:", socket.id);


    // =========================
    // CREATE ROOM
    // =========================

    socket.on("create_room", ({ playerName }) => {

        const roomCode = generateRoomCode();

        const room = {

            code: roomCode,

            hostId: socket.id,

            players: [
                {
                    id: socket.id,
                    name: playerName,
                    score: 0
                }
            ]

        };

        rooms.set(roomCode, room);

        socket.join(roomCode);

        socket.emit("room_created", room);

        console.log("Room created:", room);

    });


    // =========================
    // JOIN ROOM
    // =========================

    socket.on("join_room", ({ roomCode, playerName }) => {

        const cleanCode = roomCode.trim().toUpperCase();

        const room = rooms.get(cleanCode);

        console.log(
            "Join request:",
            cleanCode,
            playerName
        );


        if (!room) {

            console.log("Room not found");

            return;
        }


        room.players.push({

            id: socket.id,

            name: playerName,

            score: 0

        });


        socket.join(cleanCode);


        io.to(cleanCode).emit(
            "room_updated",
            room
        );


        console.log(
            "Player joined:",
            playerName
        );

        console.log(
            "Updated room:",
            room
        );

    });


    // =========================
    // START GAME
    // =========================

    socket.on("start_game", (roomCode) => {

        const room = rooms.get(roomCode);


        if (!room) {

            console.log("Room not found");

            return;
        }


        // Only host can start

        if (room.hostId !== socket.id) {

            console.log(
                "Only host can start the game"
            );

            return;
        }


        // Need at least 2 players

        if (room.players.length < 2) {

            console.log(
                "Not enough players"
            );

            return;
        }


        // =========================
        // GAME STATE
        // =========================

        room.gameStarted = true;

        room.currentRound = 1;

        room.currentPlayerIndex = 0;


        console.log(
            "Game started:",
            roomCode
        );


        // Tell everyone game has started

        io.to(roomCode).emit(
            "game_started",
            {
                roomCode: room.code
            }
        );


        // Kick off the first turn

        startTurn(roomCode);

    });


    // =========================
    // CHOOSE WORD
    // =========================

    socket.on(
        "choose_word",
        ({ roomCode, word }) => {

            const room = rooms.get(roomCode);

            if (!room) return;

            if (socket.id !== room.currentDrawer) {
                return;
            }

            room.selectedWord = word;

            room.roundStartTime = Date.now();

            room.guessedPlayers = [];

            room.revealedIndices = [];

            console.log(
                "Word chosen:",
                word,
                "in room",
                roomCode
            );

            io.to(roomCode).emit(
                "word_selected",
                {
                    wordLength: word.length
                }
            );

            // Main round timer — end turn if time runs out

            room.roundTimer = setTimeout(() => {
                endTurn(roomCode);
            }, DRAW_TIME_MS);

            // Schedule hints evenly spaced through the round,
            // e.g. HINT_COUNT=3 on a 60s timer -> 15s, 30s, 45s

            room.hintTimers = [];

            const interval = DRAW_TIME_MS / (HINT_COUNT + 1);

            for (let i = 1; i <= HINT_COUNT; i++) {

                const timer = setTimeout(() => {
                    revealNextHint(roomCode);
                }, interval * i);

                room.hintTimers.push(timer);

            }

        }
    );


    // =========================
    // GUESS
    // =========================

    socket.on(
        "guess",
        ({ roomCode, text }) => {

            const room = rooms.get(roomCode);

            if (!room || !room.selectedWord) return;

            if (socket.id === room.currentDrawer) {
                return;
            }

            const player = room.players.find(
                (p) => p.id === socket.id
            );

            if (!player) return;

            if (room.guessedPlayers.includes(socket.id)) {
                return;
            }

            const normalizedGuess = text.trim().toLowerCase();

            const normalizedWord = room.selectedWord.trim().toLowerCase();

            const isCorrect = normalizedGuess === normalizedWord;

            if (isCorrect) {

                room.guessedPlayers.push(socket.id);

                const order = room.guessedPlayers.length;

                const points = Math.max(
                    100 - (order - 1) * 20,
                    20
                );

                player.score = (player.score || 0) + points;

                io.to(roomCode).emit(
                    "guess_result",
                    {
                        correct: true,
                        playerId: socket.id,
                        playerName: player.name,
                        points
                    }
                );

                checkAllGuessed(room, roomCode);

            } else {

                io.to(roomCode).emit(
                    "chat_message",
                    {
                        playerId: socket.id,
                        playerName: player.name,
                        text
                    }
                );

            }

        }
    );


    // =========================
    // DRAWING
    // =========================

    socket.on(
        "start_stroke",
        ({ roomCode, x, y, color, size, isEraser }) => {

            const room = rooms.get(roomCode);

            if (!room) return;

            if (socket.id !== room.currentDrawer) {
                return;
            }

            socket.to(roomCode).emit(
                "start_stroke",
                {
                    x,
                    y,
                    color,
                    size,
                    isEraser
                }
            );

        }
    );


    socket.on(
        "draw",
        ({ roomCode, x, y }) => {

            const room = rooms.get(roomCode);

            if (!room) return;

            if (socket.id !== room.currentDrawer) {
                return;
            }

            socket.to(roomCode).emit(
                "draw",
                {
                    x,
                    y
                }
            );

        }
    );


    socket.on(
        "end_stroke",
        ({ roomCode }) => {

            const room = rooms.get(roomCode);

            if (!room) return;

            if (socket.id !== room.currentDrawer) {
                return;
            }

            socket.to(roomCode).emit(
                "end_stroke"
            );

        }
    );


    socket.on(
        "canvas_clear",
        ({ roomCode }) => {

            const room = rooms.get(roomCode);

            if (!room) return;

            if (socket.id !== room.currentDrawer) {
                return;
            }

            socket.to(roomCode).emit(
                "canvas_clear"
            );

        }
    );


    // DISCONNECT

    socket.on("disconnect", () => {

        console.log(
            "Player disconnected:",
            socket.id
        );

    });

});


// Catch-all route — anything not handled above
// (and not an API/socket route) gets the React app,
// so client-side routing works on refresh too

app.get(/.*/, (req, res) => {

    res.sendFile(
        path.join(__dirname, "../client/dist/index.html")
    );

});


const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );

});