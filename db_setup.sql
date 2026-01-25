CREATE TABLE IF NOT EXISTS pins (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  batch_year TEXT,
  profession TEXT,
  company TEXT,
  city TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  contact_info TEXT, -- Optional: Email or trimmed phone
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pins_school ON pins(school_name);
CREATE INDEX IF NOT EXISTS idx_pins_city ON pins(city);
