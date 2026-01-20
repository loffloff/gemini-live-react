# gemini-live-react

React hook for real-time bidirectional voice communication with Google Gemini Live API.

## Features

- **Real-time voice streaming** - Talk to Gemini and hear responses instantly
- **Automatic audio handling** - Mic capture, playback, resampling all handled for you
- **Screen sharing support** - Optional video frame streaming for visual context
- **Live transcription** - Both user and AI speech transcribed in real-time
- **Auto-reconnection** - Exponential backoff reconnection on connection loss
- **Speaker mute control** - Mute AI audio output independently from microphone
- **Connection metrics** - Track audio chunks, messages, reconnects, and uptime
- **TypeScript** - Full type definitions included

## Installation

```bash
npm install gemini-live-react
```

## Quick Start

```tsx
import { useGeminiLive } from 'gemini-live-react';

function VoiceChat() {
  const {
    connect,
    disconnect,
    transcripts,
    isConnected,
    isSpeaking,
  } = useGeminiLive({
    proxyUrl: 'wss://your-project.supabase.co/functions/v1/gemini-live-proxy',
  });

  return (
    <div>
      <button onClick={() => isConnected ? disconnect() : connect()}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>

      {isSpeaking && <div>AI is speaking...</div>}

      <div>
        {transcripts.map((t) => (
          <div key={t.id}>
            <strong>{t.role}:</strong> {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## API Reference

### `useGeminiLive(options)`

#### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `proxyUrl` | `string` | Yes | - | WebSocket URL of your proxy server |
| `sessionId` | `string` | No | - | Passed to proxy as query param |
| `onTranscript` | `(t: Transcript) => void` | No | - | Called when transcript is finalized |
| `onError` | `(error: string) => void` | No | - | Called on errors |
| `onConnectionChange` | `(connected: boolean) => void` | No | - | Called when connection state changes |
| `minBufferMs` | `number` | No | `200` | Audio buffer before playback (ms) |
| `transcriptDebounceMs` | `number` | No | `1500` | Debounce time for transcripts (ms) |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isConnected` | `boolean` | Currently connected to proxy |
| `isConnecting` | `boolean` | Attempting to connect |
| `connectionState` | `ConnectionState` | Granular connection state |
| `isSpeaking` | `boolean` | AI audio is playing |
| `isMuted` | `boolean` | Microphone is muted |
| `isSpeakerMuted` | `boolean` | AI audio output is muted |
| `error` | `string \| null` | Current error message |
| `transcripts` | `Transcript[]` | All transcript entries |
| `connect` | `(video?: HTMLVideoElement) => Promise<void>` | Connect to proxy |
| `disconnect` | `() => void` | Disconnect and cleanup |
| `retry` | `() => Promise<void>` | Retry connection after error |
| `sendText` | `(text: string) => void` | Send text message |
| `setMuted` | `(muted: boolean) => void` | Set microphone mute state |
| `setSpeakerMuted` | `(muted: boolean) => void` | Set speaker mute state |
| `clearTranscripts` | `() => void` | Clear transcript history |
| `getMetrics` | `() => ConnectionMetrics` | Get connection quality metrics |
| `startRecording` | `() => void` | Start session recording |
| `stopRecording` | `() => SessionRecording` | Stop recording and get data |
| `isRecording` | `boolean` | Currently recording |
| `exportRecording` | `() => Blob` | Export recording as JSON blob |
| `registerWorkflow` | `(workflow: Workflow) => void` | Register a workflow |
| `executeWorkflow` | `(id: string, vars?) => Promise<WorkflowExecution>` | Run a workflow |
| `pauseWorkflow` | `() => void` | Pause current workflow |
| `resumeWorkflow` | `() => void` | Resume paused workflow |
| `cancelWorkflow` | `() => void` | Cancel current workflow |
| `workflowExecution` | `WorkflowExecution \| null` | Current workflow state |
| `detectElements` | `() => Promise<DetectionResult>` | Detect interactive elements |
| `clickDetectedElement` | `(id: string) => Promise<BrowserControlResult>` | Click detected element |
| `detectedElements` | `DetectedElement[]` | Latest detection results |
| `isDetecting` | `boolean` | Detection in progress |

### Types

```typescript
interface Transcript {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'disconnected';

interface ConnectionMetrics {
  audioChunksReceived: number;
  messagesReceived: number;
  reconnectCount: number;
  lastConnectedAt: number | null;
  totalConnectedTime: number;
}

// Session Recording
interface SessionRecording {
  id: string;
  startTime: number;
  endTime?: number;
  events: SessionEvent[];
}

interface SessionEvent {
  type: SessionEventType; // 'transcript' | 'audio_chunk' | 'tool_call' | ...
  timestamp: number;
  data: unknown;
}

// Workflow Builder
interface Workflow {
  id: string;
  name: string;
  entryPoint: string;
  steps: Record<string, WorkflowStep>;
}

interface WorkflowStep {
  id: string;
  type: 'browser_control' | 'wait' | 'condition' | 'ai_prompt';
  action?: BrowserControlAction;
  args?: Record<string, unknown>;
  waitMs?: number;
  condition?: { selector: string; check: 'exists' | 'visible' | 'contains_text'; value?: string };
  prompt?: string;
  next?: string | string[];
  onError?: string;
}

// Smart Element Detection
interface DetectedElement {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  type: 'button' | 'input' | 'link' | 'text' | 'image' | 'unknown';
  text?: string;
  selector?: string;
  confidence: number;
}
```

## Screen Recording

For apps that need screen/camera capture with recordings and screenshots, use the `useScreenRecording` hook:

```tsx
import { useGeminiLive, useScreenRecording, shouldUseCameraMode } from 'gemini-live-react';

function ScreenShareApp() {
  const {
    state,
    startRecording,
    stopRecording,
    getVideoElement,
  } = useScreenRecording({
    screenshotInterval: 2000,  // Capture every 2 seconds
    maxScreenshots: 30,        // Keep last 30 screenshots
  });

  const {
    connect,
    disconnect,
    transcripts,
    isConnected,
  } = useGeminiLive({ proxyUrl: 'wss://your-proxy.com' });

  const handleStart = async () => {
    // Use camera on mobile devices that don't support screen capture
    const useCameraMode = shouldUseCameraMode();
    await startRecording(useCameraMode);

    // Get the video element and connect to Gemini
    const videoEl = getVideoElement();
    if (videoEl) {
      await connect(videoEl);
    }
  };

  const handleStop = async () => {
    disconnect();
    const result = await stopRecording();
    // result.videoBlob - recorded video
    // result.audioBlob - separate microphone audio
    // result.screenshots - array of timestamped screenshots
  };

  return (
    <div>
      <button onClick={state.isRecording ? handleStop : handleStart}>
        {state.isRecording ? 'Stop' : 'Start'} Recording
      </button>
      <div>Duration: {state.duration}s</div>
    </div>
  );
}
```

### `useScreenRecording(options?)`

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `screenshotInterval` | `number` | `2000` | Interval between screenshot captures (ms) |
| `maxScreenshots` | `number` | `30` | Maximum screenshots to keep (rolling window) |
| `screenshotQuality` | `number` | `0.8` | JPEG quality for screenshots (0-1) |
| `audioConstraints` | `MediaTrackConstraints` | - | Custom mic audio constraints |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `state` | `RecordingState` | `{ isRecording, isPaused, duration, error }` |
| `startRecording` | `(useCameraMode?: boolean) => Promise<void>` | Start recording |
| `stopRecording` | `() => Promise<RecordingResult \| null>` | Stop and get results |
| `pauseRecording` | `() => void` | Pause recording |
| `resumeRecording` | `() => void` | Resume recording |
| `getVideoElement` | `() => HTMLVideoElement \| null` | Get video element for `connect()` |
| `getStream` | `() => MediaStream \| null` | Get media stream |
| `getLatestScreenshot` | `() => string \| null` | Get latest auto-captured screenshot |
| `captureScreenshotNow` | `() => string \| null` | Capture screenshot immediately |

### Mobile/iOS Support

Screen capture isn't available on iOS and some mobile browsers. Use the `shouldUseCameraMode()` helper to fall back to camera capture:

```tsx
import { shouldUseCameraMode } from 'gemini-live-react';

// Returns true on mobile devices without screen capture support
if (shouldUseCameraMode()) {
  await startRecording(true); // Uses rear camera
} else {
  await startRecording();     // Uses screen capture
}
```

## Manual Screen Sharing

For simple screen sharing without recording features, you can set up the stream manually:

```tsx
function ScreenShareChat() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { connect, disconnect, isConnected } = useGeminiLive({
    proxyUrl: 'wss://your-proxy.com',
  });

  const startWithScreenShare = async () => {
    // Get screen capture stream
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    // Attach to video element
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    // Connect with video element - frames will be sent at 1 FPS
    await connect(videoRef.current!);
  };

  return (
    <div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <button onClick={startWithScreenShare}>
        Start with Screen Share
      </button>
    </div>
  );
}
```

## How Audio Works

This library handles the complex audio format juggling that Gemini Live requires:

### Input (Microphone → Gemini)
1. Captures audio at **16kHz** using `getUserMedia`
2. Uses **AudioWorklet** for low-latency processing
3. Converts **Float32 → Int16 PCM** with proper clamping
4. Base64 encodes and sends via WebSocket

### Output (Gemini → Speakers)
1. Receives **24kHz PCM16** audio (little-endian)
2. Decodes base64 and parses with **DataView** (endianness matters!)
3. **Resamples** to browser's native sample rate (44.1kHz or 48kHz)
4. Buffers **200ms** minimum before starting playback
5. Chains audio buffers for seamless playback

### Why This Matters

Most tutorials get audio wrong because:
- They use `Int16Array` directly (ignores endianness)
- They force AudioContext to 24kHz (browsers often ignore this)
- They don't buffer enough (causes choppy audio)
- They don't chain playback (causes gaps)

This library handles all of this correctly.

## Proxy Setup

You need a WebSocket proxy to keep your Google AI API key secure. See:

- [Supabase Edge Functions proxy](../proxy-deno)
- More platforms coming soon

## License

MIT
