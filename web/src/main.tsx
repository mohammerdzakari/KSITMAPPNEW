import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('The #root element is missing from index.html.');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
