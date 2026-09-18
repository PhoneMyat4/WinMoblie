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
  enableWebSearch?: boolean;
  model?: string;
  fallbackGenerator?: () => string;
}

export interface TextGenerationResult {
  text: string;
  engine: string;
  provider: 'openai' | 'gemini' | 'fallback';
}

/**
 * Strips citation artifacts, code fences, and conversational preamble from generated copy.
 */
export function formatResponsesOutput(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText;

  // 1. Strip markdown web search citation links: ([domain.com](url)), [domain.com](url), ([domain.com])
  cleaned = cleaned.replace(/\(\[.*?\]\(https?:\/\/[^\s)]+\)\)/g, '');
  cleaned = cleaned.replace(/\[.*?\]\(https?:\/\/[^\s)]+\)/g, '');
  cleaned = cleaned.replace(/\(\[.*?\]\)/g, '');
  cleaned = cleaned.replace(/\[\d+\]/g, ''); // Numeric footnote citations like [1]

  // 2. Remove markdown code fences if wrapped
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  }

  // 3. Remove conversational preamble like "Here is the Facebook post:"
  cleaned = cleaned.replace(
    /^(?:Here (?:is|are) (?:the|a) (?:Facebook|social media|promotional|ad) (?:post|copy|caption):?|Sure!? Here(?:'s| is) (?:your|the) (?:Facebook|ad|copy|post):?)\s*\n+/i,
    ''
  );

  // 4. Normalize spacing and remove trailing whitespaces
  cleaned = cleaned
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Handles the multi-step agentic loop for OpenAI Responses API with built-in tools like web_search.
 */
export async function executeOpenAiResponseAgenticLoop(params: {
  client: OpenAI;
  model?: string;
  instructions?: string;
  input: string;
  enableWebSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const {
    client,
    model = 'gpt-4o-mini',
    instructions = 'You are an intelligent retail point-of-sale business assistant.',
    input,
    enableWebSearch = false,
    temperature = 0.7,
    maxTokens = 1500,
  } = params;

  const tools: OpenAI.Responses.Tool[] = [];
  if (enableWebSearch) {
    tools.push({ type: 'web_search' });
  }

  // Step 1: Initial call with client.responses.create()
  let response = await client.responses.create({
    model,
    instructions,
    input,
    tools: tools.length > 0 ? tools : undefined,
    temperature,
    max_output_tokens: maxTokens,
  });

  // Step 2: Multi-step agentic loop if status is in_progress
  let loopCount = 0;
  const maxLoops = 8;
  while (response.status === 'in_progress' && loopCount < maxLoops) {
    loopCount++;
    await new Promise((resolve) => setTimeout(resolve, 800));
    response = await client.responses.retrieve(response.id);
  }

  // Step 3: Extract clean text from output_text or message output items
  let extractedText = response.output_text?.trim() || '';
  if (!extractedText && Array.isArray(response.output)) {
    for (const item of response.output) {
      if ((item as any).type === 'message' && Array.isArray((item as any).content)) {
        for (const part of (item as any).content) {
          if (part.type === 'output_text' && part.text) {
            extractedText += part.text;
          } else if (typeof part.text === 'string') {
            extractedText += part.text;
          }
        }
      }
    }
  }

  if (!extractedText && response.error) {
    throw new Error(response.error.message || `OpenAI Responses API error: ${response.status}`);
  }

  return formatResponsesOutput(extractedText);
}

/**
 * Centralized AI Text Generation with automatic fallback between OpenAI (Responses API) and Gemini.
 */
export async function generateTextWithAiFallback(
  options: TextGenerationOptions
): Promise<TextGenerationResult> {
  const {
    userPrompt,
    systemPrompt = 'You are an intelligent retail point-of-sale business assistant.',
    temperature = 0.7,
    maxTokens = 1200,
    preferProvider = 'openai',
    enableWebSearch = false,
    fallbackGenerator,
  } = options;

  const tryOpenAI = async (): Promise<TextGenerationResult | null> => {
    if (!process.env.OPENAI_API_KEY) return null;
    const targetModel = options.model?.trim() || 'gpt-4o-mini';
    try {
      const client = getServerOpenAI();
      const text = await executeOpenAiResponseAgenticLoop({
        client,
        model: targetModel,
        instructions: systemPrompt,
        input: userPrompt,
        enableWebSearch,
        temperature,
        maxTokens,
      });

      if (text) {
        return {
          text,
          engine: enableWebSearch
            ? `OpenAI Responses API (${targetModel} + Web Search)`
            : `OpenAI Responses API (${targetModel})`,
          provider: 'openai',
        };
      }
    } catch (err: any) {
      console.warn(`[AIFallback] OpenAI Responses API failed for model ${targetModel} (${err?.message || err}). Falling back...`);
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
