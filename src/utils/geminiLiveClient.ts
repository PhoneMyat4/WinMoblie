import { GeminiLiveAudioPlayer, GeminiLiveAudioRecorder } from './geminiLiveAudio';
import { PosDataContext } from '../../server/aiAssistant';

export interface LiveClientCallbacks {
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
  private volumePollInterval: any = null;
  private connectionTimeout: any = null;

  constructor(callbacks: LiveClientCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(context: PosDataContext): Promise<void> {
    if (this.isConnected) return;

    return new Promise(async (resolve, reject) => {
      let isSettled = false;

      // 4.5s connection timeout safeguard
      this.connectionTimeout = setTimeout(() => {
        if (!isSettled && !this.isConnected) {
          isSettled = true;
          this.stop();
          const errMessage = 'Connection to Live Voice server timed out (WebSocket unavailable).';
          this.callbacks.onError?.(errMessage, true);
          reject(new Error(errMessage));
        }
      }, 4500);

      try {
        // 1. Initialize audio player (24kHz Web Audio API)
        this.player = new GeminiLiveAudioPlayer();
        await this.player.resume();

        // 2. Build WebSocket URL matching current protocol & host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/live`;

        console.log('[GeminiLiveClient] Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[GeminiLiveClient] WebSocket open, sending init context...');
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
              if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
              }
              if (!isSettled) {
                isSettled = true;
                resolve();
              }
              this.callbacks.onReady?.(message.model);

              // Start recording microphone audio after session is confirmed ready
              this.startRecording();
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
              // Give audio a brief moment to finish playing buffered chunks
              setTimeout(() => {
                if (!this.player?.isPlaying()) {
                  this.callbacks.onAiSpeaking?.(false);
                }
              }, 350);
            } else if (message.type === 'toolExecuted') {
              console.log('[GeminiLiveClient] Tool executed:', message.name);
              this.callbacks.onToolExecuted?.(message);
            } else if (message.type === 'error') {
              console.error('[GeminiLiveClient] Server error:', message.error);
              if (!isSettled) {
                isSettled = true;
                reject(new Error(message.error));
              }
              this.callbacks.onError?.(message.error, false);
            } else if (message.type === 'closed') {
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
          this.stop();
          const errMessage = 'Failed to connect to Live Voice server (WebSocket error).';
          if (!isSettled) {
            isSettled = true;
            reject(new Error(errMessage));
          }
          this.callbacks.onError?.(errMessage, true);
        };

        this.ws.onclose = (ev) => {
          console.log('[GeminiLiveClient] WebSocket closed:', ev.reason);
          this.stop();
          this.callbacks.onClose?.(ev.reason);
        };
      } catch (err: any) {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        this.stop();
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
        this.callbacks.onError?.(err?.message || 'Failed to start Live Voice client.', true);
      }
    });
  }

  private async startRecording() {
    try {
      this.recorder = new GeminiLiveAudioRecorder((base64Chunk, volume) => {
        // Automatic Barge-in: If user speaks while model is playing audio, interrupt immediately!
        if (volume > 0.08 && this.player?.isPlaying()) {
          console.log('[GeminiLiveClient] Local barge-in triggered by user voice');
          this.player.interrupt();
          this.callbacks.onAiSpeaking?.(false);
        }

        // Stream audio chunk to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'audio',
              data: base64Chunk,
            })
          );
        }
      });

      await this.recorder.start();

      // Poll audio level for smooth visual waveform feedback
      this.volumePollInterval = setInterval(() => {
        if (!this.recorder) return;
        const userVol = this.recorder.getVolumeLevel();
        const aiVol = this.player?.getVolumeLevel() || 0;
        const isAiPlaying = this.player?.isPlaying() || false;

        this.callbacks.onUserSpeaking?.(userVol);
        if (isAiPlaying) {
          this.callbacks.onAiSpeaking?.(true);
        }
      }, 50);
    } catch (err: any) {
      console.error('[GeminiLiveClient] Error starting microphone recording:', err);
      this.callbacks.onError?.(
        err?.message || 'Microphone access denied. Please allow microphone permissions.'
      );
      this.stop();
    }
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
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}
