import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PC02ReviewScene from './PC02ReviewScene';
import './index.css';
import './styles/plot.css';

const container = document.getElementById('root');
if (!container) throw new Error('Review root #root is missing from pc02-review.html');

createRoot(container).render(
  <StrictMode>
    <PC02ReviewScene />
  </StrictMode>,
);
