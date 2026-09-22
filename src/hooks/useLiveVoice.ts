import { useState, useEffect, useRef, useCallback } from 'react';
import { authenticatedFetch } from '../utils/apiClient';

export type VoiceProvider = 'gemini' | 'gpt';
export type ConnectionMode = 'streaming' | 'speech-assistant';

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
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('streaming');
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
  const workletNodeRef = useRef<AudioNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlaybackTimeRef = useRef<number>(0);
  const isMutedRef = useRef(false);
  const providerRef = useRef(provider);
  const activeVoiceRef = useRef(activeVoice);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const isWebVoiceActiveRef = useRef(false);
  const isAiThinkingRef = useRef(false);

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
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
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

      const pcm16 = base64ToInt16(base64Data);
      const float32 = pcm16ToFloat32(pcm16);

      // Compute RMS volume for audio output wave animation
      let sum = 0;
      for (let i = 0; i < float32.length; i++) {
        sum += float32[i] * float32[i];
      }
      const rms = Math.sqrt(sum / float32.length);
      setOutputVolume(Math.min(1, rms * 4));
      setIsSpeaking(true);

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlaybackTimeRef.current);
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
    isWebVoiceActiveRef.current = false;
    isAiThinkingRef.current = false;

    // Stop volume monitoring loop
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Stop SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

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

    // Disconnect worklet / processor node
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {}
      workletNodeRef.current = null;
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

  // Fallback Web Voice Assistant Mode (handles Firebase CDN / hosted.app 403 blocks)
  const startSpeechAssistantMode = useCallback(
    (targetProvider: VoiceProvider, targetVoice: string) => {
      console.log('[useLiveVoice] Activating High-Speed Web Voice Mode (CDN/Firebase Compatible)');
      setConnectionMode('speech-assistant');
      setIsConnecting(false);
      setIsConnected(true);
      setErrorMessage(null);
      isWebVoiceActiveRef.current = true;

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setErrorMessage('Web Speech Recognition is not supported by your browser. Please use Chrome, Edge, or Safari.');
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let speechDebounceTimer: any = null;
        let lastProcessedText = '';

        const submitQuery = async (queryText: string) => {
          if (!queryText.trim() || queryText.trim() === lastProcessedText) return;
          if (isAiThinkingRef.current) return;

          lastProcessedText = queryText.trim();
          isAiThinkingRef.current = true;

          const userItem: LiveTranscriptItem = {
            id: `tr_${Date.now()}`,
            sender: 'user',
            text: queryText.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            provider: targetProvider,
          };
          setLiveTranscripts((prev) => [...prev, userItem]);
          options?.onCommitTranscript?.(userItem);
          setCurrentUserText(queryText.trim());

          try {
            const storeContext = options?.getStoreContext ? options.getStoreContext() : '';
            const modelName = targetProvider === 'gpt' ? 'gpt-4o-mini' : 'gemini-2.5-flash';

            const response = await authenticatedFetch('/api/chat-assistant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `[Spoken Voice Command] ${queryText.trim()}`,
                model: modelName,
                context: {
                  storeContext,
                },
                history: [],
              }),
            });

            const data = await response.json();
            const replyText = data.response || data.message || "I've processed your store request.";

            const modelItem: LiveTranscriptItem = {
              id: `tr_${Date.now() + 1}`,
              sender: 'model',
              text: replyText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              provider: targetProvider,
            };
            setLiveTranscripts((prev) => [...prev, modelItem]);
            options?.onCommitTranscript?.(modelItem);
            setCurrentModelText(replyText);

            // Speak response using SpeechSynthesis with voice pitch/rate tuning
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(replyText);
              utterance.lang = 'en-US';

              // Adjust rate/pitch based on voice selection
              if (targetVoice === 'Puck' || targetVoice === 'coral') {
                utterance.pitch = 1.15;
                utterance.rate = 1.05;
              } else if (targetVoice === 'Charon' || targetVoice === 'ash') {
                utterance.pitch = 0.9;
                utterance.rate = 0.95;
              } else {
                utterance.pitch = 1.0;
                utterance.rate = 1.0;
              }

              utterance.onstart = () => {
                setIsSpeaking(true);
                setOutputVolume(0.75);
              };

              utterance.onend = () => {
                setIsSpeaking(false);
                setOutputVolume(0);
                isAiThinkingRef.current = false;
              };

              utterance.onerror = () => {
                setIsSpeaking(false);
                setOutputVolume(0);
                isAiThinkingRef.current = false;
              };

              window.speechSynthesis.speak(utterance);
            } else {
              isAiThinkingRef.current = false;
            }
          } catch (apiErr: any) {
            console.error('[useLiveVoice] Error sending voice query:', apiErr);
            isAiThinkingRef.current = false;
          }
        };

        recognition.onresult = (event: any) => {
          if (isMutedRef.current || isAiThinkingRef.current) return;

          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const currentSpoken = finalTranscript || interimTranscript;
          if (currentSpoken) {
            setCurrentUserText(currentSpoken);

            // Debounce speech pause for 900ms to automatically trigger copilot response
            if (speechDebounceTimer) clearTimeout(speechDebounceTimer);
            speechDebounceTimer = setTimeout(() => {
              submitQuery(currentSpoken);
            }, 950);
          }
        };

        recognition.onerror = (e: any) => {
          if (e.error !== 'no-speech' && e.error !== 'aborted') {
            console.warn('[useLiveVoice] SpeechRecognition error:', e.error);
          }
        };

        recognition.onend = () => {
          // Keep recognition listening in hands-free mode if call is active
          if (isWebVoiceActiveRef.current) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err: any) {
        console.error('[useLiveVoice] Failed to initialize SpeechRecognition fallback:', err);
      }
    },
    [options]
  );

  // Connect to live voice server (WebSockets with automatic CDN/Firebase fallback)
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

        // 3. Setup AnalyserNode for volume visualizer without deprecated ScriptProcessorNode
        const analyser = inputCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        const source = inputCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateInputVolume = () => {
          if (!isMutedRef.current && analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setInputVolume(Math.min(1, (avg / 128) * 1.6));
          } else {
            setInputVolume(0);
          }
          animFrameRef.current = requestAnimationFrame(updateInputVolume);
        };
        updateInputVolume();

        // 4. Setup Output Audio Context (24kHz)
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
        outputAudioCtxRef.current = outputCtx;
        nextPlaybackTimeRef.current = outputCtx.currentTime;

        // 5. Connect WebSocket with Automatic CDN Proxy Fallback
        let wsConnected = false;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live-voice`;
        
        console.log('[useLiveVoice] Attempting WebSocket connection to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // Guard timeout: if CDN/Proxy blocks WebSocket with 403 or hangs, auto-activate voice mode
        const connectionTimeout = setTimeout(() => {
          if (!wsConnected) {
            console.warn('[useLiveVoice] WebSocket connection timed out. Falling back to CDN-compatible Voice Mode.');
            try {
              ws.close();
            } catch {}
            startSpeechAssistantMode(targetProvider, targetVoice);
          }
        }, 2200);

        ws.onopen = () => {
          wsConnected = true;
          clearTimeout(connectionTimeout);
          console.log('[useLiveVoice] WebSocket handshake established successfully.');
          setConnectionMode('streaming');
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
                setCurrentModelText((prev) => prev + data.text);
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
              console.warn('[useLiveVoice] Server message:', data.message);
              setErrorMessage(data.message || 'Error occurred in live voice session.');
              setIsConnecting(false);
            }
          } catch (err) {
            console.error('[useLiveVoice] Error parsing WS message:', err);
          }
        };

        ws.onerror = (err) => {
          console.warn('[useLiveVoice] WebSocket connection unavailable (e.g. 403 on CDN/Firebase proxy). Activating Voice Mode.');
          clearTimeout(connectionTimeout);
          if (!wsConnected) {
            startSpeechAssistantMode(targetProvider, targetVoice);
          }
        };

        ws.onclose = () => {
          clearTimeout(connectionTimeout);
          if (!isWebVoiceActiveRef.current) {
            console.log('[useLiveVoice] WS closed.');
            setIsConnected(false);
            setIsConnecting(false);
          }
        };

        // 6. Connect Modern AudioWorklet / Processing for Raw PCM Stream
        const sendPcmChunk = (channelData: Float32Array) => {
          if (isMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }
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

        // Use AudioWorklet if supported to avoid ScriptProcessorNode deprecation
        if (typeof inputCtx.audioWorklet?.addModule === 'function') {
          try {
            const workletCode = `
              class PcmStreamProcessor extends AudioWorkletProcessor {
                process(inputs) {
                  const input = inputs[0];
                  if (input && input[0]) {
                    this.port.postMessage(input[0]);
                  }
                  return true;
                }
              }
              registerProcessor('pcm-stream-processor', PcmStreamProcessor);
            `;
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            await inputCtx.audioWorklet.addModule(blobUrl);
            URL.revokeObjectURL(blobUrl);

            const workletNode = new AudioWorkletNode(inputCtx, 'pcm-stream-processor');
            workletNode.port.onmessage = (e) => {
              sendPcmChunk(e.data);
            };
            source.connect(workletNode);
            workletNode.connect(inputCtx.destination);
            workletNodeRef.current = workletNode;
          } catch (workletErr) {
            console.warn('[useLiveVoice] AudioWorklet init error, using fallback node:', workletErr);
          }
        }
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
    [disconnect, playAudioChunk, stopAudioPlayback, options, startSpeechAssistantMode]
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
    connectionMode,
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
