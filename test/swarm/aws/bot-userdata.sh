#!/bin/bash
# Bot box: real Chrome + test/swarm/swarm.js, __SHARDS__ shards of __PER_SHARD__
# bots, all pointed at https://gifos.app with the swarm relay.
exec > /var/log/swarm-boot.log 2>&1
set -x
shutdown -h +__TTL_MIN__          # dead-man switch; shutdown behaviour is terminate
export HOME=/root DEBIAN_FRONTEND=noninteractive
mkdir -p /opt/swarm && cd /opt/swarm
TOK=$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')
LI=$(curl -s -H "X-aws-ec2-metadata-token: $TOK" http://169.254.169.254/latest/meta-data/ami-launch-index)
RAW="https://raw.githubusercontent.com/nwcnwc/gifos/__SHA__/test/swarm"
( curl -fsSLo chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && apt-get update -q && apt-get install -yq ./chrome.deb ) &
( curl -fsSLo /tmp/node.tar.xz https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz \
  && echo "69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec  /tmp/node.tar.xz" | sha256sum -c - \
  && tar -xJ -C /usr/local --strip-components=1 -f /tmp/node.tar.xz \
  && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i --no-audit --no-fund playwright@__PW__ ) &
( curl -fsSLo swarm.js "$RAW/swarm.js" && curl -fsSLo swarm-voices.js "$RAW/swarm-voices.js"
  if [ "__VIDEOS__" = 1 ]; then
    for f in __VIDEO_FILES__; do mkdir -p "$(dirname "$f")"; curl -fsSLo "$f" "$RAW/$f" & done; wait
  fi ) &
wait
ulimit -n 65536
BASE_OFF=$(( __BOX_BASE__ + LI * __SHARDS__ * __PER_SHARD__ ))
for s in $(seq 0 $(( __SHARDS__ - 1 ))); do
  OFF=$(( BASE_OFF + s * __PER_SHARD__ ))
  SWARM_CHROME=/usr/bin/google-chrome nohup node swarm.js --room '__ROOM__' --n __PER_SHARD__ --offset $OFF \
    --relay '__RELAY__' --ramp __RAMP__ __EXTRA__ > /var/log/shard-$s.log 2>&1 &
  sleep 2
done
echo READY > /var/log/swarm-ready
