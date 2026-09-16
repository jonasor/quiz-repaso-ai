import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/shared/App';
import './ui/shared/styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
