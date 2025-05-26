#!/bin/sh
# wait-for-it.sh: Wait until a host:port are available
# Usage: wait-for-it.sh host:port -- command args

set -e

host="$1"
shift

host_name=$(echo $host | cut -d: -f1)
port=$(echo $host | cut -d: -f2)

while ! nc -z "$host_name" "$port"; do
  echo "Waiting for $host_name:$port..."
  sleep 1
done

exec "$@"
