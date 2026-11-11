import { z, ZodError } from 'zod';
import { env } from '../config/env.js';

// Central error handler. Express 5 also forwards rejected promises from async handlers here.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { message: 'Validation failed', details: z.flattenError(err).fieldErrors },
    });
  }

  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message: isServerError && env.isProduction ? 'Internal server error' : err.message,
      ...(err.details && { details: err.details }),
      ...(!env.isProduction && isServerError && { stack: err.stack }),
    },
  });
}
