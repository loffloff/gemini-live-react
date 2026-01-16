# CLAUDE.md

This file provides guidance for AI assistants working with this codebase.

## Build Commands

```bash
npm run build    # Build the React package
npm run dev      # Run in watch mode
npm run lint     # Run linting
```

## Architecture

Monorepo with npm workspaces:

- `packages/react` - useGeminiLive hook (published to npm as `gemini-live-react`)
- `packages/proxy-deno` - Supabase Edge Function proxy (keeps API key server-side)
- `examples/` - Working demo apps

## Key Concepts

### Audio Processing
- **Input**: Browser mic → 16kHz PCM → base64 → WebSocket → Gemini
- **Output**: Gemini → 24kHz PCM → resample to browser rate (44.1/48kHz) → playback
- Resampling uses linear interpolation
- Buffer management prevents choppy audio (minBufferMs controls latency vs smoothness)

### WebSocket Proxy
- Proxy server sits between browser and Gemini Live API
- Keeps GOOGLE_AI_API_KEY server-side (never exposed to client)
- Passes through audio, text, and transcription messages

### Transcripts
- Both user and AI speech are transcribed
- Chunks arrive continuously during speech
- Debounced (1.5s default) before finalizing into transcript entries
- `streamingText`/`streamingUserText` provide real-time partial transcripts

## Key Files

| File | Description |
|------|-------------|
| `packages/react/src/useGeminiLive.ts` | Main hook (~700 lines) |
| `packages/react/src/types.ts` | TypeScript interfaces |
| `packages/proxy-deno/index.ts` | Deno proxy for Supabase Edge Functions |

## Common Patterns

### Adding a new option
1. Add to `UseGeminiLiveOptions` in `types.ts`
2. Destructure in `useGeminiLive()` options
3. Use where needed (often in `connect` or message handlers)
4. Add to dependency arrays if used in callbacks

### Adding a new return value
1. Add to `UseGeminiLiveReturn` in `types.ts`
2. Create state with `useState` in hook
3. Update state where appropriate
4. Add to return object
5. Clear on disconnect if needed

## Testing Locally

1. Set up a Supabase project and deploy the proxy
2. Set `GOOGLE_AI_API_KEY` in Supabase secrets
3. Run an example app pointing to your proxy URL
4. Test with Chrome DevTools open (Network tab shows WebSocket frames)
