-- JobPilot database schema
-- Run this whole file in MySQL Workbench (lightning-bolt "Execute" button)

CREATE DATABASE IF NOT EXISTS jobpilot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE jobpilot;

-- Users ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- Resumes (PDF text is extracted and stored in Phase 3) ------------
CREATE TABLE IF NOT EXISTS resumes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED  NOT NULL,
  file_name      VARCHAR(255)  NOT NULL,
  extracted_text MEDIUMTEXT    NOT NULL,
  is_default     TINYINT(1)    NOT NULL DEFAULT 0,
  uploaded_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resumes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Job applications (the Kanban cards) ------------------------------
CREATE TABLE IF NOT EXISTS job_applications (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED  NOT NULL,
  company_name      VARCHAR(150)  NOT NULL,
  job_title         VARCHAR(150)  NOT NULL,
  job_description   MEDIUMTEXT    NULL,
  job_url           VARCHAR(500)  NULL,
  location          VARCHAR(100)  NULL,
  notes             TEXT          NULL,
  status            ENUM('Wishlist','Applied','Interview','Offer','Rejected')
                                  NOT NULL DEFAULT 'Wishlist',
  applied_on        DATE          NULL,
  next_follow_up_on DATE          NULL,
  -- The follow-up date a reminder email was last sent for (Phase 5)
  reminder_sent_for DATE          NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- MySQL keeps this current automatically on every UPDATE
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  -- Kanban board query: "my applications grouped by status"
  KEY idx_apps_user_status (user_id, status),
  -- Reminder job query: "applications due for follow-up"
  KEY idx_apps_follow_up (next_follow_up_on),
  CONSTRAINT fk_apps_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- AI match results (filled in Phase 4) ----------------------------
CREATE TABLE IF NOT EXISTS match_analyses (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_application_id INT UNSIGNED     NOT NULL,
  resume_id          INT UNSIGNED     NOT NULL,
  score              TINYINT UNSIGNED NOT NULL,
  matched_skills     JSON             NOT NULL,
  missing_skills     JSON             NOT NULL,
  suggestions        JSON             NOT NULL,   -- tailored bullet points
  model_used         VARCHAR(100)     NOT NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_match_score CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT fk_match_app
    FOREIGN KEY (job_application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_resume
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
) ENGINE=InnoDB;
