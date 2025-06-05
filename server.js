// server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

app.use(express.json({ limit: '1mb' }));

// Telegram settings
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const IP_SALT = process.env.IP_SALT || 'default-salt';

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn('Telegram credentials missing. Webhook disabled.');
}

// Rate limit map
const recentTermsAcceptance = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_TERMS_REQUESTS = 5;

// Helper functions
function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

function sanitizeUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Unknown';
  return userAgent.slice(0, 200).replace(/[<>]/g, '');
}

// POST /api/accept-terms
app.post('/api/accept-terms', async (req, res) => {
  try {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress || 'unknown';

    const now = Date.now();
    const clientKey = clientIP;

    const existing = recentTermsAcceptance.get(clientKey);
    if (existing && now - existing.timestamp < RATE_LIMIT_WINDOW) {
      if (existing.count >= MAX_TERMS_REQUESTS) {
        return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
      }
      existing.count += 1;
    } else {
      recentTermsAcceptance.set(clientKey, { count: 1, timestamp: now });
    }

    // Cleanup
    for (const [key, { timestamp }] of recentTermsAcceptance.entries()) {
      if (now - timestamp > RATE_LIMIT_WINDOW) {
        recentTermsAcceptance.delete(key);
      }
    }

    const acceptedTerms = req.body.acceptedTerms === true;
    if (!acceptedTerms) {
      return res.status(400).json({ success: false, message: 'Terms must be accepted' });
    }

    const userAgent = sanitizeUserAgent(req.headers['user-agent']);
    const timestamp = new Date().toISOString();
    const hashedIP = crypto.createHash('sha256').update(clientIP + IP_SALT).digest('hex').substring(0, 8);

    const message = `🎮 *RynByte Pong - New User*\n\n` +
                    `📅 *Time:* ${new Date(timestamp).toLocaleString()}\n` +
                    `🔒 *Session ID:* \`${hashedIP}\`\n` +
                    `🌐 *IP Address:* \`${clientIP}\`\n` +
                    `🖥️ *Browser:* ${userAgent.split(' ')[0] || 'Unknown'}\n` +
                    `✅ *Terms Accepted:* Yes`;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        const telegramRes = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          },
          { timeout: 5000 }
        );

        if (!telegramRes.data.ok) {
          console.error('Telegram API responded with error:', telegramRes.data);
        }
      } catch (err) {
        console.error('Telegram send failed:', err.message);
      }
    }

    res.json({ success: true, message: 'Terms acceptance recorded' });
  } catch (err) {
    console.error('Internal error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket
const wss = new WebSocketServer({ server, clientTracking: true, maxPayload: 1024 });
