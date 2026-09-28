import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PC04ReviewScene from './PC04ReviewScene';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Review root #root is missing from pc04-review.html');

createRoot(container).render(
  <StrictMode>
    <PC04ReviewScene />
  </StrictMode>,
);
