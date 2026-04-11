const express = require('express');
const router = express.Router();
const workflow = require('../services/complianceWorkflow');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Create filing
router.post('/filings', asyncHandler((req, res) => {
  res.json(workflow.createFiling(req.body));
}));

// Update filing status
router.put('/filings/:filingId/status', requireFields('status'), asyncHandler((req, res) => {
  res.json(workflow.updateFilingStatus({ filingId: req.params.filingId, ...req.body }));
}));

// Assign filing
router.put('/filings/:filingId/assign', requireFields('assignee'), asyncHandler((req, res) => {
  res.json(workflow.assignFiling({ filingId: req.params.filingId, ...req.body }));
}));

// Update checklist item
router.put('/filings/:filingId/checklist/:itemId', asyncHandler((req, res) => {
  res.json(workflow.updateChecklistItem({ filingId: req.params.filingId, checklistItemId: req.params.itemId, ...req.body }));
}));

// Compliance dashboard
router.get('/dashboard', asyncHandler((req, res) => {
  res.json(workflow.getDashboard({ fundId: req.query.fundId, year: parseInt(req.query.year) || new Date().getFullYear() }));
}));

// Pending reminders
router.get('/reminders', asyncHandler((req, res) => {
  res.json(workflow.getPendingReminders());
}));

// Mark reminder sent
router.post('/reminders/sent', asyncHandler((req, res) => {
  workflow.markReminderSent(req.body);
  res.json({ status: 'OK' });
}));

// Audit-ready report
router.get('/audit-report', asyncHandler((req, res) => {
  res.json(workflow.generateAuditReport({ fundId: req.query.fundId, year: parseInt(req.query.year) || new Date().getFullYear() }));
}));

module.exports = router;
