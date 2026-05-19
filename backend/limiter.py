from slowapi import Limiter

from database import get_settings
from services.auth_security import get_real_ip

settings = get_settings()

_options = {"key_func": get_real_ip, "default_limits": ["20/minute"]}
if settings.redis_url:
    _options["storage_uri"] = settings.redis_url

limiter = Limiter(**_options)
