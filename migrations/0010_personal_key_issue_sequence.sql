ALTER TABLE api_credentials ADD COLUMN issue_sequence INTEGER;

UPDATE api_credentials
SET issue_sequence = 1
WHERE subject_type = 'student' AND status = 'active';

CREATE TABLE personal_key_counters (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  last_sequence INTEGER NOT NULL DEFAULT 0
);

INSERT INTO personal_key_counters (student_id, last_sequence)
SELECT subject_id, MAX(COALESCE(issue_sequence, 0))
FROM api_credentials
WHERE subject_type = 'student'
GROUP BY subject_id;
