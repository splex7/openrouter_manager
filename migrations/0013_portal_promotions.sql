CREATE TABLE portal_promotions (
  id TEXT PRIMARY KEY,
  title_ko TEXT NOT NULL,
  description_ko TEXT NOT NULL,
  link_label_ko TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_en TEXT NOT NULL,
  link_label_en TEXT NOT NULL,
  link_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX portal_promotions_created_at
  ON portal_promotions(created_at);

INSERT INTO portal_promotions (
  id, title_ko, description_ko, link_label_ko,
  title_en, description_en, link_label_en, link_url
) VALUES
  (
    'promo-gemini',
    'Google Gemini 학생 1년 무료',
    '학생 인증 후 Gemini 혜택을 확인하세요. 대상·국가·약관은 Google 기준입니다.',
    'Gemini 혜택 확인 ↗',
    'Google Gemini: one year free for students',
    'Verify your student status to check Gemini benefits. Eligibility, availability and terms are set by Google.',
    'View Gemini offer ↗',
    'https://gemini.google/students/'
  ),
  (
    'promo-zed',
    'Zed Education · Pro 1년 무료',
    '인증된 대학생에게 Pro 기능과 매월 $10 AI 크레딧을 제공합니다. 자격·약관은 Zed 기준입니다.',
    'Zed Education 신청 ↗',
    'Zed Education: Pro free for one year',
    'Verified university students receive Pro features and $10/month in AI credits. Eligibility and terms are set by Zed.',
    'Apply for Zed Education ↗',
    'https://zed.dev/education'
  );
