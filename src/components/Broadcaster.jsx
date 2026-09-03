import { useState, useEffect, useRef } from 'react';
import WebRTCService, { QUALITY_PRESETS } from '../services/webrtc';
import Chat from './Chat';

function Broadcaster({ roomId, username, password, onLeave }) {
  const [isSharing, setIsSharing] = useState(false);
  const [roster, setRoster] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting');
  const [error, setError] = useState(null);
  const [quality, setQuality] = useState('4k');
  const [actualRes, setActualRes] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [previewHidden, setPreviewHidden] = useState(false);
  const [copied, setCopied] = useState('');

  const webrtcRef = useRef(null);
  const videoRef = useRef(null);
  const chatRef = useRef(null);

  const shareLink = `${window.location.origin}/?room=${roomId}${password ? `&p=${encodeURIComponent(password)}` : ''}`;
  const embedCode = `<iframe src="${window.location.origin}/embed?room=${roomId}${password ? `&p=${encodeURIComponent(password)}` : ''}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen width="960" height="540" style="border:0"></iframe>`;

  useEffect(() => {
    const webrtc = new WebRTCService();
    webrtcRef.current = webrtc;
    webrtc.quality = quality;

    webrtc.onRosterChange = (clients) => setRoster(clients);

    webrtc.onChat = (msg) => {
      chatRef.current?.addIncoming({ username: msg.username, text: msg.text, ts: msg.ts, clientId: msg.clientId, role: msg.role });
    };

    webrtc.onRoomClosed = () => onLeave('Yayın sonlandırıldı.');

    webrtc.onTrackReplaced = (stream) => {
      if (videoRef.current) videoRef.current.srcObject = stream;
      reportActualRes(stream);
    };

    webrtc.onConnectionStateChange = (peerId, state) => {
      console.log(`Viewer ${peerId} state:`, state);
      if (state === 'connected') setConnectionState('connected');
    };

    const serverUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    webrtc.connect(serverUrl, roomId, 'broadcaster', username, password)
      .then(() => {
        setConnectionState('connected');
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to connect:', err);
        if (err.code === 'room-taken') onLeave(`Oda kodu ${roomId} zaten kullanımda.`);
        else setError('Sunucuya bağlanınamadı.');
      });

    return () => {
      webrtc.disconnect();
    };
  }, [roomId]);

  // Announce join/leave in chat
  useEffect(() => {
    if (connectionState !== 'connected') return;
    chatRef.current?.addSystem(`Yayın hazır — oda kodu: ${roomId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]);

  const viewers = roster.filter((c) => c.role === 'viewer');

  const reportActualRes = (stream) => {
    const track = stream && stream.getVideoTracks()[0];
    if (!track || !track.getSettings) return;
    const s = track.getSettings();
    if (s.width && s.height) setActualRes(`${s.width}×${s.height}`);
  };

  const startSharing = async () => {
    try {
      setError(null);
      const stream = await webrtcRef.current.startScreenShare();
      if (videoRef.current) videoRef.current.srcObject = stream;
      reportActualRes(stream);
      setIsSharing(true);
    } catch (err) {
      console.error('Error starting screen share:', err);
      setError('Ekran paylaşımına izin verilmedi.');
    }
  };

  const stopSharing = () => {
    webrtcRef.current.stopScreenShare();
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsSharing(false);
    setActualRes(null);
  };

  const handleQualityChange = async (q) => {
    const prev = webrtcRef.current.quality;
    webrtcRef.current.quality = q;
    setQuality(q);
    if (!isSharing) return;
    setSwitching(true);
    setError(null);
    try {
      await webrtcRef.current.setQuality(q);
    } catch (err) {
      console.error('Quality switch failed:', err);
      webrtcRef.current.quality = prev;
      setQuality(prev);
      setError(`${QUALITY_PRESETS[q].label} değiştirilemedi — ekrani tekrar seçtiğinde mevcut kalite devam eder.`);
    } finally {
      setSwitching(false);
    }
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('fail');
    }
  };
  // Fallback for browsers without clipboard permission (e.g. inside iframes)
  const copyFallback = (text, key) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { setCopied('fail'); }
    document.body.removeChild(ta);
  };

  const handleLeave = () => {
    stopSharing();
    webrtcRef.current.disconnect();
    onLeave();
  };

  const viewersLabel = `${viewers.length} izleyici`;

  return (
    <div className="room-layout">
      <div className="room-main">
        <div className="header">
          <div>
            <h2>Yayın</h2>
            <div className="who-am-i"><span className="host-chip">Sunucu</span>{username}</div>
          </div>
          <div className="room-info">
            <span className={`status ${connectionState}`}>
              {connectionState === 'connected' ? 'Bağlı' : 'Bağlanıyor…'}
            </span>
          </div>
        </div>

        <div className="share-links">
          <div className="link-row">
            <span className="link-label">Oda kodu</span>
            <code className="room-code">{roomId}</code>
            <button className="btn btn-small" onClick={() => copy(roomId, 'code')}>
              {copied === 'code' ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          <div className="link-row">
            <span className="link-label">Davet linki</span>
            <code className="room-link" title={shareLink}>{shareLink}</code>
            <button className="btn btn-small" onClick={() => copy(shareLink, 'link')}>
              {copied === 'link' ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          <div className="link-row">
            <span className="link-label">Embed kodu</span>
            <code className="room-link" title={embedCode}>{embedCode}</code>
            <button className="btn btn-small" onClick={() => (navigator.clipboard ? copy(embedCode, 'embed') : copyFallback(embedCode, 'embed'))}>
              {copied === 'embed' ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          {password && <p className="help-text">Oda şifreli: izleyiciler <b>{password}</b> şifresini girmeli (link otomatik taşır).</p>}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`${isSharing ? 'active' : 'inactive'} ${previewHidden ? 'hidden-preview' : ''}`}
          />
          {!isSharing && (
            <div className="placeholder">
              <p>Aşağıdan “Yayına Başla”ya bas ve paylaşmak istediğin ekranı seç.</p>
            </div>
          )}
          {isSharing && !previewHidden && (
            <button
              className="fullscreen-btn"
              onClick={() => setPreviewHidden(true)}
              title="Önizlemeyi gizle (yayın devam eder)"
            >
              Gizle
            </button>
          )}
          {isSharing && previewHidden && (
            <div className="placeholder">
              <p>Önizleme gizli — yayın izleyicilere devam ediyor.</p>
              <button className="btn btn-secondary" onClick={() => setPreviewHidden(false)}>
                Önizlemeyi Geri Getir
              </button>
            </div>
          )}
        </div>

        <div className="bottom-bar">
          <div className="quality-selector">
            <span className="quality-label">Kalite:</span>
            {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                className={`quality-btn ${quality === key ? 'active' : ''}`}
                onClick={() => handleQualityChange(key)}
                disabled={switching}
                title={`${preset.width}×${preset.height} @ ${preset.frameRate}fps, ${(preset.maxBitrate / 1_000_000).toFixed(0)} Mbps`}
              >
                {preset.label}
              </button>
            ))}
            {switching && <span className="quality-switching">değiştiriliyor… (ekranı tekrar seç)</span>}
            {actualRes && <span className="actual-res">{actualRes}</span>}
          </div>

          <div className="controls">
            {!isSharing ? (
              <button className="btn btn-primary" onClick={startSharing}>Yayına Başla</button>
            ) : (
              <button className="btn btn-danger" onClick={stopSharing}>Yayını Durdur</button>
            )}
            <button className="btn btn-secondary" onClick={handleLeave}>Odayı Kapat</button>
          </div>
        </div>
      </div>

      <aside className="room-side">
        <div className="roster-card">
          <h3>İzleyenler <span className="badge">{viewers.length}</span></h3>
          {viewers.length === 0 && <p className="chat-empty">Henüz kimse izlemiyor. Linki paylaş!</p>}
          <ul className="roster-list">
            {viewers.map((v) => (
              <li key={v.id}>{v.username}<span className="roster-tag">İzleyici</span></li>
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
    </div>
  );
}

export default Broadcaster;
