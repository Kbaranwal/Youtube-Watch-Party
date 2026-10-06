from models import Role

# Which roles are allowed to perform which action.
PERMISSIONS = {
    "play": {Role.HOST, Role.MODERATOR},
    "pause": {Role.HOST, Role.MODERATOR},
    "seek": {Role.HOST, Role.MODERATOR},
    "change_video": {Role.HOST, Role.MODERATOR},
    "set_rate": {Role.HOST, Role.MODERATOR},
    "approve_request": {Role.HOST, Role.MODERATOR},
    "reject_request": {Role.HOST, Role.MODERATOR},
    "assign_role": {Role.HOST},
    "remove_participant": {Role.HOST},
    "transfer_host": {Role.HOST},
}


def can(role: Role, action: str) -> bool:
    """Return True if the given role may perform the action."""
    return role in PERMISSIONS.get(action, set())