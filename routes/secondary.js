const express = require('express');
const router = express.Router();
const secondary = require('../services/secondaryMarket');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/transfer', asyncHandler((req, res) => {
  res.json(secondary.initiateTransfer(req.body));
}));

router.post('/rofr', asyncHandler((req, res) => {
  res.json(secondary.processRofr(req.body));
}));

router.post('/pricing', asyncHandler((req, res) => {
  res.json(secondary.calculateTransferPricing(req.body));
}));

router.post('/doc-checklist', asyncHandler((req, res) => {
  res.json(secondary.generateDocChecklist(req.body));
}));

module.exports = router;
