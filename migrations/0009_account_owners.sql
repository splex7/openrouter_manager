-- Personal key ownership is represented by a linked person record for both students and admins.
-- Admin records have no class, advisor, or team membership.
ALTER TABLE students ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'student';

INSERT INTO students (roster_number, student_number, name, class_name, advisor_name, owner_type)
SELECT
  (SELECT COALESCE(MAX(roster_number), 0) FROM students) + ROW_NUMBER() OVER (ORDER BY accounts.created_at, accounts.id),
  accounts.login_id,
  COALESCE(NULLIF(accounts.display_name, ''), accounts.login_id),
  '',
  '',
  'admin'
FROM accounts
WHERE accounts.role = 'admin'
  AND accounts.student_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM students WHERE students.student_number = accounts.login_id);

UPDATE accounts
SET student_id = (
  SELECT students.id FROM students WHERE students.student_number = accounts.login_id
)
WHERE accounts.role = 'admin'
  AND accounts.student_id IS NULL;

CREATE INDEX students_owner_type_active ON students(owner_type, is_active);
