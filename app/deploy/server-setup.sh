#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (Oracle Cloud Always Free, ARM): opens ports 80 and 443 in the
# server's own firewall, installs Docker, rclone and automatic security updates, adds swap on small machines.
#   sudo bash deploy/server-setup.sh
# Ports 80 and 443 must also be open in Oracle's VCN Security List (see DEPLOY.md): both layers are needed.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }
user="${SUDO_USER:-ubuntu}"

apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl git rclone unattended-upgrades iptables-persistent

# Oracle's Ubuntu image rejects everything but SSH in iptables. Done before Docker, which adds its own chains:
# saving after Docker would also save those and break them on the next boot.
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
  # shellcheck disable=SC2086
  iptables -C INPUT $rule -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 $rule -m conntrack --ctstate NEW -j ACCEPT
done
netfilter-persistent save

# Docker from Docker's own apt repository
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$user"

# The Maven and Angular builds need room: 2 GB of swap when the machine has less than 8 GB
if [ ! -f /swapfile ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 8000000 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done. Log out and back in (so $user can use docker), then follow DEPLOY.md from 'First deploy'."
