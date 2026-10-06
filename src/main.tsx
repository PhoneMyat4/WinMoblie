import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

// Filter out benign ZXing internal frame decode noise and Firestore BloomFilter fallback warnings
if (typeof window !== 'undefined') {
  const isIgnorableNoise = (args: any[]): boolean => {
    return args.some(arg => {
      if (typeof arg === 'string') {
        return (
          arg.includes('BloomFilter error') ||
          arg.includes('BloomFilterError') ||
          arg.includes('Invalid hash count: 0') ||
          arg.includes('Applying bloom filter failed') ||
          arg.includes('MultiFormatReader: non-ReaderException') ||
          arg.includes('Could not create a Canvas element') ||
          arg.includes('No MultiFormat Readers were able to detect the code')
        );
      }
      if (arg && typeof arg === 'object' && ((arg as any).name === 'BloomFilterError' || (arg as any).message?.includes('Invalid hash count'))) {
        return true;
      }
      return false;
    });
  };

  const originalWarn = console.warn;
  console.warn = function (...args: any[]) {
    if (isIgnorableNoise(args)) return;
    originalWarn.apply(console, args);
  };

  const originalError = console.error;
  console.error = function (...args: any[]) {
    if (isIgnorableNoise(args)) return;
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

