-- 004: diagnostic labs

CREATE TABLE labs (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                TEXT           NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150),
  slug                TEXT           NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  city_id             INTEGER        NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
  area_id             INTEGER        REFERENCES areas (id) ON DELETE SET NULL,
  address             TEXT,
  phone               TEXT           CHECK (char_length(phone) <= 40),
  website             TEXT           CHECK (char_length(website) <= 300),
  latitude            NUMERIC(9, 6)  CHECK (latitude BETWEEN -90 AND 90),
  longitude           NUMERIC(9, 6)  CHECK (longitude BETWEEN -180 AND 180),
  opening_hours       TEXT,
  is_accredited       BOOLEAN        NOT NULL DEFAULT FALSE,
  accreditation_note  TEXT,
  home_collection     BOOLEAN        NOT NULL DEFAULT FALSE,
  home_collection_fee NUMERIC(10, 2) CHECK (home_collection_fee >= 0),
  -- TRUE for seed or demo labs, so the UI can show a "sample data" badge.
  is_sample           BOOLEAN        NOT NULL DEFAULT FALSE,
  status              TEXT           NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER labs_set_updated_at
  BEFORE UPDATE ON labs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX labs_city_id_idx ON labs (city_id);
CREATE INDEX labs_area_id_idx ON labs (area_id);
CREATE INDEX labs_status_idx ON labs (status);
CREATE INDEX labs_name_trgm_idx ON labs USING GIN (name gin_trgm_ops);
