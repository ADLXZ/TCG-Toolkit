"""Versioned SQLite user and session persistence."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3


class UserStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 2:
                raise RuntimeError("User database is newer than this application.")
            if version == 0:
                db.execute("""CREATE TABLE users (
                    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)""")
                db.execute("""CREATE TABLE sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                    expires_at INTEGER NOT NULL)""")
                db.execute("CREATE INDEX sessions_expiry ON sessions(expires_at)")
                db.execute("PRAGMA user_version = 1")
            if version < 2:
                db.execute("""CREATE TABLE favorites (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                    game TEXT NOT NULL, product_url TEXT NOT NULL,
                    snapshot TEXT NOT NULL, created_at INTEGER NOT NULL,
                    refreshed_at INTEGER,
                    UNIQUE(user_id, game, product_url))""")
                db.execute("PRAGMA user_version = 2")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            with db:
                yield db
        finally:
            db.close()
