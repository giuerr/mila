/**
 * Automated Capital Call Workflow Routes
 */

const express = require('express');
const router = express.Router();
const workflow = require('../services/capitalCallWorkflow');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Execute full capital call
router.post('/execute', requireFields('fundId', 'callAmount'), asyncHandler((req, res) => {
  if (typeof req.body.callAmount !== 'number' || req.body.callAmount <= 0) {
    throw new ValidationError('callAmount must be a positive number');
  }
  const _ic = req.app.locals._ic;
  if (_ic) {
    const check = _ic.approval.check('capital_call', { amount: req.body.callAmount });
    if (!check.approved) {
      return res.status(202).json({ pending: true, pendingId: check.pendingId, message: check.message });
    }
  }
  res.json(workflow.executeCapitalCall(req.body));
}));

// Record wire receipt
router.post('/wire-receipt', requireFields('fundId', 'investorId', 'callNumber', 'amount'), asyncHandler((req, res) => {
  res.json(workflow.recordWireReceipt(req.body));
}));

// Get call status
router.get('/status/:fundId/:callNumber', asyncHandler((req, res) => {
  res.json(workflow.getCallStatus({
    fundId: req.params.fundId,
    callNumber: parseInt(req.params.callNumber, 10)
  }));
}));

module.exports = router;
