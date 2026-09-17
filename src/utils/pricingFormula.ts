export interface FormulaConfig {
  percentageRate: number; // default 6
  fixedOffset: number;    // default 20000
  surchargeThreshold: number; // default 999999
  surchargeLow: number;       // default 5000 (when <= threshold)
  surchargeHigh: number;      // default 10000 (when > threshold)
}

export interface CalculationBreakdown {
  id: string;
  baseCost: number;
  label?: string;
  r1: number;
  r1Offset: number;
  surcharge: number;
  surchargeReason: string;
  r2: number;
  fourthDigit: number;
  roundingMethod: 'floor' | 'ceil' | 'exact';
  finalSellingPrice: number;
  profit: number;
  marginPercent: number;
  markupPercent: number;
  timestamp: number;
}

export const DEFAULT_FORMULA_CONFIG: FormulaConfig = {
  percentageRate: 6,
  fixedOffset: 20000,
  surchargeThreshold: 999999,
  surchargeLow: 5000,
  surchargeHigh: 10000,
};

const STORAGE_KEY_CONFIG = 'mobile_shop_pricing_formula_config';
const STORAGE_KEY_HISTORY = 'mobile_shop_pricing_formula_history';

export function loadFormulaConfig(): FormulaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (!raw) return DEFAULT_FORMULA_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      percentageRate: typeof parsed.percentageRate === 'number' ? parsed.percentageRate : DEFAULT_FORMULA_CONFIG.percentageRate,
      fixedOffset: typeof parsed.fixedOffset === 'number' ? parsed.fixedOffset : DEFAULT_FORMULA_CONFIG.fixedOffset,
      surchargeThreshold: typeof parsed.surchargeThreshold === 'number' ? parsed.surchargeThreshold : DEFAULT_FORMULA_CONFIG.surchargeThreshold,
      surchargeLow: typeof parsed.surchargeLow === 'number' ? parsed.surchargeLow : DEFAULT_FORMULA_CONFIG.surchargeLow,
      surchargeHigh: typeof parsed.surchargeHigh === 'number' ? parsed.surchargeHigh : DEFAULT_FORMULA_CONFIG.surchargeHigh,
    };
  } catch {
    return DEFAULT_FORMULA_CONFIG;
  }
}

export function saveFormulaConfig(config: FormulaConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save formula config:', err);
  }
}

export function loadFormulaHistory(): CalculationBreakdown[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw) as CalculationBreakdown[];
  } catch {
    return [];
  }
}

export function saveFormulaHistory(history: CalculationBreakdown[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 100)));
  } catch (err) {
    console.error('Failed to save formula history:', err);
  }
}

/**
 * 3-Step Formula Calculation:
 * 1. Initial Result (R₁): Base + (percentageRate% × n + fixedOffset)
 * 2. Surcharge (R₂): +5,000 if R₁ ≤ 999,999, else +10,000
 * 3. Custom Rounding: If 4th digit from right is 9 → Floor to thousand. Otherwise → Ceiling to next thousand.
 */
export function calculateSellingPriceFromFormula(
  baseCost: number,
  config: FormulaConfig = DEFAULT_FORMULA_CONFIG,
  label?: string
): CalculationBreakdown {
  const n = Math.max(0, Math.round(baseCost));
  if (n === 0) {
    return {
      id: `calc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      baseCost: 0,
      label: label || '',
      r1: 0,
      r1Offset: 0,
      surcharge: 0,
      surchargeReason: 'Cost is 0',
      r2: 0,
      fourthDigit: 0,
      roundingMethod: 'exact',
      finalSellingPrice: 0,
      profit: 0,
      marginPercent: 0,
      markupPercent: 0,
      timestamp: Date.now(),
    };
  }

  // Step 1: R1
  const r1Offset = Math.round((config.percentageRate / 100) * n + config.fixedOffset);
  const r1 = n + r1Offset;

  // Step 2: Surcharge
  const isBelowOrEqualThreshold = r1 <= config.surchargeThreshold;
  const surcharge = isBelowOrEqualThreshold ? config.surchargeLow : config.surchargeHigh;
  const surchargeReason = isBelowOrEqualThreshold
    ? `R₁ (${r1.toLocaleString()}) ≤ ${config.surchargeThreshold.toLocaleString()} (+${config.surchargeLow.toLocaleString()})`
    : `R₁ (${r1.toLocaleString()}) > ${config.surchargeThreshold.toLocaleString()} (+${config.surchargeHigh.toLocaleString()})`;
  const r2 = r1 + surcharge;

  // Step 3: Custom Rounding
  // 4th digit from the right: Math.floor(r2 / 1000) % 10
  const thousandsQuotient = Math.floor(r2 / 1000);
  const fourthDigit = thousandsQuotient % 10;

  let finalSellingPrice = r2;
  let roundingMethod: 'floor' | 'ceil' | 'exact' = 'exact';

  if (r2 % 1000 === 0) {
    roundingMethod = 'exact';
    finalSellingPrice = r2;
  } else if (fourthDigit === 9) {
    roundingMethod = 'floor';
    finalSellingPrice = thousandsQuotient * 1000;
  } else {
    roundingMethod = 'ceil';
    finalSellingPrice = Math.ceil(r2 / 1000) * 1000;
  }

  const profit = finalSellingPrice - n;
  const marginPercent = finalSellingPrice > 0 ? (profit / finalSellingPrice) * 100 : 0;
  const markupPercent = n > 0 ? (profit / n) * 100 : 0;

  return {
    id: `calc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    baseCost: n,
    label: label || '',
    r1,
    r1Offset,
    surcharge,
    surchargeReason,
    r2,
    fourthDigit,
    roundingMethod,
    finalSellingPrice,
    profit,
    marginPercent: Math.round(marginPercent * 10) / 10,
    markupPercent: Math.round(markupPercent * 10) / 10,
    timestamp: Date.now(),
  };
}

export interface ParsedBatchLine {
  raw: string;
  label: string;
  cost: number;
  result?: CalculationBreakdown;
  error?: string;
}

export function parseBatchPriceList(text: string, config: FormulaConfig): ParsedBatchLine[] {
  const lines = text.split('\n');
  const results: ParsedBatchLine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Matches e.g. "iPhone 15 - 1,800,000" or "iPhone 15: 1800000" or "1800000" or "1800000 iPhone 15"
    // Find numeric part
    // Extract numbers removing commas
    const cleanedForNumber = trimmed.replace(/,/g, '');
    const numberMatches = cleanedForNumber.match(/(\d+(?:\.\d+)?)/g);

    if (!numberMatches || numberMatches.length === 0) {
      results.push({
        raw: trimmed,
        label: trimmed,
        cost: 0,
        error: 'No valid price found',
      });
      continue;
    }

    // Take the most plausible cost number (last number if format is "Name - 150000")
    const lastNumStr = numberMatches[numberMatches.length - 1];
    const cost = parseFloat(lastNumStr);

    // Label is everything except that number and common separators (:, -, =)
    let label = trimmed.replace(new RegExp(lastNumStr.replace('.', '\\.'), 'g'), '').replace(/[-:=,]/g, ' ').trim();
    if (!label) label = `Item @ ${cost.toLocaleString()}`;

    if (isNaN(cost) || cost <= 0) {
      results.push({
        raw: trimmed,
        label,
        cost: 0,
        error: 'Invalid cost amount',
      });
      continue;
    }

    const result = calculateSellingPriceFromFormula(cost, config, label);
    results.push({
      raw: trimmed,
      label,
      cost,
      result,
    });
  }

  return results;
}
