from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserRegister, UserLogin, UserOut, StaffCreate, UserRoleUpdate
from app.core.security import hash_password, verify_password
from app.api.v1.deps import get_current_user, require_roles

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister, db: Session = Depends(get_db)):
    """Public self-registration for students with verified campus LDAP identity."""
    exists = db.scalar(select(User).where(User.email == body.email))
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Strictly assign STUDENT role to public registrations.
    user = User(
        full_name=body.full_name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.STUDENT,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=UserOut)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """User login verifying email and hashed credentials."""
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated.")
    return user


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Retrieve currently authenticated user profile and permissions."""
    return current_user


@router.get("/users", response_model=List[UserOut])
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List registered users, optionally filtered by role."""
    query = select(User).order_by(User.id)
    if role:
        query = query.where(User.role == role)
    return list(db.scalars(query).all())


@router.post("/staff", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_staff_user(
    body: StaffCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    """Super Admin endpoint to provision operational accounts (Admin, Guard, or Super Admin)."""
    valid_roles = {r.value for r in UserRole}
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{body.role}'. Must be one of {list(valid_roles)}.",
        )

    exists = db.scalar(select(User).where(User.email == body.email))
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered.")

    staff_user = User(
        full_name=body.full_name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
        is_active=True,
    )
    db.add(staff_user)
    db.commit()
    db.refresh(staff_user)
    return staff_user


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    """Super Admin endpoint to change any user's role (promote/demote)."""
    valid_roles = {r.value for r in UserRole}
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{body.role}'. Must be one of {list(valid_roles)}.",
        )

    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User #{user_id} not found.")

    target_user.role = UserRole(body.role)
    db.commit()
    db.refresh(target_user)
    return target_user
