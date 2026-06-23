from slowapi import Limiter

from database import get_settings
from services.auth_security import get_real_ip

settings = get_settings()
api_rate_limit_per_minute = max(20, int(settings.api_rate_limit_per_minute or 120))

_options = {"key_func": get_real_ip, "default_limits": [f"{api_rate_limit_per_minute}/minute"]}
if settings.redis_url:
    _options["storage_uri"] = settings.redis_url

limiter = Limiter(**_options)
