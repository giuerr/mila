const express = require('express');
const router = express.Router();
const compliance = require('../services/complianceCalendar');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/calendar', asyncHandler((req, res) => {
  res.json(compliance.generateAnnualCalendar(req.body));
}));

router.post('/dashboard', requireFields('filings'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.filings)) throw new ValidationError('filings must be an array');
  res.json(compliance.getFilingsDashboard(req.body.filings));
}));

router.post('/alerts', requireFields('filings'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.filings)) throw new ValidationError('filings must be an array');
  res.json(compliance.getAlerts(req.body.filings));
}));

module.exports = router;
