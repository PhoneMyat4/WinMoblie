import React, { useState, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, 
  X, 
  Upload, 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Layers, 
  Smartphone, 
  HelpCircle, 
  DollarSign, 
  Package, 
  ArrowRight,
  RefreshCw,
  Eye,
  FileText
} from 'lucide-react';
import { Product, ShopSettings } from '../../types';
import { formatCurrency, formatImei, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { 
  parseBulkCsvProducts, 
  SAMPLE_CSV_TEMPLATES, 
  ParsedCsvProductRow,
  CsvTemplatePreset 
} from '../../utils/csvImportUtils';
import { isPhoneCategory } from '../../data/categoryTaxonomy';

interface BulkProductImportModalProps {
  settings: ShopSettings;
  products: Product[];
  onClose: () => void;
  onBulkSave: (productsToAdd: Product[], mergeWithExisting: boolean) => void;
}

type ModalTab = 'paste' | 'preview' | 'guide';

export const BulkProductImportModal: React.FC<BulkProductImportModalProps> = ({
  settings,
  products,
  onClose,
  onBulkSave,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('paste');
  const [rawText, setRawText] = useState<string>(SAMPLE_CSV_TEMPLATES[0].csvContent);
  const [mergeDuplicates, setMergeDuplicates] = useState<boolean>(true);
  const [filterPreviewStatus, setFilterPreviewStatus] = useState<'all' | 'valid' | 'warning' | 'error'>('all');
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<{ count: number; units: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV/TSV in real-time or memoized
  const parseResult = useMemo(() => {
    return parseBulkCsvProducts(rawText, products, settings);
  }, [rawText, products, settings]);

  const { rows, totalValid, totalErrors, totalUnits, totalValuationCost, totalValuationSelling } = parseResult;

  // Filtered rows for preview
  const filteredRows = useMemo(() => {
    if (filterPreviewStatus === 'valid') {
      return rows.filter(r => r.isValid && r.warnings.length === 0);
    }
    if (filterPreviewStatus === 'warning') {
      return rows.filter(r => r.isValid && r.warnings.length > 0);
    }
    if (filterPreviewStatus === 'error') {
      return rows.filter(r => !r.isValid);
    }
    return rows;
  }, [rows, filterPreviewStatus]);

  // Handle template selection
  const handleSelectTemplate = (preset: CsvTemplatePreset) => {
    setRawText(preset.csvContent);
    setActiveTab('paste');
  };

  // Copy template to clipboard
  const handleCopyTemplate = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTemplateId(id);
    setTimeout(() => {
      setCopiedTemplateId(null);
    }, 2000);
  };

  // Download template as .csv file
  const handleDownloadCsv = (preset: CsvTemplatePreset) => {
    const blob = new Blob([preset.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${preset.id}_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // File Upload Handler (.csv, .tsv, .txt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        setActiveTab('preview');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  // Remove a single row from parsed raw text
  const handleRemoveRow = (rowNumber: number) => {
    const lines = rawText.split(/\r?\n/);
    if (rowNumber > 0 && rowNumber <= lines.length) {
      const updatedLines = lines.filter((_, idx) => idx !== rowNumber - 1);
      setRawText(updatedLines.join('\n'));
    }
  };

  // Execute Bulk Import
  const handleExecuteImport = () => {
    const validProducts = rows.filter(r => r.isValid).map(r => r.product);
    if (validProducts.length === 0) {
      alert('No valid product rows available to import. Please check your data format.');
      return;
    }

    setIsProcessing(true);
    try {
      onBulkSave(validProducts, mergeDuplicates);
      setImportSuccess({
        count: validProducts.length,
        units: totalUnits,
      });

      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1400);
    } catch (err) {
      console.error('Error during bulk import:', err);
      setIsProcessing(false);
      alert('An error occurred while importing products. Please try again.');
    }
  };

  return (
    <div 
      id="bulk-import-modal" 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-modal-content">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Bulk Inventory Import</h2>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md border border-emerald-400/30">
                  CSV / TSV Spreadsheet
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Copy and paste data from Excel, Google Sheets, or CSV text to bulk register multiple products & IMEIs at once.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'paste'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>1. Paste / Upload Data</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>2. Preview & Validation</span>
              {rows.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                  totalErrors > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {totalValid}/{rows.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Column Guide & Format</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs text-[11px]"
              title="Upload CSV, TSV or TXT file"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Upload CSV File</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Paste / Upload Content */}
        {activeTab === 'paste' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            
            {/* Quick Preset Templates Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Quick Template Presets:</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Click a template to load sample rows or copy headers
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {SAMPLE_CSV_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="p-3 bg-slate-50 hover:bg-indigo-50/40 rounded-xl border border-slate-200 transition-all flex flex-col justify-between gap-2"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{tmpl.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{tmpl.description}</p>
                    </div>
                    
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/70">
                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(tmpl)}
                        className="flex-1 py-1 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-bold transition-all cursor-pointer text-center"
                      >
                        Load Sample
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyTemplate(tmpl.csvContent, tmpl.id)}
                        className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md border border-slate-200 transition-all cursor-pointer"
                        title="Copy template CSV to clipboard"
                      >
                        {copiedTemplateId === tmpl.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadCsv(tmpl)}
                        className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md border border-slate-200 transition-all cursor-pointer"
                        title="Download sample CSV file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Paste Data Text Area */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span>Paste Tabular Inventory Data:</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    (Supports Comma, Tab, Semicolon, or Pipe delimiters)
                  </span>
                </label>

                {rawText.trim() && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-600">
                      {rawText.split(/\r?\n/).filter(l => l.trim()).length} line(s) detected
                    </span>
                    <button
                      type="button"
                      onClick={() => setRawText('')}
                      className="text-[11px] text-red-600 hover:underline cursor-pointer font-semibold"
                    >
                      Clear Editor
                    </button>
                  </div>
                )}
              </div>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste CSV rows here... e.g.:&#10;Name,Brand,Category,CostPrice,SellingPrice,Stock,RAM,ROM,Color,IMEIs&#10;Apple iPhone 15 Pro,Apple,new_phones,3400000,3750000,1,8GB,256GB,Natural Titanium,358765123456789 / 358765123456790"
                rows={10}
                className="w-full p-3.5 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden leading-relaxed resize-y placeholder:text-slate-600"
              />
            </div>

            {/* Bottom Parser Action Strip */}
            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-indigo-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>{totalValid} valid products</strong> ready to be verified and imported ({totalUnits} total inventory units).
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <span>Inspect & Preview Data</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        )}

        {/* Tab 2: Preview & Validation Table */}
        {activeTab === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Metric Summary Cards */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 block">Total Rows Parsed</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-slate-900">{rows.length}</span>
                  <span className="text-[11px] text-slate-500">rows</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 block">Valid Products</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-emerald-600">{totalValid}</span>
                  {totalErrors > 0 && (
                    <span className="text-[11px] font-bold text-red-600">({totalErrors} invalid)</span>
                  )}
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 block">Total Stock Units</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-indigo-600">{totalUnits}</span>
                  <span className="text-[11px] text-slate-500">units</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 block">Total Retail Valuation</span>
                <div className="flex items-baseline gap-1 mt-0.5 truncate">
                  <span className="text-base font-black text-slate-900 truncate">
                    {formatCurrency(totalValuationSelling, settings.currencySymbol)}
                  </span>
                </div>
              </div>

            </div>

            {/* Filter & Options Toolbar */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap text-xs shrink-0">
              
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold text-[11px]">Filter:</span>
                
                <button
                  type="button"
                  onClick={() => setFilterPreviewStatus('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterPreviewStatus === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All ({rows.length})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterPreviewStatus('valid')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterPreviewStatus === 'valid'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  Ready ({rows.filter(r => r.isValid && r.warnings.length === 0).length})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterPreviewStatus('warning')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterPreviewStatus === 'warning'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  Warnings ({rows.filter(r => r.isValid && r.warnings.length > 0).length})
                </button>

                {totalErrors > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterPreviewStatus('error')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filterPreviewStatus === 'error'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-50 text-red-800 hover:bg-red-100'
                    }`}
                  >
                    Errors ({totalErrors})
                  </button>
                )}
              </div>

              {/* Duplicate Handling Toggle */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mergeDuplicates}
                    onChange={(e) => setMergeDuplicates(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-[11px]">
                    Auto-restock matching variants (merge stock & IMEIs into existing items)
                  </span>
                </label>
              </div>

            </div>

            {/* Preview Table */}
            <div className="flex-1 overflow-auto p-4">
              {filteredRows.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2 border-2 border-dashed border-slate-200 rounded-2xl">
                  <Package className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-500">No items match the selected filter.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('paste')}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Return to editor
                  </button>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-24">Status</th>
                        <th className="py-2.5 px-3">Product & Brand</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Specs / Color</th>
                        <th className="py-2.5 px-3 text-right">Cost Price</th>
                        <th className="py-2.5 px-3 text-right">Selling Price</th>
                        <th className="py-2.5 px-3 text-center">Stock Units</th>
                        <th className="py-2.5 px-3">IMEIs / Serial Numbers</th>
                        <th className="py-2.5 px-3 text-center w-12">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row) => {
                        const { product, parsedImeis, isValid, errors, warnings, isExistingVariantMatch } = row;
                        return (
                          <tr 
                            key={row.rowNumber}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              !isValid ? 'bg-red-50/40' : isExistingVariantMatch ? 'bg-indigo-50/20' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-[11px]">
                              {row.rowNumber}
                            </td>

                            <td className="py-2.5 px-3">
                              {!isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-[10px] font-bold" title={errors.join(', ')}>
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Error</span>
                                </span>
                              ) : warnings.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold" title={warnings.join(', ')}>
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Warning</span>
                                </span>
                              ) : isExistingVariantMatch ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Restock</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Ready</span>
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{product.name}</div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                                <span className="font-semibold text-slate-700">{product.brand}</span>
                                <span>•</span>
                                <span className="font-mono text-[10px]">{product.sku}</span>
                              </div>
                              {errors.length > 0 && (
                                <div className="text-[10px] font-bold text-red-600 mt-1">
                                  {errors.join(' • ')}
                                </div>
                              )}
                              {warnings.length > 0 && (
                                <div className="text-[10px] font-medium text-amber-700 mt-1">
                                  {warnings.join(' • ')}
                                </div>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold whitespace-nowrap">
                                {getCategoryLabel(product.category)}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {getConditionLabel(product.condition).label}
                              </div>
                            </td>

                            <td className="py-2.5 px-3">
                              {isPhoneCategory(product.category) || Boolean(product.rom && product.rom !== '-') || Boolean(product.imeiPairs?.length) || Boolean(product.imeiList?.length) ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-800 text-[11px]">
                                    {product.ram && product.ram !== '-' ? `${product.ram} / ` : ''}{product.rom}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Color: <span className="font-semibold text-slate-700">{product.color || 'Standard'}</span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">
                                  {product.subCategory || '-'}
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              {formatCurrency(product.costPrice, settings.currencySymbol)}
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-bold font-mono text-xs">
                                {product.stock}
                              </span>
                            </td>

                            <td className="py-2.5 px-3">
                              {parsedImeis.length > 0 ? (
                                <div className="space-y-1 max-w-xs">
                                  <div className="text-[10px] font-bold text-indigo-700">
                                    {parsedImeis.length} device unit(s) serialized:
                                  </div>
                                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                    {parsedImeis.map((pair, pIdx) => (
                                      <span 
                                        key={pIdx}
                                        className="font-mono text-[9px] px-1.5 py-0.5 bg-white rounded border border-slate-200 text-slate-700"
                                        title={pair.imei2 ? `Dual IMEI: ${pair.imei1} / ${pair.imei2}` : `IMEI: ${pair.imei1}`}
                                      >
                                        {pair.imei1.slice(0, 8)}...{pair.imei1.slice(-4)}
                                        {pair.imei2 && <span className="text-indigo-600 font-bold ml-0.5">+D</span>}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.rowNumber)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                title="Remove this row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 3: Format & Template Guide */}
        {activeTab === 'guide' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-5 text-xs text-slate-700">
            
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4">
              <h3 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-600" />
                <span>How CSV & Spreadsheet Bulk Import Works</span>
              </h3>
              <p className="mt-1 text-slate-600 leading-relaxed text-xs">
                You can copy rows directly from Microsoft Excel, Google Sheets, LibreOffice Calc, or any text editor and paste them into the import box.
                The system automatically detects your headers and delimiter (Commas or Tabs).
              </p>
            </div>

            {/* Column Dictionary Table */}
            <div>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-2">
                Supported Column Headers Dictionary
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                      <th className="py-2 px-3">Column Header</th>
                      <th className="py-2 px-3">Required?</th>
                      <th className="py-2 px-3">Accepted Aliases</th>
                      <th className="py-2 px-3">Example Values</th>
                      <th className="py-2 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">Name</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-red-100 text-red-800 font-bold rounded">Required</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">product, item, title, product_name</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">Apple iPhone 15 Pro Max</td>
                      <td className="py-2 px-3 text-slate-600">Product or device model name.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">Brand</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">brand, make, manufacturer</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">Apple, Samsung, Xiaomi</td>
                      <td className="py-2 px-3 text-slate-600">Brand name (auto-detected from Name prefix if omitted).</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">Category</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">type, cat, product_category</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">new_phones, used_phones, accessories, gadgets</td>
                      <td className="py-2 px-3 text-slate-600">Defaults to new_phones or accessories based on title.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">CostPrice</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">cost, cost_price, buy_price, purchase_cost</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">3200000</td>
                      <td className="py-2 px-3 text-slate-600">Supplier acquisition unit cost in Kyats.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">SellingPrice</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-red-100 text-red-800 font-bold rounded">Required</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">price, selling_price, retail_price</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">3500000</td>
                      <td className="py-2 px-3 text-slate-600">Standard retail selling price in Kyats.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">Stock</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">qty, quantity, count, units</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">5</td>
                      <td className="py-2 px-3 text-slate-600">Physical stock units available. Auto-matches IMEI count if IMEIs provided.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">RAM / ROM</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">ram, rom, storage, memory</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">8GB, 256GB</td>
                      <td className="py-2 px-3 text-slate-600">Memory & Storage specifications.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">Color</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">color, colour, finish</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">Natural Titanium, Midnight</td>
                      <td className="py-2 px-3 text-slate-600">Device casing finish color.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">IMEIs</td>
                      <td className="py-2 px-3"><span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded">Optional</span></td>
                      <td className="py-2 px-3 font-mono text-slate-500">imei, imeis, serials, imei_list</td>
                      <td className="py-2 px-3 font-mono text-slate-800">358765.../358765...; 35999...</td>
                      <td className="py-2 px-3 text-slate-600">
                        Dual IMEIs separated by <code className="bg-slate-100 px-1 rounded">/</code> and multiple units separated by <code className="bg-slate-100 px-1 rounded">;</code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Template Download Actions */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <h5 className="font-bold text-slate-900 text-xs">Ready-to-use CSV Templates</h5>
                <p className="text-[11px] text-slate-500">Download formatted blank templates for Excel or Google Sheets</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadCsv(SAMPLE_CSV_TEMPLATES[0])}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs text-[11px]"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Download Phone CSV Template</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          
          <div className="flex items-center gap-2 text-xs text-slate-600">
            {importSuccess ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Successfully added {importSuccess.count} products ({importSuccess.units} units)!</span>
              </span>
            ) : totalValid > 0 ? (
              <span className="font-medium">
                Ready to import <strong className="text-slate-900">{totalValid} product(s)</strong> with <strong className="text-indigo-700">{totalUnits} total units</strong>.
              </span>
            ) : (
              <span className="text-slate-400">
                Paste or upload CSV rows to begin importing.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
            >
              Cancel
            </button>

            <button
              type="button"
              id="confirm-bulk-import-btn"
              onClick={handleExecuteImport}
              disabled={totalValid === 0 || isProcessing}
              className={`inline-flex items-center gap-2 px-5 py-2 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md ${
                totalValid > 0 && !isProcessing
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Importing Products...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Import {totalValid} Products to Inventory</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
