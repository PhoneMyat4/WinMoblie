import React from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Sliders,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Box,
  RotateCcw,
  Check,
  Store,
  User,
  ShoppingBag,
  DollarSign,
  QrCode,
  ShieldCheck,
  PenTool,
  FileText,
  Palette
} from 'lucide-react';
import { InvoiceCustomization, InvoiceSectionKey, InvoiceSectionStyle } from '../../types';
import {
  DEFAULT_INVOICE_SECTION_ORDER,
  DEFAULT_INVOICE_SECTION_STYLES,
  INVOICE_SECTIONS_META,
  INVOICE_LAYOUT_PRESETS,
  resolveSectionOrder,
  resolveSectionStyle
} from '../../utils/invoiceLayoutUtils';

interface InvoiceVisualLayoutEditorProps {
  customization: InvoiceCustomization;
  selectedSection: InvoiceSectionKey;
  onSelectSection: (key: InvoiceSectionKey) => void;
  onChangeCustomization: (updater: (prev: InvoiceCustomization) => InvoiceCustomization) => void;
  onSwitchToContentTab?: (sectionKey: InvoiceSectionKey) => void;
}

export const InvoiceVisualLayoutEditor: React.FC<InvoiceVisualLayoutEditorProps> = ({
  customization,
  selectedSection,
  onSelectSection,
  onChangeCustomization,
  onSwitchToContentTab,
}) => {
  const sectionOrder = resolveSectionOrder(customization);
  const currentStyle = resolveSectionStyle(selectedSection, customization);
  const selectedMeta = INVOICE_SECTIONS_META[selectedSection];

  // Helper to reorder sections
  const handleMoveSection = (key: InvoiceSectionKey, direction: 'up' | 'down') => {
    const index = sectionOrder.indexOf(key);
    if (index === -1) return;
    const newOrder = [...sectionOrder];

    if (direction === 'up' && index > 0) {
      const temp = newOrder[index - 1];
      newOrder[index - 1] = newOrder[index];
      newOrder[index] = temp;
    } else if (direction === 'down' && index < newOrder.length - 1) {
      const temp = newOrder[index + 1];
      newOrder[index + 1] = newOrder[index];
      newOrder[index] = temp;
    }

    onChangeCustomization((prev) => ({
      ...prev,
      sectionOrder: newOrder,
      activePreset: 'custom',
    }));
  };

  // Helper to toggle visibility of a section
  const handleToggleVisibility = (key: InvoiceSectionKey, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const style = resolveSectionStyle(key, customization);
    const newVisible = !style.visible;

    onChangeCustomization((prev) => ({
      ...prev,
      sectionStyles: {
        ...(prev.sectionStyles || {}),
        [key]: {
          ...(prev.sectionStyles?.[key] || {}),
          visible: newVisible,
        },
      },
      activePreset: 'custom',
    }));
  };

  // Helper to update specific style property
  const handleUpdateStyle = (key: InvoiceSectionKey, updates: Partial<InvoiceSectionStyle>) => {
    onChangeCustomization((prev) => ({
      ...prev,
      sectionStyles: {
        ...(prev.sectionStyles || {}),
        [key]: {
          ...(prev.sectionStyles?.[key] || {}),
          ...updates,
        },
      },
      activePreset: 'custom',
    }));
  };

  // Apply a ready-made preset
  const handleApplyPreset = (presetId: 'modern_card' | 'official' | 'compact' | 'classic') => {
    const preset = INVOICE_LAYOUT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    onChangeCustomization((prev) => ({
      ...prev,
      sectionOrder: [...preset.sectionOrder],
      sectionStyles: { ...preset.sectionStyles },
      activePreset: preset.id,
    }));
  };

  // Reset to default layout
  const handleResetDefault = () => {
    onChangeCustomization((prev) => ({
      ...prev,
      sectionOrder: [...DEFAULT_INVOICE_SECTION_ORDER],
      sectionStyles: { ...DEFAULT_INVOICE_SECTION_STYLES },
      activePreset: 'classic',
    }));
  };

  // Icon renderer
  const renderSectionIcon = (iconName: string, className = 'w-4 h-4') => {
    switch (iconName) {
      case 'store':
        return <Store className={className} />;
      case 'user':
        return <User className={className} />;
      case 'shopping-bag':
        return <ShoppingBag className={className} />;
      case 'dollar-sign':
        return <DollarSign className={className} />;
      case 'qr-code':
        return <QrCode className={className} />;
      case 'shield-check':
        return <ShieldCheck className={className} />;
      case 'pen-tool':
        return <PenTool className={className} />;
      case 'sparkles':
      default:
        return <Sparkles className={className} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: One-Click Figma Layout Presets */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-5 rounded-3xl text-white shadow-md relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <Palette className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-black tracking-tight text-white uppercase">
                Modular Piece-by-Piece Layout Canvas
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 text-[10px] font-bold">
                Figma-Style
              </span>
            </div>
            <p className="text-xs text-blue-200/80 mt-1">
              Reorder any piece on the invoice, customize individual box styling, toggle visibility, and align content.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetDefault}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/15 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Layout
          </button>
        </div>

        {/* 1-Click Presets Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 relative z-10">
          {INVOICE_LAYOUT_PRESETS.map((preset) => {
            const isActive = customization.activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
                className={`p-3 rounded-2xl text-left transition-all border cursor-pointer relative ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-400/40'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                    {preset.badge}
                  </span>
                  {isActive && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="text-xs font-black mt-1 line-clamp-1">{preset.name}</div>
                <p className="text-[10px] opacity-75 mt-0.5 line-clamp-1">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Split Panel: Layers Stack (Left) + Property Inspector (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        
        {/* Left Column: Figma Layers Stack (5 cols) */}
        <div className="md:col-span-5 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Invoice Layers ({sectionOrder.length})
              </h4>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Top to Bottom order</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Click any section to inspect its properties. Use arrows to reorder, or the eye to show/hide.
          </p>

          {/* Section Stack */}
          <div className="space-y-1.5">
            {sectionOrder.map((key, index) => {
              const meta = INVOICE_SECTIONS_META[key];
              const style = resolveSectionStyle(key, customization);
              const isSelected = selectedSection === key;
              const isFirst = index === 0;
              const isLast = index === sectionOrder.length - 1;

              return (
                <div
                  key={key}
                  onClick={() => onSelectSection(key)}
                  className={`group p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                      : style.visible
                      ? 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/90 hover:border-slate-300'
                      : 'bg-slate-100/50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`p-1.5 rounded-xl shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 group-hover:text-blue-600'
                      }`}
                    >
                      {renderSectionIcon(meta?.iconName || 'sparkles', 'w-3.5 h-3.5')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold truncate ${
                            isSelected ? 'text-blue-950 font-black' : 'text-slate-900'
                          }`}
                        >
                          {meta?.shortLabel || key}
                        </span>
                        {!style.visible && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 text-[9px] font-bold">
                            Hidden
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="capitalize">{style.boxStyle}</span>
                        <span>•</span>
                        <span className="capitalize">{style.alignment}</span>
                        <span>•</span>
                        <span className="capitalize">{style.spacing}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar for Layer */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Up Arrow */}
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => handleMoveSection(key, 'up')}
                      title="Move Up"
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        isFirst
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'text-slate-500 hover:bg-white hover:text-blue-600'
                      }`}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>

                    {/* Down Arrow */}
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => handleMoveSection(key, 'down')}
                      title="Move Down"
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        isLast
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'text-slate-500 hover:bg-white hover:text-blue-600'
                      }`}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Visibility Eye Toggle */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleVisibility(key, e)}
                      title={style.visible ? 'Hide from invoice' : 'Show on invoice'}
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        style.visible
                          ? 'text-slate-500 hover:bg-white hover:text-rose-600'
                          : 'text-rose-500 hover:bg-white hover:text-emerald-600 font-bold'
                      }`}
                    >
                      {style.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Figma Property Inspector (7 cols) */}
        <div className="md:col-span-7 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
          {/* Header of Inspector */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                {renderSectionIcon(selectedMeta?.iconName || 'sparkles', 'w-5 h-5')}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900">{selectedMeta?.title}</h4>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
                    {selectedMeta?.tag}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{selectedMeta?.description}</p>
              </div>
            </div>

            {/* Quick jump to content button */}
            {onSwitchToContentTab && (
              <button
                type="button"
                onClick={() => onSwitchToContentTab(selectedSection)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200 transition-colors shrink-0 cursor-pointer"
              >
                Edit Content →
              </button>
            )}
          </div>

          {/* Visibility Switch */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  currentStyle.visible ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              ></div>
              <div>
                <span className="text-xs font-bold text-slate-900">Include Piece in Printed Invoice</span>
                <p className="text-[10px] text-slate-500">
                  {currentStyle.visible
                    ? 'Visible on both A5 voucher slips and thermal receipts'
                    : 'Hidden from printed receipts & preview'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggleVisibility(selectedSection)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                currentStyle.visible
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              {currentStyle.visible ? 'Visible' : 'Hidden'}
            </button>
          </div>

          {/* Container Box Style */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-blue-600" />
              Box & Border Styling
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'plain', label: 'Plain', desc: 'No frame box' },
                { id: 'card', label: 'Modern Card', desc: 'Soft bg & rounded border' },
                { id: 'dashed', label: 'Dashed Box', desc: 'Voucher tear-off border' },
                { id: 'bordered', label: 'Solid Border', desc: 'Crisp framed outline' },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleUpdateStyle(selectedSection, { boxStyle: b.id as any })}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    currentStyle.boxStyle === b.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-500/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-bold">{b.label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Content Alignment */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <AlignCenter className="w-3.5 h-3.5 text-indigo-600" />
              Content Alignment
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'left', label: 'Left Aligned', icon: <AlignLeft className="w-3.5 h-3.5" /> },
                { id: 'center', label: 'Centered', icon: <AlignCenter className="w-3.5 h-3.5" /> },
                { id: 'right', label: 'Right Aligned', icon: <AlignRight className="w-3.5 h-3.5" /> },
              ].map((al) => (
                <button
                  key={al.id}
                  type="button"
                  onClick={() => handleUpdateStyle(selectedSection, { alignment: al.id as any })}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                    currentStyle.alignment === al.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {al.icon}
                  <span>{al.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Vertical Spacing / Padding */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                Spacing & Padding
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'compact', label: 'Compact' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'relaxed', label: 'Spacious' },
                ].map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => handleUpdateStyle(selectedSection, { spacing: sp.id as any })}
                    className={`py-2 px-1 text-center rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      currentStyle.spacing === sp.id
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Typography / Font Size Scale */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-600" />
                Section Font Scale
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'small', label: '85% Small' },
                  { id: 'normal', label: '100% Default' },
                  { id: 'large', label: '115% Large' },
                ].map((fs) => (
                  <button
                    key={fs.id}
                    type="button"
                    onClick={() => handleUpdateStyle(selectedSection, { fontSize: fs.id as any })}
                    className={`py-2 px-1 text-center rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      currentStyle.fontSize === fs.id
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {fs.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Order Movement Buttons */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-semibold">Position in Invoice Flow:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleMoveSection(selectedSection, 'up')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Move Up
              </button>
              <button
                type="button"
                onClick={() => handleMoveSection(selectedSection, 'down')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Move Down
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
