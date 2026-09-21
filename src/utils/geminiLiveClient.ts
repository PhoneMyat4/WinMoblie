import { GeminiLiveAudioPlayer, GeminiLiveAudioRecorder } from './geminiLiveAudio';
import { PosDataContext } from '../../server/aiAssistant';

export interface LiveClientCallbacks {
  onStatus?: (status: string) => void;
  onReady?: (model: string) => void;
  onAiSpeaking?: (speaking: boolean) => void;
  onUserSpeaking?: (volume: number) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onInterrupted?: () => void;
  onToolExecuted?: (data: {
    name: string;
    args: any;
    result: any;
    createdProduct?: any;
    updatedProduct?: any;
    pdfReport?: any;
  }) => void;
  onError?: (error: string, isConnectionError?: boolean) => void;
  onClose?: (reason?: string) => void;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private player: GeminiLiveAudioPlayer | null = null;
  private recorder: GeminiLiveAudioRecorder | null = null;
  private callbacks: LiveClientCallbacks = {};
  private isConnected: boolean = false;
  private isStarting: boolean = false;
  private volumePollInterval: any = null;
  private connectionTimeout: any = null;

  constructor(callbacks: LiveClientCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(context: PosDataContext): Promise<void> {
    if (this.isConnected || this.isStarting) return;
    this.isStarting = true;

    return new Promise(async (resolve, reject) => {
      let isSettled = false;

      // 25s connection timeout safeguard
      this.connectionTimeout = setTimeout(() => {
        if (!isSettled && !this.isConnected) {
          isSettled = true;
          this.isStarting = false;
          this.stop();
          const errMessage = 'Live Voice ဆာဗာသို့ ချိတ်ဆက်မှု အချိန်ပြည့်သွားပါသည် (Connection timed out). ကွန်ရက်ကို စစ်ဆေးပြီး ထပ်မံကြိုးစားပါ။';
          this.callbacks.onError?.(errMessage, true);
          reject(new Error(errMessage));
        }
      }, 25000);

      try {
        // Step 1: Prompt/verify microphone permission IMMEDIATELY within user click gesture
        this.callbacks.onStatus?.('မိုက်ခရိုဖုန်း ခွင့်ပြုချက် ရယူနေပါသည် (Requesting microphone access)...');

        this.recorder = new GeminiLiveAudioRecorder((base64Chunk, volume) => {
          // Automatic Barge-in: If user speaks while model is speaking, interrupt immediately!
          if (volume > 0.08 && this.player?.isPlaying()) {
            this.player.interrupt();
            this.callbacks.onAiSpeaking?.(false);
          }

          // Stream audio chunk to server only when session is confirmed ready
          if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(
                JSON.stringify({
                  type: 'audio',
                  data: base64Chunk,
                })
              );
            } catch (err) {
              console.warn('[GeminiLiveClient] Error sending audio chunk:', err);
            }
          }
        });

        // Acquire microphone stream right now
        await this.recorder.start();

        // Step 2: Initialize audio player (24kHz Web Audio API)
        this.player = new GeminiLiveAudioPlayer();
        await this.player.resume();

        // Step 3: Connect WebSocket
        this.callbacks.onStatus?.('Gemini Live Voice ဆာဗာသို့ ချိတ်ဆက်နေပါသည် (Connecting to Gemini Live API)...');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/live`;

        console.log('[GeminiLiveClient] Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[GeminiLiveClient] WebSocket open, sending init context...');
          this.callbacks.onStatus?.('Gemini Live အား အချက်အလက်များဖြင့် စတင်နေပါသည် (Initializing session)...');
          this.ws?.send(
            JSON.stringify({
              type: 'init',
              context,
            })
          );
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'ready') {
              console.log('[GeminiLiveClient] Session ready with model:', message.model);
              this.isConnected = true;
              this.isStarting = false;
              if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
              }
              if (!isSettled) {
                isSettled = true;
                resolve();
              }
              this.callbacks.onReady?.(message.model);

              // Start polling volume level for live waveform animation
              if (this.volumePollInterval) clearInterval(this.volumePollInterval);
              this.volumePollInterval = setInterval(() => {
                if (!this.recorder) return;
                const userVol = this.recorder.getVolumeLevel();
                const aiVol = this.player?.getVolumeLevel() || 0;
                const isAiPlaying = this.player?.isPlaying() || false;

                this.callbacks.onUserSpeaking?.(isAiPlaying ? aiVol : userVol);
                if (isAiPlaying) {
                  this.callbacks.onAiSpeaking?.(true);
                }
              }, 40);

            } else if (message.type === 'audio') {
              // Model output audio chunk (24kHz PCM)
              if (message.data) {
                this.callbacks.onAiSpeaking?.(true);
                this.player?.playChunk(message.data);
              }
            } else if (message.type === 'transcript') {
              this.callbacks.onTranscript?.(message.text, message.role || 'assistant');
            } else if (message.type === 'interrupted') {
              console.log('[GeminiLiveClient] Interrupted received from server');
              this.player?.interrupt();
              this.callbacks.onAiSpeaking?.(false);
              this.callbacks.onInterrupted?.();
            } else if (message.type === 'turnComplete') {
              setTimeout(() => {
                if (!this.player?.isPlaying()) {
                  this.callbacks.onAiSpeaking?.(false);
                }
              }, 300);
            } else if (message.type === 'toolExecuted') {
              console.log('[GeminiLiveClient] Tool executed:', message.name);
              this.callbacks.onToolExecuted?.(message);
            } else if (message.type === 'error') {
              console.error('[GeminiLiveClient] Server error:', message.error);
              this.isStarting = false;
              if (!isSettled) {
                isSettled = true;
                reject(new Error(message.error));
              }
              this.callbacks.onError?.(message.error, false);
            } else if (message.type === 'closed') {
              this.isStarting = false;
              this.stop();
              this.callbacks.onClose?.(message.reason);
            }
          } catch (e) {
            console.error('[GeminiLiveClient] Failed to parse message:', e);
          }
        };

        this.ws.onerror = (err) => {
          console.error('[GeminiLiveClient] WebSocket error:', err);
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.isStarting = false;
          this.stop();
          const errMessage = 'Live Voice ဆာဗာ ချိတ်ဆက်မှု မအောင်မြင်ပါ (WebSocket error).';
          if (!isSettled) {
            isSettled = true;
            reject(new Error(errMessage));
          }
          this.callbacks.onError?.(errMessage, true);
        };

        this.ws.onclose = (ev) => {
          console.log('[GeminiLiveClient] WebSocket closed:', ev.reason);
          this.isStarting = false;
          this.stop();
          this.callbacks.onClose?.(ev.reason);
        };
      } catch (err: any) {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        this.isStarting = false;
        this.stop();
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
        const friendlyError =
          err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')
            ? 'မိုက်ခရိုဖုန်း အသုံးပြုခွင့် ပိတ်ထားပါသည်။ Browser တွင် မိုက်ခရိုဖုန်း ခွင့်ပြုပေးပါ (Microphone permission denied).'
            : err?.message || 'Failed to start Live Voice client.';
        this.callbacks.onError?.(friendlyError, true);
      }
    });
  }

  public sendText(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'text',
          text,
        })
      );
    }
  }

  public updateContext(context: PosDataContext) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'updateContext',
          context,
        })
      );
    }
  }

  public stop(): void {
    if (this.volumePollInterval) {
      clearInterval(this.volumePollInterval);
      this.volumePollInterval = null;
    }

    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }

    if (this.player) {
      this.player.close();
      this.player = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'stop' }));
        } catch (e) {}
      }
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    this.isConnected = false;
    this.isStarting = false;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}
