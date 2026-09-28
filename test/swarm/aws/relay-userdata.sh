#!/bin/bash
# Relay box: relay-local.js (RELAY_DEV=1, no per-IP caps) behind Caddy, which
# gets a real certificate for <ip-with-dashes>.sslip.io, so https://gifos.app
# pages — the bots' and a real person's — can reach it as wss://.
exec > /var/log/swarm-boot.log 2>&1
set -x
shutdown -h +__TTL_MIN__          # dead-man switch; shutdown behaviour is terminate
export HOME=/root
cd /opt
TOK=$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')
IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOK" http://169.254.169.254/latest/meta-data/public-ipv4)
HOST="${IP//./-}.sslip.io"
curl -fsSLo /tmp/node.tar.xz https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz \
  && echo "69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec  /tmp/node.tar.xz" | sha256sum -c - \
  && tar -xJ -C /usr/local --strip-components=1 -f /tmp/node.tar.xz
CADDY=$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest | grep -oE 'https://[^"]+linux_amd64\.tar\.gz' | head -1)
curl -fsSL "$CADDY" | tar -xz -C /usr/local/bin caddy
curl -fsSLo relay-local.js "https://raw.githubusercontent.com/nwcnwc/gifos/__SHA__/test/servers/relay-local.js"
ulimit -n 65536
RELAY_DEV=1 RELAY_HOST=127.0.0.1 RELAY_PORT=8795 nohup node relay-local.js > /var/log/relay.log 2>&1 &
nohup caddy reverse-proxy --from "$HOST" --to 127.0.0.1:8795 > /var/log/caddy.log 2>&1 &
echo "READY wss://$HOST" > /var/log/swarm-ready
