#!/usr/bin/env python3
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_window_size(fd, rows, cols):
    try:
        size = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, size)
    except OSError:
        pass


def set_nonblocking(fd):
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: pty_bridge.py <command> [cols] [rows]\n")
        return 64

    command = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) >= 3 else 100
    rows = int(sys.argv[3]) if len(sys.argv) >= 4 else 30

    pid, master_fd = pty.fork()
    if pid == 0:
        os.execvpe(command, [command], os.environ)

    set_window_size(master_fd, rows, cols)
    set_nonblocking(master_fd)
    stdin_fd = sys.stdin.buffer.fileno()
    set_nonblocking(stdin_fd)

    def stop_child(_signum, _frame):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass

    signal.signal(signal.SIGTERM, stop_child)
    signal.signal(signal.SIGINT, stop_child)

    while True:
        try:
            ready, _, _ = select.select([master_fd, stdin_fd], [], [], 0.1)
        except OSError as error:
            if error.errno == errno.EINTR:
                continue
            raise

        if master_fd in ready:
            try:
                data = os.read(master_fd, 8192)
            except OSError as error:
                if error.errno in (errno.EIO, errno.EBADF):
                    break
                raise
            if not data:
                break
            os.write(sys.stdout.buffer.fileno(), data)

        if stdin_fd in ready:
            try:
                data = os.read(stdin_fd, 8192)
            except BlockingIOError:
                data = b""
            if data:
                os.write(master_fd, data)

        try:
            ended_pid, status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if ended_pid == pid:
            if os.WIFEXITED(status):
                return os.WEXITSTATUS(status)
            if os.WIFSIGNALED(status):
                return 128 + os.WTERMSIG(status)
            return 0

    try:
        _, status = os.waitpid(pid, 0)
        if os.WIFEXITED(status):
            return os.WEXITSTATUS(status)
        if os.WIFSIGNALED(status):
            return 128 + os.WTERMSIG(status)
    except ChildProcessError:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
