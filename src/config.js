const productionServerUrl = 'https://chatspherebackend-1.onrender.com';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.PROD ? productionServerUrl : 'http://localhost:5000');
