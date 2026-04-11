/**
 * Tax Engine Tests
 */

const TaxEngine = require('../services/taxEngine');

describe('K-1 Generation', () => {
  test('allocates tax items pro-rata by capital account', () => {
    const result = TaxEngine.generateK1Data({
      fundTaxItems: {
        ordinaryIncome: 1000000,
        netLongTermCapitalGain: 5000000,
        interestIncome: 200000
      },
      lpInvestors: [
        { id: 'LP1', name: 'Investor A', capitalAccount: 60000000, capitalAccountBeginning: 55000000, contributions: 5000000, withdrawals: 0, taxId: '12-3456789', entityType: 'CORPORATION' },
        { id: 'LP2', name: 'Investor B', capitalAccount: 40000000, capitalAccountBeginning: 38000000, contributions: 2000000, withdrawals: 0, taxId: '98-7654321', entityType: 'PARTNERSHIP' }
      ]
    });

    expect(result).toHaveLength(2);
    // LP1 has 60% of capital → should get 60% of each item
    expect(result[0].allocationPercentage).toBeCloseTo(60, 0);
    expect(result[0].allocations.ordinaryIncome).toBeCloseTo(600000, 0);
    expect(result[0].allocations.netLongTermCapitalGain).toBeCloseTo(3000000, 0);
    // LP2 has 40%
    expect(result[1].allocationPercentage).toBeCloseTo(40, 0);
  });
});

describe('Withholding Tax', () => {
  test('applies treaty rates correctly', () => {
    const result = TaxEngine.calculateWithholding({
      distributions: [
        { lpId: 'LP1', totalAmount: 1000000, interestIncome: 100000, dividendIncome: 200000 }
      ],
      lpInvestors: [
        { id: 'LP1', name: 'UK Investor', jurisdiction: 'UK', treatyCountry: 'UK', w8Type: 'W-8BEN-E', w8ExpiryDate: '2026-12-31', fatcaStatus: 'NON_US' }
      ]
    });

    expect(result).toHaveLength(1);
    expect(result[0].withholdingRate).toBe('15%'); // UK treaty rate
    expect(result[0].w8Valid).toBe(true);
    expect(result[0].netDistribution).toBeLessThan(1000000);
  });

  test('30% default rate for non-treaty countries', () => {
    const result = TaxEngine.calculateWithholding({
      distributions: [
        { lpId: 'LP1', totalAmount: 1000000, interestIncome: 500000, dividendIncome: 0 }
      ],
      lpInvestors: [
        { id: 'LP1', name: 'Unknown Entity', jurisdiction: 'XX', treatyCountry: 'XX', w8Type: 'W-8BEN-E', w8ExpiryDate: '2026-12-31', fatcaStatus: 'NON_US' }
      ]
    });

    expect(result[0].withholdingRate).toBe('30%');
  });

  test('no withholding for US investors', () => {
    const result = TaxEngine.calculateWithholding({
      distributions: [
        { lpId: 'LP1', totalAmount: 1000000, interestIncome: 100000, dividendIncome: 200000 }
      ],
      lpInvestors: [
        { id: 'LP1', name: 'US Pension', jurisdiction: 'US', treatyCountry: 'US', w8Type: 'W-9', w8ExpiryDate: '2099-12-31', fatcaStatus: 'US_PERSON' }
      ]
    });

    expect(result[0].withholdingAmount).toBe(0);
  });
});

describe('PFIC Identification', () => {
  test('identifies PFIC by income test (75%)', () => {
    const result = TaxEngine.identifyPfics([
      { name: 'Passive Corp', country: 'KY', passiveIncome: 800000, grossIncome: 1000000, passiveAssets: 3000000, totalAssets: 10000000 }
    ]);

    expect(result[0].isPfic).toBe(true);
    expect(result[0].passiveIncomeTest.triggered).toBe(true);
  });

  test('identifies PFIC by asset test (50%)', () => {
    const result = TaxEngine.identifyPfics([
      { name: 'Asset Heavy', country: 'LU', passiveIncome: 100000, grossIncome: 1000000, passiveAssets: 6000000, totalAssets: 10000000 }
    ]);

    expect(result[0].isPfic).toBe(true);
    expect(result[0].assetTest.triggered).toBe(true);
  });

  test('not a PFIC when both tests below threshold', () => {
    const result = TaxEngine.identifyPfics([
      { name: 'Operating Co', country: 'US', passiveIncome: 100000, grossIncome: 1000000, passiveAssets: 2000000, totalAssets: 10000000 }
    ]);

    expect(result[0].isPfic).toBe(false);
  });
});
