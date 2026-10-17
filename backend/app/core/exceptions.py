class LifecycleDomainError(Exception):
    """Base domain error for bicycle lifecycle management."""
    pass


class InvalidStateTransitionError(LifecycleDomainError):
    """Raised when attempting an impossible or disallowed state transition."""
    pass


class DegreeDurationActiveError(LifecycleDomainError):
    """Raised when authority tries to impound or tag a cycle whose owner is still actively enrolled."""
    pass


class UnauthorizedTransitionError(LifecycleDomainError):
    """Raised when an actor lacks the required role or ownership for a transition."""
    pass


class GracePeriodNotExpiredError(LifecycleDomainError):
    """Raised when attempting to promote an asset to auctionable before the 30-day grace period has passed."""
    pass
