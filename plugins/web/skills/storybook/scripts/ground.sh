#!/usr/bin/env bash
# ground.sh — visual grounding of a single screenshot via `claude -p`.
#
# Reads the prompt section for the given state from templates/grounding.md,
# embeds the absolute image path so Claude Code reads it, parses the result.
# Sentinel "ISSUES: none" → empty issues. Otherwise lines beginning with
# "- [severity: low|medium|high] [confidence: confirmed|possible] <description>"
# are parsed best-effort; an omitted confidence reads as "possible", since a
# dropped tag is a format failure and not evidence the model was certain.
#
# Always exits 0 — errors become an empty issues array with the raw error
# text retained for debugging.
#
# Usage:
#   ground.sh --image PATH --state NAME
set -euo pipefail

IMAGE=""
STATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) IMAGE="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

emit_empty() {
  local reason="$1"
  jq -n --arg state "$STATE" --arg raw "$reason" \
    '{ "state": $state, "issues": [], "raw": $raw }'
  exit 0
}

if [[ -z "$IMAGE" || -z "$STATE" ]]; then
  emit_empty "missing required flags --image and/or --state"
fi

if [[ ! -f "$IMAGE" ]]; then
  emit_empty "image not found: $IMAGE"
fi

# Resolve absolute path.
case "$IMAGE" in
  /*) ABS_IMAGE="$IMAGE" ;;
  *)  ABS_IMAGE="$(cd "$(dirname "$IMAGE")" && pwd)/$(basename "$IMAGE")" ;;
esac

PROMPTS_FILE="$(dirname "$0")/../templates/grounding.md"
if [[ ! -f "$PROMPTS_FILE" ]]; then
  emit_empty "grounding.md not found at $PROMPTS_FILE"
fi

# Extract the section for this state — content between "## $STATE" and the
# next "## " heading (or EOF).
SECTION="$(awk -v want="$STATE" '
  /^## / {
    cur = substr($0, 4)
    sub(/[ \t]+$/, "", cur)
    if (cur == want) { in_section = 1; next }
    if (in_section)  { exit }
  }
  in_section { print }
' "$PROMPTS_FILE")"

if [[ -z "${SECTION// /}" ]]; then
  emit_empty "no grounding prompt section for state: $STATE"
fi

FULL_PROMPT="${SECTION}

Image: ${ABS_IMAGE}"

# Invoke claude -p. Tolerate failure → empty issues + raw error.
if ! RAW="$(claude -p "$FULL_PROMPT" 2>&1)"; then
  jq -n --arg state "$STATE" --arg raw "$RAW" \
    '{ "state": $state, "issues": [], "raw": $raw }'
  exit 0
fi

# Parse sentinel + issue lines.
FIRST_LINE="$(printf '%s\n' "$RAW" | head -n 1 | tr -d '\r')"
ISSUES_JSON='[]'

if [[ "$FIRST_LINE" =~ ^ISSUES:[[:space:]]*found ]]; then
  ISSUES_JSON="$(printf '%s\n' "$RAW" | awk '
    BEGIN { print "[" ; first = 1 }
    /^- \[severity:[[:space:]]*(low|medium|high)\]/ {
      match($0, /^- \[severity:[[:space:]]*([a-z]+)\][[:space:]]*(\[confidence:[[:space:]]*([a-z]+)\][[:space:]]*)?(.*)$/, m)
      sev = m[1]
      conf = (m[3] == "" ? "possible" : m[3])
      desc = m[4]
      gsub(/"/, "\\\"", desc)
      gsub(/\\/, "\\\\", desc)
      if (!first) printf ","
      first = 0
      printf "{\"severity\":\"%s\",\"confidence\":\"%s\",\"description\":\"%s\"}", sev, conf, desc
    }
    END { print "]" }
  ')"
  # awk on macOS lacks gawk match() groups — fall back to a safer jq build if empty.
  if ! printf '%s' "$ISSUES_JSON" | jq empty >/dev/null 2>&1 || [[ "$(printf '%s' "$ISSUES_JSON" | jq 'length')" == "0" ]]; then
    ISSUES_JSON="$(printf '%s\n' "$RAW" | \
      grep -E '^- \[severity: (low|medium|high)\]' | \
      sed -E 's/^- \[severity: (low|medium|high)\] +(\[confidence: ([a-z]+)\] +)?(.*)$/\1\t\3\t\4/' | \
      jq -Rsc 'split("\n") | map(select(length>0) | split("\t")) | map({severity: .[0], confidence: (if .[1] == "" then "possible" else .[1] end), description: .[2]})')"
  fi
fi

jq -n \
  --arg state "$STATE" \
  --argjson issues "${ISSUES_JSON:-[]}" \
  --arg raw "$RAW" \
  '{ "state": $state, "issues": $issues, "raw": $raw }'
