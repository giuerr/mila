const express = require('express');
const router = express.Router();
const gp = require('../services/gpEconomics');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/carry-allocation', asyncHandler((req, res) => {
  res.json(gp.allocateCarry(req.body));
}));

router.post('/vesting', asyncHandler((req, res) => {
  res.json(gp.modelVestingSchedule(req.body));
}));

router.post('/departure', asyncHandler((req, res) => {
  res.json(gp.processDeparture(req.body));
}));

router.post('/commitment', asyncHandler((req, res) => {
  res.json(gp.trackGpCommitment(req.body));
}));

router.post('/manco-forecast', asyncHandler((req, res) => {
  res.json(gp.forecastManCoEconomics(req.body));
}));

module.exports = router;
