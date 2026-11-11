-- 005: test categories, tests and aliases

CREATE TABLE test_categories (
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name_en TEXT NOT NULL UNIQUE CHECK (char_length(name_en) BETWEEN 1 AND 100),
  name_bn TEXT NOT NULL CHECK (char_length(name_bn) BETWEEN 1 AND 100),
  slug    TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- A category that still has tests cannot be deleted (RESTRICT).
CREATE TABLE tests (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id      INTEGER     NOT NULL REFERENCES test_categories (id) ON DELETE RESTRICT,
  name_en          TEXT        NOT NULL CHECK (char_length(name_en) BETWEEN 1 AND 200),
  name_bn          TEXT        NOT NULL CHECK (char_length(name_bn) BETWEEN 1 AND 200),
  slug             TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description      TEXT,
  sample_type      TEXT        CHECK (char_length(sample_type) <= 100),
  preparation_note TEXT,
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tests_set_updated_at
  BEFORE UPDATE ON tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX tests_category_id_idx ON tests (category_id);
CREATE INDEX tests_status_idx ON tests (status);
CREATE INDEX tests_name_en_lower_idx ON tests (lower(name_en));

-- Aliases let "CBC", "complete blood count" and the Bangla name all find the same test.
CREATE TABLE test_aliases (
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests (id) ON DELETE CASCADE,
  alias   TEXT    NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 150)
);

CREATE UNIQUE INDEX test_aliases_test_alias_uq ON test_aliases (test_id, lower(alias));
CREATE INDEX test_aliases_test_id_idx ON test_aliases (test_id);
