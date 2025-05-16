const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { URL } = require('url');

const app = express();

// 1️⃣ Serve your static frontend
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// 2️⃣ Create a single proxy middleware with dynamic routing + header / cookie tweaks
const proxy = createProxyMiddleware('/proxy', {
  changeOrigin: true,
  followRedirects: true,      // follow HTTP redirects
  logLevel: 'warn',

  // Rewrite the path based on ?url=…
  pathRewrite: (path, req) => {
    try {
      const targetUrl = new URL(req.query.url);
      return targetUrl.pathname + targetUrl.search;
    } catch {
      return path;
    }
  },

  // Route dynamically to the origin of the ?url
  router: req => {
    try {
      return new URL(req.query.url).origin;
    } catch {
      return null;
    }
  },

  // 3️⃣ Strip headers that prevent framing
  onProxyRes(proxyRes) {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    if (proxyRes.headers['content-security-policy']) {
      proxyRes.headers['content-security-policy'] =
        proxyRes.headers['content-security-policy']
          .replace(/frame-ancestors[^;]+;/g, '');
    }
  },

  // 4️⃣ Forward key client headers
  onProxyReq(proxyReq, req) {
    const ua = req.get('user-agent');
    if (ua) proxyReq.setHeader('User-Agent', ua);

    const ref = req.get('referer') || req.originalUrl;
    proxyReq.setHeader('Referer', ref);
  },

  // 5️⃣ Rewrite all Set-Cookie domains so cookies persist under your proxy
  cookieDomainRewrite: { '*': '' },
});

// 6️⃣ Mount it
app.use(proxy);

// 7️⃣ Fallback handler
app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
