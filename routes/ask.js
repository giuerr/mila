/**
 * Natural Language Query Routes
 * POST /api/ask — AI-powered fund Q&A
 * POST /api/ask/local — Keyword-based Q&A (no API key needed)
 */

const express = require('express');
const router = express.Router();
const nlq = require('../services/naturalLanguageQuery');
const { requireFields } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

// AI-powered query (requires ANTHROPIC_API_KEY)
router.post('/', requireFields('question'), asyncHandler(async (req, res) => {
  const result = await nlq.ask(req.body);
  const _ic = req.app.locals._ic;
  if (_ic) {
    const scored = _ic.confidence.score(result.answer, { withinCoreDomain: true, allInputsProvided: !!req.body.question });
    result.confidence = scored.confidence;
  }
  res.json(result);
}));

// Local keyword-based query (no API key needed)
router.post('/local', requireFields('question'), asyncHandler((req, res) => {
  res.json(nlq.askLocal(req.body));
}));

module.exports = router;
