import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";

const COLORS = [
    "#000000", "#ffffff", "#ff0000", "#ff9900",
    "#ffe100", "#00c853", "#00b0ff", "#2962ff",
    "#aa00ff", "#e91e63", "#795548", "#9e9e9e"
];

function DrawingCanvas({ roomCode, isDrawer }) {

    const canvasRef = useRef(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(4);
    const [isEraser, setIsEraser] = useState(false);

    // Keep refs in sync so socket handlers (closures) always read latest values
    const colorRef = useRef(color);
    const brushSizeRef = useRef(brushSize);
    const isEraserRef = useRef(isEraser);

    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
    useEffect(() => { isEraserRef.current = isEraser; }, [isEraser]);

    // Get canvas context
    const getContext = () => {
        const canvas = canvasRef.current;
        return canvas.getContext("2d");
    };

    // Get mouse position
    const getMousePosition = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    // Apply current brush settings to a context (local or remote)
    const applyBrushSettings = (ctx, strokeColor, size, eraser) => {
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.lineWidth = size;

        if (eraser) {
            ctx.globalCompositeOperation = "destination-out";
            // color doesn't matter for destination-out, but set anyway
            ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = strokeColor;
        }
    };

    // =========================
    // START STROKE
    // =========================
    const startDrawing = (e) => {
        if (!isDrawer) return;

        const { x, y } = getMousePosition(e);
        const ctx = getContext();

        applyBrushSettings(ctx, color, brushSize, isEraser);

        ctx.beginPath();
        ctx.moveTo(x, y);

        setIsDrawing(true);

        socket.emit("start_stroke", {
            roomCode,
            x,
            y,
            color,
            size: brushSize,
            isEraser
        });
    };

    // =========================
    // DRAW
    // =========================
    const draw = (e) => {
        if (!isDrawer || !isDrawing) return;

        const { x, y } = getMousePosition(e);
        const ctx = getContext();

        ctx.lineTo(x, y);
        ctx.stroke();

        socket.emit("draw", {
            roomCode,
            x,
            y
        });
    };

    // =========================
    // END STROKE
    // =========================
    const stopDrawing = () => {
        if (!isDrawer || !isDrawing) return;

        setIsDrawing(false);

        socket.emit("end_stroke", {
            roomCode
        });
    };

    // =========================
    // CLEAR CANVAS (drawer only)
    // =========================
    const clearCanvas = () => {
        if (!isDrawer) return;

        const canvas = canvasRef.current;
        const ctx = getContext();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        socket.emit("canvas_clear", { roomCode });
    };

    // =========================
    // SOCKET LISTENERS
    // =========================
    useEffect(() => {

        const handleStartStroke = (data) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");

            applyBrushSettings(ctx, data.color, data.size, data.isEraser);

            ctx.beginPath();
            ctx.moveTo(data.x, data.y);
        };

        const handleRemoteDraw = (data) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");

            ctx.lineTo(data.x, data.y);
            ctx.stroke();
        };

        const handleEndStroke = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            ctx.closePath();
        };

        const handleCanvasClear = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

        socket.on("start_stroke", handleStartStroke);
        socket.on("draw", handleRemoteDraw);
        socket.on("end_stroke", handleEndStroke);
        socket.on("canvas_clear", handleCanvasClear);

        return () => {
            socket.off("start_stroke", handleStartStroke);
            socket.off("draw", handleRemoteDraw);
            socket.off("end_stroke", handleEndStroke);
            socket.off("canvas_clear", handleCanvasClear);
        };

    }, []);

    return (
        <div>

            {isDrawer && (
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>

                    {/* Colors */}
                    <div style={{ display: "flex", gap: "4px" }}>
                        {COLORS.map((c) => (
                            <div
                                key={c}
                                onClick={() => { setColor(c); setIsEraser(false); }}
                                style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: "50%",
                                    background: c,
                                    border: color === c && !isEraser ? "2px solid #333" : "1px solid #ccc",
                                    cursor: "pointer"
                                }}
                            />
                        ))}
                    </div>

                    {/* Brush size */}
                    <input
                        type="range"
                        min="1"
                        max="30"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                    />
                    <span>{brushSize}px</span>

                    {/* Eraser toggle */}
                    <button
                        onClick={() => setIsEraser((prev) => !prev)}
                        style={{
                            fontWeight: isEraser ? "bold" : "normal",
                            background: isEraser ? "#ddd" : "white"
                        }}
                    >
                        Eraser
                    </button>

                    {/* Clear */}
                    <button onClick={clearCanvas}>Clear</button>

                </div>
            )}

            <canvas
                ref={canvasRef}
                width={800}
                height={500}
                style={{
                    border: "2px solid black",
                    background: "white",
                    cursor: isDrawer ? "crosshair" : "default"
                }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
            />

        </div>
    );
}

export default DrawingCanvas;