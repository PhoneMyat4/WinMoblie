import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  executeQueryInventoryProducts,
  executeQueryPosReports,
} from './aiAssistant';
import { fetchPosDataContext } from './posFirestoreService';

// 1. Initialize the MCP Server
const server = new McpServer({
  name: 'win-audio-pos-mcp',
  version: '1.0.0',
});

// 2. Register Tool: get_inventory_stock
server.tool(
  'get_inventory_stock',
  'Search and inspect existing products in store inventory to view current stock counts, prices, costs, IMEIs, and hardware specifications.',
  {
    search_query: z
      .string()
      .optional()
      .describe('Keyword search for model, brand, SKU, barcode, or name (e.g. "Xiaomi", "iPhone", "128GB").'),
    category: z
      .string()
      .optional()
      .describe("Category filter ('new_phones', 'used_phones', 'accessories', 'gadgets', 'spare_parts')."),
    brand: z
      .string()
      .optional()
      .describe('Brand filter (e.g. "Apple", "Samsung", "Xiaomi").'),
  },
  async (args) => {
    try {
      const context = await fetchPosDataContext();
      const result = executeQueryInventoryProducts(args, context);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('[win-audio-pos-mcp] Error in get_inventory_stock:', error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error querying inventory stock: ${error?.message || String(error)}`,
          },
        ],
      };
    }
  }
);

// 3. Register Tool: get_sales_reports
server.tool(
  'get_sales_reports',
  'Query official POS reports: Z-Report (daily register balancing & cash reconciliation), Stock Aging (inventory age brackets), Dead Stock (0-sales inventory), IMEI Lifecycle (device history), or Category Sales breakdown.',
  {
    report_type: z
      .enum(['z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', 'category_sales'])
      .describe("The specific POS report to generate: 'z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', or 'category_sales'."),
    date_range: z
      .enum(['today', 'yesterday', 'last_7_days', 'this_month', 'last_30_days', 'this_year', 'all_time'])
      .optional()
      .describe("Timeframe preset. Defaults to 'today' for z_report and 'last_30_days' for others."),
    imei: z
      .string()
      .optional()
      .describe("Specific 15-digit IMEI or partial IMEI string to search device history in 'imei_lifecycle' report."),
    sku: z
      .string()
      .optional()
      .describe('Optional SKU filter.'),
    category: z
      .string()
      .optional()
      .describe('Optional category filter.'),
    brand: z
      .string()
      .optional()
      .describe('Optional brand filter.'),
  },
  async (args) => {
    try {
      const context = await fetchPosDataContext();
      const result = executeQueryPosReports(args, context);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('[win-audio-pos-mcp] Error in get_sales_reports:', error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error querying POS reports: ${error?.message || String(error)}`,
          },
        ],
      };
    }
  }
);

// 4. Start Server with Stdio Transport
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[win-audio-pos-mcp] Model Context Protocol server running on stdio');
}

runServer().catch((error) => {
  console.error('[win-audio-pos-mcp] Fatal server startup error:', error);
  process.exit(1);
});
