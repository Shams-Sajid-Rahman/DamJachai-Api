-- 009: fuzzy search on test names and aliases (Bangla and English) with pg_trgm.
-- GIN trigram indexes speed up ILIKE '%q%' as well as similarity() and the % operator.

CREATE INDEX tests_name_en_trgm_idx ON tests USING GIN (name_en gin_trgm_ops);
CREATE INDEX tests_name_bn_trgm_idx ON tests USING GIN (name_bn gin_trgm_ops);
CREATE INDEX test_aliases_alias_trgm_idx ON test_aliases USING GIN (alias gin_trgm_ops);
