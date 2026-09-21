import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type, Modality, LiveServerMessage } from '@google/genai';
import { 
  PosDataContext, 
  executeQueryPosReports, 
  executeAddInventoryItem, 
  executeUpdateProductPrice, 
  executeQueryInventoryProducts, 
  executeGeneratePdfReport 
} from './aiAssistant';

// Live & Chat Tool Declarations for Google Gemini
export const geminiLiveTools = [
  {
    name: 'query_pos_reports',
    description: 'Query official POS and inventory reports: Z-Report (end-of-day register balancing & cash drawer reconciliation), Stock Aging (inventory age brackets), Dead Stock (0-velocity unsold stock), IMEI Lifecycle (individual device history timeline), and Category Sales breakdown.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        report_type: {
          type: Type.STRING,
          description: "The report to generate: 'z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', 'category_sales'.",
        },
        date_range: {
          type: Type.STRING,
          description: "Preset timeframe: 'today', 'yesterday', 'last_7_days', 'this_month', 'last_30_days', 'this_year', or 'all_time'.",
        },
        imei: {
          type: Type.STRING,
          description: "Specific 15-digit IMEI or partial IMEI string for 'imei_lifecycle' report.",
        },
        brand: {
          type: Type.STRING,
          description: 'Optional phone brand filter (e.g., Xiaomi, Apple, Samsung, Realme).',
        },
        category: {
          type: Type.STRING,
          description: 'Optional product category filter.',
        },
      },
      required: ['report_type'],
    },
  },
  {
    name: 'query_inventory_products',
    description: 'Search and inspect existing products in the store inventory to check current selling prices, stock levels, IMEIs, and specifications.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        search_query: {
          type: Type.STRING,
          description: 'Keyword search for model, brand, SKU, or name (e.g. "iPhone 15", "Xiaomi Redmi Note 14", "Samsung S24 Ultra").',
        },
        category: {
          type: Type.STRING,
          description: "Category filter: 'Mobile Phones', 'Accessories', 'Gadgets', or 'all'.",
        },
        stock_filter: {
          type: Type.STRING,
          description: "'in_stock', 'out_of_stock', or 'all'. Defaults to 'in_stock'.",
        },
        brand: {
          type: Type.STRING,
          description: 'Brand filter (e.g. Apple, Samsung, Xiaomi).',
        },
      },
    },
  },
  {
    name: 'add_inventory_item',
    description: 'Register and insert a brand new product or serialized phone stock unit into the inventory database.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        brand: { type: Type.STRING, description: 'Brand (e.g. Xiaomi, Apple, Samsung, Realme, Google, Vivo).' },
        model: { type: Type.STRING, description: 'Model name (e.g. Redmi Note 14 Pro, iPhone 15 Pro, Galaxy S24).' },
        ram: { type: Type.STRING, description: 'RAM size (e.g. "8GB", "12GB", or "-" for non-RAM).' },
        rom: { type: Type.STRING, description: 'Storage capacity (e.g. "128GB", "256GB", "512GB", "1TB").' },
        color: { type: Type.STRING, description: 'Color finish (e.g. Midnight Black, Natural Titanium, Desert Titanium).' },
        cost_price: { type: Type.NUMBER, description: 'Cost purchase price in store currency.' },
        selling_price: { type: Type.NUMBER, description: 'Retail selling price in store currency.' },
        quantity: { type: Type.NUMBER, description: 'Quantity of units being added.' },
        imei_list: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of 15-digit IMEI strings (one per device unit).',
        },
        category: { type: Type.STRING, description: 'Category: new_phones, used_phones, accessories, gadgets.' },
      },
      required: ['brand', 'model', 'color', 'cost_price', 'selling_price', 'quantity'],
    },
  },
  {
    name: 'update_product_price',
    description: 'Update the retail selling price, cost price, or minimum selling price of an existing inventory product.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_query: {
          type: Type.STRING,
          description: 'Product name, brand, or model to match (e.g. "Redmi Note 14", "iPhone 15").',
        },
        new_selling_price: {
          type: Type.NUMBER,
          description: 'The new retail selling price in store currency.',
        },
        reason: {
          type: Type.STRING,
          description: 'Reason for price change (e.g. "Flash sale", "Market price drop").',
        },
      },
      required: ['new_selling_price'],
    },
  },
  {
    name: 'generate_pdf_report',
    description: 'Generates and triggers the client-side download of official executive PDF reports for store management.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        report_type: {
          type: Type.STRING,
          description: "Type of PDF report: 'daily_profit_dossier', 'daily_profit_statement', 'z_report', 'stock_aging', 'dead_stock', 'annual_profit_statement', 'category_sales'.",
        },
        date: {
          type: Type.STRING,
          description: 'Date in YYYY-MM-DD format (defaults to current date).',
        },
      },
      required: ['report_type'],
    },
  },
];

export function setupGeminiLiveWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const rawUrl = request.url || '';
      // Support /api/live, /api/live/, /live, /live/, and tolerate query parameters / hashes
      const pathname = rawUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
      if (pathname === '/api/live' || pathname === '/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
        return;
      }
    } catch (err) {
      console.error('[Gemini Live WS Upgrade Error]:', err);
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    console.log('[Gemini Live] Client connected to /api/live');
    let session: any = null;
    let posContext: PosDataContext = {
      products: [],
      sales: [],
      expenses: [],
      purchases: [],
    };
    let isConnected = false;

    const cleanup = () => {
      if (session) {
        try {
          session.close();
        } catch (e) {
          // ignore
        }
        session = null;
      }
      isConnected = false;
    };

    clientWs.on('message', async (data: Buffer | string) => {
      try {
        const payload = JSON.parse(data.toString());

        if (payload.type === 'init') {
          if (payload.context) {
            posContext = payload.context;
          }

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            clientWs.send(JSON.stringify({
              type: 'error',
              error: 'GEMINI_API_KEY environment variable is not configured. Please add GEMINI_API_KEY in Settings > Secrets to use Live Voice.'
            }));
            return;
          }

          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                },
              },
            });

            console.log('[Gemini Live] Initializing gemini-3.8-live session...');
            session = await ai.live.connect({
              model: 'gemini-3.8-live',
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Zephyr',
                    },
                  },
                },
                systemInstruction: `You are Aura Copilot, an elite real-time AI live voice assistant for a mobile phone and electronics retail shop POS.
You speak clearly, concisely, and naturally over low-latency audio.
You have access to real-time store tools to query POS reports, search phone stock and IMEIs, update product prices, register new inventory, and trigger PDF report downloads.
Always answer questions directly and concisely so store staff can listen while operating the cash counter or stocking shelves.
When executing a tool, confirm the action in a brief, friendly sentence.
LANGUAGE INSTRUCTION (STRICT & MANDATORY): You must ALWAYS speak and reply in Burmese language (မြန်မာဘာသာ). Every verbal response, confirmation, tool result explanation, and spoken reply MUST be delivered in fluent, natural Burmese (မြန်မာစကား). Regardless of whether the user speaks in Burmese or English, always speak your response in Burmese.`,
                tools: [
                  {
                    functionDeclarations: geminiLiveTools,
                  },
                ],
              },
              callbacks: {
                onopen: () => {
                  console.log('[Gemini Live] Live session opened with gemini-3.8-live');
                  isConnected = true;
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'ready', model: 'gemini-3.8-live' }));
                  }
                },
                onmessage: async (message: LiveServerMessage) => {
                  try {
                    // 1. Process audio chunks from model turn
                    const parts = message.serverContent?.modelTurn?.parts;
                    if (parts && parts.length > 0) {
                      for (const part of parts) {
                        if (part.inlineData?.data) {
                          if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                              type: 'audio',
                              data: part.inlineData.data, // 24kHz raw PCM little-endian
                              mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                            }));
                          }
                        }
                        if (part.text) {
                          if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                              type: 'transcript',
                              role: 'assistant',
                              text: part.text,
                            }));
                          }
                        }
                      }
                    }

                    // 2. Interruption event (model was interrupted by user voice input)
                    if (message.serverContent?.interrupted) {
                      console.log('[Gemini Live] Model interrupted by user speech');
                      if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: 'interrupted' }));
                      }
                    }

                    // 3. Turn complete event
                    if (message.serverContent?.turnComplete) {
                      if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: 'turnComplete' }));
                      }
                    }

                    // 4. Function call execution
                    if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
                      const functionResponses = [];
                      for (const call of message.toolCall.functionCalls) {
                        const callId = call.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                        const fnName = call.name || '';
                        const args = (call.args || {}) as any;
                        console.log(`[Gemini Live Tool] Calling function: ${fnName}`, args);

                        let executionResult: any = null;
                        let createdProduct: any = undefined;
                        let updatedProduct: any = undefined;
                        let pdfReport: any = undefined;

                        try {
                          if (fnName === 'query_pos_reports') {
                            executionResult = executeQueryPosReports(args, posContext);
                          } else if (fnName === 'query_inventory_products') {
                            executionResult = executeQueryInventoryProducts(args, posContext);
                          } else if (fnName === 'add_inventory_item') {
                            const res = executeAddInventoryItem(args, posContext);
                            executionResult = res;
                            createdProduct = res.createdProduct;
                          } else if (fnName === 'update_product_price') {
                            const res = executeUpdateProductPrice(args, posContext);
                            executionResult = res;
                            updatedProduct = res.updatedProduct;
                          } else if (fnName === 'generate_pdf_report') {
                            const res = executeGeneratePdfReport(args, posContext);
                            executionResult = res;
                            pdfReport = (res as any)?.pdfReport || res;
                          } else {
                            executionResult = { error: `Function ${fnName} not found` };
                          }
                        } catch (err: any) {
                          console.error(`[Gemini Live Tool] Error executing ${fnName}:`, err);
                          executionResult = { error: err?.message || 'Tool execution failed' };
                        }

                        // Broadcast tool execution result to the client UI
                        if (clientWs.readyState === WebSocket.OPEN) {
                          clientWs.send(JSON.stringify({
                            type: 'toolExecuted',
                            name: fnName,
                            args,
                            result: executionResult,
                            createdProduct,
                            updatedProduct,
                            pdfReport,
                          }));
                        }

                        functionResponses.push({
                          id: callId,
                          name: fnName,
                          response: { output: executionResult },
                        });
                      }

                      // Return tool output to Gemini Live session
                      if (session && functionResponses.length > 0) {
                        session.sendToolResponse({
                          functionResponses,
                        });
                      }
                    }
                  } catch (msgErr) {
                    console.error('[Gemini Live] Error in onmessage handler:', msgErr);
                  }
                },
                onerror: (err: any) => {
                  console.error('[Gemini Live] Session error:', err);
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                      type: 'error',
                      error: err?.message || 'Gemini Live session error',
                    }));
                  }
                },
                onclose: (e: any) => {
                  console.log('[Gemini Live] Session closed:', e?.reason || 'normal');
                  isConnected = false;
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'closed', reason: e?.reason }));
                  }
                },
              },
            });
          } catch (sessionErr: any) {
            console.error('[Gemini Live] Failed to create live session:', sessionErr);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'error',
                error: sessionErr?.message || 'Failed to initialize Gemini Live session. Check your GEMINI_API_KEY.',
              }));
            }
          }
        } else if (payload.type === 'audio') {
          // Stream raw 16kHz PCM audio chunk to Gemini Live API
          if (session && isConnected && payload.data) {
            session.sendRealtimeInput({
              audio: {
                data: payload.data, // base64 encoded PCM 16kHz
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          }
        } else if (payload.type === 'text') {
          if (session && isConnected && payload.text) {
            session.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: payload.text }],
                },
              ],
              turnComplete: true,
            });
          }
        } else if (payload.type === 'updateContext') {
          if (payload.context) {
            posContext = { ...posContext, ...payload.context };
          }
        } else if (payload.type === 'stop') {
          cleanup();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'stopped' }));
          }
        }
      } catch (err: any) {
        console.error('[Gemini Live] Error parsing client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('[Gemini Live] Client disconnected');
      cleanup();
    });

    clientWs.on('error', (err) => {
      console.error('[Gemini Live] Client socket error:', err);
      cleanup();
    });
  });

  return wss;
}
