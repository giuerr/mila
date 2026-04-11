/**
 * Error Handler Middleware
 * Generic error responses in production, detailed in development.
 * Differentiates 400 (bad input), 422 (business logic), 500 (server error).
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class BusinessLogicError extends AppError {
  constructor(message) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Wrap route handlers to catch async errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler — mount as last middleware
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log full error server-side
  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.requestId || '-'} ${req.method} ${req.originalUrl}:`, err.message);
    if (!isProduction) console.error(err.stack);
  }

  // Generic message in production for 500s
  const message = (isProduction && statusCode >= 500)
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(req.requestId && { requestId: req.requestId }),
    ...(!isProduction && statusCode >= 500 && { stack: err.stack })
  });
}

module.exports = {
  AppError,
  ValidationError,
  BusinessLogicError,
  NotFoundError,
  asyncHandler,
  errorHandler
};
