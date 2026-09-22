import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Sparkles,
  ArrowRight,
  FileText,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Globe,
  Settings2,
  Smartphone,
  Square,
  Play,
  Download,
} from 'lucide-react';
import type { Product, Sale, ExpenseRecord, CashDrawerRecord, StockAdjustment, PurchaseRecord, ShopSettings } from '../../types';
import { authenticatedFetch } from '../../utils/apiClient';

export interface AuraLiveVoiceChatProps {
  onClose: () => void;
  onSendMessage: (
    text: string,
    voiceOptions?: {
      preferredLanguage: VoiceLanguage;
      voice: VoiceOption;
    }
  ) => Promise<any>;
  activeModel: string;
  settings?: ShopSettings;
  posContext: {
    products: Product[];
    sales: Sale[];
    expenses: ExpenseRecord[];
    cashDrawer?: CashDrawerRecord | CashDrawerRecord[] | any;
    adjustments?: StockAdjustment[];
    purchases?: PurchaseRecord[];
  };
  onToolExecuted?: (tool: any) => void;
  onNavigateToReports?: () => void;
}

export type VoiceLanguage = 'burmese' | 'bilingual' | 'english';
export type VoiceOption = 'nova' | 'alloy' | 'shimmer';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export const AuraLiveVoiceChat: React.FC<AuraLiveVoiceChatProps> = ({
  onClose,
  onSendMessage,
  activeModel,
  settings,
  posContext,
  onToolExecuted,
  onNavigateToReports,
}) => {
  // Voice Dialogue States
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [preferredLang, setPreferredLang] = useState<VoiceLanguage>('burmese');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('nova');
  const [autoTurnMode, setAutoTurnMode] = useState<boolean>(true); // continuous hands-free dialogue
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [lastUserSpeech, setLastUserSpeech] = useState<string>('');
  const [lastAssistantSpeech, setLastAssistantSpeech] = useState<string>('');
  const [lastToolResult, setLastToolResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Audio & Speech References
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);

  // Burmese Quick Prompt Chips
  const BURMESE_PROMPTS = [
    { label: '📊 ယနေ့ Z-Report စစ်ဆေးမည်', query: 'ယနေ့အတွက် Z-Report အစီရင်ခံစာ ထုတ်ပေးပါ' },
    { label: '📱 ဖုန်းလက်ကျန် စစ်ဆေးမည်', query: 'ဆိုင်မှာ လက်ကျန်ရှိတဲ့ ဖုန်းစာရင်းနဲ့ ဈေးနှုန်းတွေ ပြပေးပါ' },
    { label: '💰 ယနေ့ အရောင်း စုစုပေါင်း', query: 'ယနေ့ ဆိုင်အရောင်း စုစုပေါင်းနဲ့ ငွေစာရင်း ဘယ်လောက်ရောင်းရလဲ' },
    { label: '🔍 Redmi Note 14 ဈေးနှုန်း', query: 'Redmi Note 14 Pro ဖုန်းလက်ကျန်နဲ့ ဈေးနှုန်း စစ်ပေးပါ' },
    { label: '📑 အမြတ်စာရင်း PDF ထုတ်မည်', query: 'ယနေ့ နေ့စဉ် အရောင်းအမြတ် အစီရင်ခံစာ PDF ဒေါင်းလုဒ်လုပ်ပေးပါ' },
  ];

  // Stop currently playing audio (Barge-In / Interrupt)
  const stopAudioPlayback = useCallback(() => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {}
      currentAudioRef.current = null;
    }
    isSpeakingRef.current = false;
    if (voiceState === 'speaking') {
      setVoiceState('idle');
    }
  }, [voiceState]);

  // Clean up Web Audio microphone analyzer
  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Initialize Web Audio microphone analyzer for real-time waveform visualizer
  const initAudioAnalyser = async () => {
    try {
      cleanupAudioAnalyser();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current || !isListeningRef.current) {
          setAudioLevel(0);
          return;
        }
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Microphone analyzer setup failed (visualizer will use simulated wave):', err);
    }
  };

  // Synthesize and play audio with auto-turn loop
  const speakText = useCallback(
    async (textToSpeak: string) => {
      if (isAudioMuted || !textToSpeak.trim()) {
        if (autoTurnMode) {
          setTimeout(() => startListening(), 600);
        }
        return;
      }

      stopAudioPlayback();
      setVoiceState('speaking');
      isSpeakingRef.current = true;

      try {
        const response = await authenticatedFetch('/api/voice/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToSpeak,
            voice: selectedVoice,
            language: preferredLang,
          }),
        });

        const data = await response.json();
        if (!data.success || !data.audioBase64) {
          throw new Error(data.error || 'Audio synthesis failed');
        }

        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        currentAudioRef.current = audio;

        audio.onended = () => {
          isSpeakingRef.current = false;
          setVoiceState('idle');
          currentAudioRef.current = null;
          // Auto-Turn Hands-Free: automatically resume listening after speaking finishes
          if (autoTurnMode) {
            setTimeout(() => {
              if (!isSpeakingRef.current) {
                startListening();
              }
            }, 500);
          }
        };

        audio.onerror = (err) => {
          console.warn('Audio playback error:', err);
          isSpeakingRef.current = false;
          setVoiceState('idle');
          currentAudioRef.current = null;
          if (autoTurnMode) {
            setTimeout(() => startListening(), 500);
          }
        };

        await audio.play();
      } catch (err: any) {
        console.warn('Backend TTS failed, falling back to Web Speech synthesis:', err);
        // Fallback to browser SpeechSynthesis
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = preferredLang === 'burmese' ? 'my-MM' : 'en-US';
          utterance.rate = 1.0;
          utterance.onend = () => {
            isSpeakingRef.current = false;
            setVoiceState('idle');
            if (autoTurnMode) {
              setTimeout(() => startListening(), 500);
            }
          };
          utterance.onerror = () => {
            isSpeakingRef.current = false;
            setVoiceState('idle');
          };
          window.speechSynthesis.speak(utterance);
        } else {
          isSpeakingRef.current = false;
          setVoiceState('idle');
        }
      }
    },
    [isAudioMuted, selectedVoice, preferredLang, autoTurnMode, stopAudioPlayback]
  );

  // Send speech transcript to Aura Copilot with tools
  const handleUserQuery = async (queryText: string) => {
    if (!queryText.trim()) return;

    stopAudioPlayback();
    setInterimTranscript('');
    setLastUserSpeech(queryText);
    setVoiceState('thinking');
    setErrorMessage(null);

    try {
      // Call through parent onSendMessage so messages, PDF reports, and inventory items are recorded
      const result = await onSendMessage(queryText, {
        preferredLanguage: preferredLang,
        voice: selectedVoice,
      });

      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to process voice query');
      }

      setLastAssistantSpeech(result.reply);

      if (result.toolExecuted) {
        setLastToolResult(result.toolExecuted);
        onToolExecuted?.(result.toolExecuted);
      } else {
        setLastToolResult(null);
      }

      // If audio was directly returned from the server endpoint, play it directly
      if (result.voiceAudio?.audioBase64 && !isAudioMuted) {
        setVoiceState('speaking');
        isSpeakingRef.current = true;
        const audio = new Audio(`data:audio/mp3;base64,${result.voiceAudio.audioBase64}`);
        currentAudioRef.current = audio;

        audio.onended = () => {
          isSpeakingRef.current = false;
          setVoiceState('idle');
          currentAudioRef.current = null;
          if (autoTurnMode) {
            setTimeout(() => {
              if (!isSpeakingRef.current) {
                startListening();
              }
            }, 450);
          }
        };

        audio.onerror = () => {
          isSpeakingRef.current = false;
          setVoiceState('idle');
          currentAudioRef.current = null;
          if (autoTurnMode) {
            setTimeout(() => startListening(), 450);
          }
        };

        await audio.play();
      } else {
        // Otherwise synthesize via speakText helper
        await speakText(result.reply);
      }
    } catch (err: any) {
      console.error('Error handling voice query:', err);
      setVoiceState('idle');
      setErrorMessage(err?.message || 'တောင်းပန်ပါသည်၊ အသံစနစ် လုပ်ဆောင်ရာတွင် ချို့ယွင်းချက်ဖြစ်ပေါ်ခဲ့ပါသည်။');
      if (autoTurnMode) {
        setTimeout(() => startListening(), 2000);
      }
    }
  };

  // Start Speech Recognition
  const startListening = useCallback(() => {
    // If speaking, interrupt first
    stopAudioPlayback();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage('Browser does not support Web Speech Recognition. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;

      // Set language according to user preference
      if (preferredLang === 'burmese') {
        recognition.lang = 'my-MM'; // Myanmar Burmese
      } else if (preferredLang === 'bilingual') {
        recognition.lang = 'my-MM';
      } else {
        recognition.lang = 'en-US';
      }

      recognition.onstart = () => {
        isListeningRef.current = true;
        setVoiceState('listening');
        setInterimTranscript('');
        setErrorMessage(null);
        initAudioAnalyser();
      };

      recognition.onresult = (event: any) => {
        let currentText = '';
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }

        setInterimTranscript(currentText);

        if (isFinal && currentText.trim().length > 1) {
          isListeningRef.current = false;
          cleanupAudioAnalyser();
          handleUserQuery(currentText.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        isListeningRef.current = false;
        cleanupAudioAnalyser();

        if (event.error === 'no-speech') {
          setVoiceState('idle');
          if (autoTurnMode && !isSpeakingRef.current) {
            setTimeout(() => startListening(), 800);
          }
        } else if (event.error === 'not-allowed') {
          setVoiceState('idle');
          setErrorMessage('မိုက်ခရိုဖုန်း အသုံးပြုခွင့်ကို Browser Settings တွင် ခွင့်ပြုပေးပါ (Microphone Permission Required).');
        } else {
          setVoiceState('idle');
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        cleanupAudioAnalyser();
        if (voiceState === 'listening') {
          setVoiceState('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Failed to start speech recognition:', err);
      isListeningRef.current = false;
      setVoiceState('idle');
    }
  }, [preferredLang, autoTurnMode, stopAudioPlayback]);

  // Stop Speech Recognition
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    cleanupAudioAnalyser();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setVoiceState('idle');
  }, [cleanupAudioAnalyser]);

  // Initial welcome greeting on launch
  useEffect(() => {
    const welcomeBurmese = 'မင်္ဂလာပါရှင်။ Aura POS Copilot မှ ကြိုဆိုပါသည်ရှင်။ ဆိုင်အရောင်း၊ လက်ကျန်ဖုန်းစာရင်း သို့မဟုတ် Z-Report များကို အသံဖြင့် မေးမြန်းနိုင်ပါပြီရှင်။';
    const welcomeEnglish = "Hello! Aura POS Copilot is ready. You can speak to check stock, Z-reports, or update product prices.";
    
    setLastAssistantSpeech(preferredLang === 'burmese' ? welcomeBurmese : welcomeEnglish);

    // Prompt user greeting
    const timer = setTimeout(() => {
      speakText(preferredLang === 'burmese' ? welcomeBurmese : welcomeEnglish);
    }, 400);

    return () => {
      clearTimeout(timer);
      stopAudioPlayback();
      stopListening();
    };
  }, []);

  // Visualizer Animation Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      angle += 0.04;

      if (voiceState === 'listening') {
        // Emerald pulse reactive to microphone audio level
        const baseRadius = 55;
        const pulse = (audioLevel / 100) * 35;
        const radius = baseRadius + pulse;

        // Outer glow
        const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.4, centerX, centerY, radius + 25);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
        gradient.addColorStop(0.6, 'rgba(5, 150, 105, 0.2)');
        gradient.addColorStop(1, 'rgba(4, 120, 87, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
        ctx.fill();

        // Reactive audio wave spikes
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const numPoints = 32;
        for (let i = 0; i <= numPoints; i++) {
          const theta = (i / numPoints) * Math.PI * 2;
          const offset = Math.sin(theta * 6 + angle * 3) * (audioLevel > 5 ? (audioLevel / 100) * 12 : 3);
          const r = radius + offset;
          const x = centerX + Math.cos(theta) * r;
          const y = centerY + Math.sin(theta) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Core Center Orb
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
        ctx.fill();

      } else if (voiceState === 'thinking') {
        // Amber / Gold orbiting planetary rings
        const radius = 60;
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle * 1.5);

        // Rotating gradient ring
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Orbiting particle
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(radius, 0, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Inner Core
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
        ctx.fill();

      } else if (voiceState === 'speaking') {
        // Violet / Indigo harmonic sound waves
        const baseRadius = 55;
        const waveAmp = 15;

        // Outer glow
        const gradient = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, baseRadius + 40);
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
        gradient.addColorStop(0.7, 'rgba(99, 102, 241, 0.15)');
        gradient.addColorStop(1, 'rgba(79, 70, 229, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + 35, 0, Math.PI * 2);
        ctx.fill();

        // Animated Harmonic Waves
        for (let ring = 1; ring <= 3; ring++) {
          ctx.strokeStyle = ring === 1 ? '#a78bfa' : ring === 2 ? '#818cf8' : '#c084fc';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          const points = 40;
          for (let i = 0; i <= points; i++) {
            const theta = (i / points) * Math.PI * 2;
            const r = baseRadius + ring * 8 + Math.sin(theta * 5 + angle * 2.5 * ring) * waveAmp;
            const x = centerX + Math.cos(theta) * r;
            const y = centerY + Math.sin(theta) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }

        // Core Center Orb
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
        ctx.fill();

      } else {
        // Idle calm deep indigo breathing pulse
        const pulse = Math.sin(angle) * 4;
        const radius = 50 + pulse;

        const gradient = ctx.createRadialGradient(centerX, centerY, 15, centerX, centerY, radius + 15);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(1, 'rgba(79, 70, 229, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#4f46e5';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
        ctx.fill();
      }

      frameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [voiceState, audioLevel]);

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white select-none overflow-hidden relative">
      {/* Top Header Bar */}
      <div className="px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-500 flex items-center justify-center shadow-md">
            <Radio className="w-4 h-4 text-white animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-1">
                Aura Live Voice
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-normal">
                  မြန်မာ
                </span>
              </h2>
            </div>
            <p className="text-[10px] text-slate-400">Real-time Store Voice Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Language Switcher Pill */}
          <div className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setPreferredLang('burmese')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                preferredLang === 'burmese'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Burmese Language Priority"
            >
              🇲🇲 မြန်မာ
            </button>
            <button
              type="button"
              onClick={() => setPreferredLang('bilingual')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                preferredLang === 'bilingual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Bilingual (Burmese + English terms)"
            >
              🇲🇲+🇬🇧
            </button>
            <button
              type="button"
              onClick={() => setPreferredLang('english')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                preferredLang === 'english'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="English Voice Mode"
            >
              🇬🇧 EN
            </button>
          </div>

          {/* Voice Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg border transition-all ${
              showSettings
                ? 'bg-indigo-600/40 border-indigo-500 text-white'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Voice & Speech Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* Back to Text Chat button */}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 transition-all"
            title="Switch to Text Mode"
          >
            Chat View
          </button>
        </div>
      </div>

      {/* Settings Dropdown Drawer */}
      {showSettings && (
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs z-20 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium">အသံရွေးချယ်ရန်:</span>
            {(['nova', 'alloy', 'shimmer'] as VoiceOption[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSelectedVoice(v)}
                className={`px-2 py-1 rounded border text-[11px] capitalize transition-all ${
                  selectedVoice === v
                    ? 'bg-indigo-600 border-indigo-400 text-white font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {v === 'nova' ? 'Nova (နွေးထွေးသောအသံ)' : v === 'alloy' ? 'Alloy (ကြည်လင်သောအသံ)' : 'Shimmer (ရှင်းလင်းသောအသံ)'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoTurnMode(!autoTurnMode)}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                autoTurnMode
                  ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Continuous auto turn-taking without tapping"
            >
              <Radio className="w-3 h-3" />
              <span>{autoTurnMode ? 'Auto Hands-Free (ဆက်တိုက်)' : 'Push-to-Talk (နှိပ်၍ပြောရန်)'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        {/* Animated Canvas Orb */}
        <div
          onClick={() => {
            if (voiceState === 'speaking') {
              stopAudioPlayback();
              startListening();
            } else if (voiceState === 'listening') {
              stopListening();
            } else {
              startListening();
            }
          }}
          className="relative flex items-center justify-center cursor-pointer group my-2"
          title="Click to talk, mute, or interrupt"
        >
          <canvas ref={canvasRef} width={220} height={220} className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px]" />

          {/* Central Icon inside Orb */}
          <div className="absolute flex flex-col items-center justify-center pointer-events-none text-white">
            {voiceState === 'listening' ? (
              <Mic className="w-8 h-8 text-emerald-300 animate-bounce" />
            ) : voiceState === 'thinking' ? (
              <Sparkles className="w-8 h-8 text-amber-300 animate-spin" />
            ) : voiceState === 'speaking' ? (
              <Volume2 className="w-8 h-8 text-violet-200 animate-pulse" />
            ) : (
              <Mic className="w-8 h-8 text-indigo-300 group-hover:scale-110 transition-transform" />
            )}
          </div>
        </div>

        {/* State Label & Action Indicator */}
        <div className="text-center mt-1">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/80 shadow-md">
            <span
              className={`w-2 h-2 rounded-full ${
                voiceState === 'listening'
                  ? 'bg-emerald-400 animate-ping'
                  : voiceState === 'thinking'
                  ? 'bg-amber-400 animate-pulse'
                  : voiceState === 'speaking'
                  ? 'bg-violet-400 animate-pulse'
                  : 'bg-slate-400'
              }`}
            />
            <span className="text-xs font-semibold tracking-wide">
              {voiceState === 'listening'
                ? 'နားထောင်နေပါသည်... (Listening)'
                : voiceState === 'thinking'
                ? 'POS ဒေတာ စစ်ဆေးနေပါသည်... (Querying Store)'
                : voiceState === 'speaking'
                ? 'ဖြေကြားနေပါသည် (Speaking)'
                : 'အသံဖြင့် စတင်စကားပြောရန် စက်ဝိုင်းကို နှိပ်ပါ'}
            </span>
          </div>

          {/* Barge-In / Interrupt Button during Speaking */}
          {voiceState === 'speaking' && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  stopAudioPlayback();
                  startListening();
                }}
                className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-all inline-flex items-center gap-1 shadow-sm"
              >
                <Square className="w-2.5 h-2.5 fill-rose-300" />
                <span>စကားဖြတ်ပြောရန် (Interrupt & Talk)</span>
              </button>
            </div>
          )}
        </div>

        {/* Interim Live Transcript Feedback */}
        {interimTranscript && (
          <div className="mt-3 max-w-md w-full px-4 py-2 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-center backdrop-blur-xs">
            <p className="text-xs text-emerald-300 font-medium italic">"{interimTranscript}"</p>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-2 max-w-md w-full px-3 py-1.5 bg-rose-950/70 border border-rose-600/50 rounded-lg text-center flex items-center justify-center gap-1.5 text-xs text-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Live Spoken Output Box */}
        <div className="w-full max-w-lg mt-3 bg-slate-900/70 border border-slate-800 rounded-xl p-3 backdrop-blur-xs">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold mb-1">
            <span>Aura Spoken Response:</span>
            {voiceState === 'speaking' && (
              <span className="text-violet-400 flex items-center gap-1 animate-pulse">
                <Volume2 className="w-3 h-3" /> Playing audio
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 leading-relaxed font-normal min-h-[38px]">
            {lastAssistantSpeech || (
              <span className="text-slate-500 italic">
                မေးမြန်းလိုသည့် ဆိုင်အချက်အလက်ကို ပြောကြားနိုင်ပါပြီ...
              </span>
            )}
          </p>
        </div>

        {/* Companion Tool Execution Card Drawer (e.g. Z-Report or Product Details) */}
        {lastToolResult && (
          <div className="w-full max-w-lg mt-2 bg-indigo-950/60 border border-indigo-500/30 rounded-xl p-3 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-indigo-200 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                POS Action: {lastToolResult.name}
              </span>
              {lastToolResult.name === 'generate_pdf_report' && (
                <button
                  type="button"
                  onClick={onNavigateToReports}
                  className="text-[10px] px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1"
                >
                  <Download className="w-2.5 h-2.5" />
                  PDF Download Ready
                </button>
              )}
            </div>
            {lastToolResult.result?.financialSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center mt-2">
                <div className="p-1.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Total Sales</div>
                  <div className="text-xs font-bold text-emerald-400">
                    {lastToolResult.result.financialSummary.grossSalesFormatted || '0 Ks'}
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Units Sold</div>
                  <div className="text-xs font-bold text-indigo-300">
                    {lastToolResult.result.financialSummary.totalUnitsSold || 0}
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400">Net Balance</div>
                  <div className="text-xs font-bold text-amber-300">
                    {lastToolResult.result.financialSummary.netSalesFormatted || '0 Ks'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Quick Burmese Voice Commands */}
      <div className="p-3 bg-slate-950/90 border-t border-slate-800/80 z-20">
        <div className="text-[10px] text-slate-400 font-medium mb-1.5 flex items-center justify-between">
          <span>မြန်မာလို စကားပြောရန် အကြံပြုချက်များ:</span>
          <span className="text-[9px] text-slate-500">Tap to test voice</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {BURMESE_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleUserQuery(prompt.query)}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-indigo-900/40 text-slate-300 hover:text-white border border-slate-700/70 hover:border-indigo-500/40 text-[11px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
