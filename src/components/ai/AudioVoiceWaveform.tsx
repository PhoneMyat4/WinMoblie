import React, { useEffect, useRef } from 'react';
import { AudioEngineState } from '../../utils/audioStreamController';

interface AudioVoiceWaveformProps {
  state: AudioEngineState;
  audioLevel: number;
  frequencyData?: Uint8Array;
  height?: number;
  visualStyle?: 'wave' | 'bars' | 'minimal';
  className?: string;
}

export const AudioVoiceWaveform: React.FC<AudioVoiceWaveformProps> = ({
  state,
  audioLevel,
  frequencyData,
  height = 80,
  visualStyle = 'wave',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      animId = requestAnimationFrame(render);
      phaseRef.current += state === 'processing' ? 0.08 : state === 'speaking' ? 0.05 : 0.025;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const h = height;

      if (canvas.width !== width * dpr || canvas.height !== h * dpr) {
        canvas.width = width * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, h);

      const centerY = h / 2;
      const phase = phaseRef.current;
      const level = Math.max(0.06, audioLevel);

      if (visualStyle === 'bars') {
        // Multi-bar frequency equalizer
        const barCount = 28;
        const gap = 3;
        const totalGap = gap * (barCount - 1);
        const barWidth = Math.max(2, (width - totalGap) / barCount);
        const freqLen = frequencyData?.length || 32;

        for (let i = 0; i < barCount; i++) {
          const freqIndex = Math.floor((i / barCount) * (freqLen * 0.75));
          const rawVal = frequencyData ? frequencyData[freqIndex] / 255 : 0;
          
          let dynamicHeight = 4;
          if (state === 'listening') {
            dynamicHeight = 4 + (rawVal * 0.7 + level * 0.5) * (h * 0.85);
          } else if (state === 'speaking') {
            const harmonic = Math.sin(phase * 2 + i * 0.4) * 0.3 + 0.7;
            dynamicHeight = 4 + (rawVal * 0.6 + level * 0.6) * harmonic * (h * 0.85);
          } else if (state === 'processing') {
            const wave = Math.sin(phase * 3 + i * 0.3) * 0.5 + 0.5;
            dynamicHeight = 6 + wave * (h * 0.4);
          } else {
            // Idle ambient breath
            const breath = Math.sin(phase + i * 0.2) * 0.5 + 0.5;
            dynamicHeight = 3 + breath * 6;
          }

          dynamicHeight = Math.min(h - 4, Math.max(4, dynamicHeight));
          const x = i * (barWidth + gap);
          const y = centerY - dynamicHeight / 2;

          // Distinct clean theme colors based on state
          let fillStyle = 'rgba(148, 163, 184, 0.4)'; // slate-400
          if (state === 'listening') {
            fillStyle = i % 2 === 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(5, 150, 105, 0.75)'; // emerald
          } else if (state === 'speaking') {
            fillStyle = i % 2 === 0 ? 'rgba(99, 102, 241, 0.9)' : 'rgba(139, 92, 246, 0.8)'; // indigo / violet
          } else if (state === 'processing') {
            fillStyle = 'rgba(14, 165, 233, 0.75)'; // sky
          }

          ctx.fillStyle = fillStyle;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, dynamicHeight, 3);
          ctx.fill();
        }
      } else {
        // Continuous organic multi-layer wave
        const layers = state === 'speaking' ? 3 : state === 'listening' ? 3 : 2;
        
        for (let layer = 0; layer < layers; layer++) {
          ctx.beginPath();

          const layerAmp = (1 - layer * 0.25) * (h * 0.38) * (state === 'idle' ? 0.25 : level * 1.5 + 0.15);
          const layerSpeed = 1 + layer * 0.5;
          const layerPhase = phase * layerSpeed + layer * (Math.PI / 3);

          let strokeColor = 'rgba(148, 163, 184, 0.5)';
          if (state === 'listening') {
            strokeColor = layer === 0 
              ? 'rgba(16, 185, 129, 0.9)' 
              : layer === 1 
              ? 'rgba(52, 211, 153, 0.6)' 
              : 'rgba(5, 150, 105, 0.35)';
          } else if (state === 'speaking') {
            strokeColor = layer === 0 
              ? 'rgba(99, 102, 241, 0.95)' 
              : layer === 1 
              ? 'rgba(168, 85, 247, 0.65)' 
              : 'rgba(79, 70, 229, 0.35)';
          } else if (state === 'processing') {
            strokeColor = layer === 0 
              ? 'rgba(14, 165, 233, 0.85)' 
              : 'rgba(56, 189, 248, 0.4)';
          }

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = layer === 0 ? 2.5 : 1.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.moveTo(0, centerY);

          const step = 4;
          for (let x = 0; x <= width; x += step) {
            // Normalized position 0 to 1
            const normX = x / width;
            // Window envelope: pin edges to zero so waves taper gracefully at sides
            const envelope = Math.sin(normX * Math.PI);

            let freqBoost = 0;
            if (frequencyData && frequencyData.length > 0) {
              const bin = Math.min(frequencyData.length - 1, Math.floor(normX * 16));
              freqBoost = (frequencyData[bin] / 255) * 0.6;
            }

            const wave1 = Math.sin(normX * Math.PI * 4 + layerPhase);
            const wave2 = Math.cos(normX * Math.PI * 7 - layerPhase * 0.8);
            const y = centerY + (wave1 * 0.65 + wave2 * 0.35 + freqBoost) * layerAmp * envelope;

            ctx.lineTo(x, y);
          }

          ctx.stroke();
        }

        // Add subtle center energy point when speaking or listening
        if (state === 'listening' || state === 'speaking') {
          const glowRadius = Math.max(3, level * 8);
          ctx.beginPath();
          ctx.arc(width / 2, centerY, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = state === 'listening' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(99, 102, 241, 0.85)';
          ctx.fill();
        }
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [state, audioLevel, frequencyData, height, visualStyle]);

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ height: `${height}px` }}
      />
    </div>
  );
};
