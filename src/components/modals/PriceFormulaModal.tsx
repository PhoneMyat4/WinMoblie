import React, { useState, useEffect } from 'react';
import {
  X,
  Calculator,
  FileText,
  Settings,
  ArrowRight,
  Copy,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Info,
  TrendingUp,
  Percent,
  Layers
} from 'lucide-react';
import {
  FormulaConfig,
  CalculationBreakdown,
  DEFAULT_FORMULA_CONFIG,
  loadFormulaConfig,
  saveFormulaConfig,
  loadFormulaHistory,
  saveFormulaHistory,
  calculateSellingPriceFromFormula,
  parseBatchPriceList,
  ParsedBatchLine
} from '../../utils/pricingFormula';

interface PriceFormulaModalProps {
  initialCost?: number;
  productName?: string;
  currencySymbol?: string;
  zIndexClass?: string;
  onClose: () => void;
  onApplySellingPrice: (sellingPrice: number, breakdown?: CalculationBreakdown) => void;
}

export const PriceFormulaModal: React.FC<PriceFormulaModalProps> = ({
  initialCost = 0,
  productName = '',
  currencySymbol = 'Ks',
  zIndexClass = 'z-[80]',
  onClose,
  onApplySellingPrice,
}) => {
  const [config, setConfig] = useState<FormulaConfig>(() => loadFormulaConfig());
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'settings'>('single');
  
  // Single Calculator State
  const [inputCost, setInputCost] = useState<number>(initialCost || 0);
  const [inputLabel, setInputLabel] = useState<string>(productName || '');
  const [breakdown, setBreakdown] = useState<CalculationBreakdown>(() =>
    calculateSellingPriceFromFormula(initialCost || 0, config, productName)
  );

  // Batch Processor State
  const [batchRawText, setBatchRawText] = useState<string>(
    `iPhone 15 Pro Max 256GB - 3,250,000\nSamsung Galaxy S24 Ultra - 2,890,000\nXiaomi 14 Ultra - 2,150,000\nAirPods Pro 2 - 450,000\n20W USB-C Adapter - 35,000`
  );
  const [batchResults, setBatchResults] = useState<ParsedBatchLine[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedBatch, setCopiedBatch] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<CalculationBreakdown[]>(() => loadFormulaHistory());
  const [appliedFeedback, setAppliedFeedback] = useState<boolean>(false);

  // Settings edit state
  const [tempConfig, setTempConfig] = useState<FormulaConfig>(config);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  // Recalculate when inputCost or config changes
  useEffect(() => {
    const res = calculateSellingPriceFromFormula(inputCost, config, inputLabel);
    setBreakdown(res);
  }, [inputCost, config, inputLabel]);

  // Recalculate batch when text or config changes
  useEffect(() => {
    if (batchRawText.trim()) {
      const parsed = parseBatchPriceList(batchRawText, config);
      setBatchResults(parsed);
    } else {
      setBatchResults([]);
    }
  }, [batchRawText, config]);

  const handleApplyCurrent = () => {
    if (breakdown.finalSellingPrice > 0) {
      // Add to history
      const updatedHistory = [breakdown, ...history.filter(h => h.id !== breakdown.id)].slice(0, 30);
      setHistory(updatedHistory);
      saveFormulaHistory(updatedHistory);

      setAppliedFeedback(true);
      setTimeout(() => {
        onApplySellingPrice(breakdown.finalSellingPrice, breakdown);
      }, 250);
    }
  };

  const handleApplyFromBatch = (item: ParsedBatchLine) => {
    if (item.result && item.result.finalSellingPrice > 0) {
      onApplySellingPrice(item.result.finalSellingPrice, item.result);
    }
  };

  const handleApplyFromHistory = (item: CalculationBreakdown) => {
    onApplySellingPrice(item.finalSellingPrice, item);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setConfig(tempConfig);
    saveFormulaConfig(tempConfig);
    setSettingsSaved(true);
    setTimeout(() => {
      setSettingsSaved(false);
      setActiveTab('single');
    }, 1000);
  };

  const handleResetSettings = () => {
    setTempConfig(DEFAULT_FORMULA_CONFIG);
    setConfig(DEFAULT_FORMULA_CONFIG);
    saveFormulaConfig(DEFAULT_FORMULA_CONFIG);
  };

  const handleCopyBatchResults = () => {
    const lines = batchResults.map((r) => {
      if (r.result) {
        return `${r.label || 'Item'}\tCost: ${r.cost.toLocaleString()}\tSell: ${r.result.finalSellingPrice.toLocaleString()}\tProfit: ${r.result.profit.toLocaleString()}`;
      }
      return `${r.raw} (Invalid)`;
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  return (
    <div
      id="price-formula-modal-overlay"
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/30 border border-indigo-400/40 rounded-xl shadow-xs">
              <Calculator className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Pricing Formula Calculator
                </h3>
                <span className="px-2 py-0.5 bg-indigo-500/40 border border-indigo-400/30 text-indigo-100 rounded-full text-[10px] font-bold">
                  {config.percentageRate}% + {config.fixedOffset.toLocaleString()} {currencySymbol}
                </span>
              </div>
              <p className="text-xs text-indigo-200/90">
                Automated 3-step formula: Base Margin &rarr; Tier Surcharge &rarr; Custom 4th-Digit Rounding
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-100/90 border-b border-slate-200 text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              id="formula-tab-single-btn"
              onClick={() => setActiveTab('single')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'single'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Single Calculator</span>
            </button>

            <button
              type="button"
              id="formula-tab-batch-btn"
              onClick={() => setActiveTab('batch')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'batch'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Batch Price List</span>
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[9px] font-bold">
                Line-by-Line
              </span>
            </button>

            <button
              type="button"
              id="formula-tab-settings-btn"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Formula Rules</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-[11px] text-slate-500 font-medium">
            <Info className="w-3.5 h-3.5 text-indigo-500" />
            <span>Formula: n + ({config.percentageRate}% &times; n + {config.fixedOffset.toLocaleString()}) + Surcharge + Rounding</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* TAB 1: Single Calculator */}
          {activeTab === 'single' && (
            <div className="space-y-6">
              
              {/* Interactive Input Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cost Price (n) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="formula-input-cost"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={inputCost === 0 ? '' : inputCost}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.currentTarget.select()}
                      onChange={(e) => setInputCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {currencySymbol}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Product / Label Reference
                  </label>
                  <input
                    type="text"
                    id="formula-input-label"
                    placeholder="e.g. iPhone 15 Pro 128GB"
                    value={inputLabel}
                    onChange={(e) => setInputLabel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-3 flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={handleApplyCurrent}
                    disabled={breakdown.finalSellingPrice <= 0}
                    className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer ${
                      appliedFeedback
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {appliedFeedback ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Applied!</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        <span>Apply to Selling Price</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Step-by-Step Breakdown Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                
                {/* Step 1: Base Offset (R1) */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Step 1: Initial Margin (R₁)
                    </span>
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded">
                      +{config.percentageRate}% + {config.fixedOffset.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-lg font-black text-slate-900">
                    {currencySymbol} {breakdown.r1.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Base ({breakdown.baseCost.toLocaleString()}) + Margin Offset ({breakdown.r1Offset.toLocaleString()})
                  </p>
                </div>

                {/* Step 2: Tier Surcharge (R2) */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Step 2: Tier Surcharge (R₂)
                    </span>
                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded">
                      +{breakdown.surcharge.toLocaleString()} {currencySymbol}
                    </span>
                  </div>
                  <div className="text-lg font-black text-purple-900">
                    {currencySymbol} {breakdown.r2.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {breakdown.surchargeReason}
                  </p>
                </div>

                {/* Step 3: Custom Rounding */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Step 3: 4th-Digit Rounding
                    </span>
                    <span className="px-1.5 py-0.5 bg-emerald-200/80 text-emerald-900 text-[10px] font-mono font-bold rounded">
                      Digit: {breakdown.fourthDigit} ({breakdown.roundingMethod})
                    </span>
                  </div>
                  <div className="text-xl font-black text-emerald-700">
                    {currencySymbol} {breakdown.finalSellingPrice.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    {breakdown.fourthDigit === 9
                      ? '4th digit is 9 &rarr; Floored to nearest thousand.'
                      : '4th digit is not 9 &rarr; Rounded up to next thousand.'}
                  </p>
                </div>
              </div>

              {/* Profitability Analysis Banner */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Projected Gross Profit & Margin
                    </span>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-xl font-black text-emerald-400">
                        +{currencySymbol} {breakdown.profit.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-300">
                        per unit sold
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 divide-x divide-slate-700 text-xs">
                  <div className="pr-4">
                    <span className="block text-[10px] text-slate-400 uppercase">Gross Margin</span>
                    <strong className="text-sm text-emerald-300 font-bold">{breakdown.marginPercent}%</strong>
                  </div>
                  <div className="pl-4">
                    <span className="block text-[10px] text-slate-400 uppercase">Mark-Up %</span>
                    <strong className="text-sm text-indigo-300 font-bold">{breakdown.markupPercent}%</strong>
                  </div>
                  <div className="pl-4">
                    <button
                      type="button"
                      onClick={handleApplyCurrent}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Set as Selling Price</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Calculations History */}
              {history.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Recent Calculations ({history.length})</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setHistory([]);
                        saveFormulaHistory([]);
                      }}
                      className="text-[11px] text-slate-400 hover:text-rose-600 cursor-pointer font-medium"
                    >
                      Clear History
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {history.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 text-xs transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {item.label || 'Inventory Item'}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center space-x-2">
                            <span>Cost: {currencySymbol}{item.baseCost.toLocaleString()}</span>
                            <span>&bull;</span>
                            <span className="font-bold text-emerald-700">
                              Selling Price: {currencySymbol}{item.finalSellingPrice.toLocaleString()}
                            </span>
                            <span>&bull;</span>
                            <span className="text-slate-400">Profit: +{currencySymbol}{item.profit.toLocaleString()}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplyFromHistory(item)}
                          className="px-3 py-1 bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-400 text-indigo-700 font-bold rounded-lg text-xs cursor-pointer transition-all"
                        >
                          Use Price
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: Batch Price List Processor */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start space-x-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Paste multiple lines or supplier invoice lines:</strong>
                  <span>Supports formats like <code>Product Name - 1,500,000</code> or simply <code>1500000</code>. Each line is automatically processed through the 3-step formula.</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Input Text / Price List (1 item per line)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {batchResults.length} items parsed
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={batchRawText}
                  onChange={(e) => setBatchRawText(e.target.value)}
                  placeholder="iPhone 15 - 1800000&#10;Samsung S24 - 1500000"
                  className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Batch Results Table */}
              {batchResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Calculated Price Table
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyBatchResults}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                    >
                      {copiedBatch ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBatch ? 'Copied Tabular List' : 'Copy All Results'}</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0">
                        <tr>
                          <th className="p-2.5">Item / Reference</th>
                          <th className="p-2.5 text-right">Base Cost</th>
                          <th className="p-2.5 text-right">Calculated Selling</th>
                          <th className="p-2.5 text-right">Profit</th>
                          <th className="p-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {batchResults.map((item, idx) => (
                          <tr key={idx} className="hover:bg-indigo-50/40 transition-colors">
                            <td className="p-2.5 font-semibold text-slate-900">
                              {item.label}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-600">
                              {currencySymbol} {item.cost.toLocaleString()}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                              {item.result ? `${currencySymbol} ${item.result.finalSellingPrice.toLocaleString()}` : '—'}
                            </td>
                            <td className="p-2.5 text-right font-mono text-xs text-slate-600">
                              {item.result ? `+${currencySymbol} ${item.result.profit.toLocaleString()} (${item.result.marginPercent}%)` : '—'}
                            </td>
                            <td className="p-2.5 text-right">
                              {item.result && item.result.finalSellingPrice > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleApplyFromBatch(item)}
                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-bold rounded text-[11px] cursor-pointer transition-colors"
                                >
                                  Apply This
                                </button>
                              ) : (
                                <span className="text-[10px] text-rose-500 font-normal">Invalid</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Formula Rules Configuration */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Formula Rule Parameters</h4>
                    <p className="text-[11px] text-slate-500">Customize the percentage markup, base offset, and tier surcharge thresholds.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetSettings}
                    className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Percentage Markup (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={tempConfig.percentageRate}
                      onChange={(e) => setTempConfig({ ...tempConfig, percentageRate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white"
                    />
                    <span className="text-[10px] text-slate-400">Default: 6%</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fixed Offset ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={tempConfig.fixedOffset}
                      onChange={(e) => setTempConfig({ ...tempConfig, fixedOffset: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white"
                    />
                    <span className="text-[10px] text-slate-400">Default: 20,000 {currencySymbol}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Surcharge Threshold ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={tempConfig.surchargeThreshold}
                      onChange={(e) => setTempConfig({ ...tempConfig, surchargeThreshold: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white"
                    />
                    <span className="text-[10px] text-slate-400">Default: 999,999 (determines low vs high surcharge)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Low Tier (&le; Thresh)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={tempConfig.surchargeLow}
                        onChange={(e) => setTempConfig({ ...tempConfig, surchargeLow: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400">Default: 5,000</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        High Tier (&gt; Thresh)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={tempConfig.surchargeHigh}
                        onChange={(e) => setTempConfig({ ...tempConfig, surchargeHigh: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400">Default: 10,000</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {settingsSaved ? 'Saved Settings!' : 'Save Formula Parameters'}
                  </button>
                </div>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <div className="text-slate-500 font-medium">
            Active: Base + ({config.percentageRate}% &times; n + {config.fixedOffset.toLocaleString()}) + Surcharge + Rounding
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
