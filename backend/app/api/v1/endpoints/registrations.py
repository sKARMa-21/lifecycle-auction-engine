from base64 import b64decode, b64encode
from typing import Annotated, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.deps import require_complete_profile, require_hostel_access
from app.db.session import get_db
from app.models.bicycle import Bicycle
from app.models.registration import BicycleRegistration
from app.models.user import User, UserRole

router = APIRouter(prefix="/bicycle-registrations", tags=["Bicycle Registration"])
PhotoKind = Literal["chassis", "front", "side"]
MAX_PHOTO_BYTES = 2 * 1024 * 1024


class RegistrationOut(BaseModel):
    id: int
    student_id: int
    hostel_id: int
    serial_number: str
    brand: str
    model: str
    color: str
    status: str
    reason: Optional[str]
    bicycle_id: Optional[int]

    model_config = {"from_attributes": True}


class Decision(BaseModel):
    decision: Literal["approve", "reject"]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


def encode_photo(kind: str, upload: UploadFile) -> str:
    data = upload.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, f"The {kind} photo must be 2 MB or smaller.")
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        mime = "image/jpeg"
    elif data.startswith(b"\x89PNG\r\n\x1a\n") and data.endswith(b"IEND\xaeB\x60\x82"):
        mime = "image/png"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP" and int.from_bytes(data[4:8], "little") == len(data) - 8:
        mime = "image/webp"
    else:
        raise HTTPException(422, f"The {kind} photo must be a JPEG, PNG, or WebP image.")
    return f"{mime},{b64encode(data).decode('ascii')}"


def reject_existing_serial(db: Session, serial: str) -> None:
    if db.scalar(select(Bicycle.id).where(func.upper(func.trim(Bicycle.serial_number)) == serial).limit(1)):
        raise HTTPException(409, "That chassis number is already registered.")


def get_registration(db: Session, registration_id: int, *, lock: bool = False) -> BicycleRegistration:
    query = select(BicycleRegistration).where(BicycleRegistration.id == registration_id)
    request = db.scalar(query.with_for_update() if lock else query)
    if request is None:
        raise HTTPException(404, "Registration request not found.")
    return request


@router.get("", response_model=list[RegistrationOut])
def list_requests(db: Session = Depends(get_db), user: User = Depends(require_complete_profile)):
    query = select(BicycleRegistration).order_by(BicycleRegistration.id.desc())
    if user.role == UserRole.STUDENT:
        query = query.where(BicycleRegistration.student_id == user.id)
    elif user.role == UserRole.ADMIN:
        if user.hostel_id is None:
            raise HTTPException(403, "A super admin must assign your hostel.")
        query = query.where(BicycleRegistration.hostel_id == user.hostel_id)
    elif user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(403, "You cannot access registration requests.")
    return db.scalars(query).all()


@router.post("", response_model=RegistrationOut, status_code=201)
def submit_request(
    serial_number: Annotated[str, Form(min_length=1, max_length=120)],
    brand: Annotated[str, Form(min_length=1, max_length=100)],
    model: Annotated[str, Form(min_length=1, max_length=100)],
    color: Annotated[str, Form(min_length=1, max_length=60)],
    chassis: UploadFile, front: UploadFile, side: UploadFile,
    db: Session = Depends(get_db), user: User = Depends(require_complete_profile),
):
    if user.role != UserRole.STUDENT:
        raise HTTPException(403, "Only students can submit registration requests.")
    db.refresh(user, with_for_update=True)
    if user.role != UserRole.STUDENT or not user.profile_complete:
        raise HTTPException(403, "A complete student profile is required.")
    serial, brand, model, color = (value.strip() for value in (serial_number, brand, model, color))
    if not all((serial, brand, model, color)) or len(serial.upper()) > 120:
        raise HTTPException(422, "Enter a valid chassis number, brand, model, and color.")
    serial = serial.upper()
    reject_existing_serial(db, serial)
    photos = {kind: encode_photo(kind, file) for kind, file in
              (("chassis", chassis), ("front", front), ("side", side))}
    if len(set(photos.values())) != len(photos):
        raise HTTPException(422, "Provide a different photo for each angle.")
    request = BicycleRegistration(student_id=user.id, hostel_id=user.hostel_id, serial_number=serial,
                                  brand=brand, model=model, color=color, photos=photos)
    db.add(request)
    try:
        db.flush()
        reject_existing_serial(db, serial)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A request for that chassis number is already pending.")
    return request


@router.get("/{registration_id}/photos/{kind}")
def registration_photo(
    registration_id: int, kind: PhotoKind, db: Session = Depends(get_db),
    user: User = Depends(require_complete_profile),
):
    request = get_registration(db, registration_id)
    if not (user.role == UserRole.STUDENT and user.id == request.student_id):
        require_hostel_access(user, request.hostel_id)
    mime, data = request.photos[kind].split(",", 1)
    return Response(b64decode(data), media_type=mime,
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.patch("/{registration_id}", response_model=RegistrationOut)
def review_request(
    registration_id: int, body: Decision, db: Session = Depends(get_db),
    user: User = Depends(require_complete_profile),
):
    request = get_registration(db, registration_id, lock=True)
    require_hostel_access(user, request.hostel_id)
    status = "approved" if body.decision == "approve" else "rejected"
    if request.status == status:
        return request
    if request.status != "pending":
        raise HTTPException(409, "This request has already been reviewed.")
    try:
        if body.decision == "approve":
            if db.get(User, request.student_id).role != UserRole.STUDENT:
                raise HTTPException(409, "The applicant must have a student account.")
            reject_existing_serial(db, request.serial_number)
            bicycle = Bicycle(asset_tag=f"REG-{uuid4().hex[:12].upper()}", serial_number=request.serial_number,
                              brand=request.brand, model=request.model, color=request.color,
                              owner_id=request.student_id, current_owner_id=request.student_id)
            db.add(bicycle)
            db.flush()
            request.bicycle_id = bicycle.id
        elif not body.reason:
            raise HTTPException(422, "Enter a reason for rejecting the request.")
        request.status = status
        request.reason = body.reason or None
        request.reviewed_by_id = user.id
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A bicycle with that chassis number is already registered.")
    return request