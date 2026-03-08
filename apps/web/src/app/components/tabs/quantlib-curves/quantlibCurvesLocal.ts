/**
 * Local QuantLib-style curve calculations (no API key required).
 * Pure TypeScript: interpolation, zero rates, discount factors, forward rates.
 * Uses linear interpolation on zero rates; continuous compounding for discount factors.
 */

function linearInterpolate(x: number[], y: number[], xi: number): number {
  if (x.length !== y.length || x.length === 0) return NaN;
  if (xi <= x[0]) return y[0];
  if (xi >= x[x.length - 1]) return y[y.length - 1];
  for (let i = 0; i < x.length - 1; i++) {
    if (xi >= x[i] && xi <= x[i + 1]) {
      const t = (xi - x[i]) / (x[i + 1] - x[i]);
      return y[i] + t * (y[i + 1] - y[i]);
    }
  }
  return y[y.length - 1];
}

function linearDerivative(x: number[], y: number[], xi: number): number {
  if (x.length !== y.length || x.length < 2) return 0;
  if (xi <= x[0]) return (y[1] - y[0]) / (x[1] - x[0]);
  if (xi >= x[x.length - 1]) return (y[x.length - 1] - y[x.length - 2]) / (x[x.length - 1] - x[x.length - 2]);
  for (let i = 0; i < x.length - 1; i++) {
    if (xi >= x[i] && xi <= x[i + 1])
      return (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  }
  return 0;
}

// Curve type and interpolation are ignored in this minimal implementation (we use linear on zero rates only)
function getZeroRate(tenors: number[], values: number[], queryTenor: number): number {
  return linearInterpolate(tenors, values, queryTenor);
}

function getDiscountFactor(tenors: number[], values: number[], queryTenor: number): number {
  const r = getZeroRate(tenors, values, queryTenor);
  return Math.exp(-r * queryTenor);
}

export const curvesLocal = {
  build: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    _curve_type = 'zero',
    _interpolation = 'linear'
  ): Promise<{ success: boolean; curve_type: string; tenors: number[]; values: number[] }> => {
    return Promise.resolve({
      success: true,
      curve_type: 'zero',
      tenors,
      values,
    });
  },

  zeroRate: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    query_tenor: number,
    _curve_type = 'zero',
    _interpolation = 'linear'
  ): Promise<{ zero_rate: number; tenor: number }> => {
    const r = getZeroRate(tenors, values, query_tenor);
    return Promise.resolve({ zero_rate: r, tenor: query_tenor });
  },

  discountFactor: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    query_tenor: number,
    _curve_type = 'zero',
    _interpolation = 'linear'
  ): Promise<{ discount_factor: number; tenor: number }> => {
    const df = getDiscountFactor(tenors, values, query_tenor);
    return Promise.resolve({ discount_factor: df, tenor: query_tenor });
  },

  forwardRate: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    start_tenor: number,
    end_tenor: number,
    _curve_type = 'zero',
    _interpolation = 'linear'
  ): Promise<{ forward_rate: number; start_tenor: number; end_tenor: number }> => {
    const dfStart = getDiscountFactor(tenors, values, start_tenor);
    const dfEnd = getDiscountFactor(tenors, values, end_tenor);
    const dt = end_tenor - start_tenor;
    const forward_rate = dt > 1e-10 ? (dfStart / dfEnd - 1) / dt : 0;
    return Promise.resolve({ forward_rate, start_tenor, end_tenor });
  },

  instantaneousForward: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    query_tenor: number,
    _curve_type = 'zero',
    _interpolation = 'linear'
  ): Promise<{ instantaneous_forward: number; tenor: number }> => {
    const r = getZeroRate(tenors, values, query_tenor);
    const dr = linearDerivative(tenors, values, query_tenor);
    const f = r + query_tenor * dr;
    return Promise.resolve({ instantaneous_forward: f, tenor: query_tenor });
  },

  curvePoints: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    query_tenors: number[],
    _curve_type = 'zero',
    _interpolation = 'linear'
  ): Promise<{ tenors: number[]; values: number[] }> => {
    const out = query_tenors.map((t) => linearInterpolate(tenors, values, t));
    return Promise.resolve({ tenors: query_tenors, values: out });
  },
};

export const interpolationLocal = {
  interpolate: (
    x: number[],
    y: number[],
    query_x: number[],
    _method = 'linear'
  ): Promise<{ x: number[]; y: number[] }> => {
    const out = query_x.map((xi) => linearInterpolate(x, y, xi));
    return Promise.resolve({ x: query_x, y: out });
  },

  derivative: (
    x: number[],
    y: number[],
    query_x: number,
    _method = 'linear'
  ): Promise<{ derivative: number; x: number }> => {
    const d = linearDerivative(x, y, query_x);
    return Promise.resolve({ derivative: d, x: query_x });
  },

  monotonicityCheck: (
    x: number[],
    y: number[],
    query_x: number[],
    _method = 'linear'
  ): Promise<{ x: number[]; monotonic: boolean; values: number[] }> => {
    const values = query_x.map((xi) => linearInterpolate(x, y, xi));
    let monotonic = true;
    for (let i = 1; i < values.length; i++) {
      if (values[i] < values[i - 1]) {
        monotonic = false;
        break;
      }
    }
    return Promise.resolve({ x: query_x, monotonic, values });
  },
};

// Transformations (local)
function interpolateMany(tenors: number[], values: number[], queryTenors: number[]): number[] {
  return queryTenors.map((t) => linearInterpolate(tenors, values, t));
}

export const transformLocal = {
  parallelShift: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    shift_bps: number,
    space = 'zero_rate'
  ): Promise<{ tenors: number[]; values: number[] }> => {
    const shift = space === 'zero_rate' ? shift_bps / 10000 : shift_bps / 10000;
    const newValues = values.map((v) => v + shift);
    return Promise.resolve({ tenors, values: newValues });
  },

  scale: (
    _reference_date: string,
    tenors: number[],
    values: number[],
    scale_factor: number
  ): Promise<{ tenors: number[]; values: number[] }> => {
    const newValues = values.map((v) => v * scale_factor);
    return Promise.resolve({ tenors, values: newValues });
  },
};

// Nelson-Siegel: R(t) = beta0 + beta1 * ((1-exp(-t/tau))/(t/tau)) + beta2 * (((1-exp(-t/tau))/(t/tau)) - exp(-t/tau))
function nsEvaluate(beta0: number, beta1: number, beta2: number, tau: number, t: number): number {
  if (t <= 0) return beta0;
  const x = t / tau;
  const e = Math.exp(-x);
  const factor1 = (1 - e) / x;
  const factor2 = factor1 - e;
  return beta0 + beta1 * factor1 + beta2 * factor2;
}

export const nelsonSiegelLocal = {
  evaluate: (
    beta0: number,
    beta1: number,
    beta2: number,
    tau: number,
    query_tenors: number[]
  ): Promise<{ tenors: number[]; values: number[] }> => {
    const values = query_tenors.map((t) => nsEvaluate(beta0, beta1, beta2, tau, t));
    return Promise.resolve({ tenors: query_tenors, values });
  },

  fit: (tenors: number[], rates: number[]): Promise<{ beta0: number; beta1: number; beta2: number; tau: number }> => {
    // Simple grid search for tau, then OLS for beta (minimize sum of squared errors)
    let bestTau = 2;
    let bestErr = Infinity;
    let bestBeta: [number, number, number] = [0, 0, 0];
    for (const tau of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) {
      const n = tenors.length;
      const f1 = tenors.map((t) => (t <= 0 ? 1 : (1 - Math.exp(-t / tau)) / (t / tau)));
      const f2 = tenors.map((t, i) => (t <= 0 ? 0 : f1[i] - Math.exp(-t / tau)));
      const sumY = rates.reduce((a, b) => a + b, 0);
      const sumF1 = f1.reduce((a, b) => a + b, 0);
      const sumF2 = f2.reduce((a, b) => a + b, 0);
      const sumF1F1 = f1.reduce((a, _, i) => a + f1[i] * f1[i], 0);
      const sumF2F2 = f2.reduce((a, _, i) => a + f2[i] * f2[i], 0);
      const sumF1F2 = f1.reduce((a, _, i) => a + f1[i] * f2[i], 0);
      const sumYF1 = rates.reduce((a, _, i) => a + rates[i] * f1[i], 0);
      const sumYF2 = rates.reduce((a, _, i) => a + rates[i] * f2[i], 0);
      const det = n * (sumF1F1 * sumF2F2 - sumF1F2 * sumF1F2) - sumF1 * (sumF1 * sumF2F2 - sumF2 * sumF1F2) + sumF2 * (sumF1 * sumF1F2 - sumF2 * sumF1F1);
      if (Math.abs(det) < 1e-12) continue;
      const beta0 = (sumY * (sumF1F1 * sumF2F2 - sumF1F2 * sumF1F2) - sumF1 * (sumYF1 * sumF2F2 - sumYF2 * sumF1F2) + sumF2 * (sumYF1 * sumF1F2 - sumYF2 * sumF1F1)) / det;
      const beta1 = (n * (sumYF1 * sumF2F2 - sumYF2 * sumF1F2) - sumY * (sumF1 * sumF2F2 - sumF2 * sumF1F2) + sumF2 * (sumF1 * sumYF2 - sumF2 * sumYF1)) / det;
      const beta2 = (n * (sumF1F1 * sumYF2 - sumYF1 * sumF1F2) - sumF1 * (sumF1 * sumYF2 - sumYF1 * sumF2) + sumY * (sumF1 * sumF1F2 - sumF2 * sumF1F1)) / det;
      const err = rates.reduce((acc, y, i) => acc + (y - nsEvaluate(beta0, beta1, beta2, tau, tenors[i])) ** 2, 0);
      if (err < bestErr) {
        bestErr = err;
        bestTau = tau;
        bestBeta = [beta0, beta1, beta2];
      }
    }
    return Promise.resolve({
      beta0: bestBeta[0],
      beta1: bestBeta[1],
      beta2: bestBeta[2],
      tau: bestTau,
    });
  },
};

// Construction
export const constructionLocal = {
  proxy: (
    _reference_date: string,
    base_tenors: number[],
    base_values: number[],
    spread_bps: number
  ): Promise<{ tenors: number[]; values: number[] }> => {
    const spread = spread_bps / 10000;
    const values = base_values.map((v) => v + spread);
    return Promise.resolve({ tenors: base_tenors, values });
  },
};
