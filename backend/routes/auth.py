"""Auth routes: register, login, me."""
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
import bcrypt as _bcrypt
from jose import JWTError, jwt

from database import get_db, User

router = APIRouter(prefix="/api/auth", tags=["auth"])

SECRET_KEY = os.getenv("SECRET_KEY", "smartbin-dev-secret-change-in-prod")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7  # 1 week

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── schemas ──────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: str
    password: str
    name: str
    role: str = "citizen"       # "municipality" | "citizen"
    region: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ── helpers ──────────────────────────────────────────────────────────
def hash_pw(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode("utf-8")[:72], _bcrypt.gensalt()).decode()


def verify_pw(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode())


def create_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name,
            "role": u.role, "region": u.region}


# ── endpoints ────────────────────────────────────────────────────────
@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if body.role not in ("municipality", "citizen"):
        raise HTTPException(status_code=422, detail="role must be 'municipality' or 'citizen'")
    user = User(
        email=body.email,
        password_hash=hash_pw(body.password),
        name=body.name,
        role=body.role,
        region=body.region,
    )
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token": create_token(user.id), "user": _user_dict(user)}


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_pw(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": create_token(user.id), "user": _user_dict(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return _user_dict(user)
