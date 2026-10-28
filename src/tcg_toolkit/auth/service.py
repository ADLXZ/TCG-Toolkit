"""Account operations and revocable persistent sessions."""
import hashlib
import secrets
import sqlite3
import time
import uuid
from .passwords import hasher, verify_password

SESSION_SECONDS = 7 * 24 * 60 * 60


def public_user(row):
    return {key: row[key] for key in ("id", "username", "created_at")}


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class DuplicateUsername(Exception):
    pass


class AuthService:
    def __init__(self, store):
        self.store = store

    def _session(self, db, user_id):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                   (token_hash(token), user_id, now + SESSION_SECONDS))
        return token

    def register(self, username, password):
        user = dict(id=str(uuid.uuid4()), username=username.lower(), created_at=int(time.time()))
        encoded = hasher.hash(password)
        with self.store.connect() as db:
            try:
                db.execute("INSERT INTO users VALUES (?, ?, ?, ?)",
                           (user["id"], user["username"], encoded, user["created_at"]))
            except sqlite3.IntegrityError as exc:
                raise DuplicateUsername from exc
            token = self._session(db, user["id"])
        return user, token

    def login(self, username, password):
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if not verify_password(row["password_hash"] if row else None, password):
                return None
            if hasher.check_needs_rehash(row["password_hash"]):
                db.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                           (hasher.hash(password), row["id"]))
            return public_user(row), self._session(db, row["id"])

    def current_user(self, token):
        if not token:
            return None
        with self.store.connect() as db:
            row = db.execute("""SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id
                WHERE token_hash = ? AND expires_at > ?""", (token_hash(token), time.time())).fetchone()
        return public_user(row) if row else None

    def logout(self, token):
        with self.store.connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
