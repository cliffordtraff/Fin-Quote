# Newsletter Operations explainer

This narrated Manim lesson explains the full Fin Quote newsletter system:

- the durable morning pipeline
- the mid-morning delta report
- the Newsletter Operations control room
- run-now, leases, idempotency, and failed-stage resume
- Beehiiv create, sync, no-op, and delivery state
- owner authorization and the draft-only publishing boundary

## Build

```bash
chmod +x gen_audio.sh
./gen_audio.sh
~/Library/Python/3.9/bin/manim -qh newsletter_operations_lesson.py NewsletterOperationsLesson
ffmpeg \
  -i media/videos/newsletter_operations_lesson/1080p60/NewsletterOperationsLesson.mp4 \
  -i audio/narration.mp3 \
  -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=7" \
  -c:a aac -b:a 192k -ar 48000 \
  -shortest -movflags +faststart \
  Newsletter_Operations_Explainer.mp4
```

The final narrated export is `Newsletter_Operations_Explainer.mp4`. It runs
approximately 4 minutes 19 seconds at 1920x1080 and 60 frames per second.
