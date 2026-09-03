import { useState, useEffect, useRef } from 'react';
import WebRTCService from '../services/webrtc';

// Minimal player for <iframe> embedding: video only, auto-join, no chrome.
function EmbedPlayer({ roomId, password }) {
  const [connectionState, setConnectionState] = useState('connecting');
  const [hasStream, setHasStream] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const webrtcRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const join = async (attempt = 1) => {
      if (cancelled) return;
      const webrtc = new WebRTCService();
      webrtcRef.current = webrtc;

      webrtc.onRemoteStream = (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasStream(true);
          setConnectionState('connected');
          setError(null);
        }
      };

      webrtc.onRoomClosed = (msg) => {
        setError(msg || 'Yayın sona erdi.');
        setHasStream(false);
      };

      webrtc.onConnectionStateChange = (peerId, state) => {
        if (state === 'failed' || state === 'disconnected') {
          setHasStream(false);
          setError('Yayın bağlantısı koptu.');
        }
      };

      const guestName = `Misafir-${Math.floor(1000 + Math.random() * 9000)}`;
      const serverUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

      try {
        await webrtc.connect(serverUrl, roomId, 'viewer', guestName, password || '');
        if (cancelled) return;
        setConnectionState('connected');
      } catch (err) {
        if (cancelled) return;
        if (err.code === 'username-taken' && attempt < 5) {
          // Regenerate the random suffix and try again silently
          setTimeout(() => join(attempt + 1), 300);
        } else if (err.code === 'room-not-found') {
          setConnectionState('failed');
          setError('Yayın şu anda kapalı.');
        } else if (err.code === 'wrong-password') {
          setConnectionState('failed');
          setError('Oda şifresi geçersiz.');
        } else {
          setConnectionState('failed');
          setError('Bağlantı kurulamadı.');
        }
      }
    };

    join();

    return () => {
      cancelled = true;
      webrtcRef.current?.disconnect();
    };
  }, [roomId, password]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div className="embed-player" ref={containerRef}>
      <video ref={videoRef} autoPlay playsInline className={hasStream ? 'active' : 'inactive'} />
      {!hasStream && !error && (
        <div className="placeholder">
          <div className="loader"></div>
          <p>{connectionState === 'connected' ? 'Yayın bekleniyor…' : 'Bağlanıyor…'}</p>
        </div>
      )}
      {error && (
        <div className="placeholder">
          <p>{error}</p>
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
      {notice && <div className="embed-notice">{notice}</div>}
    </div>
  );
}

export default EmbedPlayer;
