import sys
from uuid import UUID

from services.pipeline import process_batch


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m services.batch_worker <batch_id>", file=sys.stderr)
        return 2
    process_batch(UUID(sys.argv[1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
