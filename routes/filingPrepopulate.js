/**
 * Regulatory Filing Auto-Prepopulation Routes
 */

const express = require('express');
const router = express.Router();
const filingService = require('../services/filingAutoPrepopulate');
const { asyncHandler } = require('../middleware/errorHandler');

router.post('/prepopulate/:filingId', asyncHandler((req, res) => {
  res.json(filingService.prepopulate({ filingId: req.params.filingId }));
}));

router.get('/upcoming', asyncHandler((req, res) => {
  const daysAhead = parseInt(req.query.daysAhead, 10) || 60;
  res.json(filingService.getUpcomingWithReadiness(daysAhead));
}));

module.exports = router;
