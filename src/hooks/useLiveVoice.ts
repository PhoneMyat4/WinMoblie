import { useState, useEffect, useRef, useCallback } from 'react';

export type VoiceProvider = 'gemini' | 'gpt';

export interface VoiceOption {
  id: string;
  name: string;
  gender?: string;
  description: string;
}

export const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Zephyr', name: 'Zephyr', description: 'Calm, clear, natural tone (Default)' },
  { id: 'Puck', name: 'Puck', description: 'Energetic, upbeat retail persona' },
  { id: 'Charon', name: 'Charon', description: 'Deep, authoritative, executive' },
  { id: 'Kore', name: 'Kore', description: 'Warm, empathetic, professional' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Crisp, articulate, dynamic' },
];

export const GPT_VOICES: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', description: 'Versatile, balanced, natural (Default)' },
  { id: 'echo', name: 'Echo', description: 'Warm, confident, conversational' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear, expressive, bright' },
  { id: 'ash', name: 'Ash', description: 'Relaxed, friendly, crisp' },
  { id: 'coral', name: 'Coral', description: 'Energetic, cheerful, lively' },
  { id: 'sage', name: 'Sage', description: 'Thoughtful, composed, steady' },
  { id: 'verse', name: 'Verse', description: 'Dynamic, modern, expressive' },
  { id: 'ballad', name: 'Ballad', description: 'Smooth, resonant, melodic' },
];

export interface LiveTranscriptItem {
  id: string;
  sender: 'user' | 'model';
  text: string;
  timestamp: string;
  provider: VoiceProvider;
}

interface UseLiveVoiceOptions {
  onCommitTranscript?: (transcript: LiveTranscriptItem) => void;
  getStoreContext?: () => string;
}

export function useLiveVoice(options?: UseLiveVoiceOptions) {
  const [provider, setProvider] = useState<VoiceProvider>(() => {
    try {
      const cached = localStorage.getItem('aura_live_voice_provider');
      if (cached === 'gpt' || cached === 'gemini') return cached;
    } catch {}
    return 'gemini';
  });

  const [activeVoice, setActiveVoice] = useState<string>(() => {
    try {
      const cachedVoice = localStorage.getItem('aura_live_voice_name');
      if (cachedVoice) return cachedVoice;
    } catch {}
    return 'Zephyr';
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscriptItem[]>([]);
  const [currentModelText, setCurrentModelText] = useState('');
  const [currentUserText, setCurrentUserText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlaybackTimeRef = useRef<number>(0);
  const isMutedRef = useRef(false);
  const speakingTimeoutRef = useRef<any>(null);
  const providerRef = useRef(provider);
  const activeVoiceRef = useRef(activeVoice);

  // Sync refs
  useEffect(() => {
    providerRef.current = provider;
    try {
      localStorage.setItem('aura_live_voice_provider', provider);
    } catch {}
  }, [provider]);

  useEffect(() => {
    activeVoiceRef.current = activeVoice;
    try {
      localStorage.setItem('aura_live_voice_name', activeVoice);
    } catch {}
  }, [activeVoice]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Convert Float32Array to 16-bit PCM little-endian Int16Array
  const floatTo16BitPCM = (input: Float32Array): Int16Array => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  };

  // Convert 16-bit PCM Int16Array to Float32Array
  const pcm16ToFloat32 = (int16: Int16Array): Float32Array => {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  };

  // Convert ArrayBuffer / Int16Array to base64
  const bufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Convert base64 to Int16Array
  const base64ToInt16 = (base64: string): Int16Array => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  };

  // Stop current audio output and flush scheduled buffers (barge-in / interrupt)
  const stopAudioPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextPlaybackTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setIsSpeaking(false);
    setOutputVolume(0);
  }, []);

  // Schedule an audio chunk received from server
  const playAudioChunk = useCallback((base64Data: string, sampleRate = 24000) => {
    try {
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
      }
      const ctx = outputAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const int16Data = base64ToInt16(base64Data);
      const float32Data = pcm16ToFloat32(int16Data);

      // Compute RMS volume for the Aura visual wave
      let sum = 0;
      for (let i = 0; i < float32Data.length; i++) {
        sum += float32Data[i] * float32Data[i];
      }
      const rms = Math.sqrt(sum / float32Data.length);
      setOutputVolume(Math.min(1, rms * 4));

      setIsSpeaking(true);
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = setTimeout(() => {
        setIsSpeaking(false);
        setOutputVolume(0);
      }, 600);

      const audioBuffer = ctx.createBuffer(1, float32Data.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, nextPlaybackTimeRef.current);
      source.start(startTime);
      nextPlaybackTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source);
        if (idx !== -1) {
          activeSourcesRef.current.splice(idx, 1);
        }
        if (activeSourcesRef.current.length === 0) {
          setIsSpeaking(false);
          setOutputVolume(0);
        }
      };
    } catch (err) {
      console.error('[useLiveVoice] Error playing audio chunk:', err);
    }
  }, []);

  // Disconnect voice session
  const disconnect = useCallback(() => {
    stopAudioPlayback();

    // Close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    // Stop MediaStream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect processor
    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.disconnect();
      } catch {}
      processorNodeRef.current = null;
    }

    // Close AudioContexts
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      try {
        inputAudioCtxRef.current.close();
      } catch {}
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      try {
        outputAudioCtxRef.current.close();
      } catch {}
      outputAudioCtxRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    setInputVolume(0);
    setOutputVolume(0);
  }, [stopAudioPlayback]);

  // Connect to live voice server
  const connect = useCallback(
    async (overrideProvider?: VoiceProvider, overrideVoice?: string) => {
      disconnect();
      setIsConnecting(true);
      setErrorMessage(null);

      const targetProvider = overrideProvider || providerRef.current;
      const targetVoice =
        overrideVoice ||
        activeVoiceRef.current ||
        (targetProvider === 'gemini' ? 'Zephyr' : 'alloy');

      try {
        // 1. Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;

        // 2. Setup Input Audio Context (16kHz for mic)
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 16000,
        });
        inputAudioCtxRef.current = inputCtx;

        // 3. Setup Output Audio Context (24kHz)
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
        outputAudioCtxRef.current = outputCtx;
        nextPlaybackTimeRef.current = outputCtx.currentTime;

        // 4. Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live-voice`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[useLiveVoice] WebSocket opened, initializing with provider:', targetProvider);
          const storeContext = options?.getStoreContext ? options.getStoreContext() : '';
          ws.send(
            JSON.stringify({
              type: 'init',
              provider: targetProvider,
              voice: targetVoice,
              storeContext,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'ready') {
              setIsConnected(true);
              setIsConnecting(false);
              setErrorMessage(null);
            }

            if (data.type === 'audio' && data.audio) {
              playAudioChunk(data.audio, data.sampleRate || 24000);
            }

            if (data.type === 'transcript') {
              if (data.sender === 'model') {
                setCurrentModelText((prev) => {
                  const updated = prev + data.text;
                  return updated;
                });
              } else if (data.sender === 'user') {
                setCurrentUserText(data.text);
                const transcriptItem: LiveTranscriptItem = {
                  id: `tr_${Date.now()}`,
                  sender: 'user',
                  text: data.text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  provider: targetProvider,
                };
                setLiveTranscripts((prev) => [...prev, transcriptItem]);
                options?.onCommitTranscript?.(transcriptItem);
              }
            }

            if (data.type === 'interrupted') {
              stopAudioPlayback();
              // Save ongoing model text as a finished turn if present
              setCurrentModelText((prev) => {
                if (prev.trim()) {
                  const transcriptItem: LiveTranscriptItem = {
                    id: `tr_${Date.now()}`,
                    sender: 'model',
                    text: prev.trim(),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    provider: targetProvider,
                  };
                  setLiveTranscripts((t) => [...t, transcriptItem]);
                  options?.onCommitTranscript?.(transcriptItem);
                }
                return '';
              });
            }

            if (data.type === 'error') {
              console.warn('[useLiveVoice] Server error:', data.message);
              setErrorMessage(data.message || 'Error occurred in live voice session.');
              setIsConnecting(false);
            }
          } catch (err) {
            console.error('[useLiveVoice] Error parsing WS message:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('[useLiveVoice] WS error:', err);
          setErrorMessage('Failed to connect to Live Voice server. Ensure the server is running.');
          setIsConnecting(false);
          setIsConnected(false);
        };

        ws.onclose = () => {
          console.log('[useLiveVoice] WS closed.');
          setIsConnected(false);
          setIsConnecting(false);
        };

        // 5. Connect Microphone Source to ScriptProcessorNode for chunk extraction
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(2048, 1, 1);
        processorNodeRef.current = processor;

        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setInputVolume(0);
            return;
          }

          const channelData = e.inputBuffer.getChannelData(0);

          // Calculate RMS input volume for visualizer
          let sum = 0;
          for (let i = 0; i < channelData.length; i++) {
            sum += channelData[i] * channelData[i];
          }
          const rms = Math.sqrt(sum / channelData.length);
          setInputVolume(Math.min(1, rms * 5));

          // Convert to 16-bit PCM little-endian
          const pcm16 = floatTo16BitPCM(channelData);
          const base64Pcm = bufferToBase64(pcm16.buffer);

          wsRef.current.send(
            JSON.stringify({
              type: 'audio',
              audio: base64Pcm,
              sampleRate: inputCtx.sampleRate,
            })
          );
        };
      } catch (err: any) {
        console.error('[useLiveVoice] Failed to start live voice:', err);
        setErrorMessage(
          err?.name === 'NotAllowedError'
            ? 'Microphone access was denied. Please allow microphone permissions in your browser.'
            : err?.message || 'Failed to initialize microphone.'
        );
        setIsConnecting(false);
        setIsConnected(false);
      }
    },
    [disconnect, playAudioChunk, stopAudioPlayback, options]
  );

  // Switch between Gemini and GPT live voice
  const switchProvider = useCallback(
    (newProvider: VoiceProvider, newVoice?: string) => {
      setProvider(newProvider);
      const voiceToUse =
        newVoice || (newProvider === 'gemini' ? 'Zephyr' : 'alloy');
      setActiveVoice(voiceToUse);

      if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        stopAudioPlayback();
        const storeContext = options?.getStoreContext ? options.getStoreContext() : '';
        wsRef.current.send(
          JSON.stringify({
            type: 'switch_provider',
            provider: newProvider,
            voice: voiceToUse,
            storeContext,
          })
        );
      } else if (isConnected) {
        // Reconnect with new provider
        connect(newProvider, voiceToUse);
      }
    },
    [isConnected, stopAudioPlayback, options, connect]
  );

  // Switch Voice Name
  const switchVoice = useCallback(
    (voiceName: string) => {
      setActiveVoice(voiceName);
      if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'switch_provider',
            provider: providerRef.current,
            voice: voiceName,
          })
        );
      }
    },
    [isConnected]
  );

  // Toggle Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    isMuted,
    isSpeaking,
    inputVolume,
    outputVolume,
    provider,
    activeVoice,
    errorMessage,
    liveTranscripts,
    currentModelText,
    currentUserText,
    connect,
    disconnect,
    switchProvider,
    switchVoice,
    toggleMute,
    stopAudioPlayback,
  };
}
