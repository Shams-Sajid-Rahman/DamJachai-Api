-- 007: user content (reviews, price reports, favorites)
-- reviewed_by, reviewed_at and review_note were added for the admin moderation queue (Phase 4).

CREATE TABLE reviews (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lab_id         INTEGER     NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
  rating         SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  report_on_time BOOLEAN,
  comment        TEXT        CHECK (char_length(comment) <= 2000),
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by    INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reviews_user_lab_uq UNIQUE (user_id, lab_id) -- one review per user per lab
);

CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX reviews_lab_status_idx ON reviews (lab_id, status);
CREATE INDEX reviews_status_created_idx ON reviews (status, created_at);

CREATE TABLE price_reports (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INTEGER        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lab_id         INTEGER        NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
  test_id        INTEGER        NOT NULL REFERENCES tests (id) ON DELETE CASCADE,
  reported_price NUMERIC(10, 2) NOT NULL CHECK (reported_price > 0),
  note           TEXT           CHECK (char_length(note) <= 1000),
  status         TEXT           NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by    INTEGER        REFERENCES users (id) ON DELETE SET NULL,
  review_note    TEXT           CHECK (char_length(review_note) <= 1000),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX price_reports_status_created_idx ON price_reports (status, created_at);
CREATE INDEX price_reports_lab_id_idx ON price_reports (lab_id);
CREATE INDEX price_reports_test_id_idx ON price_reports (test_id);
CREATE INDEX price_reports_user_id_idx ON price_reports (user_id);

CREATE TABLE favorites (
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lab_id     INTEGER     NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lab_id)
);

CREATE INDEX favorites_lab_id_idx ON favorites (lab_id);
