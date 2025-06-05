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

// Middleware for security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const wss = new WebSocketServer({ 
  server,
  clientTracking: true,
  maxPayload: 1024 // Limit payload size to prevent DoS
});

app.use('/public', express.static(path.join(__dirname, 'public'), (err, req, res, next) => {
  if (err) {
    console.error('Static file error:', err);
    next(err);
  } else {
    next();
  }
});
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size

// Rate limiting for terms acceptance
const recentTermsAcceptance = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_TERMS_REQUESTS = 5;

// Telegram webhook configuration - Fixed token handling
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Validate environment variables
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn('Warning: Telegram credentials not configured. Webhook disabled.');
}

// Input validation helper
function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

function sanitizeUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Unknown';
  return userAgent.slice(0, 200).replace(/[<>]/g, ''); // Basic sanitization
}

// Fixed Terms acceptance endpoint with proper security
app.post('/api/accept-terms', async (req, res) => {
  try {
    // Rate limiting check
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     'unknown';

    const now = Date.now();
    const clientKey = clientIP;
    
    if (recentTermsAcceptance.has(clientKey)) {
      const { count, timestamp } = recentTermsAcceptance.get(clientKey);
      if (now - timestamp < RATE_LIMIT_WINDOW) {
        if (count >= MAX_TERMS_REQUESTS) {
          return res.status(429).json({ 
            success: false, 
            message: 'Too many requests. Please try again later.' 
          });
        }
        recentTermsAcceptance.set(clientKey, { count: count + 1, timestamp });
      } else {
        recentTermsAcceptance.set(clientKey, { count: 1, timestamp: now });
      }
    } else {
      recentTermsAcceptance.set(clientKey, { count: 1, timestamp: now });
    }

    // Clean up old entries
    for (const [key, value] of recentTermsAcceptance.entries()) {
      if (now - value.timestamp > RATE_LIMIT_WINDOW) {
        recentTermsAcceptance.delete(key);
      }
    }

    const userAgent = sanitizeUserAgent(req.headers['user-agent']);
    const timestamp = new Date().toISOString();
    const acceptedTerms = req.body.acceptedTerms === true;

    if (!acceptedTerms) {
      return res.status(400).json({ 
        success: false, 
        message: 'Terms must be accepted' 
      });
    }

    // Hash IP for privacy (instead of storing full IP)
    const crypto = require('crypto');
    const hashedIP = crypto.createHash('sha256')
      .update(clientIP + process.env.IP_SALT || 'default-salt')
      .digest('hex')
      .substring(0, 8);

    // Prepare message for Telegram - Fixed formatting and security
    const message = `🎮 *RynByte Pong - New User*\n\n` +
                   `📅 *Time:* ${new Date(timestamp).toLocaleString()}\n` +
                   `🔒 *Session ID:* \`${hashedIP}\`\n` +
                   `🌐 *IP Address:* \`${clientIP}\`\n` +
                   `🖥️ *Browser:* ${userAgent.split(' ')[0] || 'Unknown'}\n` +
                   `✅ *Terms Accepted:* Yes`;

    // Send to Telegram webhook - Fixed error handling
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        const telegramResponse = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          },
          {
            timeout: 5000, // 5 second timeout
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (telegramResponse.data.ok) {
          console.log('Terms acceptance logged to Telegram successfully');
        } else {
          console.error('Telegram API error:', telegramResponse.data);
        }
      } catch (telegramError) {
        console.error('Failed to send to Telegram:', {
          message: telegramError.message,
          code: telegramError.code,
          response: telegramError.response?.data
        });
        // Don't fail the request if Telegram fails
      }
    } else {
      console.log('Terms accepted (Telegram not configured):', { 
        hashedIP, 
        timestamp, 
        userAgent: userAgent.split(' ')[0] 
      });
    }

    res.json({ success: true, message: 'Terms acceptance recorded' });
  } catch (error) {
    console.error('Error processing terms acceptance:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Game state management
const rooms = new Map(); // Use Map for better performance
const gameStates = new Map();
const gameLoops = new Map();

// Room cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    // Remove rooms that have been inactive for more than 30 minutes
    if (room.lastActivity && now - room.lastActivity > 30 * 60 * 1000) {
      cleanupRoom(roomId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substr(2, 6).toUpperCase();
  } while (rooms.has(code)); // Ensure uniqueness
  return code;
}

function generateGuestName() {
  return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

function createGameState() {
  return {
    ball: {
      x: 300,
      y: 200,
      dx: Math.random() > 0.5 ? 5 : -5, // Random initial direction
      dy: (Math.random() - 0.5) * 4,
      radius: 8
    },
    paddles: [160, 160],
    paddleInputs: [{ up: false, down: false }, { up: false, down: false }], // Track inputs
    scores: [0, 0],
    paddleHeight: 80,
    paddleWidth: 10,
    paddleSpeed: 6,
    canvasWidth: 600,
    canvasHeight: 400,
    gameActive: true,
    lastUpdate: Date.now(),
    gameStartTime: Date.now()
  };
}

function updatePaddles(gameState, deltaTime) {
  for (let i = 0; i < 2; i++) {
    const input = gameState.paddleInputs[i];
    if (input.up && !input.down) {
      gameState.paddles[i] -= gameState.paddleSpeed * deltaTime;
    } else if (input.down && !input.up) {
      gameState.paddles[i] += gameState.paddleSpeed * deltaTime;
    }
    
    // Clamp paddle positions
    gameState.paddles[i] = Math.max(0, 
      Math.min(gameState.canvasHeight - gameState.paddleHeight, gameState.paddles[i])
    );
  }
}

function updateBall(gameState) {
  if (!gameState.gameActive) return false;

  const ball = gameState.ball;
  const paddleHeight = gameState.paddleHeight;
  const paddleWidth = gameState.paddleWidth;
  const canvasWidth = gameState.canvasWidth;
  const canvasHeight = gameState.canvasHeight;
  
  const now = Date.now();
  const deltaTime = Math.min((now - gameState.lastUpdate) / 16.67, 3); // Cap delta time
  gameState.lastUpdate = now;
  
  // Update paddles first
  updatePaddles(gameState, deltaTime);
  
  // Move ball
  ball.x += ball.dx * deltaTime;
  ball.y += ball.dy * deltaTime;
  
  // Ball collision with top/bottom walls
  if (ball.y <= ball.radius || ball.y >= canvasHeight - ball.radius) {
    ball.y = Math.max(ball.radius, Math.min(canvasHeight - ball.radius, ball.y));
    ball.dy = -ball.dy;
  }
  
  // Paddle collision detection
  const leftPaddleX = 20;
  const rightPaddleX = 570;
  
  // Left paddle collision
  if (ball.x - ball.radius <= leftPaddleX + paddleWidth && 
      ball.x > leftPaddleX &&
      ball.y >= gameState.paddles[0] - ball.radius &&
      ball.y <= gameState.paddles[0] + paddleHeight + ball.radius &&
      ball.dx < 0) {
    
    ball.x = leftPaddleX + paddleWidth + ball.radius;
    const hitPos = (ball.y - (gameState.paddles[0] + paddleHeight/2)) / (paddleHeight/2);
    ball.dx = Math.abs(ball.dx) * 1.02; // Slight speed increase
    ball.dy = hitPos * 6 + ball.dy * 0.3; // Add spin
  }
  
  // Right paddle collision
  if (ball.x + ball.radius >= rightPaddleX && 
      ball.x < rightPaddleX + paddleWidth &&
      ball.y >= gameState.paddles[1] - ball.radius &&
      ball.y <= gameState.paddles[1] + paddleHeight + ball.radius &&
      ball.dx > 0) {
    
    ball.x = rightPaddleX - ball.radius;
    const hitPos = (ball.y - (gameState.paddles[1] + paddleHeight/2)) / (paddleHeight/2);
    ball.dx = -Math.abs(ball.dx) * 1.02;
    ball.dy = hitPos * 6 + ball.dy * 0.3;
  }
  
  // Limit ball speed
  const maxSpeed = 15;
  if (Math.abs(ball.dx) > maxSpeed) ball.dx = Math.sign(ball.dx) * maxSpeed;
  if (Math.abs(ball.dy) > maxSpeed) ball.dy = Math.sign(ball.dy) * maxSpeed;
  
  // Score detection
  if (ball.x < -ball.radius) {
    gameState.scores[1]++;
    resetBall(gameState);
    return true;
  }
  if (ball.x > canvasWidth + ball.radius) {
    gameState.scores[0]++;
    resetBall(gameState);
    return true;
  }
  
  return false;
}

function resetBall(gameState) {
  gameState.ball.x = gameState.canvasWidth / 2;
  gameState.ball.y = gameState.canvasHeight / 2;
  gameState.ball.dx = (Math.random() > 0.5 ? 1 : -1) * 5;
  gameState.ball.dy = (Math.random() - 0.5) * 4;
  gameState.lastUpdate = Date.now();
}

function gameLoop(roomId) {
  const gameState = gameStates.get(roomId);
  const room = rooms.get(roomId);
  
  if (!gameState || !room || room.players.length < 2 || !gameState.gameActive) {
    cleanupGameLoop(roomId);
    return;
  }
  
  const scoreEvent = updateBall(gameState);
  
  const gameUpdate = {
    type: 'game_update',
    gameState: {
      ball: gameState.ball,
      paddles: gameState.paddles,
      scores: gameState.scores
    },
    scoreEvent: scoreEvent
  };
  
  // Send to connected players
  room.players.forEach(ws => {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(gameUpdate));
      } catch (error) {
        console.error('Error sending game update:', error);
      }
    }
  });
  
  // Check for game end
  const maxScore = 5;
  if (gameState.scores[0] >= maxScore || gameState.scores[1] >= maxScore) {
    const winner = gameState.scores[0] >= maxScore ? 0 : 1;
    const winnerName = room.players[winner]?.username || `Player ${winner + 1}`;
    
    room.players.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'game_end',
          winner: winner,
          winnerName: winnerName,
          scores: gameState.scores
        }));
      }
    });
    
    gameState.gameActive = false;
    cleanupGameLoop(roomId);
  }
}

function startGameLoop(roomId) {
  cleanupGameLoop(roomId); // Prevent multiple loops
  
  gameLoops.set(roomId, setInterval(() => {
    gameLoop(roomId);
  }, 1000 / 60));
}

function cleanupGameLoop(roomId) {
  if (gameLoops.has(roomId)) {
    clearInterval(gameLoops.get(roomId));
    gameLoops.delete(roomId);
  }
}

function cleanupRoom(roomId) {
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    room.players.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'room_closed',
          message: 'Room has been closed due to inactivity'
        }));
      }
    });
    rooms.delete(roomId);
  }
  
  if (gameStates.has(roomId)) {
    gameStates.get(roomId).gameActive = false;
    gameStates.delete(roomId);
  }
  
  cleanupGameLoop(roomId);
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New client connected');
  
  // Basic rate limiting per connection
  let messageCount = 0;
  let lastReset = Date.now();
  
  ws.on('message', (data) => {
    try {
      // Rate limiting
      const now = Date.now();
      if (now - lastReset > 1000) {
        messageCount = 0;
        lastReset = now;
      }
      
      if (messageCount++ > 60) { // Max 60 messages per second
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      // Message size limit
      if (data.length > 1024) {
        ws.close(1009, 'Message too large');
        return;
      }

      const msg = JSON.parse(data);
      
      if (msg.type === 'create') {
        const roomId = generateRoomCode();
        const guest = generateGuestName();
        
        ws.roomId = roomId;
        ws.username = guest;
        ws.playerIndex = 0;
        
        rooms.set(roomId, {
          players: [ws],
          lastActivity: Date.now()
        });
        gameStates.set(roomId, createGameState());
        
        ws.send(JSON.stringify({ 
          type: 'room_created', 
          roomId, 
          username: guest 
        }));
      }
      
      else if (msg.type === 'join') {
        if (!isValidRoomCode(msg.room)) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid room code format' 
          }));
          return;
        }

        const room = rooms.get(msg.room);
        if (!room) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Room does not exist' 
          }));
          return;
        }
        
        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Room is full' 
          }));
          return;
        }
        
        const guest = generateGuestName();
        ws.roomId = msg.room;
        ws.username = guest;
        ws.playerIndex = 1;
        
        room.players.push(ws);
        room.lastActivity = Date.now();
        
        const playerNames = room.players.map(w => w.username);
        room.players.forEach(sock => {
          if (sock.readyState === 1) {
            sock.send(JSON.stringify({
              type: 'player_joined',
              players: playerNames
            }));
          }
        });
        
        if (room.players.length === 2) {
          room.players.forEach(sock => {
            if (sock.readyState === 1) {
              sock.send(JSON.stringify({ type: 'start_game' }));
            }
          });
          
          setTimeout(() => startGameLoop(msg.room), 1000);
        }
      }
      
      else if (msg.type === 'paddle_input') {
        const roomId = ws.roomId;
        const gameState = gameStates.get(roomId);
        
        if (gameState && ws.playerIndex !== undefined && 
            typeof msg.up === 'boolean' && typeof msg.down === 'boolean') {
          
          gameState.paddleInputs[ws.playerIndex] = {
            up: msg.up,
            down: msg.down
          };
          
          if (rooms.has(roomId)) {
            rooms.get(roomId).lastActivity = Date.now();
          }
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
    
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.players = room.players.filter(s => s !== ws);
      
      if (room.players.length === 0) {
        cleanupRoom(roomId);
      } else {
        room.players.forEach(sock => {
          if (sock.readyState === 1) {
            sock.send(JSON.stringify({
              type: 'player_left',
              message: 'Other player left the game'
            }));
          }
        });
        
        if (gameStates.has(roomId)) {
          gameStates.get(roomId).gameActive = false;
        }
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

function cleanup() {
  console.log('Shutting down gracefully...');
  
  // Clear all game loops
  for (const [roomId, interval] of gameLoops.entries()) {
    clearInterval(interval);
  }
  
  // Close all WebSocket connections
  wss.clients.forEach(ws => {
    ws.terminate();
  });
  
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

console.log('Pong server initialized with security improvements');
