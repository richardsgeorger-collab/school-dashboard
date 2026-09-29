# Lecture recordings to text: what George sets up

Max students can upload a lecture recording (MP4, M4A, MP3, WAV) on a class page, Add a lecture. The browser pulls
the sound out (a video's too), and the text comes back into the transcript box, where it works exactly like a pasted
transcript. Until the key below is set, the upload tab says "Transcribing files is not switched on yet. Paste a
transcript for now." and nothing fails silently.

## The choice: Groq's hosted Whisper (whisper-large-v3-turbo)

| Option | Cost per hour of lecture | Time for a 1-hour lecture |
|---|---|---|
| **Groq, whisper-large-v3-turbo (chosen)** | **$0.04**, and the free tier covers several hours a day at $0 | about 1 to 3 minutes, mostly the upload |
| OpenAI gpt-4o-mini-transcribe | $0.18 | about 2 to 4 minutes |
| OpenAI whisper-1 | $0.36 | about 3 to 5 minutes |
| Free, in the browser (Whisper on the student's device) | $0 | 20 to 60+ minutes on a laptop, often fails on an iPad; a 100 MB+ download first; weaker accuracy |

Groq is the most accurate Whisper there is, the fastest, and the cheapest, with a free tier to start. The daily cap
per student is 5 hours of audio, set in the transcribe function.

How the time splits for a 1-hour lecture: pulling the audio out, 5 to 20 seconds; uploading it (about 115 MB as
12 five-minute pieces, three at a time), about a minute on campus Wi-Fi; Groq writing the text, a few seconds a piece.
The screen says "Transcribing, about N minutes left" the whole way.

## Setup (5 minutes, free, no card)

1. Go to console.groq.com and sign up (Google sign-in works). No card is needed for the free tier.
2. API Keys, Create API Key, name it "Halo+ lectures", copy it.
3. Supabase dashboard, project school-dashboard: Edge Functions, Secrets (or Project Settings, Edge Functions,
   Secrets). Add a secret named `GROQ_API_KEY` with the key as its value. Save. No deploy is needed.
4. Check: Halo+, a class page, Add a lecture, Upload a recording, pick a short Voice Memo. The transcript should appear.

Groq's free-tier limits (requests and audio seconds per hour and per day) are on console.groq.com under Settings,
Limits. If students hit them, upgrading there is pay-as-you-go at $0.04 an hour of audio; that is George's call.

To switch it off: delete the `GROQ_API_KEY` secret. The upload tab goes back to "not switched on yet" at once.
