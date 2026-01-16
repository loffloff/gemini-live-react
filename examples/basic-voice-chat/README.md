# Basic Voice Chat Example

A minimal example demonstrating real-time voice conversation with Gemini Live.

## Features

- Connect/disconnect from Gemini Live
- Real-time transcription of both user and AI speech
- Visual feedback when AI is speaking

## Setup

1. **Deploy the proxy** (if you haven't already)
   ```bash
   # From the repo root
   mkdir -p supabase/functions/gemini-live-proxy
   cp packages/proxy-deno/index.ts supabase/functions/gemini-live-proxy/
   supabase secrets set GOOGLE_AI_API_KEY=your-key
   supabase functions deploy gemini-live-proxy
   ```

2. **Update the proxy URL** in `src/App.tsx`:
   ```tsx
   proxyUrl: 'wss://YOUR-PROJECT.supabase.co/functions/v1/gemini-live-proxy'
   ```

3. **Install and run**
   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:5173 and click "Start Call"

## Files

- `src/App.tsx` - Main component with hook usage
- `src/main.tsx` - React entry point

## What to Try

1. Click "Start Call" and speak - watch your words appear as transcripts
2. Ask Gemini a question and hear the response
3. Notice the "AI is speaking..." indicator during responses
4. Click "End Call" to disconnect cleanly
