import { useState, useEffect, useRef } from 'react';
import WebRTCService from '../services/webrtc';
import Chat from './Chat';

function Viewer({ roomId, username, password, onLeave }) {
  const [connectionState, setConnectionState] = useState('connecting');
  const [hasStream, setHasStream] = useState(false);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [roster, setRoster] = useState([]);
  const [showChat, setShowChat] = useState(true);

  const webrtcRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    const webrtc = new WebRTCService();
    webrtcRef.current = webrtc;

    webrtc.onRosterChange = (clients) => setRoster(clients);

    webrtc.onChat = (msg) => {
      chatRef.current?.addIncoming({ username: msg.username, text: msg.text, ts: msg.ts, clientId: msg.clientId, role: msg.role });
    };

    webrtc.onRoomClosed = (msg) => onLeave(msg || 'Yayın sona erdi.');

    webrtc.onRemoteStream = (stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasStream(true);
        setConnectionState('connected');
      }
    };

    webrtc.onConnectionStateChange = (peerId, state) => {
      if (state === 'failed' || state === 'disconnected') {
        setHasStream(false);
        setError('Bağlantı koptu — yayıncı yayını durdurmuş olabilir.');
      }
    };

    const serverUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    webrtc.connect(serverUrl, roomId, 'viewer', username, password)
      .then(() => {
        setConnectionState('connected');
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to connect:', err);
        if (err.code === 'room-not-found' || err.code === 'wrong-password' || err.code === 'username-taken') {
          onLeave(err.message);
        } else {
          setError('Sunucuya bağlanılamadı.');
          setConnectionState('failed');
        }
      });

    return () => {
      webrtc.disconnect();
    };
  }, [roomId]);

  const handleLeave = () => {
    if (isFullscreen) exitFullscreen();
    webrtcRef.current?.disconnect();
    onLeave();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!isFullscreen) {
        await containerRef.current.requestFullscreen?.();
      } else {
        exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const getStatusMessage = () => {
    switch (connectionState) {
      case 'connecting': return 'Odaya bağlanıyor…';
      case 'connected': return hasStream ? 'Yayın alınıyor' : 'Bağlı — yayın bekleniyor';
      case 'failed': return 'Bağlantı kurulamadı';
      default: return connectionState;
    }
  };

  const broadcaster = roster.find((c) => c.role === 'broadcaster');

  return (
    <div className="room-layout">
      <div className="room-main">
        <div className="header">
          <div>
            <h2>İzliyorsun</h2>
            <div className="who-am-i">
              <span className="host-chip">İzleyici</span>{username}
              {broadcaster && <span className="watching-host"> · {broadcaster.username} yayın yapıyor</span>}
            </div>
          </div>
          <div className="room-info">
            <span className={`status ${connectionState}`}>
              {connectionState === 'connected' ? 'Bağlı' : getStatusMessage()}
            </span>
            <button className="btn btn-small chat-toggle" onClick={() => setShowChat((s) => !s)}>
              {showChat ? 'Sohbeti Gizle' : 'Sohbeti Göster'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="video-container" ref={containerRef}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={hasStream ? 'active' : 'inactive'}
          />
          {!hasStream && (
            <div className="placeholder">
              <div className="loader"></div>
              <p>{getStatusMessage()}</p>
              <p className="hint">Yayıncı ekranını paylaştığında otomatik başlar…</p>
            </div>
          )}
          {hasStream && (
            <button
              className="fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
            >
              {isFullscreen ? '⊗' : '⛶'}
            </button>
          )}
        </div>

        <div className="controls">
          {hasStream && (
            <button className="btn btn-primary" onClick={toggleFullscreen}>
              {isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleLeave}>
            Odadan Ayrıl
          </button>
        </div>
      </div>

      {showChat && (
        <aside className="room-side">
          <div className="roster-card">
            <h3>Odadakiler <span className="badge">{roster.length}</span></h3>
            <ul className="roster-list">
              {roster.map((c) => (
                <li key={c.id}>{c.username}{c.id === webrtcRef.current?.clientId ? ' (sen)' : ''}</li>
              ))}
            </ul>
          </div>
          <Chat
            ref={chatRef}
            roster={roster}
            selfId={webrtcRef.current?.clientId}
            selfName={username}
            onSend={(t) => webrtcRef.current?.sendChat(t)}
          />
        </aside>
      )}
    </div>
  );
}

export default Viewer;
