-- Dump ecothrift columns for AI / docs — pair with README “Update schema” → schema.csv
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'ecothrift'
ORDER BY c.table_name, c.ordinal_position;
