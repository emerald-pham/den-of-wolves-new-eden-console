import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import PC08ReviewScene from './PC08ReviewScene';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('PC08 review root is missing.');
createRoot(container).render(<StrictMode><PC08ReviewScene /></StrictMode>);
