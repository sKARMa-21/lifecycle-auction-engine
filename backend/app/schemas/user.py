from typing import Optional

from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated


class UserRegister(BaseModel):
    full_name: str
    email: str
    password: str
    password_confirmation: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class StaffCreate(UserRegister):
    role: str
    hostel_id: Optional[int] = None


class UserRoleUpdate(BaseModel):
    role: str
    hostel_id: Optional[int] = None


class HostelOut(BaseModel):
    id: int
    code: str
    name: str

    model_config = {"from_attributes": True}


class StudentProfile(BaseModel):
    roll_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30,
                                                  pattern=r"^[A-Za-z0-9][A-Za-z0-9-]*$")]
    degree_course: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    hostel_id: int = Field(gt=0)
    phone_number: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9]{7,15}$")]


class StudentSummary(BaseModel):
    id: int
    full_name: str

    model_config = {"from_attributes": True}


class UserOut(StudentSummary):
    email: str
    role: str
    is_active: Optional[bool] = True
    hostel_id: Optional[int]
    roll_number: Optional[str]
    degree_course: Optional[str]
    phone_number: Optional[str]
    profile_complete: bool


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut