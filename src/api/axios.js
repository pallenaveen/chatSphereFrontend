import axios from 'axios';
import { SERVER_URL } from '../config';

export const getStoredToken = () => {
  let token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (token) return token;

  const userInfoStr = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
  if (!userInfoStr) return null;

  try {
    return JSON.parse(userInfoStr)?.token || null;
  } catch (err) {
    console.error('Error parsing userInfo from storage:', err);
    return null;
  }
};

const API = axios.create({
  baseURL: `${SERVER_URL}/api`,
});

API.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default API;