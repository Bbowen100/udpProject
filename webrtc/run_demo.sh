#!/bin/bash

# Kill existing processes if any
pkill -9 -f turnserver
pkill -9 -f "webrtc/server"
sleep 1

# Start Coturn
echo "Starting Coturn..."
./run_coturn.sh > coturn.log 2>&1 &
COTURN_PID=$!

# Start Signaling Server
echo "Starting Signaling Server..."
./server &
SERVER_PID=$!

# Wait a bit
# sleep 2

# Start HTTP Server
echo "Starting HTTP Server on port 8000..."
python3 -m http.server 8000

# Cleanup on exit
kill $COTURN_PID
kill $SERVER_PID
echo "Cleanup complete."