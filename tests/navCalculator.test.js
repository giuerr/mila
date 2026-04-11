/**
 * NAV Calculator Tests
 */

const NavCalculator = require('../services/navCalculator');

describe('NAV Calculation', () => {
  test('basic NAV = assets - liabilities', () => {
    const result = NavCalculator.calculateNav({
      assets: { investments: 80000000, cash: 15000000, receivables: 500000 },
      liabilities: { accruedExpenses: 200000, managementFee: 500000 },
      asOfDate: '2025-03-31'
    });

    expect(result.nav).toBe(95500000 - 700000);
    expect(result.assets.total).toBe(95500000);
    expect(result.liabilities.total).toBe(700000);
  });
});

describe('NAV Per Share (Multi-Series)', () => {
  test('calculates per-share NAV across series', () => {
    const result = NavCalculator.calculateNavPerShare({
      nav: 100000000,
      series: [
        { id: 'S1', name: 'Series A', closingDate: '2024-01-01', sharesOutstanding: 600000, hwm: 100 },
        { id: 'S2', name: 'Series B', closingDate: '2024-07-01', sharesOutstanding: 400000, hwm: 105 }
      ],
      sidePockets: []
    });

    expect(result.totalSharesOutstanding).toBe(1000000);
    expect(result.series).toHaveLength(2);
    // Series A has 60% of shares
    expect(result.series[0].mainBookNav).toBeCloseTo(60000000, -2);
  });

  test('side pockets allocated only to eligible series', () => {
    const result = NavCalculator.calculateNavPerShare({
      nav: 110000000,
      series: [
        { id: 'S1', name: 'Series A', closingDate: '2024-01-01', sharesOutstanding: 600000, hwm: 100 },
        { id: 'S2', name: 'Series B', closingDate: '2024-07-01', sharesOutstanding: 400000, hwm: 105 }
      ],
      sidePockets: [{
        id: 'SP1',
        name: 'Illiquid Asset',
        originalCost: 5000000,
        currentValue: 10000000,
        createdDate: '2024-03-01',
        eligibleSeries: ['S1'], // Only Series A was in when side pocket created
        totalEligibleShares: 600000
      }]
    });

    expect(result.sidePocketNav).toBe(10000000);
    expect(result.mainBookNav).toBe(100000000);
    // Series A gets the side pocket allocation
    expect(result.series[0].sidePocketAllocation).toBeGreaterThan(0);
    // Series B gets nothing from side pocket
    expect(result.series[1].sidePocketAllocation).toBe(0);
  });
});

describe('Equalization', () => {
  test('equalization credit when NAV > HWM', () => {
    const result = NavCalculator.calculateEqualization({
      newInvestor: { name: 'New LP', amount: 10000000 },
      currentNavPerShare: 120,
      hwmPerShare: 100,
      perfFeeRate: 0.20
    });

    expect(result.equalizationCredit).toBeGreaterThan(0);
    expect(result.equalizationDebit).toBe(0);
  });

  test('equalization debit when NAV < HWM', () => {
    const result = NavCalculator.calculateEqualization({
      newInvestor: { name: 'New LP', amount: 10000000 },
      currentNavPerShare: 90,
      hwmPerShare: 100,
      perfFeeRate: 0.20
    });

    expect(result.equalizationCredit).toBe(0);
    expect(result.equalizationDebit).toBeGreaterThan(0);
  });

  test('no equalization when NAV = HWM', () => {
    const result = NavCalculator.calculateEqualization({
      newInvestor: { name: 'New LP', amount: 10000000 },
      currentNavPerShare: 100,
      hwmPerShare: 100,
      perfFeeRate: 0.20
    });

    expect(result.netEqualization).toBe(0);
  });
});
