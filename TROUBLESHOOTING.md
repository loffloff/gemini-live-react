# Troubleshooting

Common issues and solutions for gemini-live-react.

## Audio Issues

### No audio output

**Symptoms**: AI responds (you see transcripts) but no sound plays.

**Causes & Solutions**:

1. **AudioContext suspended** - Browsers require user interaction before playing audio.
   ```tsx
   // Ensure connect() is called from a user gesture (click, tap)
   <button onClick={() => connect()}>Start</button>
   ```

2. **Volume/mute** - Check system volume and browser tab mute status.

3. **Audio device** - Verify correct output device is selected in OS settings.

### Choppy or stuttering audio

**Symptoms**: Audio plays but sounds robotic or has gaps.

**Solutions**:

1. **Increase buffer size** - Trade latency for smoother playback:
   ```tsx
   useGeminiLive({
     proxyUrl: '...',
     minBufferMs: 400, // Default is 200, try 300-500
   });
   ```

2. **Network issues** - Check for packet loss or high latency to your proxy.

3. **CPU load** - Close other tabs/apps consuming resources.

### Echo or feedback

**Symptoms**: AI hears itself and responds to its own output.

**Solutions**:

1. **Use headphones** - Prevents speaker output from reaching mic.

2. **Mute when AI speaks** - Automatically mute during playback:
   ```tsx
   const { isSpeaking, setMuted } = useGeminiLive({ ... });

   useEffect(() => {
     setMuted(isSpeaking);
   }, [isSpeaking]);
   ```

## Microphone Issues

### Mic not working

**Symptoms**: AI doesn't hear you, no user transcripts appear.

**Causes & Solutions**:

1. **Permissions denied** - Check browser permissions for microphone access.

2. **HTTPS required** - `getUserMedia` requires secure context. Use `https://` or `localhost`.

3. **Wrong device** - Browser may be using wrong input device. Check browser settings.

4. **Muted** - Check `isMuted` state:
   ```tsx
   const { isMuted, setMuted } = useGeminiLive({ ... });
   // Ensure isMuted is false
   ```

## Connection Issues

### WebSocket connection fails

**Symptoms**: `error` state shows connection error, `isConnected` stays false.

**Causes & Solutions**:

1. **Wrong proxy URL** - Verify URL format:
   ```tsx
   // Correct format for Supabase Edge Functions
   proxyUrl: 'wss://YOUR-PROJECT.supabase.co/functions/v1/gemini-live-proxy'
   ```

2. **Proxy not deployed** - Ensure function is deployed:
   ```bash
   supabase functions deploy gemini-live-proxy
   ```

3. **Missing API key** - Set secret in Supabase:
   ```bash
   supabase secrets set GOOGLE_AI_API_KEY=your-key-here
   ```

4. **CORS issues** - Edge Functions handle CORS automatically, but custom proxies need proper headers.

### Connection drops frequently

**Symptoms**: Connection works initially but drops after seconds/minutes.

**Solutions**:

1. **Check API quotas** - Gemini Live API has usage limits.

2. **Network stability** - Use wired connection if on flaky WiFi.

3. **Proxy timeout** - Some hosting platforms have function execution limits.

## Transcript Issues

### Transcripts not appearing

**Symptoms**: Audio works but `transcripts` array stays empty.

**Causes & Solutions**:

1. **Transcription not enabled** - Proxy must request transcription in Gemini config:
   ```typescript
   // In proxy config
   outputAudioTranscription: {},
   inputAudioTranscription: {},
   ```

2. **Debounce delay** - Transcripts appear 1.5s after speech stops (configurable):
   ```tsx
   useGeminiLive({
     proxyUrl: '...',
     transcriptDebounceMs: 1000, // Faster but may split sentences
   });
   ```

3. **Using streamingText** - For real-time display, use `streamingText` / `streamingUserText`:
   ```tsx
   const { streamingText, streamingUserText, transcripts } = useGeminiLive({ ... });

   // Show real-time partial transcript
   {streamingUserText && <p>You: {streamingUserText}...</p>}
   {streamingText && <p>AI: {streamingText}...</p>}
   ```

### Transcripts are garbled or incorrect

**Symptoms**: Transcribed text doesn't match what was said.

**Solutions**:

1. **Microphone quality** - Use a better mic, reduce background noise.

2. **Speaking clearly** - Speak at normal pace, avoid mumbling.

3. **Language mismatch** - Ensure Gemini is configured for correct language.

## Screen Sharing Issues

### Screen not visible to AI

**Symptoms**: AI doesn't respond to screen content.

**Solutions**:

1. **Pass video element** - Must pass the video element to `connect()`:
   ```tsx
   const videoRef = useRef<HTMLVideoElement>(null);

   const start = async () => {
     const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
     videoRef.current!.srcObject = stream;
     await videoRef.current!.play();
     await connect(videoRef.current!); // Pass the element!
   };
   ```

2. **Video not playing** - Ensure video is playing before connecting.

3. **Frame rate** - Frames sent at 1 FPS; rapid changes may be missed.

## Still Having Issues?

1. **Check browser console** - Look for errors or warnings.

2. **Check network tab** - WebSocket frames show what's being sent/received.

3. **Open an issue** - Include:
   - Browser and version
   - Code snippet showing your usage
   - Error messages from console
   - Network tab screenshots if relevant
