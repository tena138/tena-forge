from fastapi import Request

LOCAL_OWNER_ID = "local_user"


def current_owner_id(request: Request) -> str:
    return str(getattr(request.state, "academy_id", None) or LOCAL_OWNER_ID)


def current_academy_id(request: Request) -> str | None:
    owner_id = current_owner_id(request)
    return None if owner_id == LOCAL_OWNER_ID else owner_id
