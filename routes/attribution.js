/**
 * Performance Attribution Routes
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

let attribution;
try { attribution = require('../services/performanceAttribution'); } catch (e) { attribution = null; }

router.get('/:fundId', asyncHandler((req, res) => {
  if (!attribution) throw new Error('Attribution service not available');
  res.json(attribution.attributeReturns({ fundId: req.params.fundId }));
}));

router.get('/:fundId/top', asyncHandler((req, res) => {
  if (!attribution) throw new Error('Attribution service not available');
  res.json(attribution.topContributors({ fundId: req.params.fundId, limit: parseInt(req.query.limit, 10) || 10 }));
}));

router.get('/:fundId/bottom', asyncHandler((req, res) => {
  if (!attribution) throw new Error('Attribution service not available');
  res.json(attribution.bottomContributors({ fundId: req.params.fundId, limit: parseInt(req.query.limit, 10) || 10 }));
}));

module.exports = router;
