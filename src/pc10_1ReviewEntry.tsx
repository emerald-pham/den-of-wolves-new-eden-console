import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PC10_1ReviewScene from './PC10_1ReviewScene';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('PC10.1 review root is missing.');
createRoot(container).render(<StrictMode><PC10_1ReviewScene /></StrictMode>);
