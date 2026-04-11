/**
 * Fee Calculator Tests
 */

const FeeCalculator = require('../services/feeCalculator');

describe('Management Fee', () => {
  test('calculates basic management fee correctly', () => {
    const result = FeeCalculator.calculateManagementFee({
      feeBase: 100000000,
      feeRate: 0.02,
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      fundStage: 'investment_period'
    });

    expect(result.grossFee).toBeCloseTo(100000000 * 0.02 * (89 / 365), 0);
    expect(result.standardRate).toBe(0.02);
    expect(result.period.days).toBe(89);
  });

  test('applies step-down rate post investment period', () => {
    const result = FeeCalculator.calculateManagementFee({
      feeBase: 100000000,
      feeRate: 0.02,
      stepDownRate: 0.015,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      fundStage: 'post_investment'
    });

    expect(result.standardRate).toBe(0.015);
  });

  test('calculates LP-specific discounts from side letters', () => {
    const result = FeeCalculator.calculateManagementFee({
      feeBase: 100000000,
      feeRate: 0.02,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      fundStage: 'investment_period',
      lpOverrides: [
        { id: 'LP1', name: 'Big Pension', commitment: 50000000, discountedRate: 0.015, sideLetterRef: 'SL-001' }
      ]
    });

    expect(result.lpFees).toHaveLength(1);
    expect(result.lpFees[0].appliedRate).toBe(0.015);
    expect(result.lpFees[0].discount).toBeGreaterThan(0);
  });
});

describe('Performance Fee with HWM', () => {
  test('no fee when below HWM', () => {
    const result = FeeCalculator.calculatePerformanceFee({
      currentNav: 90000000,
      previousHwm: 100,
      sharesOutstanding: 1000000,
      perfFeeRate: 0.20
    });

    expect(result.performanceFee).toBe(0);
    expect(result.newHwm).toBe(100); // HWM doesn't change
  });

  test('fee only on gain above HWM', () => {
    const result = FeeCalculator.calculatePerformanceFee({
      currentNav: 120000000,
      previousHwm: 100,
      sharesOutstanding: 1000000,
      perfFeeRate: 0.20
    });

    const navPerShare = 120000000 / 1000000; // 120
    const gain = 120 - 100; // 20
    const expectedFee = 20 * 1000000 * 0.20; // 4,000,000

    expect(result.performanceFee).toBeCloseTo(expectedFee, 0);
    expect(result.newHwm).toBe(120);
  });
});

describe('Carried Interest', () => {
  test('no carry when below preferred return', () => {
    const result = FeeCalculator.calculateCarriedInterest({
      totalContributed: 100000000,
      totalDistributed: 50000000,
      unrealizedNav: 50000000, // Total value = 100M = return of capital only, no profit
      preferredReturn: 0.08,
      carryRate: 0.20
    });

    expect(result.totalGpCarry).toBe(0);
    expect(result.preferredReturnMet).toBe(false);
  });

  test('carry calculation with catch-up', () => {
    const result = FeeCalculator.calculateCarriedInterest({
      totalContributed: 100000000,
      totalDistributed: 100000000,
      unrealizedNav: 100000000,
      preferredReturn: 0.08,
      carryRate: 0.20
    });

    expect(result.totalGpCarry).toBeGreaterThan(0);
    expect(result.moic).toBe(2);
    expect(result.tiers).toHaveLength(4);
  });

  test('clawback calculation', () => {
    const result = FeeCalculator.calculateClawback({
      cumulativeCarryDistributed: 10000000,
      currentCarryEntitlement: 7000000,
      escrowBalance: 3000000
    });

    expect(result.clawbackAmount).toBe(3000000);
    expect(result.clawbackExists).toBe(true);
    expect(result.escrowAdequate).toBe(true); // 3M escrow >= 30% of 3M clawback
  });
});
