import OpenAI, { toFile } from 'openai';

export type VoiceOption = 'nova' | 'alloy' | 'shimmer' | 'echo' | 'onyx' | 'fable';

export interface SynthesizeSpeechOptions {
  text: string;
  voice?: VoiceOption;
  speed?: number;
  language?: 'burmese' | 'english' | 'bilingual';
}

export interface TranscribeAudioOptions {
  audioBase64: string;
  mimeType?: string;
  language?: string;
}

/**
 * Strips markdown symbols, code blocks, bullet markers, and emojis
 * to produce clean, natural spoken speech for Burmese (မြန်မာစာ) and English.
 */
export function cleanTextForSpeech(rawText: string, maxChars = 450): string {
  if (!rawText) return '';
  let text = rawText;

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]*`/g, '');

  // Remove markdown headings (#, ##, etc.)
  text = text.replace(/#{1,6}\s*/g, '');

  // Remove bold / italic markdown formatting
  text = text.replace(/(\*\*|\*|__|_)/g, '');

  // Convert markdown links [title](url) to title
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove bullet points / dash markers at line beginnings
  text = text.replace(/^[\s*•-]+\s*/gm, '');

  // Remove square brackets citations like [1], [CONFIDENTIAL]
  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/\[CONFIDENTIAL[^\]]*\]/gi, '');

  // Remove emojis to prevent strange spoken descriptions
  text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

  // Replace multiple newlines with natural pauses
  text = text.replace(/\n{2,}/g, '. ');
  text = text.replace(/\n/g, ', ');
  text = text.replace(/\s{2,}/g, ' ').trim();

  // Truncate to maxChars on sentence boundary for conversational voice brevity
  if (text.length > maxChars) {
    const slice = text.slice(0, maxChars);
    const lastPunctuation = Math.max(
      slice.lastIndexOf('.'),
      slice.lastIndexOf('။'),
      slice.lastIndexOf('!'),
      slice.lastIndexOf('?')
    );
    if (lastPunctuation > 120) {
      text = slice.slice(0, lastPunctuation + 1);
    } else {
      text = slice.trim() + '...';
    }
  }

  return text;
}

/**
 * Synthesizes high-fidelity speech audio using OpenAI's tts-1 neural engine.
 */
export async function synthesizeSpeech(
  openai: OpenAI,
  options: SynthesizeSpeechOptions
): Promise<{ audioBase64: string; mimeType: string; cleanSpokenText: string }> {
  const cleanSpokenText = cleanTextForSpeech(options.text);
  if (!cleanSpokenText) {
    throw new Error('No speakable text provided for synthesis.');
  }

  const voice: VoiceOption = options.voice || 'nova';
  const speed = options.speed || 1.05;

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice,
    input: cleanSpokenText,
    speed,
    response_format: 'mp3',
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const audioBase64 = buffer.toString('base64');

  return {
    audioBase64,
    mimeType: 'audio/mpeg',
    cleanSpokenText,
  };
}

/**
 * Transcribes audio using OpenAI Whisper (whisper-1), with Burmese (my) language prioritization.
 */
export async function transcribeAudio(
  openai: OpenAI,
  options: TranscribeAudioOptions
): Promise<{ transcript: string }> {
  if (!options.audioBase64) {
    throw new Error('No audio data provided for transcription.');
  }

  // Strip possible data URI header
  const base64Data = options.audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const mimeType = options.mimeType || 'audio/webm';
  const extension = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : mimeType.includes('wav') ? 'wav' : 'webm';
  const file = await toFile(buffer, `voice_input.${extension}`, { type: mimeType });

  const targetLang = options.language === 'english' ? 'en' : options.language === 'burmese' ? 'my' : undefined;

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: targetLang,
    temperature: 0.2,
  });

  return {
    transcript: transcription.text || '',
  };
}
