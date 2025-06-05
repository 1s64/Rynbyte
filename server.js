const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const gameStates = {};

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
    canvasHeight: 400
  };
}

function updateBall(gameState) {
  const ball = gameState.ball;
  const paddleHeight = gameState.paddleHeight;
  const paddleWidth = gameState.paddleWidth;
  const canvasWidth = gameState.canvasWidth;
  const canvasHeight = gameState.canvasHeight;
  
  // Move ball
  ball.x += ball.dx;
  ball.y += ball.dy;
  
  // Ball collision with top/bottom walls
  if (ball.y <= ball.radius || ball.y >= canvasHeight - ball.radius) {
    ball.dy = -ball.dy;
  }
  
  // Ball collision with left paddle
  if (ball.x <= 20 + paddleWidth + ball.radius &&
      ball.y >= gameState.paddles[0] &&
      ball.y <= gameState.paddles[0] + paddleHeight &&
      ball.dx < 0) {
    ball.dx = Math.abs(ball.dx);
    // Add some spin based on where it hits the paddle
    const hitPos = (ball.y - gameState.paddles[0]) / paddleHeight;
    ball.dy = (hitPos - 0.5) * 8;
  }
  
  // Ball collision with right paddle
  if (ball.x >= 570 - ball.radius &&
      ball.y >= gameState.paddles[1] &&
      ball.y <= gameState.paddles[1] + paddleHeight &&
      ball.dx > 0) {
    ball.dx = -Math.abs(ball.dx);
    // Add some spin based on where it hits the paddle
    const hitPos = (ball.y - gameState.paddles[1]) / paddleHeight;
    ball.dy = (hitPos - 0.5) * 8;
  }
  
  // Score detection
  if (ball.x < 0) {
    gameState.scores[1]++;
    resetBall(gameState);
  }
  if (ball.x > canvasWidth) {
    gameState.scores[0]++;
    resetBall(gameState);
  }
}

function resetBall(gameState) {
  gameState.ball.x = gameState.canvasWidth / 2;
  gameState.ball.y = gameState.canvasHeight / 2;
  gameState.ball.dx = (Math.random() > 0.5 ? 1 : -1) * 5;
  gameState.ball.dy = (Math.random() - 0.5) * 6;
}

function gameLoop(roomId) {
  const gameState = gameStates[roomId];
  const room = rooms[roomId];
  
  if (!gameState || !room || room.length < 2) {
    return;
  }
  
  updateBall(gameState);
  
  // Send game state to all players in room
  const gameUpdate = {
    type: 'game_update',
    gameState: {
      ball: gameState.ball,
      paddles: gameState.paddles,
      scores: gameState.scores
    }
  };
  
  room.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(gameUpdate));
    }
  });
  
  // Continue game loop
  setTimeout(() => gameLoop(roomId), 1000 / 60); // 60 FPS
}

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (data) => {
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
      if (!room || room.length >= 2) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Room full or does not exist' 
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
      room.forEach(sock =>
        sock.send(JSON.stringify({
          type: 'player_joined',
          players: playerNames
        }))
      );
      
      if (room.length === 2) {
        room.forEach(sock =>
          sock.send(JSON.stringify({ type: 'start_game' }))
        );
        
        // Start game loop for this room
        setTimeout(() => gameLoop(msg.room), 1000);
      }
    }
    
    if (msg.type === 'paddle_move') {
      const roomId = ws.roomId;
      const gameState = gameStates[roomId];
      
      if (gameState && msg.player !== undefined) {
        // Clamp paddle position
        const maxY = gameState.canvasHeight - gameState.paddleHeight;
        gameState.paddles[msg.player] = Math.max(0, Math.min(maxY, msg.y));
      }
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    const roomId = ws.roomId;
    
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(s => s !== ws);
      
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        delete gameStates[roomId];
      } else {
        // Notify remaining player
        rooms[roomId].forEach(sock =>
          sock.send(JSON.stringify({
            type: 'player_left',
            message: 'Other player left the game'
          }))
        );
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log('Pong server initialized');
