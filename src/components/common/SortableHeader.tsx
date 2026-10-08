import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortableHeaderProps {
  field: string;
  label: React.ReactNode;
  currentSortField: string | null;
  currentSortDirection: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'center' | 'right';
  numeric?: boolean;
  className?: string;
  colSpan?: number;
  title?: string;
  disabled?: boolean;
  width?: number | string;
  minWidth?: number | string;
  resizable?: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  field,
  label,
  currentSortField,
  currentSortDirection,
  onSort,
  align = 'left',
  numeric = false,
  className = '',
  colSpan,
  title,
  disabled = false,
  width,
  minWidth,
  resizable = false,
  onResizeStart,
}) => {
  const isActive = currentSortField === field && currentSortDirection !== null;
  const isAsc = isActive && currentSortDirection === 'asc';
  const isDesc = isActive && currentSortDirection === 'desc';

  const defaultTitle = disabled
    ? undefined
    : title ||
      (isActive
        ? isAsc
          ? numeric
            ? 'Sorted lowest to highest. Click to sort highest to lowest'
            : 'Sorted A to Z. Click to sort Z to A'
          : numeric
            ? 'Sorted highest to lowest. Click to clear sorting'
            : 'Sorted Z to A. Click to clear sorting'
        : numeric
          ? 'Click to sort lowest to highest'
          : 'Click to sort A to Z');

  const alignClasses =
    align === 'center'
      ? 'justify-center text-center'
      : align === 'right'
        ? 'justify-end text-right'
        : 'justify-start text-left';

  const thAlignClass =
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  const styleObj: React.CSSProperties = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    minWidth: minWidth !== undefined ? (typeof minWidth === 'number' ? `${minWidth}px` : minWidth) : undefined,
  };

  if (disabled) {
    return (
      <th
        colSpan={colSpan}
        style={styleObj}
        className={`relative py-3 px-4 select-none ${thAlignClass} ${className} group`}
      >
        <span className="truncate">{label}</span>
        {resizable && onResizeStart && (
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e);
            }}
            onClick={(e) => e.stopPropagation()}
            title="Drag to resize column width"
            className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/70 active:bg-indigo-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <div className="w-0.5 h-3.5 bg-slate-400 rounded-full" />
          </div>
        )}
      </th>
    );
  }

  return (
    <th
      colSpan={colSpan}
      onClick={() => onSort(field)}
      title={defaultTitle}
      aria-sort={isAsc ? 'ascending' : isDesc ? 'descending' : 'none'}
      style={styleObj}
      className={`relative py-3 px-4 select-none cursor-pointer transition-colors duration-150 hover:bg-slate-200/70 active:bg-slate-300/60 group ${thAlignClass} ${
        isActive ? 'bg-indigo-50/80 text-indigo-900 font-black' : ''
      } ${className}`}
    >
      <div className={`inline-flex items-center gap-1.5 ${align === 'center' ? 'w-full' : ''} ${alignClasses}`}>
        <span className="truncate">{label}</span>
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded transition-all shrink-0 ${
            isActive
              ? 'text-indigo-600 bg-indigo-100/90 shadow-2xs'
              : 'text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-slate-700'
          }`}
        >
          {isAsc ? (
            <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
          ) : isDesc ? (
            <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5" />
          )}
        </span>
      </div>

      {resizable && onResizeStart && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(e);
          }}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize column width"
          className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/70 active:bg-indigo-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
        >
          <div className="w-0.5 h-3.5 bg-slate-400 rounded-full" />
        </div>
      )}
    </th>
  );
};

/**
 * Reusable hook to handle table column sorting
 */
export function useTableSort<T>(defaultField: string | null = null, defaultDirection: SortDirection = null) {
  const [sortField, setSortField] = useState<string | null>(defaultField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortItems = (items: T[], comparatorMap: Record<string, (a: T, b: T) => number>): T[] => {
    if (!sortField || !sortDirection || !comparatorMap[sortField]) {
      return items;
    }
    const comparator = comparatorMap[sortField];
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => multiplier * comparator(a, b));
  };

  return { sortField, sortDirection, handleSort, setSortField, setSortDirection, sortItems };
}
