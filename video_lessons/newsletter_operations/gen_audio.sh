#!/bin/bash
# Generate section narration, record exact timings for Manim, and concatenate audio.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
AUD="$DIR/audio"
mkdir -p "$AUD"

ENV_FILE="/Users/cliffordtraff/.claude/.xai-tts.env"
XAI_API_KEY=$(grep '^XAI_API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
VOICE_ID="rex"
TEMPO="1.08"
GAP="0.7"

ids=(s1 s2 s3 s4 s5 s6 s7 s8)

texts_s1="The newsletter system is no longer just a page that displays a finished report. It is a small publishing operation. Market data comes in, evidence is ranked, original analysis is written, issues are assembled, drafts move to Beehiiv, and every step needs to be observable and recoverable. The new Newsletter Operations page is the control room for that entire chain. This video explains what happens automatically, what the buttons actually do, and where you still make the final editorial decision."

texts_s2="Start with the morning run. The automation first creates a durable record for today's market date. It collects the available market sources, including the Finviz and Why It Is Moving inputs, then ranks the strongest stories. Next it generates original summaries, assembles newsletter issues and charts, performs quality checks, and marks the run ready. Each stage writes its status, counts, timestamps, and errors to storage. That durable record is important. The report is not one fragile request. It is a sequence of restartable stages with an audit trail."

texts_s3="The mid-morning run is a second product, not a duplicate of the first. It starts from the morning snapshot and asks what changed after the opening bell. Which moves accelerated or reversed? Which catalysts were confirmed? Which stories became more important, and which no longer deserve attention? It collects the newer session data, produces update summaries, and builds a current trading-day brief. The result preserves the morning context while clearly separating new information from what was already known before the open."

texts_s4="The Operations page turns all of that hidden state into one readable surface. The top row answers four immediate questions: did the morning run finish, did the mid-morning run finish, is Beehiiv connected, and are there alerts? Below that, each pipeline shows its current stage, progress, item counts, run time, heartbeat, invocation count, and the last meaningful error. Provider health shows whether collection and summary services are working. Issue attention lists content that needs review. Recent runs make it possible to see whether a problem is isolated or recurring."

texts_s5="There are two operator controls. Run now starts or advances today's pipeline immediately, using the same durable logic as the scheduler. Retry failed stage is more precise. Suppose collection, ranking, and drafting finished, but summary generation failed. The retry remembers that failure stage and resumes there. It does not throw away completed work and restart from collection. A short lease prevents two workers from owning the same step at once, and saved identifiers make repeated calls idempotent. In plain English: one click advances the work, without multiplying the work."

texts_s6="When an issue is ready, the Beehiiv layer handles delivery state. The first transfer creates an editable Beehiiv draft and stores the post identifier, editor link, publication, sync time, and a fingerprint of the content. If you revise the issue, Sync to Beehiiv updates that same post. If nothing changed, the fingerprint turns the request into a no-op and opens the current draft instead of writing again. The operations page shows connection health, recent deliveries, lifecycle counts, stale records, and reconciliation errors."

texts_s7="The system has deliberate boundaries. Reading the operations snapshot and pressing operator controls require a signed-in owner. An unauthenticated request receives a four-oh-one response, and a signed-in non-owner is rejected when an owner identifier is configured. Secrets stay on the server. Pipeline controls never expose raw credentials to the browser. Most importantly, the Beehiiv integration creates and edits drafts. It does not silently choose an audience, schedule a campaign, or publish. The final send remains an explicit action inside Beehiiv."

texts_s8="Here is the daily mental model. Before the open, the scheduler builds the morning report. You open Morning Review to judge the stories and Newsletter Operations to confirm the machinery is healthy. If a stage failed, retry that stage. If the scheduler has not run, use Run now. After the open, the mid-morning pipeline explains what changed. When an issue is ready, transfer or sync it to Beehiiv, review the email, choose the audience and timing, and publish there. Automate the repeatable work. Keep human judgment at the send button."

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
