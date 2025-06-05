const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Telegram webhook configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Terms acceptance endpoint
app.post('/api/accept-terms', async (req, res) => {
  try {
    const userIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const timestamp = new Date().toISOString();
    const acceptedTerms = req.body.acceptedTerms;

    // Prepare message for Telegram
    const message = `🎮 *RynByte Pong - Terms Accepted*\n\n` +
                   `📅 *Time:* ${new Date(timestamp).toLocaleString()}\n` +
                   `🌐 *IP Address:* \`${userIP}\`\n` +
                   `🖥️ *User Agent:* ${userAgent}\n` +
                   `✅ *Terms Accepted:* ${acceptedTerms ? 'Yes' : 'No'}\n` +
                   `📊 *Purpose:* Personalization & Analytics`;

    // Send to Telegram webhook if configured
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      });
      console.log('Terms acceptance logged to Telegram');
    } else {
      console.log('Terms accepted:', { userIP, timestamp, userAgent });
    }

    res.json({ success: true, message: 'Terms acceptance recorded' });
  } catch (error) {
    console.error('Error processing terms acceptance:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const rooms = {};
const gameStates = {};
const gameLoops = {}; // Track active game loops

function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generateGuestName() {
  return `Guest#${Math.floor(1000 + Math.random() * 9000)}`;
}

function createGameState() {
  return {
    ball: {
      x: 300,
      y: 200,
      dx: 5,
      dy: 3,
      radius: 8
    },
    paddles: [160, 160], // [leftPaddle.y, rightPaddle.y]
    scores: [0, 0],
    paddleHeight: 80,
    paddleWidth: 10,
    canvasWidth: 600,
    canvasHeight: 400,
    gameActive: true,
    lastUpdate: Date.now()
  };
}

function updateBall(gameState) {
  if (!gameState.gameActive) return;

  const ball = gameState.ball;
  const paddleHeight = gameState.paddleHeight;
  const paddleWidth = gameState.paddleWidth;
  const canvasWidth = gameState.canvasWidth;
  const canvasHeight = gameState.canvasHeight;
  
  // Calculate delta time for consistent physics
  const now = Date.now();
  const deltaTime = (now - gameState.lastUpdate) / 16.67; // Normalize to ~60fps
  gameState.lastUpdate = now;
  
  // Move ball with delta time
  ball.x += ball.dx * deltaTime;
  ball.y += ball.dy * deltaTime;
  
  // Ball collision with top/bottom walls
  if (ball.y <= ball.radius) {
    ball.y = ball.radius;
    ball.dy = Math.abs(ball.dy);
  }
  if (ball.y >= canvasHeight - ball.radius) {
    ball.y = canvasHeight - ball.radius;
    ball.dy = -Math.abs(ball.dy);
  }
  
  // Improved paddle collision detection
  const leftPaddleX = 20;
  const rightPaddleX = 570;
  
  // Left paddle collision
  if (ball.x - ball.radius <= leftPaddleX + paddleWidth && 
      ball.x - ball.radius > leftPaddleX &&
      ball.y >= gameState.paddles[0] - ball.radius &&
      ball.y <= gameState.paddles[0] + paddleHeight + ball.radius &&
      ball.dx < 0) {
    
    ball.x = leftPaddleX + paddleWidth + ball.radius;
    ball.dx = Math.abs(ball.dx) * 1.05; // Slight speed increase
    
    // Add spin based on hit position
    const hitPos = (ball.y - gameState.paddles[0]) / paddleHeight;
    ball.dy = (hitPos - 0.5) * 8;
  }
  
  // Right paddle collision
  if (ball.x + ball.radius >= rightPaddleX && 
      ball.x + ball.radius < rightPaddleX + paddleWidth &&
      ball.y >= gameState.paddles[1] - ball.radius &&
      ball.y <= gameState.paddles[1] + paddleHeight + ball.radius &&
      ball.dx > 0) {
    
    ball.x = rightPaddleX - ball.radius;
    ball.dx = -Math.abs(ball.dx) * 1.05; // Slight speed increase
    
    // Add spin based on hit position
    const hitPos = (ball.y - gameState.paddles[1]) / paddleHeight;
    ball.dy = (hitPos - 0.5) * 8;
  }
  
  // Limit ball speed
  const maxSpeed = 12;
  if (Math.abs(ball.dx) > maxSpeed) {
    ball.dx = Math.sign(ball.dx) * maxSpeed;
  }
  if (Math.abs(ball.dy) > maxSpeed) {
    ball.dy = Math.sign(ball.dy) * maxSpeed;
  }
  
  // Score detection
  if (ball.x < -ball.radius) {
    gameState.scores[1]++;
    resetBall(gameState);
    return true; // Score event
  }
  if (ball.x > canvasWidth + ball.radius) {
    gameState.scores[0]++;
    resetBall(gameState);
    return true; // Score event
  }
  
  return false;
}

function resetBall(gameState) {
  gameState.ball.x = gameState.canvasWidth / 2;
  gameState.ball.y = gameState.canvasHeight / 2;
  gameState.ball.dx = (Math.random() > 0.5 ? 1 : -1) * 5;
  gameState.ball.dy = (Math.random() - 0.5) * 6;
  gameState.lastUpdate = Date.now();
}

function gameLoop(roomId) {
  const gameState = gameStates[roomId];
  const room = rooms[roomId];
  
  // Check if game should continue
  if (!gameState || !room || room.length < 2 || !gameState.gameActive) {
    if (gameLoops[roomId]) {
      clearInterval(gameLoops[roomId]);
      delete gameLoops[roomId];
    }
    return;
  }
  
  // Update game physics
  const scoreEvent = updateBall(gameState);
  
  // Send game state to all players in room
  const gameUpdate = {
    type: 'game_update',
    gameState: {
      ball: gameState.ball,
      paddles: gameState.paddles,
      scores: gameState.scores
    },
    scoreEvent: scoreEvent
  };
  
  // Send to all connected players
  room.forEach((ws, index) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify(gameUpdate));
      } catch (error) {
        console.error('Error sending game update:', error);
      }
    }
  });
  
  // Check for game end condition
  if (gameState.scores[0] >= 5 || gameState.scores[1] >= 5) {
    const winner = gameState.scores[0] >= 5 ? 0 : 1;
    room.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'game_end',
          winner: winner,
          scores: gameState.scores
        }));
      }
    });
    
    gameState.gameActive = false;
    if (gameLoops[roomId]) {
      clearInterval(gameLoops[roomId]);
      delete gameLoops[roomId];
    }
  }
}

function startGameLoop(roomId) {
  // Prevent multiple game loops for the same room
  if (gameLoops[roomId]) {
    clearInterval(gameLoops[roomId]);
  }
  
  gameLoops[roomId] = setInterval(() => {
    gameLoop(roomId);
  }, 1000 / 60); // 60 FPS
}

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      console.log('Received:', msg);
      
      if (msg.type === 'create') {
        const roomId = generateRoomCode();
        const guest = generateGuestName();
        
        ws.roomId = roomId;
        ws.username = guest;
        ws.playerIndex = 0; // Room creator is left player
        
        rooms[roomId] = [ws];
        gameStates[roomId] = createGameState();
        
        ws.send(JSON.stringify({ 
          type: 'room_created', 
          roomId, 
          username: guest 
        }));
      }
      
      if (msg.type === 'join') {
        const room = rooms[msg.room];
        if (!room) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Room does not exist' 
          }));
          return;
        }
        
        if (room.length >= 2) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Room is full' 
          }));
          return;
        }
        
        const guest = generateGuestName();
        ws.roomId = msg.room;
        ws.username = guest;
        ws.playerIndex = 1; // Joiner is right player
        
        room.push(ws);
        
        // Notify both players
        const playerNames = room.map(w => w.username);
        room.forEach(sock => {
          if (sock.readyState === 1) {
            sock.send(JSON.stringify({
              type: 'player_joined',
              players: playerNames
            }));
          }
        });
        
        if (room.length === 2) {
          room.forEach(sock => {
            if (sock.readyState === 1) {
              sock.send(JSON.stringify({ type: 'start_game' }));
            }
          });
          
          // Start game loop for this room
          setTimeout(() => startGameLoop(msg.room), 1000);
        }
      }
      
      if (msg.type === 'paddle_move') {
        const roomId = ws.roomId;
        const gameState = gameStates[roomId];
        
        if (gameState && msg.player !== undefined && msg.y !== undefined) {
          // Clamp paddle position
          const maxY = gameState.canvasHeight - gameState.paddleHeight;
          const clampedY = Math.max(0, Math.min(maxY, msg.y));
          gameState.paddles[msg.player] = clampedY;
        }
      }
      
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    const roomId = ws.roomId;
    
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(s => s !== ws);
      
      if (rooms[roomId].length === 0) {
        // Clean up empty room
        delete rooms[roomId];
        if (gameStates[roomId]) {
          gameStates[roomId].gameActive = false;
          delete gameStates[roomId];
        }
        if (gameLoops[roomId]) {
          clearInterval(gameLoops[roomId]);
          delete gameLoops[roomId];
        }
      } else {
        // Notify remaining player
        rooms[roomId].forEach(sock => {
          if (sock.readyState === 1) {
            sock.send(JSON.stringify({
              type: 'player_left',
              message: 'Other player left the game'
            }));
          }
        });
        
        // Pause the game
        if (gameStates[roomId]) {
          gameStates[roomId].gameActive = false;
        }
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Cleanup function for graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  Object.keys(gameLoops).forEach(roomId => {
    clearInterval(gameLoops[roomId]);
  });
  process.exit(0);
});

console.log('Pong server initialized');
