const express = require('express');
const router = express.Router();
const sync = require('../services/platformSync');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Full sync
router.post('/sync', asyncHandler(async (req, res) => {
  res.json(await sync.fullSync(req.body));
}));

// Push capital call
router.post('/push/capital-call', asyncHandler(async (req, res) => {
  res.json(await sync.pushCapitalCall(req.body));
}));

// Push distribution
router.post('/push/distribution', asyncHandler(async (req, res) => {
  res.json(await sync.pushDistribution(req.body));
}));

// Push NAV update
router.post('/push/nav', asyncHandler(async (req, res) => {
  res.json(await sync.pushNavUpdate(req.body));
}));

// Three-way reconciliation
router.post('/reconcile', asyncHandler((req, res) => {
  res.json(sync.threeWayReconciliation(req.body));
}));

// Sync history
router.get('/history/:fundId', asyncHandler((req, res) => {
  res.json(sync.getSyncHistory({ fundId: req.params.fundId, limit: parseInt(req.query.limit) || 20 }));
}));

// Platform connection status
router.get('/platforms', asyncHandler((req, res) => {
  res.json(sync.getPlatformStatus());
}));

// Configure platform
router.put('/platforms/:platformId', asyncHandler((req, res) => {
  res.json(sync.configurePlatform({ platformId: req.params.platformId, config: req.body }));
}));

module.exports = router;
