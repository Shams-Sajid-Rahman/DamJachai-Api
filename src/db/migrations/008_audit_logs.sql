-- 008: audit log of admin actions

CREATE TABLE audit_logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  action     TEXT        NOT NULL CHECK (char_length(action) BETWEEN 1 AND 50), -- create, update, delete, approve ...
  entity     TEXT        NOT NULL CHECK (char_length(entity) BETWEEN 1 AND 50), -- lab, test, lab_test ...
  entity_id  INTEGER,
  details    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);
CREATE INDEX audit_logs_admin_id_idx ON audit_logs (admin_id);
