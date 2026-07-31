#!/bin/bash
# Generate per-section narration, sync durations for Manim, and concatenate audio.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
AUD="$DIR/audio"
mkdir -p "$AUD"

ENV_FILE="/Users/cliffordtraff/.claude/.xai-tts.env"
XAI_API_KEY=$(grep '^XAI_API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
VOICE_ID="rex"
TEMPO="1.08"
GAP="0.6"

ids=(s1 s2 s3 s4 s5 s6)

texts_s1="Here is the entire workflow in one sentence. Fin Quote turns the morning's market research into a finished newsletter issue, and one click creates an editable draft inside Beehiiv. It does not publish the issue. It does not choose an audience. It moves the prepared content into the place where you perform the final review and send. In this lesson, we will follow the information from raw market data to that Beehiiv draft."

texts_s2="The work starts before you click anything. Fin Quote runs the daily market collection, including the Finviz scraper and the Why It Is Moving pipeline. The system ranks the most meaningful moves, gathers the relevant catalyst evidence, and generates original summaries. It then assembles newsletter candidates with a subject line, introduction, key statistics, narrative, and chart. The Morning Review page is the control room. It shows which issues are ready, which need review, and which newsletter you want to deliver. The result is structured content, not a loose pile of copied headlines."

texts_s3="Open a completed issue and save any final edits. The delivery control checks whether your Beehiiv account is connected. On the first click, Send to Beehiiv creates a new draft and stores the relationship between the Fin Quote issue and the Beehiiv post. On later clicks, the same control becomes Sync to Beehiiv. It updates that existing post instead of making duplicates. Fin Quote also calculates a fingerprint of the content. If nothing changed, the click becomes a no-op and simply opens the already current draft."

texts_s4="The connection uses OAuth and Beehiiv's MCP server. OAuth is the permission screen where you authorize Fin Quote to work with your publication. MCP is the bridge that exposes Beehiiv actions such as creating and editing a post. This matters because Beehiiv's conventional REST create-post endpoint is restricted to Enterprise accounts. Your Scale plan can still use the official MCP connection, so Enterprise is not required for this workflow. Fin Quote keeps the granted token encrypted on the server and uses it only when an authenticated owner requests a draft operation."

texts_s5="Several guardrails make the button predictable. A saved delivery record remembers the Beehiiv post identifier, editor link, publication, sync time, and content fingerprint. That record is why later edits update the same post. The fingerprint prevents unnecessary writes. The chart is placed at a public image URL so Beehiiv can render it inside the email. Most importantly, the integration only creates or edits drafts. Publishing, scheduling, choosing an audience, and sending remain explicit actions inside Beehiiv. One click removes transfer work without removing your final editorial control."

texts_s6="Your daily routine is now five steps. First, open Morning Review after the automated run finishes. Second, inspect the ranked issues, summaries, and charts. Third, open the issue you want and make any final edits. Fourth, click Send to Beehiiv, or Sync to Beehiiv after a revision. Fifth, review the email in Beehiiv, choose the audience and schedule, then publish there. The simple mental model is: Fin Quote prepares and transfers; Beehiiv reviews and delivers."

echo "{" > "$DIR/durations.json"
first=1
: > "$AUD/concat.txt"

for id in "${ids[@]}"; do
  var="texts_$id"
  text="${!var}"
  raw="$AUD/${id}_raw.mp3"
  final="$AUD/${id}.mp3"

  echo "Generating $id ..."
  payload=$(jq -n --arg text "$text" --arg voice "$VOICE_ID" \
    '{text:$text, voice_id:$voice, language:"en"}')
  curl -fsS -X POST "https://api.x.ai/v1/tts" \
    -H "Authorization: Bearer ${XAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --output "$raw"

  ffmpeg -y -loglevel error -i "$raw" \
    -af "atempo=${TEMPO},apad=pad_dur=${GAP}" "$final"

  duration=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$final")
  echo "  $id -> ${duration}s"

  if [ "$first" -eq 0 ]; then
    echo "," >> "$DIR/durations.json"
  fi
  printf '  "%s": %s' "$id" "$duration" >> "$DIR/durations.json"
  first=0

  echo "file '$AUD/${id}.mp3'" >> "$AUD/concat.txt"
done

echo "" >> "$DIR/durations.json"
echo "}" >> "$DIR/durations.json"

ffmpeg -y -loglevel error -f concat -safe 0 \
  -i "$AUD/concat.txt" -c:a libmp3lame -q:a 2 "$AUD/narration.mp3"

echo "Wrote durations.json and audio/narration.mp3"
cat "$DIR/durations.json"
