const playBtn = document.getElementById('playBtn');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomCode');
const menu = document.getElementById('menu');
const roomChoice = document.getElementById('roomChoice');
const gameSection = document.getElementById('game');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let socket;
let roomId = null;
let player = 1;
let gameStarted = false;

// UI Flow
playBtn.onclick = () => {
  menu.classList.add('hidden');
  roomChoice.classList.remove('hidden');
};

createBtn.onclick = () => {
  connectSocket();
  socket.send(JSON.stringify({ type: 'create' }));
};

joinBtn.onclick = () => {
  const code = roomInput.value.trim();
  if (!code) return alert('Enter a room code');
  connectSocket();
  socket.send(JSON.stringify({ type: 'join', room: code }));
};

// WebSocket Logic
function connectSocket() {
  socket = new WebSocket(`wss://${location.host}`);

  socket.onopen = () => {
    console.log('Connected to server');
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log('Received:', msg);

    switch (msg.type) {
      case 'room_created':
        roomId = msg.roomId;
        alert(`Room created: ${roomId}`);
        break;
      case 'start_game':
        startGame();
        break;
      case 'update':
        // future: apply updates from other player
        break;
      case 'error':
        alert(msg.message);
        break;
    }
  };
}

// Basic Pong Game Init (placeholder)
function startGame() {
  roomChoice.classList.add('hidden');
  gameSection.classList.remove('hidden');
  gameStarted = true;

  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.fillText('Game Started!', 220, 200);
}
