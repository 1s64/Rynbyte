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
let username = '';
let players = [];

playBtn.onclick = () => {
  menu.classList.add('hidden');
  roomChoice.classList.remove('hidden');
};

function connectSocket(onOpenCallback) {
  socket = new WebSocket(`wss://${location.host}`);

  socket.onopen = () => {
    console.log('WebSocket connected');
    if (onOpenCallback) onOpenCallback();
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log('Received:', msg);

    if (msg.type === 'room_created') {
      roomId = msg.roomId;
      username = msg.username;
      alert(`Game created: ${roomId}`);
    }

    if (msg.type === 'player_joined') {
      players = msg.players;
      alert(`Players in room: ${players.join(', ')}`);
    }

    if (msg.type === 'start_game') {
      startGame();
    }

    if (msg.type === 'error') {
      alert(msg.message);
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  socket.onclose = () => {
    console.log('WebSocket closed');
  };
}

createBtn.onclick = () => {
  connectSocket(() => {
    socket.send(JSON.stringify({ type: 'create' }));
  });
};

joinBtn.onclick = () => {
  const code = roomInput.value.trim();
  if (!code) return alert('Enter a room code');
  connectSocket(() => {
    socket.send(JSON.stringify({ type: 'join', room: code }));
  });
};

function startGame() {
  roomChoice.classList.add('hidden');
  gameSection.classList.remove('hidden');

  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.fillText(`Welcome ${username}`, 200, 100);
  ctx.fillText('Game Starting...', 200, 150);
}
