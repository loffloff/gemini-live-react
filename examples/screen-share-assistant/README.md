# Screen Share Assistant Example

An example demonstrating screen sharing with Gemini Live - let AI see and discuss what's on your screen.

## Features

- Share your screen with Gemini
- Ask questions about what you're showing
- Real-time voice conversation about visual content

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

4. Open http://localhost:5173

## Usage

1. Click "Share Screen" to select a window/screen to share
2. Click "Start Call" to begin the conversation
3. Ask Gemini about what it sees on your screen
4. Frames are sent at 1 FPS, scaled to max 1024px width

## Files

- `src/App.tsx` - Main component with screen sharing logic
- `src/main.tsx` - React entry point

## What to Try

- Share a code editor and ask Gemini to explain the code
- Share a design mockup and discuss improvements
- Share a document and ask for a summary
- Share a chart and ask for data insights
