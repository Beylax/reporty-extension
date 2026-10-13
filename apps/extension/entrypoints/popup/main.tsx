import { initializeTheme } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/toast';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';

void initializeTheme().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider><App /></ToastProvider>
    </React.StrictMode>,
  );
});
