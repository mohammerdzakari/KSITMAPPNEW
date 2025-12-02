import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { injectSpeedInsights } from '@vercel/speed-insights';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element");
}

// Initialize Vercel Speed Insights
injectSpeedInsights();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);