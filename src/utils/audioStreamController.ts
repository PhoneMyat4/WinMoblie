/**
 * Client-Side Audio Streaming Controller
 * 
 * Powered by Web Audio API & MediaStream API:
 * - Real-time microphone audio capture and analysis (AnalyserNode)
 * - Frequency spectrum and RMS volume calculation for animated waveforms
 * - Sequential speaker playback queue with glitch-free buffer scheduling
 * - Barge-in & interruption support (instant cut-off and queue clearing)
 * - Burmese language speech recognition (my-MM) & neural TTS audio bridge
 */

import { authenticatedFetch } from './apiClient';

export type AudioEngineState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface AudioLevelPayload {
  level: number; // 0.0 to 1.0 normalized RMS volume
  frequencyData: Uint8Array;
  source: 'mic' | 'speaker' | 'idle';
}

export interface AudioStreamControllerOptions {
  sampleRate?: number;
  fftSize?: number;
  silenceThreshold?: number; // RMS threshold below which is considered silence
  silenceDurationMs?: number; // Duration of silence before triggering end of speech
  preferredLanguage?: string; // 'my-MM' | 'en-US'
  onStateChange?: (state: AudioEngineState) => void;
  onAudioLevel?: (payload: AudioLevelPayload) => void;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onSpeechEnd?: (finalTranscript: string) => void;
  onError?: (errorMsg: string) => void;
}

export class AudioStreamController {
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micAnalyserNode: AnalyserNode | null = null;

  // Speaker Playback Queue & Analyser
  private speakerAnalyserNode: AnalyserNode | null = null;
  private speakerGainNode: GainNode | null = null;
  private playbackQueue: AudioBuffer[] = [];
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private isPlayingQueue: boolean = false;

  // Animation Frame Loop
  private animationFrameId: number | null = null;
  private micDataArray: Uint8Array | null = null;
  private speakerDataArray: Uint8Array | null = null;

  // State
  private state: AudioEngineState = 'idle';
  private options: AudioStreamControllerOptions;

  // Speech Recognition (Dual Burmese/English fallback)
  private recognition: any = null;
  private isRecognitionActive: boolean = false;
  private currentTranscript: string = '';
  private lastSpokenTime: number = 0;
  private silenceCheckTimer: any = null;
  private synthUtterance: SpeechSynthesisUtterance | null = null;
  private synthIntervalId: any = null;

  constructor(options: AudioStreamControllerOptions = {}) {
    this.options = {
      sampleRate: 24000,
      fftSize: 256,
      silenceThreshold: 0.015,
      silenceDurationMs: 1400,
      preferredLanguage: 'my-MM', // Prioritize Burmese
      ...options,
    };
  }

  /**
   * Safe AudioContext initialization conforming to browser autoplay gestures
   */
  public async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Initializes audio nodes for playback analysis
   */
  private setupSpeakerPipeline(ctx: AudioContext) {
    if (!this.speakerAnalyserNode) {
      this.speakerAnalyserNode = ctx.createAnalyser();
      this.speakerAnalyserNode.fftSize = this.options.fftSize || 256;
      this.speakerAnalyserNode.smoothingTimeConstant = 0.8;
      this.speakerDataArray = new Uint8Array(this.speakerAnalyserNode.frequencyBinCount);
    }

    if (!this.speakerGainNode) {
      this.speakerGainNode = ctx.createGain();
      this.speakerGainNode.gain.value = 1.0;
      this.speakerGainNode.connect(this.speakerAnalyserNode);
      this.speakerAnalyserNode.connect(ctx.destination);
    }
  }

  /**
   * Start listening to user microphone with real-time analysis
   */
  public async startListening(): Promise<boolean> {
    try {
      // Barge-in: immediately stop any ongoing playback
      this.interrupt();

      const ctx = await this.ensureAudioContext();
      this.setupSpeakerPipeline(ctx);

      // Request microphone stream with clean echo cancellation & noise suppression
      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      // Connect mic to analyser
      if (!this.micSourceNode && this.micStream) {
        this.micSourceNode = ctx.createMediaStreamSource(this.micStream);
        this.micAnalyserNode = ctx.createAnalyser();
        this.micAnalyserNode.fftSize = this.options.fftSize || 256;
        this.micAnalyserNode.smoothingTimeConstant = 0.8;
        this.micDataArray = new Uint8Array(this.micAnalyserNode.frequencyBinCount);
        this.micSourceNode.connect(this.micAnalyserNode);
        // Note: Do NOT connect micAnalyserNode to ctx.destination to avoid feedback loops!
      }

      this.setState('listening');
      this.startVisualizerLoop();
      this.startSpeechRecognition();
      return true;
    } catch (err: any) {
      console.error('[AudioEngine] Failed to start microphone capture:', err);
      this.options.onError?.(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access in your browser settings.'
          : 'Failed to access microphone. Please check your audio device.'
      );
      this.setState('idle');
      return false;
    }
  }

  /**
   * Stop microphone listening
   */
  public stopListening(): void {
    if (this.recognition && this.isRecognitionActive) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.isRecognitionActive = false;
    }

    if (this.silenceCheckTimer) {
      clearTimeout(this.silenceCheckTimer);
      this.silenceCheckTimer = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }

    if (this.state === 'listening') {
      this.setState('idle');
    }
  }

  /**
   * High-Performance Visualizer Loop (60 FPS)
   */
  private startVisualizerLoop(): void {
    if (this.animationFrameId) return;

    const renderLoop = () => {
      this.animationFrameId = requestAnimationFrame(renderLoop);

      let calculatedLevel = 0;
      let activeFrequencyData: Uint8Array = new Uint8Array(32);
      let source: 'mic' | 'speaker' | 'idle' = 'idle';

      if (this.state === 'listening' && this.micAnalyserNode && this.micDataArray) {
        this.micAnalyserNode.getByteFrequencyData(this.micDataArray);
        activeFrequencyData = this.micDataArray;
        source = 'mic';

        // Calculate Root-Mean-Square (RMS) volume
        let sum = 0;
        for (let i = 0; i < this.micDataArray.length; i++) {
          sum += this.micDataArray[i];
        }
        calculatedLevel = Math.min(1.0, (sum / this.micDataArray.length) / 128);

        // Voice Activity Detection (VAD) tracker
        if (calculatedLevel > (this.options.silenceThreshold || 0.02)) {
          this.lastSpokenTime = Date.now();
        }
      } else if (this.state === 'speaking' && this.speakerAnalyserNode && this.speakerDataArray) {
        this.speakerAnalyserNode.getByteFrequencyData(this.speakerDataArray);
        activeFrequencyData = this.speakerDataArray;
        source = 'speaker';

        let sum = 0;
        for (let i = 0; i < this.speakerDataArray.length; i++) {
          sum += this.speakerDataArray[i];
        }
        calculatedLevel = Math.min(1.0, (sum / this.speakerDataArray.length) / 110);
      } else if (this.state === 'processing') {
        // Subtle simulated rhythmic wave for thinking state
        calculatedLevel = 0.2 + 0.15 * Math.sin(Date.now() / 180);
      } else {
        calculatedLevel = 0.05 * Math.sin(Date.now() / 600); // Ambient breath
      }

      this.options.onAudioLevel?.({
        level: Math.max(0, calculatedLevel),
        frequencyData: activeFrequencyData,
        source,
      });
    };

    renderLoop();
  }

  private stopVisualizerLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Browser Speech Recognition with Burmese Priority
   */
  private startSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[AudioEngine] SpeechRecognition is not supported in this browser.');
      return;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Set to Burmese (my-MM) by default, or user preferred language
    recognition.lang = this.options.preferredLanguage || 'my-MM';

    recognition.onstart = () => {
      this.isRecognitionActive = true;
      this.currentTranscript = '';
      this.lastSpokenTime = Date.now();
      this.startSilenceDetector();
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      const activeText = (final || interim).trim();
      if (activeText) {
        this.currentTranscript = activeText;
        this.lastSpokenTime = Date.now();
        this.options.onTranscript?.(activeText, Boolean(final));
      }
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' is normal when quiet; ignore
      if (event.error !== 'no-speech') {
        console.warn('[AudioEngine] Recognition error:', event.error);
        // If Burmese is not recognized on an older browser engine, fallback to en-US or multilingual
        if (event.error === 'language-not-supported' && recognition.lang === 'my-MM') {
          console.info('[AudioEngine] my-MM not supported, falling back to en-US');
          recognition.lang = 'en-US';
        }
      }
    };

    recognition.onend = () => {
      this.isRecognitionActive = false;
      // If we are still in listening mode, automatically restart to keep hands-free active
      if (this.state === 'listening') {
        try {
          recognition.start();
        } catch {}
      }
    };

    try {
      recognition.start();
      this.recognition = recognition;
    } catch (e) {
      console.warn('[AudioEngine] Could not start speech recognition:', e);
    }
  }

  /**
   * Silence detector: automatically triggers onSpeechEnd when user finishes sentence
   */
  private startSilenceDetector(): void {
    if (this.silenceCheckTimer) clearInterval(this.silenceCheckTimer);

    const checkInterval = 250;
    const requiredSilence = this.options.silenceDurationMs || 1400;

    this.silenceCheckTimer = setInterval(() => {
      if (this.state !== 'listening') return;

      const elapsedSinceVoice = Date.now() - this.lastSpokenTime;
      if (this.currentTranscript.trim().length > 0 && elapsedSinceVoice >= requiredSilence) {
        const finalPhrase = this.currentTranscript.trim();
        this.currentTranscript = '';
        this.stopListening();
        this.setState('processing');
        this.options.onSpeechEnd?.(finalPhrase);
      }
    }, checkInterval);
  }

  /**
   * Speaker Playback Queue: Enqueue binary audio buffer (MP3/WAV/PCM)
   */
  public async enqueueAudio(audioData: ArrayBuffer | Uint8Array): Promise<void> {
    try {
      const ctx = await this.ensureAudioContext();
      this.setupSpeakerPipeline(ctx);

      const arrayBuffer = audioData instanceof Uint8Array ? audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) : audioData;
      
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      this.playbackQueue.push(audioBuffer);

      if (!this.isPlayingQueue) {
        this.playNextInQueue();
      }
    } catch (err) {
      console.error('[AudioEngine] Failed to decode audio buffer for playback:', err);
    }
  }

  /**
   * Plays the next AudioBuffer in the speaker queue sequentially
   */
  private playNextInQueue(): void {
    if (this.playbackQueue.length === 0) {
      this.isPlayingQueue = false;
      this.currentSourceNode = null;
      if (this.state === 'speaking') {
        this.setState('idle');
      }
      return;
    }

    this.isPlayingQueue = true;
    this.setState('speaking');

    const nextBuffer = this.playbackQueue.shift()!;
    if (!this.audioContext || !this.speakerGainNode) return;

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = nextBuffer;
      source.connect(this.speakerGainNode);

      source.onended = () => {
        if (this.currentSourceNode === source) {
          this.playNextInQueue();
        }
      };

      this.currentSourceNode = source;
      source.start(0);
    } catch (err) {
      console.error('[AudioEngine] Error playing audio buffer:', err);
      this.playNextInQueue();
    }
  }

  /**
   * Barge-In / Interruption: Stops all speaking immediately & clears queues
   */
  public interrupt(): void {
    // 1. Clear Web Audio buffer queue
    this.playbackQueue = [];
    if (this.currentSourceNode) {
      try {
        // Micro-fadeout using GainNode to prevent audio click/pop
        if (this.speakerGainNode && this.audioContext) {
          const now = this.audioContext.currentTime;
          this.speakerGainNode.gain.setValueAtTime(this.speakerGainNode.gain.value, now);
          this.speakerGainNode.gain.linearRampToValueAtTime(0.001, now + 0.04);
        }
        this.currentSourceNode.stop();
      } catch {}
      this.currentSourceNode = null;
    }
    this.isPlayingQueue = false;

    // 2. Stop Browser SpeechSynthesis if active
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (this.synthIntervalId) {
      clearInterval(this.synthIntervalId);
      this.synthIntervalId = null;
    }

    if (this.state === 'speaking') {
      this.setState('idle');
    }
  }

  /**
   * Speak Text in Burmese (prioritizing Server Neural TTS, with Web Speech API fallback)
   */
  public async speakText(text: string): Promise<void> {
    // Sanitize markdown and special asterisks for clean vocal pronunciation
    const cleanSpeechText = text
      .replace(/[*#_`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanSpeechText) return;

    // Barge-in prior playback
    this.interrupt();
    this.setState('speaking');

    // Attempt 1: Call server Neural TTS endpoint
    try {
      const response = await authenticatedFetch('/api/voice-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanSpeechText.slice(0, 4000),
          language: 'my',
          voice: 'nova', // Warm, articulate assistant voice
        }),
      });

      if (response.ok && response.headers.get('content-type')?.includes('audio/')) {
        const audioData = await response.arrayBuffer();
        if (audioData && audioData.byteLength > 0) {
          await this.enqueueAudio(audioData);
          return;
        }
      }
    } catch (err) {
      console.info('[AudioEngine] Server TTS route unavailable or returned error, using SpeechSynthesis fallback:', err);
    }

    // Attempt 2: Fallback to high-fidelity Browser SpeechSynthesis
    this.speakViaSpeechSynthesis(cleanSpeechText);
  }

  /**
   * Browser SpeechSynthesis Fallback with Burmese pronunciation support
   */
  private speakViaSpeechSynthesis(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.setState('idle');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Select best available voice (Burmese or polite Asian/multilingual voice)
    const voices = window.speechSynthesis.getVoices();
    const myanmarVoice = voices.find(
      (v) => v.lang.toLowerCase().includes('my') || v.name.toLowerCase().includes('burma') || v.name.toLowerCase().includes('myanmar')
    );
    const googleVoice = voices.find(
      (v) => v.name.includes('Google') && (v.lang.startsWith('en') || v.lang.startsWith('th'))
    );

    if (myanmarVoice) {
      utterance.voice = myanmarVoice;
      utterance.lang = myanmarVoice.lang;
    } else {
      // Fallback voice options
      utterance.lang = 'my-MM';
      if (googleVoice) utterance.voice = googleVoice;
    }

    utterance.rate = 0.95; // Slightly measured rate for clear mobile specs & numbers
    utterance.pitch = 1.0;

    // Simulate audio level for the visualizer while speaking via SpeechSynthesis
    utterance.onstart = () => {
      this.setState('speaking');
      if (this.synthIntervalId) clearInterval(this.synthIntervalId);
      this.synthIntervalId = setInterval(() => {
        if (this.state === 'speaking') {
          const fakeFreq = new Uint8Array(32);
          for (let i = 0; i < fakeFreq.length; i++) {
            fakeFreq[i] = Math.floor(60 + Math.random() * 120);
          }
          this.options.onAudioLevel?.({
            level: 0.4 + Math.random() * 0.45,
            frequencyData: fakeFreq,
            source: 'speaker',
          });
        }
      }, 70);
    };

    utterance.onend = () => {
      if (this.synthIntervalId) {
        clearInterval(this.synthIntervalId);
        this.synthIntervalId = null;
      }
      this.setState('idle');
    };

    utterance.onerror = () => {
      if (this.synthIntervalId) {
        clearInterval(this.synthIntervalId);
        this.synthIntervalId = null;
      }
      this.setState('idle');
    };

    this.synthUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Update internal state and fire callbacks
   */
  public setState(newState: AudioEngineState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange?.(newState);
    }
  }

  public getState(): AudioEngineState {
    return this.state;
  }

  public setPreferredLanguage(lang: string): void {
    this.options.preferredLanguage = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  /**
   * Clean destruction
   */
  public destroy(): void {
    this.stopListening();
    this.interrupt();
    this.stopVisualizerLoop();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
