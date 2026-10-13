import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// В ESM нет __dirname по умолчанию — получаем его так:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. HTTP-сервер для отдачи HTML/JS
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  const extname = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
  };
  const contentType = mimeTypes[extname] ?? 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? '404 Not Found' : `Server error: ${err.code}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

// 2. WebSocket-сервер, привязанный к тому же HTTP-серверу
const wss = new WebSocketServer({ server });

/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();

const broadcastUsers = () => {
  const payload = JSON.stringify({ type: 'users', users: [...clients.keys()] });
  for (const ws of clients.values()) ws.send(payload);
};

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 9);
  clients.set(id, ws);

  ws.send(JSON.stringify({ type: 'welcome', id }));
  broadcastUsers();

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    const target = clients.get(msg.to);
    if (target) {
      target.send(JSON.stringify({ ...msg, from: id }));
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    broadcastUsers();
  });
});

// 3. Слушаем порт
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
