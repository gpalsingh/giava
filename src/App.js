import { useEffect, useState, useCallback } from 'react';
import './App.css';
import firebase from 'firebase/app';
import 'firebase/firestore';

// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: process.env.REACT_APP_apiKey,
  authDomain: process.env.REACT_APP_authDomain,
  projectId: process.env.REACT_APP_projectId,
  storageBucket: process.env.REACT_APP_storageBucket,
  messagingSenderId: process.env.REACT_APP_messagingSenderId,
  appId: process.env.REACT_APP_appId,
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

function App() {
  const [hasPermissions, setHasPermission] = useState();
  const [isCalling, setIsCalling] = useState(false);
  const [localStream, setLocalStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const [peerConnection, setPeerConnection] = useState();
  const [currentState, setCurrentState] = useState('idle');
  const [roomId, setRoomId] = useState();
  const [callType, setCallType] = useState();

  const createAnswer = useCallback(async (roomSnapshot, roomRef) => {
    const offer = roomSnapshot.data().offer;
    console.log('setting remote description');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
  }, [peerConnection]);

  const createOffer = useCallback(async (roomRef) => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const roomWithOffer = {
      'offer': {
        type: offer.type,
        sdp: offer.sdp,
      },
    };

    await roomRef.set(roomWithOffer);
  }, [peerConnection]);

  useEffect(() => {
    if (
      peerConnection &&
      localStream &&
      remoteStream &&
      (currentState === 'waitingForLocalStream') &&
      callType
    ) {
      setCurrentState('creatingRoom');

      const joinOrCreateRoom = async () => {
        const db = firebase.firestore();
        const roomRef = callType === 'host' ?
          await db.collection('rooms').doc() :
          db.collection('rooms').doc(`${roomId}`);
        let [localICECollectionName, remoteICECollectionName] = ['hostCandidates', 'joinerCandidates'];
        let roomSnapshot;


        if (callType === 'joiner') {
          roomSnapshot = await roomRef.get();
          if (!roomSnapshot.exists) {
            setCurrentState('error');
            return;
          }

          [remoteICECollectionName, localICECollectionName] = [localICECollectionName, remoteICECollectionName];
        }

        // Add tracks to local connection
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });

        // Gather local ICE candidates
        const localCandidatesCollection = roomRef.collection(localICECollectionName);
        peerConnection.addEventListener('icecandidate', event => {
          if (!event.candidate) {
            return;
          }
          localCandidatesCollection.add(event.candidate.toJSON());
        });

        // Add tracks handler for remote stream
        peerConnection.addEventListener('track', event => {
          event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
          });
        });

        // Create offer
        if (callType === 'host') {
          await createOffer(roomRef);
          setRoomId(roomRef.id);

          // Handler for answer
          roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data && data.answer) {
              const rtcSessionDescription = new RTCSessionDescription(data.answer);
              await peerConnection.setRemoteDescription(rtcSessionDescription);
            }
          });
        } else {
          await createAnswer(roomSnapshot, roomRef);
        }

        // Handler for remote ICE candidates
        roomRef.collection(remoteICECollectionName).onSnapshot(snapshot => {
          snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
              let data = change.doc.data();
              await peerConnection.addIceCandidate(new RTCIceCandidate(data));
            }
          });
        });

        setCurrentState('ready');
      };

      try {
        joinOrCreateRoom();
      } catch {
        setCurrentState('error');
      }
    }
  }, [callType, createAnswer, createOffer, currentState, localStream, peerConnection, remoteStream, roomId]);

  const handleStartVideo = (type = 'host') => {
    setCallType(type);
    setIsCalling(true);
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    }).then(stream => {
      setLocalStream(stream);
      setHasPermission(true);
    }).catch(error => {
      setHasPermission(false);
    });

    setRemoteStream(new MediaStream());

    createPeerConnection();
  };

  const createPeerConnection = () => {
    const peerConnectionNew = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            process.env.REACT_APP_SERVER_1,
            process.env.REACT_APP_SERVER_2,
          ].filter(Boolean),
          iceCandidatePoolSize: 10,
        }
      ]
    });

    setPeerConnection(peerConnectionNew);
    setCurrentState('waitingForLocalStream');
  };

  const handleStopVideo = async () => {
    setIsCalling(false);
    const prevRoomId = roomId;

    localStream.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });
    setLocalStream(null);

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
    }
    setRemoteStream(null);

    if (peerConnection) {
      peerConnection.close();
    }
    setPeerConnection(null);

    // Delete room on hangup
    if (callType === 'host') {
      setRoomId(null);
      const db = firebase.firestore();
      const roomRef = db.collection('rooms').doc(prevRoomId);
      const hostCandidates = await roomRef.collection('joinerCandidates').get();
      hostCandidates.forEach(async candidate => {
        await candidate.ref.delete();
      });
      const joinerCandidates = await roomRef.collection('hostCandidates').get();
      joinerCandidates.forEach(async candidate => {
        await candidate.ref.delete();
      });
      await roomRef.delete();
    }

    setCallType(null);
    setCurrentState('idle');
  };

  // Show local stream video
  const setLocalStreamRef = useCallback(node => {
    if (node && isCalling && localStream) {
      node.srcObject = localStream;
    }
  }, [isCalling, localStream]);

  // Show remote stream video
  const setRemoteStreamRef = useCallback(node => {
    if (node && isCalling && remoteStream) {
      node.srcObject = remoteStream;
    }
  }, [isCalling, remoteStream]);

  return (
    <div>
      <div>
        {
          isCalling ?
            <>
              {
                localStream &&
                <div>
                  <button onClick={handleStopVideo}>{
                    callType === 'host' ? 'End' : 'Leave'
                  } call</button>
                </div>
              }
            </> :
            <div>
              <button onClick={() => { handleStartVideo('host') }}>Start call</button>
              <button onClick={() => { handleStartVideo('joiner') }}
                disabled={[null, undefined, ''].includes(roomId)}
              >
                Join call
              </button>
              <input type="text" placeholder="Enter room ID"
                value={roomId || ''}
                onChange={(event) => { setRoomId(event.target.value) }}
              />
            </div>
        }


      </div>
      {
        isCalling &&
        <>
          {(typeof hasPermissions === 'boolean') ?
            <div>
              {
                hasPermissions ?
                  <>
                    {roomId ?
                      'Room ID: ' + roomId :
                      'Creating room...'
                    }
                  </> :
                  'App will require audio and video permissions to function properly'
              }
            </div> :
            <div>
              Starting...
            </div>
          }
        </>
      }

      {isCalling && localStream && remoteStream &&
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}>
          <video id="localVideo" autoPlay playsInline ref={setLocalStreamRef}
            style={{
              background: 'black',
              width: '640px',
              height: '100%',
              display: 'block',
              margin: '1em',
              transform: 'scaleX(-1)',
            }}
          />
          <video id="remoteVideo" autoPlay playsInline ref={setRemoteStreamRef}
            style={{
              background: 'black',
              width: '640px',
              height: '100%',
              display: 'block',
              margin: '1em',
            }}
          />
        </div>
      }
    </div>
  );
}

export default App;
