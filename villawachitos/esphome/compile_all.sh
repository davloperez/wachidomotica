#!/bin/bash

# Script to compile all persiana-*.yaml files
# This script will attempt to compile each persiana configuration file
# and continue with the next one if a compilation fails

set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
total=0
success=0
failed=0

# Array to store failed files
failed_files=()

echo "=========================================="
echo "ESPHome Compile All Persiana Configs"
echo "=========================================="
echo ""

# Find all YAML files tagged with @esphome-device
persiana_files=$(grep -l '@esphome-device' ./*.yaml 2>/dev/null | sort)

if [ -z "$persiana_files" ]; then
    echo -e "${YELLOW}No persiana-*.yaml files found${NC}"
    exit 1
fi

# Count total files
total=$(echo "$persiana_files" | wc -l)
echo -e "Found ${YELLOW}$total${NC} persiana configuration file(s) to compile"
echo ""

# Compile each file
while IFS= read -r file; do
    filename=$(basename "$file")
    echo -e "${YELLOW}Compiling $filename...${NC}"
    
    if esphome compile "$file"; then
        echo -e "${GREEN}✓ Successfully compiled $filename${NC}"
        ((success++))
    else
        echo -e "${RED}✗ Failed to compile $filename${NC}"
        ((failed++))
        failed_files+=("$filename")
    fi
    
    echo ""
done <<< "$persiana_files"

# Print summary
echo "=========================================="
echo "Compilation Summary"
echo "=========================================="
echo "Total files: $total"
echo -e "Successful: ${GREEN}$success${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo ""

if [ $failed -gt 0 ]; then
    echo -e "${RED}Failed to compile the following files:${NC}"
    for file in "${failed_files[@]}"; do
        echo "  - $file"
    done
    echo ""
    exit 1
else
    echo -e "${GREEN}All files compiled successfully!${NC}"
    exit 0
fi
