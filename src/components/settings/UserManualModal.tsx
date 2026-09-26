import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileDown, 
  BookOpen, 
  Download, 
  Search, 
  ShieldCheck, 
  ShoppingCart, 
  Boxes, 
  DollarSign, 
  Wrench, 
  HelpCircle, 
  CheckCircle2, 
  FileText,
  Printer,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { ShopSettings } from '../../types';
import { 
  USER_MANUAL_METADATA, 
  USER_MANUAL_SECTIONS, 
  downloadUserManualMarkdownFile,
  ManualSection 
} from '../../data/userManualContent';
import { 
  USER_MANUAL_BURMESE_METADATA, 
  USER_MANUAL_BURMESE_SECTIONS, 
  downloadUserManualBurmeseMarkdownFile,
  ManualSectionBurmese 
} from '../../data/userManualContentBurmese';
import { exportUserManualPdf } from '../../utils/userManualPdfExport';
import { exportUserManualBurmesePdf, openBurmeseUserManualPrintWindow } from '../../utils/userManualBurmesePdfExport';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  'system-overview': <BookOpen className="w-4 h-4 text-indigo-500" />,
  'role-based-access': <ShieldCheck className="w-4 h-4 text-purple-500" />,
  'core-pos-workflows': <ShoppingCart className="w-4 h-4 text-emerald-500" />,
  'inventory-logistics': <Boxes className="w-4 h-4 text-amber-500" />,
  'financials-reporting': <DollarSign className="w-4 h-4 text-teal-500" />,
  'system-tools-shortcuts': <Wrench className="w-4 h-4 text-rose-500" />,
  'troubleshooting-faq': <HelpCircle className="w-4 h-4 text-blue-500" />,
};

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [language, setLanguage] = useState<'my' | 'en'>('my');
  const [activeSectionId, setActiveSectionId] = useState<string>('system-overview');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const activeMetadata = language === 'my' ? USER_MANUAL_BURMESE_METADATA : USER_MANUAL_METADATA;
  const currentSections = language === 'my' ? USER_MANUAL_BURMESE_SECTIONS : USER_MANUAL_SECTIONS;

  const handleExportPdf = () => {
    try {
      setIsExportingPdf(true);
      setTimeout(() => {
        if (language === 'my') {
          exportUserManualBurmesePdf({ settings, staffName: 'Authorized Staff' });
          setExportSuccess('မြန်မာဘာသာ အသုံးပြုသူလမ်းညွှန် PDF ပြင်ဆင်ပြီးပါပြီ။ ပရင့်ထုတ်ရန် သို့မဟုတ် PDF အဖြစ်သိမ်းရန် အသင့်ဖြစ်ပါပြီ။');
        } else {
          exportUserManualPdf({ settings, staffName: 'Authorized Staff' });
          setExportSuccess('Official Operations Manual PDF generated and downloaded successfully!');
        }
        setIsExportingPdf(false);
        setTimeout(() => setExportSuccess(null), 5000);
      }, 250);
    } catch (err) {
      console.error('Failed to export PDF manual:', err);
      setIsExportingPdf(false);
      alert('Unable to generate PDF. Please try again.');
    }
  };

  const handleDownloadMarkdown = () => {
    if (language === 'my') {
      downloadUserManualBurmeseMarkdownFile(settings.shopName || 'Mobile_Store');
    } else {
      downloadUserManualMarkdownFile(settings.shopName || 'Mobile_Store');
    }
  };

  // Filter sections and subsections if search query is present
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return currentSections;
    const query = searchQuery.toLowerCase();

    return currentSections.filter((sec: any) => {
      const matchTitle = sec.title.toLowerCase().includes(query);
      const matchSummary = sec.summary.toLowerCase().includes(query);
      const matchSub = sec.subsections.some(
        (sub: any) =>
          sub.subtitle.toLowerCase().includes(query) ||
          sub.description.toLowerCase().includes(query) ||
          sub.bulletPoints?.some((bp: string) => bp.toLowerCase().includes(query))
      );
      return matchTitle || matchSummary || matchSub;
    });
  }, [searchQuery, currentSections]);

  const activeSection = useMemo(() => {
    return (
      filteredSections.find((s: any) => s.id === activeSectionId) ||
      filteredSections[0] ||
      currentSections[0]
    );
  }, [filteredSections, activeSectionId, currentSections]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden text-slate-800"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <BookOpen className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {activeMetadata.title}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-medium">
                  {activeMetadata.version}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {settings.shopName || 'Mobile & Gadget Store'} • စာရွက်စာတမ်းနံပါတ်: {activeMetadata.documentControlId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Language Switcher */}
            <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
              <button
                type="button"
                id="btn-manual-lang-my"
                onClick={() => setLanguage('my')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  language === 'my' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="မြန်မာဘာသာဖြင့် ဖတ်ရှုမည်"
              >
                🇲🇲 မြန်မာ
              </button>
              <button
                type="button"
                id="btn-manual-lang-en"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  language === 'en' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Read in English"
              >
                🇬🇧 English
              </button>
            </div>

            {/* Print / Save as PDF Button */}
            <button
              type="button"
              id="btn-print-manual-window"
              onClick={() => {
                if (language === 'my') {
                  openBurmeseUserManualPrintWindow({ settings, staffName: 'Authorized Staff' });
                } else {
                  handleExportPdf();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
              title="Print document or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span>{language === 'my' ? 'ပရင့် / PDF သိမ်းရန်' : 'Print / PDF'}</span>
            </button>

            {/* Quick Export PDF Button in Header */}
            <button
              type="button"
              id="btn-export-manual-pdf-header"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              title={language === 'my' ? 'မြန်မာဘာသာ အသုံးပြုနည်းလမ်းညွှန် PDF ထုတ်ယူမည်' : 'Generate and download full multi-page PDF document'}
            >
              <FileDown className="w-4 h-4" />
              <span>{isExportingPdf ? (language === 'my' ? 'ထုတ်ယူနေဆဲ...' : 'Generating PDF...') : (language === 'my' ? 'PDF ထုတ်ယူမည်' : 'Export PDF')}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
              title="Download raw Markdown documentation"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.md</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer ml-1"
              aria-label="Close manual"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Success toast if PDF was downloaded */}
        {exportSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between text-emerald-800 text-xs font-medium shrink-0 animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
            <span className="text-[11px] text-emerald-600 font-bold">အောင်မြင်ပါသည်</span>
          </div>
        )}

        {/* Main Body: Two-column layout (Sidebar + Content View) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-72 sm:w-80 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
            {/* Search Box */}
            <div className="p-3 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === 'my' ? 'လုပ်ထုံးလုပ်နည်းများ၊ IMEI၊ အရောင်း ရှာရန်...' : 'Search procedures, IMEI, RBAC...'}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Chapter List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Chapters & SOP Workflows
              </div>

              {filteredSections.map((sec) => {
                const isActive = activeSection?.id === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSectionId(sec.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 cursor-pointer ${
                      isActive
                        ? 'bg-white text-slate-900 font-bold shadow-xs border border-indigo-100 ring-1 ring-indigo-500/20'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {SECTION_ICONS[sec.id] || <BookOpen className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs truncate">{sec.number} {sec.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-normal">
                        {sec.subsections.length} procedures • {sec.badge}
                      </p>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-1" />}
                  </button>
                );
              })}

              {filteredSections.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No chapters matched "{searchQuery}"
                </div>
              )}
            </div>

            {/* Sidebar Footer Callout */}
            <div className="p-3 border-t border-slate-200 bg-white/70">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FileDown className="w-4 h-4 text-indigo-400" />
                <span>{isExportingPdf ? 'Rendering PDF...' : 'Download Full PDF'}</span>
              </button>
            </div>
          </div>

          {/* Right Main Content Pane */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white space-y-6">
            {activeSection ? (
              <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-150">
                {/* Section Header Card */}
                <div className="border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100 uppercase tracking-wide">
                      {activeSection.badge}
                    </span>
                    <span className="text-xs text-slate-400">Chapter {activeSection.number}</span>
                  </div>
                  <h1 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">
                    {activeSection.number} {activeSection.title}
                  </h1>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                    {activeSection.summary}
                  </p>
                </div>

                {/* Subsections List */}
                <div className="space-y-8">
                  {activeSection.subsections.map((sub, idx) => (
                    <div key={idx} className="space-y-3">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <span>{sub.subtitle}</span>
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {sub.description}
                      </p>

                      {/* Bullet points */}
                      {sub.bulletPoints && sub.bulletPoints.length > 0 && (
                        <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 space-y-2">
                          {sub.bulletPoints.map((bp, bpIdx) => (
                            <div key={bpIdx} className="flex items-start gap-2.5 text-xs text-slate-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                              <span className="leading-relaxed">{bp}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Data Table */}
                      {sub.tableData && (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs my-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-900 text-white font-semibold">
                                  {sub.tableData.headers.map((h, hIdx) => (
                                    <th key={hIdx} className="py-2.5 px-3.5 border-b border-slate-800 text-[11px]">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {sub.tableData.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className={`py-2 px-3.5 text-slate-700 text-xs ${cIdx === 0 ? 'font-semibold text-slate-900' : ''}`}>
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Callout box */}
                      {sub.callout && (
                        <div className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
                          sub.callout.type === 'warning'
                            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                            : sub.callout.type === 'tip'
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                            : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                        }`}>
                          <div className="shrink-0 mt-0.5">
                            {sub.callout.type === 'warning' && <ShieldCheck className="w-4 h-4 text-amber-600" />}
                            {sub.callout.type === 'tip' && <Sparkles className="w-4 h-4 text-emerald-600" />}
                            {sub.callout.type === 'info' && <FileText className="w-4 h-4 text-indigo-600" />}
                          </div>
                          <div>
                            <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                              {sub.callout.type} Notice
                            </span>
                            <span>{sub.callout.text}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bottom Navigation between chapters */}
                <div className="pt-8 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const curIdx = currentSections.findIndex((s: any) => s.id === activeSection.id);
                      if (curIdx > 0) setActiveSectionId(currentSections[curIdx - 1].id);
                    }}
                    disabled={currentSections.findIndex((s: any) => s.id === activeSection.id) === 0}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    &larr; {language === 'my' ? 'ရှေ့အခန်းသို့' : 'Previous Chapter'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (language === 'my') {
                          openBurmeseUserManualPrintWindow({ settings, staffName: 'Authorized Staff' });
                        } else {
                          handleExportPdf();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-slate-600" />
                      <span>{language === 'my' ? 'ပရင့်ထုတ်ရန်' : 'Print View'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={isExportingPdf}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>{isExportingPdf ? (language === 'my' ? 'ထုတ်ယူနေဆဲ...' : 'Exporting...') : (language === 'my' ? 'မြန်မာဘာသာ PDF ထုတ်ယူမည်' : 'Export Manual to PDF')}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const curIdx = currentSections.findIndex((s: any) => s.id === activeSection.id);
                      if (curIdx < currentSections.length - 1) setActiveSectionId(currentSections[curIdx + 1].id);
                    }}
                    disabled={currentSections.findIndex((s: any) => s.id === activeSection.id) === currentSections.length - 1}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {language === 'my' ? 'နောက်အခန်းသို့' : 'Next Chapter'} &rarr;
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
