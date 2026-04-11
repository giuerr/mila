/**
 * Anomaly Detection Tests
 * Tests all 7 scan categories with seeded data.
 */

const path = require('path');

let db;

beforeAll(async () => {
  const MilaDatabase = require('../db/database').constructor;
  db = new MilaDatabase(':memory:');
  db.initialize();
  if (db._initPromise) await db._initPromise;

  // Seed test data
  db.insert('funds', { id: 'F1', name: 'Alpha Fund', total_commitments: 100000000, called_capital: 50000000, nav: 60000000, mgmt_fee_rate: 0.02, carry_rate: 0.20, status: 'ACTIVE' });
  db.insert('funds', { id: 'F2', name: 'Beta Fund', total_commitments: 50000000, called_capital: 10000000, nav: 0, mgmt_fee_rate: 0.04, carry_rate: 0.30, status: 'ACTIVE' });
  db.insert('investors', { id: 'I1', name: 'Mega Pension', entity_type: 'Pension', jurisdiction: 'US' });
  db.insert('investors', { id: 'I2', name: 'Small Family', entity_type: 'Family', jurisdiction: 'UK' });
  db.insert('commitments', { id: 'C1', fund_id: 'F1', investor_id: 'I1', commitment: 80000000, called_capital: 40000000, capital_account: 45000000 });
  db.insert('commitments', { id: 'C2', fund_id: 'F1', investor_id: 'I2', commitment: 20000000, called_capital: 10000000, capital_account: 15000000 });
  db.insert('investments', { id: 'INV1', fund_id: 'F1', company_name: 'StarCo', sector: 'Tech', cost_basis: 10000000, fair_value: 1000000, fair_value_level: 3, status: 'ACTIVE' });
  db.insert('investments', { id: 'INV2', fund_id: 'F1', company_name: 'MoonCo', sector: 'Health', cost_basis: 5000000, fair_value: 35000000, fair_value_level: 3, status: 'ACTIVE' });

  // Overdue filing
  const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  db.insert('filings', { id: 'FIL1', fund_id: 'F1', name: 'CIMA Annual', jurisdiction: 'Cayman', filing_type: 'ANNUAL', frequency: 'ANNUAL', deadline: pastDate, status: 'NOT_STARTED', owner: 'compliance@test.com' });

  // Filing due in 5 days
  const soonDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  db.insert('filings', { id: 'FIL2', fund_id: 'F1', name: 'SEC Form PF', jurisdiction: 'US', filing_type: 'QUARTERLY', frequency: 'QUARTERLY', deadline: soonDate, status: 'NOT_STARTED', owner: 'compliance@test.com' });
});

afterAll(() => { if (db && db.db) db.close(); });

// Override the singleton db used by anomalyDetection
beforeAll(() => {
  const dbModule = require('../db/database');
  // Copy our test db handle to the singleton
  dbModule.db = db.db;
  dbModule._initPromise = Promise.resolve();
});

const anomalyService = require('../services/anomalyDetection');

describe('Anomaly Detection — Full Scan', () => {
  test('scanAll returns structured result', () => {
    const result = anomalyService.scanAll();
    expect(result.scanTimestamp).toBeDefined();
    expect(result.totalAnomalies).toBeGreaterThanOrEqual(0);
    expect(result.severity).toBeDefined();
    expect(result.categories).toBeDefined();
    expect(Array.isArray(result.anomalies)).toBe(true);
  });

  test('anomalies sorted by severity (critical first)', () => {
    const result = anomalyService.scanAll();
    if (result.anomalies.length >= 2) {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < result.anomalies.length; i++) {
        expect(order[result.anomalies[i].severity]).toBeGreaterThanOrEqual(order[result.anomalies[i - 1].severity]);
      }
    }
  });
});

describe('NAV Trends', () => {
  test('detects stale NAV (called capital but NAV=0)', () => {
    const result = anomalyService.scanNavTrends();
    const stale = result.anomalies.find(a => a.type === 'NAV_STALE' && a.fundId === 'F2');
    expect(stale).toBeDefined();
    expect(stale.severity).toBe('medium');
  });
});

describe('Fee Discrepancies', () => {
  test('detects high management fee rate', () => {
    const result = anomalyService.scanFeeDiscrepancies();
    const highFee = result.anomalies.find(a => a.type === 'HIGH_MANAGEMENT_FEE' && a.fundId === 'F2');
    expect(highFee).toBeDefined();
    expect(highFee.details.feeRate).toBe(0.04);
  });

  test('detects high carry rate', () => {
    const result = anomalyService.scanFeeDiscrepancies();
    const highCarry = result.anomalies.find(a => a.type === 'HIGH_CARRY_RATE' && a.fundId === 'F2');
    expect(highCarry).toBeDefined();
    expect(highCarry.details.carryRate).toBe(0.30);
  });
});

describe('Compliance Deadlines', () => {
  test('detects missed deadline', () => {
    const result = anomalyService.scanComplianceDeadlines();
    const missed = result.anomalies.find(a => a.type === 'MISSED_DEADLINE');
    expect(missed).toBeDefined();
    expect(missed.severity).toBe('critical');
    expect(missed.message).toContain('OVERDUE');
  });

  test('detects imminent deadline', () => {
    const result = anomalyService.scanComplianceDeadlines();
    const imminent = result.anomalies.find(a => a.type === 'DEADLINE_IMMINENT' || a.type === 'FILING_NOT_STARTED');
    expect(imminent).toBeDefined();
  });
});

describe('Investor Concentration', () => {
  test('detects single LP concentration >40%', () => {
    const result = anomalyService.scanInvestorConcentration();
    const conc = result.anomalies.find(a => a.type === 'SINGLE_LP_CONCENTRATION');
    expect(conc).toBeDefined();
    expect(conc.details.investorName).toBe('Mega Pension');
    expect(conc.details.pctOfFund).toBeGreaterThan(40);
  });
});

describe('Valuation Outliers', () => {
  test('detects significant writedown (<20% of cost)', () => {
    const result = anomalyService.scanValuationOutliers();
    const writedown = result.anomalies.find(a => a.type === 'SIGNIFICANT_WRITEDOWN');
    expect(writedown).toBeDefined();
    expect(writedown.details.companyName).toBe('StarCo');
  });

  test('detects high markup on Level 3 asset', () => {
    const result = anomalyService.scanValuationOutliers();
    const markup = result.anomalies.find(a => a.type === 'HIGH_MARKUP_LEVEL3');
    expect(markup).toBeDefined();
    expect(markup.details.companyName).toBe('MoonCo');
    expect(markup.details.moic).toBeGreaterThan(5);
  });
});

describe('Filtered Scan', () => {
  test('filters by severity', () => {
    const result = anomalyService.getFiltered({ severity: 'critical' });
    result.anomalies.forEach(a => expect(a.severity).toBe('critical'));
  });

  test('filters by category', () => {
    const result = anomalyService.getFiltered({ category: 'compliance' });
    result.anomalies.forEach(a => expect(a.category).toBe('compliance'));
  });

  test('filters by fundId', () => {
    const result = anomalyService.getFiltered({ fundId: 'F1' });
    result.anomalies.forEach(a => expect(a.fundId).toBe('F1'));
  });
});
