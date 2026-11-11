-- 006: lab prices and price history

-- RESTRICT on labs and tests: anything with prices must be hidden (status), not hard deleted.
CREATE TABLE lab_tests (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lab_id           INTEGER        NOT NULL REFERENCES labs (id) ON DELETE RESTRICT,
  test_id          INTEGER        NOT NULL REFERENCES tests (id) ON DELETE RESTRICT,
  price            NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  discounted_price NUMERIC(10, 2) CHECK (discounted_price > 0 AND discounted_price <= price),
  report_hours     INTEGER        CHECK (report_hours > 0 AND report_hours <= 2160),
  last_verified_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
  source           TEXT           NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'user_report', 'import')),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT lab_tests_lab_test_uq UNIQUE (lab_id, test_id)
);

CREATE TRIGGER lab_tests_set_updated_at
  BEFORE UPDATE ON lab_tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The unique (lab_id, test_id) index already covers lookups by lab_id.
-- (test_id, price) serves the compare query: every lab for a test, ordered by price.
CREATE INDEX lab_tests_test_id_price_idx ON lab_tests (test_id, price);
CREATE INDEX lab_tests_price_idx ON lab_tests (price);
CREATE INDEX lab_tests_last_verified_at_idx ON lab_tests (last_verified_at);

CREATE TABLE price_history (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lab_test_id INTEGER        NOT NULL REFERENCES lab_tests (id) ON DELETE CASCADE,
  old_price   NUMERIC(10, 2) CHECK (old_price > 0), -- NULL for the first recorded price
  new_price   NUMERIC(10, 2) NOT NULL CHECK (new_price > 0),
  changed_by  INTEGER        REFERENCES users (id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX price_history_lab_test_changed_idx ON price_history (lab_test_id, changed_at);
