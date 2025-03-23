const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = {}; // Stores active users and their sockets

app.use(express.static(path.join(__dirname, "FRONTEND")));

wss.on("connection", (ws) => {
    let username = null;

    ws.on("message", (data) => {
        const message = JSON.parse(data);

        // Handle User Connection
        if (message.type === "connect") {
            username = message.username;
            clients[username] = ws;
            console.log(`${username} connected.`);
            broadcastUserList();
        }

        // Handle WebRTC Call Signaling (Offer, Answer, ICE Candidates)
        else if (
            message.type === "call-offer" ||
            message.type === "call-answer" ||
            message.type === "ice-candidate"
        ) {
            if (clients[message.recipient]) {
                clients[message.recipient].send(JSON.stringify(message));
            }
        }

        // Handle Text Messages - Ensure messages reach the recipient without duplication
        else if (message.type === "message") {
            const recipientSocket = clients[message.recipient];

            const messageData = {
                type: "message",
                sender: message.sender,
                recipient: message.recipient,
                message: message.message,
                timestamp: new Date().toLocaleString()
            };

            // Send the message to the recipient if online
            if (recipientSocket) {
                recipientSocket.send(JSON.stringify(messageData));
            }

            // Prevent sender from receiving their own message twice
            if (clients[message.sender] && message.sender !== message.recipient) {
                clients[message.sender].send(JSON.stringify(messageData));
            }
        }

        // Handle Typing Indicator
        else if (message.type === "typing") {
            if (clients[message.recipient]) {
                clients[message.recipient].send(
                    JSON.stringify({ type: "typing", sender: message.sender })
                );
            }
        }

        // Handle Read Receipts
        else if (message.type === "seen") {
            if (clients[message.sender]) {
                clients[message.sender].send(
                    JSON.stringify({
                        type: "seen",
                        recipient: message.recipient,
                        timestamp: new Date().toLocaleTimeString(),
                    })
                );
            }
        }
    });

    // Handle User Disconnection
    ws.on("close", () => {
        if (username && clients[username]) {
            console.log(`${username} disconnected.`);
            delete clients[username];
            broadcastUserList();
        }
    });
});

// Function to Broadcast Online Users List
function broadcastUserList() {
    const users = Object.keys(clients);
    const userListMessage = JSON.stringify({ type: "updateUsers", users });

    for (let user in clients) {
        clients[user].send(userListMessage);
    }
}

// Start Server
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`WebSocket server running on port ${PORT}`);
});


