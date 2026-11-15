from typing import Optional, Callable
from fastapi import Depends, HTTPException, Header, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models.user import User, UserRole


def get_current_user(
    db: Session = Depends(get_db),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    current_user_id: Optional[int] = Query(None, alias="current_user_id"),
) -> User:
    """Resolve current user from X-User-Id header or current_user_id query parameter."""
    resolved_id = x_user_id or current_user_id
    if not resolved_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide X-User-Id header or log in.",
        )

    user = db.get(User, resolved_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User with ID {resolved_id} not found.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )
    return user


def require_roles(*allowed_roles: UserRole) -> Callable[[User], User]:
    """Dependency factory enforcing that the authenticated user possesses one of the allowed roles."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        # Check against enum values or strings
        allowed_str = {r.value if isinstance(r, UserRole) else str(r) for r in allowed_roles}
        user_role_str = current_user.role.value if isinstance(current_user.role, UserRole) else str(current_user.role)

        if user_role_str not in allowed_str:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {list(allowed_str)}, your role: '{user_role_str}'.",
            )
        return current_user

    return role_checker
