const express = require('express');
const crypto = require('crypto');
const http = require('http');
const GuacamoleLite = require('guacamole-lite');
const path = require('path');

// --- Config from env ---
const RDP_HOST = process.env.RDP_HOST;
const RDP_PORT = parseInt(process.env.RDP_PORT || '3389', 10);
const RDP_USERNAME = process.env.RDP_USERNAME || 'admin';
const RDP_PASSWORD = process.env.RDP_PASSWORD || 'changeme';
const GATEWAY_PASSWORD = process.env.GATEWAY_PASSWORD;
const GUACD_HOST = process.env.GUACD_HOST || '127.0.0.1';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);
const PORT = parseInt(process.env.PORT || '8080', 10);
const RDP_WIDTH = process.env.RDP_WIDTH || '1920';
const RDP_HEIGHT = process.env.RDP_HEIGHT || '1080';
const RDP_DPI = process.env.RDP_DPI || '96';
const RDP_SECURITY = process.env.RDP_SECURITY || 'any';
const RDP_IGNORE_CERT = process.env.RDP_IGNORE_CERT || 'true';
const RDP_DISABLE_AUTH = process.env.RDP_DISABLE_AUTH || 'false';
const RDP_ENABLE_WALLPAPER = process.env.RDP_ENABLE_WALLPAPER || 'false';

if (!RDP_HOST) {
  console.error('RDP_HOST environment variable is required');
  process.exit(1);
}
if (!GATEWAY_PASSWORD) {
  console.error('GATEWAY_PASSWORD environment variable is required');
  process.exit(1);
}

// --- Encryption key for guacamole-lite tokens ---
// guacamole-lite uses Buffer.from(key) directly, so key must be exactly 32 bytes for AES-256-CBC
const CIPHER_KEY = crypto.randomBytes(32).toString('base64').slice(0, 32);

// --- Express app ---
const app = express();
const server = http.createServer(app);

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Password check middleware
function checkPassword(req) {
  return req.query.password === GATEWAY_PASSWORD;
}

// Generate encrypted token for guacamole-lite
function generateToken() {
  const connectionConfig = {
    connection: {
      type: 'rdp',
      settings: {
        hostname: RDP_HOST,
        port: RDP_PORT,
        username: RDP_USERNAME,
        password: RDP_PASSWORD,
        width: parseInt(RDP_WIDTH, 10),
        height: parseInt(RDP_HEIGHT, 10),
        dpi: parseInt(RDP_DPI, 10),
        security: RDP_SECURITY,
        'ignore-cert': RDP_IGNORE_CERT,
        'disable-auth': RDP_DISABLE_AUTH,
        'enable-wallpaper': RDP_ENABLE_WALLPAPER,
        'resize-method': 'display-update',
        'enable-font-smoothing': 'true',
      },
    },
  };

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(CIPHER_KEY), iv);

  let encrypted = cipher.update(JSON.stringify(connectionConfig), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const token = JSON.stringify({
    iv: iv.toString('base64'),
    value: encrypted,
  });

  return Buffer.from(token).toString('base64');
}

// Login page
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Main route
app.get('/', (req, res) => {
  if (!checkPassword(req)) {
    return res.redirect('/login');
  }

  const token = generateToken();
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const wsProtocol = isSecure ? 'wss' : 'ws';
  const host = req.headers.host;
  const wsUrl = `${wsProtocol}://${host}/ws?token=${encodeURIComponent(token)}`;

  res.send(renderClientPage(wsUrl, req.query.password));
});

function renderClientPage(wsUrl, password) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remote Desktop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #display { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
    #status {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #aaa; font-family: system-ui, sans-serif; font-size: 16px;
      z-index: 10; text-align: center;
    }
    #status.hidden { display: none; }
    #reconnect-btn {
      margin-top: 16px; padding: 8px 24px; border: 1px solid #555;
      background: #222; color: #ccc; font-size: 14px; cursor: pointer;
      border-radius: 4px; display: none;
    }
    #reconnect-btn:hover { background: #333; }
  </style>
</head>
<body>
  <div id="status">
    <div id="status-text">Connecting...</div>
    <button id="reconnect-btn" onclick="connect()">Reconnect</button>
  </div>
  <div id="display"></div>

  <script src="https://cdn.jsdelivr.net/npm/guacamole-common-js@1.5.0/dist/cjs/guacamole-common.js"></script>
  <script>
    const WS_URL = ${JSON.stringify(wsUrl)};
    const PASSWORD = ${JSON.stringify(password)};

    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const reconnectBtn = document.getElementById('reconnect-btn');
    const displayEl = document.getElementById('display');

    let client = null;

    function setStatus(msg, showReconnect) {
      statusText.textContent = msg;
      statusEl.classList.remove('hidden');
      reconnectBtn.style.display = showReconnect ? 'inline-block' : 'none';
    }

    function connect() {
      // Clean up previous
      if (client) {
        try { client.disconnect(); } catch (_) {}
        displayEl.innerHTML = '';
      }

      setStatus('Connecting...', false);

      const tunnel = new Guacamole.WebSocketTunnel(WS_URL);
      client = new Guacamole.Client(tunnel);

      const display = client.getDisplay();
      displayEl.appendChild(display.getElement());

      // Auto-scale display to viewport
      function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dw = display.getWidth();
        const dh = display.getHeight();
        if (dw && dh) {
          const scale = Math.min(w / dw, h / dh);
          display.scale(scale);
        }
        client.sendSize(w, h);
      }

      display.onresize = resize;
      window.addEventListener('resize', resize);

      // Mouse
      const mouse = new Guacamole.Mouse(display.getElement());
      mouse.onEach(['mousedown', 'mousemove', 'mouseup'], (e) => {
        const scale = display.getScale();
        client.sendMouseState(
          Object.assign({}, e, {
            x: Math.round(e.x / scale),
            y: Math.round(e.y / scale),
          })
        );
      });

      // Touch
      const touch = new Guacamole.Mouse.Touchscreen(display.getElement());
      touch.onEach(['mousedown', 'mousemove', 'mouseup'], (e) => {
        const scale = display.getScale();
        client.sendMouseState(
          Object.assign({}, e, {
            x: Math.round(e.x / scale),
            y: Math.round(e.y / scale),
          })
        );
      });

      // Keyboard
      const keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (keysym) => client.sendKeyEvent(1, keysym);
      keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);

      // Clipboard: local -> remote
      window.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
          const stream = client.createClipboardStream('text/plain');
          const writer = new Guacamole.StringWriter(stream);
          writer.sendText(text);
          writer.sendEnd();
        }
      });

      // Clipboard: remote -> local
      client.onclipboard = (stream, mimetype) => {
        if (mimetype === 'text/plain') {
          const reader = new Guacamole.StringReader(stream);
          let data = '';
          reader.ontext = (text) => { data += text; };
          reader.onend = () => {
            try { navigator.clipboard.writeText(data); } catch (_) {}
          };
        }
      };

      // State changes
      client.onstatechange = (state) => {
        switch (state) {
          case 1: setStatus('Connecting...', false); break;
          case 2: setStatus('Waiting for response...', false); break;
          case 3:
            statusEl.classList.add('hidden');
            resize();
            break;
          case 4: // Disconnecting
          case 5:
            setStatus('Disconnected.', true);
            break;
        }
      };

      client.onerror = (err) => {
        console.error('Guacamole error:', err);
        setStatus('Connection error: ' + (err.message || 'Unknown error'), true);
      };

      client.connect();
    }

    connect();
  </script>
</body>
</html>`;
}

// --- Start guacamole-lite WebSocket handler ---
const guacServer = new GuacamoleLite(
  { server, path: '/ws' },
  { host: GUACD_HOST, port: GUACD_PORT },
  {
    crypt: {
      cypher: 'AES-256-CBC',
      key: CIPHER_KEY,
    },
    log: { level: 'ERRORS' },
  }
);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Gateway listening on :${PORT}`);
  console.log(`RDP target: ${RDP_HOST}:${RDP_PORT}`);
});
