import React, { useState, useEffect } from 'react';
import { ArrowLeft, AtSign, FileText, Image as ImageIcon, LoaderCircle, Mail, X } from 'lucide-react';
import API from '../api/axios';
import '../styles/GroupInfoDrawer.css';

export default function UserProfileDrawer({ isOpen, onClose, selectedChat, currentUserId, onlineUsers = [] }) {
  const [sharedDocs, setSharedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);

  const membersList = Array.isArray(selectedChat?.members) ? selectedChat.members : [];
  const partner = membersList.find((member) => {
    const memberId = typeof member === 'object' ? (member?._id || member?.id) : member;
    return String(memberId) !== String(currentUserId);
  });
  const partnerId = typeof partner === 'object' ? (partner?._id || partner?.id) : partner;

  useEffect(() => {
    let isMounted = true;

    if (!isOpen || !partnerId || selectedChat?.isGroup) {
      setProfile(null);
      setProfileError('');
      return () => { isMounted = false; };
    }

    const fetchProfile = async () => {
      setProfile(null);
      setLoadingProfile(true);
      setProfileError('');
      try {
        const { data } = await API.get(`/users/${partnerId}`);
        if (isMounted) setProfile(data);
      } catch (err) {
        console.error('Failed to fetch latest contact profile:', err);
        if (isMounted) {
          setProfileError(err.response?.data?.message || 'Could not load the latest profile. Please try again.');
        }
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    fetchProfile();
    return () => { isMounted = false; };
  }, [isOpen, partnerId, partner?.bio, selectedChat?.isGroup]);

  useEffect(() => {
    let isMounted = true;

    const fetchSharedDocs = async () => {
      if (!isOpen || !selectedChat?._id || selectedChat.isGroup) return;
      setLoadingDocs(true);
      try {
        const { data } = await API.get(`/messages/${selectedChat._id}`);
        if (!isMounted) return;

        const messageList = Array.isArray(data) ? data : [];
        const docs = messageList.filter(
          (msg) =>
            msg?.fileUrl ||
            msg?.mediaUrl ||
            msg?.attachment ||
            (typeof msg?.content === 'string' && msg.content.match(/\.(pdf|docx?|xlsx?|png|jpe?g|gif|webp)$/i))
        );
        setSharedDocs(docs);
      } catch (err) {
        console.error('Failed to fetch shared attachments:', err);
        if (isMounted) setSharedDocs([]);
      } finally {
        if (isMounted) setLoadingDocs(false);
      }
    };

    if (isOpen) {
      fetchSharedDocs();
    } else {
      setSharedDocs([]);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedChat]);

  useEffect(() => {
    if (!isAvatarPreviewOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsAvatarPreviewOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAvatarPreviewOpen]);

  if (!isOpen || !selectedChat || selectedChat.isGroup) return null;

  const contact = profile || (typeof partner === 'object' ? partner : {});
  const username = contact?.username || contact?.name || selectedChat?.chatName || 'User';
  const email = contact?.email || 'No email provided';
  const avatar = contact?.avatar || selectedChat?.avatar || '';
  const bio = contact?.bio?.trim() || '';
  const safeOnlineUsers = Array.isArray(onlineUsers) ? onlineUsers : [];
  const isOnline = safeOnlineUsers.map(String).includes(String(partnerId));

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Offline';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Offline';
    
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // midnight (0) becomes 12
    const formattedHours = String(hours).padStart(2, '0');
    const timeStr = `${formattedHours}:${minutes} ${ampm}`;

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `last seen today at ${timeStr}`;
    if (isYesterday) return `last seen yesterday at ${timeStr}`;
    
    return `last seen on ${date.toLocaleDateString([], { day: '2-digit', month: 'short' })} at ${timeStr}`;
  };

  return (
    <>
    <div className="group-drawer-overlay contact-drawer-overlay" onClick={onClose}>
      <aside
        className="group-drawer-content contact-profile-drawer"
        onClick={(event) => event.stopPropagation()}
        aria-label={`${username} contact information`}
        role="dialog"
        aria-modal="true"
      >
        <div className="group-drawer-header contact-drawer-header">
          <div className="contact-drawer-title">
            <button
              type="button"
              className="contact-drawer-icon"
              onClick={onClose}
              aria-label="Back to conversation"
              title="Back to conversation"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <span>CHATSPHERE</span>
              <h3>Contact profile</h3>
            </div>
          </div>
        </div>

        <div className="contact-profile-scroll">
          <section className="group-profile-banner contact-profile-hero">
            <div className="contact-avatar-frame">
              <button
                type="button"
                className={`group-profile-avatar-wrapper ${avatar ? 'has-photo' : ''}`}
                onClick={() => avatar && setIsAvatarPreviewOpen(true)}
                disabled={!avatar}
                aria-label={avatar ? `View ${username}'s profile photo` : undefined}
              >
                {avatar ? (
                  <img src={avatar} alt={username} />
                ) : (
                  <span>{username.charAt(0).toUpperCase()}</span>
                )}
              </button>
              <span className={`contact-online-indicator ${isOnline ? 'online' : ''}`} />
            </div>

            <div className="group-title-row contact-title-row">
              <h2>{username}</h2>
            </div>
            <p className={`contact-presence ${isOnline ? 'online' : ''}`}>
              <span />
              {isOnline ? 'Online now' : partner?.lastSeen ? formatLastSeen(partner.lastSeen) : 'Offline'}
            </p>

            <div className="contact-bio">
              <div className="contact-section-label"><AtSign size={14} /> About</div>
              {loadingProfile ? (
                <p className="contact-profile-loading"><LoaderCircle size={15} /> Loading latest bio…</p>
              ) : profileError ? (
                <p className="contact-profile-error">{profileError}</p>
              ) : (
                <p>{bio || 'No bio added yet.'}</p>
              )}
            </div>
          </section>

          <section className="contact-info-card">
            <div className="contact-card-heading">
              <span className="contact-card-icon"><Mail size={17} /></span>
              <div>
                <span>CONTACT</span>
                <h4>Email address</h4>
              </div>
            </div>
            <p className="contact-email-value">{email}</p>
          </section>

          <section className="contact-info-card contact-media-card">
            <div className="contact-card-heading">
              <span className="contact-card-icon"><ImageIcon size={17} /></span>
              <div>
                <span>SHARED FILES</span>
                <h4>Media, links &amp; documents</h4>
              </div>
              <span className="contact-media-count">{sharedDocs.length}</span>
            </div>

            {loadingDocs ? (
              <p className="contact-empty-state"><LoaderCircle size={16} /> Loading shared files…</p>
            ) : sharedDocs.length > 0 ? (
              <div className="shared-docs-list contact-shared-docs">
                {sharedDocs.map((doc, idx) => {
                  const fileTarget = doc?.fileUrl || doc?.mediaUrl || doc?.attachment || doc?.content || '';
                  const fileName = doc?.fileName || (typeof fileTarget === 'string' ? fileTarget.split('/').pop() : `Document_${idx + 1}`);
                  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(fileName);
                  return (
                    <a
                      key={doc?._id || idx}
                      href={fileTarget}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shared-doc-item contact-shared-doc"
                    >
                      <span className="contact-file-icon">{isImage ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
                      <span>{fileName}</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="contact-empty-state">
                <ImageIcon size={19} />
                <p>No media shared yet</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
    {isAvatarPreviewOpen && avatar && (
      <div className="contact-avatar-lightbox" onClick={() => setIsAvatarPreviewOpen(false)}>
        <button
          type="button"
          className="contact-avatar-lightbox-close"
          onClick={() => setIsAvatarPreviewOpen(false)}
          aria-label="Close profile photo"
        >
          <X size={20} />
        </button>
        <img
          src={avatar}
          alt={`${username}'s profile`}
          onClick={(event) => event.stopPropagation()}
        />
        <span>{username}</span>
      </div>
    )}
    </>
  );
}