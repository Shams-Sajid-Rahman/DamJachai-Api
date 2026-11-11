-- 011: search_count on tests. It goes up each time someone opens a test's compare page.
-- GET /api/tests/popular uses it to rank tests.

ALTER TABLE tests ADD COLUMN search_count INTEGER NOT NULL DEFAULT 0 CHECK (search_count >= 0);

CREATE INDEX tests_search_count_idx ON tests (search_count DESC);
