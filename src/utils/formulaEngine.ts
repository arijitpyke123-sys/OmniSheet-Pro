export interface CellData {
  value?: string;
  formula?: string;
  format?: 'general' | 'currency' | 'percent' | 'number' | 'date';
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bgColor?: string;
  align?: 'left' | 'center' | 'right';
  border?: boolean;
}

export type SheetCells = Record<string, CellData>;

// Convert column letter to index (e.g. 'A' -> 0, 'Z' -> 25, 'AA' -> 26)
export function colLetterToIndex(letter: string): number {
  let column = 0;
  const upper = letter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    column += (upper.charCodeAt(i) - 64) * Math.pow(26, upper.length - i - 1);
  }
  return column - 1;
}

// Convert column index to letter (0 -> 'A', 25 -> 'Z', 26 -> 'AA')
export function colIndexToLetter(index: number): string {
  let temp = index + 1;
  let letter = '';
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

// Parse cell coordinate like 'A1' into { col: 0, row: 0 }
export function parseCellCoord(coord: string): { col: number; row: number } | null {
  const match = coord.toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!match) return null;
  const col = colLetterToIndex(match[1]);
  const row = parseInt(match[2], 10) - 1;
  return { col, row };
}

export function cellCoordToString(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

// Expand a range like 'A1:B3' into ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']
export function expandRange(rangeStr: string): string[] {
  const parts = rangeStr.split(':');
  if (parts.length === 1) return [rangeStr.toUpperCase().trim()];
  const start = parseCellCoord(parts[0]);
  const end = parseCellCoord(parts[1]);
  if (!start || !end) return [];

  const cells: string[] = [];
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      cells.push(cellCoordToString(c, r));
    }
  }
  return cells;
}

export function getCellsInRange(startCoord: string, endCoord: string): string[] {
  if (startCoord === endCoord) return [startCoord];
  return expandRange(`${startCoord}:${endCoord}`);
}

export function isCoordInRange(coord: string, startCoord: string, endCoord: string): boolean {
  if (startCoord === endCoord) return coord === startCoord;
  const current = parseCellCoord(coord);
  const start = parseCellCoord(startCoord);
  const end = parseCellCoord(endCoord);
  if (!current || !start || !end) return coord === startCoord;

  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);

  return current.col >= minCol && current.col <= maxCol && current.row >= minRow && current.row <= maxRow;
}

export function computeRangeStats(cellKeys: string[], cells: SheetCells): {
  count: number;
  numericCount: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
} {
  const count = cellKeys.length;
  let numericCount = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const key of cellKeys) {
    const cell = cells[key];
    if (cell) {
      const rawVal = cell.formula ? evaluateFormula(cell.formula, cells) : cell.value;
      const n = Number(rawVal);
      if (rawVal !== '' && rawVal !== undefined && !isNaN(n)) {
        numericCount++;
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }
    }
  }

  const avg = numericCount > 0 ? sum / numericCount : 0;
  return {
    count,
    numericCount,
    sum: Number(sum.toFixed(4)),
    avg: Number(avg.toFixed(2)),
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
  };
}

// Evaluate formula
export function evaluateFormula(formula: string, cells: SheetCells, visited = new Set<string>()): string | number {
  if (!formula.startsWith('=')) return formula;

  const cleanFormula = formula.substring(1).trim().toUpperCase();

  try {
    // Handle VLOOKUP(val, range, colIndex, false)
    const vlookupMatch = cleanFormula.match(/^VLOOKUP\(([^,]+),\s*([A-Z]+[0-9]+:[A-Z]+[0-9]+),\s*([0-9]+),\s*(TRUE|FALSE)\)$/);
    if (vlookupMatch) {
      const searchVal = resolveValue(vlookupMatch[1].trim(), cells, visited);
      const rangeCells = expandRange(vlookupMatch[2].trim());
      const colIndex = parseInt(vlookupMatch[3].trim(), 10) - 1;
      
      // Group by row
      const rowMap = new Map<number, Record<number, string>>();
      rangeCells.forEach(cellKey => {
        const coord = parseCellCoord(cellKey);
        if (!coord) return;
        if (!rowMap.has(coord.row)) rowMap.set(coord.row, {});
        const cellVal = getCellValueRaw(cellKey, cells, visited);
        rowMap.get(coord.row)![coord.col] = cellVal;
      });

      for (const [row, cols] of rowMap.entries()) {
        const firstColVal = cols[Object.keys(cols).map(Number)[0]];
        if (String(firstColVal).toLowerCase() === String(searchVal).toLowerCase()) {
          const targetColKey = Object.keys(cols).map(Number)[0] + colIndex;
          return cols[targetColKey] !== undefined ? cols[targetColKey] : '#REF!';
        }
      }
      return '#N/A';
    }

    // Handle IF(condition, trueVal, falseVal)
    const ifMatch = cleanFormula.match(/^IF\((.+),\s*(.+),\s*(.+)\)$/);
    if (ifMatch) {
      const condResult = evaluateCondition(ifMatch[1].trim(), cells, visited);
      return condResult ? resolveValue(ifMatch[2].trim(), cells, visited) : resolveValue(ifMatch[3].trim(), cells, visited);
    }

    // Handle standard functions: SUM, AVERAGE, COUNT, MAX, MIN, PRODUCT, MEDIAN, UPPER, LOWER, LEN, TRIM, ROUND, ABS
    const funcMatch = cleanFormula.match(/^([A-Z]+)\((.+)\)$/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const argStr = funcMatch[2];
      
      // Get all values from arguments (ranges or values)
      const values = resolveArguments(argStr, cells, visited);

      switch (funcName) {
        case 'SUM':
          return values.reduce((acc, v) => acc + (num(v) || 0), 0);
        case 'AVERAGE':
          return values.length > 0 ? values.reduce((acc, v) => acc + (num(v) || 0), 0) / values.length : 0;
        case 'COUNT':
          return values.filter(v => v !== '' && !isNaN(Number(v))).length;
        case 'MAX':
          return values.length > 0 ? Math.max(...values.map(v => num(v) || 0)) : 0;
        case 'MIN':
          return values.length > 0 ? Math.min(...values.map(v => num(v) || 0)) : 0;
        case 'PRODUCT':
          return values.reduce((acc, v) => acc * (num(v) || 1), 1);
        case 'MEDIAN': {
          const nums = values.map(v => num(v) || 0).sort((a, b) => a - b);
          if (nums.length === 0) return 0;
          const mid = Math.floor(nums.length / 2);
          return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
        }
        case 'UPPER':
          return String(values[0] || '').toUpperCase();
        case 'LOWER':
          return String(values[0] || '').toLowerCase();
        case 'LEN':
          return String(values[0] || '').length;
        case 'TRIM':
          return String(values[0] || '').trim();
        case 'ROUND':
          return Number(Number(values[0] || 0).toFixed(num(values[1]) || 0));
        case 'ABS':
          return Math.abs(num(values[0]) || 0);
        case 'CONCAT':
          return values.join('');
      }
    }

    // Simple arithmetic expression parsing (replace cell coords with values)
    let expr = cleanFormula;
    const cellRefs = expr.match(/[A-Z]+[0-9]+/g);
    if (cellRefs) {
      for (const ref of cellRefs) {
        if (visited.has(ref)) return '#CIRCULAR!';
        visited.add(ref);
        const val = getCellValueRaw(ref, cells, visited);
        visited.delete(ref);
        expr = expr.replace(new RegExp(ref, 'g'), isNaN(Number(val)) ? `"${val}"` : String(num(val)));
      }
    }

    // Safe eval for basic math
    // eslint-disable-next-line no-eval
    const result = eval(expr);
    return isNaN(result) ? '#VALUE!' : result;

  } catch {
    return '#ERROR!';
  }
}

function num(val: any): number {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function resolveValue(token: string, cells: SheetCells, visited: Set<string>): any {
  const clean = token.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    return clean.substring(1, clean.length - 1);
  }
  if (!isNaN(Number(clean))) {
    return Number(clean);
  }
  if (/^[A-Z]+[0-9]+$/.test(clean)) {
    return getCellValueRaw(clean, cells, visited);
  }
  return clean;
}

function getCellValueRaw(cellKey: string, cells: SheetCells, visited: Set<string>): any {
  const cell = cells[cellKey];
  if (!cell) return 0;
  if (cell.formula) {
    if (visited.has(cellKey)) return '#CIRCULAR!';
    visited.add(cellKey);
    const res = evaluateFormula(cell.formula, cells, visited);
    visited.delete(cellKey);
    return res;
  }
  return cell.value;
}

function resolveArguments(argStr: string, cells: SheetCells, visited: Set<string>): any[] {
  const result: any[] = [];
  // Split by comma outside quotes
  const parts = argStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes(':')) {
      const rangeCells = expandRange(trimmed);
      for (const rc of rangeCells) {
        result.push(getCellValueRaw(rc, cells, visited));
      }
    } else {
      result.push(resolveValue(trimmed, cells, visited));
    }
  }
  return result;
}

function evaluateCondition(condStr: string, cells: SheetCells, visited: Set<string>): boolean {
  const parts = condStr.split(/(==|!=|>=|<=|>|<)/);
  if (parts.length === 3) {
    const left = resolveValue(parts[0], cells, visited);
    const op = parts[1].trim();
    const right = resolveValue(parts[2], cells, visited);
    switch (op) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return num(left) > num(right);
      case '>=': return num(left) >= num(right);
      case '<': return num(left) < num(right);
      case '<=': return num(left) <= num(right);
    }
  }
  return Boolean(resolveValue(condStr, cells, visited));
}
