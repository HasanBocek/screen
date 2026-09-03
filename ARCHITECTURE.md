# Architecture Documentation

## Overview

This document explains the architecture and technical implementation of the local screen sharing application. The system uses WebRTC for peer-to-peer media streaming and WebSocket for signaling coordination.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Local Network                             │
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │  Broadcaster │         │   Viewer 1   │                      │
│  │   (Chrome)   │         │  (Firefox)   │                      │
│  └──────┬───────┘         └──────┬───────┘                      │
│         │                        │                               │
│         │    WebRTC P2P          │                               │
│         │◄──────────────────────►│                               │
│         │                        │                               │
│         │                        │                               │
│         │  ┌─────────────────┐  │       ┌──────────────┐       │
│         └─►│  Signaling      │◄─┘       │   Viewer 2   │       │
│            │  Server (WS)    │◄─────────│   (Safari)   │       │
│            │  Port 3001      │          └──────────────┘       │
│            └─────────────────┘                                  │
│                    ▲                                             │
│                    │                                             │
│            ┌───────┴────────┐                                   │
│            │  Vite Dev       │                                   │
│            │  Server         │                                   │
│            │  Port 5173      │                                   │
│            └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Frontend (Client)

**Technology**: React 19 + Vite
**Location**: `/src` (project root)
**Port**: 5173

#### Component Structure

```
src/
├── components/
│   ├── RoomSelector.jsx    # Entry point - role & room selection
│   ├── Broadcaster.jsx     # Screen sharing interface
│   └── Viewer.jsx          # Stream viewing interface
├── services/
│   └── webrtc.js          # WebRTC service (core logic)
├── App.jsx                # Main application router
├── App.css                # Styling
└── main.jsx               # React entry point
```

#### Key Components

**RoomSelector**
- Purpose: Initial UI for selecting role (broadcaster/viewer) and room
- State Management:
  - `role`: 'broadcaster' or 'viewer'
  - `roomId`: 6-character alphanumeric code
- Features:
  - Room code generation
  - Input validation
  - Role-based UI adaptation

**Broadcaster**
- Purpose: Capture and broadcast screen with audio
- Key States:
  - `isSharing`: Boolean tracking broadcast status
  - `viewerCount`: Number of connected viewers
  - `connectionState`: WebSocket connection status
- Lifecycle:
  1. Connect to signaling server
  2. Wait for user to click "Start Sharing"
  3. Request screen capture via `getDisplayMedia()`
  4. Create peer connections for each viewer
  5. Send media tracks via WebRTC

**Viewer**
- Purpose: Receive and display broadcaster's screen
- Key States:
  - `hasStream`: Boolean indicating stream reception
  - `connectionState`: Connection status
  - `isFullscreen`: Fullscreen mode toggle
- Features:
  - Automatic stream display
  - Fullscreen mode with multiple triggers
  - Connection status indicators

### 2. WebRTC Service

**Location**: `/src/services/webrtc.js`

#### Class: WebRTCService

```javascript
class WebRTCService {
  // Core Properties
  ws: WebSocket              // Signaling connection
  roomId: string            // Current room identifier
  clientId: string          // Unique client ID
  role: 'broadcaster'|'viewer'
  peerConnections: Map      // Map of peer connections
  localStream: MediaStream  // Local media stream (broadcaster)

  // ICE Configuration
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}
```

#### Key Methods

**Connection Management**
- `connect(serverUrl, roomId, role)`: Establish WebSocket connection
- `disconnect()`: Clean up all connections
- `cleanup()`: Release resources

**Peer Connection Lifecycle**
- `createPeerConnection(peerId)`: Initialize RTCPeerConnection
- `createOffer(viewerId)`: Broadcaster creates SDP offer
- `handleOffer(offer, broadcasterId)`: Viewer handles offer
- `handleAnswer(answer, viewerId)`: Broadcaster handles answer
- `handleIceCandidate(candidate, peerId)`: Process ICE candidates

**Media Handling**
- `startScreenShare()`: Capture screen + audio via getDisplayMedia
- `stopScreenShare()`: Stop all tracks and close connections

**Callbacks**
- `onRemoteStream(stream)`: Called when viewer receives stream
- `onConnectionStateChange(peerId, state)`: Connection state updates
- `onViewerCountChange(count)`: Viewer count updates

### 3. Signaling Server

**Technology**: Node.js + Express + WebSocket (ws library)
**Location**: `/server.js` (project root)
**Port**: 3001

#### Data Structures

```javascript
// Room storage
rooms: Map<roomId, Set<ClientInfo>>

// Client information
ClientInfo {
  id: string,           // Unique client ID
  ws: WebSocket,        // WebSocket connection
  role: string,         // 'broadcaster' or 'viewer'
  roomId: string        // Room identifier
}
```

#### Message Types

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `join` | Client → Server | Join a room |
| `leave` | Client → Server | Leave a room |
| `offer` | Broadcaster → Server → Viewer | SDP offer |
| `answer` | Viewer → Server → Broadcaster | SDP answer |
| `ice-candidate` | Both → Server → Other | ICE candidate |
| `room-state` | Server → Client | Current room members |
| `user-joined` | Server → All | New user notification |
| `user-left` | Server → All | User departure notification |

#### Server Flow

```
1. Client connects → WebSocket established
2. Client sends 'join' → Added to room
3. Server sends 'room-state' → Client gets current members
4. Server broadcasts 'user-joined' → Others notified
5. Messages relayed between peers
6. On disconnect → 'user-left' broadcast, cleanup
```

## WebRTC Flow

### Detailed Connection Process

#### Phase 1: Signaling Connection

```
Broadcaster                  Server                    Viewer
    │                          │                          │
    ├─── join (broadcaster) ──►│                          │
    │◄──── room-state ─────────┤                          │
    │                          │◄──── join (viewer) ──────┤
    │◄── user-joined ──────────┤                          │
    │                          ├───── room-state ─────────►│
```

#### Phase 2: WebRTC Handshake (SDP Exchange)

```
Broadcaster                  Server                    Viewer
    │                          │                          │
    │ createOffer()            │                          │
    │ setLocalDescription()    │                          │
    ├────── offer ────────────►│                          │
    │                          ├────── offer ────────────►│
    │                          │            setRemoteDesc()│
    │                          │            createAnswer() │
    │                          │            setLocalDesc() │
    │                          │◄────── answer ───────────┤
    │◄────── answer ───────────┤                          │
    │ setRemoteDesc()          │                          │
```

#### Phase 3: ICE Candidate Exchange

```
Broadcaster                  Server                    Viewer
    │                          │                          │
    ├── ice-candidate ────────►│                          │
    │                          ├── ice-candidate ────────►│
    │                          │                          │
    │                          │◄── ice-candidate ────────┤
    │◄── ice-candidate ─────────┤                          │
    │                          │                          │
    │  (ICE candidates continue to exchange until         │
    │   connection is established)                        │
```

#### Phase 4: Media Streaming

```
Broadcaster                                           Viewer
    │                                                    │
    │ getDisplayMedia() → Screen + Audio                │
    │                                                    │
    │ =============== RTP Media Packets ===============►│
    │                (Direct P2P Connection)            │
    │                                                    │
    │                                                    │ Display
    │                                                    │ video element
```

## Data Flow Diagrams

### Broadcaster Workflow

```
User Action: "Start Sharing"
        ↓
getDisplayMedia() → Browser shows screen picker
        ↓
User selects screen/window
        ↓
MediaStream obtained (video + audio tracks)
        ↓
For each viewer in room:
    ↓
    Create RTCPeerConnection
    ↓
    Add tracks to connection
    ↓
    Create SDP offer
    ↓
    Send offer via signaling server
    ↓
    Receive answer from viewer
    ↓
    Exchange ICE candidates
    ↓
    Connection established
    ↓
    Media flows via RTP
```

### Viewer Workflow

```
Join Room
    ↓
Connect to signaling server
    ↓
Wait for broadcaster offer
    ↓
Receive SDP offer
    ↓
Create RTCPeerConnection
    ↓
Set remote description (offer)
    ↓
Create SDP answer
    ↓
Set local description (answer)
    ↓
Send answer via signaling server
    ↓
Exchange ICE candidates
    ↓
ontrack event fired
    ↓
Receive MediaStream
    ↓
Display in video element
```

## Network Protocols

### WebSocket (Signaling)

**Protocol**: `ws://`
**Port**: 3001
**Purpose**: Coordinate peer connection setup

**Message Format**:
```json
{
  "type": "offer|answer|ice-candidate|join|leave",
  "roomId": "ABC123",
  "senderId": "broadcaster-123-abc",
  "targetId": "viewer-456-def",
  "offer": { /* SDP object */ },
  "answer": { /* SDP object */ },
  "candidate": { /* ICE candidate */ }
}
```

### WebRTC (Media)

**Protocols**:
- SRTP (Secure Real-time Transport Protocol) for media
- SCTP (Stream Control Transmission Protocol) for data channels
- ICE (Interactive Connectivity Establishment) for NAT traversal

**Ports**: Dynamic (negotiated via ICE)

**STUN Servers Used**:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

Purpose: Help peers discover their public IP addresses for direct connection

## Connection States

### WebSocket States

| State | Description |
|-------|-------------|
| `connecting` | Initial state, attempting connection |
| `connected` | WebSocket open and ready |
| `disconnected` | Connection closed |
| `failed` | Connection attempt failed |

### RTCPeerConnection States

| State | Description |
|-------|-------------|
| `new` | Initial state |
| `connecting` | ICE candidates being exchanged |
| `connected` | Successfully connected, media flowing |
| `disconnected` | Connection lost temporarily |
| `failed` | Connection failed permanently |
| `closed` | Connection closed gracefully |

## Security Considerations

### Current Implementation (Development)

- **Protocol**: HTTP/WS (unencrypted)
- **Authentication**: None
- **Room Access**: Anyone with room code
- **Network**: Local network only

### Production Recommendations

1. **Use HTTPS/WSS**:
   ```javascript
   const serverUrl = `wss://${window.location.hostname}:3001`;
   ```

2. **Add Authentication**:
   - User login system
   - JWT tokens for WebSocket auth
   - Room password protection

3. **Implement TURN Server** (for internet use):
   ```javascript
   iceServers: [
     { urls: 'stun:stun.l.google.com:19302' },
     {
       urls: 'turn:your-turn-server.com:3478',
       username: 'user',
       credential: 'pass'
     }
   ]
   ```

4. **Rate Limiting**: Prevent DoS on signaling server

5. **Input Validation**: Sanitize all client inputs

## Performance Characteristics

### Latency

- **Local Network**: 100-300ms typical
- **Components**:
  - Screen capture: ~50ms
  - Encoding: ~30-50ms
  - Network transmission: ~20-100ms (LAN)
  - Decoding: ~30-50ms
  - Rendering: ~16ms (60fps)

### Bandwidth Usage

**Per Viewer Connection**:
- Video: 1-5 Mbps (depends on resolution and motion)
- Audio: 64-128 Kbps
- Signaling: < 1 Kbps

**Broadcaster Upload**:
- Total = (Video + Audio) × Number of Viewers
- Example: 3 Mbps × 5 viewers = 15 Mbps upload required

### Scalability

**Current Architecture Limitations**:
- **Broadcaster bandwidth**: Main bottleneck
  - Each viewer requires full bandwidth
  - 10 viewers = 10× bandwidth
- **CPU usage**: Encoding happens once, efficient
- **Recommended max viewers**: 5-10 on typical network

**Scaling Solutions** (not implemented):
1. SFU (Selective Forwarding Unit): Server redistributes single stream
2. MCU (Multipoint Control Unit): Server mixes streams
3. Peer-to-peer cascade: Viewers relay to other viewers

## Error Handling

### Connection Errors

1. **WebSocket Connection Failed**:
   - Display: "Failed to connect to server at hostname:3001"
   - Action: Check server status, firewall

2. **RTCPeerConnection Failed**:
   - Automatic: Attempt ICE restart (not implemented)
   - Manual: User must rejoin room

3. **Screen Capture Denied**:
   - Display: "Failed to start screen sharing"
   - Action: Check browser permissions

### Recovery Mechanisms

1. **WebSocket Reconnection**: Not implemented (would need exponential backoff)
2. **ICE Restart**: Not implemented
3. **Graceful Degradation**: Connection state shown to user

## Browser Compatibility

### Required APIs

| API | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| WebRTC | 74+ | 66+ | 12.1+ | 79+ |
| getDisplayMedia | 72+ | 66+ | 13+ | 79+ |
| WebSocket | ✓ | ✓ | ✓ | ✓ |
| Fullscreen API | ✓ | ✓ | ✓ | ✓ |

### Audio Capture Support

- **Chrome**: Full support (tab + system audio)
- **Firefox**: Tab audio only
- **Safari**: Limited support
- **Edge**: Full support

## File Structure Summary

```
share-screen/
├── server.js                      # WebSocket signaling server
├── src/
│   ├── components/
│   │   ├── RoomSelector.jsx       # UI: Role & room selection
│   │   ├── Broadcaster.jsx        # UI: Screen sharing
│   │   └── Viewer.jsx             # UI: Stream viewing
│   ├── services/
│   │   └── webrtc.js              # WebRTC logic
│   ├── App.jsx                    # Main router
│   ├── App.css                    # Styles
│   └── main.jsx                   # Entry point
├── index.html                     # Vite entry HTML
├── vite.config.js                 # Build configuration
├── README.md                      # User documentation
├── ARCHITECTURE.md                # This file
└── package.json                   # Single package: server + client
```

## Extension Points

### Adding New Features

1. **Recording**:
   - Use MediaRecorder API on viewer side
   - Capture canvas element or video stream
   - Location: Add to `Viewer.jsx`

2. **Chat**:
   - Use WebRTC Data Channels
   - Add message handlers in `webrtc.js`
   - Create new `Chat.jsx` component

3. **Screen Annotation**:
   - Overlay canvas on video element
   - Send drawing data via data channels
   - Location: Extend `Broadcaster.jsx`

4. **Quality Settings**:
   - Modify getDisplayMedia constraints
   - Add UI controls in `Broadcaster.jsx`
   ```javascript
   video: {
     cursor: 'always',
     displaySurface: 'monitor',
     width: { ideal: 1920 },
     height: { ideal: 1080 },
     frameRate: { ideal: 30, max: 60 }
   }
   ```

## Monitoring and Debugging

### Client-Side Logging

Enable detailed WebRTC logs:
```javascript
// In browser console
localStorage.debug = 'webrtc:*'
```

### Server-Side Logging

Current logs:
- Connection events
- Room join/leave
- Message relay
- Error conditions

Enhance logging:
```javascript
// Add detailed message logging
console.log('Message:', JSON.stringify(message, null, 2));
```

### WebRTC Stats

Get connection statistics:
```javascript
peerConnection.getStats().then(stats => {
  stats.forEach(report => {
    if (report.type === 'inbound-rtp') {
      console.log('Packets received:', report.packetsReceived);
      console.log('Bytes received:', report.bytesReceived);
      console.log('Packets lost:', report.packetsLost);
    }
  });
});
```

## Conclusion

This architecture provides a solid foundation for local network screen sharing using modern web technologies. The separation of concerns (signaling vs media transport), component modularity, and clear data flow make it easy to understand, maintain, and extend.

Key strengths:
- Simple, understandable codebase
- Minimal dependencies
- Direct peer-to-peer communication
- Modern React patterns
- Cross-browser compatibility

Areas for production enhancement:
- Security (HTTPS, authentication)
- Scalability (SFU/MCU)
- Error recovery
- Quality adaptation
- Comprehensive testing
