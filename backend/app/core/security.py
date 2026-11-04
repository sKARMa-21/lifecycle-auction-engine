import hashlib
import os

# basic salt + sha256 for now, enough for cs699 demo
def hash_password(password: str) -> str:
    salt = os.urandom(8).hex()
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${h}"

def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, h = hashed.split("$")
        return hashlib.sha256((salt + password).encode()).hexdigest() == h
    except Exception:
        return False
