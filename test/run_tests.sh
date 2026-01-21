#!/bin/bash
# Simple test runner script

echo "Running agent system tests..."
echo "================================"

# Check if pytest is installed
if ! python3 -m pytest --version > /dev/null 2>&1; then
    echo "Error: pytest is not installed"
    echo "Install it with: pip install pytest"
    exit 1
fi

# Run tests
python3 -m pytest -v --tb=short

echo ""
echo "================================"
echo "Tests completed!"
