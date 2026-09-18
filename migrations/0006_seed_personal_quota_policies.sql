-- Existing personal keys become the student's initial shared quota policy.
-- The newest key for each student and reset period is the source of truth.
INSERT INTO quota_policies (
  id, subject_type, subject_id, period, limit_microusd, is_active, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),
  'student',
  credentials.subject_id,
  credentials.limit_reset,
  credentials.limit_microusd,
  1,
  credentials.created_at,
  credentials.updated_at
FROM api_credentials AS credentials
WHERE credentials.subject_type = 'student'
  AND credentials.limit_reset IS NOT NULL
  AND credentials.limit_microusd IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM api_credentials AS newer
    WHERE newer.subject_type = credentials.subject_type
      AND newer.subject_id = credentials.subject_id
      AND newer.limit_reset = credentials.limit_reset
      AND newer.created_at > credentials.created_at
  )
ON CONFLICT(subject_type, subject_id, period) DO NOTHING;
