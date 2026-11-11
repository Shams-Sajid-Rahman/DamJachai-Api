import { z, ZodError } from 'zod';
import { env } from '../config/env.js';

// PostgreSQL error codes that come from client input and should not be 500s.
const PG_ERRORS = {
  '23505': [409, 'A record with the same unique value already exists'],
  '23503': [409, 'This record is linked to other data'],
  '23514': [400, 'A value is outside the allowed range'],
  '22P02': [400, 'Invalid input value'],
};

// Central error handler. Express 5 also forwards rejected promises from async handlers here.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const { formErrors, fieldErrors } = z.flattenError(err);
    return res.status(400).json({
      error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: { ...fieldErrors, ...(formErrors.length && { _form: formErrors }) } },
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Request body is too large' } });
  }

  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: { message: err.message, code: err.code } });
  }

  if (err.code && PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    return res.status(status).json({
      error: { message, code: `DB_${err.code}`, ...(!env.isProduction && { detail: err.detail || err.message }) },
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  if (isServerError && !env.isTest) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message: isServerError && env.isProduction ? 'Internal server error' : err.message,
      ...(err.code && typeof err.code === 'string' && { code: err.code }),
      ...(err.details && { details: err.details }),
      ...(!env.isProduction && isServerError && { stack: err.stack }),
    },
  });
}
