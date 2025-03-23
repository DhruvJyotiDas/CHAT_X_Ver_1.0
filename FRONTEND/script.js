let socket;
let username;
let selectedRecipient = null;
let typingTimeout;

// Store chat history for each user, including profile pics
let chatHistory = {};
let userProfiles = {};

function connectToServer() {
    username = document.getElementById("username").value.trim();
    if (username === "") {
        alert("Please enter a username.");
        return;
    }

    socket = new WebSocket("wss://chat-x-ver-1-0.onrender.com");

    socket.onopen = () => {
        socket.send(JSON.stringify({ type: "connect", username }));
        document.getElementById("user-login").style.display = "none";
        document.getElementById("chat-area").style.display = "flex";
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
            // Prevent sender from receiving their own message
            if (data.sender !== username) {
                storeMessage(data.sender, data.recipient, data.message, data.timestamp);
            }
        } 
        
        // Fix: Properly update online users list
        else if (data.type === "updateUsers") {
            updateUserList(data.users);
        } 
        
        else if (data.type === "typing") {
            if (selectedRecipient === data.sender) {
                document.getElementById("typing-status").innerText = `${data.sender} is typing...`;
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    document.getElementById("typing-status").innerText = "";
                }, 2000);
            }
        } 
        
        else if (data.type === "seen") {
            document.getElementById("read-status").innerText = `Seen at ${data.timestamp}`;
        }

        // Handle WebRTC Call Signaling
        else if (data.type === "call-offer") {
            handleIncomingCall(data);
        } else if (data.type === "call-answer") {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === "ice-candidate") {
            if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    };
}

// Fix: Ensure online users are displayed properly
function updateUserList(users) {
    let userList = document.getElementById("user-list");
    userList.innerHTML = ""; // Clear previous list

    users.forEach(user => {
        if (user !== username) {
            let userElement = document.createElement("div");
            userElement.textContent = user;
            userElement.classList.add("user-item");
            userElement.onclick = () => selectRecipient(user, userElement);

            userList.appendChild(userElement);
        }
    });
}

// Fix: Select a user and enable messaging & calls
function selectRecipient(user, element) {
    selectedRecipient = user;

    // Highlight selected user
    document.querySelectorAll(".user-item").forEach(item => item.classList.remove("selected"));
    element.classList.add("selected");

    // Show the selected user's name
    document.getElementById("typing-status").innerText = `Chatting with ${user}`;

    // Clear chat box and load previous messages
    displayMessages(user);
}

// Fix: Send messages properly to the selected recipient
function sendMessage() {
    if (!selectedRecipient) {
        alert("Please select a user to chat with.");
        return;
    }

    const message = document.getElementById("message").value.trim();
    if (message === "") {
        alert("Message cannot be empty.");
        return;
    }

    const timestamp = new Date().toLocaleString();
    const messageData = {
        type: "message",
        sender: username,
        recipient: selectedRecipient,
        message,
        timestamp
    };

    // Display the message immediately in sender's chat window
    storeMessage(username, selectedRecipient, message, timestamp);

    // Send the message to the server
    socket.send(JSON.stringify(messageData));

    // Clear the input field
    document.getElementById("message").value = "";
}

// Fix: Store and display messages properly
function storeMessage(sender, recipient, message, timestamp) {
    const chatKey = sender === username ? recipient : sender;

    if (!chatHistory[chatKey]) {
        chatHistory[chatKey] = [];
    }

    // Fix: Add new messages at the end of the array instead of the top
    chatHistory[chatKey].push({ sender, message, timestamp });

    if (selectedRecipient === chatKey) {
        displayMessages(chatKey);
    }
}

// Fix: Display messages in the correct order (new ones at the bottom)
function displayMessages(user) {
    let chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = "";

    if (chatHistory[user]) {
        // Reverse the array to show newest messages first
        const reversedMessages = [...chatHistory[user]].reverse();
        reversedMessages.forEach(({ sender, message, timestamp, profilePic }) => {
            let messageElement = document.createElement("div");
            messageElement.classList.add("chat-message", sender === username ? "sender" : "receiver");
            
            let img = document.createElement("img");
            img.src = profilePic || userProfiles[sender] || "/Users/rishabhsinghparmar/Downloads/WhatsApp Image 2025-03-14 at 13.12.49.jpeg";
            img.classList.add("profile-pic");
            
            let content = document.createElement("div");
            content.innerHTML = `<strong>${sender === username ? "You" : sender}:</strong> ${message} <br><small>${timestamp}</small>`;
            
            messageElement.appendChild(img);
            messageElement.appendChild(content);
            chatBox.appendChild(messageElement);
        });
    }

    // Scroll to the top where the newest messages are
    chatBox.scrollTop = 0;
}

// WebRTC Call Functions
let peerConnection;
let localStream;
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function startVoiceCall() {
    if (!selectedRecipient) {
        alert("Please select a user before calling!");
        return;
    }
    await initiateCall(false);
}

async function startVideoCall() {
    if (!selectedRecipient) {
        alert("Please select a user before calling!");
        return;
    }
    await initiateCall(true);
}

async function initiateCall(videoEnabled) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: videoEnabled, audio: true });

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Show the Video Call Box when Call Starts
    document.getElementById("video-call-box").style.display = "block";

    document.getElementById("localVideo").srcObject = localStream;

    peerConnection.ontrack = (event) => {
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(
                JSON.stringify({ type: "ice-candidate", candidate: event.candidate, recipient: selectedRecipient })
            );
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: "call-offer", offer, sender: username, recipient: selectedRecipient }));
}

async function handleIncomingCall(data) {
    if (!confirm(`${data.sender} is calling you. Accept?`)) {
        return;
    }

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Show the Video Call Box when Call Starts
    document.getElementById("video-call-box").style.display = "block";

    document.getElementById("localVideo").srcObject = localStream;

    peerConnection.ontrack = (event) => {
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(
                JSON.stringify({ type: "ice-candidate", candidate: event.candidate, recipient: data.sender })
            );
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "call-answer", answer, recipient: data.sender }));
}

// End Call Function
function endCall() {
    if (peerConnection) {
        peerConnection.close();
    }
    document.getElementById("video-call-box").style.display = "none";
}
