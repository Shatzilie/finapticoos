#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}

# Adjust the node user's UID/GID if they differ from the runtime request
# and fix volume ownership only when a remap is needed
changed=0

if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
fi

# Always normalise volume ownership before degrading to user node. The UID
# remap branches above only fire when the host UID/GID differ from the build
# defaults; when they match (Easypanel default) `changed=0` and chown was
# previously skipped. That left the door open to a real failure mode: any
# root process inside the container (Easypanel Console, `docker exec -u root`,
# admin scripts) can create files in /finapticoos with root ownership, and
# the next restart traps the runtime in EACCES because gosu drops to `node`
# and `node` cannot read root-owned files. Running chown unconditionally
# closes that gap. The cost on each restart is negligible for a volume with
# a handful of MB of state — switch to `--from=root:root` if it ever becomes
# hot.
chown -R node:node /finapticoos

exec gosu node "$@"
