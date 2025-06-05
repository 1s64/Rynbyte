const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

app.use(express.static('public'));

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const { type, room, payload } = data;

      switch (type) {
        case 'create':
          const roomId = uuidv4().slice(0, 6);
          rooms[roomId] = [ws];
          ws.roomId = roomId;
          ws.send(JSON.stringify({ type: 'room_created', roomId }));
          break;

        case 'join':
          if (rooms[room] && rooms[room].length === 1) {
            rooms[room].push(ws);
            ws.roomId = room;
            rooms[room].forEach(client => {
              client.send(JSON.stringify({ type: 'start_game' }));
            });
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Room full or not found' }));
          }
          break;

        case 'update':
          if (ws.roomId && rooms[ws.roomId]) {
            rooms[ws.roomId].forEach(client => {
              if (client !== ws) {
                client.send(JSON.stringify({ type: 'update', payload }));
              }
            });
          }
          break;
      }
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms[ws.roomId]) {
      rooms[ws.roomId] = rooms[ws.roomId].filter(c => c !== ws);
      if (rooms[ws.roomId].length === 0) delete rooms[ws.roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
