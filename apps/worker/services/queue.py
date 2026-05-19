import asyncio
from typing import Awaitable, Callable

from .logger import logger
from .supabase_client import get_supabase


async def poll_queued_jobs(processor: Callable[[str], Awaitable[None]], interval_seconds: int = 5) -> None:
    """Development-friendly queue fallback.

    Production deployments should use Redis/BullMQ events from the web app.
    This poller keeps local deployments functional when a BullMQ bridge is not running.
    """
    while True:
        try:
            supabase = get_supabase()
            result = supabase.table("jobs").select("id").eq("status", "queued").limit(1).execute()
            for job in result.data or []:
                await processor(job["id"])
        except Exception as exc:
            logger.error("queue_poll_failed", error=str(exc))
        await asyncio.sleep(interval_seconds)
