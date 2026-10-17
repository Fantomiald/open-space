import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource-variable/plus-jakarta-sans';
import './design/tokens.css';
import './design/components.css';
import './room/room.css';
import { App } from './App.tsx';
import { ErrorBoundary } from './command/ErrorBoundary.tsx';
import { unlockChime } from './lib/chime.ts';
import { connect } from './net/connection.ts';

connect();
// browsers keep the page silent until it gets a click or a key press
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlockChime, { passive: true });
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
