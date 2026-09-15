import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check, RotateCcw, X } from 'lucide-react';

export interface ColumnDefinition {
  id: string;
  label: string;
  required?: boolean; // Cannot be hidden if required (e.g., Primary Item Name)
  description?: string;
}

interface ColumnVisibilityFilterProps {
  columns: ColumnDefinition[];
  visibleColumns: Record<string, boolean>;
  onChange: (newVisibleColumns: Record<string, boolean>) => void;
  onReset?: () => void;
  buttonLabel?: string;
  align?: 'left' | 'right';
  className?: string;
}

export const ColumnVisibilityFilter: React.FC<ColumnVisibilityFilterProps> = ({
  columns,
  visibleColumns,
  onChange,
  onReset,
  buttonLabel = 'Columns',
  align = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const visibleCount = columns.filter(col => visibleColumns[col.id] !== false).length;
  const totalCount = columns.length;

  const toggleColumn = (colId: string) => {
    const targetCol = columns.find(c => c.id === colId);
    if (targetCol?.required) return; // Prevent disabling mandatory columns

    const isCurrentlyVisible = visibleColumns[colId] !== false;
    
    // Ensure at least 1 column stays visible
    if (isCurrentlyVisible && visibleCount <= 1) return;

    onChange({
      ...visibleColumns,
      [colId]: !isCurrentlyVisible,
    });
  };

  const handleShowAll = () => {
    const allVisible: Record<string, boolean> = {};
    columns.forEach(col => {
      allVisible[col.id] = true;
    });
    onChange(allVisible);
  };

  const handleResetDefaults = () => {
    if (onReset) {
      onReset();
    } else {
      handleShowAll();
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
          isOpen
            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
            : visibleCount < totalCount
            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold hover:bg-indigo-100'
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
        }`}
        title="Customize visible table columns"
      >
        <Columns3 className="w-3.5 h-3.5" />
        <span>{buttonLabel}</span>
        <span
          className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
            isOpen
              ? 'bg-slate-700 text-white'
              : visibleCount < totalCount
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          {visibleCount}/{totalCount}
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-150 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Columns3 className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-extrabold text-slate-900">Customize Columns</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-1 max-h-64 overflow-y-auto space-y-0.5 mt-1">
            {columns.map(col => {
              const isVisible = visibleColumns[col.id] !== false;
              const isReq = !!col.required;

              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => toggleColumn(col.id)}
                  disabled={isReq}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold text-left transition-colors cursor-pointer ${
                    isReq
                      ? 'opacity-60 cursor-not-allowed bg-slate-50 text-slate-500'
                      : isVisible
                      ? 'hover:bg-indigo-50 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                        isVisible
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isVisible && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className={`truncate ${isVisible ? 'font-bold' : 'font-normal'}`}>
                      {col.label}
                    </span>
                  </div>
                  {isReq && (
                    <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.2 bg-slate-200/70 rounded">
                      Locked
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-2 mt-1 border-t border-slate-100 px-1.5 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={handleShowAll}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
