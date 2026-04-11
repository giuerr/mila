/**
 * Benchmarking Tests
 */

const Benchmarking = require('../services/benchmarking');

describe('Performance Metrics', () => {
  test('calculates TVPI, DPI, RVPI correctly', () => {
    const result = Benchmarking.calculatePerformanceMetrics({
      cashFlows: [
        { type: 'contribution', amount: 100000000, date: '2020-01-01' },
        { type: 'distribution', amount: 50000000, date: '2023-06-01' }
      ],
      currentNav: 120000000,
      inceptionDate: '2020-01-01'
    });

    // TVPI = (50M + 120M) / 100M = 1.70
    expect(result.tvpi).toBeCloseTo(1.70, 2);
    // DPI = 50M / 100M = 0.50
    expect(result.dpi).toBeCloseTo(0.50, 2);
    // RVPI = 120M / 100M = 1.20
    expect(result.rvpi).toBeCloseTo(1.20, 2);
    expect(result.irr).toBeDefined();
  });
});

describe('Quartile Ranking', () => {
  test('top quartile when above Q1', () => {
    const result = Benchmarking.quartileRanking({
      fundMetrics: { irr: 25, tvpi: 2.5, dpi: 1.5 },
      benchmarkData: {
        irr: { q1: 20, median: 15, q3: 8, top5: 35, bottom5: -5 },
        tvpi: { q1: 2.0, median: 1.5, q3: 1.2, top5: 3.0, bottom5: 0.8 },
        dpi: { q1: 1.2, median: 0.8, q3: 0.4, top5: 2.0, bottom5: 0.0 }
      }
    });

    expect(result.rankings.irr.quartile).toBe(1);
    expect(result.rankings.irr.status).toBe('TOP_QUARTILE');
    expect(result.rankings.tvpi.quartile).toBe(1);
  });

  test('bottom quartile when below Q3', () => {
    const result = Benchmarking.quartileRanking({
      fundMetrics: { irr: 5, tvpi: 1.1, dpi: 0.3 },
      benchmarkData: {
        irr: { q1: 20, median: 15, q3: 8, top5: 35, bottom5: -5 },
        tvpi: { q1: 2.0, median: 1.5, q3: 1.2, top5: 3.0, bottom5: 0.8 },
        dpi: { q1: 1.2, median: 0.8, q3: 0.4, top5: 2.0, bottom5: 0.0 }
      }
    });

    expect(result.rankings.irr.quartile).toBe(4);
    expect(result.rankings.irr.status).toBe('BOTTOM_QUARTILE');
  });
});

describe('PME', () => {
  test('PME > 1 means outperformance vs public markets', () => {
    const result = Benchmarking.calculatePme({
      cashFlows: [
        { type: 'contribution', amount: 100000000, date: '2020-01-01' },
        { type: 'distribution', amount: 80000000, date: '2024-01-01' }
      ],
      currentNav: 100000000,
      indexReturns: { annualReturn: 0.10, indexName: 'S&P 500' }
    });

    expect(result.kaplanSchoarPme).toBeDefined();
    expect(result.directAlpha).toBeDefined();
    expect(result.indexUsed).toBe('S&P 500');
  });
});
