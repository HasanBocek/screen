// WebRTC service for managing peer connections and signaling

export const QUALITY_PRESETS = {
  '720p':  { label: 'HD 720p',   width: 1280, height: 720,  frameRate: 30, maxBitrate: 5_000_000 },
  '1080p': { label: 'Full HD',   width: 1920, height: 1080, frameRate: 30, maxBitrate: 10_000_000 },
  '1440p': { label: '2K QHD',    width: 2560, height: 1440, frameRate: 30, maxBitrate: 18_000_000 },
  '4k':    { label: '4K UHD',    width: 3840, height: 2160, frameRate: 30, maxBitrate: 30_000_000 },
};

class WebRTCService {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this.clientId = null;
    this.role = null; // 'broadcaster' or 'viewer'
    this.peerConnections = new Map();
    this.localStream = null;
    this.quality = '1080p'; // '720p' | '1080p' | '1440p' | '4k'
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onViewerCountChange = null;
    this.onTrackReplaced = null;
    this.onRosterChange = null;   // (clients[]) => void
    this.onChat = null;           // ({username, role, text, ts}) => void
    this.onRoomClosed = null;     // (message) => void

    // ICE configuration - using public STUN servers for local network
    this.iceConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  // Connect to signaling server (waits for join-ok / rejects on join-error)
  connect(serverUrl, roomId, role, username, password) {
    return new Promise((resolve, reject) => {
      this.roomId = roomId;
      this.role = role;
      this.username = (username || '').toString().trim().slice(0, 24);
      this.clientId = `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      let settled = false;
      this._resolveJoin = () => { if (!settled) { settled = true; resolve(); } };
      this._rejectJoin = (err) => { if (!settled) { settled = true; reject(err); } };

      this.ws = new WebSocket(serverUrl);

      this.ws.onopen = () => {
        console.log('Connected to signaling server');

        // Join room
        this.send({
          type: 'join',
          roomId: this.roomId,
          clientId: this.clientId,
          role: this.role,
          username: this.username,
          password: password || ''
        });
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this._rejectJoin(error);
      };

      this.ws.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.ws.onclose = () => {
        console.log('Disconnected from signaling server');
        this._rejectJoin(new Error('disconnected'));
        this.cleanup();
      };
    });
  }

  // Handle incoming signaling messages
  async handleSignalingMessage(message) {
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'join-ok':
        this._resolveJoin();
        if (this.onRosterChange) this.onRosterChange(message.roster || []);
        // Broadcaster seeds offers to any viewers already present (rejoin case).
        if (this.role === 'broadcaster') {
          for (const client of (message.roster || [])) {
            if (client.role === 'viewer' && !this.peerConnections.has(client.id)) {
              await this.createOffer(client.id);
            }
          }
          this.updateViewerCount(message.roster);
        }
        break;

      case 'join-error': {
        const err = new Error(message.message || 'Could not join room');
        err.code = message.code;
        this._rejectJoin(err);
        break;
      }

      case 'roster':
        if (this.onRosterChange) this.onRosterChange(message.clients || []);
        // Broadcaster: seed offers to any viewer we don't have yet.
        if (this.role === 'broadcaster') {
          for (const client of (message.clients || [])) {
            if (client.role === 'viewer' && !this.peerConnections.has(client.id)) {
              await this.createOffer(client.id);
            }
          }
        }
        this.updateViewerCount(message.clients);
        break;

      case 'chat':
        if (this.onChat) this.onChat(message);
        break;

      case 'room-closed':
        if (this.onRoomClosed) this.onRoomClosed(message.message || 'The room was closed.');
        this.cleanup();
        break;

      case 'user-left':
        console.log('User left:', message.clientId);
        this.closePeerConnection(message.clientId);
        break;

      case 'user-joined':
        // Back-compat: broadcaster creates offer for new viewers
        if (this.role === 'broadcaster' && message.role === 'viewer') {
          await this.createOffer(message.clientId);
        }
        break;

      case 'offer':
        await this.handleOffer(message.offer, message.senderId);
        break;

      case 'answer':
        await this.handleAnswer(message.answer, message.senderId);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.candidate, message.senderId);
        break;
    }
  }

  // Send a chat message to everyone in the room
  sendChat(text) {
    const clean = (text || '').toString().trim().slice(0, 500);
    if (!clean) return;
    this.send({ type: 'chat', roomId: this.roomId, text: clean });
  }

  // Create peer connection
  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(this.iceConfig);

    // Add local stream tracks if broadcaster
    if (this.localStream && this.role === 'broadcaster') {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          candidate: event.candidate,
          roomId: this.roomId,
          senderId: this.clientId,
          targetId: peerId
        });
      }
    };

    // Handle remote stream (for viewers)
    pc.ontrack = (event) => {
      console.log('Received remote track');
      if (this.onRemoteStream) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(peerId, pc.connectionState);
      }

      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Attempt to reconnect
        console.log('Connection failed, attempting to reconnect...');
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  // Apply max bitrate to all video senders on a peer connection
  applyQualityToSender(pc) {
    if (this.role !== 'broadcaster') return;
    const preset = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS['1080p'];
    pc.getSenders().forEach((sender) => {
      if (!sender.track || sender.track.kind !== 'video') return;
      const params = sender.getParameters();
      params.encodings = (params.encodings && params.encodings.length ? params.encodings : [{}]).map((enc) => ({
        ...enc,
        maxBitrate: preset.maxBitrate,
      }));
      sender.setParameters(params).catch((err) => console.warn('setParameters failed:', err));
    });
  }

  // Change broadcast quality live (broadcaster only).
  // Re-captures the track at the new resolution and swaps it into every
  // existing peer connection via replaceTrack (no renegotiation needed).
  async setQuality(quality) {
    if (!QUALITY_PRESETS[quality]) throw new Error(`Unknown quality: ${quality}`);
    const oldTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
    this.quality = quality;

    // Not currently sharing: the next startScreenShare() will pick it up.
    if (!oldTrack || this.role !== 'broadcaster') return;

    try {
      const settings = oldTrack.getSettings ? oldTrack.getSettings() : {};
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: QUALITY_PRESETS[quality].width },
          height: { ideal: QUALITY_PRESETS[quality].height },
          frameRate: { ideal: QUALITY_PRESETS[quality].frameRate },
          cursor: 'always',
          displaySurface: settings.displaySurface || 'monitor',
          ...(settings.displaySurface === 'browser' && settings.width
            ? { logicalSurface: { ideal: settings.width }, resizeMode: 'none' }
            : {}),
        },
        audio: false, // keep existing audio track
      });

      const newTrack = newStream.getVideoTracks()[0];
      oldTrack.onended = null;
      newTrack.onended = () => {
        console.log('Screen sharing stopped by user');
        this.stopScreenShare();
      };

      // Swap the track in every viewer connection without renegotiating.
      const swaps = [];
      this.peerConnections.forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track === oldTrack) {
            swaps.push(sender.replaceTrack(newTrack));
          }
        });
      });
      await Promise.all(swaps);

      // Update the local stream preview.
      this.localStream.getTracks().forEach((t) => { if (t !== newTrack) t.stop(); });
      this.localStream.removeTrack(oldTrack);
      this.localStream.addTrack(newTrack);

      if (this.onTrackReplaced) this.onTrackReplaced(this.localStream);
      this.peerConnections.forEach((pc) => this.applyQualityToSender(pc));
    } catch (err) {
      console.error('Error switching quality:', err);
      throw err;
    }
  }

  // Create and send offer (broadcaster to viewer)
  async createOffer(viewerId) {
    const pc = this.createPeerConnection(viewerId);

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });

      await pc.setLocalDescription(offer);

      // Broadcaster owns the outgoing video: raise the encoder bitrate floor so
      // high resolutions aren't throttled to the WebRTC default (~500kbps).
      this.applyQualityToSender(pc);

      this.send({
        type: 'offer',
        offer: offer,
        roomId: this.roomId,
        senderId: this.clientId,
        targetId: viewerId
      });

      console.log('Sent offer to:', viewerId);
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  // Handle incoming offer (viewer receives from broadcaster)
  async handleOffer(offer, broadcasterId) {
    const pc = this.createPeerConnection(broadcasterId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.send({
        type: 'answer',
        answer: answer,
        roomId: this.roomId,
        senderId: this.clientId,
        targetId: broadcasterId
      });

      console.log('Sent answer to:', broadcasterId);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  // Handle incoming answer (broadcaster receives from viewer)
  async handleAnswer(answer, viewerId) {
    const pc = this.peerConnections.get(viewerId);

    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Set remote description for:', viewerId);
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }

  // Handle ICE candidate
  async handleIceCandidate(candidate, peerId) {
    const pc = this.peerConnections.get(peerId);

    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }

  // Start screen sharing (broadcaster only)
  async startScreenShare() {
    try {
      const preset = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS['1080p'];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
          cursor: 'always',
          displaySurface: 'monitor'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      this.localStream = stream;

      // Handle stream end (user stops sharing)
      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen sharing stopped by user');
        this.stopScreenShare();
      };

      return stream;
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }

  // Stop screen sharing
  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach((pc) => {
      pc.close();
    });
    this.peerConnections.clear();
  }

  // Close specific peer connection
  closePeerConnection(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
  }

  // Update viewer count
  updateViewerCount(clients = null) {
    if (this.onViewerCountChange) {
      const count = clients
        ? clients.filter(c => c.role === 'viewer').length
        : this.peerConnections.size;
      this.onViewerCountChange(count);
    }
  }

  // Send message to signaling server
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Cleanup
  cleanup() {
    this.stopScreenShare();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
  }

  // Disconnect
  disconnect() {
    if (this.ws) {
      this.send({
        type: 'leave',
        roomId: this.roomId,
        clientId: this.clientId
      });
    }
    this.cleanup();
  }
}

export default WebRTCService;
