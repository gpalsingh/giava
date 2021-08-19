import { useEffect, useState, useRef } from 'react';
import './App.css';

function App() {
  const [hasPermissions, setHasPermission] = useState();
  const [isUsingVideo, setIsUsingVideo] = useState(false);
  const [currentStream, setCurrentStream] = useState();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const playerRef = useRef(null);

  const handleStartVideo = () => {
    setIsUsingVideo(true);
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    }).then(stream => {
      console.log('got stream', stream);
      setCurrentStream(stream);
      setHasPermission(true);
    }).catch(error => {
      console.log('Media access error', error);
      setHasPermission(false);
    });
  };

  const handleStopVideo = () => {
    setIsUsingVideo(false);
    currentStream.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });
    setCurrentStream(null);
  };

  const handleMute = () => {
    const tracks = currentStream.getAudioTracks();
    if (tracks.length > 0) {
      const track = tracks[0];
      track.enabled = false;
      setIsMuted(true);
    }
  };

  const handleDisableVideo = () => {
    const tracks = currentStream.getVideoTracks();
    if (tracks.length > 0) {
      const track = tracks[0];
      track.enabled = false;
      setIsVideoMuted(true);
    }
  };

  const handleUnMute = () => {
    const tracks = currentStream.getAudioTracks();
    if (tracks.length > 0) {
      const track = tracks[0];
      track.enabled = true;
      setIsMuted(false);
    }
  };

  const handleReEnableVideo = () => {
    const tracks = currentStream.getVideoTracks();
    if (tracks.length > 0) {
      const track = tracks[0];
      track.enabled = true;
      setIsVideoMuted(false);
    }
  };

  useEffect(() => {
    if (playerRef.current && !playerRef.current.srcObject && isUsingVideo && currentStream) {
      playerRef.current.srcObject = currentStream;
    }
  }, [currentStream, isUsingVideo, playerRef]);

  return (
    <div>
      <div>
        {
          isUsingVideo ?
            <>
              {
                currentStream &&
                <button onClick={handleStopVideo}>Stop video</button>
              }
            </> :
            <button onClick={handleStartVideo}>Start video</button>
        }


      </div>
      {
        isUsingVideo &&
        <>
          {(typeof hasPermissions === 'boolean') ?
            <div>
              {
                hasPermissions ?
                  'Audio and video is ready' :
                  'App will require audio and video permissions to function properly'
              }
            </div> :
            <div>
              Starting...
            </div>
          }
        </>
      }

      {isUsingVideo && currentStream &&
        <div>
          Video:
          <video id="localVideo" autoPlay playsInline ref={playerRef} style={{ transform: 'scaleX(-1)' }} />
          <div>
            {isMuted ?
              <button onClick={handleUnMute}>Unmute</button> :
              <button onClick={handleMute}>Mute</button>
            }
            {isVideoMuted ?
              <button onClick={handleReEnableVideo}>Enable Video</button> :
              <button onClick={handleDisableVideo}>Disable Video</button>
            }
          </div>
        </div>
      }
    </div>
  );
}

export default App;
