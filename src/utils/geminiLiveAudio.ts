/**
 * Utility functions and classes for Gemini Live API PCM audio conversion,
 * 16kHz microphone capture, and 24kHz Web Audio API playback.
 */

// Convert 32-bit float audio samples to 16-bit PCM (little-endian)
export function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true); // true = little-endian
  }
  return buffer;
}

// Convert ArrayBuffer into base64 string
export function base64EncodeArrayBuffer(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 encoded 16-bit PCM little-endian data to Float32Array
export function base64DecodeToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const dataView = new DataView(bytes.buffer);
  const sampleCount = Math.floor(len / 2);
  const float32 = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = dataView.getInt16(i * 2, true); // little-endian
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return float32;
}

// Downsample audio buffer to 16000 Hz if hardware uses 44.1kHz / 48kHz
export function downsampleTo16k(
  buffer: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Audio Player for Gemini Live 24kHz PCM output.
 * Handles gapless scheduled playback, instant interruption (barge-in), and volume analysis.
 */
export class GeminiLiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  constructor() {
    this.initContext();
  }

  private initContext() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      // gemini-3.8-live outputs raw PCM at 24,000 Hz
      this.ctx = new AudioContextClass({ sampleRate: 24000 });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch (e) {
      console.error('[Gemini Live Player] AudioContext initialization failed:', e);
    }
  }

  public async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Queue and immediately schedule a 24kHz PCM audio chunk for gapless playback
   */
  public playChunk(base64Data: string) {
    if (!this.ctx || !this.gainNode) {
      this.initContext();
    }
    if (!this.ctx || !this.gainNode) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const float32Samples = base64DecodeToFloat32Array(base64Data);
      if (float32Samples.length === 0) return;

      const audioBuffer = this.ctx.createBuffer(1, float32Samples.length, 24000);
      audioBuffer.copyToChannel(float32Samples, 0);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      const now = this.ctx.currentTime;
      const startTime = Math.max(now, this.nextStartTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);

      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
      };
    } catch (err) {
      console.error('[Gemini Live Player] Error playing chunk:', err);
    }
  }

  /**
   * Barge-in handler: Instantly interrupt and stop current model speech playback
   */
  public interrupt() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // ignore already stopped sources
      }
    }
    this.activeSources = [];
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }
  }

  public getVolumeLevel(): number {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / (dataArray.length * 255);
  }

  public isPlaying(): boolean {
    return this.activeSources.length > 0;
  }

  public close() {
    this.interrupt();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

/**
 * Microphone Recorder for Gemini Live 16kHz PCM streaming.
 * Requests mic permissions, captures audio, downsamples to 16kHz PCM,
 * and streams base64 chunks through a callback.
 */
export class GeminiLiveAudioRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onAudioChunk: ((base64Pcm: string, volume: number) => void) | null = null;
  private isRecording: boolean = false;

  constructor(onAudioChunk: (base64Pcm: string, volume: number) => void) {
    this.onAudioChunk = onAudioChunk;
  }

  public async start(): Promise<void> {
    if (this.isRecording) return;

    // Request high-clarity voice audio stream
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);

    // Audio volume analysis for waveform UI
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;

    // Buffer size 2048 gives low latency (~46ms at 44.1k or ~128ms at 16k)
    this.processorNode = this.ctx.createScriptProcessor(2048, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputChannelData = e.inputBuffer.getChannelData(0);

      // Measure volume RMS
      let sumSquares = 0;
      for (let i = 0; i < inputChannelData.length; i++) {
        sumSquares += inputChannelData[i] * inputChannelData[i];
      }
      const rms = Math.sqrt(sumSquares / inputChannelData.length);
      const volumeLevel = Math.min(1, rms * 4); // Scale for visual meter

      // Resample down to 16,000 Hz if needed
      const pcm16kFloat32 = downsampleTo16k(inputChannelData, this.ctx!.sampleRate);
      const pcm16BitBuffer = floatTo16BitPCM(pcm16kFloat32);
      const base64Chunk = base64EncodeArrayBuffer(pcm16BitBuffer);

      if (this.onAudioChunk) {
        this.onAudioChunk(base64Chunk, volumeLevel);
      }
    };

    this.sourceNode.connect(this.analyser);
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.ctx.destination);

    this.isRecording = true;
  }

  public getVolumeLevel(): number {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / (dataArray.length * 255);
  }

  public stop(): void {
    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch (e) {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {}
      this.analyser = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.stream = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch (e) {}
      this.ctx = null;
    }
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}
