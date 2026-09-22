import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

export type VoiceProvider = 'gemini' | 'gpt';

interface LiveSession {
  clientWs: WebSocket;
  provider: VoiceProvider;
  geminiSession?: any;
  gptWs?: WebSocket;
  activeVoice: string;
  isClosed: boolean;
  storeContext?: string;
}

const DEFAULT_GEMINI_VOICE = 'Zephyr'; // 'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'
const DEFAULT_GPT_VOICE = 'alloy'; // 'alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'

function buildSystemInstruction(storeContext?: string): string {
  let contextSnippet = '';
  if (storeContext && storeContext.trim()) {
    contextSnippet = `\n\nLive Store Snapshot:\n${storeContext.slice(0, 3000)}`;
  }
  return `You are Aura, the real-time AI store copilot for this mobile phone and consumer electronics retail shop.
You are having a direct, low-latency live voice conversation with the store cashier/manager.
Guidelines:
1. Speak naturally, warmly, and concisely (typically 1 to 3 short sentences per turn).
2. Avoid bullet points, long lists, markdown syntax, or ASCII tables since your output is spoken directly over audio.
3. Assist with phone inventory, IMEI serialized tracking, sales inquiries, pricing, cash drawer reconciliation, and daily store operations.
4. If you don't have certain specific transaction data, answer politely and suggest checking the POS dashboard.${contextSnippet}`;
}

export function setupLiveVoiceServer(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const parsedUrl = new URL(request.url || '', `http://${host}`);
      const p = parsedUrl.pathname;
      if (p === '/api/live-voice' || p === '/ws/live-voice' || p === '/live-voice') {
        wss.handleUpgrade(request, socket, head, (clientWs) => {
          wss.emit('connection', clientWs, request);
        });
      }
    } catch (err) {
      console.error('[LiveVoice] Error routing upgrade request:', err);
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    console.log('[LiveVoice] Client connected to live voice socket.');

    const sessionState: LiveSession = {
      clientWs,
      provider: 'gemini',
      activeVoice: DEFAULT_GEMINI_VOICE,
      isClosed: false,
    };

    // Resample 24kHz/other PCM16 to 16kHz PCM16 for Gemini
    function resamplePcm16(sourceBuffer: Buffer, fromRate: number, toRate: number): Buffer {
      if (fromRate === toRate || fromRate <= 0 || toRate <= 0) return sourceBuffer;
      const numSamples = Math.floor(sourceBuffer.length / 2);
      const ratio = fromRate / toRate;
      const targetNumSamples = Math.round(numSamples / ratio);
      const targetBuffer = Buffer.alloc(targetNumSamples * 2);

      for (let i = 0; i < targetNumSamples; i++) {
        const srcPos = i * ratio;
        const index0 = Math.floor(srcPos);
        const index1 = Math.min(index0 + 1, numSamples - 1);
        const frac = srcPos - index0;

        const val0 = sourceBuffer.readInt16LE(index0 * 2);
        const val1 = sourceBuffer.readInt16LE(index1 * 2);
        const interpolated = Math.round(val0 * (1 - frac) + val1 * frac);
        targetBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
      }
      return targetBuffer;
    }

    // Teardown any existing active session with an AI provider
    function cleanupProviderSession() {
      if (sessionState.geminiSession) {
        try {
          if (typeof sessionState.geminiSession.close === 'function') {
            sessionState.geminiSession.close();
          }
        } catch (e) {
          // ignore
        }
        sessionState.geminiSession = null;
      }
      if (sessionState.gptWs) {
        try {
          sessionState.gptWs.close();
        } catch (e) {
          // ignore
        }
        sessionState.gptWs = null;
      }
    }

    // Initialize Gemini Live API Session
    async function initGeminiSession(voiceName: string = DEFAULT_GEMINI_VOICE) {
      cleanupProviderSession();
      sessionState.provider = 'gemini';
      sessionState.activeVoice = voiceName;

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            provider: 'gemini',
            message: 'GEMINI_API_KEY is not configured in the server environment. Please set your Gemini API key in Settings.',
          }));
        }
        return;
      }

      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const systemPrompt = buildSystemInstruction(sessionState.storeContext);

        const liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName || DEFAULT_GEMINI_VOICE,
                },
              },
            },
            systemInstruction: systemPrompt,
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              if (sessionState.isClosed || clientWs.readyState !== WebSocket.OPEN) return;

              // Check for model output audio
              const modelParts = message.serverContent?.modelTurn?.parts;
              if (modelParts && modelParts.length > 0) {
                for (const part of modelParts) {
                  if (part.inlineData?.data) {
                    clientWs.send(JSON.stringify({
                      type: 'audio',
                      provider: 'gemini',
                      audio: part.inlineData.data,
                      sampleRate: 24000,
                    }));
                  }
                  if (part.text) {
                    clientWs.send(JSON.stringify({
                      type: 'transcript',
                      provider: 'gemini',
                      sender: 'model',
                      text: part.text,
                    }));
                  }
                }
              }

              // Check for user interruption (barge-in)
              if (message.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({
                  type: 'interrupted',
                  provider: 'gemini',
                }));
              }
            },
            onerror: (err: any) => {
              console.error('[LiveVoice] Gemini Live error:', err);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'error',
                  provider: 'gemini',
                  message: err?.message || 'Error occurred in Gemini Live connection.',
                }));
              }
            },
            onclose: () => {
              console.log('[LiveVoice] Gemini Live connection closed.');
            },
          },
        });

        sessionState.geminiSession = liveSession;

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'ready',
            provider: 'gemini',
            voice: voiceName,
            message: 'Connected to Gemini 3.8 Live API.',
          }));
        }
      } catch (err: any) {
        console.error('[LiveVoice] Failed to start Gemini Live session:', err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            provider: 'gemini',
            message: err?.message || 'Failed to initialize Gemini 3.8 Live session.',
          }));
        }
      }
    }

    // Initialize OpenAI Realtime API Session
    async function initGptSession(voiceName: string = DEFAULT_GPT_VOICE) {
      cleanupProviderSession();
      sessionState.provider = 'gpt';
      sessionState.activeVoice = voiceName;

      const openAiApiKey = process.env.OPENAI_API_KEY;
      if (!openAiApiKey) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            provider: 'gpt',
            message: 'OPENAI_API_KEY is not configured in the server environment. Please set your OpenAI API key in Settings.',
          }));
        }
        return;
      }

      try {
        const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
        const gptWs = new WebSocket(url, {
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
            'OpenAI-Beta': 'realtime=v1',
          },
        });

        sessionState.gptWs = gptWs;

        gptWs.on('open', () => {
          console.log('[LiveVoice] Connected to OpenAI Realtime WebSocket.');

          // Configure the session with system prompt, voice, audio format, and server VAD
          const systemPrompt = buildSystemInstruction(sessionState.storeContext);
          const sessionUpdate = {
            type: 'session.update',
            session: {
              modalities: ['audio', 'text'],
              instructions: systemPrompt,
              voice: voiceName || DEFAULT_GPT_VOICE,
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              input_audio_transcription: {
                model: 'whisper-1',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 600,
              },
            },
          };
          gptWs.send(JSON.stringify(sessionUpdate));

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'ready',
              provider: 'gpt',
              voice: voiceName,
              message: 'Connected to GPT-4o Realtime API.',
            }));
          }
        });

        gptWs.on('message', (data: Buffer | string) => {
          if (sessionState.isClosed || clientWs.readyState !== WebSocket.OPEN) return;
          try {
            const event = JSON.parse(data.toString());

            // 1. Audio stream delta
            if (event.type === 'response.audio.delta' && event.delta) {
              clientWs.send(JSON.stringify({
                type: 'audio',
                provider: 'gpt',
                audio: event.delta,
                sampleRate: 24000,
              }));
            }

            // 2. Model transcript delta
            if (event.type === 'response.audio_transcript.delta' && event.delta) {
              clientWs.send(JSON.stringify({
                type: 'transcript',
                provider: 'gpt',
                sender: 'model',
                text: event.delta,
              }));
            }

            // 3. User spoken transcript
            if (
              event.type === 'conversation.item.input_audio_transcription.completed' &&
              event.transcript
            ) {
              clientWs.send(JSON.stringify({
                type: 'transcript',
                provider: 'gpt',
                sender: 'user',
                text: event.transcript,
                isFinal: true,
              }));
            }

            // 4. User speech started -> interrupt playback
            if (event.type === 'input_audio_buffer.speech_started') {
              clientWs.send(JSON.stringify({
                type: 'interrupted',
                provider: 'gpt',
              }));
            }

            // 5. Error handling
            if (event.type === 'error') {
              console.error('[LiveVoice] OpenAI Realtime error event:', event.error);
              clientWs.send(JSON.stringify({
                type: 'error',
                provider: 'gpt',
                message: event.error?.message || 'Error occurred in OpenAI Realtime session.',
              }));
            }
          } catch (err) {
            console.error('[LiveVoice] Error parsing OpenAI event:', err);
          }
        });

        gptWs.on('error', (err) => {
          console.error('[LiveVoice] OpenAI Realtime socket error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'error',
              provider: 'gpt',
              message: err?.message || 'WebSocket error connecting to OpenAI Realtime.',
            }));
          }
        });

        gptWs.on('close', () => {
          console.log('[LiveVoice] OpenAI Realtime socket closed.');
        });
      } catch (err: any) {
        console.error('[LiveVoice] Failed to start GPT Realtime session:', err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            provider: 'gpt',
            message: err?.message || 'Failed to initialize GPT Realtime session.',
          }));
        }
      }
    }

    // Handle incoming messages from the frontend client
    clientWs.on('message', async (rawMsg: Buffer | string) => {
      try {
        const payload = JSON.parse(rawMsg.toString());

        // Initial setup
        if (payload.type === 'init') {
          if (payload.storeContext) {
            sessionState.storeContext = payload.storeContext;
          }
          const provider: VoiceProvider = payload.provider === 'gpt' ? 'gpt' : 'gemini';
          const requestedVoice = payload.voice || (provider === 'gemini' ? DEFAULT_GEMINI_VOICE : DEFAULT_GPT_VOICE);
          if (provider === 'gpt') {
            await initGptSession(requestedVoice);
          } else {
            await initGeminiSession(requestedVoice);
          }
          return;
        }

        // Switch Provider (Gemini <-> GPT)
        if (payload.type === 'switch_provider') {
          const newProvider: VoiceProvider = payload.provider === 'gpt' ? 'gpt' : 'gemini';
          const newVoice = payload.voice || (newProvider === 'gemini' ? DEFAULT_GEMINI_VOICE : DEFAULT_GPT_VOICE);
          if (payload.storeContext) {
            sessionState.storeContext = payload.storeContext;
          }
          if (newProvider === 'gpt') {
            await initGptSession(newVoice);
          } else {
            await initGeminiSession(newVoice);
          }
          return;
        }

        // Interrupt signal from client
        if (payload.type === 'interrupt') {
          if (sessionState.provider === 'gpt' && sessionState.gptWs?.readyState === WebSocket.OPEN) {
            sessionState.gptWs.send(JSON.stringify({ type: 'response.cancel' }));
          }
          return;
        }

        // Audio frame received from client microphone
        if (payload.type === 'audio' && payload.audio) {
          const clientSampleRate = Number(payload.sampleRate) || 16000;
          const rawBuffer = Buffer.from(payload.audio, 'base64');

          if (sessionState.provider === 'gemini') {
            if (sessionState.geminiSession) {
              // Gemini Live expects 16kHz PCM
              const pcm16Buffer = clientSampleRate === 16000
                ? rawBuffer
                : resamplePcm16(rawBuffer, clientSampleRate, 16000);
              const base64Data = pcm16Buffer.toString('base64');

              sessionState.geminiSession.sendRealtimeInput({
                audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
              });
            }
          } else if (sessionState.provider === 'gpt') {
            if (sessionState.gptWs?.readyState === WebSocket.OPEN) {
              // OpenAI Realtime expects 24kHz PCM16 (or 16kHz if configured, but default is 24kHz)
              const pcm24Buffer = clientSampleRate === 24000
                ? rawBuffer
                : resamplePcm16(rawBuffer, clientSampleRate, 24000);
              const base64Data = pcm24Buffer.toString('base64');

              sessionState.gptWs.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Data,
              }));
            }
          }
        }
      } catch (err) {
        console.error('[LiveVoice] Error handling client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('[LiveVoice] Client disconnected.');
      sessionState.isClosed = true;
      cleanupProviderSession();
    });

    clientWs.on('error', (err) => {
      console.error('[LiveVoice] Client socket error:', err);
      sessionState.isClosed = true;
      cleanupProviderSession();
    });
  });

  return wss;
}
