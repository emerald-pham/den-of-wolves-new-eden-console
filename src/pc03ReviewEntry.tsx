import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PC03ReviewScene from './PC03ReviewScene';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Review root #root is missing from pc03-review.html');

createRoot(container).render(
  <StrictMode>
    <PC03ReviewScene />
  </StrictMode>,
);
