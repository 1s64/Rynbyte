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
let playerIndex = 0;
let termsAccepted = false;
let gameEnded = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;

// Client-side prediction and interpolation
let lastServerUpdate = 0;
let serverGameState = null;
let clientGameState = null;
let interpolationBuffer = [];
const INTERPOLATION_DELAY = 100; // 100ms delay for smooth interpolation

// Input throttling
let lastInputSent = 0;
const INPUT_THROTTLE = 16; // Send input every 16ms (60 FPS)

// Game objects with interpolation
const game = {
  ball: { x: 300, y: 200, radius: 8 },
  paddleHeight: 80,
  paddleWidth: 10,
  paddleSpeed: 6,
  leftPaddle: { x: 20, y: 160 },
  rightPaddle: { x: 570, y: 160 },
  scores: [0, 0]
};

// Smooth input handling
const inputState = { up: false, down: false };
let lastInputState = { up: false, down: false };

// Optimized input handling with throttling
function handleInput(key, pressed) {
  if (!gameStarted) return;
  
  let changed = false;
  switch(key) {
    case 'ArrowUp':
    case 'KeyW':
      if (inputState.up !== pressed) {
        inputState.up = pressed;
        changed = true;
      }
      break;
    case 'ArrowDown':
    case 'KeyS':
      if (inputState.down !== pressed) {
        inputState.down = pressed;
        changed = true;
      }
      break;
  }
  
  if (changed) {
    sendInputThrottled();
  }
}

// Throttled input sending
function sendInputThrottled() {
  const now = Date.now();
  if (now - lastInputSent < INPUT_THROTTLE) return;
  
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  
  if (inputState.up !== lastInputState.up || inputState.down !== lastInputState.down) {
    socket.send(JSON.stringify({
      type: 'paddle_input',
      up: inputState.up,
      down: inputState.down
    }));
    
    lastInputState = { ...inputState };
    lastInputSent = now;
  }
}

// Keyboard events
document.addEventListener('keydown', (e) => {
  e.preventDefault();
  handleInput(e.code, true);
});

document.addEventListener('keyup', (e) => {
  e.preventDefault();
  handleInput(e.code, false);
});

// Improved touch controls
let touchActive = false;
let touchY = 0;

canvas.addEventListener('touchstart', (e) => {
  if (!gameStarted) return;
  e.preventDefault();
  touchActive = true;
  touchY = e.touches[0].clientY;
});

canvas.addEventListener('touchmove', (e) => {
  if (!gameStarted || !touchActive) return;
  e.preventDefault();
  
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchY;
  
  // More responsive touch controls
  inputState.up = deltaY < -5;
  inputState.down = deltaY > 5;
  sendInputThrottled();
  
  touchY = currentY;
});

canvas.addEventListener('touchend', (e) => {
  if (!gameStarted) return;
  e.preventDefault();
  touchActive = false;
  inputState.up = false;
  inputState.down = false;
  sendInputThrottled();
});

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
    roomInput.focus();
    return;
  }
  
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    alert('Room code must be exactly 6 characters (letters and numbers only)');
    roomInput.focus();
    roomInput.select();
    return;
  }
  
  connectSocket(() => {
    socket.send(JSON.stringify({ 
      type: 'join', 
      room: roomCode 
    }));
  });
};

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

// Enhanced WebSocket Connection Management
function connectSocket(onOpenCallback) {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) {
    socket.close();
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  console.log(`Connecting to WebSocket at ${wsUrl}`);
  
  socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0;
    if (onOpenCallback) onOpenCallback();
  };
  
  socket.onclose = (event) => {
    console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
    handleDisconnect(event);
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  socket.onmessage = handleMessage;
}

function handleMessage(event) {
  try {
    const msg = JSON.parse(event.data);
    
    switch(msg.type) {
      case 'room_created':
        roomId = msg.roomId;
        username = msg.username;
        playerIndex = 0; // Creator is always left paddle
        alert(`Room created: ${roomId}\nShare this code with a friend!\nWaiting for another player...`);
        break;
        
      case 'player_joined':
        players = msg.players;
        // Fixed player index assignment
        if (players.length === 1) {
          alert(`Players in room: ${players.join(', ')}\nWaiting for another player...`);
          playerIndex = 0; // First player is always left paddle
        } else if (players.length === 2) {
          alert(`Players in room: ${players.join(', ')}\nGame starting in 3 seconds!`);
          // Assign based on username position in array
          playerIndex = players.indexOf(username);
        }
        break;
        
      case 'start_game':
        setTimeout(startGame, 3000);
        break;
        
      case 'game_update':
        handleGameUpdate(msg);
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

// Enhanced game update handling with interpolation
function handleGameUpdate(msg) {
  const now = Date.now();
  
  // Store server state with timestamp
  serverGameState = {
    ...msg.gameState,
    timestamp: now,
    scoreEvent: msg.scoreEvent
  };
  
  // Add to interpolation buffer
  interpolationBuffer.push({
    state: { ...msg.gameState },
    timestamp: now
  });
  
  // Keep buffer size manageable
  if (interpolationBuffer.length > 10) {
    interpolationBuffer.shift();
  }
  
  // Handle score events
  if (msg.scoreEvent) {
    showScoreNotification();
  }
  
  lastServerUpdate = now;
}

// Interpolation function for smooth rendering
function getInterpolatedState() {
  if (!serverGameState || interpolationBuffer.length < 2) {
    return serverGameState;
  }
  
  const now = Date.now();
  const renderTime = now - INTERPOLATION_DELAY;
  
  // Find the two states to interpolate between
  let before = null;
  let after = null;
  
  for (let i = 0; i < interpolationBuffer.length - 1; i++) {
    if (interpolationBuffer[i].timestamp <= renderTime && 
        interpolationBuffer[i + 1].timestamp >= renderTime) {
      before = interpolationBuffer[i];
      after = interpolationBuffer[i + 1];
      break;
    }
  }
  
  if (!before || !after) {
    return serverGameState;
  }
  
  // Linear interpolation
  const timeDiff = after.timestamp - before.timestamp;
  const factor = timeDiff > 0 ? (renderTime - before.timestamp) / timeDiff : 0;
  
  return {
    ball: {
      x: lerp(before.state.ball.x, after.state.ball.x, factor),
      y: lerp(before.state.ball.y, after.state.ball.y, factor)
    },
    paddles: [
      lerp(before.state.paddles[0], after.state.paddles[0], factor),
      lerp(before.state.paddles[1], after.state.paddles[1], factor)
    ],
    scores: after.state.scores
  };
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
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
  
  // Initialize interpolation
  interpolationBuffer = [];
  lastServerUpdate = Date.now();
  
  // Start smooth render loop
  gameLoop();
}

function showScoreNotification() {
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
  
  // Reset states
  inputState.up = false;
  inputState.down = false;
  lastInputState = { up: false, down: false };
  interpolationBuffer = [];
  serverGameState = null;
  
  if (socket) {
    socket.close();
    socket = null;
  }
  
  gameSection.classList.add('hidden');
  roomChoice.classList.add('hidden');
  menu.classList.remove('hidden');
  roomInput.value = '';
}

// Smooth rendering with interpolation
function gameLoop() {
  if (!gameStarted) return;
  
  // Get interpolated state for smooth rendering
  const renderState = getInterpolatedState() || serverGameState;
  
  if (renderState) {
    // Update local game state for rendering
    game.ball.x = renderState.ball.x;
    game.ball.y = renderState.ball.y;
    game.leftPaddle.y = renderState.paddles[0];
    game.rightPaddle.y = renderState.paddles[1];
    game.scores = renderState.scores;
  }
  
  // Clear canvas with better performance
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
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 3;
  if (playerIndex === 0) {
    ctx.strokeRect(game.leftPaddle.x - 1, game.leftPaddle.y - 1, game.paddleWidth + 2, game.paddleHeight + 2);
  } else {
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
  
  // Continue loop at display refresh rate
  requestAnimationFrame(gameLoop);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('RynByte Pong loaded with smooth interpolation');
});
