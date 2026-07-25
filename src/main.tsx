import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { Toaster } from 'react-hot-toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#0F172A',
          color: '#E2E8F0',
          border: '1px solid rgba(255,255,255,0.08)',
        },
      }}
    />
  </StrictMode>,
);
