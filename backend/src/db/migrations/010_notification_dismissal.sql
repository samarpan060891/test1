-- Per-user notification dismissal tracking
-- Allows each user to dismiss notifications independently without affecting others

CREATE TABLE IF NOT EXISTS qc_inspection.notification_dismissal (
  user_id   UUID NOT NULL REFERENCES qc_inspection.team_stakeholder(user_id) ON DELETE CASCADE,
  event_id  UUID NOT NULL REFERENCES qc_inspection.notification_event(event_id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_dismissal_user ON qc_inspection.notification_dismissal(user_id);
