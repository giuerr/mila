const express = require('express');
const router = express.Router();
const pa = require('../services/placementAgent');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/track-fees', asyncHandler((req, res) => {
  res.json(pa.trackFees(req.body));
}));

router.post('/offset', asyncHandler((req, res) => {
  res.json(pa.calculateOffset(req.body));
}));

router.post('/disclosure', asyncHandler((req, res) => {
  res.json(pa.generateDisclosure(req.body));
}));

module.exports = router;
