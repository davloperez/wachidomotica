#!/bin/bash

# Script to upload all persiana-*.yaml configurations to ESP32 devices via OTA
# This script will attempt to upload each persiana configuration file
# and continue with the next one if an upload fails

set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
total=0
success=0
failed=0

# Array to store failed files
failed_files=()

echo "=========================================="
echo "ESPHome Upload All Persiana Configs (OTA)"
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
echo -e "Found ${YELLOW}$total${NC} persiana configuration file(s) to upload"
echo ""

# Upload each file
while IFS= read -r file; do
    filename=$(basename "$file")
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Uploading $filename...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if esphome upload "$file" --device OTA; then
        echo -e "${GREEN}✓ Successfully uploaded $filename${NC}"
        ((success++))
    else
        echo -e "${RED}✗ Failed to upload $filename${NC}"
        ((failed++))
        failed_files+=("$filename")
    fi
    
    echo ""
done <<< "$persiana_files"

# Print summary
echo "=========================================="
echo "Upload Summary"
echo "=========================================="
echo "Total files: $total"
echo -e "Successful: ${GREEN}$success${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo ""

if [ $failed -gt 0 ]; then
    echo -e "${RED}Failed to upload the following files:${NC}"
    for file in "${failed_files[@]}"; do
        echo "  - $file"
    done
    echo ""
    exit 1
else
    echo -e "${GREEN}All files uploaded successfully!${NC}"
    exit 0
fi
