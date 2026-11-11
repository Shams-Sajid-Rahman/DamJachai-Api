-- 003: cities and areas
-- A slug column is added to both so URL filters can use ?city=dhaka&area=mirpur.

CREATE TABLE cities (
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name_en TEXT NOT NULL UNIQUE CHECK (char_length(name_en) BETWEEN 1 AND 100),
  name_bn TEXT NOT NULL CHECK (char_length(name_bn) BETWEEN 1 AND 100),
  slug    TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- A city that still has areas or labs cannot be deleted (RESTRICT).
CREATE TABLE areas (
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
  name_en TEXT    NOT NULL CHECK (char_length(name_en) BETWEEN 1 AND 100),
  name_bn TEXT    NOT NULL CHECK (char_length(name_bn) BETWEEN 1 AND 100),
  slug    TEXT    NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  UNIQUE (city_id, slug),
  UNIQUE (city_id, name_en)
);

CREATE INDEX areas_city_id_idx ON areas (city_id);
