#!/bin/bash

# Load environment variables from .env file
set -a
source .env
set +a

# Start the server directly with Node
exec node dist/backend/server.js
