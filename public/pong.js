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
let gameStarted = false;
let playerIndex = 0; // 0 for left player, 1 for right player

// Game objects
const game = {
  ball: {
    x: 300,
    y: 200,
    dx: 5,
    dy: 3,
    radius: 8
  },
  paddleHeight: 80,
  paddleWidth: 10,
  paddleSpeed: 6,
  leftPaddle: {
    x: 20,
    y: 160
  },
  rightPaddle: {
    x: 570,
    y: 160
  },
  scores: [0, 0],
  keys: {
    up: false,
    down: false
  }
};

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
      playerIndex = 0; // Room creator is left player
      alert(`Room created: ${roomId}\nWaiting for another player...`);
    }
    
    if (msg.type === 'player_joined') {
      players = msg.players;
      if (players.length === 1) {
        alert(`Players in room: ${players.join(', ')}\nWaiting for another player...`);
      } else {
        alert(`Players in room: ${players.join(', ')}\nGame will start!`);
        // If joining, you're the right player
        if (username === players[1]) {
          playerIndex = 1;
        }
      }
    }
    
    if (msg.type === 'start_game') {
      startGame();
    }
    
    if (msg.type === 'game_update') {
      updateGameState(msg.gameState);
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
  gameStarted = true;
  
  // Set up controls
  setupControls();
  
  // Start game loop
  gameLoop();
}

function setupControls() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      game.keys.up = true;
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      game.keys.down = true;
    }
  });
  
  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      game.keys.up = false;
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      game.keys.down = false;
    }
  });
}

function updatePaddle() {
  const paddle = playerIndex === 0 ? game.leftPaddle : game.rightPaddle;
  
  if (game.keys.up && paddle.y > 0) {
    paddle.y -= game.paddleSpeed;
  }
  if (game.keys.down && paddle.y < canvas.height - game.paddleHeight) {
    paddle.y += game.paddleSpeed;
  }
  
  // Send paddle position to server
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'paddle_move',
      player: playerIndex,
      y: paddle.y
    }));
  }
}

function updateBall() {
  // Only update ball on server side or for single player testing
  // This is a simplified version - server should handle ball physics
  game.ball.x += game.ball.dx;
  game.ball.y += game.ball.dy;
  
  // Ball collision with top/bottom walls
  if (game.ball.y <= game.ball.radius || game.ball.y >= canvas.height - game.ball.radius) {
    game.ball.dy = -game.ball.dy;
  }
  
  // Ball collision with paddles
  if (game.ball.x <= game.leftPaddle.x + game.paddleWidth + game.ball.radius &&
      game.ball.y >= game.leftPaddle.y &&
      game.ball.y <= game.leftPaddle.y + game.paddleHeight) {
    game.ball.dx = Math.abs(game.ball.dx);
  }
  
  if (game.ball.x >= game.rightPaddle.x - game.ball.radius &&
      game.ball.y >= game.rightPaddle.y &&
      game.ball.y <= game.rightPaddle.y + game.paddleHeight) {
    game.ball.dx = -Math.abs(game.ball.dx);
  }
  
  // Score detection
  if (game.ball.x < 0) {
    game.scores[1]++;
    resetBall();
  }
  if (game.ball.x > canvas.width) {
    game.scores[0]++;
    resetBall();
  }
}

function resetBall() {
  game.ball.x = canvas.width / 2;
  game.ball.y = canvas.height / 2;
  game.ball.dx = (Math.random() > 0.5 ? 1 : -1) * 5;
  game.ball.dy = (Math.random() - 0.5) * 6;
}

function updateGameState(gameState) {
  // Update game state from server
  if (gameState.ball) {
    game.ball = gameState.ball;
  }
  if (gameState.paddles) {
    game.leftPaddle.y = gameState.paddles[0];
    game.rightPaddle.y = gameState.paddles[1];
  }
  if (gameState.scores) {
    game.scores = gameState.scores;
  }
}

function render() {
  // Clear canvas
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw center line
  ctx.strokeStyle = '#555';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw paddles
  ctx.fillStyle = 'white';
  ctx.fillRect(game.leftPaddle.x, game.leftPaddle.y, game.paddleWidth, game.paddleHeight);
  ctx.fillRect(game.rightPaddle.x, game.rightPaddle.y, game.paddleWidth, game.paddleHeight);
  
  // Draw ball
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw scores
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(game.scores[0], canvas.width / 4, 60);
  ctx.fillText(game.scores[1], (canvas.width * 3) / 4, 60);
  
  // Draw player names
  ctx.font = '16px Arial';
  ctx.fillStyle = playerIndex === 0 ? '#4CAF50' : 'white';
  ctx.fillText(players[0] || 'Player 1', canvas.width / 4, canvas.height - 20);
  ctx.fillStyle = playerIndex === 1 ? '#4CAF50' : 'white';
  ctx.fillText(players[1] || 'Player 2', (canvas.width * 3) / 4, canvas.height - 20);
  
  // Draw controls hint
  ctx.fillStyle = '#888';
  ctx.font = '12px Arial';
  ctx.fillText('Use Arrow Keys or W/S to move', canvas.width / 2, canvas.height - 5);
}

function gameLoop() {
  if (!gameStarted) return;
  
  updatePaddle();
  updateBall(); // This should be handled by server in multiplayer
  render();
  
  requestAnimationFrame(gameLoop);
}
