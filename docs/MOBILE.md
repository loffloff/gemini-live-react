# Mobile & iOS Support

This guide covers using gemini-live-react on mobile devices, particularly iOS Safari where screen recording isn't available.

## Quick Start

```tsx
import {
  useGeminiLive,
  shouldUseCameraMode,
  canScreenRecord,
  isIOS,
} from 'gemini-live-react';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { connect, disconnect, isConnected } = useGeminiLive({
    proxyUrl: 'wss://your-project.supabase.co/functions/v1/gemini-live-proxy',
  });

  const startSession = async () => {
    if (shouldUseCameraMode()) {
      // Mobile without screen capture - use camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // rear camera
      });
      videoRef.current!.srcObject = stream;
      await videoRef.current!.play();
    } else if (canScreenRecord()) {
      // Desktop - use screen share
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      videoRef.current!.srcObject = stream;
      await videoRef.current!.play();
    }
    // Voice-only mode - don't pass video element
    await connect(videoRef.current || undefined);
  };

  return (
    <div>
      <video
        ref={videoRef}
        playsInline  // Required for iOS
        muted        // Prevent feedback
        style={{ width: '100%' }}
      />
      <button onClick={isConnected ? disconnect : startSession}>
        {isConnected ? 'End' : 'Start'}
      </button>
    </div>
  );
}
```

## Browser Capability Utilities

The library exports utilities for detecting browser capabilities:

```typescript
import {
  isIOS,
  isMobile,
  canScreenRecord,
  shouldUseCameraMode,
  getVideoMimeType,
  getRecommendedAudioConstraints,
} from 'gemini-live-react';
```

### `isIOS(): boolean`
Returns `true` if running on an iOS device (iPhone, iPad, iPod).

### `isMobile(): boolean`
Returns `true` if running on any mobile device (iOS, Android, etc.).

### `canScreenRecord(): boolean`
Returns `true` if the browser supports `getDisplayMedia` for screen recording. This is `false` on iOS Safari and some mobile browsers.

### `shouldUseCameraMode(): boolean`
Returns `true` if the app should fall back to camera mode (mobile device without screen capture support). This is the recommended way to decide between screen share and camera.

### `getVideoMimeType(): string`
Returns the recommended video MIME type for the browser:
- iOS Safari: `video/mp4`
- Most others: `video/webm;codecs=vp9,opus` or similar

### `getRecommendedAudioConstraints(): MediaTrackConstraints`
Returns optimized audio constraints including echo cancellation, noise suppression, and auto gain control.

## Video Element Setup

For iOS Safari, the video element requires specific attributes:

```html
<video
  ref={videoRef}
  playsInline    <!-- Required: prevents fullscreen on iOS -->
  muted          <!-- Recommended: prevents audio feedback -->
  autoPlay       <!-- Optional: auto-start playback -->
/>
```

**Important**: Without `playsInline`, iOS Safari will force fullscreen video playback, breaking the user experience.

## Camera Fallback Pattern

When screen recording isn't available, use the device camera instead:

```typescript
async function getVideoStream(): Promise<MediaStream | null> {
  if (canScreenRecord()) {
    // Desktop: screen share
    return navigator.mediaDevices.getDisplayMedia({ video: true });
  } else if (isMobile()) {
    // Mobile: camera fallback
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // 'user' for front camera
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }
    });
  }
  return null; // Voice-only mode
}
```

### Switching Cameras

On mobile devices with multiple cameras:

```typescript
async function switchCamera(useFrontCamera: boolean) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: useFrontCamera ? 'user' : 'environment' }
  });
  videoRef.current!.srcObject = stream;
}
```

## Audio Optimizations

For best audio quality on mobile:

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,   // Reduce echo
    noiseSuppression: true,   // Reduce background noise
    autoGainControl: true,    // Normalize volume levels
  },
  video: false,
});
```

Or use the provided utility:

```typescript
import { getRecommendedAudioConstraints } from 'gemini-live-react';

const stream = await navigator.mediaDevices.getUserMedia({
  audio: getRecommendedAudioConstraints(),
});
```

## Codec Considerations

Different browsers support different video codecs:

| Browser | Preferred Codec |
|---------|----------------|
| Chrome | WebM (VP9/VP8) |
| Firefox | WebM (VP9/VP8) |
| Safari | MP4 (H.264) |
| iOS Safari | MP4 (H.264) |

The `getVideoMimeType()` utility handles this automatically:

```typescript
import { getVideoMimeType } from 'gemini-live-react';

const mimeType = getVideoMimeType();
// iOS Safari: 'video/mp4'
// Chrome: 'video/webm;codecs=vp9,opus'
```

## Common Issues

### Video doesn't play on iOS
Make sure `playsInline` attribute is set on the video element.

### Screen share button does nothing on mobile
Mobile browsers don't support `getDisplayMedia`. Use `shouldUseCameraMode()` to detect this and offer camera fallback.

### Audio echo on mobile
Enable echo cancellation in audio constraints and keep the video element muted.

### Camera permission denied
Handle the permission error gracefully:

```typescript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (err) {
  if (err.name === 'NotAllowedError') {
    // User denied permission
    alert('Camera permission is required');
  } else if (err.name === 'NotFoundError') {
    // No camera available
    alert('No camera found');
  }
}
```

## Full Example

See the complete mobile-aware implementation:

```tsx
import { useRef, useState } from 'react';
import {
  useGeminiLive,
  shouldUseCameraMode,
  canScreenRecord,
  isIOS,
  getRecommendedAudioConstraints,
} from 'gemini-live-react';

function MobileAwareApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMode, setVideoMode] = useState<'none' | 'screen' | 'camera'>('none');

  const { connect, disconnect, isConnected, transcripts, isSpeaking } = useGeminiLive({
    proxyUrl: import.meta.env.VITE_PROXY_URL,
  });

  const startWithVideo = async (mode: 'screen' | 'camera') => {
    try {
      let stream: MediaStream;

      if (mode === 'screen' && canScreenRecord()) {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      }

      videoRef.current!.srcObject = stream;
      await videoRef.current!.play();
      setVideoMode(mode);
      await connect(videoRef.current!);
    } catch (err) {
      console.error('Failed to get video stream:', err);
      // Fall back to voice-only
      await connect();
    }
  };

  const startVoiceOnly = async () => {
    setVideoMode('none');
    await connect();
  };

  return (
    <div>
      {videoMode !== 'none' && (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', maxHeight: '300px', objectFit: 'contain' }}
        />
      )}

      {!isConnected ? (
        <div>
          <button onClick={startVoiceOnly}>Voice Only</button>

          {canScreenRecord() && (
            <button onClick={() => startWithVideo('screen')}>
              Share Screen
            </button>
          )}

          <button onClick={() => startWithVideo('camera')}>
            {shouldUseCameraMode() ? 'Use Camera' : 'Camera Fallback'}
          </button>
        </div>
      ) : (
        <button onClick={disconnect}>End Session</button>
      )}

      {isSpeaking && <p>AI is speaking...</p>}

      {transcripts.map(t => (
        <p key={t.id}>
          <strong>{t.role}:</strong> {t.text}
        </p>
      ))}
    </div>
  );
}
```
