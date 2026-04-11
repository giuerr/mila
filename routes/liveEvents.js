/**
 * Server-Sent Events Routes for LP Portal
 */

const express = require('express');
const router = express.Router();
const liveEvents = require('../services/liveEvents');
const { asyncHandler } = require('../middleware/errorHandler');

// SSE endpoint for investor-specific events
router.get('/stream/:investorId', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ investorId: req.params.investorId, connectedAt: new Date().toISOString() })}\n\n`);
  liveEvents.addClient(req.params.investorId, res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); } catch (e) { clearInterval(heartbeat); }
  }, 30000);
  res.on('close', () => clearInterval(heartbeat));
});

// SSE endpoint for admin/CFO (all events)
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ role: 'admin', connectedAt: new Date().toISOString() })}\n\n`);
  liveEvents.addGlobalClient(res);

  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); } catch (e) { clearInterval(heartbeat); }
  }, 30000);
  res.on('close', () => clearInterval(heartbeat));
});

// Connection stats
router.get('/stats', asyncHandler((req, res) => {
  res.json(liveEvents.getStats());
}));

// Manual event triggers (for testing / admin use)
router.post('/emit/nav-update', asyncHandler((req, res) => {
  const { fundId, fundName, newNav, previousNav } = req.body;
  liveEvents.emitNavUpdate(fundId, fundName, newNav, previousNav);
  res.json({ sent: true, event: 'nav_update' });
}));

router.post('/emit/capital-call', asyncHandler((req, res) => {
  const { investorId, ...data } = req.body;
  liveEvents.emitCapitalCall(investorId, data);
  res.json({ sent: true, event: 'capital_call', investorId });
}));

module.exports = router;
