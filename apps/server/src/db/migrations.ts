export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'users_sessions_banks_imports_and_learning_links',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

      CREATE TABLE question_banks (
        id TEXT PRIMARY KEY,
        bank_key TEXT NOT NULL COLLATE NOCASE UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        active_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (active_version_id) REFERENCES bank_versions(id) ON DELETE RESTRICT
      );

      CREATE TABLE bank_versions (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        version_number INTEGER NOT NULL CHECK (version_number > 0),
        file_fingerprint TEXT NOT NULL,
        source_filename TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        question_count INTEGER NOT NULL CHECK (question_count >= 0),
        type_counts_json TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        UNIQUE (bank_id, version_number),
        UNIQUE (bank_id, file_fingerprint)
      );
      CREATE INDEX bank_versions_bank_id_idx ON bank_versions(bank_id, version_number DESC);

      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        question_type TEXT NOT NULL CHECK (question_type IN ('single', 'multiple', 'judgement')),
        source_type_label TEXT NOT NULL,
        stem TEXT NOT NULL,
        normalized_stem TEXT NOT NULL,
        options_json TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        raw_answer TEXT NOT NULL,
        source_filename TEXT NOT NULL,
        source_sheet TEXT NOT NULL,
        source_row INTEGER NOT NULL CHECK (source_row > 0),
        created_at TEXT NOT NULL
      );
      CREATE INDEX questions_version_type_idx ON questions(bank_version_id, question_type, source_row);
      CREATE INDEX questions_bank_stem_idx ON questions(bank_id, normalized_stem);

      CREATE TABLE import_jobs (
        id TEXT PRIMARY KEY,
        bank_id TEXT REFERENCES question_banks(id) ON DELETE RESTRICT,
        requested_bank_key TEXT NOT NULL,
        requested_bank_name TEXT NOT NULL,
        file_fingerprint TEXT NOT NULL,
        source_filename TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('blocked', 'pending_confirmation', 'imported', 'duplicate')),
        sheet_names_json TEXT NOT NULL,
        selected_sheet TEXT NOT NULL DEFAULT '',
        question_count INTEGER NOT NULL DEFAULT 0,
        type_counts_json TEXT NOT NULL,
        missing_answer_count INTEGER NOT NULL DEFAULT 0,
        errors_json TEXT NOT NULL,
        duplicate_stems_json TEXT NOT NULL,
        staged_questions_json TEXT,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        confirmed_at TEXT
      );
      CREATE INDEX import_jobs_created_at_idx ON import_jobs(created_at DESC);
      CREATE INDEX import_jobs_fingerprint_idx ON import_jobs(bank_id, file_fingerprint);

      CREATE TABLE exam_rules (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT REFERENCES bank_versions(id) ON DELETE RESTRICT,
        single_count INTEGER NOT NULL CHECK (single_count >= 0),
        single_points REAL NOT NULL CHECK (single_points >= 0),
        multiple_count INTEGER NOT NULL CHECK (multiple_count >= 0),
        multiple_points REAL NOT NULL CHECK (multiple_points >= 0),
        judgement_count INTEGER NOT NULL CHECK (judgement_count >= 0),
        judgement_points REAL NOT NULL CHECK (judgement_points >= 0),
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        passing_score REAL NOT NULL DEFAULT 60 CHECK (passing_score >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (bank_id, bank_version_id)
      );

      CREATE TABLE practice_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        mode TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
        created_at TEXT NOT NULL
      );
      CREATE INDEX practice_attempts_user_bank_idx ON practice_attempts(user_id, bank_id, created_at);

      CREATE TABLE favorites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, question_id)
      );

      CREATE TABLE mistake_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
        consecutive_correct_rounds INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_correct_rounds BETWEEN 0 AND 2),
        mastery_status TEXT NOT NULL DEFAULT 'review' CHECK (mastery_status IN ('review', 'reinforcing', 'mastered')),
        last_review_round_id TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, question_id)
      );

      CREATE TABLE exam_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        rules_snapshot_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('created', 'in_progress', 'submitted', 'expired', 'voided')),
        started_at TEXT,
        deadline_at TEXT,
        submitted_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX exam_sessions_user_bank_idx ON exam_sessions(user_id, bank_id, created_at DESC);

      CREATE TABLE exam_question_snapshots (
        id TEXT PRIMARY KEY,
        exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT,
        question_id TEXT REFERENCES questions(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position > 0),
        snapshot_json TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        points REAL NOT NULL CHECK (points >= 0),
        UNIQUE (exam_session_id, position)
      );

      CREATE TABLE exam_answers (
        exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT,
        snapshot_id TEXT NOT NULL REFERENCES exam_question_snapshots(id) ON DELETE RESTRICT,
        answer_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (exam_session_id, snapshot_id)
      );

      CREATE TABLE exam_results (
        exam_session_id TEXT PRIMARY KEY REFERENCES exam_sessions(id) ON DELETE RESTRICT,
        total_score REAL NOT NULL,
        correct_count INTEGER NOT NULL,
        wrong_count INTEGER NOT NULL,
        unanswered_count INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'persistent_practice_sessions_and_attempt_links',
    sql: `
      CREATE TABLE practice_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        mode TEXT NOT NULL CHECK (mode IN ('sequential', 'random', 'single', 'multiple', 'judgement', 'unanswered', 'favorites', 'mistakes')),
        current_position INTEGER NOT NULL DEFAULT 1 CHECK (current_position > 0),
        question_count INTEGER NOT NULL CHECK (question_count > 0),
        submitted_count INTEGER NOT NULL DEFAULT 0 CHECK (submitted_count >= 0),
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'exited')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX practice_sessions_user_bank_idx ON practice_sessions(user_id, bank_id, updated_at DESC);

      CREATE TABLE practice_session_questions (
        practice_session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position > 0),
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        PRIMARY KEY (practice_session_id, position),
        UNIQUE (practice_session_id, question_id)
      );

      ALTER TABLE practice_attempts ADD COLUMN practice_session_id TEXT REFERENCES practice_sessions(id) ON DELETE RESTRICT;
      CREATE UNIQUE INDEX practice_attempts_session_question_idx
        ON practice_attempts(practice_session_id, question_id) WHERE practice_session_id IS NOT NULL;
      CREATE INDEX favorites_user_bank_idx ON favorites(user_id, bank_id, bank_version_id);
      CREATE INDEX mistakes_user_bank_version_idx ON mistake_states(user_id, bank_id, bank_version_id, mastery_status);
    `,
  },
  {
    version: 3,
    name: 'account_test_marker_and_forced_password_change',
    sql: `
      ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
      ALTER TABLE users ADD COLUMN is_test_account INTEGER NOT NULL DEFAULT 0 CHECK (is_test_account IN (0, 1));
    `,
  },
  {
    version: 4,
    name: 'exam_answer_versions_and_immutable_result_details',
    sql: `
      ALTER TABLE exam_answers ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
      ALTER TABLE exam_answers ADD COLUMN marked INTEGER NOT NULL DEFAULT 0 CHECK (marked IN (0, 1));
      ALTER TABLE exam_answers ADD COLUMN last_write_id TEXT NOT NULL DEFAULT '';

      ALTER TABLE exam_results ADD COLUMN single_score REAL NOT NULL DEFAULT 0;
      ALTER TABLE exam_results ADD COLUMN multiple_score REAL NOT NULL DEFAULT 0;
      ALTER TABLE exam_results ADD COLUMN judgement_score REAL NOT NULL DEFAULT 0;
      ALTER TABLE exam_results ADD COLUMN passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1));
      ALTER TABLE exam_results ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';

      CREATE UNIQUE INDEX exam_sessions_one_active_user_idx
        ON exam_sessions(user_id) WHERE status = 'in_progress';
      CREATE INDEX exam_sessions_history_idx ON exam_sessions(user_id, status, submitted_at DESC, created_at DESC);
    `,
  },
  {
    version: 5,
    name: 'persistent_mistake_review_rounds_and_mastery_history',
    sql: `
      CREATE TABLE review_rounds (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT,
        bank_version_id TEXT NOT NULL REFERENCES bank_versions(id) ON DELETE RESTRICT,
        question_type_filter TEXT NOT NULL CHECK (question_type_filter IN ('all', 'single', 'multiple', 'judgement')),
        strategy TEXT NOT NULL CHECK (strategy IN ('random', 'weak')),
        quantity_selection TEXT NOT NULL CHECK (quantity_selection IN ('10', '20', 'all')),
        mastery_status_filter TEXT NOT NULL CHECK (mastery_status_filter IN ('pending', 'mastered')),
        available_count INTEGER NOT NULL CHECK (available_count > 0),
        question_count INTEGER NOT NULL CHECK (question_count > 0 AND question_count <= available_count),
        current_position INTEGER NOT NULL DEFAULT 1 CHECK (current_position > 0),
        submitted_count INTEGER NOT NULL DEFAULT 0 CHECK (submitted_count >= 0 AND submitted_count <= question_count),
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'exited')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        exited_at TEXT
      );
      CREATE INDEX review_rounds_user_bank_history_idx ON review_rounds(user_id, bank_id, created_at DESC);
      CREATE UNIQUE INDEX review_rounds_one_active_user_bank_idx ON review_rounds(user_id, bank_id) WHERE status = 'in_progress';

      CREATE TABLE review_round_questions (
        review_round_id TEXT NOT NULL REFERENCES review_rounds(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position > 0),
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        PRIMARY KEY (review_round_id, position),
        UNIQUE (review_round_id, question_id)
      );

      CREATE TABLE review_attempts (
        id TEXT PRIMARY KEY,
        review_round_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
        mastery_status_after TEXT NOT NULL CHECK (mastery_status_after IN ('review', 'reinforcing', 'mastered')),
        consecutive_correct_rounds_after INTEGER NOT NULL CHECK (consecutive_correct_rounds_after BETWEEN 0 AND 2),
        submitted_at TEXT NOT NULL,
        UNIQUE (review_round_id, question_id),
        FOREIGN KEY (review_round_id, question_id) REFERENCES review_round_questions(review_round_id, question_id) ON DELETE RESTRICT
      );
      CREATE INDEX review_attempts_round_submitted_idx ON review_attempts(review_round_id, submitted_at);
    `,
  },
];
