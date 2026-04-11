const express = require('express');
const router = express.Router();
const sideLetters = require('../services/sideLetterManager');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/inventory', requireFields('sideLetters'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.sideLetters)) throw new ValidationError('sideLetters must be an array');
  res.json(sideLetters.buildInventory(req.body.sideLetters));
}));

router.post('/mfn', asyncHandler((req, res) => {
  res.json(sideLetters.processMfnElections(req.body));
}));

router.post('/compliance', requireFields('sideLetters', 'fundActivity'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.sideLetters)) throw new ValidationError('sideLetters must be an array');
  res.json(sideLetters.monitorCompliance(req.body.sideLetters, req.body.fundActivity));
}));

module.exports = router;
