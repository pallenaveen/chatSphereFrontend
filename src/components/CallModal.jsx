import React, { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'simple-peer';
import { ArrowUp, Mic, MicOff, MonitorUp, Phone, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import API from '../api/axios';
import '../styles/CallModal.css';

const peerConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export default function CallModal({ activeCall, socket, currentUserId, onClose }) {
  const [stream, setStream] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [receivingCall, setReceivingCall] = useState(activeCall ? !activeCall.isCaller : false);
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [answerSwipeOffset, setAnswerSwipeOffset] = useState(0);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const originalStreamRef = useRef(null);
  const streamRef = useRef(null);
  const peerInitializedRef = useRef(false);
  const answerCalledRef = useRef(false);
  const isClosingRef = useRef(false);

  const callAcceptedRef = useRef(callAccepted);
  const callTimerRef = useRef(callTimer);
  const receivingCallRef = useRef(receivingCall);
  const hasLoggedRef = useRef(false);
  const answerSwipeStartRef = useRef(null);
  const didAnswerSwipeRef = useRef(false);

  useEffect(() => { callAcceptedRef.current = callAccepted; }, [callAccepted]);
  useEffect(() => { callTimerRef.current = callTimer; }, [callTimer]);
  useEffect(() => { receivingCallRef.current = receivingCall; }, [receivingCall]);

  const isVideo = activeCall?.callType === 'video';
  const contactName = activeCall?.name || activeCall?.callerName || 'Contact';
  const contactAvatar = activeCall?.avatar || activeCall?.senderAvatar || activeCall?.profilePic || '';

  const getTargetUserId = useCallback(() => {
    if (activeCall?.isCaller) {
      return activeCall?.targetUserId || activeCall?.receiverId || activeCall?.to;
    }
    return activeCall?.from || activeCall?.callerId || activeCall?.senderId;
  }, [activeCall]);

  const recordAndClose = useCallback(async (endStatus) => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    isClosingRef.current = true;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }

    const targetId = getTargetUserId();
    if (activeCall?.isCaller && targetId) {
      const status = callAcceptedRef.current
        ? 'completed'
        : (endStatus === 'rejected' ? 'rejected' : 'missed');
      try {
        await API.post('/calls', {
          callId: activeCall.callId,
          receiverId: targetId,
          callType: activeCall.callType || 'audio',
          status,
          duration: callAcceptedRef.current ? callTimerRef.current : 0,
        });
      } catch (err) {
        console.error('Failed to save call log:', err);
      }
    }

    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    const currentStream = streamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (originalStreamRef.current && originalStreamRef.current !== currentStream) {
      originalStreamRef.current.getTracks().forEach((t) => t.stop());
      originalStreamRef.current = null;
    }

    if (onClose) onClose();
  }, [activeCall, onClose, getTargetUserId]);

  useEffect(() => {
    if (receivingCall && !callAccepted) {
      const savedRingtone = localStorage.getItem('chatsphere_custom_ringtone');
      if (savedRingtone) {
        audioPlayerRef.current = new Audio(savedRingtone);
        audioPlayerRef.current.loop = true;
        audioPlayerRef.current.play().catch(() => {});
      }
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
    }
    return () => {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
    };
  }, [receivingCall, callAccepted]);

  useEffect(() => {
    let interval;
    if (callAccepted) {
      interval = setInterval(() => {
        setCallTimer((prev) => {
          const next = prev + 1;
          callTimerRef.current = next;
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callAccepted]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    const remainingSecs = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${remainingSecs}`;
  };

  const currentUserLabel = () => {
    try {
      const user = JSON.parse(localStorage.getItem('userInfo') || '{}');
      return user.username || user.name || 'ChatSphere User';
    } catch {
      return 'ChatSphere User';
    }
  };

  const currentUserAvatar = () => {
    try {
      const user = JSON.parse(localStorage.getItem('userInfo') || '{}');
      return user.avatar || user.profilePic || '';
    } catch {
      return '';
    }
  };

  // Caller WebRTC Handshake Lifecycle
  useEffect(() => {
    if (!socket || !activeCall) return;
    let isMounted = true;

    const handleCallAccepted = (data) => {
      if (!isMounted || !activeCall.isCaller || data?.callId !== activeCall.callId) return;
      if (connectionRef.current) {
        try {
          connectionRef.current.signal(data.signal);
        } catch (e) {
          console.error('Error signaling peer on acceptance:', e);
        }
      }
    };

    const handleCallEnded = (data) => {
      if (!isMounted || data?.callId !== activeCall.callId) return;
      recordAndClose(data.status);
    };

    socket.on('call_accepted', handleCallAccepted);
    socket.on('call_ended', handleCallEnded);

    if (activeCall.isCaller) {
      navigator.mediaDevices
        .getUserMedia({ video: isVideo, audio: true })
        .then((currentStream) => {
          if (!isMounted || isClosingRef.current) {
            currentStream.getTracks().forEach((t) => t.stop());
            return;
          }

          setStream(currentStream);
          streamRef.current = currentStream;
          originalStreamRef.current = currentStream;
          if (myVideo.current) {
            myVideo.current.srcObject = currentStream;
          }

          if (!peerInitializedRef.current) {
          peerInitializedRef.current = true;

          const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: currentStream,
            config: peerConfig,
          });

          peer.on('signal', (data) => {
            if (isMounted && socket) {
              socket.emit('call_user', {
                callId: activeCall.callId,
                userToCall: getTargetUserId(),
                signalData: data,
                from: currentUserId,
                callType: activeCall.callType,
                name: currentUserLabel(),
                avatar: currentUserAvatar(),
              });
            }
          });

          peer.on('stream', (remoteStream) => {
            if (isMounted && userVideo.current) {
              userVideo.current.srcObject = remoteStream;
            }
          });

          peer.on('connect', () => {
            if (isMounted) {
              callAcceptedRef.current = true;
              setCallAccepted(true);
            }
          });

          peer.on('error', (err) => {
            console.error('Caller Peer error:', err);
          });

          connectionRef.current = peer;
          }
        })
        .catch((err) => {
          console.error('Media access error:', err);
          alert('Could not access microphone or camera.');
          recordAndClose();
        });
    }

    return () => {
      isMounted = false;
      socket.off('call_accepted', handleCallAccepted);
      socket.off('call_ended', handleCallEnded);
    };
  }, [socket, activeCall, currentUserId, isVideo, recordAndClose, getTargetUserId]);

  const answerCall = () => {
    if (answerCalledRef.current) return;
    answerCalledRef.current = true;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setReceivingCall(false);

    if (peerInitializedRef.current) return;
    peerInitializedRef.current = true;

    const setupPeerWithStream = (mediaStream) => {
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: mediaStream,
        config: peerConfig,
      });

      peer.on('signal', (data) => {
        if (socket) {
          socket.emit('answer_call', {
            callId: activeCall.callId,
            signal: data,
            to: getTargetUserId(),
          });
        }
      });

      peer.on('stream', (remoteStream) => {
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      });

      peer.on('connect', () => {
        callAcceptedRef.current = true;
        setCallAccepted(true);
      });

      peer.on('error', (err) => {
        console.error('Receiver Peer error:', err);
      });

      if (activeCall?.signal) {
        try {
          peer.signal(activeCall.signal);
        } catch (e) {
          console.error('Error signaling incoming offer:', e);
        }
      }

      connectionRef.current = peer;
    };

    if (streamRef.current) {
      setupPeerWithStream(streamRef.current);
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: isVideo, audio: true })
        .then((newStream) => {
          if (isClosingRef.current) {
            newStream.getTracks().forEach((track) => track.stop());
            return;
          }
          setStream(newStream);
          streamRef.current = newStream;
          originalStreamRef.current = newStream;
          if (myVideo.current) myVideo.current.srcObject = newStream;
          setupPeerWithStream(newStream);
        })
        .catch((err) => {
          console.error('Media access error on answer:', err);
          socket?.emit('hang_up', {
            callId: activeCall.callId,
            to: getTargetUserId(),
            status: 'rejected',
          });
          recordAndClose();
        });
    }
  };

  const handleAnswerPointerDown = (event) => {
    answerSwipeStartRef.current = event.clientY;
    didAnswerSwipeRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAnswerPointerMove = (event) => {
    if (answerSwipeStartRef.current === null) return;
    const distance = Math.max(0, answerSwipeStartRef.current - event.clientY);
    setAnswerSwipeOffset(Math.min(distance, 88));
  };

  const handleAnswerPointerUp = (event) => {
    if (answerSwipeStartRef.current === null) return;
    const didSwipeUp = answerSwipeStartRef.current - event.clientY > 64;
    answerSwipeStartRef.current = null;
    setAnswerSwipeOffset(0);
    if (didSwipeUp) {
      didAnswerSwipeRef.current = true;
      answerCall();
    }
  };

  const handleAnswerPointerCancel = () => {
    answerSwipeStartRef.current = null;
    setAnswerSwipeOffset(0);
  };

  const handleAnswerClick = () => {
    if (didAnswerSwipeRef.current) {
      didAnswerSwipeRef.current = false;
      return;
    }
    answerCall();
  };

  const declineCall = async () => {
    const targetId = getTargetUserId();
    const status = callAcceptedRef.current
      ? 'completed'
      : (activeCall.isCaller ? 'missed' : 'rejected');
    if (socket && targetId) {
      socket.emit('hang_up', {
        callId: activeCall.callId,
        to: targetId,
        status,
      });
    }
    await recordAndClose(status);
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

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    if (userVideo.current) {
      userVideo.current.muted = isSpeakerOn;
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenVideoTrack = screenStream.getVideoTracks()[0];

        if (connectionRef.current && connectionRef.current._pc) {
          const sender = connectionRef.current._pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenVideoTrack);
          }
        }

        if (myVideo.current) {
          myVideo.current.srcObject = screenStream;
        }

        screenVideoTrack.onended = () => {
          stopScreenSharing();
        };

        setIsScreenSharing(true);
      } else {
        stopScreenSharing();
      }
    } catch (err) {
      console.error('Error sharing screen:', err);
      setIsScreenSharing(false);
    }
  };

  const stopScreenSharing = () => {
    if (originalStreamRef.current && connectionRef.current && connectionRef.current._pc) {
      const videoTrack = originalStreamRef.current.getVideoTracks()[0];
      const sender = connectionRef.current._pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender && videoTrack) {
        sender.replaceTrack(videoTrack);
      }
      if (myVideo.current) {
        myVideo.current.srcObject = originalStreamRef.current;
      }
    }
    setIsScreenSharing(false);
  };

  if (!activeCall) return null;

  return (
    <div className="whatsapp-call-overlay">
      {receivingCall ? (
        <div className={`whatsapp-call-screen ${isVideo ? 'video-call-screen' : ''}`}>
          <div className="call-header-info">
            <span className="call-type-badge">CHATSPHERE · INCOMING {isVideo ? 'VIDEO' : 'VOICE'} CALL</span>
            <h2>{contactName}</h2>
            <p className="call-timer-text">Incoming call</p>
          </div>

          <div className="profile-avatar-container">
            {contactAvatar ? (
              <img src={contactAvatar} alt="Profile" className="profile-img" />
            ) : (
              <div className="profile-letter-avatar">{contactName.charAt(0).toUpperCase()}</div>
            )}
          </div>

          <div className="whatsapp-action-buttons">
            <div className="btn-group">
              <button className="wapp-btn decline-red" onClick={declineCall} aria-label="Decline call">
                <PhoneOff size={24} strokeWidth={2.4} />
              </button>
              <span>Decline</span>
            </div>
            <div className="btn-group answer-btn-group">
              <button
                className="wapp-btn accept-green"
                onClick={handleAnswerClick}
                onPointerDown={handleAnswerPointerDown}
                onPointerMove={handleAnswerPointerMove}
                onPointerUp={handleAnswerPointerUp}
                onPointerCancel={handleAnswerPointerCancel}
                style={{ '--answer-swipe-offset': `${answerSwipeOffset * -0.35}px` }}
                aria-label="Accept call, or swipe up"
              >
                <Phone size={25} strokeWidth={2.5} />
                <span className="answer-swipe-arrow"><ArrowUp size={15} strokeWidth={2.5} /></span>
              </button>
              <span>Accept</span>
            </div>
          </div>
          <div className="answer-swipe-hint"><ArrowUp size={14} /> Swipe up on the green button to answer</div>
        </div>
      ) : (
        <div className={`whatsapp-call-screen ${isVideo ? 'video-call-screen' : ''}`}>
          {isVideo ? (
            <div className="video-call-viewport">
              <video playsInline ref={userVideo} autoPlay className="remote-video-fullscreen" />
              
              <div className="call-header-info video-top-badge">
                <h2>{contactName}</h2>
                <p className="call-timer-text">{callAccepted ? formatTime(callTimer) : 'Ringing...'}</p>
              </div>

              <div className="local-pip-box">
                <video playsInline muted ref={myVideo} autoPlay className="local-pip-video" />
                {isVideoOff && <div className="camera-off-overlay">Camera Off</div>}
              </div>
            </div>
          ) : (
            <>
              <div className="call-header-info">
                <span className="call-type-badge">CHATSPHERE · VOICE CALL</span>
                <h2>{contactName}</h2>
                <p className="call-timer-text">{callAccepted ? formatTime(callTimer) : 'Ringing...'}</p>
              </div>

              <div className="profile-avatar-container">
                {contactAvatar ? (
                  <img src={contactAvatar} alt="Profile" className="profile-img" />
                ) : (
                  <div className="profile-letter-avatar">{contactName.charAt(0).toUpperCase()}</div>
                )}
                <audio playsInline ref={userVideo} autoPlay />
              </div>
            </>
          )}

          <div className="whatsapp-bottom-controls-wrapper">
            <div className="whatsapp-controls-dock">
              <div className="dock-item">
                <button className={`control-circle ${isSpeakerOn ? 'active-state' : ''}`} onClick={toggleSpeaker} aria-label={isSpeakerOn ? 'Turn speaker off' : 'Turn speaker on'} aria-pressed={isSpeakerOn} title={isSpeakerOn ? 'Turn speaker off' : 'Turn speaker on'}>
                  {isSpeakerOn ? <Volume2 size={21} /> : <VolumeX size={21} />}
                </button>
                <span>{isSpeakerOn ? 'Speaker on' : 'Speaker off'}</span>
              </div>

              <div className="dock-item">
                <button className={`control-circle ${!isVideoOff ? 'active-state' : ''}`} onClick={toggleVideo} aria-label={isVideoOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={!isVideoOff} title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}>
                  {isVideoOff ? <VideoOff size={21} /> : <Video size={21} />}
                </button>
                <span>{isVideoOff ? 'Camera off' : 'Camera on'}</span>
              </div>

              {isVideo && (
                <div className="dock-item">
                  <button className={`control-circle ${isScreenSharing ? 'active-state' : ''}`} onClick={toggleScreenShare} title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'} aria-label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'} aria-pressed={isScreenSharing}>
                    <MonitorUp size={21} />
                  </button>
                  <span>{isScreenSharing ? 'Sharing screen' : 'Share screen'}</span>
                </div>
              )}

              <div className="dock-item">
                <button className={`control-circle ${isMuted ? 'active-state' : ''}`} onClick={toggleMute} aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={isMuted} title={isMuted ? 'Unmute microphone' : 'Mute microphone'}>
                  {isMuted ? <MicOff size={21} /> : <Mic size={21} />}
                </button>
                <span>{isMuted ? 'Muted' : 'Microphone'}</span>
              </div>
            </div>

            <div className="whatsapp-end-call-row">
              <button className="control-circle end-red" onClick={declineCall} aria-label="End call" title="End call">
                <PhoneOff size={23} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}