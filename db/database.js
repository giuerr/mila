/**
 * Database Layer — SQLite via better-sqlite3
 * Persistent storage for investors, cap table, filings, workflows, alerts.
 * SQLite chosen for simplicity — zero-config, single-file, production-ready for fund scale.
 */

const path = require('path');
const fs = require('fs');

class MilaDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'mila.db');
    this.db = null;
    this._initPromise = null;
  }

  initialize() {
    const initSqlJs = require('sql.js');
    // Load existing DB file if it exists
    let buffer = null;
    try { buffer = fs.readFileSync(this.dbPath); } catch (e) { /* new db */ }
    this._initPromise = initSqlJs().then(SQL => {
      this.db = buffer ? new SQL.Database(buffer) : new SQL.Database();
      this.db.run('PRAGMA foreign_keys = ON');
      this._createTables();
      return this;
    });
    return this;
  }

  _createTables() {
    this.db.exec(`
      -- ==================== FUNDS ====================
      CREATE TABLE IF NOT EXISTS funds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        jurisdiction TEXT,
        vehicle_type TEXT,
        vintage_year INTEGER,
        total_commitments REAL DEFAULT 0,
        called_capital REAL DEFAULT 0,
        nav REAL DEFAULT 0,
        mgmt_fee_rate REAL,
        carry_rate REAL DEFAULT 0.20,
        preferred_return REAL DEFAULT 0.08,
        investment_period_end TEXT,
        fund_term_end TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== INVESTORS ====================
      CREATE TABLE IF NOT EXISTS investors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        entity_type TEXT,
        jurisdiction TEXT,
        tax_residence TEXT,
        tax_id TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        fatca_classification TEXT,
        crs_classification TEXT,
        is_benefit_plan INTEGER DEFAULT 0,
        is_pep INTEGER DEFAULT 0,
        accredited INTEGER DEFAULT 0,
        qualified_purchaser INTEGER DEFAULT 0,
        kyc_status TEXT DEFAULT 'PENDING',
        aml_status TEXT DEFAULT 'PENDING',
        risk_score INTEGER DEFAULT 0,
        onboarding_status TEXT DEFAULT 'PENDING',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== COMMITMENTS (LP ↔ Fund) ====================
      CREATE TABLE IF NOT EXISTS commitments (
        id TEXT PRIMARY KEY,
        fund_id TEXT NOT NULL REFERENCES funds(id),
        investor_id TEXT NOT NULL REFERENCES investors(id),
        commitment REAL NOT NULL,
        called_capital REAL DEFAULT 0,
        distributions REAL DEFAULT 0,
        capital_account REAL DEFAULT 0,
        unfunded REAL GENERATED ALWAYS AS (commitment - called_capital) STORED,
        closing_date TEXT,
        lp_class TEXT DEFAULT 'Standard',
        mgmt_fee_rate_override REAL,
        carry_rate_override REAL,
        side_letter_id TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== CAPITAL ACTIVITY ====================
      CREATE TABLE IF NOT EXISTS capital_activity (
        id TEXT PRIMARY KEY,
        fund_id TEXT NOT NULL REFERENCES funds(id),
        investor_id TEXT REFERENCES investors(id),
        type TEXT NOT NULL, -- CAPITAL_CALL, DISTRIBUTION, RECALLABLE
        amount REAL NOT NULL,
        call_number INTEGER,
        purpose TEXT,
        due_date TEXT,
        payment_date TEXT,
        wire_reference TEXT,
        status TEXT DEFAULT 'PENDING',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== INVESTMENTS / PORTFOLIO ====================
      CREATE TABLE IF NOT EXISTS investments (
        id TEXT PRIMARY KEY,
        fund_id TEXT NOT NULL REFERENCES funds(id),
        company_name TEXT NOT NULL,
        sector TEXT,
        geography TEXT,
        investment_date TEXT,
        cost_basis REAL,
        fair_value REAL,
        fair_value_level INTEGER DEFAULT 3,
        valuation_method TEXT,
        status TEXT DEFAULT 'ACTIVE', -- ACTIVE, PARTIALLY_REALIZED, FULLY_REALIZED, WRITTEN_OFF
        exit_date TEXT,
        exit_proceeds REAL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== COMPLIANCE FILINGS ====================
      CREATE TABLE IF NOT EXISTS filings (
        id TEXT PRIMARY KEY,
        fund_id TEXT REFERENCES funds(id),
        name TEXT NOT NULL,
        jurisdiction TEXT,
        filing_type TEXT,
        frequency TEXT,
        deadline TEXT NOT NULL,
        status TEXT DEFAULT 'NOT_STARTED',
        owner TEXT,
        filed_date TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== WORKFLOWS ====================
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT, -- JSON
        initiator TEXT,
        current_step INTEGER DEFAULT 1,
        approval_chain TEXT, -- JSON
        status TEXT DEFAULT 'PENDING_APPROVAL',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- ==================== AUDIT LOG ====================
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        performed_by TEXT,
        details TEXT, -- JSON
        ip_address TEXT,
        timestamp TEXT DEFAULT (datetime('now'))
      );

      -- ==================== ALERTS ====================
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        severity TEXT NOT NULL,
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT, -- JSON
        acknowledged INTEGER DEFAULT 0,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== INSURANCE POLICIES ====================
      CREATE TABLE IF NOT EXISTS insurance_policies (
        id TEXT PRIMARY KEY,
        fund_id TEXT REFERENCES funds(id),
        type TEXT NOT NULL,
        carrier TEXT,
        policy_number TEXT,
        coverage_limit REAL,
        deductible REAL,
        annual_premium REAL,
        effective_date TEXT,
        renewal_date TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== SIDE LETTERS ====================
      CREATE TABLE IF NOT EXISTS side_letters (
        id TEXT PRIMARY KEY,
        fund_id TEXT NOT NULL REFERENCES funds(id),
        investor_id TEXT NOT NULL REFERENCES investors(id),
        provisions TEXT, -- JSON array
        mfn_eligible INTEGER DEFAULT 1,
        execution_date TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== USERS (for auth) ====================
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL, -- ADMIN, CFO, FUND_ACCOUNTANT, COMPLIANCE, INVESTOR, READONLY
        investor_id TEXT REFERENCES investors(id), -- For LP portal access
        active INTEGER DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== SIGNING ENVELOPES (persisted from SignatureEngine) ====================
      CREATE TABLE IF NOT EXISTS signing_envelopes (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'CREATED',
        sender_name TEXT,
        sender_email TEXT,
        metadata TEXT, -- JSON
        documents TEXT, -- JSON array
        signers TEXT, -- JSON array
        audit_trail TEXT, -- JSON array
        signing_certificate TEXT, -- JSON
        expires_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ==================== INDEXES ====================
      CREATE INDEX IF NOT EXISTS idx_commitments_fund ON commitments(fund_id);
      CREATE INDEX IF NOT EXISTS idx_commitments_investor ON commitments(investor_id);
      CREATE INDEX IF NOT EXISTS idx_capital_activity_fund ON capital_activity(fund_id);
      CREATE INDEX IF NOT EXISTS idx_capital_activity_investor ON capital_activity(investor_id);
      CREATE INDEX IF NOT EXISTS idx_investments_fund ON investments(fund_id);
      CREATE INDEX IF NOT EXISTS idx_filings_deadline ON filings(deadline);
      CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
      CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
    `);
  }

  // ==================== HELPERS (sql.js uses different API) ====================

  _rowsToObjects(stmt) {
    const cols = stmt.getColumnNames();
    const results = [];
    while (stmt.step()) {
      const row = stmt.get();
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      results.push(obj);
    }
    stmt.free();
    return results;
  }

  _save() {
    // Persist to disk
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (e) { /* non-critical */ }
  }

  // ==================== GENERIC CRUD ====================

  insert(table, data) {
    if (!this.db) return;
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    this.db.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, Object.values(data));
    this._save();
  }

  update(table, id, data) {
    if (!this.db) return;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
    this.db.run(`UPDATE ${table} SET ${sets}, updated_at = datetime('now') WHERE id = ?`, [...Object.values(data), id]);
    this._save();
  }

  findById(table, id) {
    if (!this.db) return null;
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    stmt.bind([id]);
    const results = this._rowsToObjects(stmt);
    return results[0] || null;
  }

  findAll(table, where = {}, orderBy = 'created_at DESC', limit = 1000) {
    if (!this.db) return [];
    // Whitelist table names to prevent injection
    const VALID_TABLES = ['funds','investors','commitments','capital_activity','investments','filings','workflows','audit_log','alerts','insurance_policies','side_letters','users','signing_envelopes'];
    if (!VALID_TABLES.includes(table)) throw new Error(`Invalid table: ${table}`);
    // Whitelist orderBy columns
    const VALID_ORDER_COLS = ['created_at','updated_at','name','deadline','severity','id','commitment','status'];
    const orderParts = orderBy.trim().split(/\s+/);
    const orderCol = orderParts[0];
    const orderDir = (orderParts[1] || 'DESC').toUpperCase();
    if (!VALID_ORDER_COLS.includes(orderCol) || !['ASC','DESC'].includes(orderDir)) {
      throw new Error(`Invalid orderBy: ${orderBy}`);
    }
    // Validate limit is a safe integer
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 10000);
    const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    const whereClause = conditions ? `WHERE ${conditions}` : '';
    const stmt = this.db.prepare(`SELECT * FROM ${table} ${whereClause} ORDER BY ${orderCol} ${orderDir} LIMIT ${safeLimit}`);
    if (Object.keys(where).length) stmt.bind(Object.values(where));
    return this._rowsToObjects(stmt);
  }

  delete(table, id) {
    if (!this.db) return;
    this.db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    this._save();
  }

  query(sql, params = []) {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    return this._rowsToObjects(stmt);
  }

  run(sql, params = []) {
    if (!this.db) return;
    this.db.run(sql, params);
    this._save();
  }

  // ==================== AUDIT LOG ====================

  logAction(entityType, entityId, action, performedBy, details) {
    this.insert('audit_log', {
      entity_type: entityType,
      entity_id: entityId,
      action,
      performed_by: performedBy,
      details: typeof details === 'object' ? JSON.stringify(details) : details
    });
  }

  // ==================== CONVENIENCE METHODS ====================

  getFundWithInvestors(fundId) {
    const fund = this.findById('funds', fundId);
    if (!fund) return null;
    const commitments = this.query(`
      SELECT c.*, i.name as investor_name, i.entity_type, i.jurisdiction
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ?
    `, [fundId]);
    return { ...fund, commitments };
  }

  getInvestorPortfolio(investorId) {
    return this.query(`
      SELECT c.*, f.name as fund_name, f.vintage_year, f.nav as fund_nav
      FROM commitments c
      JOIN funds f ON c.fund_id = f.id
      WHERE c.investor_id = ?
    `, [investorId]);
  }

  getUpcomingFilings(daysAhead = 30) {
    // Validate daysAhead is a safe integer to prevent SQL injection
    const safeDays = Math.min(Math.max(parseInt(daysAhead, 10) || 30, 1), 365);
    return this.query(`
      SELECT * FROM filings
      WHERE status NOT IN ('FILED', 'CONFIRMED')
        AND deadline <= date('now', '+' || ? || ' days')
      ORDER BY deadline ASC
    `, [safeDays]);
  }

  // ==================== SIGNING ENVELOPES ====================

  saveEnvelope(envelope) {
    const existing = this.findById('signing_envelopes', envelope.envelopeId);
    const data = {
      id: envelope.envelopeId,
      status: envelope.status,
      sender_name: envelope.sender?.name,
      sender_email: envelope.sender?.email,
      metadata: JSON.stringify(envelope.metadata),
      documents: JSON.stringify(envelope.documents),
      signers: JSON.stringify(envelope.signers),
      audit_trail: JSON.stringify(envelope.auditTrail),
      signing_certificate: envelope.signingCertificate ? JSON.stringify(envelope.signingCertificate) : null,
      expires_at: envelope.expiresAt,
      completed_at: envelope.completedAt
    };
    if (existing) {
      this.update('signing_envelopes', envelope.envelopeId, data);
    } else {
      this.insert('signing_envelopes', data);
    }
  }

  loadEnvelope(envelopeId) {
    const row = this.findById('signing_envelopes', envelopeId);
    if (!row) return null;
    return {
      envelopeId: row.id,
      status: row.status,
      sender: { name: row.sender_name, email: row.sender_email },
      metadata: JSON.parse(row.metadata || '{}'),
      documents: JSON.parse(row.documents || '[]'),
      signers: JSON.parse(row.signers || '[]'),
      auditTrail: JSON.parse(row.audit_trail || '[]'),
      signingCertificate: row.signing_certificate ? JSON.parse(row.signing_certificate) : null,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      createdAt: row.created_at
    };
  }

  loadAllEnvelopes() {
    const rows = this.findAll('signing_envelopes', {}, 'created_at DESC', 10000);
    return rows.map(row => this.loadEnvelope(row.id)).filter(Boolean);
  }

  close() {
    if (this.db) this.db.close();
  }
}

// Singleton
const db = new MilaDatabase();
module.exports = db;
