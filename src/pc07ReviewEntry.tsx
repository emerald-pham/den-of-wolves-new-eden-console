import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import PC07ReviewScene from './PC07ReviewScene';
import './index.css';
const container=document.getElementById('root');
if(!container)throw new Error('PC07 review root is missing.');
createRoot(container).render(<StrictMode><PC07ReviewScene /></StrictMode>);
