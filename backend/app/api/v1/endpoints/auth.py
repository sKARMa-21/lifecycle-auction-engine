from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.user import Hostel, User, UserRole
from app.schemas.user import (
    HostelOut, LoginResponse, StaffCreate, StudentProfile, StudentSummary,
    UserLogin, UserOut, UserRegister, UserRoleUpdate,
)
from app.core.security import hash_password, verify_password, create_access_token
from app.api.v1.deps import get_current_user, require_roles

router = APIRouter(prefix="/auth", tags=["auth"])


def validate_password(body: UserRegister) -> None:
    if not body.password or body.password != body.password_confirmation:
        raise HTTPException(422, "Passwords must match and cannot be empty.")


def validate_hostel(db: Session, hostel_id: Optional[int], required: bool = False) -> None:
    if hostel_id is None and not required:
        return
    if hostel_id is None or not db.get(Hostel, hostel_id):
        raise HTTPException(422, "Select a valid hostel.")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister, db: Session = Depends(get_db)):
    validate_password(body)
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


@router.post("/login", response_model=LoginResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """User login verifying email and hashed credentials."""
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated.")
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Retrieve currently authenticated user profile and permissions."""
    return current_user


@router.get("/hostels", response_model=List[HostelOut])
def list_hostels(db: Session = Depends(get_db)):
    return db.scalars(select(Hostel).order_by(Hostel.code)).all()


@router.put("/me/profile", response_model=UserOut)
def save_profile(
    body: StudentProfile, db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.STUDENT)),
):
    validate_hostel(db, body.hostel_id, required=True)
    db.refresh(user, with_for_update=True)
    if user.profile_complete and user.hostel_id != body.hostel_id:
        raise HTTPException(409, "Your hostel is already assigned.")
    user.roll_number = body.roll_number.upper()
    user.degree_course = body.degree_course
    user.hostel_id = body.hostel_id
    user.phone_number = body.phone_number
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This roll number is already registered.")
    return user


@router.get("/students", response_model=List[StudentSummary])
def list_students(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GUARD, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    query = select(User).where(User.role == UserRole.STUDENT).order_by(User.full_name, User.id)
    if user.role == UserRole.ADMIN:
        if user.hostel_id is None:
            return []
        query = query.where(User.hostel_id == user.hostel_id)
    return db.scalars(query).all()


@router.get("/users", response_model=List[UserOut])
def list_users(
    role: Optional[str] = None,
    _admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
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
    validate_password(body)
    valid_roles = {r.value for r in UserRole if r != UserRole.STUDENT}
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{body.role}'. Must be one of {list(valid_roles)}.",
        )

    exists = db.scalar(select(User).where(User.email == body.email))
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered.")

    validate_hostel(db, body.hostel_id, required=body.role == UserRole.ADMIN)
    staff_user = User(
        full_name=body.full_name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
        hostel_id=body.hostel_id,
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

    hostel_id = body.hostel_id if "hostel_id" in body.model_fields_set else target_user.hostel_id
    validate_hostel(db, hostel_id, required=body.role == UserRole.ADMIN)
    target_user.role = UserRole(body.role)
    target_user.hostel_id = hostel_id
    db.commit()
    db.refresh(target_user)
    return target_user