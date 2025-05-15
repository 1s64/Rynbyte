const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const URL = require('url').URL;

const app = express();
app.use(express.static('public'));

// Serve a simple homepage
app.get('/', (req, res) => {
  res.type('html').send(`
    <h1>rynbyte.xyz Proxy</h1>
    <form>
      <input name="url" placeholder="https://example.com" size="40"/>
      <button>Go</button>
    </form>
  `);
});

// Proxy all other requests via ?url=…
app.use('/proxy', (req, res, next) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).send('Missing ?url= parameter');
  }
  // Basic validation
  let parsed;
  try { parsed = new URL(target); }
  catch (e) { return res.status(400).send('Invalid URL'); }

  createProxyMiddleware({
    target: parsed.origin,
    changeOrigin: true,
    pathRewrite: {
      '^/proxy': parsed.pathname + (parsed.search || '')
    },
    logLevel: 'warn'
  })(req, res, next);
});

// Fallback
app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
