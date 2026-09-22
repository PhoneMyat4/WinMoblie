import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  TrendingUp, 
  X, 
  Send, 
  RefreshCw, 
  CheckCircle2, 
  Maximize2, 
  Minimize2, 
  Package, 
  BarChart3, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronDown,
  Wand2,
  Trash2,
  Lock,
  ShieldAlert,
  Share2,
  Paperclip,
  Image as ImageIcon,
  Camera,
  FileText,
  FileSpreadsheet,
  Eye,
  Download,
  UploadCloud,
  FileUp,
  Cpu,
  FileDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Product, Sale, ExpenseRecord, PurchaseRecord, CashDrawerRecord, StockAdjustment, ShopSettings, StaffUser, StaffRole, RolePermissions, FacebookAdPostRecord } from '../../types';
import { StorageService } from '../../utils/storage';
import { formatCurrency, getRoleBadgeClass } from '../../utils/formatters';
import { compressImageForOcr } from '../../utils/boxScannerService';
import { authenticatedFetch } from '../../utils/apiClient';
import confetti from 'canvas-confetti';
import { 
  exportDailyProfitDossierPdf, 
  exportDailyProfitStatementPdf, 
  exportDailyProfitLedgerPdf 
} from '../../utils/dailyProfitPdfExport';
import { 
  exportAnnualProfitStatementPdf, 
  exportAnnualProfitDossierPdf 
} from '../../utils/annualProfitPdfExport';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { exportGptCostComparisonPdf } from '../../utils/gptCostPdfExport';

export interface CopilotModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
}

export const COPILOT_MODELS: CopilotModelOption[] = [
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', badge: 'GPT-5.6 Flagship', description: 'Fastest & most cost-efficient GPT-5.6 for store operations' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', badge: 'GPT-5.6', description: 'Balanced speed & depth for POS inventory & sales execution' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', badge: 'Frontier', description: 'Frontier intelligence flagship with comprehensive deep reasoning' },
  { id: 'gpt-5.6', name: 'GPT-5.6 Frontier', badge: 'Frontier', description: 'OpenAI GPT-5.6 frontier intelligence scaling' },
  { id: 'gpt-5', name: 'GPT-5 Flagship', badge: 'GPT-5', description: 'OpenAI GPT-5 foundational intelligence model' },
  { id: 'o3-mini', name: 'o3-mini', badge: 'Deep Reasoning', description: 'Intricate POS calculation & inventory auditing' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', badge: 'Fast & Light', description: 'High-speed legacy model, responsive & economical' },
  { id: 'gpt-4o', name: 'GPT-4o', badge: 'Omni Flagship', description: 'Multimodal vision, complex reasoning & intelligence' },
];

interface AiChatWidgetProps {
  products: Product[];
  sales: Sale[];
  expenses: ExpenseRecord[];
  purchases: PurchaseRecord[];
  cashDrawer?: CashDrawerRecord;
  stockAdjustments?: StockAdjustment[];
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToInventory?: () => void;
  onNavigateToReports?: () => void;
  canAccess?: boolean;
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<StaffRole, RolePermissions>;
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  textContent?: string;
  previewUrl?: string;
  isImage: boolean;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
  toolExecuted?: {
    name: string;
    args: any;
    result?: any;
  };
  createdProduct?: Product;
  updatedProduct?: Product;
  facebookPost?: FacebookAdPostRecord;
  pdfReport?: {
    reportType: string;
    reportName: string;
    filename: string;
    config: any;
  };
}

const QUICK_PROMPTS_BURMESE = [
  { label: "📊 နေ့စဥ်အရောင်း Z-Report", prompt: "ယနေ့အတွက် Z-Report အကျဉ်းချုပ်နှင့် စုစုပေါင်းအရောင်း၊ ကုန်ကျစရိတ်များကို မြန်မာလို ရှင်းပြပေးပါရှင်။", icon: BarChart3 },
  { label: "📱 ဖုန်းလက်ကျန်စစ်မည်", prompt: "လက်ရှိဆိုင်မှာ အသင့်ရှိတဲ့ ဖုန်းလက်ကျန်စာရင်းနှင့် ဈေးနှုန်းများကို ဖော်ပြပေးပါရှင်။", icon: Package },
  { label: "💰 ယနေ့ အမြတ်ငွေစာရင်း", prompt: "ယနေ့အတွက် ရရှိသော အသားတင်အမြတ်ငွေနှင့် အရောင်းအခြေအနေကို တွက်ချက်ပြပေးပါရှင်။", icon: TrendingUp },
  { label: "📄 အမြတ်ငွေ PDF ထုတ်မည်", prompt: "ယနေ့အတွက် Daily Gross Profit & P&L Audit Dossier ကို PDF အဖြစ် download ဆွဲပေးပါရှင်။", icon: Download },
  { label: "🔍 IMEI စစ်ဆေးမည်", prompt: "ဖုန်း၏ IMEI နံပါတ်ဖြင့် အရောင်းနှင့် ပစ္စည်းမှတ်တမ်းကို စစ်ဆေးပေးပါရှင်။", icon: Wand2 },
  { label: "⚠️ လက်ကျန်နည်းပစ္စည်းများ", prompt: "ဆိုင်တွင် လက်ကျန်နည်းနေသော ပစ္စည်းများနှင့် Dead Stock စာရင်းကို ပြပေးပါရှင်။", icon: AlertTriangle },
  { label: "📢 Facebook ကြော်ငြာတင်မည်", prompt: "ဆိုင်မှာရှိတဲ့ လူကြိုက်များသော ဖုန်းတစ်လုံးအတွက် Facebook page မှာ တင်ဖို့ ကြော်ငြာစာ ရေးပေးပါရှင်။", icon: Share2 },
];

const QUICK_PROMPTS_ENGLISH = [
  { label: "Download Daily Profit PDF", prompt: "Please generate and download today's Daily Gross Profit & P&L Audit Dossier as a PDF report.", icon: Download },
  { label: "Annual Profit PDF", prompt: "Generate and download our Annual Profit and Loss Statement PDF report for this fiscal year.", icon: FileText },
  { label: "Scan Phone Box", prompt: "Please inspect this phone box photo, read the sticker, and extract brand, model, specs, and IMEI to register into inventory.", icon: ImageIcon },
  { label: "Post Ad to Facebook", prompt: "Make a Facebook advertisement post for our featured phone with AI generated photo and caption.", icon: Share2 },
  { label: "Today's Z-Report", prompt: "Generate today's complete Z-Report with sales, refunds, expenses, and drawer balance.", icon: BarChart3 },
  { label: "Change Price", prompt: 'Change the selling price of product "name - n 16, brand Xiaomi, 12/128GB" to 550000', icon: Wand2 },
  { label: "Dead Stock Items", prompt: "Identify dead stock items with 0 sales and estimate total tied-up capital.", icon: AlertTriangle },
  { label: "Stock Aging", prompt: "Show me the inventory aging report categorized by 30, 60, and 90+ day brackets.", icon: Clock },
  { label: "Category Margins", prompt: "Break down sales revenue and profit margins across all product categories.", icon: TrendingUp },
  { label: "Add New Phone", prompt: "I want to add new phone inventory. Please guide me through the required specs and IMEIs.", icon: Package },
];

export const AiChatWidget: React.FC<AiChatWidgetProps> = ({
  products,
  sales,
  expenses,
  purchases,
  cashDrawer,
  stockAdjustments,
  settings,
  isOpen,
  onClose,
  onNavigateToInventory,
  onNavigateToReports,
  canAccess = true,
  currentStaffUser,
  rolePermissions,
}) => {
  const [chatLanguage, setChatLanguage] = useState<'my' | 'en'>(() => {
    try {
      const stored = localStorage.getItem('mobileshop_copilot_lang');
      if (stored === 'en' || stored === 'my') return stored;
    } catch {}
    return 'my'; // Default to Burmese (မြန်မာ)
  });

  const [messages, setMessages] = useState<ChatMessageItem[]>(() => {
    const isBurmese = (() => {
      try {
        const stored = localStorage.getItem('mobileshop_copilot_lang');
        return stored !== 'en';
      } catch {
        return true;
      }
    })();

    return [
      {
        id: 'msg_welcome',
        role: 'assistant',
        content: isBurmese
          ? `👋 **မင်္ဂလာပါ! ကျွန်မကတော့ ဖုန်းဆိုင်အတွက် AI Store Copilot ဖြစ်တဲ့ Aura ပါရှင်။**\n\nစတိုးဆိုင်၏ POS စာရင်းများ၊ အရောင်းအဝယ်များနှင့် ပစ္စည်းလက်ကျန်များကို တိုက်ရိုက်မေးမြန်း စီမံနိုင်ပါတယ်ရှင်:\n- 📊 **အရောင်းနှင့် စာရင်းစစ်ဆေးခြင်း**: နေ့စဥ် Z-Report၊ အမြတ်ငွေစာရင်း၊ ပစ္စည်းလက်ကျန် (Stock) နှင့် IMEI ရာဇဝင်များကို မေးမြန်းနိုင်ပါတယ်။\n- 📱 **ပစ္စည်းအသစ်စာရင်းသွင်းခြင်း**: ဥပမာ *"Redmi Note 14 Pro 8/256GB အမည်းရောင် ဝယ်ဈေး ၆၀၀,၀၀၀ ကျပ်၊ ရောင်းဈေး ၆၉၀,၀၀၀ ကျပ်၊ IMEI 864201061234567 ဖြင့် စာရင်းသွင်းပေးပါ"* ဟု အမိန့်ပေးနိုင်ပါတယ်။\n- 🏷️ **ဈေးနှုန်းပြင်ဆင်ခြင်း**: ပစ္စည်းများ၏ ရောင်းဈေးများကို အလွယ်တကူ ပြင်ဆင်နိုင်ပါတယ်။\n- 📄 **PDF အစီရင်ခံစာများ ထုတ်ယူခြင်း**: Daily Profit Statement သို့မဟုတ် IMEI Audit Report များကို တိုက်ရိုက် Download ပြုလုပ်နိုင်ပါတယ်။`
          : `👋 **Hello! I'm Aura, your AI Store Copilot.**\n\nI can execute live POS database operations via **OpenAI Function Calling**:\n- 📊 **Query POS Reports**: Daily Z-Reports, Sales Summaries, Dead Stock, Aging, and Category Margins.\n- 📱 **Add Inventory**: Say e.g. *"Add 1 Xiaomi Redmi Note 14 Pro 8/256GB Black for $220 cost, $270 sell with IMEI 864201061234567"*\n- 🏷️ **Update Prices**: Quickly adjust selling prices across products.\n- 📄 **Download PDF Reports**: Generate official Audit and Daily Profit dossiers instantly.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState<string | null>(null);
  const [apiKeyWarning, setApiKeyWarning] = useState<string | null>(null);

  const toggleLanguage = (newLang: 'my' | 'en') => {
    setChatLanguage(newLang);
    try {
      localStorage.setItem('mobileshop_copilot_lang', newLang);
    } catch {}
  };

  // Model Selection State for In-App Copilot
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('mobileshop_copilot_model');
      if (cached && typeof cached === 'string') return cached;
    } catch {}
    return settings?.secrets?.chatAssistantModel || 'gpt-5.6-luna';
  });
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // Synchronize with settings if default changes and user hasn't set manual override
  useEffect(() => {
    if (settings?.secrets?.chatAssistantModel) {
      try {
        const cached = localStorage.getItem('mobileshop_copilot_model');
        if (!cached) {
          setSelectedModel(settings.secrets.chatAssistantModel);
        }
      } catch {}
    }
  }, [settings?.secrets?.chatAssistantModel]);

  // File and Photo Attachments State
  const [attachedFiles, setAttachedFiles] = useState<ChatAttachment[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<{ url: string; name: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Process selected, dropped, or pasted files
  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);
    const newAttachments: ChatAttachment[] = [];

    for (const file of files) {
      try {
        if (file.size > 15 * 1024 * 1024) {
          alert(`File "${file.name}" exceeds the 15MB size limit. Please choose a smaller file.`);
          continue;
        }

        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name);
        const fileId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        if (isImage) {
          try {
            // Compress high-res image using HTML5 Canvas (max 1600px, 85% JPEG)
            const compressed = await compressImageForOcr(file, 1600, 0.85);
            newAttachments.push({
              id: fileId,
              name: file.name,
              type: compressed.mimeType || 'image/jpeg',
              size: compressed.compressedSize || file.size,
              data: compressed.base64,
              previewUrl: compressed.base64,
              isImage: true,
            });
          } catch (err) {
            console.warn('Canvas compression fallback to standard reader:', err);
            const base64Data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve((e.target?.result as string) || '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(file);
            });
            if (base64Data) {
              newAttachments.push({
                id: fileId,
                name: file.name,
                type: file.type || 'image/jpeg',
                size: file.size,
                data: base64Data,
                previewUrl: base64Data,
                isImage: true,
              });
            }
          }
        } else {
          // Document / spreadsheet / text file
          let textContent = '';
          const isTextLike = 
            file.type.startsWith('text/') || 
            file.type.includes('json') || 
            file.type.includes('csv') || 
            /\.(csv|txt|json|tsv|log|md|xml|yaml|yml)$/i.test(file.name);

          if (isTextLike) {
            try {
              textContent = await file.text();
            } catch (err) {
              console.warn('Failed to read file as text:', err);
            }
          }

          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });

          newAttachments.push({
            id: fileId,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: base64Data,
            textContent: textContent || undefined,
            isImage: false,
          });
        }
      } catch (err: any) {
        console.error('Failed to process file attachment:', err);
      }
    }

    setAttachedFiles((prev) => [...prev, ...newAttachments]);
    setIsProcessingFiles(false);
  };

  // Clipboard Paste Handler (e.g. screenshots from clipboard)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      processFiles(pastedFiles);
    }
  };

  // Auto scroll to bottom when message arrives
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isLoading]);

  // Client-Side PDF Generation Bridge: Executes jsPDF export routines based on AI tool output
  const triggerClientPdfExport = (config: any) => {
    if (!config) return;
    const { reportType, data, exportPdfOptions } = config;
    const staffName = currentStaffUser?.name || 'Aura AI Copilot';

    try {
      if (reportType === 'daily_profit_dossier') {
        if (data?.dailyFinancials) {
          exportDailyProfitDossierPdf({
            selectedDate: data.selectedDate,
            displayFormattedDate: data.displayFormattedDate,
            dailyFinancials: data.dailyFinancials,
            dailyExpenses: data.dailyExpenses || [],
            settings: { ...settings, ...data.settings },
            staffName: data.staffName || staffName,
          });
        }
      } else if (reportType === 'daily_profit_statement') {
        if (data?.dailyFinancials) {
          exportDailyProfitStatementPdf({
            selectedDate: data.selectedDate,
            displayFormattedDate: data.displayFormattedDate,
            dailyFinancials: data.dailyFinancials,
            dailyExpenses: data.dailyExpenses || [],
            settings: { ...settings, ...data.settings },
            staffName: data.staffName || staffName,
          });
        }
      } else if (reportType === 'daily_profit_ledger') {
        if (data?.dailyFinancials) {
          exportDailyProfitLedgerPdf({
            selectedDate: data.selectedDate,
            displayFormattedDate: data.displayFormattedDate,
            dailyFinancials: data.dailyFinancials,
            dailyExpenses: data.dailyExpenses || [],
            settings: { ...settings, ...data.settings },
            staffName: data.staffName || staffName,
          });
        }
      } else if (reportType === 'annual_profit_statement') {
        if (data?.annualData) {
          exportAnnualProfitStatementPdf({
            annualData: data.annualData,
            settings: { ...settings, ...data.settings },
            staffName: data.staffName || staffName,
          });
        }
      } else if (reportType === 'annual_profit_dossier') {
        if (data?.annualData) {
          exportAnnualProfitDossierPdf({
            annualData: data.annualData,
            settings: { ...settings, ...data.settings },
            staffName: data.staffName || staffName,
          });
        }
      } else if (reportType === 'gpt_cost_comparison' || reportType === 'ai_model_pricing') {
        exportGptCostComparisonPdf({ ...settings, currentStaffName: staffName });
      } else if (exportPdfOptions) {
        exportReportToPdf({
          ...exportPdfOptions,
          settings: {
            ...settings,
            currentStaffName: staffName,
          },
        });
      } else if (reportType === 'inventory_catalog') {
        const todayStr = new Date().toISOString().slice(0, 10);
        exportReportToPdf({
          title: 'INVENTORY CATALOG & VALUATION REPORT',
          subtitle: `Store Inventory as of ${todayStr}`,
          filename: `inventory_catalog_${todayStr}.pdf`,
          headers: ['SKU', 'Product Name', 'Brand', 'Category', 'Stock', 'Selling Price', 'Cost Price'],
          rows: products.map((p) => [
            p.sku || '-',
            p.name,
            p.brand,
            p.category,
            p.stock,
            formatCurrency(p.sellingPrice, settings.currencySymbol),
            formatCurrency(p.costPrice || 0, settings.currencySymbol),
          ]),
          summaryMetrics: [
            { label: 'Total Products', value: products.length },
            { label: 'Total Stock Units', value: products.reduce((sum, p) => sum + (p.stock || 0), 0) },
          ],
          settings: { ...settings, currentStaffName: staffName },
        });
      }

      // Celebrate successful report generation!
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6, x: 0.8 },
        });
      } catch {
        // ignore
      }
    } catch (exportErr) {
      console.error('[AiChatWidget] Failed to execute client PDF export:', exportErr);
    }
  };

  // Send message to backend OpenAI Function Calling API with Multimodal Vision & Files
  const handleSendMessage = async (textToSend?: string, filesOverride?: ChatAttachment[]) => {
    if (!canAccess) return;
    const filesToSend = filesOverride !== undefined ? filesOverride : attachedFiles;
    let userText = (textToSend !== undefined ? textToSend : inputQuery).trim();

    // If text is empty but files are attached, generate an appropriate contextual prompt
    if (!userText && filesToSend.length > 0) {
      const hasImages = filesToSend.some((f) => f.isImage);
      userText = hasImages
        ? 'Please analyze this attached photo/box sticker and extract specifications, IMEI, or store action.'
        : 'Please inspect and analyze this attached document or file.';
    }

    if (!userText && filesToSend.length === 0) return;
    if (isLoading) return;

    const newMsgId = `usr_${Date.now()}`;
    const userMessageItem: ChatMessageItem = {
      id: newMsgId,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: filesToSend.length > 0 ? [...filesToSend] : undefined,
    };

    setMessages((prev) => [...prev, userMessageItem]);
    setInputQuery('');
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      // Build conversation history payload
      const historyPayload = messages
        .filter((m) => m.id !== 'msg_welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      // Gather live POS data context
      const posContext = {
        products,
        sales,
        expenses,
        purchases,
        cashDrawer,
        stockAdjustments,
        currencySymbol: settings.currencySymbol || 'MMK',
      };

      // Sanitize settings so no secrets are passed
      const safeSettings = { ...settings };
      delete (safeSettings as any).secrets;

      const response = await authenticatedFetch('/api/chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: historyPayload,
          model: selectedModel,
          language: chatLanguage,
          context: {
            ...posContext,
            settings: safeSettings,
          },
          attachments: filesToSend.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.size,
            data: f.data,
            textContent: f.textContent,
            isImage: f.isImage,
          })),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        if (data.missingApiKey) {
          setApiKeyWarning(data.error || 'OPENAI_API_KEY is not configured in the server environment.');
        }
        throw new Error(data.error || 'Failed to receive response from AI Assistant.');
      } else {
        setApiKeyWarning(null);
      }

      // If an inventory item was created by the tool call, persist it into StorageService!
      if (data.createdProduct) {
        StorageService.saveProduct(data.createdProduct);
        // Trigger celebratory confetti effect
        try {
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { y: 0.7, x: 0.8 },
          });
        } catch {
          // ignore
        }
      }

      // If an inventory product price was updated by the tool call, persist update into StorageService!
      if (data.updatedProduct) {
        StorageService.saveProduct(data.updatedProduct);
      }

      // If a Facebook post was generated or published, trigger celebratory confetti
      if (data.facebookPost) {
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6, x: 0.8 },
          });
        } catch {
          // ignore
        }
      }

      // If the AI Assistant triggered PDF report generation, run the client-side jsPDF routine!
      if (data.requiresClientPdfGeneration && data.pdfReportConfig) {
        try {
          triggerClientPdfExport(data.pdfReportConfig);
        } catch (pdfErr) {
          console.error('Error triggering client PDF export:', pdfErr);
        }
      }

      const assistantMsgItem: ChatMessageItem = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolExecuted: data.toolExecuted || undefined,
        createdProduct: data.createdProduct || undefined,
        updatedProduct: data.updatedProduct || undefined,
        facebookPost: data.facebookPost || undefined,
        pdfReport: data.pdfReportConfig
          ? {
              reportType: data.pdfReportConfig.reportType,
              reportName: data.pdfReportConfig.reportName || 'Executive PDF Report',
              filename: data.pdfReportConfig.filename || 'report.pdf',
              config: data.pdfReportConfig,
            }
          : undefined,
      };

      setMessages((prev) => [...prev, assistantMsgItem]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsgItem: ChatMessageItem = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Error**: ${err.message || 'Unable to connect to AI server. Please verify your connection or try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsgItem]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyImei = (imei: string) => {
    navigator.clipboard.writeText(imei);
    setCopiedImei(imei);
    setTimeout(() => setCopiedImei(null), 2000);
  };

  const handleClearHistory = () => {
    if (confirm('Clear assistant conversation history?')) {
      setMessages([
        {
          id: 'msg_welcome_reset',
          role: 'assistant',
          content: `🧹 Conversation history cleared. How can I assist you with POS reports or inventory?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="ai-chat-assistant-modal"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(Array.from(e.dataTransfer.files));
        }
      }}
      onPaste={handlePaste}
      className={`fixed z-50 transition-all duration-300 ease-out flex flex-col bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden ${
        isExpanded
          ? 'inset-4 sm:inset-8 md:inset-12'
          : 'bottom-4 right-4 sm:bottom-6 sm:right-6 w-[94vw] sm:w-[440px] md:w-[480px] h-[640px] max-h-[88vh]'
      }`}
    >
      {/* Drag & Drop Visual Backdrop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-indigo-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white border-2 border-dashed border-indigo-400 m-2 rounded-2xl pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-3 text-emerald-300 shadow-lg">
            <UploadCloud className="w-8 h-8 animate-bounce" />
          </div>
          <p className="text-base font-bold tracking-tight">Drop Photos or Files Here</p>
          <p className="text-xs text-indigo-200 mt-1 text-center max-w-xs">
            Drop phone box stickers, receipts, supplier invoices, or CSV documents for Copilot to analyze.
          </p>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-indigo-900/50 select-none">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-md shadow-indigo-500/20">
            <Bot className="w-4 h-4 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-900 rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 relative">
              <span className="font-semibold text-sm tracking-tight text-white">Aura Copilot</span>
              
              {/* Interactive AI Model Switcher */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className="text-[10px] px-2 py-0.5 bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-200 hover:text-white border border-indigo-400/40 rounded-full font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                  title="Click to switch AI Model for Copilot"
                >
                  <Cpu className="w-2.5 h-2.5 text-indigo-300" />
                  <span>{COPILOT_MODELS.find((m) => m.id === selectedModel)?.name || selectedModel}</span>
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-200 ${showModelMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Model Dropdown Menu */}
                {showModelMenu && (
                  <div className="absolute left-0 top-full mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-xl shadow-2xl z-50 p-2 space-y-1 text-left">
                    <div className="px-2 py-1 flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select AI Model</span>
                      <span className="text-[9px] text-indigo-400 font-mono">Active Model</span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {COPILOT_MODELS.map((m) => {
                        const isActive = m.id === selectedModel;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedModel(m.id);
                              setShowModelMenu(false);
                              try {
                                localStorage.setItem('mobileshop_copilot_model', m.id);
                              } catch {}
                            }}
                            className={`w-full text-left p-2 rounded-lg transition-all flex items-start justify-between gap-2 cursor-pointer ${
                              isActive
                                ? 'bg-indigo-600/30 border border-indigo-500/50 text-white'
                                : 'hover:bg-white/5 text-slate-300 hover:text-white border border-transparent'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold">{m.name}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                  isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {m.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 leading-snug">{m.description}</p>
                            </div>
                            {isActive && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Model Input */}
                    <div className="pt-1.5 mt-1 border-t border-slate-800 px-1">
                      <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                        <span>Custom Model ID:</span>
                        <span className="text-[9px] text-indigo-400 font-mono">e.g. gpt-5.6-luna</span>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          placeholder="Type model ID..."
                          className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customModelInput.trim()) {
                              const clean = customModelInput.trim();
                              setSelectedModel(clean);
                              setShowModelMenu(false);
                              try {
                                localStorage.setItem('mobileshop_copilot_model', clean);
                              } catch {}
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customModelInput.trim()) {
                              const clean = customModelInput.trim();
                              setSelectedModel(clean);
                              setShowModelMenu(false);
                              try {
                                localStorage.setItem('mobileshop_copilot_model', clean);
                              } catch {}
                            }
                          }}
                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-none mt-0.5">POS Actions &amp; Function Calling</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Language Selector: Burmese / English */}
          <div className="flex items-center rounded-lg bg-indigo-950/70 border border-indigo-700/60 p-0.5" id="chat-header-language-toggle">
            <button
              type="button"
              onClick={() => toggleLanguage('my')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                chatLanguage === 'my'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-indigo-200 hover:text-white'
              }`}
              title="Aura replies in Burmese (မြန်မာဘာသာ)"
            >
              🇲🇲 မြန်မာ
            </button>
            <button
              type="button"
              onClick={() => toggleLanguage('en')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                chatLanguage === 'en'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-indigo-200 hover:text-white'
              }`}
              title="Aura replies in English"
            >
              🇺🇸 EN
            </button>
          </div>

          <button
            onClick={handleClearHistory}
            title="Clear Chat History"
            className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize Window' : 'Expand Fullscreen'}
            className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            title="Close Assistant"
            className="p-1.5 text-indigo-300 hover:text-white hover:bg-rose-500/20 hover:text-rose-200 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Access Restricted Screen if User Role has no canAccessAiCopilot permission */}
      {!canAccess ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-slate-50">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">AI Copilot Access Restricted</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Your active role <span className="font-semibold text-slate-800">({currentStaffUser?.role || 'Staff'})</span> does not have authorization to operate Aura AI Copilot.
          </p>

          <div className="mt-5 w-full max-w-xs bg-white rounded-xl p-3 border border-slate-200 text-left space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-medium">Required Security Permission:</span>
            </div>
            <code className="block bg-slate-100 text-slate-800 px-2.5 py-1.5 rounded-lg font-mono text-[11px] border border-slate-200">
              canAccessAiCopilot: true
            </code>
            <p className="text-[11px] text-slate-400 leading-snug">
              Store Owners or Administrators can toggle this access in <span className="font-semibold text-slate-600">Roles &amp; Permissions</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Close Assistant
          </button>
        </div>
      ) : (
        <>
          {/* API Key Missing Fallback Banner */}
          {apiKeyWarning && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">OpenAI API Key Required</p>
                <p className="text-amber-800 text-[11px] mt-0.5 leading-snug">
                  Set <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">OPENAI_API_KEY</code> in your environment or secrets settings to activate Aura Copilot.
                </p>
              </div>
            </div>
          )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-full`}
          >
            <div className="flex items-end gap-2 max-w-[90%] sm:max-w-[85%]">
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 shadow-sm">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`p-3.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                }`}
              >
                {/* Assistant Message with Markdown */}
                {msg.role === 'assistant' ? (
                  <div className="space-y-2">
                    <div className="prose prose-xs max-w-none text-slate-800 prose-p:my-1 prose-headings:my-1.5 prose-strong:text-slate-900 prose-ul:my-1 prose-li:my-0.5">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    {/* Tool Execution Badge */}
                    {msg.toolExecuted && (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Tool: {msg.toolExecuted.name}
                        </span>
                        {msg.toolExecuted.args?.report_type && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Report: {msg.toolExecuted.args.report_type}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Confirmation Card for Created Product */}
                    {msg.createdProduct && (
                      <div className="mt-2.5 p-3 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 border border-emerald-200 rounded-xl">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-emerald-200/60">
                          <div className="flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-emerald-700" />
                            <span className="font-semibold text-xs text-emerald-950">Stock Item Registered</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                            {msg.createdProduct.stock} Unit(s)
                          </span>
                        </div>

                        <div className="mt-2 space-y-1 text-xs text-slate-700">
                          <p className="font-bold text-slate-900">{msg.createdProduct.name}</p>
                          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pt-1">
                            <div><span className="text-slate-400">SKU:</span> <span className="font-mono font-medium text-slate-800">{msg.createdProduct.sku}</span></div>
                            <div><span className="text-slate-400">Cost:</span> <span className="font-semibold text-slate-800">{formatCurrency(msg.createdProduct.costPrice, settings.currencySymbol)}</span></div>
                            <div><span className="text-slate-400">Retail:</span> <span className="font-semibold text-emerald-700">{formatCurrency(msg.createdProduct.sellingPrice, settings.currencySymbol)}</span></div>
                            <div><span className="text-slate-400">Color:</span> <span className="font-medium text-slate-800">{msg.createdProduct.color || '-'}</span></div>
                          </div>

                          {/* IMEIs display */}
                          {msg.createdProduct.imeiList && msg.createdProduct.imeiList.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-emerald-200/60">
                              <span className="text-[10px] font-semibold text-emerald-900 uppercase tracking-wider block mb-1">
                                Serialized IMEIs ({msg.createdProduct.imeiList.length})
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {msg.createdProduct.imeiList.map((im, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleCopyImei(im)}
                                    title="Click to copy IMEI"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white border border-emerald-300/80 rounded font-mono text-[10px] text-slate-800 hover:bg-emerald-100/50 transition-colors"
                                  >
                                    <span>{im}</span>
                                    {copiedImei === im ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5 text-slate-400" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {onNavigateToInventory && (
                          <button
                            onClick={() => {
                              onNavigateToInventory();
                              onClose();
                            }}
                            className="mt-2.5 w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                          >
                            <Package className="w-3.5 h-3.5" />
                            View In Inventory Manager
                          </button>
                        )}
                      </div>
                    )}

                    {/* Confirmation Card for Updated Product Price */}
                    {msg.updatedProduct && (
                      <div className="mt-2.5 p-3 bg-gradient-to-br from-indigo-50/80 to-blue-50/80 border border-indigo-200 rounded-xl">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-indigo-200/60">
                          <div className="flex items-center gap-1.5">
                            <Wand2 className="w-4 h-4 text-indigo-700" />
                            <span className="font-semibold text-xs text-indigo-950">Product Price Updated</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                            Live POS Active
                          </span>
                        </div>

                        <div className="mt-2 space-y-1 text-xs text-slate-700">
                          <p className="font-bold text-slate-900">{msg.updatedProduct.name}</p>
                          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pt-1">
                            <div><span className="text-slate-400">SKU:</span> <span className="font-mono font-medium text-slate-800">{msg.updatedProduct.sku}</span></div>
                            <div><span className="text-slate-400">Stock:</span> <span className="font-medium text-slate-800">{msg.updatedProduct.stock} unit(s)</span></div>
                            <div><span className="text-slate-400">New Selling:</span> <span className="font-bold text-indigo-700 text-xs">{formatCurrency(msg.updatedProduct.sellingPrice, settings.currencySymbol)}</span></div>
                            <div><span className="text-slate-400">Cost:</span> <span className="font-medium text-slate-800">{formatCurrency(msg.updatedProduct.costPrice, settings.currencySymbol)}</span></div>
                          </div>
                        </div>

                        {onNavigateToInventory && (
                          <button
                            onClick={() => {
                              onNavigateToInventory();
                              onClose();
                            }}
                            className="mt-2.5 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                          >
                            <Package className="w-3.5 h-3.5" />
                            View Product in Inventory
                          </button>
                        )}
                      </div>
                    )}

                    {/* Social Media & Facebook Advertisement Post Card */}
                    {msg.facebookPost && (
                      <div className="mt-3 p-3.5 bg-gradient-to-br from-blue-50/90 via-indigo-50/40 to-slate-50 border border-blue-200/90 rounded-2xl shadow-xs space-y-3">
                        {/* Facebook Header */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-blue-200/60">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#1877F2] text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
                              f
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-slate-900 leading-none">
                                  {msg.facebookPost.pageName || 'Facebook Page Post'}
                                </span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              </div>
                              <span className="text-[10px] text-slate-400">
                                Just now • 🌐 Public Post
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              msg.facebookPost.status === 'published_live'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : msg.facebookPost.status === 'failed'
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : 'bg-amber-50 text-amber-700 border-amber-300'
                            }`}
                          >
                            {msg.facebookPost.status === 'published_live'
                              ? '✓ Published to Facebook'
                              : msg.facebookPost.status === 'failed'
                              ? 'Publish Error'
                              : '⚡ Preview Ready'}
                          </span>
                        </div>

                        {/* Product Overview Bar */}
                        <div className="flex items-center justify-between text-xs px-1">
                          <div>
                            <p className="font-bold text-slate-900">{msg.facebookPost.productName}</p>
                            {msg.facebookPost.specsSummary && (
                              <p className="text-[10px] text-slate-500 font-medium">{msg.facebookPost.specsSummary}</p>
                            )}
                          </div>
                          {msg.facebookPost.sellingPrice && (
                            <span className="font-extrabold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              {formatCurrency(msg.facebookPost.sellingPrice, settings.currencySymbol)}
                            </span>
                          )}
                        </div>

                        {/* Visual Creative Banner */}
                        {msg.facebookPost.imageUrl && (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200/80 bg-slate-950 group">
                            <img
                              src={msg.facebookPost.imageUrl}
                              alt={msg.facebookPost.productName}
                              className="w-full max-h-56 object-cover object-center group-hover:scale-102 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-2 right-2 bg-black/75 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20">
                              AI Commercial Visual
                            </div>
                            {msg.facebookPost.sellingPrice && (
                              <div className="absolute bottom-2 left-2 bg-[#1877F2]/90 backdrop-blur-sm text-white text-xs font-black px-2.5 py-1 rounded-lg shadow-md">
                                Special Offer: {formatCurrency(msg.facebookPost.sellingPrice, settings.currencySymbol)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Copywriting Caption Snippet */}
                        <div className="space-y-1.5">
                          <div className="p-2.5 bg-white/95 rounded-xl border border-slate-200 text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed text-[11px] font-sans select-text">
                            {msg.facebookPost.caption}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.facebookPost!.caption);
                                setCopiedCaption(msg.facebookPost!.id);
                                setTimeout(() => setCopiedCaption(null), 2000);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-slate-700 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg font-medium transition-colors cursor-pointer shadow-2xs"
                            >
                              {copiedCaption === msg.facebookPost.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Caption Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-500" />
                                  <span>Copy Caption</span>
                                </>
                              )}
                            </button>

                            {msg.facebookPost.status === 'published_live' && msg.facebookPost.postUrl ? (
                              <a
                                href={msg.facebookPost.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open on Facebook
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">
                                Ready for Meta Graph API or direct posting
                              </span>
                            )}
                          </div>

                          {msg.facebookPost.errorMessage && (
                            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[10px] text-rose-700">
                              <span className="font-bold">Meta Notice: </span>
                              {msg.facebookPost.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Executive PDF Report Card */}
                    {msg.pdfReport && (
                      <div className="mt-3 p-3 bg-gradient-to-br from-emerald-50 via-teal-50/70 to-emerald-50 rounded-xl border border-emerald-200/90 shadow-xs space-y-2.5">
                        <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-emerald-950 truncate">
                                {msg.pdfReport.reportName}
                              </p>
                              <p className="text-[10px] text-emerald-700 font-mono truncate">
                                {msg.pdfReport.filename}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100/90 text-emerald-800 border-emerald-300 shrink-0 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Downloaded
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <p className="text-[11px] text-emerald-800 leading-tight">
                            Official client-side PDF generated and downloaded to your device.
                          </p>
                          <button
                            type="button"
                            onClick={() => triggerClientPdfExport(msg.pdfReport!.config)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[11px] font-semibold shadow-xs transition-all cursor-pointer shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Re-download
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Quick PDF Action for GPT Cost & Model Comparison */}
                    {(msg.content.includes('gpt-5') || msg.content.includes('GPT-5') || msg.content.includes('Tokens') || msg.content.includes('token') || msg.content.includes('Luna')) && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400">Official Cost Estimate &amp; Audit</span>
                        <button
                          type="button"
                          onClick={() => exportGptCostComparisonPdf(settings)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300/80 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                          title="Generate and download formatted PDF report"
                        >
                          <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Export Cost Estimate PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* User message attachments gallery */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-2">
                        {/* Image Thumbnails */}
                        {msg.attachments.some((a) => a.isImage) && (
                          <div className="flex flex-wrap gap-2">
                            {msg.attachments
                              .filter((a) => a.isImage)
                              .map((att) => (
                                <div
                                  key={att.id}
                                  onClick={() => setPreviewModalImage({ url: att.previewUrl || att.data, name: att.name })}
                                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/30 bg-black/20 hover:border-white transition-all shadow-xs"
                                  title="Click to zoom photo"
                                >
                                  <img
                                    src={att.previewUrl || att.data}
                                    alt={att.name}
                                    className="w-20 h-20 sm:w-24 sm:h-24 object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                    <Eye className="w-4 h-4 drop-shadow" />
                                  </div>
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 py-0.5 truncate text-center">
                                    {att.name}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* File Badges */}
                        {msg.attachments.some((a) => !a.isImage) && (
                          <div className="flex flex-col gap-1">
                            {msg.attachments
                              .filter((a) => !a.isImage)
                              .map((att) => (
                                <div
                                  key={att.id}
                                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-white/20 border border-white/30 text-white font-medium shadow-2xs"
                                >
                                  {att.name.endsWith('.csv') ? (
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-300 shrink-0" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-indigo-200 shrink-0" />
                                  )}
                                  <span className="truncate max-w-[180px] text-xs">{att.name}</span>
                                  <span className="text-[10px] text-white/70 shrink-0">
                                    ({Math.round((att.size || 0) / 1024)} KB)
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 px-1">
              <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {/* Real-time Loading Status */}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-2 px-1">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-xs">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
              <span className="font-medium text-slate-700">Aura is executing backend action & analyzing reports...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-0.5">
          {chatLanguage === 'my' ? 'မေးမြန်းရန်:' : 'Quick:'}
        </span>
        {(chatLanguage === 'my' ? QUICK_PROMPTS_BURMESE : QUICK_PROMPTS_ENGLISH).map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={() => handleSendMessage(item.prompt)}
              disabled={isLoading}
              className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-full font-medium transition-colors shrink-0 disabled:opacity-50"
            >
              <Icon className="w-3 h-3 text-indigo-600" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* File Processing Spinner Indicator */}
      {isProcessingFiles && (
        <div className="px-4 py-1.5 bg-indigo-50/90 border-t border-indigo-100 flex items-center gap-2 text-xs text-indigo-700">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          <span className="font-medium">Optimizing photo & preparing attachment for Copilot...</span>
        </div>
      )}

      {/* Attached Files Staging Tray */}
      {attachedFiles.length > 0 && (
        <div className="p-2.5 bg-slate-100/95 border-t border-slate-200">
          <div className="flex items-center justify-between pb-1.5 text-[11px] text-slate-600 font-medium">
            <span className="flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
              Attached ({attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''})
            </span>
            <button
              type="button"
              onClick={() => setAttachedFiles([])}
              className="text-[10px] text-rose-600 hover:text-rose-700 font-semibold transition-colors"
            >
              Clear all
            </button>
          </div>

          {/* Horizontal scroll of attachments */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="relative group shrink-0 flex items-center gap-2 p-1.5 pr-6 bg-white border border-slate-200 rounded-xl shadow-2xs"
              >
                {file.isImage ? (
                  <div
                    onClick={() => setPreviewModalImage({ url: file.previewUrl || file.data, name: file.name })}
                    className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0 cursor-pointer hover:opacity-90"
                    title="Click to view full photo"
                  >
                    <img
                      src={file.previewUrl || file.data}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600">
                    {file.name.endsWith('.csv') ? (
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>
                )}

                <div className="min-w-0 max-w-[120px]">
                  <p className="text-xs font-semibold text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {file.size ? `${Math.round(file.size / 1024)} KB` : 'File'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                  className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-rose-600 rounded-full hover:bg-rose-50 transition-colors"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Quick Context Prompts based on Attachment Type */}
          <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1.5 border-t border-slate-200/60">
            <span className="text-[10px] font-semibold text-indigo-700 shrink-0">Photo Action:</span>
            {attachedFiles.some((f) => f.isImage) && (
              <>
                <button
                  type="button"
                  onClick={() => handleSendMessage('Please read this phone box sticker and extract brand, model, specs, and IMEI numbers to add to inventory.')}
                  className="text-[10px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full font-medium shrink-0 border border-indigo-200 transition-colors"
                >
                  📦 Extract Box Specs &amp; IMEI
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('Please inspect this receipt/invoice photo and calculate total purchase expense and line items.')}
                  className="text-[10px] px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full font-medium shrink-0 border border-emerald-200 transition-colors"
                >
                  🧾 Read Receipt &amp; Expense
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('Please analyze the cosmetic condition of this smartphone and recommend its used grading.')}
                  className="text-[10px] px-2 py-0.5 bg-slate-200/80 hover:bg-slate-200 text-slate-700 rounded-full font-medium shrink-0 transition-colors"
                >
                  🔍 Grade Phone Condition
                </button>
              </>
            )}
            {attachedFiles.some((f) => !f.isImage) && (
              <button
                type="button"
                onClick={() => handleSendMessage('Please analyze this attached document/CSV and summarize key data.')}
                className="text-[10px] px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full font-medium shrink-0 border border-purple-200 transition-colors"
              >
                📊 Summarize File Data
              </button>
            )}
          </div>
        </div>
      )}

      {/* Input Form Bar */}
      <div className="p-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-1.5"
        >
          {/* Hidden File Pickers */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.csv,.txt,.json,.tsv,.log,.md"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                processFiles(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
            className="hidden"
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                processFiles(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
            className="hidden"
          />

          {/* Attachment Paperclip Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file or photo (or paste screenshot)"
            disabled={isLoading || isProcessingFiles}
            className="p-2.5 rounded-xl font-medium transition-all shrink-0 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 disabled:opacity-50"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Quick Camera Snap Button */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            title="Take photo of phone box or receipt"
            disabled={isLoading || isProcessingFiles}
            className="p-2.5 rounded-xl font-medium transition-all shrink-0 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder={
              attachedFiles.length > 0 
                ? (chatLanguage === 'my' ? 'တွဲထားသော ဖိုင်/ဓာတ်ပုံအတွက် ညွှန်ကြားချက် ရိုက်ထည့်ပါ...' : 'Add instructions for attached file(s)...')
                : (chatLanguage === 'my' ? 'Z-report၊ လက်ကျန်၊ အရောင်း သို့မဟုတ် IMEI စစ်ဆေးရန် မေးမြန်းပါ...' : 'Ask reports, paste image, or add phone with IMEI...')
            }
            disabled={isLoading}
            className="flex-1 px-3.5 py-2.5 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={(!inputQuery.trim() && attachedFiles.length === 0) || isLoading || isProcessingFiles}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl font-medium transition-colors shadow-sm disabled:shadow-none shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span>GPT-4o-mini Vision &amp; OCR Enabled</span>
          </span>
          <span>Paste screenshot or drop files</span>
        </div>
      </div>
        </>
      )}

      {/* Photo Preview Lightbox Modal */}
      {previewModalImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
          onClick={() => setPreviewModalImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] w-full flex flex-col items-center bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="w-full px-4 py-3 bg-black/50 backdrop-blur-md flex items-center justify-between border-b border-white/10 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold truncate">{previewModalImage.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewModalImage.url}
                  download={previewModalImage.name}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs"
                  title="Download Image"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewModalImage(null)}
                  className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors"
                  title="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image View */}
            <div className="p-3 sm:p-6 flex items-center justify-center overflow-auto max-h-[75vh]">
              <img
                src={previewModalImage.url}
                alt={previewModalImage.name}
                className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
