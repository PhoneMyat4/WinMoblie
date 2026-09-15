import type { Request, Response } from 'express';
import OpenAI from 'openai';
import {
  openAiAssistantTools,
  AI_SYSTEM_INSTRUCTION,
  executeQueryPosReports,
  executeAddInventoryItem,
  executeUpdateProductPrice,
  executeQueryInventoryProducts,
  executeGeneratePdfReport,
} from './aiAssistant';
import {
  fetchPosDataContext,
  persistProductToFirestore,
} from './posFirestoreService';
import { executePostProductAdToFacebook } from './facebookPostService';
import type { ShopSettings } from '../src/types';

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

  const settingsChatId = (settings as any)?.secrets?.telegramChatId;
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
 * If no allowed list is configured, all users are permitted by default,
 * but a setup notice is logged.
 */
export function isTelegramAuthorized(
  chatId: number | string,
  userId?: number | string,
  settings?: ShopSettings
): boolean {
  const authorizedIds = getAuthorizedTelegramIds(settings);

  // If no specific IDs are restricted in .env or settings, allow by default
  if (authorizedIds.size === 0) {
    return true;
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
  action: 'typing' = 'typing'
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
    // Non-blocking action failure
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
  replyToMessageId?: number
): Promise<boolean> {
  const chunks = splitMessageIntoChunks(text);

  for (const chunk of chunks) {
    try {
      // 1. Attempt sending with Markdown parse_mode
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
          reply_to_message_id: replyToMessageId,
        }),
      });

      const data = (await res.json()) as any;

      if (!data.ok) {
        // Fallback: If Markdown parsing failed, send as clean plain text
        console.warn(
          `[TelegramBot] Markdown parse failed for chat ${chatId} (${data.description}), falling back to plain text.`
        );

        const fallbackRes = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: chunk,
              reply_to_message_id: replyToMessageId,
            }),
          }
        );

        const fallbackData = (await fallbackRes.json()) as any;
        if (!fallbackData.ok) {
          console.error('[TelegramBot] Failed to send fallback message:', fallbackData);
          return false;
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
      allowed_updates: ['message', 'edited_message'],
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

    // Default target webhook URL requested: https://winmobile777.ai.studio/api/webhook/telegram
    const queryUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const bodyUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const envAppUrl = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/webhook/telegram` : '';
    const hostUrl = req.get('host') ? `https://${req.get('host')}/api/webhook/telegram` : '';

    const targetUrl =
      queryUrl ||
      bodyUrl ||
      'https://winmobile777.ai.studio/api/webhook/telegram' ||
      envAppUrl ||
      hostUrl;

    const secretToken = process.env.TELEGRAM_SECRET_TOKEN || undefined;

    console.log(`[TelegramBot] Registering Telegram webhook URL: ${targetUrl}`);
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
  // Acknowledge Telegram immediately with 200 OK so Telegram doesn't retry
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update || typeof update !== 'object') {
      return;
    }

    // Check optional Telegram secret token header for security
    const secretToken = process.env.TELEGRAM_SECRET_TOKEN;
    if (secretToken) {
      const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== secretToken) {
        console.warn('[TelegramBot] Rejected webhook update with invalid secret token header.');
        return;
      }
    }

    // We process standard messages and edited messages
    const message = update.message || update.edited_message;
    if (!message) {
      return;
    }

    const chatId = message.chat?.id;
    const userId = message.from?.id;
    const senderName = message.from?.first_name || message.from?.username || 'Staff User';
    const messageId = message.message_id;

    if (!chatId) {
      return;
    }

    // 1. Fetch live POS Data Context from Firestore
    const context = await fetchPosDataContext();
    const botToken = getTelegramBotToken(context.settings);

    if (!botToken) {
      console.error('[TelegramBot] Incoming message received but TELEGRAM_BOT_TOKEN is not set.');
      return;
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

    // Extract text query or caption from photos
    const userText = (message.text || message.caption || '').trim();

    // 3. Handle /start and /help commands
    if (userText === '/start' || userText === '/help') {
      const welcomeMessage = `👋 *Welcome to Golden Star Mobile POS Assistant, ${senderName}!*

I am your direct, real-time AI store manager connected to your live Firestore POS database. You can chat with me in natural language to query sales, check stock, or manage inventory.

📱 *Things you can ask me:*
• 📊 *Sales & Register Reports:*
  - _"Show me today's Z-Report"_
  - _"What are our sales for this month?"_
  - _"Category sales breakdown for last 7 days"_
• 📦 *Inventory & Device Stock:*
  - _"How many iPhone 15 Pro Max do we have in stock?"_
  - _"Show me all Xiaomi phones in stock"_
  - _"Which items are dead stock (0 sales)?"_
  - _"Give me the stock aging report"_
• 🏷️ *Price & Intake Actions:*
  - _"Update selling price of iPhone 15 to 4,200,000 MMK"_
  - _"Add 2 units of Redmi Note 13 Black with IMEI..."_
• 🔍 *IMEI Lifecycle:*
  - _"Lookup IMEI 861234567890123 history"_

_Your Telegram Chat ID: \`${chatId}\`_`;

      await sendTelegramMessage(botToken, chatId, welcomeMessage, messageId);
      return;
    }

    if (!userText) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '👋 Hello! Please send a text query (for example, "Show me today\'s Z-Report" or "Check stock for iPhone 15").',
        messageId
      );
      return;
    }

    // 4. Send typing indicator while AI processes
    await sendTelegramChatAction(botToken, chatId, 'typing');

// Helper to sanitize any accidental leaks of confidential trade secrets
function sanitizeConfidentialMetrics(text: string): string {
  if (!text) return text;
  return text
    .replace(/(?:Cost\s*Price|Purchase\s*Cost|Unit\s*Cost)\s*[:=]\s*[\d,.]+\s*(?:Ks|MMK)?/gi, '')
    .replace(/(?:Supplier(?:\s*Name)?)\s*[:=]\s*[^\n,]+/gi, '')
    .trim();
}

    // 5. Build AI query with existing OpenAI tools
    const openai = getOpenAI();

    const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${AI_SYSTEM_INSTRUCTION}

TELEGRAM CHAT SPECIFIC INSTRUCTIONS & STRICT SAFEGUARDS:
- You are communicating directly with store owners and staff over Telegram.
- Format responses cleanly with Markdown (bold headlines, bullet points, concise tables).
- STRICT SAFEGUARD 1: PRECISE CATEGORY FILTERING (ACCESSORIES EXCLUSION).
  When a user asks about a phone model (e.g. "iPhone 15", "Samsung S24", "Redmi Note"), you MUST filter database results to show ONLY the actual mobile phones.
  Strictly exclude accessories (cases, covers, glasses, chargers) unless the user explicitly asks for them.
  Always call 'query_inventory_products' with category: 'Mobile Phones' and exclude_accessories: true.
  Double-check the parsed data before sending the final response to Telegram to guarantee no accessories are listed under phones.
- STRICT SAFEGUARD 2: PRICE CONFIDENTIALITY.
  NEVER reveal 'Cost Price', 'Profit', 'Purchase Cost', or 'Supplier Name' in the Telegram chat under ANY circumstances. Only show the 'Selling Price'.
  If a user asks for cost or profit, politely state that cost details are internal and confidential.
- STRICT SAFEGUARD 3: OUT-OF-STOCK FILTERING.
  When a user asks "what is available" or queries stock/prices, automatically show ONLY items with positive stock (stock > 0).
  Only return zero-stock items if the user specifically asks for "out of stock" or "dead stock".
- STRICT SAFEGUARD 4: TIMEZONE ACCURACY.
  All sales figures, dates, and Z-reports strictly adhere to Myanmar Time (Asia/Yangon UTC+6:30).
- STRICT SAFEGUARD 5: CURRENCY & TYPO HANDLING.
  Gracefully handle typos (e.g. "ihpone" -> "iPhone"). Format all monetary values neatly with commas and "Ks" (e.g., 4,250,000 Ks).`,
      },
      {
        role: 'user',
        content: userText,
      },
    ];

    // Initial tool calling pass with OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: formattedMessages,
      tools: openAiAssistantTools,
      tool_choice: 'auto',
      temperature: 0.3,
    });

    const choice = aiResponse.choices?.[0];
    const assistantMessage = choice?.message;
    const toolCalls = assistantMessage?.tool_calls;

    let finalReply = assistantMessage?.content || '';

    // If the model invoked tools (query_pos_reports, query_inventory_products, etc.)
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

        if (functionName === 'query_pos_reports') {
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
        } else if (functionName === 'generate_pdf_report') {
          const pdfResult = executeGeneratePdfReport(parsedArgs, context);
          executionResult = pdfResult;
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

        // Feed tool results back to OpenAI for final natural language synthesis
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
          model: 'gpt-4o-mini',
          messages: followUpMessages,
          tools: openAiAssistantTools,
          temperature: 0.3,
        });

        finalReply =
          secondResponse.choices?.[0]?.message?.content ||
          'Action executed successfully on store POS database.';
      }
    }

    if (!finalReply) {
      finalReply = 'I have processed your request, but have no details to return.';
    }

    // 6. Dispatch answer back to the Telegram chat with confidentiality sanitization
    await sendTelegramMessage(botToken, chatId, sanitizeConfidentialMetrics(finalReply), messageId);
  } catch (error: any) {
    console.error('[TelegramBot] Error handling webhook update:', error);
  }
}
