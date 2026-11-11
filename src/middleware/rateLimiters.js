import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

function limiter({ windowMinutes, max, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest, // tests make many requests from the same IP
    handler: (req, res) => res.status(429).json({ error: { message, code: 'RATE_LIMITED' } }),
  });
}

export const loginLimiter = limiter({
  windowMinutes: 15,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

export const registerLimiter = limiter({
  windowMinutes: 60,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.',
});

export const refreshLimiter = limiter({
  windowMinutes: 15,
  max: 100,
  message: 'Too many requests. Please slow down.',
});

/** General limit for the whole API. */
export const apiLimiter = limiter({
  windowMinutes: 15,
  max: 1000,
  message: 'Too many requests. Please slow down.',
});

/** User-generated content: price reports and reviews. */
export const contributionLimiter = limiter({
  windowMinutes: 60,
  max: 30,
  message: 'You have sent a lot of reports or reviews. Please try again later.',
});
