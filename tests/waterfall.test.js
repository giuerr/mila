/**
 * Waterfall Engine Tests
 * Critical financial calculations that must be precise.
 */

const WaterfallEngine = require('../services/waterfall');

describe('European Waterfall', () => {
  const baseParams = {
    lpInvestors: [
      { id: 'LP1', name: 'Pension Fund A', commitment: 50000000, calledCapital: 50000000, distributions: 0 },
      { id: 'LP2', name: 'Family Office B', commitment: 30000000, calledCapital: 30000000, distributions: 0 },
      { id: 'LP3', name: 'Endowment C', commitment: 20000000, calledCapital: 20000000, distributions: 0 }
    ],
    preferredReturn: 0.08,
    carryRate: 0.20,
    catchUpRate: 1.0,
    inceptionDate: '2020-01-01',
    calculationDate: '2025-01-01'
  };

  test('no carry below return of capital', () => {
    const result = WaterfallEngine.calculateEuropeanWaterfall({
      ...baseParams,
      fundTotalValue: 80000000 // Below cost
    });
    expect(result.gpTotalCarry).toBe(0);
    expect(result.moic).toBeLessThan(1);
  });

  test('no carry when pref not met', () => {
    const result = WaterfallEngine.calculateEuropeanWaterfall({
      ...baseParams,
      fundTotalValue: 110000000 // Above cost but below cost + pref
    });
    expect(result.gpTotalCarry).toBe(0);
  });

  test('carry kicks in after pref + catch-up', () => {
    const result = WaterfallEngine.calculateEuropeanWaterfall({
      ...baseParams,
      fundTotalValue: 200000000 // 2.0x
    });
    expect(result.gpTotalCarry).toBeGreaterThan(0);
    expect(result.moic).toBeCloseTo(2.0, 2);
    expect(result.tiers).toHaveLength(4);
    // Return of capital tier should equal total contributed
    expect(result.tiers[0].lpAmount).toBe(100000000);
    expect(result.tiers[0].gpAmount).toBe(0);
  });

  test('LP allocations are pro-rata', () => {
    const result = WaterfallEngine.calculateEuropeanWaterfall({
      ...baseParams,
      fundTotalValue: 200000000
    });
    const lp1 = result.lpAllocations.find(l => l.lpId === 'LP1');
    const lp3 = result.lpAllocations.find(l => l.lpId === 'LP3');
    // LP1 has 50% of fund, LP3 has 20%
    expect(lp1.pctOfFund).toBeCloseTo(50, 1);
    expect(lp3.pctOfFund).toBeCloseTo(20, 1);
  });
});

describe('American Waterfall', () => {
  test('deal-by-deal carry with loss carry-forward', () => {
    const result = WaterfallEngine.calculateAmericanWaterfall({
      deals: [
        { id: 'D1', name: 'Winner', costBasis: 10000000, currentValue: 30000000, status: 'realized', realizedProceeds: 30000000, holdPeriodYears: 3 },
        { id: 'D2', name: 'Loser', costBasis: 10000000, currentValue: 5000000, status: 'realized', realizedProceeds: 5000000, holdPeriodYears: 2 }
      ],
      lpInvestors: [],
      preferredReturn: 0.08,
      carryRate: 0.20,
      lossCarryForward: true
    });

    expect(result.type).toBe('AMERICAN');
    expect(result.deals).toHaveLength(2);
    // Winner should generate carry
    expect(result.deals[0].gpCarry).toBeGreaterThan(0);
    // Loser should not
    expect(result.deals[1].gpCarry).toBe(0);
    expect(result.totalGpCarry).toBeGreaterThan(0);
  });
});
