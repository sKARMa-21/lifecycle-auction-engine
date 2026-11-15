from typing import Optional
from pydantic import BaseModel, EmailStr

class UserRegister(BaseModel):
    full_name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class StaffCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: str  # 'super_admin' | 'admin' | 'guard'

class UserRoleUpdate(BaseModel):
    role: str

class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    is_active: Optional[bool] = True

    model_config = {"from_attributes": True}
