#!/usr/bin/env python3
"""Upload a file to a remote host via ssh stdin pipe (binary-safe).

替代 scp/sftp 的 Windows 友好上传方式。解决问题:
  - scp 在 Windows OpenSSH 9.5p2 + PowerShell 5.1 下偶发 exit=-1 / CloseWait 卡死
  - `cat file | ssh ...` 走 Git for Windows 的 cat.exe 会做 CRLF->LF 文本转换
  - sftp batch mode 静默失败,错误不可见

原理:本地用 "rb" 模式打开文件(不做任何文本转换),pipe 给 ssh 进程的 stdin;
远端用 `cat > tmp && mv -f tmp dest` 原子落盘,避免半文件状态。
17.5MB / ~11s (VPS 网络正常情况下)。

Usage:
  python upload-via-ssh.py <local_path> <remote_path>
  python upload-via-ssh.py <local_path> <remote_path> --user ecs-user --host 1.2.3.4
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("local", help="local file path (absolute or relative to cwd)")
    p.add_argument("remote", help="remote absolute path, e.g. /home/ecs-user/foo.tar.gz")
    p.add_argument("--user", default=os.environ.get("DEPLOY_USER", "ecs-user"))
    p.add_argument("--host", default=os.environ.get("DEPLOY_HOST_ADDR", "39.103.59.145"))
    p.add_argument(
        "--ssh",
        default=r"C:\Windows\System32\OpenSSH\ssh.exe",
        help="ssh client binary (default: Windows OpenSSH)",
    )
    args = p.parse_args()

    local = os.path.abspath(args.local)
    if not os.path.isfile(local):
        print(f"[upload] local file not found: {local}", file=sys.stderr)
        return 2

    size = os.path.getsize(local)
    addr = f"{args.user}@{args.host}"
    print(f"[upload] local={local} size={size} remote={args.remote} via={addr}")

    # 远端:先写 .tmp 再 mv,避免半文件状态;UPLOAD_OK 作为成功哨兵
    remote_cmd = (
        f"cat > {args.remote}.tmp && "
        f"mv -f {args.remote}.tmp {args.remote} && "
        f"ls -la {args.remote} && echo UPLOAD_OK"
    )

    # 关键:open(file, "rb") 保证 Windows 下不做 CRLF/LF 转换,
    # 字节原样进 ssh stdin,远端 cat 字节原样写盘。
    with open(local, "rb") as fh:
        proc = subprocess.Popen(
            [
                args.ssh,
                "-o", "ConnectTimeout=30",
                "-o", "ServerAliveInterval=30",
                "-o", "ServerAliveCountMax=120",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                addr,
                remote_cmd,
            ],
            stdin=fh,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        out, err = proc.communicate()

    out_text = out.decode("utf-8", "replace").rstrip() if out else ""
    err_text = err.decode("utf-8", "replace").rstrip() if err else ""

    print(f"[upload] ssh exit: {proc.returncode}")
    if out_text:
        print(f"[upload] stdout: {out_text}")
    if err_text:
        print(f"[upload] stderr: {err_text}", file=sys.stderr)

    if proc.returncode != 0:
        return proc.returncode
    if "UPLOAD_OK" not in out_text:
        print("[upload] FAILED: missing UPLOAD_OK sentinel", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
