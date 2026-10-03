#!/bin/bash
# meet-swarm.sh — a 1,000-bot GifOS meeting on disposable EC2 boxes, for minutes.
#
#   meet-swarm.sh relay            relay box: relay-local.js behind Caddy, wss://<ip>.sslip.io
#                                  (SITE=1: it also serves site/ at GIFOS_REF — an unreleased branch at scale)
#   meet-swarm.sh bots <boxes>     bot boxes, SHARDS x PER_SHARD bots each, all on https://gifos.app
#   meet-swarm.sh world            one bot box in EVERY enabled region (MARKET=spot: the Spot bucket)
#   meet-swarm.sh status           per-box load + seated census, summed (home region)
#   meet-swarm.sh down             terminate everything tagged, drop the ssh rule, verify zero
#
# Everyone — bots and people — loads the REAL https://gifos.app and reaches the
# swarm relay through the relay override (Settings → Relay, i.e. localStorage
# gifos_relay). Neither the production relay nor relay-local.js caps sockets per
# address (removed 3 Oct 2026), so a box can hold a hundred bots.
# Every box schedules its own shutdown at boot (TTL_MIN) with terminate-on-
# shutdown, so a lost orchestrator cannot leak instances.
set -u
cd "$(dirname "$0")"
REGION=${REGION:-us-east-1} HOME_REGION=us-east-1 KEY=gifos-swarm TAG=gifos-meet-swarm
HOME_SG=sg-0f845e47945730dad
PEM=$HOME/.ssh/gifos-swarm.pem OUT=/tmp/meet-swarm
mkdir -p $OUT
SHA=${GIFOS_REF:-945efd59320c61c701ea2148f24f4b0dbbe07529}
TTL_MIN=${TTL_MIN:-25}
# The relay must outlive every bot box launched after it: when it dies first,
# the whole room goes with it and the run reads as a mesh collapse.
RELAY_TTL_MIN=${RELAY_TTL_MIN:-90}
BOT_TYPE=${BOT_TYPE:-c7i.8xlarge} RELAY_TYPE=${RELAY_TYPE:-c7i.xlarge}
SHARDS=${SHARDS:-4} PER_SHARD=${PER_SHARD:-20} RAMP=${RAMP:-400} VIDEOS=${VIDEOS:-1}
PASS=${PASS:-stadium} EXTRA=${EXTRA:-}
PW=1.61.1
# JUMP=<host>: reach the boxes through a jump host, for networks that block
# outbound port 22 (airport and hotel wifi do); the key stays here.
SSH="ssh -i $PEM ${JUMP:+-J $JUMP} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$OUT/known_hosts -o LogLevel=ERROR -o ConnectTimeout=8 -o BatchMode=yes"
[ -f $OUT/room ] || echo "swarm-$(date +%m%d-%H%M)" > $OUT/room
ROOM=$(cat $OUT/room)
MYIP=$(curl -s https://checkip.amazonaws.com)

# EC2's vCPU cap is PER REGION (and Spot is a separate bucket), so `world` puts
# a box in every enabled region. Outside the home region a box takes the default
# VPC's default security group and opens NOTHING inbound: security groups are
# stateful, so each peer's outbound ICE checks open the return path (the same
# hole-punch WebRTC does through a home router). No ssh there, so read those
# boxes through the home-region bots' census.
sg() { [ $REGION = $HOME_REGION ] && { echo $HOME_SG; return; }
  aws ec2 describe-security-groups --region $REGION --filters Name=group-name,Values=default \
    --query 'SecurityGroups[0].GroupId' --output text; }
regions() { aws ec2 describe-regions --query 'Regions[].RegionName' --output text; }
ami() { aws ec2 describe-images --region $REGION --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" Name=state,Values=available \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text; }
ips() { aws ec2 describe-instances --region $REGION \
  --filters Name=tag:$TAG,Values=$1 Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text; }
launch() { # role type count userdata-file
  aws ec2 run-instances --region $REGION --image-id "$(ami)" --count $3 --instance-type $2 \
    $([ $REGION = $HOME_REGION ] && echo --key-name $KEY) --security-group-ids $(sg) \
    --instance-initiated-shutdown-behavior terminate ${MARKET:+--instance-market-options MarketType=$MARKET} \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=16,VolumeType=gp3}' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=$TAG,Value=$1},{Key=Name,Value=$TAG-$1}]" \
    --user-data "file://$4" --query 'Instances[].InstanceId' --output text; }

case "${1:-}" in
relay)
  aws ec2 authorize-security-group-ingress --region $REGION --group-id $HOME_SG \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MYIP/32,Description=$TAG}]" >/dev/null 2>&1
  sed -e "s|__TTL_MIN__|$RELAY_TTL_MIN|g" -e "s|__SHA__|$SHA|g" -e "s|__SITE__|${SITE:-0}|g" relay-userdata.sh > $OUT/relay-ud.sh
  launch relay $RELAY_TYPE 1 $OUT/relay-ud.sh || exit 1
  for i in $(seq 1 40); do IP=$(ips relay); [ -n "$IP" ] && break; sleep 3; done
  HOST="${IP//./-}.sslip.io"; echo "relay $IP — waiting for wss://$HOST"
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "https://$HOST/")
    if [ "${SITE:-0}" = 1 ]; then code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "https://$HOST/run.html"); [ "$code" = 200 ] || { sleep 5; continue; }
      echo "https://$HOST" > $OUT/site; fi
    [ "$code" != 000 ] && { echo "wss://$HOST" > $OUT/relay; echo "RELAY UP wss://$HOST (https $code)${SITE:+ — site https://$HOST/run.html}"; exit 0; }
    sleep 5
  done
  echo "relay never answered on https — ssh ubuntu@$IP, see /var/log/swarm-boot.log caddy.log" >&2; exit 1 ;;
bots)
  BOXES=${2:?boxes}; RELAY=$(cat $OUT/relay) || exit 1
  SITEBASE=$(cat $OUT/site 2>/dev/null)   # set by \`SITE=1 meet-swarm.sh relay\`: the bots load THAT build
  NEXT=${BOX_BASE:-$(cat $OUT/next 2>/dev/null || echo 0)}
  VF=$( [ "$VIDEOS" = 1 ] && tr '\n' ' ' < video-files.txt )
  # BOT_TYPES is a fallback list (not every region sells every family); a
  # 4xlarge takes half the shards of an 8xlarge so bots stay one per core.
  for T in ${BOT_TYPES:-$BOT_TYPE}; do
    case $T in *.8xlarge) SH=$SHARDS;; *.4xlarge) SH=$(( (SHARDS+1)/2 ));; *) SH=1;; esac
    UD=$OUT/bot-ud-$REGION-${MARKET:-od}.sh
    sed -e "s|__TTL_MIN__|$TTL_MIN|g" -e "s|__SHA__|$SHA|g" -e "s|__PW__|$PW|g" -e "s|__VIDEOS__|$VIDEOS|g" \
        -e "s|__VIDEO_FILES__|$VF|g" -e "s|__BOX_BASE__|$NEXT|g" -e "s|__SHARDS__|$SH|g" \
        -e "s|__PER_SHARD__|$PER_SHARD|g" -e "s|__ROOM__|$ROOM|g" -e "s|__RELAY__|$RELAY|g" \
        -e "s|__RAMP__|$RAMP|g" -e "s|__EXTRA__|--pass $PASS ${SITEBASE:+--base $SITEBASE} $EXTRA|g" bot-userdata.sh > $UD
    if out=$(launch bots $T $BOXES $UD 2>&1); then
      echo "$REGION ${MARKET:-on-demand}: $BOXES x $T, bots $NEXT…$((NEXT + BOXES*SH*PER_SHARD - 1))"
      echo $REGION >> $OUT/regions
      [ -z "${BOX_BASE:-}" ] && echo $((NEXT + BOXES*SH*PER_SHARD)) > $OUT/next
      exit 0
    fi
    echo "$REGION ${MARKET:-on-demand}: $T refused ($(echo "$out" | grep -oE 'error occurred \([A-Za-z.]+\)' | head -1 | tr -d '()' | cut -d' ' -f3))"
  done; exit 1 ;;
world)
  # One box per enabled region, in parallel; offsets are handed out up front so
  # every bot keeps a unique index.
  NEXT=$(cat $OUT/next 2>/dev/null || echo 0); PER_BOX=$((SHARDS*PER_SHARD))
  for r in ${REGIONS:-$(regions)}; do
    ( export REGION=$r BOX_BASE=$NEXT; "$0" bots 1 ) &
    NEXT=$((NEXT + PER_BOX))
  done; wait; echo $NEXT > $OUT/next ;;
status)
  echo "room $ROOM  password $PASS  relay $(cat $OUT/relay 2>/dev/null)"
  for ip in $(REGION=$HOME_REGION ips bots); do
    ( r=$($SSH ubuntu@$ip 'l=$(cut -d" " -f1 /proc/loadavg); n=$(nproc); m=$(free -g | awk "/Mem:/{print \$3\"/\"\$2}")
        rdy=$(test -f /var/log/swarm-ready && echo R || echo -)
        c=$(for f in /var/log/shard-*.log; do grep -h "up=" $f 2>/dev/null | tail -1 | grep -oE "up=[0-9]+"; done | cut -d= -f2 | awk "{s+=\$1} END{print s+0}")
        e=$(cat /var/log/shard-*.log 2>/dev/null | grep -cE "PREFLIGHT FAILED|RENDERER CRASHED")
        echo "$rdy load=$l/$n mem=${m}G up=${c:-0} err=${e:-0}"' 2>/dev/null || echo "unreachable")
      echo "$ip $r" ) &
  done | sort -k1,1V | tee $OUT/status.txt; wait
  echo "TOTAL up=$(grep -oE 'up=[0-9]+' $OUT/status.txt | cut -d= -f2 | awk '{s+=$1} END{print s+0}')" ;;
down)
  for r in $(regions); do (
    ids=$(aws ec2 describe-instances --region $r \
      --filters Name=tag-key,Values=$TAG Name=instance-state-name,Values=pending,running,stopping,stopped \
      --query 'Reservations[].Instances[].InstanceId' --output text)
    [ -n "$ids" ] && aws ec2 terminate-instances --region $r --instance-ids $ids --output text >/dev/null \
      && echo "$r: terminated $(echo $ids | wc -w)"
  ) & done; wait
  aws ec2 revoke-security-group-ingress --region $HOME_REGION --group-id $HOME_SG \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MYIP/32}]" >/dev/null 2>&1
  sleep 5
  left=0; for r in $(regions); do n=$(aws ec2 describe-instances --region $r \
    --filters Name=tag-key,Values=$TAG Name=instance-state-name,Values=pending,running \
    --query 'length(Reservations[].Instances[])' --output text); left=$((left + n)); done
  echo "still pending/running across all regions: $left"
  rm -f $OUT/room $OUT/relay $OUT/site $OUT/next $OUT/regions ;;
*) sed -n 2,9p "$0"; exit 1 ;;
esac
