import { useState, useEffect } from 'react';

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let id = '';
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) id += chars[arr[i] % chars.length];
  return id;
}

function RoomSelector({ onJoin, initialRoomId = '', initialRole = '', initialPassword = '', initialUsername = '', error }) {
  const [mode, setMode] = useState(initialRole === 'broadcaster' ? 'broadcast' : initialRoomId ? 'watch' : 'broadcast');
  const [username, setUsername] = useState(initialUsername || localStorage.getItem('ss-username') || '');
  const [roomCode, setRoomCode] = useState(initialRoomId);
  const [password, setPassword] = useState(initialPassword);
  const [formError, setFormError] = useState(error || null);

  useEffect(() => {
    if (error) setFormError(error);
  }, [error]);

  const startBroadcast = (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) { setFormError('Yayın açmak için bir kullanıcı adı gerekli.'); return; }
    localStorage.setItem('ss-username', name);
    const code = generateRoomId();
    onJoin({ roomCode: code, userRole: 'broadcaster', name, pass: password.trim() });
  };

  const watch = (e) => {
    e.preventDefault();
    const name = username.trim();
    const code = roomCode.trim().toUpperCase();
    if (!name) { setFormError('Odaya girmek için bir kullanıcı adı gerekli.'); return; }
    if (code.length < 4) { setFormError('Geçerli bir oda kodu gir (6 haneli kodu yayıncıdan al).'); return; }
    localStorage.setItem('ss-username', name);
    onJoin({ roomCode: code, userRole: 'viewer', name, pass: password.trim() });
  };

  return (
    <div className="room-selector">
      <div className="welcome-card">
        <div className="brand">
          <div>
            <h1>ShareScreen</h1>
            <p className="subtitle">Ekranını paylaş, arkadaşların izlesin.</p>
          </div>
        </div>

        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${mode === 'broadcast' ? 'active' : ''}`}
            onClick={() => { setMode('broadcast'); setFormError(null); }}
          >
            Yayın Aç
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'watch' ? 'active' : ''}`}
            onClick={() => { setMode('watch'); setFormError(null); }}
          >
            İzle
          </button>
        </div>

        {formError && <div className="error-message">{formError}</div>}

        {mode === 'broadcast' ? (
          <form onSubmit={startBroadcast} className="selector-form">
            <div className="form-group">
              <label htmlFor="bc-name">Kullanıcı adın</label>
              <input
                id="bc-name"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="örn. hasan"
                maxLength={24}
                autoComplete="nickname"
              />
            </div>
            <div className="form-group">
              <label htmlFor="bc-pass">
                Oda şifresi <span className="optional">(isteğe bağlı)</span>
              </label>
              <input
                id="bc-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Boş bırakırsan şifresiz olur"
                maxLength={32}
                autoComplete="off"
              />
              <p className="help-text">Oda kodun otomatik oluşturulur, yayına geçince kopyalayıp arkadaşlarına atarsın.</p>
            </div>
            <button type="submit" className="btn btn-primary btn-large">
              Yayına Başla
            </button>
          </form>
        ) : (
          <form onSubmit={watch} className="selector-form">
            <div className="form-group">
              <label htmlFor="w-code">Oda kodu</label>
              <input
                id="w-code"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="room-code-input"
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label htmlFor="w-name">Kullanıcı adın</label>
              <input
                id="w-name"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="örn. ayşe"
                maxLength={24}
                autoComplete="nickname"
              />
            </div>
            <div className="form-group">
              <label htmlFor="w-pass">Oda şifresi <span className="optional">(odaya aitse)</span></label>
              <input
                id="w-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifresiz oda ise boş bırak"
                maxLength={32}
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-large">
              Odaya Katıl
            </button>
          </form>
        )}

        <div className="features">
          <span>Şifreli oda</span>
          <span>Canlı sohbet</span>
          <span>4K'a kadar</span>
          <span>Sınırsız izleyici</span>
        </div>
      </div>
    </div>
  );
}

export default RoomSelector;
