const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { URL } = require('url');

const app = express();

// Serve your static frontend
app.use(express.static('public'));

// Simple health or info endpoint (optional)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Configure a single proxy middleware with dynamic routing
const proxyMiddleware = createProxyMiddleware({
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // strip the /proxy prefix; query holds the real URL
    try {
      const targetUrl = new URL(req.query.url);
      return targetUrl.pathname + targetUrl.search;
    } catch {
      return path;
    }
  },
  router: (req) => {
    try {
      return new URL(req.query.url).origin;
    } catch {
      return null;
    }
  },
  logLevel: 'warn'
});

// Use the proxy for anything under /proxy
app.use('/proxy', (req, res, next) => {
  if (!req.query.url) {
    return res.status(400).send('Missing ?url= parameter');
  }
  proxyMiddleware(req, res, next);
});

// Fallback for all other routes
app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
