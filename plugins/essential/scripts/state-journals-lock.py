"""holds the journal publication lock across the Bun process lifetime"""

import fcntl
import json
import os
import stat
import sys


def main() -> int:
    if len(sys.argv) < 5:
        return emit_error("lock_failed", "journal lock invocation is incomplete")
    lock_path, bun_path, script_path, *arguments = sys.argv[1:]
    try:
        descriptor = os.open(
            lock_path,
            os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
            0o600,
        )
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            return emit_error("lock_failed", "journal lock is not a regular file")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return emit_error(
                "lock_contention", "another journal publisher holds the lock"
            )
        os.set_inheritable(descriptor, True)
        environment = dict(os.environ)
        environment["STATE_JOURNALS_LOCK_FD"] = str(descriptor)
        os.execve(bun_path, [bun_path, script_path, *arguments], environment)
    except OSError:
        return emit_error(
            "lock_failed", "journal publication lock could not be acquired"
        )


def emit_error(code: str, message: str) -> int:
    sys.stdout.write(
        json.dumps({"status": "error", "code": code, "error": message}) + "\n"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
