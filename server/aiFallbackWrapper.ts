import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

let cachedGenAI: GoogleGenAI | null = null;
let cachedOpenAI: OpenAI | null = null;

export function getServerGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment variables.');
  }
  if (!cachedGenAI) {
    cachedGenAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-pos-backend',
        },
      },
    });
  }
  return cachedGenAI;
}

export function getServerOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured in server environment variables.');
  }
  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({
      apiKey,
    });
  }
  return cachedOpenAI;
}

export interface TextGenerationOptions {
  userPrompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  preferProvider?: 'openai' | 'gemini';
  fallbackGenerator?: () => string;
}

export interface TextGenerationResult {
  text: string;
  engine: string;
  provider: 'openai' | 'gemini' | 'fallback';
}

/**
 * Centralized AI Text Generation with automatic fallback between OpenAI and Gemini.
 */
export async function generateTextWithAiFallback(
  options: TextGenerationOptions
): Promise<TextGenerationResult> {
  const {
    userPrompt,
    systemPrompt = 'You are an intelligent retail point-of-sale business assistant.',
    temperature = 0.7,
    maxTokens = 600,
    preferProvider = 'openai',
    fallbackGenerator,
  } = options;

  const tryOpenAI = async (): Promise<TextGenerationResult | null> => {
    if (!process.env.OPENAI_API_KEY) return null;
    try {
      const client = getServerOpenAI();
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature,
        max_tokens: maxTokens,
      });
      const text = completion.choices?.[0]?.message?.content?.trim();
      if (text) {
        return { text, engine: 'OpenAI GPT-4o-mini', provider: 'openai' };
      }
    } catch (err: any) {
      console.warn(`[AIFallback] OpenAI call failed (${err?.message || err}). Falling back...`);
    }
    return null;
  };

  const tryGemini = async (): Promise<TextGenerationResult | null> => {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
      const client = getServerGenAI();
      const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: combinedPrompt,
      });
      const text = response.text?.trim();
      if (text) {
        return { text, engine: 'Google Gemini 2.5 Flash', provider: 'gemini' };
      }
    } catch (err: any) {
      console.warn(`[AIFallback] Gemini call failed (${err?.message || err}). Falling back...`);
    }
    return null;
  };

  // Primary attempt based on preference
  if (preferProvider === 'openai') {
    const res = await tryOpenAI();
    if (res) return res;
    const geminiRes = await tryGemini();
    if (geminiRes) return geminiRes;
  } else {
    const res = await tryGemini();
    if (res) return res;
    const openAiRes = await tryOpenAI();
    if (openAiRes) return openAiRes;
  }

  // If both fail or are unconfigured, run fallback generator if provided
  if (fallbackGenerator) {
    return {
      text: fallbackGenerator(),
      engine: 'Deterministic Retail Rule Engine',
      provider: 'fallback',
    };
  }

  throw new Error('All AI providers (OpenAI & Gemini) failed or are unconfigured in .env');
}

export interface VisionExtractionOptions {
  imageBase64: string;
  mimeType?: string;
  prompt: string;
  systemPrompt?: string;
}

export interface VisionExtractionResult {
  text: string;
  engine: string;
  provider: 'gemini' | 'openai';
}

/**
 * Centralized Multimodal Vision AI Extraction with automatic fallback between Gemini and OpenAI.
 */
export async function extractVisionWithAiFallback(
  options: VisionExtractionOptions
): Promise<VisionExtractionResult> {
  const { imageBase64, mimeType = 'image/jpeg', prompt, systemPrompt } = options;

  let cleanBase64 = imageBase64;
  if (cleanBase64.includes(';base64,')) {
    cleanBase64 = cleanBase64.split(';base64,')[1];
  }

  // 1. Try Gemini Vision first (Gemini 2.5/3.7 Flash)
  if (process.env.GEMINI_API_KEY) {
    try {
      const client = getServerGenAI();
      const parts: any[] = [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
        },
      ];

      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
      });

      const text = response.text?.trim();
      if (text) {
        return {
          text,
          engine: 'Google Gemini 2.5 Flash Vision',
          provider: 'gemini',
        };
      }
    } catch (geminiErr: any) {
      console.warn(`[AIFallback] Gemini Vision failed (${geminiErr?.message || geminiErr}). Trying OpenAI Vision...`);
    }
  }

  // 2. Fallback to OpenAI Vision (GPT-4o-mini)
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = getServerOpenAI();
      const imageUrl = `data:${mimeType};base64,${cleanBase64}`;
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ];

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 800,
      });

      const text = completion.choices?.[0]?.message?.content?.trim();
      if (text) {
        return {
          text,
          engine: 'OpenAI GPT-4o-mini Vision',
          provider: 'openai',
        };
      }
    } catch (openAiErr: any) {
      console.warn(`[AIFallback] OpenAI Vision failed (${openAiErr?.message || openAiErr}).`);
    }
  }

  throw new Error('Vision extraction failed: Neither Gemini nor OpenAI could process the image. Please verify your .env API keys.');
}
