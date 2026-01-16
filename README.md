# gemini-live-react

Real-time bidirectional voice streaming with Google Gemini Live API for React.

[![npm version](https://badge.fury.io/js/gemini-live-react.svg)](https://www.npmjs.com/package/gemini-live-react)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Building real-time voice with Gemini Live is harder than it looks:

- **Audio format juggling**: Gemini wants 16kHz PCM input, sends 24kHz output, but browsers use 44.1kHz/48kHz
- **Endianness matters**: Gemini sends little-endian PCM16. Use `Int16Array` directly and you'll get garbage on some devices
- **Buffer management**: Play audio too early = choppy. Buffer too much = laggy
- **Playback chaining**: New audio chunks arrive while playing. Chain them wrong = gaps and clicks

I spent some hours figuring this out. Hope it saves you some time!

## Quick Start

### 1. Install

```bash
npm install gemini-live-react
```

### 2. Deploy the proxy

Copy `packages/proxy-deno/index.ts` to your Supabase project:

```bash
mkdir -p supabase/functions/gemini-live-proxy
cp node_modules/gemini-live-react/packages/proxy-deno/index.ts supabase/functions/gemini-live-proxy/

# Set your API key
supabase secrets set GOOGLE_AI_API_KEY=your-key

# Deploy
supabase functions deploy gemini-live-proxy
```

### 3. Use the hook

```tsx
import { useGeminiLive } from 'gemini-live-react';

function App() {
  const { connect, disconnect, transcripts, isConnected, isSpeaking } = useGeminiLive({
    proxyUrl: 'wss://your-project.supabase.co/functions/v1/gemini-live-proxy',
  });

  return (
    <div>
      <button onClick={() => isConnected ? disconnect() : connect()}>
        {isConnected ? 'End Call' : 'Start Call'}
      </button>

      {isSpeaking && <p>🔊 AI is speaking...</p>}

      {transcripts.map(t => (
        <p key={t.id}><b>{t.role}:</b> {t.text}</p>
      ))}
    </div>
  );
}
```

## See It In Production

[deflectionrate.com](https://deflectionrate.com) - AI-powered customer support deflection built with this library.

## Features

- **Voice in/out** - Full duplex audio streaming
- **Screen sharing** - Gemini can see what you share
- **Transcription** - Real-time speech-to-text for both sides
- **Streaming transcripts** - Show partial transcripts as users speak
- **Welcome messages** - Auto-trigger AI greeting on connect
- **Auto-reconnect** - Exponential backoff on connection loss
- **Session resumption** - Pick up where you left off
- **TypeScript** - Full type definitions

## Packages

| Package | Description |
|---------|-------------|
| [`gemini-live-react`](./packages/react) | React hook |
| [`proxy-deno`](./packages/proxy-deno) | Supabase Edge Function proxy |

## API

```typescript
const {
  // State
  isConnected,       // Connected to proxy
  isConnecting,      // Attempting connection
  isSpeaking,        // AI audio playing
  isMuted,           // Mic muted
  error,             // Error message
  transcripts,       // Conversation history
  streamingText,     // AI's current partial transcript (real-time)
  streamingUserText, // User's current partial transcript (real-time)

  // Actions
  connect,          // Start session (optional: pass video element)
  disconnect,       // End session
  sendText,         // Send text message
  setMuted,         // Mute/unmute mic
  clearTranscripts, // Clear history
} = useGeminiLive({
  proxyUrl: string,              // Required
  sessionId?: string,            // Optional
  welcomeMessage?: string,       // Sent to AI on connect to trigger greeting
  onTranscript?: (t) => void,    // On new transcript
  onError?: (e) => void,         // On error
  onConnectionChange?: (c) => void,
  minBufferMs?: number,          // Default: 200
  transcriptDebounceMs?: number, // Default: 1500
});
```

## Voices

| Voice | Style |
|-------|-------|
| Zephyr | Bright, clear (default) |
| Puck | Warm, friendly |
| Charon | Deep, authoritative |
| Kore | Soft, gentle |
| Fenrir | Strong, confident |
| Aoede | Melodic, expressive |

Change voice via proxy query param: `?voice=Kore`

## Screen Sharing

```tsx
const videoRef = useRef<HTMLVideoElement>(null);

const startWithScreen = async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  videoRef.current!.srcObject = stream;
  await videoRef.current!.play();
  await connect(videoRef.current!); // Pass video element
};
```

Frames are sent at 1 FPS, scaled to max 1024px width.

## How It Works

```
┌─────────────┐     WebSocket      ┌──────────────┐     WebSocket      ┌─────────────┐
│   Browser   │  ◄──────────────►  │    Proxy     │  ◄──────────────►  │   Gemini    │
│             │                    │              │                    │   Live API  │
│ ┌─────────┐ │  16kHz PCM base64  │              │                    │             │
│ │   Mic   │─┼───────────────────►│              │───────────────────►│             │
│ └─────────┘ │                    │  (keeps API  │                    │             │
│             │                    │   key safe)  │                    │             │
│ ┌─────────┐ │  24kHz PCM base64  │              │                    │             │
│ │ Speaker │◄┼────────────────────│              │◄───────────────────│             │
│ └─────────┘ │                    │              │                    │             │
│      ↓      │                    │              │                    │             │
│  Resample   │                    └──────────────┘                    └─────────────┘
│  to 48kHz   │
│      ↓      │
│  Playback   │
└─────────────┘
```

## Examples

See [`examples/`](./examples) for:
- Basic voice chat
- Screen share assistant

## Roadmap

- [ ] Vanilla JS core (`@gemini-live/core`)
- [ ] Vue hook (`@gemini-live/vue`)
- [ ] Cloudflare Workers proxy
- [ ] Vercel Edge proxy
- [ ] Voice Activity Detection (VAD)
- [ ] Tool calling plugin system

## Contributing

PRs welcome! Please:
- Test on Chrome, Firefox, Safari
- Test with different sample rates (44.1kHz, 48kHz)
- Add types for new features

## License

MIT - Made by [loffloff](https://github.com/loffloff)
