import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getItems = (params) =>
  api.get('/items', { params }).then(response => response.data);

export const reorderItem = (sourceId, destinationId) =>
  api.post('/reorder', { sourceId, destinationId });

export const updateSelection = (id, selected) =>
  api.post('/selection', { id, selected });

export const getState = () =>
  api.get('/state').then(response => response.data);

export const initializeData = (count) =>
  api.post('/initialize', { count });