const express = require('express');
const router = express.Router();
const esign = require('../services/eSignature');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/subscription', asyncHandler(async (req, res) => {
  res.json(await esign.sendSubscriptionDoc(req.body));
}));

router.post('/capital-call-ack', asyncHandler(async (req, res) => {
  res.json(await esign.sendCapitalCallAck(req.body));
}));

router.post('/side-letter', asyncHandler(async (req, res) => {
  res.json(await esign.sendSideLetter(req.body));
}));

router.get('/envelope/:id', asyncHandler(async (req, res) => {
  res.json(await esign.getEnvelopeStatus(req.params.id));
}));

router.post('/bulk-send', asyncHandler(async (req, res) => {
  res.json(await esign.bulkSendSubscriptions(req.body));
}));

router.post('/dashboard', asyncHandler(async (req, res) => {
  res.json(await esign.getSigningDashboard(req.body));
}));

module.exports = router;
