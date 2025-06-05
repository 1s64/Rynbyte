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

// Smooth paddle movement
let paddleVelocity = 0;
let lastPaddleUpdate = Date.now();

playBtn.onclick = () => {
  if (!termsAccepted) {
    showTermsModal();
    return;
  }
  menu.classList.add('hidden');
  roomChoice.classList.remove('hidden');
};

// Terms of Service Modal Functions
function showTermsModal() {
  const modal = document.getElementById('termsModal');
  modal.style.display = 'flex';
}

function hideTermsModal() {
  const modal = document.getElementById('termsModal');
  modal.style.display = 'none';
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
  try {
    const response = await fetch('/api/accept-terms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        acceptedTerms: true
      })
    });
    
    if (response.ok) {
      termsAccepted = true;
      hideTermsModal();
      menu.classList.add('hidden');
      roomChoice.classList.remove('hidden');
    } else {
      alert('Error processing terms acceptance. Please try again.');
    }
  } catch (error) {
    console.error('Error accepting terms:', error);
    alert('Connection error. Please check your internet and try again.');
  }
}

function declineTerms() {
  alert('You must accept the Terms of Service to use RynByte Pong.');
}

function connectSocket(onOpenCallback) {
  // Close existing socket if any
  if (socket) {
    socket.close();
  }
  
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
    if (onOpenCallback) onOpenCallback();
  };
  
  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('Received:', msg);
      
      if (msg.type === 'room_created') {
        roomId = msg.roomId;
        username = msg.username;
        playerIndex = 0; // Room creator is left player
        alert(`Room created: ${roomId}\nShare this code with a friend!\nWaiting for another player...`);
      }
      
      if (msg.type === 'player_joined') {
        players = msg.players;
        if (players.length === 1) {
          alert(`Players in room: ${players.join(', ')}\nWaiting for another player...`);
        } else {
          alert(`Players in room: ${players.join(', ')}\nGame starting in 3 seconds!`);
          // If joining, you're the right player
          if (username === players[1]) {
            playerIndex = 1;
          }
        }
      }
      
      if (msg.type === 'start_game') {
        setTimeout(() => startGame(), 3000); // 3 second delay
      }
      
      if (msg.type === 'game_update') {
        updateGameState(msg.gameState);
        
        // Show score notification
        if (msg.scoreEvent) {
          showScoreNotification();
        }
      }
      
      if (msg.type === 'game_end') {
        endGame(msg.winner, msg.scores);
      }
      
      if (msg.type === 'player_left') {
        alert(msg.message);
        // Return to menu
        resetToMenu();
      }
      
      if (msg.type === 'error') {
        alert(`Error: ${msg.message}`);
      }
      
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };
