const express = require('express');
const router = express.Router();
const ilpa = require('../services/ilpaTemplates');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/capital-call', asyncHandler((req, res) => {
  res.json(ilpa.generateCapitalCallTemplate(req.body));
}));

router.post('/distribution', asyncHandler((req, res) => {
  res.json(ilpa.generateDistributionTemplate(req.body));
}));

router.post('/quarterly', asyncHandler((req, res) => {
  res.json(ilpa.generateQuarterlyTemplate(req.body));
}));

router.post('/fee-reporting', asyncHandler((req, res) => {
  res.json(ilpa.generateFeeReportingTemplate(req.body));
}));

module.exports = router;
