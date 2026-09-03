import { useState, useEffect } from 'react';
import RoomSelector from './components/RoomSelector';
import Broadcaster from './components/Broadcaster';
import Viewer from './components/Viewer';
import EmbedPlayer from './components/EmbedPlayer';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('selector');
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [joinError, setJoinError] = useState(null);

  // Embed mode: /embed?room=CODE&p=PASSWORD — player-only, no chrome.
  const [embedParams, setEmbedParams] = useState(null);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');

    if (path === '/embed') {
      if (room) {
        setEmbedParams({ room: room.toUpperCase(), pass: params.get('p') || '' });
      } else {
        setEmbedParams({ room: null, pass: '' });
      }
      return;
    }

    if (room) {
      setRoomId(room.toUpperCase());
      setPassword(params.get('p') || '');
      setRole('viewer');
      // Strip params so a reload doesn't double-join
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleJoin = ({ roomCode, userRole, name, pass }) => {
    setRoomId(roomCode);
    setRole(userRole);
    setUsername(name);
    setPassword(pass || '');
    setJoinError(null);
    setCurrentView('room');
  };

  const handleLeave = (msg) => {
    setCurrentView('selector');
    setRoomId('');
    setPassword('');
    setJoinError(msg || null);
    window.history.replaceState({}, '', '/');
  };

  if (embedParams) {
    return (
      <div className="app embed-app">
        {embedParams.room ? (
          <EmbedPlayer roomId={embedParams.room} password={embedParams.pass} />
        ) : (
          <div className="embed-player">
            <div className="placeholder">
              <p>embed?room=KOD eksik — yayın linkindeki embed kodunu kullan.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {currentView === 'selector' && (
        <RoomSelector
          onJoin={handleJoin}
          initialRoomId={roomId}
          initialRole={role}
          initialPassword={password}
          initialUsername={username}
          error={joinError}
        />
      )}

      {currentView === 'room' && role === 'broadcaster' && (
        <Broadcaster roomId={roomId} username={username} password={password} onLeave={handleLeave} />
      )}

      {currentView === 'room' && role === 'viewer' && (
        <Viewer roomId={roomId} username={username} password={password} onLeave={handleLeave} />
      )}
    </div>
  );
}

export default App;
