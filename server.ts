import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import { setupGeminiLiveWebSocket } from './server/geminiLiveService';
import { 
  openAiAssistantTools, 
  AI_SYSTEM_INSTRUCTION, 
  executeQueryPosReports, 
  executeAddInventoryItem,
  executeUpdateProductPrice,
  executeQueryInventoryProducts,
  executeGeneratePdfReport
} from './server/aiAssistant';
import {
  executePostProductAdToFacebook,
  testFacebookConnection,
  findProductForAd,
  generateSocialAdCaption,
  generateSocialAdImage,
  publishPhotoToFacebook
} from './server/facebookPostService';
import { FacebookAdPostRecord } from './src/types';
import { detectProductKind, isPhoneProduct, buildProductVisualPrompt } from './src/data/categoryTaxonomy';
import { generateTextWithAiFallback, formatResponsesOutput, executeOpenAiResponseAgenticLoop } from './server/aiFallbackWrapper';
import {
  handleTelegramWebhook,
  handleSetupTelegramWebhook,
  handleTelegramWebhookInfo,
} from './server/telegramBot';
import { archiveSalesData, listArchivedFiles } from './server/archiveService';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON payload parser for base64 image data (hardened 5MB limit to prevent DoS attacks)
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Simple token-based API authentication middleware for all /api/* routes
  const VALID_API_TOKENS = new Set(
    [
      process.env.API_AUTH_TOKEN,
      process.env.VITE_API_TOKEN,
      'pos_sec_token_9938148',
    ]
      .filter(Boolean)
      .map((t) => String(t).trim())
  );

  app.use('/api', (req, res, next) => {
    // Whitelist health check, live voice endpoint, and direct Telegram webhook integration endpoints
    if (
      req.path === '/health' ||
      req.path === '/live' ||
      req.path === '/live/status' ||
      req.path === '/webhook/telegram' ||
      req.path === '/setup-telegram-webhook' ||
      req.path === '/telegram-webhook-info'
    ) {
      return next();
    }

    const rawProvided = req.headers['x-api-key'] || (req.headers['authorization']?.replace(/^Bearer\s+/i, ''));
    const providedToken = typeof rawProvided === 'string' ? rawProvided.trim() : '';

    if (!providedToken || !VALID_API_TOKENS.has(providedToken)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing API security token.',
      });
    }
    next();
  });

  // Initialize Gemini client lazily (exclusively reading from process.env)
  let aiClient: GoogleGenAI | null = null;
  function getGenAI(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured in .env.');
    }
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return aiClient;
  }

  // Initialize OpenAI client lazily for AI Copilot (exclusively reading from process.env)
  let openAiClient: OpenAI | null = null;
  function getOpenAI(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not configured in .env.');
    }
    if (!openAiClient) {
      openAiClient = new OpenAI({
        apiKey,
      });
    }
    return openAiClient;
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date().toISOString(),
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Live Voice API info & HTTP probe endpoint
  app.get(['/api/live', '/api/live/status'], (req, res) => {
    res.json({
      status: 'ok',
      service: 'gemini-3.8-live',
      websocketPath: '/api/live',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      time: new Date().toISOString(),
    });
  });

  // In-memory State Store for Periodic localStorage-to-Server and Multi-Tab Synchronization
  let serverStateSnapshot: Record<string, any> | null = null;
  let lastServerStateTimestamp = 0;
  let lastUpdatingTabId = '';

  // GET /api/sync-state - Check if server has newer state or fetch current state
  app.get('/api/sync-state', (req, res) => {
    const since = Number(req.query.since) || 0;
    
    if (serverStateSnapshot && lastServerStateTimestamp > since) {
      return res.json({
        success: true,
        hasUpdates: true,
        serverTimestamp: lastServerStateTimestamp,
        lastUpdatingTabId,
        data: serverStateSnapshot,
      });
    }

    return res.json({
      success: true,
      hasUpdates: false,
      serverTimestamp: lastServerStateTimestamp,
      lastUpdatingTabId,
      data: null,
    });
  });

  // POST /api/sync-state - Push latest localStorage state snapshot from client tab to server
  app.post('/api/sync-state', (req, res) => {
    try {
      const { clientTimestamp, data, clientTabId, isReset } = req.body;
      const incomingTimestamp = Number(clientTimestamp) || Date.now();

      if (isReset) {
        serverStateSnapshot = data && typeof data === 'object' ? { ...data } : null;
        lastServerStateTimestamp = Math.max(incomingTimestamp, Date.now());
        lastUpdatingTabId = clientTabId || 'unknown';

        return res.json({
          success: true,
          updated: true,
          serverTimestamp: lastServerStateTimestamp,
        });
      }

      if (data && typeof data === 'object') {
        // If server has no state yet or client timestamp is newer or equal
        if (!serverStateSnapshot || incomingTimestamp >= lastServerStateTimestamp) {
          serverStateSnapshot = { ...serverStateSnapshot, ...data };
          lastServerStateTimestamp = Math.max(incomingTimestamp, Date.now());
          lastUpdatingTabId = clientTabId || 'unknown';

          return res.json({
            success: true,
            updated: true,
            serverTimestamp: lastServerStateTimestamp,
          });
        } else {
          // Server has newer state, return latest state for client to merge
          return res.json({
            success: true,
            updated: false,
            serverTimestamp: lastServerStateTimestamp,
            hasNewerServerData: true,
            data: serverStateSnapshot,
          });
        }
      }

      return res.status(400).json({ success: false, error: 'Invalid sync payload' });
    } catch (err: any) {
      console.error('Error in /api/sync-state:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Multimodal Vision Extraction for Phone Packaging Boxes and Barcode / IMEI Stickers
  app.post('/api/extract-box-specs', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;

      if (!imageBase64) {
        return res.status(400).json({
          success: false,
          error: 'No image data provided. Please capture or upload a photo of the phone packaging box.',
        });
      }

      // Strip out any data URL prefix if present (e.g. data:image/jpeg;base64,)
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');

      // Chinese phone color dictionary and transliteration helper
      const translateChineseColorToEnglish = (rawColor: string): string => {
        if (!rawColor) return '';
        let c = String(rawColor).trim();
        // Remove common label prefixes like 颜色: / 颜色：
        c = c.replace(/^(颜色|顏色|COLOR|Color|Col)[\s:：]*/i, '').trim();

        const colorMap: Record<string, string> = {
          // Titanium series (iPhone 15/16 Pro, Xiaomi 14/15 Ultra, Galaxy S24/S25 Ultra)
          '原色钛金属': 'Natural Titanium',
          '原色钛': 'Natural Titanium',
          '钛原色': 'Natural Titanium',
          '黑色钛金属': 'Black Titanium',
          '钛黑': 'Titanium Black',
          '白色钛金属': 'White Titanium',
          '钛白': 'Titanium White',
          '蓝色钛金属': 'Blue Titanium',
          '钛蓝': 'Titanium Blue',
          '沙漠钛金属': 'Desert Titanium',
          '沙漠金': 'Desert Sand Gold',
          '沙漠钛': 'Desert Titanium',
          '钛灰色': 'Titanium Gray',
          '钛灰': 'Titanium Gray',
          '钛空银': 'Space Silver',
          '钛银': 'Titanium Silver',

          // Black & Dark tones
          '暗夜黑': 'Midnight Black',
          '子夜黑': 'Midnight Black',
          '幻夜黑': 'Phantom Black',
          '幻影黑': 'Phantom Black',
          '曜石黑': 'Obsidian Black',
          '曜黑': 'Obsidian Black',
          '玄黑': 'Space Black',
          '碳黑': 'Carbon Black',
          '深空黑': 'Space Black',
          '深空黑色': 'Space Black',
          '亮黑': 'Jet Black',
          '墨黑': 'Ink Black',
          '石墨色': 'Graphite',
          '石墨黑': 'Graphite Black',
          '黑色': 'Black',
          '纯黑': 'Pure Black',
          '黑': 'Black',

          // White & Light tones
          '星芒白': 'Starlight White',
          '星光白': 'Starlight White',
          '星光色': 'Starlight',
          '珍珠白': 'Pearl White',
          '冰川白': 'Glacier White',
          '雪山白': 'Snow Mountain White',
          '陶瓷白': 'Ceramic White',
          '云朵白': 'Cloud White',
          '羽砂白': 'Feather Sand White',
          '白色': 'White',
          '纯白': 'Pure White',
          '白': 'White',

          // Gray & Silver tones
          '深空灰': 'Space Gray',
          '深空灰色': 'Space Gray',
          '星空灰': 'Starry Gray',
          '太空银': 'Space Silver',
          '亮银': 'Bright Silver',
          '流光银': 'Liquid Silver',
          '银色': 'Silver',
          '灰色': 'Gray',
          '银': 'Silver',
          '灰': 'Gray',

          // Blue tones
          '远峰蓝': 'Sierra Blue',
          '海湾蓝': 'Bay Blue',
          '海蓝色': 'Ocean Blue',
          '天青蓝': 'Sky Blue',
          '天空蓝': 'Sky Blue',
          '冰川蓝': 'Glacier Blue',
          '冰霜蓝': 'Frost Blue',
          '暮光蓝': 'Twilight Blue',
          '深海蓝': 'Deep Sea Blue',
          '宝石蓝': 'Sapphire Blue',
          '海洋蓝': 'Ocean Blue',
          '幻影蓝': 'Phantom Blue',
          '浅蓝': 'Light Blue',
          '蓝色': 'Blue',
          '深蓝': 'Dark Blue',
          '蓝': 'Blue',

          // Purple tones
          '极光紫': 'Aurora Purple',
          '暮光紫': 'Twilight Purple',
          '暗夜紫': 'Midnight Purple',
          '深紫色': 'Deep Purple',
          '深紫': 'Deep Purple',
          '暗紫': 'Deep Purple',
          '香芋紫': 'Taro Purple',
          '罗兰紫': 'Lavender Purple',
          '紫罗兰': 'Violet Purple',
          '幻影紫': 'Phantom Purple',
          '魅夜紫': 'Phantom Purple',
          '烟雨紫': 'Misty Purple',
          '紫色': 'Purple',
          '紫': 'Purple',

          // Green tones
          '苍岭绿': 'Alpine Green',
          '森林绿': 'Forest Green',
          '橄榄绿': 'Olive Green',
          '翡翠绿': 'Emerald Green',
          '松岭绿': 'Pine Green',
          '薄荷绿': 'Mint Green',
          '草木绿': 'Grass Green',
          '墨绿': 'Dark Green',
          '青色': 'Cyan Green',
          '青绿': 'Teal Green',
          '浅绿': 'Light Green',
          '绿色': 'Green',
          '绿': 'Green',

          // Gold & Rose tones
          '流光金': 'Champagne Gold',
          '土豪金': 'Gold',
          '香槟金': 'Champagne Gold',
          '琥珀金': 'Amber Gold',
          '金色': 'Gold',
          '金': 'Gold',
          '玫瑰金': 'Rose Gold',
          '玫瑰金色': 'Rose Gold',

          // Pink & Coral tones
          '樱花粉': 'Sakura Pink',
          '玫瑰粉': 'Rose Pink',
          '珊瑚粉': 'Coral Pink',
          '粉色': 'Pink',
          '粉': 'Pink',

          // Orange & Yellow tones
          '日落橙': 'Sunset Orange',
          '活力橙': 'Dynamic Orange',
          '珊瑚橙': 'Coral Orange',
          '橙色': 'Orange',
          '橙': 'Orange',
          '柠檬黄': 'Lemon Yellow',
          '明黄色': 'Bright Yellow',
          '黄色': 'Yellow',
          '黄': 'Yellow',

          // Red tones
          '中国红': 'Product Red',
          '烈焰红': 'Flame Red',
          '酒红': 'Burgundy Red',
          '红色': 'Red',
          '红': 'Red',
        };

        // Exact match
        if (colorMap[c]) return colorMap[c];

        // Substring matching for compound names (e.g. "极光紫色", "暗夜黑色")
        for (const [zh, en] of Object.entries(colorMap)) {
          if (c.includes(zh) && zh.length >= 2) {
            return en;
          }
        }

        // If string contains Chinese characters, attempt single character mappings
        if (/[\u4e00-\u9fff]/.test(c)) {
          for (const [zh, en] of Object.entries(colorMap)) {
            if (c.includes(zh)) {
              return en;
            }
          }
        }

        return c;
      };

      // Chinese brand normalizer
      const normalizeBrandName = (rawBrand: string): string => {
        if (!rawBrand) return '';
        const b = String(rawBrand).trim();
        const brandMap: Record<string, string> = {
          '小米': 'Xiaomi',
          '红米': 'Redmi',
          '苹果': 'Apple',
          '华为': 'Huawei',
          '荣耀': 'Honor',
          '三星': 'Samsung',
          '真我': 'Realme',
          '一加': 'OnePlus',
          '魅族': 'Meizu',
          '中兴': 'ZTE',
          '努比亚': 'Nubia',
          '黑鲨': 'Black Shark',
          '联想': 'Lenovo',
          '摩托罗拉': 'Motorola',
          '索尼': 'Sony',
          '传音': 'Tecno',
        };
        for (const [zh, en] of Object.entries(brandMap)) {
          if (b.includes(zh)) return en;
        }
        return b;
      };

      const prompt = `You are an expert mobile phone warehouse intake specialist, multilingual OCR inspector, and phone hardware cataloguer.
Examine this photo of a smartphone retail packaging box or product regulatory barcode sticker label.

Extract the following specifications in ENGLISH with extreme precision:
1. BRAND: The standard English phone manufacturer (e.g. Apple, Samsung, Xiaomi, Redmi, POCO, Google, OnePlus, OPPO, Vivo, Realme, Motorola, Sony, Tecno, Infinix, Nothing, Honor, Huawei). If brand is in Chinese (e.g. 小米, 红米, 苹果, 华为, 荣耀), translate to English ("Xiaomi", "Redmi", "Apple", "Huawei", "Honor").
2. MODEL: The full standard English model name/series (e.g. "Redmi Note 14 Pro 5G", "iPhone 15 Pro Max", "Galaxy S24 Ultra", "Pixel 9 Pro"). If Chinese model text appears (e.g. 红米 Note 14 Pro), convert to official English ("Redmi Note 14 Pro 5G").
3. COLOR: The official color name IN ENGLISH.
   CRITICAL REQUIREMENT FOR COLOR:
   - If the color on the box label is written in Chinese (e.g. 幻夜黑, 暗夜黑, 曜石黑, 子夜黑, 极光紫, 冰川蓝, 钛原色, 原色钛金属, 沙漠金, 星芒白, 翡翠绿, 银色, 深空灰, 苍岭绿, 暮光紫, 浅蓝色, 黑色, 白色, 灰色, 金色), translate or localize it into the official English marketing color moniker (e.g. "Midnight Black", "Obsidian Black", "Aurora Purple", "Glacier Blue", "Natural Titanium", "Desert Titanium", "Starlight White", "Emerald Green", "Space Silver", "Space Gray", "Alpine Green", "Twilight Purple", "Sky Blue", "Black", "White").
   - NEVER return solely Chinese characters in the color field. Output the English color name (e.g., "Midnight Black" or "Aurora Purple").
4. RAM: RAM memory capacity if specified on the box (e.g. "8GB", "12GB", "16GB"). If not indicated (like on iPhones) or absent, set to "-" or empty.
5. ROM: Storage / ROM capacity (e.g. "64GB", "128GB", "256GB", "512GB", "1TB").
6. IMEI1: The 15-digit primary International Mobile Equipment Identity number usually found next to "IMEI 1", "IMEI/MEID", or the primary barcode. Extract numbers only (15 digits). If unreadable or missing, leave empty string "".
7. IMEI2: The secondary 15-digit IMEI number (IMEI 2 or eSIM IMEI) if present on dual-SIM / eSIM boxes.
8. BARCODE: The EAN-13, UPC, or primary product barcode digits.
9. SERIAL NUMBER: The Serial Number (S/N) if printed on the label.
10. CONFIDENCE: Overall assessment of detection accuracy: "high", "medium", "low", or "unreadable".
11. DETECTION NOTES: Any helpful message regarding image clarity, glare, blurred digits, translated Chinese fields, or missing fields (e.g. "IMEI 1 extracted clearly; color translated from Chinese (极光紫) to Aurora Purple").

If the image is blurry, poorly lit, or does not show a phone box/label, set confidence to "low" or "unreadable" and explain in detectionNotes.`;

      let parsedData: any = null;
      let engineUsed = '';

      // Clean IMEI helper
      const cleanImei = (val?: any) => {
        if (!val) return '';
        const str = String(val).trim();
        const digits = str.replace(/[^0-9]/g, '');
        return digits.length >= 14 && digits.length <= 16 ? digits : str;
      };

      // Strategy 1: Try Gemini API
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && !geminiKey.startsWith('AQ.')) {
        try {
          const ai = getGenAI();
          const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  brand: { type: Type.STRING },
                  model: { type: Type.STRING },
                  color: { type: Type.STRING },
                  ram: { type: Type.STRING },
                  rom: { type: Type.STRING },
                  imei1: { type: Type.STRING },
                  imei2: { type: Type.STRING },
                  barcode: { type: Type.STRING },
                  serialNumber: { type: Type.STRING },
                  confidence: { type: Type.STRING },
                  detectionNotes: { type: Type.STRING },
                },
                required: ['brand', 'model', 'color', 'ram', 'rom', 'imei1', 'confidence', 'detectionNotes'],
              },
            },
          });

          if (response.text) {
            parsedData = JSON.parse(response.text.trim());
            engineUsed = 'Gemini 3.7 Vision';
          }
        } catch (geminiError: any) {
          console.warn('Gemini vision extraction failed, falling back to OpenAI Vision:', geminiError?.message || geminiError);
        }
      }

      // Strategy 2: Fallback to OpenAI Vision (GPT-4o-mini)
      if (!parsedData && process.env.OPENAI_API_KEY) {
        try {
          const openai = getOpenAI();
          const aiResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `${prompt}\nRespond strictly with a JSON object containing keys: brand, model, color, ram, rom, imei1, imei2, barcode, serialNumber, confidence, detectionNotes.`,
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Please examine this smartphone box/label photo and extract all hardware specifications, barcodes and IMEIs into the specified JSON format.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${cleanBase64}`,
                    },
                  },
                ],
              },
            ],
            temperature: 0.1,
          });

          const content = aiResponse.choices[0]?.message?.content;
          if (content) {
            parsedData = JSON.parse(content.trim());
            engineUsed = 'AI Vision Engine (GPT-4o-mini)';
          }
        } catch (openaiError: any) {
          console.error('OpenAI vision extraction failed:', openaiError);
          throw new Error(`AI Vision extraction error: ${openaiError?.message || 'OpenAI service unavailable'}`);
        }
      }

      if (!parsedData) {
        throw new Error('AI Vision service is currently unavailable. Please verify your API key in Settings > Secrets or take a clearer photo.');
      }

      const rawColor = (parsedData.color || '').trim();
      const translatedColor = translateChineseColorToEnglish(rawColor);
      const rawBrand = (parsedData.brand || '').trim();
      const normalizedBrand = normalizeBrandName(rawBrand);

      const result = {
        brand: normalizedBrand || rawBrand,
        model: (parsedData.model || '').trim(),
        color: translatedColor || rawColor,
        ram: (parsedData.ram || '').trim(),
        rom: (parsedData.rom || '').trim(),
        imei1: cleanImei(parsedData.imei1),
        imei2: cleanImei(parsedData.imei2),
        barcode: String(parsedData.barcode || '').replace(/[^0-9]/g, '').trim(),
        serialNumber: (parsedData.serialNumber || '').trim(),
        confidence: parsedData.confidence || 'medium',
        detectionNotes: parsedData.detectionNotes || (engineUsed ? `Analyzed with ${engineUsed}` : ''),
      };

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error during box specs extraction:', error);
      let errorMessage = error?.message || 'Unknown server error during image analysis.';
      
      // Clean up raw JSON error messages if any crept through
      if (typeof errorMessage === 'string' && errorMessage.includes('UNAUTHENTICATED')) {
        errorMessage = 'AI Authentication notice: Request had invalid or expired credentials. Please verify your API key in Settings > Secrets.';
      }

      return res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  // Direct Two-Way Telegram Bot Webhook Integration
  app.post('/api/webhook/telegram', (req, res) =>
    handleTelegramWebhook(req, res, getOpenAI, getGenAI)
  );

  app.get('/api/webhook/telegram', (req, res) => {
    res.json({
      status: 'online',
      service: 'Direct Telegram Webhook for Golden Star Mobile POS AI Assistant',
      timestamp: new Date().toISOString(),
      usage: 'Configure your Telegram Bot Webhook to point to POST /api/webhook/telegram',
    });
  });

  app.get('/api/setup-telegram-webhook', handleSetupTelegramWebhook);
  app.post('/api/setup-telegram-webhook', handleSetupTelegramWebhook);
  app.get('/api/telegram-webhook-info', handleTelegramWebhookInfo);

  // Interactive AI Chatbot Assistant with OpenAI Tool Calling (Function Calling)
  app.post('/api/chat-assistant', async (req, res) => {
    try {
      const { message, history = [], context = {}, attachments = [], model } = req.body;

      const userText = typeof message === 'string' ? message.trim() : '';
      if (!userText && (!attachments || attachments.length === 0)) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid user message. Please provide a message or attach a file/photo.',
        });
      }

      // Exclusively read OpenAI API key from server environment
      const targetOpenAiKey = process.env.OPENAI_API_KEY;
      if (!targetOpenAiKey) {
        return res.status(400).json({
          success: false,
          missingApiKey: true,
          error: 'OPENAI_API_KEY is not configured in the server environment (.env). Please configure your server .env to enable the AI Copilot.',
        });
      }

      // Determine active model from request, settings, or server environment
      const requestedModel = typeof model === 'string' ? model.trim() : '';
      const settingsModel = (context?.settings as any)?.secrets?.chatAssistantModel;
      const serverEnvModel = process.env.CHAT_ASSISTANT_MODEL;
      const candidateModel = requestedModel || settingsModel || serverEnvModel || 'gpt-5.6-luna';

      // Accept any valid model string (including gpt-5.6-luna, gpt-5.6-terra, gpt-5.6, gpt-5, o3-mini, etc.)
      const activeModel =
        typeof candidateModel === 'string' && /^[a-zA-Z0-9_.-]+$/.test(candidateModel)
          ? candidateModel
          : 'gpt-5.6-luna';

      const openai = getOpenAI();

      // Format conversation history for OpenAI Chat Completions API
      const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: AI_SYSTEM_INSTRUCTION,
        },
      ];

      // Add prior turns
      for (const item of history) {
        if (!item || !item.content) continue;
        const role: 'user' | 'assistant' = item.role === 'user' ? 'user' : 'assistant';
        formattedMessages.push({
          role,
          content: item.content,
        });
      }

      // Prepare user prompt and attachments for multimodal gpt-4o-mini
      const imageAttachments = (attachments || []).filter((a: any) => 
        a.isImage || 
        (a.type && a.type.startsWith('image/')) || 
        (a.data && a.data.startsWith('data:image/'))
      );
      const fileAttachments = (attachments || []).filter((a: any) => !imageAttachments.includes(a));

      let promptWithFiles = userText;
      if (fileAttachments.length > 0) {
        const fileSections = fileAttachments.map((f: any) => {
          let content = f.textContent || '';
          if (!content && f.data && typeof f.data === 'string') {
            if (f.data.includes('base64,')) {
              try {
                const b64 = f.data.split('base64,')[1];
                content = Buffer.from(b64, 'base64').toString('utf-8');
              } catch {}
            }
          }
          const maxLen = 30000;
          const truncated = content.length > maxLen ? content.slice(0, maxLen) + '\n... [Remaining content truncated]' : content;
          return `\n\n=== ATTACHED FILE: ${f.name || 'document'} (${f.type || 'file'}, ${Math.round((f.size || 0) / 1024)} KB) ===\n${truncated || '[Document attached in non-text format]'}\n=== END ATTACHMENT ===`;
        }).join('');

        promptWithFiles = `${promptWithFiles || 'Please inspect and analyze the attached document(s).'}${fileSections}`.trim();
      }

      // Add current user prompt with vision support
      if (imageAttachments.length > 0) {
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
          {
            type: 'text',
            text: promptWithFiles || 'Please inspect the attached photo/image and assist me with smartphone POS inventory or reporting.',
          },
        ];

        for (const img of imageAttachments) {
          const rawUrl = img.data || img.url || '';
          if (rawUrl) {
            const formattedUrl = rawUrl.startsWith('data:') 
              ? rawUrl 
              : `data:${img.type || 'image/jpeg'};base64,${rawUrl}`;
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: formattedUrl,
                detail: 'high',
              },
            });
          }
        }

        formattedMessages.push({
          role: 'user',
          content: contentParts,
        });
      } else {
        formattedMessages.push({
          role: 'user',
          content: promptWithFiles || 'Hello',
        });
      }

      // Step 1: Initial call with OpenAI Tool Declarations using selected model
      const response = await openai.chat.completions.create({
        model: activeModel,
        messages: formattedMessages,
        tools: openAiAssistantTools,
        tool_choice: 'auto',
        temperature: 0.3,
      });

      const choice = response.choices?.[0];
      const assistantMessage = choice?.message;
      const toolCalls = assistantMessage?.tool_calls;

      // If the model triggered one or more tool calls
      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            console.warn('[AI Assistant] Failed to parse tool arguments:', toolCall.function.arguments);
            parsedArgs = {};
          }

          console.log(`[AI Assistant] Executing OpenAI Function Call: ${functionName} with args:`, parsedArgs);

          let executionResult: any = null;
          let createdProduct: any = null;
          let updatedProduct: any = null;
          let facebookPost: any = null;
          let requiresClientPdfGeneration = false;
          let pdfReportConfig: any = null;

          if (functionName === 'query_pos_reports') {
            executionResult = executeQueryPosReports(parsedArgs, context);
          } else if (functionName === 'generate_pdf_report') {
            const pdfResult = executeGeneratePdfReport(parsedArgs, context);
            executionResult = pdfResult;
            requiresClientPdfGeneration = true;
            pdfReportConfig = {
              reportType: parsedArgs.report_type || pdfResult.reportType,
              date: parsedArgs.date || pdfResult.date,
              year: parsedArgs.year || pdfResult.year,
              dateRange: parsedArgs.date_range,
              imei: parsedArgs.imei,
              title: parsedArgs.title,
              reportName: pdfResult.reportName,
              filename: pdfResult.filename,
              data: pdfResult.data,
              exportPdfOptions: pdfResult.exportPdfOptions || null,
            };
          } else if (functionName === 'add_inventory_item') {
            const mutation = executeAddInventoryItem(parsedArgs, context);
            executionResult = mutation;
            if (mutation.createdProduct) {
              createdProduct = mutation.createdProduct;
            }
          } else if (functionName === 'update_product_price') {
            const updateResult = executeUpdateProductPrice(parsedArgs, context);
            executionResult = updateResult;
            if (updateResult.updatedProduct) {
              updatedProduct = updateResult.updatedProduct;
            }
          } else if (functionName === 'query_inventory_products') {
            executionResult = executeQueryInventoryProducts(parsedArgs, context);
          } else if (functionName === 'post_product_ad_to_facebook') {
            const fbResult = await executePostProductAdToFacebook(parsedArgs, context, openai, getGenAI);
            executionResult = fbResult;
            if (fbResult.facebookPost) {
              facebookPost = fbResult.facebookPost;
            }
          } else {
            executionResult = { error: `Tool ${functionName} is not recognized.` };
          }

          // Step 2: Feed assistant tool call and execution output back to OpenAI for final natural language synthesis
          const followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            ...formattedMessages,
            assistantMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(executionResult),
            },
          ];

          const secondResponse = await openai.chat.completions.create({
            model: activeModel,
            messages: followUpMessages,
            tools: openAiAssistantTools,
            temperature: 0.3,
          });

          const replyText = secondResponse.choices?.[0]?.message?.content || 'Action executed successfully.';

          return res.json({
            success: true,
            reply: replyText,
            modelUsed: activeModel,
            toolExecuted: {
              name: functionName,
              args: parsedArgs,
              result: executionResult,
            },
            createdProduct: createdProduct || null,
            updatedProduct: updatedProduct || null,
            facebookPost: facebookPost || null,
            requiresClientPdfGeneration,
            pdfReportConfig: pdfReportConfig || null,
          });
        }
      }

      // No tool call, standard conversational reply (e.g. asking for missing IMEI or specifications)
      const replyText = assistantMessage?.content || "I'm here to assist with POS reports and inventory intake. How can I help you?";

      return res.json({
        success: true,
        reply: replyText,
        modelUsed: activeModel,
        toolExecuted: null,
        createdProduct: null,
      });
    } catch (error: any) {
      console.error('Error in /api/chat-assistant endpoint:', error);

      let statusCode = 500;
      let userFriendlyError = error?.message || 'Server error communicating with AI Assistant.';
      let isApiKeyMissing = false;
      let isInvalidKey = false;
      let isQuotaExceeded = false;

      if (!process.env.OPENAI_API_KEY || error?.message?.includes('OPENAI_API_KEY')) {
        statusCode = 400;
        isApiKeyMissing = true;
        userFriendlyError = 'OPENAI_API_KEY environment variable is not configured. Please set your OpenAI API key in the environment settings.';
      } else if (error?.status === 401 || error?.code === 'invalid_api_key' || error?.message?.includes('Incorrect API key') || error?.message?.includes('invalid_api_key')) {
        statusCode = 401;
        isInvalidKey = true;
        userFriendlyError = 'Invalid OpenAI API Key. Please verify that your OPENAI_API_KEY is valid in the environment settings.';
      } else if (error?.status === 429 || error?.code === 'insufficient_quota' || error?.message?.includes('quota') || error?.message?.includes('Rate limit')) {
        statusCode = 429;
        isQuotaExceeded = true;
        userFriendlyError = 'OpenAI API quota exceeded or rate limit reached. Please check your OpenAI account billing balance and usage limits.';
      }

      return res.status(statusCode).json({
        success: false,
        error: userFriendlyError,
        missingApiKey: isApiKeyMissing,
        invalidApiKey: isInvalidKey,
        quotaExceeded: isQuotaExceeded,
      });
    }
  });

  // Dedicated endpoint: Post product advertisement to Facebook
  app.post('/api/facebook/post-ad', async (req, res) => {
    try {
      const { productId, productQuery, customAdGoal, tone, imageMode, context } = req.body;
      let openai: OpenAI | null = null;
      try {
        openai = getOpenAI();
      } catch (err) {
        console.warn('[Facebook Direct API] OpenAI client unavailable, will use fallback.');
      }

      const result = await executePostProductAdToFacebook(
        {
          product_id: productId,
          product_query: productQuery,
          custom_ad_goal: customAdGoal,
          tone,
          image_mode: imageMode,
        },
        context || { products: [] },
        openai,
        getGenAI
      );

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Server error publishing advertisement to Facebook.',
      });
    }
  });

  // =========================================================================
  // AUTOMATED SOCIAL MEDIA MARKETING - DEDICATED PIPELINE ENDPOINTS
  // =========================================================================

  // Step 3: AI Copywriting with Few-Shot Competitor Training & Custom Prompts
  app.post('/api/social-marketing/generate-copy', async (req, res) => {
    try {
      const { product, trainingText, promptInstruction, tone = 'exciting_retail', model, settings } = req.body;

      if (!product) {
        return res.status(400).json({ success: false, error: 'Product details are required for ad copywriting.' });
      }

      // Dynamic model selection with fallback default
      const requestedModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'gpt-4o-mini';
      let activeModel = requestedModel;

      const storeName = settings?.shopName || 'Golden Star Mobile';
      const currency = settings?.currencySymbol || 'MMK';
      const hotline = settings?.phone || settings?.whatsappNumber || '09-798123456';
      const address = settings?.address ? `${settings.address}, ${settings.cityCountry || ''}` : 'Yangon, Myanmar';
      const formattedPrice = `${Number(product.sellingPrice || 0).toLocaleString()} ${currency}`;
      const kind = detectProductKind(product);

      let specsLines: string[] = [];
      let persona = `You are an elite retail technology social media copywriter creating high-converting Facebook advertisements for "${storeName}".`;
      let categoryLabel = 'Consumer Electronics / Gadget';
      let featureGuidance = '';
      let negativeRule = '';
      let headlineEmojis = '🔥 📱 ✨';

      switch (kind) {
        case 'charger':
          persona = `You are an elite retail mobile accessories and power charging specialist copywriter creating high-converting Facebook advertisements for "${storeName}".`;
          categoryLabel = 'Fast Wall Charger & Power Adapter (Mobile Accessory)';
          headlineEmojis = '⚡ 🔌 🔋 🚀';
          specsLines = [
            `- Power Output / Model: ${product.model || product.name || 'High-Speed Fast Charging'}`,
            '- High-Speed Charging Protocol: Supports Fast Charging & Power Delivery',
            '- Safety Protection: Multi-circuit protection against overvoltage, overcharging, and extreme heat',
            product.color && product.color !== '-' && product.color.toLowerCase() !== 'standard' ? `- Color: ${product.color}` : null,
            `- Condition: ${(product.condition || 'brand_new').replace(/_/g, ' ')}`,
            `- Official Price: ${formattedPrice}`,
            `- Warranty: ${product.warrantyMonths ? `${product.warrantyMonths} Months Official Warranty` : 'Store Warranty Included'}`,
            `- SKU / Barcode: ${product.sku || product.barcode || '-'}`,
          ].filter(Boolean) as string[];
          featureGuidance = `
- Emphasize rapid battery charging, compact GaN/travel-friendly build, fast heat dissipation, and safety protection.
- Highlight universal compatibility across all smartphones (iPhone, Samsung Galaxy, Xiaomi, etc.) and USB-powered devices.`;
          negativeRule = `
CRITICAL CATEGORY ACCURACY RULE:
THIS PRODUCT IS A FAST CHARGER / ACCESSORY! IT IS NOT A SMARTPHONE!
You are STRICTLY FORBIDDEN from mentioning RAM, Storage/ROM, camera megapixels, zoom, selfie cameras, or smartphone screen displays!
Only write about charging wattage, speed, reliability, build quality, safety, and compatibility.`;
          break;

        case 'cable':
          persona = `You are an elite mobile accessories copywriter for "${storeName}".`;
          categoryLabel = 'High-Speed Charging & Data Cable';
          headlineEmojis = '🔌 ⚡ 🚀';
          specsLines = [
            `- Product: ${product.brand} ${product.model}`,
            '- Features: Fast power delivery, rapid data sync, reinforced braided construction, bend-tested longevity',
            product.color && product.color !== '-' ? `- Color: ${product.color}` : null,
            `- Price: ${formattedPrice}`,
            `- Warranty: ${product.warrantyMonths ? `${product.warrantyMonths} Months Warranty` : 'Store Warranty Included'}`,
          ].filter(Boolean) as string[];
          featureGuidance = '- Emphasize bend resistance, fast data sync, durable connectors, and tangle-free braided coating.';
          negativeRule = 'CRITICAL: THIS IS A CHARGING CABLE! DO NOT mention RAM, ROM, phone cameras, or screens!';
          break;

        case 'power_bank':
          persona = `You are an elite portable power & accessories copywriter for "${storeName}".`;
          categoryLabel = 'High-Capacity Portable Power Bank';
          headlineEmojis = '🔋 ⚡ ✈️';
          specsLines = [
            `- Product: ${product.brand} ${product.model}`,
            '- Features: High-density portable battery, multi-port fast charging, smart safety chip, LED power indicator',
            product.color && product.color !== '-' ? `- Color: ${product.color}` : null,
            `- Price: ${formattedPrice}`,
            `- Warranty: ${product.warrantyMonths ? `${product.warrantyMonths} Months Warranty` : 'Store Warranty Included'}`,
          ].filter(Boolean) as string[];
          featureGuidance = '- Emphasize reliable backup power on the go, multi-device charging, and safe flight travel compliance.';
          negativeRule = 'CRITICAL: THIS IS A POWER BANK! DO NOT mention RAM, ROM, phone cameras, or screens!';
          break;

        case 'audio':
          persona = `You are an elite consumer audio copywriter for "${storeName}".`;
          categoryLabel = 'Wireless Audio / Earbuds / Headphones';
          headlineEmojis = '🎵 🎧 🔊 ✨';
          specsLines = [
            `- Product: ${product.brand} ${product.model}`,
            '- Features: Crystal clear Hi-Fi sound, deep acoustic bass, long battery life with charging case, comfortable fit',
            product.color && product.color !== '-' ? `- Color: ${product.color}` : null,
            `- Price: ${formattedPrice}`,
            `- Warranty: ${product.warrantyMonths ? `${product.warrantyMonths} Months Warranty` : 'Store Warranty Included'}`,
          ].filter(Boolean) as string[];
          featureGuidance = '- Emphasize immersive sound quality, deep bass, battery endurance, and comfortable ergonomic design.';
          negativeRule = 'CRITICAL: THIS IS AN AUDIO PRODUCT! DO NOT mention phone RAM, ROM, or phone cameras!';
          break;

        case 'case_protector':
          categoryLabel = 'Protective Case / Screen Armor';
          headlineEmojis = '🛡️ ✨ 📱';
          specsLines = [
            `- Product: ${product.brand} ${product.model}`,
            '- Features: Military-grade drop protection, raised camera ring, ultra-slim ergonomic tactile grip',
            `- Price: ${formattedPrice}`,
          ];
          featureGuidance = '- Emphasize drop protection, scratch resistance, sleek profile, and lens safety.';
          negativeRule = 'CRITICAL: THIS IS A CASE / PROTECTOR! DO NOT mention internal phone electronics or RAM/ROM!';
          break;

        case 'cookware':
          categoryLabel = 'Kitchen & Home Appliance';
          headlineEmojis = '🍳 🍲 ✨';
          specsLines = [
            `- Product: ${product.brand} ${product.model}`,
            '- Features: Food-grade durable non-stick build, rapid even heating, energy efficient, easy clean',
            `- Price: ${formattedPrice}`,
          ];
          featureGuidance = '- Emphasize cooking speed, non-stick quality, durability, and healthy kitchen preparation.';
          negativeRule = 'CRITICAL: THIS IS COOKWARE! DO NOT mention phone specs!';
          break;

        case 'smartphone':
        default:
          categoryLabel = 'Flagship Smartphone / Mobile Device';
          headlineEmojis = '🔥 📱 ✨ 🚀';
          specsLines = [
            `- Brand & Model: ${product.brand} ${product.model}`,
            `- Full Name: ${product.name}`,
            product.ram && product.ram !== '-' ? `- RAM: ${product.ram}` : null,
            (product.rom || product.storage) && (product.rom !== '-' && product.storage !== '-') ? `- Storage / ROM: ${product.rom || product.storage}` : null,
            product.color && product.color !== '-' && product.color.toLowerCase() !== 'standard' ? `- Color: ${product.color}` : null,
            `- Condition: ${(product.condition || 'brand_new').replace(/_/g, ' ')}`,
            `- Official Price: ${formattedPrice}`,
            `- Warranty: ${product.warrantyMonths ? `${product.warrantyMonths} Months Official Warranty` : 'Store Warranty Included'}`,
            `- SKU / Barcode: ${product.sku || product.barcode || '-'}`,
          ].filter(Boolean) as string[];
          featureGuidance = '- Highlight processing performance, RAM/Storage, camera system, vivid display, and battery.';
          negativeRule = '';
          break;
      }

      // Adapt the professional bilingual tech marketer persona into the Responses API system instructions
      const responsesInstructions = `You are a professional bilingual (Burmese & English) retail tech marketing specialist and senior copywriter for "${storeName}".
${persona}
You specialize in viral, persuasive, high-converting social media promotional product posts for retail tech electronics stores.
You write engaging bilingual copy (Burmese and English) that resonates with shoppers on Facebook, highlighting competitive value, verified hardware specifications, official warranty, and urgent call-to-action.
${negativeRule ? `\n${negativeRule}` : ''}`;

      // User prompt requesting live competitor price/specs research with built-in web_search tool
      let promptInput = `Please search the internet using your built-in web_search tool for the latest competitor prices, current market retail pricing, and key hardware specifications for: "${product.brand} ${product.model || product.name}".

OUR STORE INVENTORY DETAILS:
- Store Name: ${storeName}
- Product Category: ${categoryLabel}
- Brand & Model: ${product.brand} ${product.model}
- Full Name: ${product.name}
${specsLines.join('\n')}
- Our Official Selling Price: ${formattedPrice}
- Condition: ${(product.condition || 'brand_new').replace(/_/g, ' ')}
- Warranty: ${product.warrantyMonths ? `${product.warrantyMonths} Months Official Store Warranty` : 'Store Warranty Included'}
- Hotline / Contact: ${hotline}
- Store Address: ${address}

KEY HIGHLIGHTS TO FOCUS ON:
${featureGuidance}
`;

      if (trainingText && trainingText.trim()) {
        promptInput += `\n\nCOMPETITOR & REFERENCE FEW-SHOT EXAMPLES (Mirror this tone, persuasive structure, and formatting rhythm closely):\n"""\n${trainingText.trim().substring(0, 4000)}\n"""\n`;
      }

      if (promptInstruction && promptInstruction.trim()) {
        promptInput += `\n\nSPECIFIC CAMPAIGN INSTRUCTIONS FROM STORE OPERATOR:\n"${promptInstruction.trim()}"\n`;
      }

      promptInput += `\nDESIRED TONE: ${tone}

AGENTIC TASK INSTRUCTIONS:
1. USE BUILT-IN WEB SEARCH: Look up current retail market pricing, competitor rates, and technical specs for "${product.brand} ${product.model || product.name}".
2. Compare competitor prices with our store's selling price (${formattedPrice}) to formulate an irresistible, high-value deal.
3. Write an engaging, high-converting Facebook promotional advertisement post.

FORMAT REQUIREMENTS:
1. Catchy headline hook with emojis relevant to this product (${headlineEmojis}).
2. Highlight 3-4 key product advantages matching the verified specs and market edge.
3. Clear price callout (${formattedPrice}) with any special offer or discount.
4. Urgency or value callout (limited stock, fast delivery, genuine warranty guarantee).
5. Clear Call to Action (Call ${hotline}, visit store at ${address}, or Send Message on Facebook).
6. 4-6 trending retail hashtags (e.g., #${product.brand.replace(/\s+/g, '')} #${(product.model || '').replace(/[^a-zA-Z0-9]/g, '')} #MyanmarShop #${storeName.replace(/\s+/g, '')}).
Write directly in engaging bilingual (Burmese & English) or fluent English suited for Facebook newsfeed engagement. Do NOT include markdown citation links like ([source](url)), citation footnotes, or conversational chatter; output only the final cleanly formatted advertisement copy.`;

      const deterministicFallback = () => {
        if (kind === 'charger') {
          return `⚡ SPECIAL FAST CHARGER PROMOTION! ⚡\n\n` +
            `🔌 ${product.name} (${product.brand} ${product.model})\n\n` +
            `⚡ Highlights:\n` +
            `• High-Speed Fast Charging Performance\n` +
            `• Multi-Device Intelligent Overvoltage & Thermal Safety\n` +
            `• Ultra-Compact & Travel-Friendly Design\n` +
            `• Universal compatibility across all smartphones & tablets\n\n` +
            `💰 Special Price: ${formattedPrice}\n` +
            (promptInstruction ? `🎁 Campaign Note: ${promptInstruction}\n\n` : '') +
            `🛡️ 100% Genuine with Warranty Guarantee\n` +
            `🚚 Fast Nationwide Delivery Available\n\n` +
            `📞 Hotline: ${hotline}\n` +
            `📍 Store: ${address}\n\n` +
            `#${product.brand} #FastCharger #${product.model} #Accessories #SpecialOffer`;
        } else {
          const phoneSpecs = [
            product.rom || product.storage ? `• Storage: ${product.rom || product.storage}` : null,
            product.ram ? `• RAM: ${product.ram}` : null,
            product.color && product.color !== '-' ? `• Color: ${product.color}` : null,
            `• Condition: ${(product.condition || 'Brand New').replace(/_/g, ' ').toUpperCase()}`,
          ].filter(Boolean).join('\n');

          return `🔥 NEW ARRIVAL SPECIAL PROMOTION! 🔥\n\n✨ ${product.name} (${product.brand} ${product.model})\n\n` +
            `📱 Specs Highlight:\n` +
            `${phoneSpecs}\n\n` +
            `💰 Special Price: ${formattedPrice}\n` +
            (promptInstruction ? `🎁 Campaign Note: ${promptInstruction}\n\n` : '') +
            `🛡️ 100% Genuine with Warranty Guarantee\n` +
            `🚚 Fast Nationwide Delivery Available\n\n` +
            `📞 Hotline: ${hotline}\n` +
            `📍 Store: ${address}\n\n` +
            `#${product.brand} #${product.model} #MobileShop #SpecialOffer`;
        }
      };

      let generatedCopy = '';

      // 1. Primary execution via new OpenAI client.responses.create() with web_search & multi-step agentic loop
      if (process.env.OPENAI_API_KEY) {
        const openai = getOpenAI();
        try {
          generatedCopy = await executeOpenAiResponseAgenticLoop({
            client: openai,
            model: activeModel,
            instructions: responsesInstructions,
            input: promptInput,
            enableWebSearch: true,
            temperature: 0.7,
            maxTokens: 1500,
          });
        } catch (openAiErr: any) {
          console.warn(`[Social Marketing] OpenAI Responses API failed with model ${activeModel} (${openAiErr?.message || openAiErr}). Attempting default fallback...`);
          // If a specific high-tier model like gpt-5 fails or lacks access, retry with standard gpt-4o-mini
          if (activeModel !== 'gpt-4o-mini') {
            try {
              activeModel = 'gpt-4o-mini';
              generatedCopy = await executeOpenAiResponseAgenticLoop({
                client: openai,
                model: activeModel,
                instructions: responsesInstructions,
                input: promptInput,
                enableWebSearch: true,
                temperature: 0.7,
                maxTokens: 1500,
              });
            } catch (retryErr: any) {
              console.warn('[Social Marketing] Fallback to gpt-4o-mini failed:', retryErr?.message || retryErr);
            }
          }
        }
      }

      // 2. Secondary fallback via centralized wrapper or deterministic rule engine
      if (!generatedCopy) {
        try {
          const aiResult = await generateTextWithAiFallback({
            userPrompt: promptInput,
            systemPrompt: responsesInstructions,
            preferProvider: 'openai',
            model: activeModel,
            enableWebSearch: true,
            temperature: 0.7,
            fallbackGenerator: deterministicFallback,
          });
          generatedCopy = aiResult.text;
        } catch {
          generatedCopy = deterministicFallback();
        }
      }

      return res.json({
        success: true,
        caption: generatedCopy.trim(),
        model: activeModel,
      });
    } catch (err: any) {
      console.error('Error in /api/social-marketing/generate-copy:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to generate ad copy.',
      });
    }
  });

  // Step 2: Media Management - Analyze Reference Photo for AI Prompt Optimization
  app.post('/api/social-marketing/analyze-reference-photo', async (req, res) => {
    try {
      const { image, product, settings } = req.body;
      if (!image) {
        return res.status(400).json({ success: false, error: 'Reference image is required.' });
      }

      const defaultPrompt = buildProductVisualPrompt(product || { name: 'Device' });
      const geminiKey = process.env.GEMINI_API_KEY;

      if (!geminiKey || geminiKey.startsWith('AQ.')) {
        return res.json({
          success: true,
          detectedSummary: `Reference photo uploaded for ${product?.brand || ''} ${product?.model || 'Product'}.`,
          suggestedPrompt: defaultPrompt,
        });
      }

      try {
        const ai = getGenAI();
        let mimeType = 'image/jpeg';
        let cleanBase64 = '';

        if (image.startsWith('data:')) {
          const parts = image.split(';base64,');
          mimeType = parts[0].replace('data:', '') || 'image/jpeg';
          cleanBase64 = parts[1] || '';
        } else {
          const imgFetch = await fetch(image);
          const ab = await imgFetch.arrayBuffer();
          cleanBase64 = Buffer.from(ab).toString('base64');
          mimeType = imgFetch.headers.get('content-type') || 'image/jpeg';
        }

        if (!cleanBase64) {
          return res.json({ success: true, suggestedPrompt: defaultPrompt });
        }

        const prompt = `You are an elite commercial advertisement photographer. Analyze this product reference photo for "${product?.brand || ''} ${product?.model || product?.name || 'Device'}".
Extract the exact physical traits shown in this photo (colors, texture, finish, ports, logos, shape).
Output a JSON response with:
1. "productArchetype": exact category type (e.g. "Fast Charger Wall Adapter", "Smartphone", "Wireless Earbuds", "Power Bank", "Braided Cable")
2. "detectedFeatures": string summary of visual physical traits seen
3. "commercialPrompt": a single-paragraph photorealistic commercial advertisement photography prompt (max 65 words) featuring this exact product on an ultra-luxury obsidian pedestal with subtle dramatic rim lighting, soft reflections, 8k resolution.`;

        const resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              { inlineData: { mimeType, data: cleanBase64 } },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = JSON.parse(resp.text || '{}');
        return res.json({
          success: true,
          productArchetype: parsed.productArchetype,
          detectedFeatures: parsed.detectedFeatures,
          suggestedPrompt: parsed.commercialPrompt || defaultPrompt,
        });
      } catch (analysisErr: any) {
        console.log('[SocialMarketing] Gemini reference photo analysis notice:', analysisErr?.message);
        return res.json({
          success: true,
          suggestedPrompt: defaultPrompt,
        });
      }
    } catch (err: any) {
      console.error('Error in /api/social-marketing/analyze-reference-photo:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Failed to analyze reference photo.' });
    }
  });

  // Step 2: Media Management - AI Image Generation (DALL-E / Studio Visual with Reference Support)
  app.post('/api/social-marketing/generate-image', async (req, res) => {
    try {
      const { product, prompt: customPrompt, settings, referenceImageUrl, model } = req.body;

      if (!product) {
        return res.status(400).json({ success: false, error: 'Product details required for AI image generation.' });
      }

      // Dynamic image model selection with fallback default
      const requestedModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'dall-e-3';
      let activeImageModel = requestedModel;

      const targetOpenAiKey = process.env.OPENAI_API_KEY;
      let openai: OpenAI | null = null;
      if (targetOpenAiKey) {
        try {
          openai = getOpenAI();
        } catch {}
      }

      // If user supplied a custom prompt or wants DALL-E
      let effectivePrompt = customPrompt?.trim() || buildProductVisualPrompt(product);

      // If reference image was supplied and prompt was not heavily customized, try quick visual enrichment
      if (referenceImageUrl && !customPrompt) {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey && !geminiKey.startsWith('AQ.')) {
          try {
            const ai = getGenAI();
            let mimeType = 'image/jpeg';
            let cleanBase64 = '';
            if (referenceImageUrl.startsWith('data:')) {
              const parts = referenceImageUrl.split(';base64,');
              mimeType = parts[0].replace('data:', '') || 'image/jpeg';
              cleanBase64 = parts[1] || '';
            }

            if (cleanBase64) {
              const enrichRes = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: {
                  parts: [
                    { inlineData: { mimeType, data: cleanBase64 } },
                    { text: `Based on this product reference photo of ${product.brand} ${product.model}, write a 1-sentence commercial studio advertisement photography prompt (max 50 words) depicting this exact item on a sleek pedestal with studio rim lighting.` },
                  ],
                },
              });
              const enriched = enrichRes.text?.trim();
              if (enriched && enriched.length > 20) {
                effectivePrompt = enriched;
              }
            }
          } catch {}
        }
      }

      let generatedImageUrl: string | null = null;
      let source: string = 'curated_studio';
      let engine: string = 'Commercial Studio';

      // Tier 1 & 2: OpenAI DALL-E Generation (Honors selected model: dall-e-3 or dall-e-2)
      if (openai && activeImageModel !== 'flux-turbo') {
        if (activeImageModel === 'dall-e-2') {
          try {
            const imgRes2 = await openai.images.generate({
              model: 'dall-e-2',
              prompt: effectivePrompt.slice(0, 950),
              n: 1,
              size: '1024x1024',
            });
            if (imgRes2.data?.[0]?.url) {
              generatedImageUrl = imgRes2.data[0].url;
              source = 'ai_generated';
              engine = 'DALL-E 2';
            }
          } catch (dalle2Err: any) {
            console.log(`[SocialMarketing] DALL-E 2 error (${dalle2Err?.message || 'failed'}). Attempting fallback.`);
          }
        } else {
          // Default or explicit dall-e-3
          try {
            const imgRes = await openai.images.generate({
              model: 'dall-e-3',
              prompt: effectivePrompt,
              n: 1,
              size: '1024x1024',
              quality: 'standard',
            });
            if (imgRes.data?.[0]?.url) {
              generatedImageUrl = imgRes.data[0].url;
              source = 'ai_generated';
              engine = 'DALL-E 3';
            }
          } catch (dalle3Err: any) {
            const errMsg = dalle3Err?.message || '';
            console.log(`[SocialMarketing] Notice: DALL-E 3 unavailable (${errMsg}). Attempting DALL-E 2.`);

            // Fallback to DALL-E 2
            try {
              const imgRes2 = await openai.images.generate({
                model: 'dall-e-2',
                prompt: effectivePrompt.slice(0, 950),
                n: 1,
                size: '1024x1024',
              });
              if (imgRes2.data?.[0]?.url) {
                generatedImageUrl = imgRes2.data[0].url;
                source = 'ai_generated';
                engine = 'DALL-E 2';
                activeImageModel = 'dall-e-2';
              }
            } catch (dalle2Err: any) {
              console.log(`[SocialMarketing] DALL-E 2 fallback failed (${dalle2Err?.message || 'skipped'}).`);
            }
          }
        }
      }

      // Tier 3: AI Image Generation with Strict Byte-Level Verification & Base64 Proxying
      if (!generatedImageUrl) {
        try {
          const seed = Math.floor(Math.random() * 899999) + 100000;
          const cleanPrompt = effectivePrompt.replace(/[\r\n]+/g, ' ').trim().slice(0, 150);
          const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=768&height=768&seed=${seed}&nologo=true&model=turbo`;

          // Strict timeout and GET verification to guarantee we only return real, renderable image bytes
          const imgRes = await fetch(aiUrl, { signal: AbortSignal.timeout(4000) });
          const contentType = imgRes.headers.get('content-type') || '';
          if (imgRes.ok && contentType.startsWith('image/')) {
            const arrayBuffer = await imgRes.arrayBuffer();
            if (arrayBuffer.byteLength > 1000) {
              const base64 = Buffer.from(arrayBuffer).toString('base64');
              generatedImageUrl = `data:${contentType};base64,${base64}`;
              source = 'ai_generated';
              engine = 'AI Studio Visual';
            }
          }
        } catch (aiErr: any) {
          console.log('[SocialMarketing] AI generation endpoint error/timeout, seamlessly utilizing verified commercial studio photography:', aiErr?.message);
        }
      }

      // Tier 4: Guaranteed Fallback to authentic reference photo or high resolution commercial photo
      if (!generatedImageUrl) {
        const { imageUrl, source: fallbackSource, engine: fallbackEngine } = await generateSocialAdImage({
          product,
          openai,
          imageMode: 'smart_flyer',
        });
        generatedImageUrl = imageUrl;
        source = fallbackSource === 'dalle_3' ? 'ai_generated' : fallbackSource;
        engine = fallbackEngine || 'Commercial Studio';
      }

      return res.json({
        success: true,
        imageUrl: generatedImageUrl,
        source,
        engine,
        model: activeImageModel,
        promptUsed: effectivePrompt,
        referenceUsed: !!referenceImageUrl,
      });
    } catch (err: any) {
      console.error('Error in /api/social-marketing/generate-image:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to generate AI visual.',
      });
    }
  });

  // Step 5: Publishing to Facebook Graph API
  app.post('/api/social-marketing/publish', async (req, res) => {
    try {
      const { product, caption, selectedImages = [], pageId: customPageId, pageAccessToken: customToken, settings } = req.body;

      if (!caption || !caption.trim()) {
        return res.status(400).json({ success: false, error: 'Post caption/text cannot be empty.' });
      }

      const activePageId = customPageId || settings?.socialMediaConfig?.pageId || process.env.FB_PAGE_ID;
      const activeToken = customToken || settings?.socialMediaConfig?.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN;
      const pageName = settings?.socialMediaConfig?.pageName || settings?.shopName || 'Facebook Business Page';

      const now = new Date();
      const timestampIso = now.toISOString();

      // Primary image to publish
      const primaryImage = selectedImages[0] || product?.imageUrl || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&auto=format&fit=crop&q=80';

      // If Facebook credentials are fully configured, attempt live Meta Graph API publish
      if (activePageId && activeToken) {
        const publishResult = await publishPhotoToFacebook({
          pageId: activePageId,
          pageAccessToken: activeToken,
          imageUrl: primaryImage,
          caption: caption.trim(),
        });

        if (publishResult.success) {
          const postRecord: FacebookAdPostRecord = {
            id: `fb-${Date.now()}`,
            productId: product?.id || 'manual',
            productName: product?.name || 'Retail Product',
            brand: product?.brand || '',
            model: product?.model || '',
            postId: publishResult.postId,
            photoId: publishResult.photoId,
            postUrl: publishResult.postUrl,
            caption: caption.trim(),
            imageUrl: primaryImage,
            pageId: activePageId,
            pageName: publishResult.pageName || pageName,
            status: 'published_live',
            sellingPrice: product?.sellingPrice,
            specsSummary: `${product?.ram ? `${product.ram}/` : ''}${product?.rom || ''} ${product?.color || ''}`.trim(),
            publishedAt: timestampIso,
            isMockOrTest: false,
          };

          return res.json({
            success: true,
            post: postRecord,
            message: `Successfully published to "${postRecord.pageName}" on Facebook!`,
          });
        } else {
          // If Meta Graph API returned an error (e.g. expired page token or permissions)
          console.warn('[SocialMarketing] Live Meta publish error, saving draft record with notice:', publishResult.error);
          const postRecord: FacebookAdPostRecord = {
            id: `fb-${Date.now()}`,
            productId: product?.id || 'manual',
            productName: product?.name || 'Retail Product',
            brand: product?.brand || '',
            model: product?.model || '',
            postId: `test_${Date.now()}`,
            postUrl: `https://facebook.com/${encodeURIComponent(activePageId)}`,
            caption: caption.trim(),
            imageUrl: primaryImage,
            pageId: activePageId,
            pageName: pageName,
            status: 'failed',
            errorMessage: publishResult.error,
            sellingPrice: product?.sellingPrice,
            specsSummary: `${product?.ram ? `${product.ram}/` : ''}${product?.rom || ''} ${product?.color || ''}`.trim(),
            publishedAt: timestampIso,
            isMockOrTest: true,
          };

          return res.json({
            success: false,
            error: publishResult.error,
            post: postRecord,
          });
        }
      }

      // Simulation / Pre-configured test publish (when credentials not yet entered in Settings)
      const simulatedPostId = `sim_fb_${Date.now()}`;
      const postRecord: FacebookAdPostRecord = {
        id: `fb-${Date.now()}`,
        productId: product?.id || 'manual',
        productName: product?.name || 'Retail Product',
        brand: product?.brand || '',
        model: product?.model || '',
        postId: simulatedPostId,
        postUrl: `https://facebook.com/hashtag/${encodeURIComponent((product?.brand || 'Mobile').replace(/\s+/g, ''))}`,
        caption: caption.trim(),
        imageUrl: primaryImage,
        pageId: activePageId || 'preview_mode',
        pageName: `${pageName} (Preview Mode)`,
        status: 'preview_ready',
        sellingPrice: product?.sellingPrice,
        specsSummary: `${product?.ram ? `${product.ram}/` : ''}${product?.rom || ''} ${product?.color || ''}`.trim(),
        publishedAt: timestampIso,
        isMockOrTest: true,
      };

      return res.json({
        success: true,
        post: postRecord,
        message: 'Post ready! Configured in Instant Preview mode (Add your Facebook Page ID & Access Token in Shop Settings > Secrets to push live).',
      });
    } catch (err: any) {
      console.error('Error in /api/social-marketing/publish:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Server error publishing to Facebook.',
      });
    }
  });

  // Dedicated endpoint: Test Facebook Page credentials
  app.post('/api/facebook/test-connection', async (req, res) => {
    try {
      const { pageId, pageAccessToken } = req.body;
      const targetPageId = pageId || process.env.FB_PAGE_ID;
      const targetToken = pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN;

      if (!targetPageId || !targetToken) {
        return res.status(400).json({
          success: false,
          error: 'Facebook Page ID and Page Access Token are required to test the connection.',
        });
      }

      const testResult = await testFacebookConnection({
        pageId: targetPageId,
        pageAccessToken: targetToken,
      });

      return res.json(testResult);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to verify Facebook Page credentials.',
      });
    }
  });

  // Status check for server-level Facebook environment credentials
  app.get('/api/facebook/status', (req, res) => {
    const hasEnvPageId = Boolean(process.env.FB_PAGE_ID);
    const hasEnvToken = Boolean(process.env.FB_PAGE_ACCESS_TOKEN);
    res.json({
      configuredInEnv: hasEnvPageId && hasEnvToken,
      pageId: process.env.FB_PAGE_ID ? `${process.env.FB_PAGE_ID.substring(0, 4)}...` : null,
    });
  });

  // Status check for server-level environment secrets & masked previews
  app.get('/api/secrets/status', (req, res) => {
    const mask = (val?: string) => {
      if (!val) return null;
      if (val.length <= 8) return '••••';
      return `${val.substring(0, 6)}...${val.substring(val.length - 4)}`;
    };

    res.json({
      success: true,
      envStatus: {
        hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
        hasFbPageId: Boolean(process.env.FB_PAGE_ID),
        hasFbPageAccessToken: Boolean(process.env.FB_PAGE_ACCESS_TOKEN),
        hasTelegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      },
      previews: {
        openAiKey: mask(process.env.OPENAI_API_KEY),
        geminiKey: mask(process.env.GEMINI_API_KEY),
        fbPageId: process.env.FB_PAGE_ID ? `${process.env.FB_PAGE_ID.substring(0, 4)}...` : null,
        fbPageAccessToken: mask(process.env.FB_PAGE_ACCESS_TOKEN),
      },
    });
  });

  // Test OpenAI API Key endpoint (exclusively reads from server process.env)
  app.post('/api/secrets/test-openai', async (req, res) => {
    try {
      const { model } = req.body;
      const targetKey = process.env.OPENAI_API_KEY;
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'No OPENAI_API_KEY configured in server environment (.env).' });
      }
      const testModel = model || 'gpt-4o-mini';
      const client = new OpenAI({ apiKey: targetKey });
      const startTime = Date.now();
      const response = await client.chat.completions.create({
        model: testModel,
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 10,
      });
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        latencyMs,
        model: response.model || testModel,
        message: 'OpenAI API validated successfully from server environment!',
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: err?.message || 'Invalid or unauthorized OpenAI API Key in server environment.',
      });
    }
  });

  // Test Google Gemini API Key endpoint (exclusively reads from server process.env)
  app.post('/api/secrets/test-gemini', async (req, res) => {
    try {
      const targetKey = process.env.GEMINI_API_KEY;
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'No GEMINI_API_KEY configured in server environment (.env).' });
      }
      const client = new GoogleGenAI({
        apiKey: targetKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const startTime = Date.now();
      const result = await client.models.generateContent({
        model: 'gemini-flash-latest',
        contents: 'ping',
      });
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        latencyMs,
        model: 'gemini-flash-latest',
        message: 'Google Gemini API key validated successfully from server environment!',
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: err?.message || 'Invalid or unauthorized Google Gemini API Key in server environment.',
      });
    }
  });

  // Test Telegram Bot integration endpoint
  app.post('/api/secrets/test-telegram', async (req, res) => {
    try {
      const { botToken, chatId, model } = req.body;
      const targetToken = botToken || process.env.TELEGRAM_BOT_TOKEN;
      const rawTargetChat = chatId || process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ALLOWED_CHAT_IDS;
      const configuredModel = model || process.env.TELEGRAM_AI_MODEL || 'gpt-4o-mini';

      if (!targetToken || !rawTargetChat) {
        return res.status(400).json({
          success: false,
          error: 'Both Telegram Bot Token and at least one Chat ID are required to send a test alert.',
        });
      }

      // Support multiple comma-separated chat IDs
      const targetChats = String(rawTargetChat)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      if (targetChats.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Please provide at least one valid Telegram Chat ID.',
        });
      }

      const telegramUrl = `https://api.telegram.org/bot${targetToken}/sendMessage`;
      const results: { chatId: string; ok: boolean; error?: string }[] = [];

      for (const singleChatId of targetChats) {
        try {
          const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: singleChatId,
              text: `📱 *Mobile Shop POS & Inventory Management*\n\n✅ *Secrets Vault Test Alert*\nYour Telegram notification bot has been successfully configured and verified!\n🤖 *Configured AI Model:* \`${configuredModel}\`\n\n_Sent at: ${new Date().toLocaleString()}_`,
              parse_mode: 'Markdown',
            }),
          });
          const data = (await response.json()) as any;
          if (data.ok) {
            results.push({ chatId: singleChatId, ok: true });
          } else {
            results.push({ chatId: singleChatId, ok: false, error: data.description || 'API Error' });
          }
        } catch (e: any) {
          results.push({ chatId: singleChatId, ok: false, error: e?.message || 'Network error' });
        }
      }

      const successfulCount = results.filter((r) => r.ok).length;
      if (successfulCount > 0) {
        return res.json({
          success: true,
          message: `Test message dispatched successfully to ${successfulCount} of ${targetChats.length} Telegram chat(s)!`,
          results,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: `Failed to deliver to any chat. Reason: ${results[0]?.error || 'Unknown error'}`,
          results,
        });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Network error communicating with Telegram.' });
    }
  });

  // Test Webhook ping endpoint
  app.post('/api/secrets/test-webhook', async (req, res) => {
    try {
      const { url, secret } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'Webhook URL is required.' });
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'MobileShop-POS-Webhook/1.0',
      };
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
        headers['X-Webhook-Secret'] = secret;
      }
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: 'ping',
          timestamp: new Date().toISOString(),
          app: 'Mobile Shop POS & Inventory Management',
        }),
      });
      return res.json({ success: true, statusCode: response.status });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err?.message || 'Failed to ping webhook URL.' });
    }
  });

  // Data Archiving & Cleanup API Endpoints
  app.post('/api/archive-data', async (req, res) => {
    try {
      const { startDate, endDate, olderThanDate, previewOnly, fileNamePrefix } = req.body || {};
      const result = await archiveSalesData({
        startDate,
        endDate,
        olderThanDate,
        previewOnly: Boolean(previewOnly),
        fileNamePrefix,
      });
      return res.json(result);
    } catch (err: any) {
      console.error('[API /api/archive-data] Error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'An unexpected error occurred during data archiving & cleanup.',
      });
    }
  });

  app.get('/api/archive-data/list', async (req, res) => {
    try {
      const files = await listArchivedFiles();
      return res.json({ success: true, files });
    } catch (err: any) {
      console.error('[API /api/archive-data/list] Error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to list archives from Cloud Storage.',
      });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Robust resolution of distPath whether executed from workspace root or inside dist/
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
      ? path.join(process.cwd(), 'dist')
      : process.cwd();

    // Serve hashed assets under /assets with immutable caching
    // fallthrough: false ensures missing assets respond with 404 rather than falling through to index.html (which causes MIME type errors)
    const assetsPath = path.join(distPath, 'assets');
    if (fs.existsSync(assetsPath)) {
      app.use('/assets', express.static(assetsPath, {
        maxAge: '1y',
        immutable: true,
        fallthrough: false,
      }));
    }

    // Serve other root static assets (favicon, manifest, robots, etc.)
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        // Never cache index.html so users always receive references to the latest bundle hashes
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));

    // SPA fallback: ONLY route HTML navigation requests to index.html
    app.get('*', (req, res) => {
      // If request has a file extension (.js, .css, .json, .png, etc.), it's a missing asset, NOT an HTML page!
      if (path.extname(req.path)) {
        return res.status(404).type('text/plain').send(`Asset not found: ${req.path}`);
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  setupGeminiLiveWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mobile Shop POS server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
