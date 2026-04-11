/**
 * Request ID Middleware
 * Assigns a unique correlation ID to every request for tracing across logs.
 */

const crypto = require('crypto');

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || `mila-${crypto.randomBytes(8).toString('hex')}`;
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = requestId;
