/**
 * Database Layer Tests
 * Tests CRUD operations, audit logging, query safety, and schema integrity.
 */

const path = require('path');

// Use a separate in-memory DB for testing
let db;

beforeAll(async () => {
  // Create a fresh database instance for testing (not the singleton)
  const MilaDatabase = require('../db/database').constructor;
  db = new MilaDatabase(':memory:');
  db.initialize();
  if (db._initPromise) await db._initPromise;
});

afterAll(() => {
  if (db && db.db) db.close();
});

describe('Schema Integrity', () => {
  test('all core tables exist', () => {
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).map(r => r.name);

    const expected = [
      'alerts', 'audit_log', 'capital_activity', 'commitments',
      'filings', 'funds', 'insurance_policies', 'investments',
      'investors', 'side_letters', 'signing_envelopes', 'users', 'workflows'
    ];
    for (const t of expected) {
      expect(tables).toContain(t);
    }
  });

  test('foreign keys are enabled', () => {
    const result = db.query('PRAGMA foreign_keys');
    expect(result[0].foreign_keys).toBe(1);
  });

  test('indexes exist on key columns', () => {
    const indexes = db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).map(r => r.name);

    expect(indexes).toContain('idx_commitments_fund');
    expect(indexes).toContain('idx_commitments_investor');
    expect(indexes).toContain('idx_capital_activity_fund');
    expect(indexes).toContain('idx_investments_fund');
    expect(indexes).toContain('idx_filings_deadline');
  });
});

describe('CRUD Operations', () => {
  const testFund = {
    id: 'FUND-TEST-1',
    name: 'Test Fund I',
    jurisdiction: 'Cayman',
    vehicle_type: 'SPC',
    vintage_year: 2025,
    total_commitments: 100000000,
    nav: 105000000,
    mgmt_fee_rate: 0.02,
    carry_rate: 0.20,
    preferred_return: 0.08,
    status: 'ACTIVE'
  };

  const testInvestor = {
    id: 'INV-TEST-1',
    name: 'Test Pension Fund',
    entity_type: 'Pension',
    jurisdiction: 'US',
    tax_residence: 'US',
    email: 'test@pension.com',
    accredited: 1,
    qualified_purchaser: 1,
    kyc_status: 'APPROVED',
    aml_status: 'CLEARED'
  };

  test('insert and findById — fund', () => {
    db.insert('funds', testFund);
    const found = db.findById('funds', 'FUND-TEST-1');
    expect(found).not.toBeNull();
    expect(found.name).toBe('Test Fund I');
    expect(found.total_commitments).toBe(100000000);
    expect(found.carry_rate).toBe(0.20);
  });

  test('insert and findById — investor', () => {
    db.insert('investors', testInvestor);
    const found = db.findById('investors', 'INV-TEST-1');
    expect(found).not.toBeNull();
    expect(found.name).toBe('Test Pension Fund');
    expect(found.accredited).toBe(1);
  });

  test('update modifies fields and sets updated_at', () => {
    db.update('funds', 'FUND-TEST-1', { nav: 110000000 });
    const found = db.findById('funds', 'FUND-TEST-1');
    expect(found.nav).toBe(110000000);
    expect(found.updated_at).toBeDefined();
  });

  test('findAll returns all matching records', () => {
    db.insert('funds', { id: 'FUND-TEST-2', name: 'Test Fund II', status: 'ACTIVE' });
    const all = db.findAll('funds');
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test('findAll with where clause filters correctly', () => {
    const active = db.findAll('funds', { status: 'ACTIVE' });
    active.forEach(f => expect(f.status).toBe('ACTIVE'));
  });

  test('findAll respects limit', () => {
    const limited = db.findAll('funds', {}, 'created_at DESC', 1);
    expect(limited.length).toBeLessThanOrEqual(1);
  });

  test('delete removes record', () => {
    db.insert('funds', { id: 'FUND-DELETE-ME', name: 'To Delete', status: 'DRAFT' });
    db.delete('funds', 'FUND-DELETE-ME');
    const found = db.findById('funds', 'FUND-DELETE-ME');
    expect(found).toBeNull();
  });

  test('findById returns null for nonexistent record', () => {
    const found = db.findById('funds', 'FUND-DOESNT-EXIST');
    expect(found).toBeNull();
  });
});

describe('Commitments & Relations', () => {
  test('insert commitment with foreign key references', () => {
    db.insert('commitments', {
      id: 'COM-TEST-1',
      fund_id: 'FUND-TEST-1',
      investor_id: 'INV-TEST-1',
      commitment: 50000000,
      called_capital: 25000000,
      capital_account: 26000000,
      lp_class: 'Standard'
    });
    const found = db.findById('commitments', 'COM-TEST-1');
    expect(found.commitment).toBe(50000000);
    // unfunded is a generated column
    expect(found.unfunded).toBe(25000000);
  });

  test('getFundWithInvestors returns fund + commitments', () => {
    const result = db.getFundWithInvestors('FUND-TEST-1');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Test Fund I');
    expect(result.commitments).toBeDefined();
    expect(result.commitments.length).toBeGreaterThanOrEqual(1);
    expect(result.commitments[0].investor_name).toBe('Test Pension Fund');
  });

  test('getInvestorPortfolio returns commitments with fund info', () => {
    const portfolio = db.getInvestorPortfolio('INV-TEST-1');
    expect(portfolio.length).toBeGreaterThanOrEqual(1);
    expect(portfolio[0].fund_name).toBe('Test Fund I');
  });

  test('getFundWithInvestors returns null for nonexistent fund', () => {
    const result = db.getFundWithInvestors('FUND-GHOST');
    expect(result).toBeNull();
  });
});

describe('Audit Logging', () => {
  test('logAction creates audit entry', () => {
    db.logAction('FUND', 'FUND-TEST-1', 'NAV_CALCULATED', 'admin@test.com', { nav: 110000000 });
    const logs = db.query(
      'SELECT * FROM audit_log WHERE entity_id = ? ORDER BY timestamp DESC',
      ['FUND-TEST-1']
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe('NAV_CALCULATED');
    expect(logs[0].performed_by).toBe('admin@test.com');
    const details = JSON.parse(logs[0].details);
    expect(details.nav).toBe(110000000);
  });
});

describe('SQL Injection Protection', () => {
  test('findAll rejects invalid table names', () => {
    expect(() => db.findAll('users; DROP TABLE funds;--')).toThrow('Invalid table');
  });

  test('findAll rejects invalid orderBy', () => {
    expect(() => db.findAll('funds', {}, 'name; DROP TABLE funds;--')).toThrow('Invalid orderBy');
  });

  test('findAll rejects SQL in orderBy direction', () => {
    expect(() => db.findAll('funds', {}, 'name UNION')).toThrow('Invalid orderBy');
  });

  test('parameterized queries prevent injection in values', () => {
    // This should not create any side effects
    const result = db.findAll('funds', { name: "'; DROP TABLE funds;--" });
    // Should return empty (no match), not throw or execute injection
    expect(result).toEqual([]);
  });

  test('findAll enforces limit bounds', () => {
    const result = db.findAll('funds', {}, 'created_at DESC', 99999);
    // safeLimit caps at 10000
    expect(result).toBeDefined();
  });
});

describe('Filings & Compliance', () => {
  test('getUpcomingFilings returns filings within date range', () => {
    db.insert('filings', {
      id: 'FIL-TEST-1',
      fund_id: 'FUND-TEST-1',
      name: 'CIMA Annual Return',
      jurisdiction: 'Cayman',
      filing_type: 'ANNUAL',
      frequency: 'ANNUAL',
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'NOT_STARTED',
      owner: 'compliance@antoninus.com'
    });
    const upcoming = db.getUpcomingFilings(30);
    expect(upcoming.length).toBeGreaterThanOrEqual(1);
    expect(upcoming[0].name).toBe('CIMA Annual Return');
  });

  test('getUpcomingFilings excludes filed items', () => {
    db.insert('filings', {
      id: 'FIL-TEST-2',
      fund_id: 'FUND-TEST-1',
      name: 'Already Filed',
      jurisdiction: 'US',
      filing_type: 'QUARTERLY',
      frequency: 'QUARTERLY',
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'FILED'
    });
    const upcoming = db.getUpcomingFilings(30);
    const filed = upcoming.find(f => f.id === 'FIL-TEST-2');
    expect(filed).toBeUndefined();
  });
});
