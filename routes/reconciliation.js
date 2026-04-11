const express = require('express');
const router = express.Router();
const recon = require('../services/bankReconciliation');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/cash', asyncHandler((req, res) => {
  res.json(recon.reconcileCash(req.body));
}));

router.post('/capital-accounts', asyncHandler((req, res) => {
  res.json(recon.reconcileCapitalAccounts(req.body));
}));

router.post('/intercompany', asyncHandler((req, res) => {
  res.json(recon.reconcileIntercompany(req.body));
}));

module.exports = router;
