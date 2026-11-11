-- 012: an optional moderator note on reviews (price_reports already has one).

ALTER TABLE reviews ADD COLUMN review_note TEXT CHECK (char_length(review_note) <= 1000);

-- Speeds up the dashboard's "labs with the oldest verified prices".
CREATE INDEX lab_tests_lab_verified_idx ON lab_tests (lab_id, last_verified_at);
