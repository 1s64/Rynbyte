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

function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generateGuestName() {
  return `Guest#${Math.floor(1000 + Math.random() * 9000)}`;
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Received:', msg);

    if (msg.type === 'create') {
      const roomId = generateRoomCode();
      const guest = generateGuestName();
      ws.roomId = roomId;
      ws.username = guest;

      rooms[roomId] = [ws];
      ws.send(JSON.stringify({ type: 'room_created', roomId, username: guest }));
    }

    if (msg.type === 'join') {
      const room = rooms[msg.room];
      if (!room || room.length >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room full or does not exist' }));
        return;
      }

      const guest = generateGuestName();
      ws.roomId = msg.room;
      ws.username = guest;
      room.push(ws);

      // Notify both players
      room.forEach(sock =>
        sock.send(JSON.stringify({
          type: 'player_joined',
          players: room.map(w => w.username)
        }))
      );

      if (room.length === 2) {
        room.forEach(sock =>
          sock.send(JSON.stringify({ type: 'start_game' }))
        );
      }
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(s => s !== ws);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
  });
});
