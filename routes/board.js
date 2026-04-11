const express = require('express');
const router = express.Router();
const board = require('../services/boardMaterials');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/lpac-package', asyncHandler(async (req, res) => {
  res.json(await board.generateLpacPackage(req.body));
}));

router.post('/conflict-memo', asyncHandler(async (req, res) => {
  res.json(await board.generateConflictMemo(req.body));
}));

router.post('/board-book', asyncHandler(async (req, res) => {
  res.json(await board.generateBoardBook(req.body));
}));

module.exports = router;
