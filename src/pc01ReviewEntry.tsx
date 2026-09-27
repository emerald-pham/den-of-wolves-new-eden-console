import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PC01ReviewScene from './PC01ReviewScene';
import './index.css';
import './styles/starmap.css';

const container = document.getElementById('root');
if (!container) throw new Error('Review root #root is missing from pc01-review.html');

createRoot(container).render(
  <StrictMode>
    <PC01ReviewScene />
  </StrictMode>,
);
