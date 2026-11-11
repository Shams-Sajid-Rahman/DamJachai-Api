import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const CSV_MAX_BYTES = 1024 * 1024; // 1 MB is plenty for 2,000 rows

const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']);

/** One CSV file, kept in memory (never written to disk), under 1 MB. */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_MAX_BYTES, files: 1, fields: 5, parts: 7 },
  fileFilter: (req, file, cb) => {
    const okName = /\.csv$/i.test(file.originalname);
    const okType = CSV_MIME_TYPES.has(file.mimetype);
    if (okName && okType) return cb(null, true);
    return cb(ApiError.badRequest('Only .csv files are allowed'));
  },
}).single('file');
