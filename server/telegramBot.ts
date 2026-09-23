import type { Request, Response } from 'express';
import OpenAI, { toFile } from 'openai';
import {
  openAiAssistantTools,
  AI_SYSTEM_INSTRUCTION,
  executeQueryPosReports,
  executeAddInventoryItem,
  executeUpdateProductPrice,
  executeQueryInventoryProducts,
  executeGeneratePdfReport,
  executeOpenAiChatCompletionWithTools,
} from './aiAssistant';
import {
  fetchPosDataContext,
  persistProductToFirestore,
  updateSettingSecretInFirestore,
} from './posFirestoreService';
import { executePostProductAdToFacebook } from './facebookPostService';
import { generateServerReportPdf } from './reportPdfGenerator';
import type { ShopSettings } from '../src/types';

export interface TelegramAiModelOption {
  id: string;
  name: string;
  description: string;
  badge?: string;
}

export const SUPPORTED_TELEGRAM_MODELS: TelegramAiModelOption[] = [
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'Fastest & most cost-efficient GPT-5.6 model for high-volume workloads', badge: 'GPT-5.6 Flagship' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', description: 'Balanced GPT-5.6 speed and depth for POS inventory & sales execution', badge: 'GPT-5.6' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', description: 'Frontier intelligence flagship with comprehensive deep reasoning', badge: 'Frontier' },
  { id: 'gpt-5.6', name: 'GPT-5.6 Frontier', description: 'Full GPT-5.6 frontier scale for deep business & store intelligence', badge: 'Frontier' },
  { id: 'gpt-5', name: 'GPT-5 Flagship', description: 'OpenAI GPT-5 foundational model for complex reasoning', badge: 'GPT-5' },
  { id: 'o3-mini', name: 'o3-mini', description: 'Specialized deep reasoning model for complex inventory & financial analysis', badge: 'Reasoning' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', description: 'High-speed legacy model, responsive & economical', badge: 'Fast' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Omni flagship with advanced visual understanding', badge: 'Omni' },
];

/**
 * Interactive Telegram Inline Keyboard for Quick Report Access
 */
export const REPORT_INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '📊 Daily Sale Report', callback_data: 'cmd_daily_sale' },
      { text: '📅 Monthly Sale Report', callback_data: 'cmd_monthly_sale' },
    ],
    [
      { text: '💰 Gross Profits', callback_data: 'cmd_gross_profit' },
      { text: '🏷️ Price List', callback_data: 'cmd_price_list' },
    ],
  ],
};

/**
 * Mapping table from Telegram callback_data to natural language Burmese prompts.
 * These prompts are fed directly into OpenAI/GenAI tools (e.g. query_pos_reports, query_inventory_products).
 */
export const CALLBACK_PROMPT_MAP: Record<string, string> = {
  cmd_daily_sale: 'ဒီနေ့ အရောင်းစာရင်း (Daily Sale Report) ပြပေးပါ',
  cmd_monthly_sale: 'ဒီလ အရောင်းစာရင်း (Monthly Sale Report) ပြပေးပါ',
  cmd_gross_profit: 'အမြတ်အစွန်းစာရင်း (Gross Profit) ဆွဲထုတ်ပေးပါ',
  cmd_price_list: 'ပစ္စည်းစျေးနှုန်းစာရင်း (Price List) ပြပေးပါ',
};

/**
 * Retrieves the configured Telegram Bot Token from environment or settings.
 */
export function getTelegramBotToken(settings?: ShopSettings): string | null {
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken && envToken.trim()) {
    return envToken.trim();
  }

  const settingsToken = (settings as any)?.secrets?.telegramBotToken;
  if (settingsToken && typeof settingsToken === 'string' && settingsToken.trim()) {
    return settingsToken.trim();
  }

  return null;
}

/**
 * Retrieves the set of authorized Telegram Chat IDs and User IDs.
 */
export function getAuthorizedTelegramIds(settings?: ShopSettings): Set<string> {
  const idSet = new Set<string>();

  const envChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
  if (envChatIds) {
    envChatIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((id) => idSet.add(id));
  }

  const envUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS;
  if (envUserIds) {
    envUserIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((id) => idSet.add(id));
  }

  const settingsChatId =
    (settings as any)?.secrets?.telegramChatId ||
    (settings as any)?.telegramChatId;
  if (settingsChatId && typeof settingsChatId === 'string') {
    settingsChatId
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((id) => idSet.add(id));
  }

  return idSet;
}

/**
 * Verifies if an incoming Telegram chat/user is authorized.
 * SECURITY FAIL-CLOSED: If no allowed list is configured, all requests are REJECTED by default.
 */
export function isTelegramAuthorized(
  chatId: number | string,
  userId?: number | string,
  settings?: ShopSettings
): boolean {
  const authorizedIds = getAuthorizedTelegramIds(settings);

  // Security Fail-Closed: If no authorized IDs are configured, deny by default.
  // This prevents unauthenticated users from executing POS queries, altering stock, or changing prices.
  if (authorizedIds.size === 0) {
    console.warn(
      `[TelegramBot Security] Blocked incoming message from Chat ${chatId}: No authorized Chat IDs are configured in TELEGRAM_ALLOWED_CHAT_IDS or Secrets Vault.`
    );
    return false;
  }

  const sChatId = String(chatId).trim();
  const sUserId = userId ? String(userId).trim() : '';

  return authorizedIds.has(sChatId) || (sUserId ? authorizedIds.has(sUserId) : false);
}

/**
 * Sends a typing chat action indicator to Telegram to provide instant feedback.
 */
export async function sendTelegramChatAction(
  token: string,
  chatId: number | string,
  action: 'typing' | 'upload_document' = 'typing'
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch (err) {
    console.warn('[TelegramBot] Failed to send chat action:', err);
  }
}

/**
 * Splits long messages into chunks within Telegram's 4096 character limit.
 */
function splitMessageIntoChunks(text: string, maxLength = 3900): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try finding paragraph or newline break
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength * 0.5) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx === -1 || splitIdx < maxLength * 0.5) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx === -1) {
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  return chunks;
}

/**
 * Dispatches a message to Telegram using Markdown formatting with automatic
 * plain-text fallback if Markdown entities cannot be parsed.
 */
export async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  text: string,
  replyToMessageId?: number,
  replyMarkup?: any
): Promise<boolean> {
  const chunks = splitMessageIntoChunks(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLastChunk = i === chunks.length - 1;

    const payload: any = {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown',
      reply_to_message_id: replyToMessageId,
    };
    if (replyMarkup && isLastChunk) {
      payload.reply_markup = replyMarkup;
    }

    try {
      // 1. Attempt sending with Markdown parse_mode
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as any;

      if (!data.ok) {
        // Fallback: If Markdown parsing failed, send as clean plain text
        console.warn(
          `[TelegramBot] Markdown parse failed for chat ${chatId} (${data.description}), falling back to plain text.`
        );

        const fallbackPayload: any = {
          chat_id: chatId,
          text: chunk,
          reply_to_message_id: replyToMessageId,
        };
        if (replyMarkup && isLastChunk) {
          fallbackPayload.reply_markup = replyMarkup;
        }

        const fallbackRes = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload),
          }
        );

        const fallbackData = (await fallbackRes.json()) as any;
        if (!fallbackData.ok) {
          // If failed because reply_to_message_id not found, try one more time without reply_to_message_id
          if (replyToMessageId) {
            delete fallbackPayload.reply_to_message_id;
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fallbackPayload),
            });
          } else {
            console.error('[TelegramBot] Failed to send fallback message:', fallbackData);
            return false;
          }
        }
      }
    } catch (err: any) {
      console.error('[TelegramBot] Error sending message to Telegram:', err.message);
      return false;
    }
  }

  return true;
}

/**
 * Acknowledges a Telegram callback query to dismiss the loading spinner on the button.
 */
export async function answerTelegramCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
    const data = (await res.json()) as any;
    return Boolean(data.ok);
  } catch (err: any) {
    console.warn('[TelegramBot] Failed to answerCallbackQuery:', err?.message || err);
    return false;
  }
}

/**
 * Sends a PDF or document file to Telegram using multipart/form-data.
 * Uses native FormData & Blob in Node.js to upload binary buffer directly to sendDocument API.
 */
export async function sendTelegramDocument(
  token: string,
  chatId: number | string,
  fileBuffer: Buffer,
  filename: string,
  caption?: string,
  replyToMessageId?: number
): Promise<{ ok: boolean; description?: string; result?: any }> {
  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append(
      'document',
      new Blob([fileBuffer], { type: 'application/pdf' }),
      filename
    );
    if (caption) {
      formData.append('caption', caption);
    }
    if (replyToMessageId) {
      formData.append('reply_to_message_id', String(replyToMessageId));
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    const data = (await res.json()) as any;
    if (!data.ok) {
      console.warn(`[TelegramBot] sendDocument failed: ${data.description || 'Unknown error'}`);
    } else {
      console.log(`[TelegramBot] sendDocument SUCCESS! File: ${filename}, Chat ID: ${chatId}`);
    }
    return data;
  } catch (err: any) {
    console.error('[TelegramBot] sendDocument network error:', err);
    return { ok: false, description: err?.message || 'Network error' };
  }
}

/**
 * Helper to sanitize any accidental leaks of confidential trade secrets
 */
function sanitizeConfidentialMetrics(text: string): string {
  if (!text) return text;
  return text
    .replace(/(?:Cost\s*Price|Purchase\s*Cost|Unit\s*Cost)\s*[:=]\s*[\d,.]+\s*(?:Ks|MMK)?/gi, '')
    .replace(/(?:Supplier(?:\s*Name)?)\s*[:=]\s*[^\n,]+/gi, '')
    .trim();
}

/**
 * Sets up and registers the Telegram Webhook URL with Telegram's Bot API.
 */
export async function setTelegramWebhook(
  token: string,
  webhookUrl: string,
  secretToken?: string
): Promise<{ ok: boolean; description?: string; result?: any }> {
  try {
    const payload: any = {
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    };

    if (secretToken) {
      payload.secret_token = secretToken;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return (await res.json()) as any;
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

/**
 * Fetches current Telegram Webhook registration details.
 */
export async function getTelegramWebhookInfo(
  token: string
): Promise<{ ok: boolean; result?: any; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    return (await res.json()) as any;
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

/**
 * Webhook Setup Controller (e.g. GET /api/setup-telegram-webhook)
 */
export async function handleSetupTelegramWebhook(req: Request, res: Response) {
  try {
    const context = await fetchPosDataContext();
    const token = getTelegramBotToken(context.settings);

    if (!token) {
      return res.status(400).json({
        success: false,
        error:
          'TELEGRAM_BOT_TOKEN is not configured in .env or Settings. Please set your Telegram bot token first.',
      });
    }

    const mode = (typeof req.query.mode === 'string' ? req.query.mode : typeof req.body?.mode === 'string' ? req.body.mode : '').toLowerCase();
    const queryUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const bodyUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';

    if (mode === 'polling' || req.query.delete === 'true' || req.body?.delete === true) {
      console.log('[TelegramBot] Removing webhook and activating direct Long-Polling mode...');
      const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
      const delData = await delRes.json();
      return res.json({
        success: true,
        message: 'Telegram webhook removed. Switched to direct Long-Polling mode.',
        telegramResponse: delData,
      });
    }

    const envAppUrl = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/webhook/telegram` : '';
    const hostUrl = req.get('host') ? `https://${req.get('host')}/api/webhook/telegram` : '';

    const targetUrl = queryUrl || bodyUrl || envAppUrl || hostUrl;

    const secretToken =
      process.env.TELEGRAM_SECRET_TOKEN ||
      (context.settings as any)?.secrets?.telegramSecretToken ||
      undefined;

    console.log(
      `[TelegramBot] Registering Telegram webhook URL: ${targetUrl} (secret token configured: ${Boolean(secretToken)})`
    );
    const setRes = await setTelegramWebhook(token, targetUrl, secretToken);
    const infoRes = await getTelegramWebhookInfo(token);

    if (!setRes.ok) {
      return res.status(502).json({
        success: false,
        error: `Telegram setWebhook API rejected request: ${setRes.description || 'Unknown error'}`,
        targetUrl,
        telegramResponse: setRes,
      });
    }

    return res.json({
      success: true,
      message: `Telegram webhook successfully registered to: ${targetUrl}`,
      webhookUrl: targetUrl,
      telegramResponse: setRes,
      currentWebhookInfo: infoRes.result || null,
      authorizedChatIdsCount: getAuthorizedTelegramIds(context.settings).size,
    });
  } catch (error: any) {
    console.error('[TelegramBot] Error in setup-telegram-webhook endpoint:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to setup Telegram webhook.',
    });
  }
}

/**
 * Webhook Status Inspector Controller (e.g. GET /api/telegram-webhook-info)
 */
export async function handleTelegramWebhookInfo(req: Request, res: Response) {
  try {
    const context = await fetchPosDataContext();
    const token = getTelegramBotToken(context.settings);

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured.',
      });
    }

    const info = await getTelegramWebhookInfo(token);
    return res.json({
      success: true,
      data: info.result || null,
      authorizedIds: Array.from(getAuthorizedTelegramIds(context.settings)),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error fetching webhook info.',
    });
  }
}

/**
 * Main Direct Two-Way Telegram Webhook Receiver: POST /api/webhook/telegram
 */
export async function handleTelegramWebhook(
  req: Request,
  res: Response,
  getOpenAI: () => OpenAI,
  getGenAI: () => any
) {
  // Acknowledge Telegram immediately with 200 OK
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update || typeof update !== 'object') {
      return;
    }

    const context = await fetchPosDataContext();

    // Check Telegram secret token header for security (matches setWebhook configuration)
    const secretToken =
      process.env.TELEGRAM_SECRET_TOKEN ||
      (context.settings as any)?.secrets?.telegramSecretToken;
    if (secretToken) {
      const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== secretToken) {
        console.warn(
          '[TelegramBot Security] Rejected webhook update: Invalid or missing X-Telegram-Bot-Api-Secret-Token header.'
        );
        return;
      }
    }

    await processTelegramUpdate(update, getOpenAI, getGenAI);
  } catch (error: any) {
    console.error('[TelegramBot] Error handling webhook update:', error);
  }
}

let isPollingActive = false;
let pollingAbortController: AbortController | null = null;

/**
 * Starts direct Telegram Bot Long-Polling.
 * This guarantees real-time operation in development and AI Studio preview
 * environments where inbound webhooks may be blocked by proxies or cookie gates.
 */
export async function startTelegramPolling(
  getOpenAI: () => OpenAI,
  getGenAI: () => any
) {
  if (isPollingActive) {
    console.log('[TelegramBot Polling] Long-polling is already active.');
    return;
  }

  isPollingActive = true;
  pollingAbortController = new AbortController();

  // Run in background async loop
  (async () => {
    let offset = 0;
    let consecutiveErrors = 0;

    console.log('[TelegramBot Polling] Starting direct Telegram Bot long-polling loop...');

    while (isPollingActive) {
      try {
        const context = await fetchPosDataContext();
        const botToken = getTelegramBotToken(context.settings);

        if (!botToken) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          continue;
        }

        // If a webhook is active, delete it so Telegram routes updates to getUpdates
        const webhookInfo = await getTelegramWebhookInfo(botToken);
        if (webhookInfo.result?.url) {
          console.log(
            `[TelegramBot Polling] Deleting stale webhook (${webhookInfo.result.url}) to activate direct long-polling...`
          );
          await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
        }

        const pollUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=20&allowed_updates=${encodeURIComponent(
          JSON.stringify(['message', 'edited_message', 'callback_query'])
        )}`;

        const pollRes = await fetch(pollUrl, {
          signal: pollingAbortController?.signal,
        });

        if (!pollRes.ok) {
          const errText = await pollRes.text();
          console.warn(`[TelegramBot Polling] getUpdates HTTP ${pollRes.status}: ${errText}`);
          consecutiveErrors++;
          const waitTime = Math.min(30000, 2000 * Math.pow(1.5, consecutiveErrors));
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        const pollData = (await pollRes.json()) as any;
        if (!pollData.ok || !Array.isArray(pollData.result)) {
          consecutiveErrors++;
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        consecutiveErrors = 0;
        const updates = pollData.result;

        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          console.log(`[TelegramBot Polling] Processing incoming update ID: ${update.update_id}`);
          try {
            await processTelegramUpdate(update, getOpenAI, getGenAI);
          } catch (updateErr: any) {
            console.error(`[TelegramBot Polling] Error processing update ${update.update_id}:`, updateErr);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || !isPollingActive) {
          console.log('[TelegramBot Polling] Polling loop stopped gracefully.');
          break;
        }
        consecutiveErrors++;
        console.error('[TelegramBot Polling] Polling loop error:', err?.message || err);
        const waitTime = Math.min(30000, 2000 * Math.pow(1.5, consecutiveErrors));
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  })();
}

/**
 * Stops direct Telegram Bot Long-Polling if needed.
 */
export function stopTelegramPolling() {
  if (isPollingActive) {
    console.log('[TelegramBot Polling] Stopping long polling...');
    isPollingActive = false;
    pollingAbortController?.abort();
    pollingAbortController = null;
  }
}

/**
 * Universal Processor for Telegram Updates (used by both Long-Polling and Webhook)
 */
export async function processTelegramUpdate(
  update: any,
  getOpenAI: () => OpenAI,
  getGenAI: () => any
) {
  try {
    if (!update || typeof update !== 'object') {
      return;
    }

    // 1. Fetch live POS Data Context from Firestore
    const context = await fetchPosDataContext();

    // Check for callback queries (inline button presses) or standard/edited messages
    const callbackQuery = update.callback_query;
    const message = update.message || update.edited_message || callbackQuery?.message;

    if (!message && !callbackQuery) {
      return;
    }

    const chatId = callbackQuery
      ? (callbackQuery.message?.chat?.id || callbackQuery.from?.id)
      : message?.chat?.id;
    const userId = callbackQuery ? callbackQuery.from?.id : message?.from?.id;
    const senderName = callbackQuery
      ? (callbackQuery.from?.first_name || callbackQuery.from?.username || 'Staff User')
      : (message?.from?.first_name || message?.from?.username || 'Staff User');
    const messageId = callbackQuery ? callbackQuery.message?.message_id : message?.message_id;

    if (!chatId) {
      return;
    }

    const botToken = getTelegramBotToken(context.settings);
    if (!botToken) {
      console.error('[TelegramBot] Incoming message received but TELEGRAM_BOT_TOKEN is not set.');
      return;
    }

    // Acknowledge callback queries immediately to dismiss the Telegram button loading spinner
    let isCallbackQuery = false;
    let callbackData = '';
    if (callbackQuery) {
      isCallbackQuery = true;
      callbackData = callbackQuery.data || '';
      console.log(`[TelegramBot] Callback query received: "${callbackData}" from ${senderName} (Chat: ${chatId})`);
      if (callbackQuery.id) {
        await answerTelegramCallbackQuery(botToken, callbackQuery.id, 'အစီရင်ခံစာ ထုတ်ယူနေပါသည်...');
      }
    }

    // 2. Security Check: Verify authorized Chat ID or User ID
    const authorized = isTelegramAuthorized(chatId, userId, context.settings);
    if (!authorized) {
      console.warn(
        `[TelegramBot] Unauthorized message attempt from Chat ID: ${chatId} (User: ${userId} - ${senderName})`
      );
      await sendTelegramMessage(
        botToken,
        chatId,
        `⛔ *Access Restricted: Unauthorized Chat*\n\nYour Telegram Chat ID is: \`${chatId}\` (User ID: \`${userId || 'N/A'}\`).\n\nThis POS AI Assistant is restricted to authorized store owners and managers.\n\nTo grant access, add your Chat ID to \`TELEGRAM_ALLOWED_CHAT_IDS\` in \`.env\` or store settings.`,
        messageId
      );
      return;
    }

    const openai = getOpenAI();

    // 3. Extract text query from Callback Query, Text message, or Voice message
    let userText = '';
    let isVoiceMessage = false;
    let voiceTranscription = '';

    if (isCallbackQuery) {
      // Map callback_data to natural language Burmese prompt
      const mappedPrompt = CALLBACK_PROMPT_MAP[callbackData];
      if (mappedPrompt) {
        userText = mappedPrompt;
        console.log(`[TelegramBot] Mapped callback_data "${callbackData}" -> prompt: "${userText}"`);
      } else {
        userText = callbackData;
      }
    } else {
      userText = (message?.text || message?.caption || '').trim();
    }

    // =========================================================================
    // REQUIREMENT 1: VOICE MESSAGES PROCESSING VIA TELEGRAM getFile & OPENAI WHISPER
    // =========================================================================
    const voice = message?.voice || message?.audio;

    if (!isCallbackQuery && voice && voice.file_id) {
      console.log(
        `[TelegramBot] Voice note received from Chat ${chatId} (file_id: ${voice.file_id}, duration: ${voice.duration || 0}s). Processing...`
      );
      await sendTelegramChatAction(botToken, chatId, 'typing');

      try {
        // Step 1: Use Telegram getFile API to get the remote file path
        const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}`;
        const fileInfoRes = await fetch(getFileUrl);
        const fileInfo = (await fileInfoRes.json()) as any;

        if (!fileInfo.ok || !fileInfo.result?.file_path) {
          throw new Error(
            `Telegram getFile API failed: ${fileInfo.description || 'Could not locate audio file path'}`
          );
        }

        const filePath: string = fileInfo.result.file_path;
        console.log(`[TelegramBot] Telegram file path resolved: ${filePath}`);

        // Step 2: Download raw .ogg audio buffer from Telegram file server
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        const audioRes = await fetch(downloadUrl);
        if (!audioRes.ok) {
          throw new Error(`Failed to download audio from Telegram servers: ${audioRes.status} ${audioRes.statusText}`);
        }

        const audioArrayBuffer = await audioRes.arrayBuffer();
        const audioBuffer = Buffer.from(audioArrayBuffer);
        console.log(`[TelegramBot] Downloaded audio buffer (${audioBuffer.length} bytes). Transcribing with Whisper...`);

        // Step 3: Send audio buffer to OpenAI Whisper API (openai.audio.transcriptions.create)
        const audioFile = await toFile(audioBuffer, 'voice.ogg', { type: 'audio/ogg' });
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          prompt: 'Myanmar Burmese language, retail mobile store POS, sales, daily profit report, inventory, stock, price, iPhone, Samsung, Xiaomi, Redmi, Honor, IMEI numbers',
        });

        let transcribed = (transcription.text || '').trim();
        console.log(`[TelegramBot] OpenAI Whisper transcription result: "${transcribed}"`);

        // If Whisper returned empty, attempt resilient fallback via Gemini multimodal audio
        if (!transcribed && getGenAI) {
          try {
            console.log('[TelegramBot] Whisper returned empty text, trying Gemini audio transcription fallback...');
            const genAI = getGenAI();
            const geminiResp = await genAI.models.generateContent({
              model: 'gemini-flash-latest',
              contents: [
                {
                  role: 'user',
                  parts: [
                    { inlineData: { mimeType: 'audio/ogg', data: audioBuffer.toString('base64') } },
                    { text: 'Transcribe this voice note verbatim. The user is asking a question or requesting a report for a retail mobile shop in Myanmar. Return ONLY the transcribed text.' },
                  ],
                },
              ],
            });
            transcribed = (geminiResp.text || '').trim();
            console.log(`[TelegramBot] Gemini audio transcription result: "${transcribed}"`);
          } catch (geminiErr: any) {
            console.warn('[TelegramBot] Gemini audio fallback error:', geminiErr?.message || geminiErr);
          }
        }

        if (transcribed) {
          voiceTranscription = transcribed;
          userText = transcribed;
          isVoiceMessage = true;
          console.log(`[TelegramBot] Successfully transcribed voice note into text: "${userText}"`);
        } else {
          await sendTelegramMessage(
            botToken,
            chatId,
            '🎙️ *Voice Note Received*\n\nSorry, I could not hear or transcribe the speech clearly. Please try speaking closer to your microphone or send your request as a text message.',
            messageId
          );
          return;
        }
      } catch (voiceErr: any) {
        console.error('[TelegramBot] Voice note processing error:', voiceErr);
        await sendTelegramMessage(
          botToken,
          chatId,
          `⚠️ *Voice Processing Error*\n\nCould not process audio: ${voiceErr?.message || 'Download/transcribe error'}. Please try typing your command.`,
          messageId
        );
        return;
      }
    }

    // 4. Handle /start, /menu, and /help commands
    if (userText === '/start' || userText === '/menu' || userText === '/help') {
      const activeModelId =
        (context.settings as any)?.secrets?.telegramBotModel ||
        (context.settings as any)?.telegramBotModel ||
        process.env.TELEGRAM_AI_MODEL ||
        'gpt-5.6-luna';

      const welcomeMessage = `👋 *Welcome to Golden Star Mobile POS Assistant, ${senderName}!*

I am your direct, real-time AI store manager connected to your live Firestore POS database. You can chat with me in text or voice messages in Burmese or English!

🤖 *Active AI Model:* \`${activeModelId}\` (Change anytime with \`/model\`)

⚡ *Quick Report Access (အမြန်အစီရင်ခံစာများ ရယူရန်):*
အောက်ပါ Interactive ခလုတ်များကို နှိပ်၍ အစီရင်ခံစာများကို ချက်ချင်း ဆွဲထုတ်နိုင်ပါသည်:
• 📊 *Daily Sale Report* - ဒီနေ့ အရောင်းစာရင်း
• 📅 *Monthly Sale Report* - ဒီလ အရောင်းစာရင်း
• 💰 *Gross Profits* - အမြတ်အစွန်းစာရင်း
• 🏷️ *Price List* - ပစ္စည်းစျေးနှုန်းစာရင်း

📱 *Other Things you can ask me:*
• 🎙️ *Voice Commands (အသံဖြင့် ခိုင်းစေနိုင်ခြင်း):*
  - Press & hold mic: _"Redmi 9a ဈေးဘယ်လောက်လဲ"_
  - _"ဒီနေ့ report pdf ထုတ်ပေးပါ"_
  - _"iPhone 15 Pro Max stock ဘယ်နှလုံးကျန်လဲ"_
• 📄 *Instant PDF Delivery (PDF အစီရင်ခံစာများ တိုက်ရိုက်ပို့ဆောင်ခြင်း):*
  - _"Daily sale report pdf"_
  - _"P&L report pdf"_
  - _"Annual performance report pdf"_
• 📊 *Sales & Register Reports:*
  - _"Show me today's Z-Report"_
  - _"What are our sales for this month?"_
  - _"Category sales breakdown for last 7 days"_
• 📦 *Inventory & Device Stock:*
  - _"How many iPhone 15 Pro Max do we have in stock?"_
  - _"Show me all Xiaomi phones in stock"_
• 🏷️ *Price & Intake Actions:*
  - _"Update selling price of iPhone 15 to 4,200,000 MMK"_
  - _"Add 2 units of Redmi Note 13 Black with IMEI..."_
• ⚙️ *Commands:*
  - \`/menu\` - Reopen this Interactive Report Buttons menu
  - \`/model\` - View current model & list available AI options

_Your Telegram Chat ID: \`${chatId}\`_`;

      await sendTelegramMessage(botToken, chatId, welcomeMessage, messageId, REPORT_INLINE_KEYBOARD);
      return;
    }

    // 4b. Handle /model command for checking or switching models
    if (userText.startsWith('/model')) {
      const parts = userText.split(/\s+/);
      const requestedModel = parts[1]?.toLowerCase()?.trim();

      const currentModel =
        (context.settings as any)?.secrets?.telegramBotModel ||
        (context.settings as any)?.telegramBotModel ||
        process.env.TELEGRAM_AI_MODEL ||
        'gpt-5.6-luna';

      if (!requestedModel) {
        const modelList = SUPPORTED_TELEGRAM_MODELS.map((m) => {
          const isActive = m.id.toLowerCase() === currentModel.toLowerCase();
          return `• \`${m.id}\` - *${m.name}* [${m.badge || 'AI'}]${isActive ? ' ⭐️ *(CURRENT)*' : ''}\n  _${m.description}_`;
        }).join('\n\n');

        const reply = `🤖 *Telegram AI Bot Model Selection*\n\nCurrently active model: \`${currentModel}\`\n\n*Available Models:*\n${modelList}\n\n*To switch model:*\nSend \`/model <model_id>\`\n_Example:_ \`/model gpt-5.6-luna\` or \`/model o3-mini\``;

        await sendTelegramMessage(botToken, chatId, reply, messageId);
        return;
      }

      const matchedModel = SUPPORTED_TELEGRAM_MODELS.find(
        (m) => m.id.toLowerCase() === requestedModel || m.name.toLowerCase() === requestedModel
      );

      const targetModelId = matchedModel ? matchedModel.id : requestedModel;
      const targetModelName = matchedModel ? matchedModel.name : requestedModel;
      const targetModelDesc = matchedModel ? matchedModel.description : 'Custom OpenAI Model';

      await updateSettingSecretInFirestore('telegramBotModel', targetModelId);

      await sendTelegramMessage(
        botToken,
        chatId,
        `✅ *Telegram AI Model Updated!*\n\nModel switched to: \`${targetModelId}\` (*${targetModelName}*).\n${targetModelDesc}.\n\nAll subsequent questions will now be processed using this model!`,
        messageId
      );
      return;
    }

    if (!userText) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '👋 Hello! Please send a text query or a voice message (for example, "Show me today\'s Z-Report" or "Check stock for iPhone 15").',
        messageId
      );
      return;
    }

    // 5. Send typing indicator while AI processes
    await sendTelegramChatAction(botToken, chatId, 'typing');

    // 6. Determine active model from settings or env
    const rawSelectedModel =
      (context.settings as any)?.secrets?.telegramBotModel ||
      (context.settings as any)?.telegramBotModel ||
      process.env.TELEGRAM_AI_MODEL ||
      'gpt-5.6-luna';

    const activeModel =
      typeof rawSelectedModel === 'string' && /^[a-zA-Z0-9_.-]+$/.test(rawSelectedModel)
        ? rawSelectedModel
        : 'gpt-5.6-luna';

    const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${AI_SYSTEM_INSTRUCTION}

TELEGRAM BOT SPECIFIC MANDATES & STRICT SAFEGUARDS:
- You are communicating directly with store owners and staff over Telegram.
- Format responses cleanly with Telegram Markdown (bold headlines, bullet points, clean numbers).
- STRICT MANDATE FOR PDF REPORTS:
  When the user asks for ANY PDF report (such as "Daily sale report pdf", "P&L report pdf", "Annual report pdf", "z-report pdf", "ဒီနေ့ report pdf ထုတ်ပေးပါ"), you MUST ALWAYS invoke the 'generate_pdf_report' tool.
  Calling 'generate_pdf_report' generates the physical PDF file in server memory and uploads it directly into this Telegram chat.
  NEVER tell the user "downloaded to your device" or "browser download initiated" because this is Telegram, not a browser. Explicitly tell the user that the PDF document has been attached and sent directly in this Telegram chat.
- STRICT SAFEGUARD 1: PRECISE CATEGORY FILTERING (ACCESSORIES EXCLUSION).
  When a user asks about a phone model (e.g. "iPhone 15", "Samsung S24", "Redmi Note"), you MUST filter database results to show ONLY the actual mobile phones.
  Strictly exclude accessories (cases, covers, glasses, chargers) unless the user explicitly asks for them.
  Always call 'query_inventory_products' with category: 'Mobile Phones' and exclude_accessories: true.
- STRICT SAFEGUARD 2: PRICE CONFIDENTIALITY.
  NEVER reveal 'Cost Price', 'Profit', 'Purchase Cost', or 'Supplier Name' in the Telegram chat under ANY circumstances. Only show the 'Selling Price'.
- STRICT SAFEGUARD 3: OUT-OF-STOCK FILTERING.
  When a user asks "what is available" or queries stock/prices, automatically show ONLY items with positive stock (stock > 0).
- STRICT SAFEGUARD 4: TIMEZONE ACCURACY.
  All sales figures, dates, and Z-reports strictly adhere to Myanmar Time (Asia/Yangon UTC+6:30).
- STRICT SAFEGUARD 5: CURRENCY FORMATTING.
  Format all monetary values neatly with commas and "Ks" (e.g., 4,250,000 Ks).`,
      },
      {
        role: 'user',
        content: userText,
      },
    ];

    // Initial tool calling pass with OpenAI
    const aiResponse = await executeOpenAiChatCompletionWithTools(openai, {
      model: activeModel,
      messages: formattedMessages,
      tools: openAiAssistantTools,
      tool_choice: 'auto',
      temperature: 0.3,
    });

    const choice = aiResponse.choices?.[0];
    const assistantMessage = choice?.message;
    const toolCalls = assistantMessage?.tool_calls;

    let finalReply = assistantMessage?.content || '';
    let pdfDeliveredDirectly = false;
    let deliveredPdfFilename = '';
    let deliveredPdfName = '';

    // =========================================================================
    // REQUIREMENT 2: TOOL CALLING & SERVER-SIDE PDF GENERATION & sendDocument
    // =========================================================================
    if (toolCalls && toolCalls.length > 0) {
      await sendTelegramChatAction(botToken, chatId, 'typing');

      const toolCall = toolCalls[0];
      if (toolCall.type === 'function') {
        const functionName = toolCall.function.name;
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          parsedArgs = {};
        }

        console.log(`[TelegramBot] Executing Tool Call: ${functionName} with args:`, parsedArgs);

        let executionResult: any = null;

        if (functionName === 'generate_pdf_report') {
          // Send upload_document action to show Telegram status
          await sendTelegramChatAction(botToken, chatId, 'upload_document');

          const pdfData = executeGeneratePdfReport(parsedArgs, context);

          try {
            // 1. Generate PDF Buffer natively on the Node.js server using jspdf and jspdf-autotable
            const { buffer, filename, reportName } = generateServerReportPdf(pdfData);
            console.log(
              `[TelegramBot] Generated PDF buffer for '${filename}' (${buffer.length} bytes). Posting to Telegram sendDocument API...`
            );

            // 2. Use FormData to POST that buffer to Telegram's sendDocument API endpoint
            const caption = `📄 *${reportName}*\n📅 Period: ${pdfData.date || pdfData.year || 'Today'}\n🏪 Shop: ${context.settings?.shopName || 'Win Mobile & Gadgets'}`;
            const docRes = await sendTelegramDocument(
              botToken,
              chatId,
              buffer,
              filename,
              caption,
              messageId
            );

            if (docRes.ok) {
              pdfDeliveredDirectly = true;
              deliveredPdfFilename = filename;
              deliveredPdfName = reportName;
              console.log(`[TelegramBot] Successfully delivered PDF document '${filename}' to Chat ${chatId}`);

              executionResult = {
                ...pdfData,
                deliveredToTelegram: true,
                filename,
                message: `The official PDF report '${filename}' has been generated and physically sent directly as a document attachment into this Telegram chat. Do NOT say it was downloaded to a browser or local device. Explicitly tell the user in Burmese that the PDF report file is attached above in this Telegram conversation.`,
              };
            } else {
              console.error('[TelegramBot] Telegram sendDocument failed:', docRes);
              executionResult = {
                ...pdfData,
                deliveredToTelegram: false,
                error: docRes.description || 'Telegram sendDocument API failed',
              };
            }
          } catch (pdfErr: any) {
            console.error('[TelegramBot] Failed to render or deliver PDF Buffer:', pdfErr);
            executionResult = {
              ...pdfData,
              deliveredToTelegram: false,
              pdfRenderError: pdfErr?.message || 'Server PDF render failed',
            };
          }
        } else if (functionName === 'query_pos_reports') {
          executionResult = executeQueryPosReports(parsedArgs, context);
        } else if (functionName === 'query_inventory_products') {
          executionResult = executeQueryInventoryProducts(parsedArgs, context);
        } else if (functionName === 'add_inventory_item') {
          const mutation = executeAddInventoryItem(parsedArgs, context);
          executionResult = mutation;
          if (mutation.createdProduct) {
            await persistProductToFirestore(mutation.createdProduct);
          }
        } else if (functionName === 'update_product_price') {
          const updateResult = executeUpdateProductPrice(parsedArgs, context);
          executionResult = updateResult;
          if (updateResult.updatedProduct) {
            await persistProductToFirestore(updateResult.updatedProduct);
          }
        } else if (functionName === 'post_product_ad_to_facebook') {
          executionResult = await executePostProductAdToFacebook(
            parsedArgs,
            context,
            openai,
            getGenAI
          );
        } else {
          executionResult = { error: `Tool ${functionName} is not recognized.` };
        }

        // Send intermediate typing indicator
        await sendTelegramChatAction(botToken, chatId, 'typing');

        // Feed tool results back to OpenAI for final synthesis
        const followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          ...formattedMessages,
          assistantMessage,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(executionResult),
          },
        ];

        const secondResponse = await executeOpenAiChatCompletionWithTools(openai, {
          model: activeModel,
          messages: followUpMessages,
          tools: openAiAssistantTools,
          temperature: 0.3,
        });

        finalReply =
          secondResponse.choices?.[0]?.message?.content ||
          'Action executed successfully on store POS database.';
      }
    }

    // =========================================================================
    // PROACTIVE PDF SAFEGUARD: IF USER ASKED FOR PDF REPORT BUT TOOL WAS SKIPPED
    // =========================================================================
    const userQueryLower = userText.toLowerCase();
    const isExplicitPdfRequest =
      userQueryLower.includes('pdf') &&
      (userQueryLower.includes('report') ||
        userQueryLower.includes('sale') ||
        userQueryLower.includes('profit') ||
        userQueryLower.includes('dossier') ||
        userQueryLower.includes('statement') ||
        userQueryLower.includes('z-report') ||
        userQueryLower.includes('z report') ||
        userQueryLower.includes('annual') ||
        userText.includes('အစီရင်ခံစာ') ||
        userText.includes('ထုတ်ပေးပါ'));

    if (isExplicitPdfRequest && !pdfDeliveredDirectly) {
      console.log(
        '[TelegramBot] Detected user asked for PDF report but tool was not triggered. Triggering proactive server-side PDF generation...'
      );
      await sendTelegramChatAction(botToken, chatId, 'upload_document');

      let targetReportType = 'daily_profit_statement';
      if (userQueryLower.includes('annual') || userQueryLower.includes('year') || userText.includes('နှစ်ချုပ်')) {
        targetReportType = 'annual_profit_statement';
      } else if (userQueryLower.includes('z-report') || userQueryLower.includes('z report')) {
        targetReportType = 'z_report';
      } else if (userQueryLower.includes('dossier') || userQueryLower.includes('p&l') || userQueryLower.includes('p and l')) {
        targetReportType = 'daily_profit_dossier';
      }

      try {
        const proactivePdfData = executeGeneratePdfReport({ report_type: targetReportType }, context);
        const { buffer, filename, reportName } = generateServerReportPdf(proactivePdfData);

        const docRes = await sendTelegramDocument(
          botToken,
          chatId,
          buffer,
          filename,
          `📄 *${reportName}*\n📅 Period: ${proactivePdfData.date || 'Today'}\n🏪 Shop: ${context.settings?.shopName || 'Win Mobile & Gadgets'}`,
          messageId
        );

        if (docRes.ok) {
          pdfDeliveredDirectly = true;
          deliveredPdfFilename = filename;
          deliveredPdfName = reportName;
          console.log(`[TelegramBot] Proactive PDF '${filename}' successfully delivered to Chat ${chatId}`);
        }
      } catch (proactiveErr) {
        console.error('[TelegramBot] Proactive PDF delivery failed:', proactiveErr);
      }
    }

    if (!finalReply) {
      finalReply = 'I have processed your request on the POS database.';
    }

    // Clean up any residual hallucinated browser/device download phrases
    finalReply = finalReply
      .replace(/downloaded to your (?:device|computer|phone|browser)/gi, 'sent as a PDF document directly in this Telegram chat')
      .replace(/browser download initiated/gi, 'PDF document delivered to this Telegram chat')
      .replace(/download ပြုလုပ်ပေးထားပါပြီ/g, 'Telegram တွင် PDF ဖိုင် ပေးပို့ပေးထားပါပြီ')
      .replace(/download ဆွဲပေး/g, 'Telegram ထဲသို့ ပေးပို့ပေး');

    // If PDF was delivered, confirm the attachment in Burmese
    if (pdfDeliveredDirectly && deliveredPdfFilename) {
      if (!finalReply.includes(deliveredPdfFilename)) {
        finalReply += `\n\n📄 *PDF ဖိုင် ပေးပို့မှု အောင်မြင်ပါသည်:*\n\`${deliveredPdfFilename}\` အစီရင်ခံစာ PDF ဖိုင်ကို အထက်ပါအတိုင်း Telegram တွင် တိုက်ရိုက် ပူးတွဲ ပေးပို့ပေးထားပါပြီခင်ဗျာ။`;
      }
    }

    // If user sent a voice message, show transcription header so they know what was heard
    if (isVoiceMessage && voiceTranscription) {
      finalReply = `🎙️ *Heard (အသံမှတ်တမ်း):* _"${voiceTranscription}"_\n\n${finalReply}`;
    }

    // 7. Dispatch answer back to Telegram chat with confidentiality sanitization
    await sendTelegramMessage(
      botToken,
      chatId,
      sanitizeConfidentialMetrics(finalReply),
      messageId,
      isCallbackQuery ? REPORT_INLINE_KEYBOARD : undefined
    );
  } catch (error: any) {
    console.error('[TelegramBot] Error handling Telegram update:', error);
  }
}
