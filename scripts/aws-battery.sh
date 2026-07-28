#!/bin/bash
# aws-battery.sh — the FULL behavior battery in <1h on N disposable AWS boxes.
#
#   scripts/aws-battery.sh launch      # spin up N boxes (tag gifos-battery=true), wait READY
#   scripts/aws-battery.sh run         # shard all scenarios round-robin, run behavior.sh on each box
#   scripts/aws-battery.sh collect     # tallies + failing logs/forensics → /tmp/aws-battery/
#   scripts/aws-battery.sh teardown    # terminate EVERYTHING with the tag; verify zero remain
#   scripts/aws-battery.sh status      # what's running right now (and what it costs)
#
# Each box is a self-contained universe: repo clone + local site:8099 +
# relay-local:8790 + LOCAL actors (no ~/.gifos-behavior-hosts.json ⇒ cast.js
# defaults to local), so runs can't interfere with each other or with the home
# fleet. The [relay-dev] scenarios (04b/16b) SKIP here — no CF auth ships to
# disposable boxes, by design — and are covered by a home run.
#
# WATCHOUT: leaked instances are the only real cost risk. teardown is tag-based
# and verifies; `status` is the audit. Boxes also self-terminate after
# MAX_LIFE_MIN as a dead-man's switch (shutdown -h scheduled at boot,
# terminate-on-shutdown), so an orchestrator crash cannot leak them overnight.
set -u
REGION=us-east-1
N=${N:-4}
TYPE=${TYPE:-c7i.2xlarge}
KEY=gifos-swarm
SG=sg-0f845e47945730dad
TAG=gifos-battery
PEM=$HOME/.ssh/gifos-swarm.pem
MAX_LIFE_MIN=${MAX_LIFE_MIN:-110}
OUT=/tmp/aws-battery
mkdir -p "$OUT"
SSH="ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes"

ips() { aws ec2 describe-instances --region $REGION \
  --filters Name=tag:$TAG,Values=true Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text; }

case "${1:-cycle}" in

launch)
  # Canonical's owner id + name filter — NOT the SSM parameter: the
  # gifos-swarm IAM user has ec2:* but no ssm:GetParameter (learned live).
  AMI=$(aws ec2 describe-images --region $REGION --owners 099720109477 \
    --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" "Name=state,Values=available" \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
  [ -n "$AMI" ] && [ "$AMI" != "None" ] || { echo "AMI resolution failed" >&2; exit 1; }
  echo "AMI $AMI, $N x $TYPE, dead-man ${MAX_LIFE_MIN}min"
  cat > "$OUT/userdata.sh" <<EOF
#!/bin/bash
shutdown -h +${MAX_LIFE_MIN}
apt-get update
apt-get install -y git python3
# Ubuntu 24.04 clamps unprivileged user namespaces via AppArmor — chromium's
# sandbox then dies INTERMITTENTLY (~7% of actor spawns in cycle 1: four
# "actor not running" reds that looked like app bugs). Standard fix:
sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
echo 'kernel.apparmor_restrict_unprivileged_userns=0' > /etc/sysctl.d/60-chromium-userns.conf
# node via TARBALL, not apt: the NodeSource setup failed silently on cycle 1
# and Ubuntu's own nodejs package ships WITHOUT npm — every actor then died
# at spawn ("playwright not found") in the classic dead-environment shape.
curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
sudo -u ubuntu bash -c 'cd /home/ubuntu && git clone --depth 1 https://github.com/nwcnwc/gifos && cd gifos && npm install playwright && npx playwright install chromium' > /tmp/bootstrap.log 2>&1
cd /home/ubuntu/gifos && npx playwright install-deps chromium >> /tmp/bootstrap.log 2>&1
sudo -u ubuntu bash -c 'cd /home/ubuntu/gifos && node -e "require(\"playwright\")"' >> /tmp/bootstrap.log 2>&1 || exit 1
touch /home/ubuntu/READY
EOF
  aws ec2 run-instances --region $REGION --image-id "$AMI" --count $N \
    --instance-type $TYPE --key-name $KEY --security-group-ids $SG \
    --instance-initiated-shutdown-behavior terminate \
    --tag-specifications "ResourceType=instance,Tags=[{Key=$TAG,Value=true}]" \
    --user-data "file://$OUT/userdata.sh" \
    --query 'Instances[].InstanceId' --output text | tee "$OUT/ids.txt"
  echo "waiting for READY on all $N…"
  for i in $(seq 1 60); do
    sleep 20
    LIST=$(ips); ready=0; total=0
    for ip in $LIST; do
      total=$((total+1))
      $SSH ubuntu@$ip 'test -f /home/ubuntu/READY' 2>/dev/null && ready=$((ready+1))
    done
    echo "  $ready/$N ready ($total up)"
    [ "$ready" = "$N" ] && { echo "$LIST" | tr '\t' '\n' > "$OUT/ips.txt"; echo "ALL READY"; exit 0; }
  done
  echo "TIMEOUT waiting for READY — check $OUT/ids.txt manually" >&2; exit 1
  ;;

run)
  mapfile -t IPS < "$OUT/ips.txt"
  cd "$(dirname "$0")/.."
  SCN=$(ls test/behavior/scenarios/*.js | xargs -n1 basename | sed 's/\.js$//')
  rm -f "$OUT"/shard-*.txt # a re-run must not APPEND onto the old shards (cycle-1 lesson: doubled lists)
  i=0
  for name in $SCN; do
    echo "$name" >> "$OUT/shard-$((i % ${#IPS[@]})).txt"; i=$((i+1))
  done
  for s in $(seq 0 $(( ${#IPS[@]} - 1 ))); do
    ip=${IPS[$s]}
    shard=$(tr '\n' ' ' < "$OUT/shard-$s.txt")
    echo "shard $s → $ip: $shard"
    $SSH ubuntu@$ip "cd gifos && git pull --ff-only >/dev/null 2>&1; setsid nohup test/batteries/behavior.sh $shard > /tmp/shard.log 2>&1 < /dev/null & echo launched"
  done
  echo "all shards launched — poll with: scripts/aws-battery.sh collect"
  ;;

collect)
  mapfile -t IPS < "$OUT/ips.txt"
  done_all=1
  for s in $(seq 0 $(( ${#IPS[@]} - 1 ))); do
    ip=${IPS[$s]}
    $SSH ubuntu@$ip 'cat /tmp/shard.log 2>/dev/null' > "$OUT/shard-$s.out" 2>/dev/null
    if grep -q "BEHAVIOR BATTERY:" "$OUT/shard-$s.out"; then
      echo "== shard $s ($ip): $(grep 'BEHAVIOR BATTERY:' "$OUT/shard-$s.out")"
    else
      echo "== shard $s ($ip): still running — $(grep -cE '^(PASS|FAIL|SKIP)' "$OUT/shard-$s.out")/$(wc -l < "$OUT/shard-$s.txt") done"
      done_all=0
    fi
    grep -E "^(FAIL|SKIP)" "$OUT/shard-$s.out" | sed 's/^/   /'
    # failing forensics home for triage
    for f in $(grep "^FAIL" "$OUT/shard-$s.out" | awk '{print $2}'); do
      [ -f "$OUT/$f.log" ] || $SSH ubuntu@$ip "cat /tmp/behavior-battery/$f.log 2>/dev/null" > "$OUT/$f.log" 2>/dev/null
      [ -s "$OUT/fx-$f.tgz" ] || $SSH ubuntu@$ip "tar czf - /tmp/behavior/$f-* 2>/dev/null" > "$OUT/fx-$f.tgz" 2>/dev/null
    done
  done
  [ "$done_all" = 1 ] && { cat "$OUT"/shard-*.out | grep -E "^(PASS|FAIL|SKIP)" | sort > "$OUT/ALL.txt"
    echo; echo "MERGED: $(grep -c ^PASS "$OUT/ALL.txt") PASS, $(grep -c ^FAIL "$OUT/ALL.txt") FAIL, $(grep -c ^SKIP "$OUT/ALL.txt") SKIP → $OUT/ALL.txt"; }
  ;;

teardown)
  ids=$(aws ec2 describe-instances --region $REGION \
    --filters Name=tag:$TAG,Values=true Name=instance-state-name,Values=running,pending,stopped \
    --query 'Reservations[].Instances[].InstanceId' --output text)
  [ -n "$ids" ] && aws ec2 terminate-instances --region $REGION --instance-ids $ids --query 'TerminatingInstances[].InstanceId' --output text
  sleep 5
  left=$(aws ec2 describe-instances --region $REGION \
    --filters Name=tag:$TAG,Values=true Name=instance-state-name,Values=running,pending \
    --query 'Reservations[].Instances[].InstanceId' --output text | wc -w)
  echo "remaining tagged instances: $left"
  rm -f "$OUT"/shard-*.txt
  ;;

status)
  aws ec2 describe-instances --region $REGION \
    --filters Name=tag:$TAG,Values=true Name=instance-state-name,Values=running,pending \
    --query 'Reservations[].Instances[].{id:InstanceId,ip:PublicIpAddress,up:LaunchTime}' --output table
  ;;
esac
