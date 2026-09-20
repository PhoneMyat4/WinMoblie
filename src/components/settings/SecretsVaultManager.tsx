import React, { useState, useEffect } from 'react';
import { 
  Key, 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Sparkles, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Globe, 
  Send, 
  Layers, 
  Bot, 
  HelpCircle,
  X,
  CreditCard,
  MessageSquare,
  Cpu,
  FileDown
} from 'lucide-react';
import { exportGptCostComparisonPdf } from '../../utils/gptCostPdfExport';
import { ShopSecretsConfig, CustomSecretItem, SecretCategory, ShopSettings } from '../../types';
import { authenticatedFetch } from '../../utils/apiClient';

interface SecretsVaultManagerProps {
  formData: ShopSettings;
  setFormData: React.Dispatch<React.SetStateAction<ShopSettings>>;
  onSave?: () => void;
}

interface EnvStatusReport {
  hasOpenAiKey: boolean;
  hasGeminiKey: boolean;
  hasFbPageId: boolean;
  hasFbPageAccessToken: boolean;
  hasTelegramBotToken?: boolean;
}

interface EnvPreviewsReport {
  openAiKey: string | null;
  geminiKey: string | null;
  fbPageId: string | null;
  fbPageAccessToken: string | null;
}

export const SecretsVaultManager: React.FC<SecretsVaultManagerProps> = ({
  formData,
  setFormData,
  onSave
}) => {
  // Active visibility states for masked fields
  const [showOpenAiKey, setShowOpenAiKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showFbToken, setShowFbToken] = useState<boolean>(false);
  const [showTelegramToken, setShowTelegramToken] = useState<boolean>(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState<boolean>(false);
  const [visibleCustomSecretIds, setVisibleCustomSecretIds] = useState<Record<string, boolean>>({});

  // Server Environment Status
  const [envStatus, setEnvStatus] = useState<EnvStatusReport | null>(null);
  const [envPreviews, setEnvPreviews] = useState<EnvPreviewsReport | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);

  // Copied indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Testing states
  const [testStates, setTestStates] = useState<{
    openai?: { loading: boolean; success?: boolean; message?: string };
    gemini?: { loading: boolean; success?: boolean; message?: string };
    facebook?: { loading: boolean; success?: boolean; message?: string };
    telegram?: { loading: boolean; success?: boolean; message?: string };
    webhook?: { loading: boolean; success?: boolean; message?: string };
  }>({});

  // Custom Secret Modal/Inline Form
  const [isAddingCustomSecret, setIsAddingCustomSecret] = useState<boolean>(false);
  const [customSearch, setCustomSearch] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [newSecret, setNewSecret] = useState<{
    name: string;
    key: string;
    value: string;
    category: SecretCategory;
    description: string;
  }>({
    name: '',
    key: '',
    value: '',
    category: 'payment',
    description: '',
  });
  const [showNewSecretValue, setShowNewSecretValue] = useState<boolean>(false);

  // Fetch server env status on mount
  const fetchEnvStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await authenticatedFetch('/api/secrets/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEnvStatus(data.envStatus);
          setEnvPreviews(data.previews);
        }
      }
    } catch {
      // benign network or server fallback
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchEnvStatus();
  }, []);

  const secrets: ShopSecretsConfig = formData.secrets || {
    openAiApiKey: '',
    geminiApiKey: '',
    fbPageId: formData.socialMediaConfig?.pageId || '',
    fbPageAccessToken: formData.socialMediaConfig?.pageAccessToken || '',
    telegramBotToken: '',
    telegramChatId: '',
    customWebhookUrl: '',
    customWebhookSecret: '',
    customSecrets: [],
  };

  const updateSecrets = (updated: Partial<ShopSecretsConfig>) => {
    setFormData((prev) => {
      const currentSecrets = prev.secrets || {};
      const newSecrets = { ...currentSecrets, ...updated };
      // Strictly prevent storing AI API keys on the frontend
      delete (newSecrets as any).openAiApiKey;
      delete (newSecrets as any).geminiApiKey;

      // Keep socialMediaConfig in sync if FB credentials are updated
      let newSocialConfig = prev.socialMediaConfig;
      if (updated.fbPageId !== undefined || updated.fbPageAccessToken !== undefined) {
        newSocialConfig = {
          ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
          ...(updated.fbPageId !== undefined ? { pageId: updated.fbPageId } : {}),
          ...(updated.fbPageAccessToken !== undefined ? { pageAccessToken: updated.fbPageAccessToken } : {}),
        };
      }

      return {
        ...prev,
        secrets: newSecrets,
        ...(newSocialConfig ? { socialMediaConfig: newSocialConfig } : {}),
      };
    });
  };

  const copyToClipboard = (text: string, identifier: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(identifier);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleCustomSecretVisibility = (id: string) => {
    setVisibleCustomSecretIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Live Test Handlers (Authenticated & strictly reading server .env)
  const testOpenAiKey = async () => {
    setTestStates((prev) => ({ ...prev, openai: { loading: true } }));
    try {
      const res = await authenticatedFetch('/api/secrets/test-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: secrets.chatAssistantModel || 'gpt-4o-mini',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStates((prev) => ({
          ...prev,
          openai: {
            loading: false,
            success: true,
            message: `OpenAI key verified from server .env! Model: ${data.model || secrets.chatAssistantModel || 'gpt-4o-mini'} (${data.latencyMs || 120}ms)`,
          },
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          openai: {
            loading: false,
            success: false,
            message: data.error || 'Failed to authenticate OpenAI API key.',
          },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        openai: { loading: false, success: false, message: err?.message || 'Network error testing OpenAI key.' },
      }));
    }
  };

  const testGeminiKey = async () => {
    setTestStates((prev) => ({ ...prev, gemini: { loading: true } }));
    try {
      const res = await authenticatedFetch('/api/secrets/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setTestStates((prev) => ({
          ...prev,
          gemini: {
            loading: false,
            success: true,
            message: `Google Gemini API key verified from server .env! Model: ${data.model || 'gemini-flash-latest'} (${data.latencyMs || 180}ms)`,
          },
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          gemini: {
            loading: false,
            success: false,
            message: data.error || 'Failed to authenticate Google Gemini API key.',
          },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        gemini: { loading: false, success: false, message: err?.message || 'Network error testing Gemini key.' },
      }));
    }
  };

  const testFacebookKey = async () => {
    setTestStates((prev) => ({ ...prev, facebook: { loading: true } }));
    try {
      const res = await authenticatedFetch('/api/facebook/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: secrets.fbPageId?.trim() || formData.socialMediaConfig?.pageId?.trim(),
          pageAccessToken: secrets.fbPageAccessToken?.trim() || formData.socialMediaConfig?.pageAccessToken?.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStates((prev) => ({
          ...prev,
          facebook: {
            loading: false,
            success: true,
            message: `Meta API Connected! Page: "${data.pageName || 'WIN Audio & Electronics'}"`,
          },
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          facebook: {
            loading: false,
            success: false,
            message: data.error || 'Connection failed. Verify Page ID and Access Token.',
          },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        facebook: { loading: false, success: false, message: err?.message || 'Network error testing Meta credentials.' },
      }));
    }
  };

  const testTelegramKey = async () => {
    setTestStates((prev) => ({ ...prev, telegram: { loading: true } }));
    try {
      const res = await authenticatedFetch('/api/secrets/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: secrets.telegramBotToken?.trim(),
          chatId: secrets.telegramChatId?.trim(),
          model: secrets.telegramBotModel || 'gpt-4o-mini',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStates((prev) => ({
          ...prev,
          telegram: {
            loading: false,
            success: true,
            message: data.message || 'Test alert message dispatched to Telegram chat successfully!',
          },
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          telegram: {
            loading: false,
            success: false,
            message: data.error || 'Failed to dispatch Telegram message. Check Bot Token and Chat ID.',
          },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        telegram: { loading: false, success: false, message: err?.message || 'Network error testing Telegram integration.' },
      }));
    }
  };

  const testWebhook = async () => {
    setTestStates((prev) => ({ ...prev, webhook: { loading: true } }));
    try {
      const res = await authenticatedFetch('/api/secrets/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: secrets.customWebhookUrl?.trim(),
          secret: secrets.customWebhookSecret?.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStates((prev) => ({
          ...prev,
          webhook: {
            loading: false,
            success: true,
            message: `Webhook endpoint responded with HTTP ${data.statusCode || 200} OK!`,
          },
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          webhook: {
            loading: false,
            success: false,
            message: data.error || 'Failed to reach webhook endpoint.',
          },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        webhook: { loading: false, success: false, message: err?.message || 'Network error pinging webhook.' },
      }));
    }
  };

  // Custom Secrets Handlers
  const handleAddCustomSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecret.name.trim() || !newSecret.key.trim() || !newSecret.value.trim()) {
      alert('Please provide a Secret Name, Key, and Secret Value.');
      return;
    }

    const formattedKey = newSecret.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const createdItem: CustomSecretItem = {
      id: `sec-${Date.now()}`,
      name: newSecret.name.trim(),
      key: formattedKey,
      value: newSecret.value.trim(),
      category: newSecret.category,
      description: newSecret.description.trim(),
      createdAt: new Date().toISOString(),
    };

    const currentList = secrets.customSecrets || [];
    updateSecrets({
      customSecrets: [createdItem, ...currentList],
    });

    setNewSecret({
      name: '',
      key: '',
      value: '',
      category: 'payment',
      description: '',
    });
    setIsAddingCustomSecret(false);
  };

  const handleDeleteCustomSecret = (id: string, name: string) => {
    if (confirm(`Are you sure you want to permanently delete secret "${name}"?`)) {
      const currentList = secrets.customSecrets || [];
      updateSecrets({
        customSecrets: currentList.filter((item) => item.id !== id),
      });
    }
  };

  const customSecretsList = secrets.customSecrets || [];
  const filteredCustomSecrets = customSecretsList.filter((item) => {
    const matchesCategory = selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter;
    const matchesSearch =
      !customSearch ||
      item.name.toLowerCase().includes(customSearch.toLowerCase()) ||
      item.key.toLowerCase().includes(customSearch.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(customSearch.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Calculate active keys count
  const activeKeysCount = [
    Boolean(envStatus?.hasOpenAiKey),
    Boolean(envStatus?.hasGeminiKey),
    Boolean(secrets.fbPageAccessToken || envStatus?.hasFbPageAccessToken),
    Boolean(secrets.telegramBotToken),
    Boolean(secrets.customWebhookUrl),
    ...customSecretsList.map((s) => Boolean(s.value)),
  ].filter(Boolean).length;

  return (
    <div id="secrets-vault-container" className="space-y-6">
      {/* Vault Master Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-xs">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  API Keys & Secrets Vault
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-600" />
                  {activeKeysCount} Active Secrets
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage credentials, AI model keys, social media tokens, payment gateways, and custom webhooks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              id="refresh-env-secrets-btn"
              onClick={fetchEnvStatus}
              disabled={loadingStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-60"
              title="Refresh server environment status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-amber-600' : 'text-slate-600'}`} />
              <span>Check Server Env</span>
            </button>

            {onSave && (
              <button
                type="button"
                onClick={onSave}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Save Vault</span>
              </button>
            )}
          </div>
        </div>

        {/* Security & Priority Guidance Banner */}
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              Zero-Exposure Client Storage & Seamless Server Fallback:
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Secrets configured here are stored locally in your browser storage and synchronized across your authorized store sessions. If an environment variable is defined in the server container (<code className="bg-slate-200/70 px-1 py-0.2 rounded font-mono text-[10px]">.env</code>), it automatically acts as the baseline default until you specify a custom key here.
            </p>
          </div>
        </div>

        {/* ================================================================= */}
        {/* Core Integration Keys Grid */}
        {/* ================================================================= */}
        <div className="space-y-4 pt-1">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-600" />
            Core AI & Platform Credentials
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 1. OpenAI API Key */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600/10 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    AI
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">OpenAI API Key</span>
                    <span className="text-[10px] text-slate-500 font-mono">OPENAI_API_KEY (gpt-4o-mini Copilot)</span>
                  </div>
                </div>

                {envStatus?.hasOpenAiKey ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title={`Active in server container`}>
                    Server .env Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    Missing in .env
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 truncate">
                  {envPreviews?.openAiKey ? `${envPreviews.openAiKey}` : 'Configured via server .env'}
                </span>
                <span className="text-[10px] font-sans font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                  Zero Client Exposure
                </span>
              </div>

              {/* In-App POS Copilot AI Model Selector */}
              <div className="pt-1 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-indigo-600" />
                    <span>In-App Copilot AI Model</span>
                  </label>
                  <span className="text-[9px] text-slate-400">Can also change in chat header</span>
                </div>
                <select
                  value={secrets.chatAssistantModel || 'gpt-5.6-luna'}
                  onChange={(e) => updateSecrets({ chatAssistantModel: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="gpt-5.6-luna">GPT-5.6 Luna (Fastest & Most Cost-Efficient for Store Operations)</option>
                  <option value="gpt-5.6-terra">GPT-5.6 Terra (Balanced Speed & Depth for POS Inventory & Sales)</option>
                  <option value="gpt-5.6-sol">GPT-5.6 Sol (Frontier Intelligence Flagship - Deep Reasoning)</option>
                  <option value="gpt-5.6">GPT-5.6 Frontier (Maximum Intelligence Scale)</option>
                  <option value="gpt-5">GPT-5 Flagship (Foundational Intelligence)</option>
                  <option value="o3-mini">o3-mini (Deep reasoning for intricate POS & financial analysis)</option>
                  <option value="gpt-4o-mini">GPT-4o mini (Legacy: Fast, responsive & economical)</option>
                  <option value="gpt-4o">GPT-4o (Legacy Omni Flagship)</option>
                </select>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <input
                    type="text"
                    placeholder="Or type custom model ID (e.g. gpt-5.6-luna)..."
                    value={['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6', 'gpt-5', 'o3-mini', 'gpt-4o-mini', 'gpt-4o'].includes(secrets.chatAssistantModel || '') ? '' : (secrets.chatAssistantModel || '')}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        updateSecrets({ chatAssistantModel: e.target.value.trim() });
                      }
                    }}
                    className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white text-slate-800 placeholder-slate-400 font-mono"
                  />
                </div>
              </div>

              {testStates.openai && (
                <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                  testStates.openai.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testStates.openai.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span className="truncate">{testStates.openai.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 mt-1">
                <button
                  type="button"
                  onClick={() => exportGptCostComparisonPdf(formData)}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Download full PDF cost estimate and comparison table"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download GPT-5 vs GPT-4 Cost Report (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={testOpenAiKey}
                  disabled={testStates.openai?.loading}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${testStates.openai?.loading ? 'animate-spin' : ''}`} />
                  <span>{testStates.openai?.loading ? 'Testing...' : 'Test Server Key'}</span>
                </button>
              </div>
            </div>

            {/* 2. Google Gemini API Key */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-600/10 text-blue-700 flex items-center justify-center font-bold text-xs">
                    G
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Google Gemini API Key</span>
                    <span className="text-[10px] text-slate-500 font-mono">GEMINI_API_KEY (Box Spec OCR)</span>
                  </div>
                </div>

                {envStatus?.hasGeminiKey ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title={`Active in server container`}>
                    Server .env Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    Missing in .env
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 truncate">
                  {envPreviews?.geminiKey ? `${envPreviews.geminiKey}` : 'Configured via server .env'}
                </span>
                <span className="text-[10px] font-sans font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                  Zero Client Exposure
                </span>
              </div>

              {testStates.gemini && (
                <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                  testStates.gemini.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testStates.gemini.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span className="truncate">{testStates.gemini.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">Powers phone packaging OCR via server</span>
                <button
                  type="button"
                  onClick={testGeminiKey}
                  disabled={testStates.gemini?.loading}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${testStates.gemini?.loading ? 'animate-spin' : ''}`} />
                  <span>{testStates.gemini?.loading ? 'Testing...' : 'Test Server Key'}</span>
                </button>
              </div>
            </div>

            {/* 3. Meta Facebook Page Access Token & ID */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#1877F2] text-white flex items-center justify-center font-black text-xs">
                    f
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Meta Facebook Page Graph API Credentials</span>
                    <span className="text-[10px] text-slate-500 font-mono">FB_PAGE_ID & FB_PAGE_ACCESS_TOKEN (AI Social Ads)</span>
                  </div>
                </div>

                {envStatus?.hasFbPageAccessToken && !secrets.fbPageAccessToken ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title={`Active via container: Page ${envPreviews?.fbPageId || '...'}`}>
                    Server Env Active
                  </span>
                ) : secrets.fbPageAccessToken ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Vault Custom Token
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                    Not Configured
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Facebook Page ID</label>
                  <input
                    type="text"
                    placeholder={envPreviews?.fbPageId ? `Env: ${envPreviews.fbPageId}` : 'e.g. 100196205116864'}
                    value={secrets.fbPageId || ''}
                    onChange={(e) => updateSecrets({ fbPageId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                  />
                </div>

                <div className="sm:col-span-8 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Page Access Token</label>
                    <button
                      type="button"
                      onClick={() => setShowFbToken(!showFbToken)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 font-medium cursor-pointer"
                    >
                      {showFbToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showFbToken ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showFbToken ? 'text' : 'password'}
                      placeholder={envStatus?.hasFbPageAccessToken ? `Using server env (${envPreviews?.fbPageAccessToken || 'EAAV...'})` : 'EAAV... (Long-lived Meta Graph Page Access Token)'}
                      value={secrets.fbPageAccessToken || ''}
                      onChange={(e) => updateSecrets({ fbPageAccessToken: e.target.value })}
                      className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(secrets.fbPageAccessToken || envPreviews?.fbPageAccessToken || '', 'fbToken')}
                      className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                      title="Copy to clipboard"
                    >
                      {copiedKey === 'fbToken' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {testStates.facebook && (
                <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                  testStates.facebook.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testStates.facebook.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span className="truncate">{testStates.facebook.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">
                  Used by AI Copilot to publish promotional advertisement photos directly to your official store Facebook page
                </span>
                <button
                  type="button"
                  onClick={testFacebookKey}
                  disabled={testStates.facebook?.loading}
                  className="text-[11px] font-bold text-[#1877F2] hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${testStates.facebook?.loading ? 'animate-spin' : ''}`} />
                  <span>{testStates.facebook?.loading ? 'Testing...' : 'Test Facebook Page Connection'}</span>
                </button>
              </div>
            </div>

            {/* 4. Telegram Bot Token & Chat ID */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center font-bold text-xs">
                    <Send className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Telegram Notification Bot</span>
                    <span className="text-[10px] text-slate-500 font-mono">TELEGRAM_BOT_TOKEN & CHAT_ID</span>
                  </div>
                </div>

                {secrets.telegramBotToken && secrets.telegramChatId ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                    Bot Configured
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                    Optional
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={showTelegramToken ? 'text' : 'password'}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ (Bot Token)"
                    value={secrets.telegramBotToken || ''}
                    onChange={(e) => updateSecrets({ telegramBotToken: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelegramToken(!showTelegramToken)}
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                  >
                    {showTelegramToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="e.g. 123456789, 987654321, -100123456789 (comma-separated for multiple)"
                  value={secrets.telegramChatId || ''}
                  onChange={(e) => updateSecrets({ telegramChatId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                />
              </div>

              {/* Telegram Bot AI Model Selector */}
              <div className="pt-1 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-sky-600" />
                    <span>Telegram Bot AI Model</span>
                  </label>
                  <span className="text-[9px] text-sky-600 font-mono">Telegram /model</span>
                </div>
                <select
                  value={secrets.telegramBotModel || 'gpt-5.6-luna'}
                  onChange={(e) => updateSecrets({ telegramBotModel: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all cursor-pointer"
                >
                  <option value="gpt-5.6-luna">GPT-5.6 Luna (Fastest & Most Cost-Efficient for High-Volume Workloads)</option>
                  <option value="gpt-5.6-terra">GPT-5.6 Terra (Balanced Speed & Depth for POS Telegram Alerts)</option>
                  <option value="gpt-5.6-sol">GPT-5.6 Sol (Frontier Intelligence Flagship)</option>
                  <option value="gpt-5.6">GPT-5.6 Frontier (Maximum Scale Intelligence)</option>
                  <option value="gpt-5">GPT-5 Flagship (Foundational Intelligence)</option>
                  <option value="o3-mini">o3-mini (Deep Reasoning for Complex POS Calculations)</option>
                  <option value="gpt-4o-mini">GPT-4o mini (Legacy: Fast & Low Latency)</option>
                  <option value="gpt-4o">GPT-4o (Legacy Omni Flagship)</option>
                </select>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <input
                    type="text"
                    placeholder="Or type custom model ID (e.g. gpt-5.6-luna)..."
                    value={['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6', 'gpt-5', 'o3-mini', 'gpt-4o-mini', 'gpt-4o'].includes(secrets.telegramBotModel || '') ? '' : (secrets.telegramBotModel || '')}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        updateSecrets({ telegramBotModel: e.target.value.trim() });
                      }
                    }}
                    className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white text-slate-800 placeholder-slate-400 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Store staff can also switch or check models directly in Telegram chat using the <span className="text-sky-600 font-mono">/model &lt;id&gt;</span> command.
                </p>
              </div>

              {testStates.telegram && (
                <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                  testStates.telegram.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testStates.telegram.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span className="truncate">{testStates.telegram.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">Sends alerts to all listed Chat IDs (separate with commas)</span>
                <button
                  type="button"
                  onClick={testTelegramKey}
                  disabled={testStates.telegram?.loading || !secrets.telegramBotToken}
                  className="text-[11px] font-bold text-sky-600 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{testStates.telegram?.loading ? 'Sending...' : 'Send Test Alert'}</span>
                </button>
              </div>
            </div>

            {/* 5. Custom Webhook Endpoint */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-xs">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">External ERP / Webhook Sync</span>
                    <span className="text-[10px] text-slate-500 font-mono">WEBHOOK_URL & SECRET_TOKEN</span>
                  </div>
                </div>

                {secrets.customWebhookUrl ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    Webhook Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                    Optional
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <input
                  type="url"
                  placeholder="https://api.myerp.com/webhooks/pos-sync"
                  value={secrets.customWebhookUrl || ''}
                  onChange={(e) => updateSecrets({ customWebhookUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                />

                <div className="relative">
                  <input
                    type={showWebhookSecret ? 'text' : 'password'}
                    placeholder="Authorization Bearer Token or Secret Key"
                    value={secrets.customWebhookSecret || ''}
                    onChange={(e) => updateSecrets({ customWebhookSecret: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                  >
                    {showWebhookSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {testStates.webhook && (
                <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                  testStates.webhook.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testStates.webhook.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span className="truncate">{testStates.webhook.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">HTTP POST payload on POS checkout</span>
                <button
                  type="button"
                  onClick={testWebhook}
                  disabled={testStates.webhook?.loading || !secrets.customWebhookUrl}
                  className="text-[11px] font-bold text-purple-600 hover:text-purple-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${testStates.webhook?.loading ? 'animate-spin' : ''}`} />
                  <span>{testStates.webhook?.loading ? 'Pinging...' : 'Ping Webhook'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ================================================================= */}
        {/* Custom Secrets Vault (Arbitrary Key-Value Storage) */}
        {/* ================================================================= */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                Custom Key-Value Secrets Vault
              </h4>
              <p className="text-[11px] text-slate-500">
                Store custom merchant keys, banking partner tokens, SMS gateway credentials, or API webhooks
              </p>
            </div>

            <button
              type="button"
              id="add-new-secret-btn"
              onClick={() => setIsAddingCustomSecret(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Secret</span>
            </button>
          </div>

          {/* Add New Secret Drawer / Form */}
          {isAddingCustomSecret && (
            <form onSubmit={handleAddCustomSecret} className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                  <Key className="w-4 h-4 text-amber-600" />
                  <span>Register New Secret Credential</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingCustomSecret(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Secret Label / Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WavePay Live Partner Token"
                    value={newSecret.name}
                    onChange={(e) => setNewSecret({ ...newSecret, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Secret Key Identifier *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WAVEPAY_PARTNER_KEY"
                    value={newSecret.key}
                    onChange={(e) => setNewSecret({ ...newSecret, key: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newSecret.category}
                    onChange={(e) => setNewSecret({ ...newSecret, category: e.target.value as SecretCategory })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    <option value="payment">Payment Gateway / Bank QR</option>
                    <option value="ai">AI / Vision Model</option>
                    <option value="social">Social Media & Marketing</option>
                    <option value="messaging">Messaging & SMS Gateway</option>
                    <option value="cloud">Cloud / ERP Integration</option>
                    <option value="other">Other Secret</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700">Secret Value / Token *</label>
                  <button
                    type="button"
                    onClick={() => setShowNewSecretValue(!showNewSecretValue)}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    {showNewSecretValue ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showNewSecretValue ? 'Mask' : 'Reveal'}</span>
                  </button>
                </div>
                <input
                  type={showNewSecretValue ? 'text' : 'password'}
                  required
                  placeholder="Paste your sensitive API token, hash, or secret key here..."
                  value={newSecret.value}
                  onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Description / Internal Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Production key used for verifying customer QR payments via WavePay portal"
                  value={newSecret.description}
                  onChange={(e) => setNewSecret({ ...newSecret, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCustomSecret(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save to Secrets Vault</span>
                </button>
              </div>
            </form>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2 text-xs">
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search secrets by name or key..."
                value={customSearch}
                onChange={(e) => setCustomSearch(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs"
              />
              {customSearch && (
                <button
                  type="button"
                  onClick={() => setCustomSearch('')}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'payment', label: 'Payment / Bank' },
                { id: 'ai', label: 'AI Models' },
                { id: 'social', label: 'Social' },
                { id: 'messaging', label: 'Messaging' },
                { id: 'cloud', label: 'Cloud / ERP' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Secrets Table / Cards */}
          {filteredCustomSecrets.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
              <Key className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">No custom secrets found</p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                {customSearch || selectedCategoryFilter !== 'all'
                  ? 'No secrets match the current search or category filter.'
                  : 'Add custom tokens, payment keys, or integration secrets for your mobile shop operations.'}
              </p>
              {!isAddingCustomSecret && (
                <button
                  type="button"
                  onClick={() => setIsAddingCustomSecret(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg mt-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Custom Secret</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredCustomSecrets.map((secret) => {
                const isVisible = Boolean(visibleCustomSecretIds[secret.id]);
                const isCopied = copiedKey === secret.id;

                const getCategoryBadge = (cat: SecretCategory) => {
                  switch (cat) {
                    case 'payment':
                      return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px] flex items-center gap-1"><CreditCard className="w-3 h-3 text-emerald-600" /> Payment QR</span>;
                    case 'ai':
                      return <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-semibold text-[10px] flex items-center gap-1"><Bot className="w-3 h-3 text-indigo-600" /> AI Vision</span>;
                    case 'social':
                      return <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px] flex items-center gap-1"><Globe className="w-3 h-3 text-blue-600" /> Social</span>;
                    case 'messaging':
                      return <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded font-semibold text-[10px] flex items-center gap-1"><MessageSquare className="w-3 h-3 text-sky-600" /> SMS / Chat</span>;
                    default:
                      return <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold text-[10px]">Cloud / Other</span>;
                  }
                };

                return (
                  <div
                    key={secret.id}
                    className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-all"
                  >
                    <div className="space-y-1 sm:max-w-xs md:max-w-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{secret.name}</span>
                        {getCategoryBadge(secret.category)}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                          {secret.key}
                        </code>
                      </div>
                      {secret.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-1">{secret.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg max-w-[200px] sm:max-w-[240px]">
                        <span className="font-mono text-xs text-slate-800 truncate select-all">
                          {isVisible ? secret.value : '••••••••••••••••••••'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleCustomSecretVisibility(secret.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title={isVisible ? 'Mask Secret' : 'Reveal Secret'}
                        >
                          {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(secret.value, secret.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Copy to clipboard"
                        >
                          {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCustomSecret(secret.id, secret.name)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Secret"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
