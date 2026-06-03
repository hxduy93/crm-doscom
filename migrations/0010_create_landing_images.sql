CREATE TABLE IF NOT EXISTS landing_images (
  landing_id INTEGER NOT NULL,
  slot       TEXT NOT NULL,
  b64        TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT 'image/png',
  prompt     TEXT,
  source     TEXT NOT NULL DEFAULT 'gen',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (landing_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_landing_images_lid ON landing_images(landing_id);
