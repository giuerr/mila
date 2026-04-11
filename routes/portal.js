/**
 * Investor Portal API
 * LP-facing endpoints — scoped to authenticated investor's data only.
 * Capital accounts, documents, reports, activity history.
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize, scopeToInvestor } = require('../middleware/auth');
const db = require('../db/database');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// All portal routes require auth + investor scoping
router.use(authenticate, scopeToInvestor);

// Dashboard — investor overview
router.get('/dashboard', asyncHandler((req, res) => {
  // Investors can ONLY access their own data — no query param override
  const investorId = req.user.role === 'INVESTOR'
    ? req.investorScope  // Forced scope for investors
    : (req.investorScope || req.query.investorId); // Admins/CFO can query any
  if (!investorId) return res.status(400).json({ error: 'Investor ID required' });

  const investments = db.getInvestorPortfolio(investorId);
  const investor = db.findById('investors', investorId);

  const totalCommitment = investments.reduce((s, i) => s + i.commitment, 0);
  const totalCalled = investments.reduce((s, i) => s + i.called_capital, 0);
  const totalDistributions = investments.reduce((s, i) => s + i.distributions, 0);
  const totalNav = investments.reduce((s, i) => s + i.capital_account, 0);

  res.json({
    investor: { id: investor?.id, name: investor?.name },
    summary: {
      activeFunds: investments.length,
      totalCommitment,
      totalCalled,
      totalDistributions,
      totalNav,
      totalValue: totalDistributions + totalNav,
      tvpi: totalCalled > 0 ? parseFloat(((totalDistributions + totalNav) / totalCalled).toFixed(4)) : 0,
      dpi: totalCalled > 0 ? parseFloat((totalDistributions / totalCalled).toFixed(4)) : 0
    },
    funds: investments.map(inv => ({
      fundName: inv.fund_name,
      fundId: inv.fund_id,
      vintageYear: inv.vintage_year,
      commitment: inv.commitment,
      calledCapital: inv.called_capital,
      distributions: inv.distributions,
      capitalAccount: inv.capital_account,
      unfunded: inv.unfunded,
      tvpi: inv.called_capital > 0
        ? parseFloat(((inv.distributions + inv.capital_account) / inv.called_capital).toFixed(4))
        : 0
    }))
  });
}));

// Capital account detail for a specific fund
router.get('/capital-account/:fundId', asyncHandler((req, res) => {
  const investorId = req.investorScope || req.query.investorId;
  const commitment = db.query(
    'SELECT * FROM commitments WHERE fund_id = ? AND investor_id = ?',
    [req.params.fundId, investorId]
  )[0];

  if (!commitment) return res.status(404).json({ error: 'Commitment not found' });

  const activity = db.query(
    'SELECT * FROM capital_activity WHERE fund_id = ? AND investor_id = ? ORDER BY created_at DESC',
    [req.params.fundId, investorId]
  );

  res.json({
    fundId: req.params.fundId,
    commitment: commitment.commitment,
    calledCapital: commitment.called_capital,
    distributions: commitment.distributions,
    capitalAccount: commitment.capital_account,
    unfunded: commitment.unfunded,
    closingDate: commitment.closing_date,
    lpClass: commitment.lp_class,
    activity: activity.map(a => ({
      id: a.id,
      type: a.type,
      amount: a.amount,
      date: a.payment_date || a.due_date,
      status: a.status,
      purpose: a.purpose,
      wireReference: a.wire_reference
    }))
  });
}));

// Documents available to this investor
router.get('/documents', asyncHandler((req, res) => {
  // In production, query a documents table filtered by investor access
  res.json({
    categories: [
      { name: 'Quarterly Reports', documents: [] },
      { name: 'Capital Call Notices', documents: [] },
      { name: 'Distribution Notices', documents: [] },
      { name: 'Capital Account Statements', documents: [] },
      { name: 'Tax Documents (K-1)', documents: [] },
      { name: 'Audited Financial Statements', documents: [] }
    ],
    note: 'Document storage integration required — connect to data room provider'
  });
}));

// Activity feed — recent events relevant to this investor
router.get('/activity', asyncHandler((req, res) => {
  const investorId = req.investorScope || req.query.investorId;
  const limit = parseInt(req.query.limit) || 20;

  const activity = db.query(`
    SELECT * FROM capital_activity
    WHERE investor_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [investorId, limit]);

  res.json({
    investorId,
    recentActivity: activity.map(a => ({
      id: a.id,
      type: a.type,
      fundId: a.fund_id,
      amount: a.amount,
      status: a.status,
      date: a.created_at,
      description: a.type === 'CAPITAL_CALL'
        ? `Capital call of ${a.amount} — ${a.status}`
        : `Distribution of ${a.amount} — ${a.status}`
    }))
  });
}));

// Notifications for this investor
router.get('/notifications', asyncHandler((req, res) => {
  const investorId = req.investorScope || req.query.investorId;

  // Upcoming capital calls
  const pendingCalls = db.query(`
    SELECT * FROM capital_activity
    WHERE investor_id = ? AND type = 'CAPITAL_CALL' AND status = 'PENDING'
    ORDER BY due_date ASC
  `, [investorId]);

  res.json({
    pendingCapitalCalls: pendingCalls.length,
    notifications: pendingCalls.map(c => ({
      type: 'CAPITAL_CALL_DUE',
      message: `Capital call of ${c.amount} due on ${c.due_date}`,
      dueDate: c.due_date,
      amount: c.amount,
      fundId: c.fund_id
    }))
  });
}));

// --- Capital Account Statement (JSON + HTML + PDF) ---
const statementService = require('../services/capitalAccountStatement');

router.get('/statement/:fundId/:investorId', asyncHandler((req, res) => {
  const { fundId, investorId } = req.params;
  const { asOfDate, period } = req.query;
  res.json(statementService.generateStatement({ fundId, investorId, asOfDate, period }));
}));

router.get('/statement/:fundId/:investorId/html', asyncHandler((req, res) => {
  const { fundId, investorId } = req.params;
  const { asOfDate, period } = req.query;
  const html = statementService.generateStatementHtml({ fundId, investorId, asOfDate, period });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

router.get('/statement/:fundId/:investorId/pdf', asyncHandler(async (req, res) => {
  const { fundId, investorId } = req.params;
  const { asOfDate, period } = req.query;
  const html = statementService.generateStatementHtml({ fundId, investorId, asOfDate, period });
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', margin: { top: '30px', right: '30px', bottom: '30px', left: '30px' }, printBackground: true });
  await browser.close();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="capital_account_${fundId}_${investorId}.pdf"`);
  res.send(pdf);
}));

module.exports = router;
