import React from 'react';
import { 
  Bold, 
  Italic, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  DollarSign, 
  Percent, 
  Hash, 
  PlusCircle,
  Sigma,
  Eraser,
  Layers
} from 'lucide-react';

interface ToolbarProps {
  onFormat: (styleKey: string, value: any) => void;
  onInsertFormula: (formula: string) => void;
  onAddRow: () => void;
  onAddCol: () => void;
  onClearSelected?: () => void;
  onAutoSumSelected?: () => void;
  selectedCellsCount?: number;
  selectionLabel?: string;
  theme?: 'dark' | 'light';
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onFormat,
  onInsertFormula,
  onAddRow,
  onAddCol,
  onClearSelected,
  onAutoSumSelected,
  selectedCellsCount = 1,
  selectionLabel = 'A1',
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  const containerClasses = isDark
    ? 'border-slate-800 bg-slate-900 text-slate-300'
    : 'border-slate-200 bg-white text-slate-700 shadow-xs';

  const btnClasses = isDark
    ? 'rounded p-1.5 hover:bg-slate-800 hover:text-white transition'
    : 'rounded p-1.5 hover:bg-slate-100 hover:text-slate-900 transition';

  const dividerClasses = isDark ? 'border-slate-800' : 'border-slate-200';
  const subBtnClasses = isDark
    ? 'rounded bg-slate-800/80 px-2 py-1 text-xs font-medium border border-slate-700 hover:bg-slate-700 hover:text-white transition'
    : 'rounded bg-slate-100 px-2 py-1 text-xs font-medium border border-slate-200 hover:bg-slate-200 hover:text-slate-900 transition';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 select-none ${containerClasses}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Selection badge */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono font-semibold border ${
          isDark 
            ? 'bg-slate-950/80 border-slate-800 text-emerald-400' 
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <Layers className="h-3 w-3" />
          <span>{selectionLabel}</span>
          {selectedCellsCount > 1 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-sans font-medium ${
              isDark ? 'bg-slate-800 text-slate-300' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {selectedCellsCount} cells
            </span>
          )}
        </div>

        {/* Text Formatting */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          <button
            onClick={() => onFormat('bold', true)}
            title="Bold (Selection)"
            className={btnClasses}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => onFormat('italic', true)}
            title="Italic (Selection)"
            className={btnClasses}
          >
            <Italic className="h-4 w-4" />
          </button>
        </div>

        {/* Alignment */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          <button
            onClick={() => onFormat('align', 'left')}
            title="Align Left (Selection)"
            className={btnClasses}
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onFormat('align', 'center')}
            title="Align Center (Selection)"
            className={btnClasses}
          >
            <AlignCenter className="h-4 w-4" />
          </button>
          <button
            onClick={() => onFormat('align', 'right')}
            title="Align Right (Selection)"
            className={btnClasses}
          >
            <AlignRight className="h-4 w-4" />
          </button>
        </div>

        {/* Number Formats */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          <button
            onClick={() => onFormat('format', 'currency')}
            title="Format as Currency ($)"
            className={btnClasses}
          >
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </button>
          <button
            onClick={() => onFormat('format', 'percent')}
            title="Format as Percent (%)"
            className={btnClasses}
          >
            <Percent className="h-4 w-4 text-sky-500" />
          </button>
          <button
            onClick={() => onFormat('format', 'general')}
            title="General Number Format"
            className={btnClasses}
          >
            <Hash className="h-4 w-4 text-amber-500" />
          </button>
        </div>

        {/* Colors */}
        <div className={`flex items-center gap-2 border-r pr-2 ${dividerClasses}`}>
          <div className="flex items-center gap-1">
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Text:</span>
            <input
              type="color"
              onChange={(e) => onFormat('color', e.target.value)}
              defaultValue={isDark ? '#e2e8f0' : '#1e293b'}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Text Color"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fill:</span>
            <input
              type="color"
              onChange={(e) => onFormat('bgColor', e.target.value)}
              defaultValue={isDark ? '#1e293b' : '#f1f5f9'}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Cell Fill Background Color"
            />
          </div>
        </div>

        {/* Multi-Cell Range Operations */}
        <div className={`flex items-center gap-1 border-r pr-2 ${dividerClasses}`}>
          {selectedCellsCount > 1 && onAutoSumSelected && (
            <button
              onClick={onAutoSumSelected}
              className={`flex items-center gap-1 ${subBtnClasses} text-emerald-500 font-semibold`}
              title="Auto-Sum selected numbers"
            >
              <Sigma className="h-3.5 w-3.5" />
              Auto-Sum
            </button>
          )}

          {onClearSelected && (
            <button
              onClick={onClearSelected}
              className={`flex items-center gap-1 ${subBtnClasses} text-red-400 hover:text-red-500`}
              title="Clear contents & formats of selected cell(s)"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Formula Shortcuts */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => onInsertFormula('=SUM()')}
            className={`flex items-center gap-1 ${subBtnClasses} text-emerald-500`}
          >
            <Sigma className="h-3 w-3" />
            SUM
          </button>
          <button
            onClick={() => onInsertFormula('=AVERAGE()')}
            className={`flex items-center gap-1 ${subBtnClasses} text-sky-500`}
          >
            AVERAGE
          </button>
          <button
            onClick={() => onInsertFormula('=IF()')}
            className={`flex items-center gap-1 ${subBtnClasses} text-amber-500`}
          >
            IF
          </button>
        </div>
      </div>

      {/* Grid structure additions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onAddRow}
          className={`flex items-center gap-1 ${subBtnClasses}`}
        >
          <PlusCircle className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs">Row</span>
        </button>
        <button
          onClick={onAddCol}
          className={`flex items-center gap-1 ${subBtnClasses}`}
        >
          <PlusCircle className="h-3.5 w-3.5 text-sky-500" />
          <span className="text-xs">Column</span>
        </button>
      </div>
    </div>
  );
};
