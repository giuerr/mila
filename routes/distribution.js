/**
 * Automated Distribution Workflow Routes
 */
const express = require('express');
const router = express.Router();
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

let distributionService;
try { distributionService = require('../services/distributionWorkflow'); } catch (e) { distributionService = null; }

router.post('/execute', requireFields('fundId', 'totalDistributionAmount'), asyncHandler((req, res) => {
  if (!distributionService) throw new Error('Distribution service not available');
  if (typeof req.body.totalDistributionAmount !== 'number' || req.body.totalDistributionAmount <= 0) {
    throw new ValidationError('totalDistributionAmount must be a positive number');
  }
  const _ic = req.app.locals._ic;
  if (_ic) {
    const check = _ic.approval.check('distribution', { amount: req.body.totalDistributionAmount });
    if (!check.approved) {
      return res.status(202).json({ pending: true, pendingId: check.pendingId, message: check.message });
    }
  }
  res.json(distributionService.executeDistribution(req.body));
}));

router.get('/status/:fundId/:distributionId', asyncHandler((req, res) => {
  if (!distributionService) throw new Error('Distribution service not available');
  res.json(distributionService.getDistributionStatus(req.params));
}));

router.post('/payment', requireFields('fundId', 'investorId', 'amount'), asyncHandler((req, res) => {
  if (!distributionService) throw new Error('Distribution service not available');
  res.json(distributionService.recordDistributionPayment(req.body));
}));

module.exports = router;
