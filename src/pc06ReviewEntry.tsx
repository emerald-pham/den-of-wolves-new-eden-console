import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PC06ReviewScene from './PC06ReviewScene';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Review root #root is missing from pc06-review.html');

createRoot(container).render(
  <StrictMode>
    <PC06ReviewScene />
  </StrictMode>,
);
