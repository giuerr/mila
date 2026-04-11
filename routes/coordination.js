/**
 * Inter-Agent Coordination (NANDA) Routes
 */
const express = require('express');
const router = express.Router();
const { requireFields } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

let coordination;
try { coordination = require('../services/interAgentCoordination'); } catch (e) { coordination = null; }

router.post('/dispatch', requireFields('eventType', 'payload'), asyncHandler(async (req, res) => {
  if (!coordination) throw new Error('Coordination service not available');
  res.json(await coordination.dispatchEvent(req.body));
}));

router.get('/log', asyncHandler((req, res) => {
  if (!coordination) throw new Error('Coordination service not available');
  res.json(coordination.getEventLog({ limit: parseInt(req.query.limit, 10) || 50 }));
}));

router.get('/agents', asyncHandler(async (req, res) => {
  if (!coordination) throw new Error('Coordination service not available');
  res.json(await coordination.getAgentStatus());
}));

module.exports = router;
