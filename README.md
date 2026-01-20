# gemini-live-react

Real-time bidirectional voice streaming with Google Gemini Live API for React.

[![npm version](https://badge.fury.io/js/gemini-live-react.svg)](https://www.npmjs.com/package/gemini-live-react)
[![npm downloads](https://img.shields.io/npm/dm/gemini-live-react.svg)](https://www.npmjs.com/package/gemini-live-react)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
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
- **Tool calling** - Let AI execute functions and get results back
- **Voice Activity Detection** - Only send audio when speaking (saves bandwidth)
- **Transcription** - Real-time speech-to-text for both sides
- **Streaming transcripts** - Show partial transcripts as users speak
- **Welcome messages** - Auto-trigger AI greeting on connect
- **Connection state machine** - Unified state management (`idle` → `connecting` → `connected`)
- **Debug mode** - Built-in logging for diagnosing issues
- **Auto-reconnect** - Configurable exponential backoff
- **Session resumption** - Pick up where you left off
- **Session Recording** - Record everything, export as JSON, replay for debugging
- **Workflow Builder** - Define multi-step automations AI can execute
- **Smart Element Detection** - AI identifies clickable elements without selectors
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
  connectionState,   // 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'disconnected'
  isSpeaking,        // AI audio playing
  isMuted,           // Mic muted
  isUserSpeaking,    // User speaking (VAD)
  error,             // Error message
  transcripts,       // Conversation history
  streamingText,     // AI's current partial transcript (real-time)
  streamingUserText, // User's current partial transcript (real-time)

  // Actions
  connect,          // Start session (optional: pass video element)
  disconnect,       // End session
  sendText,         // Send text message
  sendToolResult,   // Send tool result back to AI
  setMuted,         // Mute/unmute mic
  clearTranscripts, // Clear history
} = useGeminiLive({
  proxyUrl: string,              // Required
  sessionId?: string,            // Optional session identifier
  welcomeMessage?: string,       // Sent to AI on connect to trigger greeting
  debug?: boolean | DebugCallback, // Enable logging (true or custom callback)

  // Tool calling
  tools?: ToolDefinition[],      // Function definitions for AI
  onToolCall?: (name, args) => result, // Handle tool calls

  // Voice Activity Detection
  vad?: boolean,                 // Only send audio when speaking
  vadOptions?: { threshold?, minSpeechDuration?, silenceDuration? },

  // Reconnection
  reconnection?: {
    maxAttempts?: number,        // Default: 5
    initialDelay?: number,       // Default: 1000ms
    maxDelay?: number,           // Default: 10000ms
    backoffFactor?: number,      // Default: 2
  },

  // Callbacks
  onTranscript?: (t) => void,
  onError?: (e) => void,
  onConnectionChange?: (c) => void,

  // Audio tuning
  minBufferMs?: number,          // Default: 200
  transcriptDebounceMs?: number, // Default: 1500

  // Session Recording
  recording?: RecordingConfig,   // Enable recording
  onRecordingEvent?: (event) => void,

  // Smart Detection
  smartDetection?: SmartDetectionConfig,
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

## Mobile Support

iOS Safari and some mobile browsers don't support screen recording. The library exports utilities for detection and fallback:

```tsx
import {
  shouldUseCameraMode,
  canScreenRecord,
  isIOS,
  isMobile,
} from 'gemini-live-react';

// Decide between screen share and camera
const startWithVideo = async () => {
  let stream: MediaStream;

  if (canScreenRecord()) {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } else {
    // Camera fallback for mobile
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
  }

  videoRef.current!.srcObject = stream;
  await videoRef.current!.play();
  await connect(videoRef.current!);
};
```

**Important for iOS**: Always add `playsInline` to video elements:

```html
<video ref={videoRef} playsInline muted />
```

See [docs/MOBILE.md](./docs/MOBILE.md) for the complete mobile guide.

## Tool Calling

Let AI execute functions and get results back - perfect for building agents:

```tsx
const { connect } = useGeminiLive({
  proxyUrl: '...',
  tools: [
    {
      name: 'lookup_knowledge',
      description: 'Search the knowledge base for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  ],
  onToolCall: async (toolName, args) => {
    if (toolName === 'lookup_knowledge') {
      const result = await searchKnowledgeBase(args.query);
      return { answer: result };
    }
  }
});
```

## Voice Activity Detection (VAD)

Only send audio when the user is speaking - reduces bandwidth and improves latency:

```bash
# Install optional VAD dependency
npm install @ricky0123/vad-web
```

```tsx
const { isUserSpeaking } = useGeminiLive({
  proxyUrl: '...',
  vad: true,
  vadOptions: {
    threshold: 0.5,        // Speech detection sensitivity (0-1)
    minSpeechDuration: 250, // ms before triggering
    silenceDuration: 300,   // ms of silence before ending
  }
});

// Show visual feedback
{isUserSpeaking && <div className="recording-indicator" />}
```

## Debug Mode

Enable logging to diagnose connection issues:

```tsx
// Simple console logging
useGeminiLive({ proxyUrl: '...', debug: true });

// Custom logger
useGeminiLive({
  proxyUrl: '...',
  debug: (level, message, data) => {
    myLogger.log({ level, message, ...data });
  }
});
```

## Session Recording

Record everything that happens in a session - transcripts, audio metadata, tool calls, browser controls - and export for debugging or training:

```tsx
const {
  startRecording,
  stopRecording,
  exportRecording,
  isRecording,
} = useGeminiLive({
  proxyUrl: '...',
  recording: {
    audio: true,        // Record audio metadata
    frames: true,       // Record frame captures
    domSnapshots: true, // Periodic DOM snapshots
    snapshotInterval: 5000, // Every 5 seconds
  },
  onRecordingEvent: (event) => {
    console.log(event.type, event.timestamp, event.data);
  },
});

// Start recording
startRecording();

// Later: stop and get data
const recording = stopRecording();
console.log(recording.events); // All captured events

// Or export as JSON file
const blob = exportRecording();
const url = URL.createObjectURL(blob);
// Download or analyze
```

**Event Types**: `connection_change`, `transcript`, `audio_chunk`, `frame_capture`, `tool_call`, `tool_result`, `browser_control`, `ui_command`, `dom_snapshot`, `error`

## Workflow Builder

Define reusable multi-step automations that AI can execute - like macros, but AI-aware:

```tsx
const {
  registerWorkflow,
  executeWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  cancelWorkflow,
  workflowExecution,
} = useGeminiLive({ proxyUrl: '...' });

// Define a workflow
registerWorkflow({
  id: 'login-flow',
  name: 'Login to Dashboard',
  entryPoint: 'click-login',
  steps: {
    'click-login': {
      id: 'click-login',
      type: 'browser_control',
      action: 'click',
      args: { selector: '#login-button' },
      next: 'wait-modal',
    },
    'wait-modal': {
      id: 'wait-modal',
      type: 'wait',
      waitMs: 500,
      next: 'fill-email',
    },
    'fill-email': {
      id: 'fill-email',
      type: 'browser_control',
      action: 'type',
      args: { selector: '#email', text: 'user@example.com' },
      next: 'check-next-button',
    },
    'check-next-button': {
      id: 'check-next-button',
      type: 'condition',
      condition: { selector: '#next-btn', check: 'visible' },
      next: ['click-next', 'error-handler'], // Branching
      onError: 'error-handler',
    },
    // ...
  },
});

// Execute it
const result = await executeWorkflow('login-flow', { customVar: 'value' });
console.log(result.status); // 'completed' | 'failed'
console.log(result.history); // Step-by-step execution log
```

**Step Types**: `browser_control`, `wait`, `condition`, `ai_prompt`

## Smart Element Detection

Detect interactive elements on the page without needing CSS selectors - useful for dynamic UIs:

```tsx
const {
  detectElements,
  clickDetectedElement,
  detectedElements,
  isDetecting,
} = useGeminiLive({
  proxyUrl: '...',
  smartDetection: {
    highlightDetections: true, // Visual feedback
  },
});

// Scan the page
const result = await detectElements();
console.log(result.elements);
// [
//   { id: 'det_123', type: 'button', text: 'Submit', bounds: {...}, selector: '#submit-btn', confidence: 1.0 },
//   { id: 'det_124', type: 'link', text: 'Learn more', bounds: {...}, selector: 'a.learn-more', confidence: 1.0 },
//   ...
// ]

// Click by element ID (uses selector if available, falls back to coordinates)
await clickDetectedElement('det_123');
```

**Detected Types**: `button`, `input`, `link`, `text`, `image`, `unknown`

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

- [x] Voice Activity Detection (VAD)
- [x] Tool/function calling
- [x] Debug logging mode
- [x] Connection state machine
- [x] Configurable reconnection
- [x] Session Recording & Replay
- [x] Workflow Builder
- [x] Smart Element Detection
- [ ] Vanilla JS core (`@gemini-live/core`)
- [ ] Vue hook (`@gemini-live/vue`)
- [ ] Cloudflare Workers proxy
- [ ] Vercel Edge proxy

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

## License

MIT - Made by [loffloff](https://github.com/loffloff)

---

<p align="center">
  <sub>Built for the Gemini Live API. Not affiliated with Google.</sub>
</p>
