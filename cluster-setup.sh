#!/usr/bin/env bash
set -e

echo "Setting up cluster environment..."

if [ -z "$SKIP_SYSCTL" ]; then
    echo "Attempting system settings..."
    sysctl vm.overcommit_memory=1 2>/dev/null || true
else
    echo "Skipping system settings (handled by Docker)"
fi

echo "Cleaning up data directories..."
rm -rf /data/*

# Initialize nodes
init_nodes() {
    for port in $(seq 7001 7003); do
        mkdir -p /data/${port}
        cat > /data/${port}/valkey.conf <<EOF
port ${port}
cluster-enabled yes
cluster-config-file /data/${port}/nodes.conf
cluster-node-timeout 30000
appendonly yes
dir /data/${port}
bind 0.0.0.0
protected-mode no
cluster-announce-ip 127.0.0.1
daemonize yes
EOF
        valkey-server /data/${port}/valkey.conf
        
        until valkey-cli -p ${port} ping 2>/dev/null; do
            echo "Waiting for node ${port} to start..."
            sleep 1
        done
    done
}

echo "Initializing nodes..."
init_nodes

echo "Waiting for nodes to stabilize..."
sleep 5

echo "Initializing cluster..."
yes "yes" | valkey-cli --cluster create \
    127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 \
    --cluster-replicas 0

# Wait for cluster to stabilize
echo "Waiting for cluster to stabilize..."
for i in {1..30}; do
    if valkey-cli -p 7001 cluster info | grep -q "cluster_state:ok"; then
        echo "Cluster is stable"
        break
    fi
    echo "Waiting for cluster to stabilize (attempt $i)..."
    sleep 2
done

echo "Cluster initialization complete"

# Keep container running and monitor cluster
while true; do
    echo "Cluster Status at $(date):"
    valkey-cli -p 7001 cluster info || echo "Failed to get cluster info"
    sleep 60
done
