#!/bin/bash
# Compila o sube por OTA todos los YAML marcados con "# @esphome-device".
# Uso: ./run_all.sh compile | upload
# Sigue con el siguiente dispositivo si uno falla y al final lista los fallidos.

set -o pipefail

case "$1" in
    compile) cmd=(compile) ;;
    upload)  cmd=(upload --device OTA) ;;
    *) echo "Uso: $0 compile|upload"; exit 2 ;;
esac

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

files=$(grep -l '@esphome-device' ./*.yaml 2>/dev/null | sort)
if [ -z "$files" ]; then
    echo -e "${YELLOW}No hay ficheros marcados con @esphome-device${NC}"
    exit 1
fi

total=$(echo "$files" | wc -l)
success=0
failed_files=()
echo -e "esphome $1: ${YELLOW}$total${NC} dispositivo(s)"
echo ""

while IFS= read -r file; do
    name=$(basename "$file")
    echo -e "${YELLOW}━━ $name ━━${NC}"
    if esphome "${cmd[0]}" "$file" "${cmd[@]:1}"; then
        echo -e "${GREEN}✓ $name${NC}"
        ((success++))
    else
        echo -e "${RED}✗ $name${NC}"
        failed_files+=("$name")
    fi
    echo ""
done <<< "$files"

echo "=========================================="
echo -e "Total: $total  OK: ${GREEN}$success${NC}  Fallidos: ${RED}${#failed_files[@]}${NC}"
for f in "${failed_files[@]}"; do echo "  - $f"; done
[ ${#failed_files[@]} -eq 0 ]
