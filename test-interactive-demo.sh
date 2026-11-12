#!/bin/bash
# Test script to demonstrate interactive demo
# This simulates entering a Node ID and then exiting

echo "=== Testing Interactive Demo ==="
echo ""
echo "This will:"
echo "1. Run the quality analysis"
echo "2. Automatically enter 'node_1' as Node ID"
echo "3. Show test coverage analysis"
echo "4. Exit"
echo ""
echo "Press Enter to continue..."
read

# Simulate entering node_1 and then exiting
echo -e "node_1\n" | npm run demo
