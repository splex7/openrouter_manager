PRAGMA foreign_keys = ON;

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  roster_number INTEGER NOT NULL UNIQUE,
  student_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  advisor_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  advisor_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name, class_name, advisor_name)
);

CREATE TABLE team_memberships (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX team_memberships_active_student
  ON team_memberships(student_id) WHERE ended_at IS NULL;
CREATE INDEX team_memberships_team_active
  ON team_memberships(team_id) WHERE ended_at IS NULL;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin', 'master')),
  student_id INTEGER UNIQUE REFERENCES students(id),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quota_policies (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('student', 'team')),
  subject_id INTEGER NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  limit_microusd INTEGER NOT NULL CHECK (limit_microusd >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (subject_type, subject_id, period)
);

CREATE TABLE api_credentials (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('student', 'team')),
  subject_id INTEGER NOT NULL,
  issued_to_student_id INTEGER REFERENCES students(id),
  openrouter_key_hash TEXT NOT NULL UNIQUE,
  key_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted', 'expired')),
  limit_microusd INTEGER,
  limit_reset TEXT CHECK (limit_reset IN ('daily', 'weekly', 'monthly')),
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX api_credentials_subject_active
  ON api_credentials(subject_type, subject_id, status);

CREATE TABLE usage_daily (
  usage_date_utc TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('student', 'team')),
  subject_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK (cost_microusd >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usage_date_utc, subject_type, subject_id, model, provider_name)
);

CREATE TABLE key_usage_snapshots (
  id INTEGER PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES api_credentials(id),
  observed_at TEXT NOT NULL,
  usage_microusd INTEGER NOT NULL DEFAULT 0 CHECK (usage_microusd >= 0),
  usage_daily_microusd INTEGER NOT NULL DEFAULT 0 CHECK (usage_daily_microusd >= 0),
  usage_weekly_microusd INTEGER NOT NULL DEFAULT 0 CHECK (usage_weekly_microusd >= 0),
  usage_monthly_microusd INTEGER NOT NULL DEFAULT 0 CHECK (usage_monthly_microusd >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX key_usage_snapshots_credential_observed
  ON key_usage_snapshots(credential_id, observed_at DESC);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_account_id TEXT REFERENCES accounts(id),
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX audit_events_created_at ON audit_events(created_at DESC);

INSERT INTO students (id, roster_number, student_number, name, class_name, advisor_name) VALUES
  (1, 1, '2021481040', '손유리', 'A', '안홍섭'),
  (2, 2, '2022131052', '이지민', 'A', '안홍섭'),
  (3, 3, '2023621046', '정의찬', 'A', '안홍섭'),
  (4, 4, '2023621007', '황상윤', 'A', '안홍섭'),
  (5, 5, '2023621063', '박민기', 'A', '안홍섭'),
  (6, 6, '2023671006', '송민우', 'A', '안홍섭'),
  (7, 7, '2023671005', '정수아', 'A', '안홍섭'),
  (8, 8, '2025621006', '남성천', 'A', '안홍섭'),
  (9, 9, '2025621017', '박정은', 'A', '안홍섭'),
  (10, 10, '2025621019', '이민정', 'A', '안홍섭'),
  (11, 11, '2023621015', '김희찬', 'A', '안홍섭'),
  (12, 12, '2022141006', '박문기', 'A', '안홍섭'),
  (13, 13, '2023621030', '박진우', 'A', '안홍섭'),
  (14, 14, '2023661008', '조하은', 'A', '안홍섭'),
  (15, 15, '2022141024', '윤종민', 'B', '천상훈'),
  (16, 16, '2024621032', '이태현', 'B', '천상훈'),
  (17, 17, '2024621017', '정은찬', 'B', '천상훈'),
  (18, 18, '2023621027', '허윤서', 'B', '천상훈'),
  (19, 19, '2023621020', '박중현', 'B', '천상훈'),
  (20, 20, '2021111005', '정재현', 'B', '천상훈'),
  (21, 21, '2023621059', '홍성욱', 'B', '천상훈'),
  (22, 22, '2023621035', '박현준', 'B', '천상훈'),
  (23, 23, '2022141014', '서진형', 'B', '천상훈'),
  (24, 24, '2025621025', '조규빈', 'B', '천상훈'),
  (25, 25, '2023621061', '하태우', 'B', '천상훈'),
  (26, 26, '2020141011', '엄태준', 'B', '천상훈'),
  (27, 27, '2024621003', '이동철', 'B', '천상훈'),
  (28, 28, '2019331037', '김선동', 'B', '천상훈'),
  (29, 29, '2025621008', '김예찬', 'B', '천상훈'),
  (30, 30, '2025621018', '윤희남', 'B', '천상훈'),
  (31, 31, '2025621002', '한승후', 'B', '천상훈'),
  (32, 32, '2025621058', 'Bhattarai Nitesh', 'C', '안홍섭'),
  (33, 33, '2025621040', 'Giri Gaurav', 'C', '안홍섭'),
  (34, 34, '2025621031', 'Goyala Anil Singh', 'C', '안홍섭'),
  (35, 35, '2025621034', 'Joshi Bishal', 'C', '안홍섭'),
  (36, 36, '2025621032', 'Pokhrel Bivash', 'C', '안홍섭'),
  (37, 37, '2025621093', 'Adhikari Pratigya', 'C', '안홍섭'),
  (38, 38, '2025621045', 'Darlami Magar Rispina', 'C', '안홍섭'),
  (39, 39, '2025621065', 'Pokhrel Aashish', 'C', '안홍섭'),
  (40, 40, '2025621055', 'Rai Divya', 'C', '안홍섭'),
  (41, 41, '2025621033', 'Rai Spandan', 'C', '안홍섭'),
  (42, 42, '2025621046', 'Subedi Anup', 'C', '안홍섭'),
  (43, 43, '2025621042', 'Acharya Dilli Prasad', 'C', '안홍섭'),
  (44, 44, '2025621060', 'K C Aakash', 'C', '안홍섭'),
  (45, 45, '2025621044', 'Mishra Namuna', 'C', '안홍섭'),
  (46, 46, '2025621070', 'Ngyasur Saujan', 'C', '안홍섭'),
  (47, 47, '2025621038', 'Rijal Rijan', 'C', '안홍섭'),
  (48, 48, '2025621095', 'Bhattarai Dipesh', 'C', '안홍섭'),
  (49, 49, '2025621096', 'Kandanwa Dhiraj', 'C', '안홍섭'),
  (50, 50, '2025621097', 'Kunwar Bibek', 'C', '안홍섭'),
  (51, 51, '2025621094', 'Munkhsukh Dulguun-Agi', 'C', '안홍섭'),
  (52, 52, '2025621029', 'Bajagain Yubraj', 'D', '천상훈'),
  (53, 53, '2025621069', 'Shrestha Arbin', 'D', '천상훈'),
  (54, 54, '2025621035', 'Shumsher JBR Surya', 'D', '천상훈'),
  (55, 55, '2025621073', 'Bamma Sushil', 'D', '천상훈'),
  (56, 56, '2025621057', 'Dahal Dipesh', 'D', '천상훈'),
  (57, 57, '2025621043', 'Kc Anil', 'D', '천상훈'),
  (58, 58, '2025621028', 'Yogi Sahara', 'D', '천상훈'),
  (59, 59, '2025621041', 'Abishek', 'D', '천상훈'),
  (60, 60, '2025621037', 'Anita', 'D', '천상훈'),
  (61, 61, '2025621030', 'Kumar', 'D', '천상훈'),
  (62, 62, '2025621036', 'Lanka', 'D', '천상훈'),
  (63, 63, '2025621099', 'Pandit Susmita', 'D', '천상훈'),
  (64, 64, '2025621100', 'Rana Ajay', 'D', '천상훈'),
  (65, 65, '2025621101', 'Rokaya Ramesh', 'D', '천상훈'),
  (66, 66, '2025621102', 'Shrestha Rajib', 'D', '천상훈'),
  (67, 67, '2025621103', 'Tamang Sajjan', 'D', '천상훈');

WITH seed(team_name, class_name, advisor_name) AS (
  VALUES
    ('교수님의 최애들', 'A', '안홍섭'), ('이게되네', 'A', '안홍섭'), ('코요테', 'A', '안홍섭'), ('테이스트리', 'A', '안홍섭'),
    ('RE:Mind', 'B', '천상훈'), ('Y P', 'B', '천상훈'), ('답변연습소', 'B', '천상훈'), ('미정 B', 'B', '천상훈'), ('식품안전보안관', 'B', '천상훈'),
    ('Aatank', 'C', '안홍섭'), ('NPCoders', 'C', '안홍섭'), ('SmartDev', 'C', '안홍섭'), ('LuzAin', 'C', '안홍섭'), ('미정 C', 'C', '안홍섭'),
    ('GOLDEN', 'D', '천상훈'), ('NeuroView', 'D', '천상훈'), ('Path Port', 'D', '천상훈'), ('CPR HERO', 'D', '천상훈')
)
INSERT INTO teams (name, class_name, advisor_name)
SELECT team_name, class_name, advisor_name FROM seed;

WITH seed(student_id, team_name) AS (
  VALUES
    (1, '교수님의 최애들'), (2, '교수님의 최애들'), (3, '교수님의 최애들'), (4, '교수님의 최애들'),
    (5, '이게되네'), (6, '이게되네'), (7, '이게되네'), (8, '코요테'), (9, '코요테'), (10, '코요테'),
    (11, '테이스트리'), (12, '테이스트리'), (13, '테이스트리'), (14, '테이스트리'),
    (15, 'RE:Mind'), (16, 'RE:Mind'), (17, 'RE:Mind'), (18, 'RE:Mind'), (19, 'Y P'), (20, 'Y P'), (21, 'Y P'),
    (22, '답변연습소'), (23, '답변연습소'), (24, '답변연습소'), (25, '답변연습소'), (26, '미정 B'), (27, '미정 B'),
    (28, '식품안전보안관'), (29, '식품안전보안관'), (30, '식품안전보안관'), (31, '식품안전보안관'),
    (32, 'Aatank'), (33, 'Aatank'), (34, 'Aatank'), (35, 'Aatank'), (36, 'Aatank'),
    (37, 'NPCoders'), (38, 'NPCoders'), (39, 'NPCoders'), (40, 'NPCoders'), (41, 'NPCoders'), (42, 'NPCoders'),
    (43, 'SmartDev'), (44, 'SmartDev'), (45, 'SmartDev'), (46, 'SmartDev'), (47, 'SmartDev'),
    (48, 'Aatank'), (49, 'LuzAin'), (50, 'NPCoders'), (51, '미정 C'),
    (52, 'GOLDEN'), (53, 'GOLDEN'), (54, 'GOLDEN'), (55, 'NeuroView'), (56, 'NeuroView'), (57, 'NeuroView'),
    (58, 'NeuroView'), (59, 'Path Port'), (60, 'Path Port'), (61, 'Path Port'), (62, 'Path Port'),
    (63, 'NeuroView'), (64, 'NeuroView'), (65, 'Path Port'), (66, 'CPR HERO'), (67, 'CPR HERO')
)
INSERT INTO team_memberships (student_id, team_id)
SELECT students.id, teams.id
FROM students
JOIN seed
  ON seed.student_id = students.id
JOIN teams ON teams.name = seed.team_name AND teams.class_name = students.class_name AND teams.advisor_name = students.advisor_name;
