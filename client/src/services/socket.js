import { io } from "socket.io-client";

const socket = io(
    import.meta.env.DEV ? "http://localhost:5000" : undefined
);

export default socket;