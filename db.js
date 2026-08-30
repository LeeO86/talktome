// db.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { getDataDir, getDataFile } = require("./dataPaths");
const { syncRuntimeFile } = require("./runtimeWorker");
const { getBetterSqliteBindingCandidates } = require("./betterSqliteBinding");

function resolveNativeBinding() {
  const execDir = path.dirname(process.execPath);
  const candidates = [
    ...getBetterSqliteBindingCandidates(),
    path.join(execDir, "binaries", "better_sqlite3.node"),
    path.join(execDir, "better_sqlite3.node"),
  ];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) {
    throw new Error(
      `better_sqlite3.node is missing. Checked: ${candidates.join(", ")}`
    );
  }

  const targetPath = path.join(getDataDir(), "runtime", "better_sqlite3.node");
  const result = syncRuntimeFile(sourcePath, targetPath);
  if (result.updated) {
    console.log(`[INIT] Updated better-sqlite3 runtime: ${targetPath}`);
  }
  return targetPath;
}

const nativeBinding = resolveNativeBinding();
const dbPath = getDataFile("app.db");
const db = new Database(dbPath, { nativeBinding });

// Initialize tables (run once)
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
                                         id INTEGER PRIMARY KEY AUTOINCREMENT,
                                         name TEXT NOT NULL UNIQUE,
                                         password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conferences (
                                               id INTEGER PRIMARY KEY AUTOINCREMENT,
                                               name TEXT NOT NULL UNIQUE
    );

    -- Membership table: keeps track of which users belong to which conferences
    CREATE TABLE IF NOT EXISTS user_conference (
                                                   user_id        INTEGER NOT NULL,
                                                   conference_id  INTEGER NOT NULL,
                                                   PRIMARY KEY (user_id, conference_id),
                                                   FOREIGN KEY (user_id)       REFERENCES users(id)      ON DELETE CASCADE,
                                                   FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    );

    -- Talk target: user → user
    CREATE TABLE IF NOT EXISTS user_user_targets (
                                                     user_id     INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
                                                     target_user INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
                                                     PRIMARY KEY (user_id, target_user)
    );

    -- Talk target: user → conference
    CREATE TABLE IF NOT EXISTS user_conf_targets (
                                                     user_id     INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
                                                     target_conf INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
                                                     PRIMARY KEY (user_id, target_conf)
    );

    CREATE TABLE IF NOT EXISTS user_target_order (
                                                      user_id     INTEGER NOT NULL,
                                                      target_type TEXT    NOT NULL,
                                                      target_id   INTEGER NOT NULL,
                                                      position    INTEGER NOT NULL,
                                                      PRIMARY KEY (user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS feeds (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          name TEXT NOT NULL UNIQUE,
                                          password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_feed_targets (
                                                      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
                                                      PRIMARY KEY (user_id, feed_id)
    );

    CREATE TABLE IF NOT EXISTS user_target_audio_state (
                                                           user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                           target_type TEXT    NOT NULL,
                                                           target_id   INTEGER NOT NULL,
                                                           muted       INTEGER NOT NULL DEFAULT 0,
                                                           volume      REAL    NOT NULL DEFAULT 0.9,
                                                           updated_at  TEXT    NOT NULL,
                                                           PRIMARY KEY (user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS productions (
                                                   id         INTEGER PRIMARY KEY AUTOINCREMENT,
                                                   name       TEXT NOT NULL UNIQUE,
                                                   created_at TEXT NOT NULL,
                                                   updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_users (
                                                       production_id INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                                                       user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                       is_admin      INTEGER NOT NULL DEFAULT 0,
                                                       PRIMARY KEY (production_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS production_user_targets (
                                                             production_id INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                                                             user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                             target_type   TEXT NOT NULL,
                                                             target_id     INTEGER NOT NULL,
                                                             PRIMARY KEY (production_id, user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS production_target_order (
                                                             production_id INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                                                             user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                             target_type   TEXT NOT NULL,
                                                             target_id     INTEGER NOT NULL,
                                                             position      INTEGER NOT NULL,
                                                             PRIMARY KEY (production_id, user_id, target_type, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_production_users_user
      ON production_users(user_id, production_id);

    CREATE INDEX IF NOT EXISTS idx_production_targets_user
      ON production_user_targets(production_id, user_id, target_type, target_id);

    CREATE TABLE IF NOT EXISTS user_bridge_endpoints (
                                                          user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                                                          enabled              INTEGER NOT NULL DEFAULT 0,
                                                          bridge_device        TEXT    NOT NULL DEFAULT '',
                                                          input_device         TEXT    NOT NULL DEFAULT '',
                                                          input_left_channel   INTEGER,
                                                          input_right_channel  INTEGER,
                                                          output_device        TEXT    NOT NULL DEFAULT '',
                                                          output_left_channel  INTEGER,
                                                          output_right_channel INTEGER,
                                                          trigger_mode         TEXT    NOT NULL DEFAULT 'external',
                                                          trigger_target_type  TEXT    NOT NULL DEFAULT '',
                                                          trigger_target_id    INTEGER,
                                                          trigger_threshold_db REAL    NOT NULL DEFAULT -45,
                                                          updated_at           TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feed_bridge_endpoints (
                                                          feed_id              INTEGER PRIMARY KEY REFERENCES feeds(id) ON DELETE CASCADE,
                                                          enabled              INTEGER NOT NULL DEFAULT 0,
                                                          bridge_device        TEXT    NOT NULL DEFAULT '',
                                                          input_device         TEXT    NOT NULL DEFAULT '',
                                                          input_left_channel   INTEGER,
                                                          input_right_channel  INTEGER,
                                                          updated_at           TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apple_ptt_channels (
                                                      user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                                                      channel_uuid TEXT    NOT NULL UNIQUE,
                                                      channel_name TEXT    NOT NULL,
                                                      updated_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apple_ptt_registrations (
                                                            id           INTEGER PRIMARY KEY AUTOINCREMENT,
                                                            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                            channel_uuid TEXT    NOT NULL,
                                                            push_token   TEXT    NOT NULL UNIQUE,
                                                            created_at   TEXT    NOT NULL,
                                                            updated_at   TEXT    NOT NULL
    );

    DROP TABLE IF EXISTS user_global_targets;
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((col) => col.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "is_superadmin", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "admin_must_change", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "is_guest_profile", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "login_token_hash", "TEXT");
ensureColumn("users", "last_online_at", "TEXT");
ensureColumn("user_bridge_endpoints", "trigger_mode", "TEXT NOT NULL DEFAULT 'external'");
ensureColumn("user_bridge_endpoints", "trigger_target_type", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bridge_endpoints", "trigger_target_id", "INTEGER");
ensureColumn("user_bridge_endpoints", "trigger_threshold_db", "REAL NOT NULL DEFAULT -45");

module.exports = db;
