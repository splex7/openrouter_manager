ALTER TABLE accounts ADD COLUMN memo TEXT NOT NULL DEFAULT '';

UPDATE accounts
SET display_name = COALESCE(NULLIF(display_name, ''), (SELECT name FROM students WHERE students.id = accounts.student_id), login_id)
WHERE display_name IS NULL OR display_name = '';
