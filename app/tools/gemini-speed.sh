#!/usr/bin/env bash
# Times a small request to every text model that has free quota on your Gemini key, then prints a table.
#
# Run (Git Bash, from the app folder):   bash tools/gemini-speed.sh
# The key is read from GEMINI_API_KEY, or typed when asked (hidden). It is never written to a file.
# Options (environment variables):  ROUNDS=2 calls per model, PAUSE=4 seconds between calls, TIMEOUT=70 seconds per call.
set -u

if [ -z "${GEMINI_API_KEY:-}" ]; then
  read -r -s -p "Gemini API key (hidden): " GEMINI_API_KEY
  echo
fi
[ -z "$GEMINI_API_KEY" ] && { echo "No key given."; exit 1; }

BASE="https://generativelanguage.googleapis.com/v1beta"
ROUNDS="${ROUNDS:-2}"
PAUSE="${PAUSE:-4}"
TIMEOUT="${TIMEOUT:-70}"

# Text models with free quota on the key (from the rate-limit table). The first match in the key's model list is used.
WANTED=(
  gemini-3.5-flash-lite
  gemini-3.1-flash-lite
  gemini-3.8-flash
  gemini-3.6-flash
  gemini-3-flash
  gemini-2.5-flash-lite
  gemini-2.5-flash
  gemma-4-26b
  gemma-4-31b
)

# One small, realistic request: about the size of a message draft, plain text so every model accepts it.
BODY='{"contents":[{"parts":[{"text":"Write a two-sentence polite WhatsApp greeting in French to a dental clinic that has no website. Reply with the message only."}]}],"generationConfig":{"maxOutputTokens":200,"temperature":0.7}}'

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "Asking which models this key can see..."
LIST="$(curl -4 -s -m 30 "$BASE/models?pageSize=1000" -H "X-goog-api-key: $GEMINI_API_KEY" | grep -o '"name": *"models/[^"]*"' | sed 's/.*models\///; s/"$//')"
if [ -z "$LIST" ]; then
  echo "Could not read the model list (wrong key, no network, or the service is down). Trying the default names anyway."
fi

resolve() {
  local want="$1"
  if printf '%s\n' "$LIST" | grep -qx "$want"; then echo "$want"; return; fi
  local first
  first="$(printf '%s\n' "$LIST" | grep -m1 "^$want")"
  [ -n "$first" ] && echo "$first" || { [ -z "$LIST" ] && echo "$want"; }
}

printf '\n%-34s %-6s %-9s %s\n' "MODEL" "HTTP" "SECONDS" "ANSWER OR ERROR"
printf '%s\n' "------------------------------------------------------------------------------------------------"

RESULTS="$(mktemp)"
trap 'rm -f "$tmp" "$RESULTS"' EXIT

for want in "${WANTED[@]}"; do
  id="$(resolve "$want")"
  if [ -z "$id" ]; then
    printf '%-34s %-6s %-9s %s\n' "$want" "-" "-" "not available to this key"
    continue
  fi
  for ((r = 1; r <= ROUNDS; r++)); do
    stats="$(curl -4 -s -m "$TIMEOUT" -o "$tmp" -w '%{http_code} %{time_total}' -X POST \
      "$BASE/models/$id:generateContent" -H "Content-Type: application/json" -H "X-goog-api-key: $GEMINI_API_KEY" -d "$BODY")"
    code="${stats%% *}"
    secs="${stats##* }"
    if [ "$code" = "200" ]; then
      note="$(grep -m1 -o '"text": *"[^"]*' "$tmp" | sed 's/"text": *"//' | cut -c1-60)"
      echo "$id|$secs" >> "$RESULTS"
    elif [ "$code" = "000" ]; then
      note="no answer within ${TIMEOUT}s"
    else
      note="$(grep -m1 '"message"' "$tmp" | sed 's/.*"message": *"//; s/",\?$//' | cut -c1-70)"
    fi
    printf '%-34s %-6s %-9s %s\n' "$id (#$r)" "$code" "$secs" "$note"
    sleep "$PAUSE"
  done
done

echo
echo "Average time of the successful calls (fastest first):"
if [ -s "$RESULTS" ]; then
  awk -F'|' '{ s[$1] += $2; n[$1]++ } END { for (m in s) printf "%8.2f s   %-34s (%d ok)\n", s[m]/n[m], m, n[m] }' "$RESULTS" | sort -n
else
  echo "  none succeeded"
fi
echo
echo "HTTP 200 = answered. 429 = too many requests (rate limit). 503 = the model is overloaded. 000 = no answer in time."
