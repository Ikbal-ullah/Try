import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled with the app instead of loaded from a font CDN: no
// third-party requests, and the Content-Security-Policy can stay "own origin only".
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
