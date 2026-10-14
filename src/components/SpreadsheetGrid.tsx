import React, { useState, useEffect, useRef } from 'react';
import { 
  SheetCells, 
  colIndexToLetter, 
  evaluateFormula, 
  isCoordInRange,
  getCellsInRange,
  computeRangeStats
} from '../utils/formulaEngine';
import { Plus, Sigma, Hash, Calculator } from 'lucide-react';

interface SpreadsheetGridProps {
  cells: SheetCells;
  onCellChange: (cellKey: string, value: string, formula?: string) => void;
  selectedCell: string;
  setSelectedCell: (cell: string) => void;
  selectionRange: { start: string; end: string } | null;
  setSelectionRange: (range: { start: string; end: string } | null) => void;
  formulaValue: string;
  setFormulaValue: (val: string) => void;
  rowCount: number;
  colCount: number;
  sheets: string[];
  activeSheet: string;
  setActiveSheet: (sheet: string) => void;
  onAddSheet: () => void;
  collaboratorCursors?: Array<{ userId: string; name: string; cell: string; color: string }>;
  theme?: 'dark' | 'light';
}

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  cells,
  onCellChange,
  selectedCell,
  setSelectedCell,
  selectionRange,
  setSelectionRange,
  setFormulaValue,
  rowCount,
  colCount,
  sheets,
  activeSheet,
  setActiveSheet,
  onAddSheet,
  collaboratorCursors = [],
  theme = 'dark',
}) => {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<string | null>(null);

  const cols = Array.from({ length: colCount }, (_, i) => colIndexToLetter(i));
  const rows = Array.from({ length: rowCount }, (_, i) => i + 1);

  const isDark = theme === 'dark';

  // Compute selected cells array
  const selectedCells = selectionRange 
    ? getCellsInRange(selectionRange.start, selectionRange.end)
    : [selectedCell];

  // Compute live range statistics for multi-cell selection
  const rangeStats = selectedCells.length > 1 ? computeRangeStats(selectedCells, cells) : null;

  // Handle global mouse up to stop drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      setIsMouseDown(false);
      setDragStartCell(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleCellMouseDown = (e: React.MouseEvent, cellKey: string) => {
    if (editingCell) return;

    if (e.shiftKey) {
      // Shift + Click range expansion
      const start = selectionRange?.start || selectedCell;
      setSelectionRange({ start, end: cellKey });
      return;
    }

    setIsMouseDown(true);
    setDragStartCell(cellKey);
    setSelectedCell(cellKey);
    setSelectionRange({ start: cellKey, end: cellKey });

    const cell = cells[cellKey];
    setFormulaValue(cell?.formula || cell?.value || '');
  };

  const handleCellMouseEnter = (cellKey: string) => {
    if (isMouseDown && dragStartCell) {
      setSelectionRange({ start: dragStartCell, end: cellKey });
    }
  };

  const handleCellDoubleClick = (cellKey: string) => {
    setEditingCell(cellKey);
    const cell = cells[cellKey];
    setEditValue(cell?.formula || cell?.value || '');
  };

  const handleCellBlur = (cellKey: string) => {
    if (editingCell === cellKey) {
      if (editValue.startsWith('=')) {
        onCellChange(cellKey, '', editValue);
      } else {
        onCellChange(cellKey, editValue);
      }
      setEditingCell(null);
    }
  };

  // Theming style tokens
  const containerBg = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900';
  const headerBg = isDark ? 'bg-slate-900 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-300';
  const rowNumberBg = isDark ? 'bg-slate-900 text-slate-500 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200';
  const gridBorder = isDark ? 'border-slate-800/70' : 'border-slate-200';
  const cellDefaultBg = isDark ? 'bg-slate-950' : 'bg-white';
  const cellDefaultText = isDark ? '#e2e8f0' : '#1e293b';
  const rangeSelectedBg = isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.20)';

  return (
    <div className={`flex flex-col flex-1 overflow-hidden select-none transition-colors ${containerBg}`}>
      {/* Grid viewport */}
      <div className="flex-1 overflow-auto relative">
        <table className="border-collapse w-full text-left font-sans text-xs">
          <thead>
            <tr className={`sticky top-0 z-20 border-b ${headerBg}`}>
              <th className={`w-12 h-8 border-r text-center font-medium sticky left-0 z-30 ${headerBg}`}>
                #
              </th>
              {cols.map((col) => (
                <th key={col} className={`min-w-[105px] px-3 py-1.5 border-r text-center font-bold text-xs ${headerBg}`}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row} className={`border-b ${gridBorder} ${isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50/80'}`}>
                {/* Row Number Column */}
                <td className={`w-12 h-7 border-r text-center font-semibold text-[11px] sticky left-0 z-10 ${rowNumberBg}`}>
                  {row}
                </td>

                {/* Cells */}
                {cols.map((col) => {
                  const cellKey = `${col}${row}`;
                  const isPrimarySelected = selectedCell === cellKey;
                  const inRange = selectionRange 
                    ? isCoordInRange(cellKey, selectionRange.start, selectionRange.end)
                    : isPrimarySelected;
                  const isEditing = editingCell === cellKey;
                  const cell = cells[cellKey];

                  // Active collaborator cursor on this cell
                  const remoteCollab = collaboratorCursors.find((c) => c.cell === cellKey);

                  // Evaluate formula or format display value
                  let displayValue = '';
                  if (cell) {
                    if (cell.formula) {
                      displayValue = String(evaluateFormula(cell.formula, cells));
                    } else {
                      displayValue = cell.value || '';
                      if (cell.format === 'currency' && !isNaN(Number(displayValue))) {
                        displayValue = `$${Number(displayValue).toFixed(2)}`;
                      } else if (cell.format === 'percent' && !isNaN(Number(displayValue))) {
                        displayValue = `${(Number(displayValue) * 100).toFixed(1)}%`;
                      }
                    }
                  }

                  return (
                    <td
                      key={cellKey}
                      onMouseDown={(e) => handleCellMouseDown(e, cellKey)}
                      onMouseEnter={() => handleCellMouseEnter(cellKey)}
                      onDoubleClick={() => handleCellDoubleClick(cellKey)}
                      style={{
                        backgroundColor: cell?.bgColor 
                          ? cell.bgColor 
                          : inRange 
                            ? rangeSelectedBg 
                            : remoteCollab 
                              ? `${remoteCollab.color}15` 
                              : isDark ? undefined : '#ffffff',
                        color: cell?.color || cellDefaultText,
                        fontWeight: cell?.bold ? 'bold' : 'normal',
                        fontStyle: cell?.italic ? 'italic' : 'normal',
                        textAlign: cell?.align || 'left',
                        boxShadow: remoteCollab && !isPrimarySelected ? `inset 0 0 0 2px ${remoteCollab.color}` : undefined,
                      }}
                      className={`relative px-2 py-1 border-r border-b ${gridBorder} truncate cursor-cell transition-colors ${
                        isPrimarySelected ? 'ring-2 ring-emerald-500 z-15' : inRange ? 'outline-1 outline-emerald-500/60' : ''
                      }`}
                    >
                      {/* Floating Remote Collaborator Name Tag on Top Corner */}
                      {remoteCollab && (
                        <div
                          style={{ backgroundColor: remoteCollab.color }}
                          className="absolute top-0 right-0 z-20 px-1 py-0.5 rounded-bl text-[8.5px] font-bold text-white shadow-sm pointer-events-none whitespace-nowrap leading-none flex items-center gap-1 max-w-[85px] overflow-hidden"
                          title={`${remoteCollab.name} is updating this cell`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
                          <span className="truncate">{remoteCollab.name}</span>
                        </div>
                      )}

                      {/* Cell Value or Edit Input */}
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleCellBlur(cellKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCellBlur(cellKey);
                            }
                          }}
                          autoFocus
                          className={`absolute inset-0 w-full h-full px-2 outline-none font-mono text-xs z-30 border border-emerald-500 ${
                            isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
                          }`}
                        />
                      ) : (
                        <span className="block truncate">{displayValue}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheets bottom bar & Multi-Cell Range Stats Calculation */}
      <div className={`flex flex-wrap items-center justify-between border-t px-4 py-2 transition-colors ${
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
      }`}>
        {/* Left: Sheets Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {sheets.map((sheet) => (
              <button
                key={sheet}
                onClick={() => setActiveSheet(sheet)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  activeSheet === sheet
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isDark 
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {sheet}
              </button>
            ))}
          </div>
          <button
            onClick={onAddSheet}
            title="Add New Sheet"
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              isDark 
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Plus className="h-3.5 w-3.5 text-emerald-500" />
            <span>Add Sheet</span>
          </button>
        </div>

        {/* Right: Multi-Cell Live Calculations Summary Bar (Google Sheets style) */}
        {rangeStats && rangeStats.numericCount > 0 ? (
          <div className={`flex items-center gap-3 px-3 py-1 rounded-xl text-xs font-medium border shadow-inner ${
            isDark 
              ? 'bg-slate-950 border-slate-800 text-slate-300' 
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="flex items-center gap-1 text-emerald-500 font-semibold">
              <Calculator className="h-3.5 w-3.5" />
              <span>Selection:</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>Sum: <strong className="text-emerald-500 font-bold">{rangeStats.sum.toLocaleString()}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Avg: <strong>{rangeStats.avg.toLocaleString()}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Count: <strong>{rangeStats.numericCount}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Min: <strong>{rangeStats.min.toLocaleString()}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Max: <strong>{rangeStats.max.toLocaleString()}</strong></span>
            </div>
          </div>
        ) : selectedCells.length > 1 ? (
          <div className="text-[11px] text-slate-400 font-mono">
            {selectedCells.length} cells selected
          </div>
        ) : null}
      </div>
    </div>
  );
};
