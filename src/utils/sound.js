export const playNotificationSound = () => {
  try {
    // Loads the local file directly from your public directory
    const chime = new Audio('/messenger_notification.mp3');
    chime.volume = 1.0; // Max volume
    chime.play().catch((err) => {
      console.log('Audio autoplay prevented or failed:', err);
    });
  } catch (err) {
    console.error('Sound playback error:', err);
  }
};