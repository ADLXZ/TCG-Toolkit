"""Argon2id password hashing."""
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

hasher = PasswordHasher()
_dummy_hash = hasher.hash("unavailable-account-password")


def verify_password(encoded, password):
    try:
        return hasher.verify(encoded or _dummy_hash, password) and encoded is not None
    except VerifyMismatchError:
        return False
