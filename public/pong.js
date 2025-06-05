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
let termsAccepted = false;
let gameEnded = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;

// Game objects - client only displays, doesn't update physics
const game = {
  ball: {
    x: 300,
    y: 200,
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

// Input handling
const inputState = { up: false, down: false };
let lastInputSent = { up: false, down: false };

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (!gameStarted) return;
  
  switch(e.code) {
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      inputState.up = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      inputState.down = true;
      break;
  }
  sendInputIfChanged();
});

document.addEventListener('keyup', (e) => {
  if (!gameStarted) return;
  
  switch(e.code) {
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      inputState.up = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      inputState.down = false;
      break;
  }
  sendInputIfChanged();
});

// Touch controls for mobile
let touchStartY = 0;
canvas.addEventListener('touchstart', (e) => {
  if (!gameStarted) return;
  e.preventDefault();
  touchStartY = e.touches[0].clientY;
});

canvas.addEventListener('touchmove', (e) => {
  if (!gameStarted) return;
  e.preventDefault();
  
  const touchY = e.touches[0].clientY;
  const deltaY = touchY - touchStartY;
  
  if (Math.abs(deltaY) > 10) {
    inputState.up = deltaY < 0;
    inputState.down = deltaY > 0;
    sendInputIfChanged();
  }
});

canvas.addEventListener('touchend', (e) => {
  if (!gameStarted) return;
  e.preventDefault();
  inputState.up = false;
  inputState.down = false;
  sendInputIfChanged();
});

function sendInputIfChanged() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  
  if (inputState.up !== lastInputSent.up || inputState.down !== lastInputSent.down) {
    socket.send(JSON.stringify({
      type: 'paddle_input',
      up: inputState.up,
      down: inputState.down
    }));
    
    lastInputSent = { ...inputState };
  }
}

// UI Event Handlers
playBtn.onclick = () => {
  if (!termsAccepted) {
    showTermsModal();
    return;
  }
  menu.classList.add('hidden');
  roomChoice.classList.remove('hidden');
};

createBtn.onclick = () => {
  connectSocket(() => {
    socket.send(JSON.stringify({ type: 'create' }));
  });
};

joinBtn.onclick = () => {
  const roomCode = roomInput.value.trim().toUpperCase();
  if (!roomCode) {
    alert('Please enter a room code');
    return;
  }
  
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    alert('Room code must be 6 characters (letters and numbers only)');
    return;
  }
  
  connectSocket(() => {
    socket.send(JSON.stringify({ type: 'join', room: roomCode }));
  });
};

// Allow Enter key to join room
roomInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinBtn.click();
  }
});

// Terms of Service Modal Functions
function showTermsModal() {
  document.getElementById('termsModal').style.display = 'flex';
}

function hideTermsModal() {
  document.getElementById('termsModal').style.display = 'none';
}

function toggleFullTerms() {
  const shortTerms = document.getElementById('shortTerms');
  const fullTerms = document.getElementById('fullTerms');
  const toggleBtn = document.getElementById('toggleTermsBtn');
  
  if (fullTerms.style.display === 'none' || !fullTerms.style.display) {
    shortTerms.style.display = 'none';
    fullTerms.style.display = 'block';
    toggleBtn.textContent = 'Show Less';
  } else {
    shortTerms.style.display = 'block';
    fullTerms.style.display = 'none';
    toggleBtn.textContent = 'Show Full Terms';
  }
}

async function acceptTerms() {
  const acceptBtn = document.querySelector('.accept-btn');
  acceptBtn.disabled = true;
  acceptBtn.textContent = 'Processing...';
  
  try {
    const response = await fetch('/api/accept-terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        acceptedTerms: true
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      termsAccepted = true;
      hideTermsModal();
      menu.classList.add('hidden');
      roomChoice.classList.remove('hidden');
    } else {
      throw new Error(data.message || 'Failed to process terms acceptance');
    }
  } catch (error) {
    console.error('Error accepting terms:', error);
    alert(`Error: ${error.message}. Please try again.`);
  } finally {
    acceptBtn.disabled = false;
    acceptBtn.textContent = 'Accept & Continue';
  }
}

function declineTerms() {
  alert('You must accept the Terms of Service to use RynByte Pong.');
}

// WebSocket Connection Management
function connectSocket(onOpenCallback) {
  if (socket) {
    socket.close();
  }
  
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0;
    if (onOpenCallback) onOpenCallback();
  };
  
  socket.onmessage = handleMessage;
  socket.onclose = handleDisconnect;
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleMessage(event) {
  try {
    const msg = JSON.parse(event.data);
    console.log('Received:', msg);
    
    switch(msg.type) {
      case 'room_created':
        roomId = msg.roomId;
        username = msg.username;
        playerIndex = 0;
        alert(`Room created: ${roomId}\nShare this code with a friend!\nWaiting for another player...`);
        break;
        
      case 'player_joined':
        players = msg.players;
        if (players.length === 1) {
          alert(`Players in room: ${players.join(', ')}\nWaiting for another player...`);
        } else {
          alert(`Players in room: ${players.join(', ')}\nGame starting in 3 seconds!`);
          if (username === players[1]) {
            playerIndex = 1;
          }
        }
        break;
        
      case 'start_game':
        setTimeout(startGame, 3000);
        break;
        
      case 'game_update':
        updateGameState(msg.gameState);
        if (msg.scoreEvent) {
          showScoreNotification();
        }
        break;
        
      case 'game_end':
        endGame(msg.winner, msg.scores);
        break;
        
      case 'player_left':
        alert(msg.message);
        resetToMenu();
        break;
        
      case 'room_closed':
        alert(msg.message);
        resetToMenu();
        break;
        
      case 'error':
        alert(`Error: ${msg.message}`);
        break;
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
}

function handleDisconnect(event) {
  console.log('WebSocket disconnected:', event.code, event.reason);
  
  if (!gameEnded && reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (roomId) {
        connectSocket(() => {
          socket.send(JSON.stringify({ type: 'join', room: roomId }));
        });
      }
    }, 1000 * reconnectAttempts);
  } else if (reconnectAttempts >= maxReconnectAttempts) {
    alert('Connection lost. Please refresh the page to continue.');
    resetToMenu();
  }
}

// Game Functions
function startGame() {
  gameStarted = true;
  gameEnded = false;
  roomChoice.classList.add('hidden');
  gameSection.classList.remove('hidden');
  
  // Start render loop
  gameLoop();
}

function updateGameState(serverState) {
  game.ball.x = serverState.ball.x;
  game.ball.y = serverState.ball.y;
  game.leftPaddle.y = serverState.paddles[0];
  game.rightPaddle.y = serverState.paddles[1];
  game.scores = serverState.scores;
}

function showScoreNotification() {
  // Create a visual score notification
  const notification = document.createElement('div');
  notification.textContent = `${game.scores[0]} - ${game.scores[1]}`;
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 48px;
    color: #4CAF50;
    font-weight: bold;
    z-index: 1000;
    pointer-events: none;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 2000);
}

function endGame(winner, scores) {
  gameStarted = false;
  gameEnded = true;
  
  const winnerName = winner === playerIndex ? 'You' : 'Opponent';
  const message = winner === playerIndex ? 
    `🎉 You Win! ${scores[0]} - ${scores[1]}` : 
    `😔 You Lose! ${scores[0]} - ${scores[1]}`;
  
  setTimeout(() => {
    alert(message + '\n\nReturning to menu...');
    resetToMenu();
  }, 1000);
}

function resetToMenu() {
  gameStarted = false;
  gameEnded = false;
  roomId = null;
  username = '';
  players = [];
  playerIndex = 0;
  reconnectAttempts = 0;
  
  // Reset input states
  inputState.up = false;
  inputState.down = false;
  lastInputSent = { up: false, down: false };
  
  // Close socket
  if (socket) {
    socket.close();
    socket = null;
  }
  
  // Show menu
  gameSection.classList.add('hidden');
  roomChoice.classList.add('hidden');
  menu.classList.remove('hidden');
  
  // Clear room input
  roomInput.value = '';
}

// Rendering
function gameLoop() {
  if (!gameStarted) return;
  
  // Clear canvas
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw center line
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw paddles
  ctx.fillStyle = '#fff';
  ctx.fillRect(game.leftPaddle.x, game.leftPaddle.y, game.paddleWidth, game.paddleHeight);
  ctx.fillRect(game.rightPaddle.x, game.rightPaddle.y, game.paddleWidth, game.paddleHeight);
  
  // Highlight current player's paddle
  if (playerIndex === 0) {
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.strokeRect(game.leftPaddle.x - 1, game.leftPaddle.y - 1, game.paddleWidth + 2, game.paddleHeight + 2);
  } else {
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.strokeRect(game.rightPaddle.x - 1, game.rightPaddle.y - 1, game.paddleWidth + 2, game.paddleHeight + 2);
  }
  
  // Draw ball
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw scores
  ctx.fillStyle = '#fff';
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(game.scores[0], canvas.width / 4, 60);
  ctx.fillText(game.scores[1], (canvas.width * 3) / 4, 60);
  
  // Draw player indicators
  ctx.font = '16px Arial';
  ctx.fillStyle = playerIndex === 0 ? '#4CAF50' : '#888';
  ctx.fillText('YOU', canvas.width / 4, 90);
  ctx.fillStyle = playerIndex === 1 ? '#4CAF50' : '#888';
  ctx.fillText('YOU', (canvas.width * 3) / 4, 90);
  
  // Continue loop
  requestAnimationFrame(gameLoop);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('RynByte Pong loaded');
});
