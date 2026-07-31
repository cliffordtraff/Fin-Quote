# Fin Quote to Beehiiv explainer

This lesson uses the same Manim + segmented narration pipeline as the educational
videos in the Medical Records repo. It explains the morning newsletter pipeline,
the create/sync/no-op behavior, OAuth and MCP, the Scale-plan compatibility, and
the draft-only safety boundary.

## Build

```bash
chmod +x gen_audio.sh
./gen_audio.sh
~/Library/Python/3.9/bin/manim -qh beehiiv_workflow_lesson.py BeehiivWorkflowLesson
ffmpeg \
  -i media/videos/beehiiv_workflow_lesson/1080p60/BeehiivWorkflowLesson.mp4 \
  -i audio/narration.mp3 \
  -c:v copy -c:a aac -shortest \
  Fin_Quote_to_Beehiiv_Explainer.mp4
```

The final export is `Fin_Quote_to_Beehiiv_Explainer.mp4`.
