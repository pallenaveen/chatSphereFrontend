import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api',
});

API.interceptors.request.use((config) => {
  // Check for direct token keys first
  let token = sessionStorage.getItem('token') || localStorage.getItem('token');

  // If not found directly, check inside the stored 'userInfo' object
  if (!token) {
    const userInfoStr = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
    if (userInfoStr) {
      try {
        const userInfo = JSON.parse(userInfoStr);
        token = userInfo?.token;
      } catch (err) {
        console.error('Error parsing userInfo from storage:', err);
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default API;