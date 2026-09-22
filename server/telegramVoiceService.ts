import OpenAI from 'openai';

/**
 * Downloads a file (e.g. voice note .oga/.ogg) from Telegram API
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string
): Promise<{ buffer: Buffer; filePath: string; mimeType: string }> {
  // Step 1: Call getFile to retrieve the Telegram file path
  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const fileInfoRes = await fetch(getFileUrl);
  const fileInfo = (await fileInfoRes.json()) as any;

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error(
      `Telegram getFile failed: ${fileInfo.description || 'Could not locate audio file on Telegram servers'}`
    );
  }

  const filePath: string = fileInfo.result.file_path;

  // Step 2: Download raw binary stream from Telegram
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download audio file from Telegram: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const isOgg = filePath.endsWith('.oga') || filePath.endsWith('.ogg');
  const mimeType = isOgg ? 'audio/ogg' : 'audio/mpeg';

  return {
    buffer,
    filePath,
    mimeType,
  };
}

/**
 * Transcribes audio using Gemini Multimodal Audio (gemini-flash-latest).
 * Gemini provides exceptional accuracy for Myanmar (Burmese) spoken language
 * as well as mixed Burmese + English phone model names and numbers.
 */
export async function transcribeVoiceWithGemini(
  getGenAI: () => any,
  audioBuffer: Buffer,
  mimeType: string = 'audio/ogg'
): Promise<string> {
  const genAI = getGenAI();
  const response = await genAI.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/ogg',
              data: audioBuffer.toString('base64'),
            },
          },
          {
            text: 'You are an accurate speech-to-text transcriber for a retail mobile shop and POS system in Myanmar. Transcribe the spoken audio message verbatim. The user may speak Myanmar language (Burmese), English, or mixed (Burmese speech with English device model names like "iPhone 15", "Redmi 9a", "Z-Report", "Price", "Stock"). Return ONLY the exact transcribed text as plain text. Do not add quotes, brackets, commentary, or translation.',
          },
        ],
      },
    ],
  });

  return (response.text || '').trim();
}

/**
 * Fallback audio transcription using OpenAI Whisper (whisper-1).
 */
export async function transcribeVoiceWithWhisper(
  openai: OpenAI,
  audioBuffer: Buffer,
  filename = 'voice_note.ogg'
): Promise<string> {
  // Using native global File in Node.js 20+
  const file = new File([audioBuffer], filename, { type: 'audio/ogg' });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });

  return (transcription.text || '').trim();
}
