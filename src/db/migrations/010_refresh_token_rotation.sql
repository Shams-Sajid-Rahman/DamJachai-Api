-- 010: extra columns for refresh-token rotation and reuse detection.
-- revoked_at lets the server tell a harmless race (two tabs refreshing in the same second)
-- from a stolen token being replayed later. A replay revokes every session of that user.

ALTER TABLE refresh_tokens
  ADD COLUMN revoked_at TIMESTAMPTZ,
  ADD COLUMN replaced_by INTEGER REFERENCES refresh_tokens (id) ON DELETE SET NULL,
  ADD COLUMN user_agent TEXT CHECK (char_length(user_agent) <= 300);
