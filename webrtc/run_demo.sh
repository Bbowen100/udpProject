#!/bin/bash

# Kill existing processes if any
pkill -9 -f "python3 -m http.server"
pkill -9 -f turnserver
pkill -9 -f "sfu/mediasoup-server/server.js"
sleep 1

# Start Coturn
echo "Starting Coturn..."
./run_coturn.sh > coturn.log 2>&1 &
COTURN_PID=$!

# Start Mediasoup Server
echo "Starting Mediasoup Server..."
node sfu/mediasoup-server/server.js > server.log 2>&1 &
SERVER_PID=$!

# Start Vite Build & Serve
echo "Building client..."
npm run build
# Vite watch runs in background
npm run watch &
VITE_PID=$!
echo "Vite Watcher (building to /dist on change) started."

echo "Starting Python HTTP Server..."
cd dist && python3 -m http.server 8000 &
PYTHON_PID=$!
cd ..

# Cleanup on exit
cleanup() {
    echo "Cleaning up..."
    kill $COTURN_PID 2>/dev/null
    kill $SERVER_PID 2>/dev/null
    kill $PYTHON_PID 2>/dev/null
    kill $VITE_PID 2>/dev/null
}

# Trap signals
trap cleanup EXIT INT TERM

# Wait for python server
wait $PYTHON_PID