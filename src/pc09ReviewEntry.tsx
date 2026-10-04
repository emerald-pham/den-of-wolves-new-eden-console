import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import PC09ReviewScene from './PC09ReviewScene';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('PC09 review root is missing.');
createRoot(container).render(<StrictMode><PC09ReviewScene /></StrictMode>);
