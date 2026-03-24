import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safe fallback for Notification API to prevent ReferenceError in environments where it's missing (e.g., Safari/iOS)
if (typeof window !== 'undefined' && typeof (window as any).Notification === 'undefined') {
  (window as any).Notification = {
    permission: 'denied',
    requestPermission: () => Promise.resolve('denied'),
    maxActions: 0
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(
      (registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      },
      (err) => {
        console.log('ServiceWorker registration failed: ', err);
      }
    );
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
