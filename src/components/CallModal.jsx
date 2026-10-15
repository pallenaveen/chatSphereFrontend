import React, { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import '../styles/CallModal.css';

export default function CallModal({ activeCall, socket, currentUserId, onClose }) {
  const [stream, setStream] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [receivingCall, setReceivingCall] = useState(!activeCall?.isCaller);
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  const isVideo = activeCall?.callType === 'video';
  const contactName = activeCall?.name || 'Contact';

  // Public STUN servers to negotiate local/network peer paths
  const peerConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  // Call timer once accepted
  useEffect(() => {
    let interval;
    if (callAccepted) {
      interval = setInterval(() => setCallTimer((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [callAccepted]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    const remainingSecs = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${remainingSecs}`;
  };

  useEffect(() => {
    if (!socket) return;

    const handleCallAccepted = (signal) => {
      console.log('✅ Call accepted signal received by caller!');
      setCallAccepted(true);
      if (connectionRef.current) {
        connectionRef.current.signal(signal);
      }
    };

    const handleCallEnded = () => {
      console.log('❌ Call ended by remote user');
      cleanupAndClose();
    };

    socket.on('call_accepted', handleCallAccepted);
    socket.on('call_ended', handleCallEnded);

    navigator.mediaDevices
      .getUserMedia({ video: isVideo, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }

        if (activeCall?.isCaller) {
          console.log('📞 Initializing peer as caller with STUN config...');
          const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: currentStream,
            config: peerConfig,
          });

          peer.on('signal', (data) => {
            socket.emit('call_user', {
              userToCall: activeCall.targetUserId,
              signalData: data,
              from: currentUserId,
              callType: activeCall.callType,
              name: currentUserLabel(),
            });
          });

          peer.on('stream', (remoteStream) => {
            console.log('🎥 Remote stream acquired on caller side!');
            if (userVideo.current) {
              userVideo.current.srcObject = remoteStream;
            }
          });

          peer.on('error', (err) => console.error('Peer error (Caller):', err));

          connectionRef.current = peer;
        }
      })
      .catch((err) => {
        console.error('Media access error:', err);
        alert('Could not access microphone or camera.');
      });

    return () => {
      socket.off('call_accepted', handleCallAccepted);
      socket.off('call_ended', handleCallEnded);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [socket]);

  const currentUserLabel = () => {
    try {
      const user = JSON.parse(localStorage.getItem('userInfo') || '{}');
      return user.username || user.name || 'ChatSphere User';
    } catch {
      return 'ChatSphere User';
    }
  };

  // Receiver answers the call
  const answerCall = () => {
    setReceivingCall(false);
    setCallAccepted(true);

    if (!stream) {
      console.error('Stream not initialized yet');
      return;
    }

    console.log('📞 Answering call as receiver with STUN config...');
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: peerConfig,
    });

    peer.on('signal', (data) => {
      socket.emit('answer_call', {
        signal: data,
        to: activeCall.from,
      });
    });

    peer.on('stream', (remoteStream) => {
      console.log('🎥 Remote stream acquired on receiver side!');
      if (userVideo.current) {
        userVideo.current.srcObject = remoteStream;
      }
    });

    peer.on('error', (err) => console.error('Peer error (Receiver):', err));

    if (activeCall?.signal) {
      peer.signal(activeCall.signal);
    }

    connectionRef.current = peer;
  };

  const declineCall = () => {
    socket.emit('hang_up', { to: activeCall?.from || activeCall?.targetUserId });
    cleanupAndClose();
  };

  const cleanupAndClose = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    onClose();
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (stream && isVideo) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  return (
    <div className="whatsapp-call-overlay">
      {receivingCall ? (
        <div className="incoming-ring-container">
          <div className="incoming-caller-info">
            <h1>{contactName}</h1>
            <p>incoming {isVideo ? 'video' : 'voice'} call...</p>
          </div>

          <div className="ring-action-buttons">
            <div className="action-btn-group">
              <button className="ring-btn decline-red" onClick={declineCall}>
                ✕
              </button>
              <span>Decline</span>
            </div>

            <div className="action-btn-group">
              <button className="ring-btn accept-green" onClick={answerCall}>
                📞
              </button>
              <span>Accept</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="active-call-container">
          <div className="call-header-info">
            <h2>{contactName}</h2>
            <span>{callAccepted ? formatTime(callTimer) : 'Ringing...'}</span>
          </div>

          <div className="media-streams-wrapper">
            {isVideo ? (
              <>
                <video playsInline ref={userVideo} autoPlay className="remote-video-feed" />
                <div className="local-pip-box">
                  <video playsInline muted ref={myVideo} autoPlay className="local-video-feed" />
                </div>
              </>
            ) : (
              <div className="audio-call-avatar-view">
                <div className="pulse-ring-avatar">
                  {contactName.charAt(0).toUpperCase()}
                </div>
                <audio playsInline ref={userVideo} autoPlay />
              </div>
            )}
          </div>

          <div className="in-call-dock">
            <button className={`dock-btn ${isMuted ? 'muted' : ''}`} onClick={toggleMute}>
              {isMuted ? '🔇' : '🎙️'}
            </button>

            {isVideo && (
              <button className={`dock-btn ${isVideoOff ? 'muted' : ''}`} onClick={toggleVideo}>
                {isVideoOff ? '📷 Off' : '📹 On'}
              </button>
            )}

            <button className="dock-btn end-call" onClick={declineCall}>
              📞
            </button>
          </div>
        </div>
      )}
    </div>
  );
}