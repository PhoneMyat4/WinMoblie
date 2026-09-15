import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Filter out benign ZXing internal frame decode noise that floods console
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = function (...args: any[]) {
    const firstArg = args[0];
    if (
      typeof firstArg === 'string' &&
      (firstArg.includes('MultiFormatReader: non-ReaderException') ||
       firstArg.includes('Could not create a Canvas element') ||
       firstArg.includes('No MultiFormat Readers were able to detect the code'))
    ) {
      return; // Ignore internal ZXing per-frame polling noise
    }
    originalWarn.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

