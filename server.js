import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createServer } from 'http';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// rooms: Map<roomId, { password: string|null, clients: Map<clientId, client> }>
const rooms = new Map();

function send(wsObj, message) {
  if (wsObj && wsObj.readyState === 1) {
    wsObj.send(JSON.stringify(message));
  }
}

// Broadcast to all clients in a room (optionally excluding one sender)
function broadcastToRoom(roomId, message, excludeId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.clients.forEach((client) => {
    if (client.id !== excludeId) send(client.ws, message);
  });
}

function roomRoster(room) {
  return Array.from(room.clients.values()).map((c) => ({
    id: c.id,
    role: c.role,
    username: c.username,
  }));
}

function sendToClient(roomId, clientId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  const client = room.clients.get(clientId);
  if (client) send(client.ws, message);
}

wss.on('connection', (ws) => {
  let currentClient = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'join': {
          const { roomId, clientId, role, username, password } = message;

          const cleanName = (username || '').toString().trim().slice(0, 24);
          if (!roomId || !clientId || !cleanName) {
            send(ws, { type: 'join-error', code: 'bad-request', message: 'Username is required.' });
            break;
          }

          if (role === 'broadcaster') {
            // Opening a room: reject if the code is already in use.
            if (rooms.has(roomId)) {
              send(ws, { type: 'join-error', code: 'room-taken', message: `Room ${roomId} already exists. Pick another code.` });
              break;
            }
            const room = { password: (password || '').toString() || null, clients: new Map() };
            rooms.set(roomId, room);
            currentClient = { id: clientId, ws, role, roomId, username: cleanName };
            room.clients.set(clientId, currentClient);

            send(ws, { type: 'join-ok', roomId, roster: roomRoster(room), hasPassword: !!room.password });
            console.log(`Broadcaster ${cleanName} opened room ${roomId}${room.password ? ' (password protected)' : ''}`);
            break;
          }

          // Viewer joining an existing room only.
          const room = rooms.get(roomId);
          if (!room || ![...room.clients.values()].some((c) => c.role === 'broadcaster')) {
            send(ws, { type: 'join-error', code: 'room-not-found', message: `No live room with code ${roomId}. Ask the broadcaster for a fresh code.` });
            break;
          }
          if (room.password && room.password !== (password || '').toString()) {
            send(ws, { type: 'join-error', code: 'wrong-password', message: 'Wrong room password.' });
            break;
          }
          if ([...room.clients.values()].some((c) => c.username.toLowerCase() === cleanName.toLowerCase())) {
            send(ws, { type: 'join-error', code: 'username-taken', message: `“${cleanName}” is already in this room. Choose another name.` });
            break;
          }

          currentClient = { id: clientId, ws, role, roomId, username: cleanName };
          room.clients.set(clientId, currentClient);

          send(ws, { type: 'join-ok', roomId, roster: roomRoster(room), hasPassword: !!room.password });

          // Let everyone know, and refresh the roster.
          broadcastToRoom(roomId, { type: 'roster', clients: roomRoster(room) });
          console.log(`Viewer ${cleanName} joined room ${roomId}`);
          break;
        }

        case 'chat': {
          if (!currentClient) break;
          const text = (message.text || '').toString().trim().slice(0, 500);
          if (!text) break;
          broadcastToRoom(currentClient.roomId, {
            type: 'chat',
            clientId: currentClient.id,
            username: currentClient.username,
            role: currentClient.role,
            text,
            ts: Date.now(),
          });
          break;
        }

        case 'offer':
          sendToClient(message.roomId, message.targetId, {
            type: 'offer',
            offer: message.offer,
            senderId: message.senderId,
          });
          break;

        case 'answer':
          sendToClient(message.roomId, message.targetId, {
            type: 'answer',
            answer: message.answer,
            senderId: message.senderId,
          });
          break;

        case 'ice-candidate':
          sendToClient(message.roomId, message.targetId, {
            type: 'ice-candidate',
            candidate: message.candidate,
            senderId: message.senderId,
          });
          break;

        case 'leave':
          handleDisconnect(currentClient);
          currentClient = null;
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect(currentClient);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleDisconnect(client) {
  if (!client) return;

  const { roomId, id } = client;
  const room = rooms.get(roomId);

  if (room) {
    room.clients.delete(id);

    broadcastToRoom(roomId, {
      type: 'user-left',
      clientId: id,
      username: client.username,
      role: client.role,
    });
    broadcastToRoom(roomId, { type: 'roster', clients: roomRoster(room) });

    // Broadcaster leaving closes the room for everyone.
    if (client.role === 'broadcaster') {
      broadcastToRoom(roomId, { type: 'room-closed', message: 'The broadcaster ended the session.' });
      rooms.delete(roomId);
      console.log(`Room ${roomId} closed (broadcaster left)`);
      return;
    }

    if (room.clients.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    }

    console.log(`Client ${client.username} (${client.role}) left room ${roomId}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Serve the built client when available (run `npm run build`, then `npm start`
// hosts the whole app on this single port)
const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
