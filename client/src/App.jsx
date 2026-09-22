import DrawingCanvas from "./components/DrawingCanvas";
import { useEffect, useState } from "react";
import socket from "./services/socket";

function App() {

    const [room, setRoom] = useState(null);
    const [name, setName] = useState("");
    const [roomCode, setRoomCode] = useState("");

    const [gameStarted, setGameStarted] = useState(false);
    const [gameData, setGameData] = useState(null); // { currentRound, currentDrawer, drawTime }

    // WORD STATES

    const [wordOptions, setWordOptions] = useState([]);
    const [selectedWord, setSelectedWord] = useState(null);
    const [maskedWord, setMaskedWord] = useState([]);

    // CHAT / GUESS STATES

    const [guessText, setGuessText] = useState("");
    const [messages, setMessages] = useState([]); // { type: "chat" | "correct", playerName, text, points }

    // ROUND END / GAME OVER STATES

    const [roundEndInfo, setRoundEndInfo] = useState(null); // { word, players }
    const [gameOverInfo, setGameOverInfo] = useState(null); // { winner, leaderboard }


    useEffect(() => {

        console.log("Frontend connected:", socket.id);


        // ROOM CREATED

        socket.on("room_created", (room) => {

            console.log("Room received:", room);

            setRoom(room);

        });


        // ROOM UPDATED

        socket.on("room_updated", (updatedRoom) => {

            console.log("Room updated:", updatedRoom);

            setRoom(updatedRoom);

        });


        // GAME STARTED
        // Just flips the screen — actual drawer/word info
        // comes from round_start right after this

        socket.on("game_started", () => {

            console.log("Game started");

            setGameStarted(true);

            setGameOverInfo(null);

            setMessages([]);

        });


        // ROUND START
        // Fired at the beginning of every turn — new drawer, new round number

        socket.on("round_start", (data) => {

            console.log("Round start:", data);

            setGameData(data);

            setSelectedWord(null);

            setWordOptions([]);

            setMaskedWord([]);

            setRoundEndInfo(null);

        });


        // ROUND END
        // Fired when word is guessed by everyone, or time runs out

        socket.on("round_end", (data) => {

            console.log("Round end:", data);

            setRoundEndInfo(data);

            // sync scores from the authoritative player list

            setRoom((prevRoom) => {

                if (!prevRoom) return prevRoom;

                return { ...prevRoom, players: data.players };

            });

        });


        // GAME OVER

        socket.on("game_over", (data) => {

            console.log("Game over:", data);

            setGameOverInfo(data);

            setGameStarted(false);

        });


        // WORD OPTIONS
        // Only drawer receives this

        socket.on("word_options", (words) => {

            console.log("Word options:", words);

            setWordOptions(words);

        });


        // WORD SELECTED
        // Everyone receives this

       socket.on("word_selected", (data) => {

    console.log("Word selected:", data);

    setMaskedWord(Array(data.wordLength).fill("_"));

});

socket.on("hint", (data) => {

    console.log("Hint:", data);

    setMaskedWord(data.masked);

});


        // GUESS RESULT
        // Fired only on a correct guess

        socket.on("guess_result", (data) => {

            console.log("Guess result:", data);

            if (data.correct) {

                setMessages((prev) => [

                    ...prev,

                    {
                        type: "correct",
                        playerName: data.playerName,
                        points: data.points
                    }

                ]);

                setRoom((prevRoom) => {

                    if (!prevRoom) return prevRoom;

                    return {

                        ...prevRoom,

                        players: prevRoom.players.map((p) =>

                            p.id === data.playerId

                                ? { ...p, score: (p.score || 0) + data.points }

                                : p

                        )

                    };

                });

            }

        });


        // CHAT MESSAGE
        // Wrong guesses / general chat

        socket.on("chat_message", (data) => {

            console.log("Chat message:", data);

            setMessages((prev) => [

                ...prev,

                {
                    type: "chat",
                    playerName: data.playerName,
                    text: data.text
                }

            ]);

        });


        // CLEANUP

        return () => {

            socket.off("room_created");

            socket.off("room_updated");

            socket.off("game_started");

            socket.off("round_start");

            socket.off("round_end");

            socket.off("game_over");

            socket.off("word_options");

            socket.off("word_selected");

            socket.off("guess_result");

            socket.off("chat_message");
            socket.off("hint");

        };

    }, []);


    // CHOOSE WORD

    const handleChooseWord = (word) => {

        console.log("Selected word:", word);

        setSelectedWord(word);

        socket.emit("choose_word", {

            roomCode: room.code,

            word: word

        });

    };


    // SEND GUESS

    const handleSendGuess = () => {

        if (!guessText.trim()) return;

        socket.emit("guess", {

            roomCode: room.code,

            text: guessText

        });

        setGuessText("");

    };


    // CREATE ROOM

    const handleCreateRoom = () => {

        socket.emit("create_room", {

            playerName: name

        });

    };


    // JOIN ROOM

    const handleJoinRoom = () => {

        socket.emit("join_room", {

            roomCode: roomCode,

            playerName: name

        });

    };


    const isDrawerNow = gameData && socket.id === gameData.currentDrawer;


    return (

        <div>

            {/* =========================
               GAME OVER SCREEN
            ========================= */}

            {gameOverInfo && (

                <div>

                    <h1>🏆 Game Over!</h1>

                    <h2>
                        Winner: {gameOverInfo.winner?.name}
                    </h2>

                    <h3>Final Leaderboard</h3>

                    <ul>

                        {gameOverInfo.leaderboard.map((player) => (

                            <li key={player.id}>
                                {player.name}: {player.score || 0}
                            </li>

                        ))}

                    </ul>

                </div>

            )}


            {!gameOverInfo && !gameStarted && (

                /* =========================
                   LOBBY
                ========================= */

                <div>

                    <h1>Skribbl Clone</h1>


                    {/* PLAYER NAME */}

                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) =>
                            setName(e.target.value)
                        }
                    />


                    <br />
                    <br />


                    {/* CREATE ROOM */}

                    <button
                        onClick={handleCreateRoom}
                    >
                        Create Room
                    </button>


                    <br />
                    <br />


                    {/* ROOM CODE */}

                    <input
                        type="text"
                        placeholder="Enter room code"
                        value={roomCode}
                        onChange={(e) =>
                            setRoomCode(e.target.value)
                        }
                    />


                    {/* JOIN ROOM */}

                    <button
                        onClick={handleJoinRoom}
                    >
                        Join Room
                    </button>


                    {/* ROOM */}

                    {room && (

                        <div>

                            <h2>Room 🎮</h2>


                            <p>
                                Room Code: {room.code}
                            </p>


                            {/* PLAYER LIST */}

                            <h3>Players</h3>


                            <ul>

                                {room.players.map((player) => (

                                    <li key={player.id}>

                                        {player.id === room.hostId
                                            ? "👑"
                                            : "👤"
                                        }

                                        {" "}

                                        {player.name}

                                    </li>

                                ))}

                            </ul>


                            {/* START GAME */}

                            {socket.id === room.hostId && (

                                <button
                                    onClick={() =>
                                        socket.emit(
                                            "start_game",
                                            room.code
                                        )
                                    }
                                >
                                    Start Game
                                </button>

                            )}

                        </div>

                    )}

                </div>

            )}


            {!gameOverInfo && gameStarted && gameData && (

                /* =========================
                   GAME
                ========================= */

                <div style={{ display: "flex", gap: "20px" }}>

                    <div>

                        <h1>Game Started 🎨</h1>


                        <p>
                            Round: {gameData.currentRound}
                        </p>


                        <p>

                            Current Drawer:{" "}

                            {room.players.find(
                                (player) =>
                                    player.id ===
                                    gameData.currentDrawer
                            )?.name}

                        </p>


                        {/* =========================
                           ROUND END BANNER
                        ========================= */}

                        {roundEndInfo && (

                            <div style={{
                                background: "#fff3cd",
                                padding: "10px",
                                marginBottom: "10px"
                            }}>

                                <p>

                                    The word was:{" "}

                                    <strong>{roundEndInfo.word}</strong>

                                </p>

                                <p>Next round starting...</p>

                            </div>

                        )}


                        {/* =========================
                           DRAWER
                        ========================= */}

                        {!roundEndInfo && isDrawerNow && (

                            <div>

                                <h2>
                                    🎨 You are the drawer!
                                </h2>


                                {/* WORD OPTIONS */}

                                {wordOptions.length > 0 && !selectedWord && (

                                    <div>

                                        <h3>
                                            Choose a word:
                                        </h3>


                                        {wordOptions.map((word) => (

                                            <button
                                                key={word}
                                                onClick={() =>
                                                    handleChooseWord(word)
                                                }
                                            >
                                                {word}
                                            </button>

                                        ))}

                                    </div>

                                )}


                                {/* SELECTED WORD */}

                                {selectedWord && (

                                    <div>

                                        <h2>
                                            Your word:
                                        </h2>

                                        <h1>
                                            {selectedWord}
                                        </h1>

                                    </div>

                                )}

                            </div>

                        )}


                        {!roundEndInfo && !isDrawerNow && (

                            /* =========================
                               GUESSER
                            ========================= */

                            <div>

                                <h2>
                                    👀 Watch the drawing...
                                </h2>


                                {/* WORD HINT */}

                               {maskedWord.length > 0 && (
    <h2>
        {maskedWord.join(" ")}
    </h2>
)}
                            </div>

                        )}


                        {/* =========================
                           CANVAS
                        ========================= */}

                        <DrawingCanvas
                            roomCode={room.code}
                            isDrawer={isDrawerNow}
                        />

                    </div>


                    {/* =========================
                       SIDEBAR: SCORES + CHAT
                    ========================= */}

                    <div style={{ width: "220px" }}>

                        {/* SCOREBOARD */}

                        <h3>Scores</h3>

                        <ul>

                            {room.players
                                .slice()
                                .sort((a, b) => (b.score || 0) - (a.score || 0))
                                .map((player) => (

                                    <li key={player.id}>
                                        {player.name}: {player.score || 0}
                                    </li>

                                ))}

                        </ul>


                        {/* CHAT / GUESS LOG */}

                        <h3>Guesses</h3>

                        <div
                            style={{
                                height: "250px",
                                overflowY: "auto",
                                border: "1px solid #ccc",
                                padding: "6px",
                                marginBottom: "8px"
                            }}
                        >

                            {messages.map((msg, i) => (

                                <p key={i}>

                                    {msg.type === "correct"

                                        ? `✅ ${msg.playerName} guessed the word! (+${msg.points})`

                                        : `${msg.playerName}: ${msg.text}`

                                    }

                                </p>

                            ))}

                        </div>


                        {/* GUESS INPUT — hidden for drawer */}

                        {!isDrawerNow && !roundEndInfo && (

                            <div>

                                <input
                                    type="text"
                                    placeholder="Type your guess..."
                                    value={guessText}
                                    onChange={(e) =>
                                        setGuessText(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            handleSendGuess();
                                        }
                                    }}
                                />

                                <button onClick={handleSendGuess}>
                                    Send
                                </button>

                            </div>

                        )}

                    </div>

                </div>

            )}

        </div>

    );

}

export default App;