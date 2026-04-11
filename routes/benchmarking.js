const express = require('express');
const router = express.Router();
const benchmarking = require('../services/benchmarking');

router.post('/metrics', (req, res) => {
  try { res.json(benchmarking.calculatePerformanceMetrics(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quartile', (req, res) => {
  try { res.json(benchmarking.quartileRanking(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pme', (req, res) => {
  try { res.json(benchmarking.calculatePme(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/value-creation', (req, res) => {
  try { res.json(benchmarking.valueCreationBridge(req.body.deals)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/peer-comparison', (req, res) => {
  try { res.json(benchmarking.peerComparison(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
