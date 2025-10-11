// API Configuration
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3001',
};

// Helper to build API URLs
export const apiUrl = (path: string) => `${config.apiUrl}${path}`;
