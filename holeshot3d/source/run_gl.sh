#!/bin/sh
# usage: ./run_gl.sh <node script> [args...]  — serves the build dir while the script runs
cd "$(dirname "$0")/.."
python3 -m http.server 8765 --bind 127.0.0.1 >/tmp/http.log 2>&1 &
SRV=$!
sleep 0.8
node "$@"
RC=$?
kill $SRV 2>/dev/null
exit $RC
