WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at, id) AS sequence
  FROM api_credentials
  WHERE subject_type = 'team'
)
UPDATE api_credentials
SET issue_sequence = (SELECT sequence FROM numbered WHERE numbered.id = api_credentials.id)
WHERE subject_type = 'team';

CREATE TABLE team_key_counters (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id),
  last_sequence INTEGER NOT NULL DEFAULT 0
);

INSERT INTO team_key_counters (team_id, last_sequence)
SELECT subject_id, MAX(COALESCE(issue_sequence, 0))
FROM api_credentials
WHERE subject_type = 'team'
GROUP BY subject_id;
