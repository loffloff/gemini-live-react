# Hacker News Post

## Title (80 chars max)
Show HN: gemini-live-react – Real-time voice AI with recording, workflows, and smart detection

## Post

I built a React hook for real-time voice conversations with Google's Gemini Live API. After shipping v0.1 and getting feedback, I just added three features that I think make it genuinely useful for building AI agents:

**The Problem**

Gemini Live gives you real-time bidirectional audio streaming, but the DX is rough:
- Audio format juggling (16kHz in, 24kHz out, browser wants 44.1/48kHz)
- Endianness bugs (Gemini sends little-endian PCM16, `Int16Array` doesn't care about that)
- Buffer management (play too early = choppy, buffer too much = laggy)
- Playback chaining (new chunks arrive while playing, chain them wrong = gaps)

**What I Built**

`useGeminiLive` handles all of that, plus:

1. **Session Recording** - Record everything (transcripts, audio metadata, tool calls, browser controls, DOM snapshots) into a single exportable JSON. Useful for debugging, training data, or building replay features.

```tsx
startRecording();
// ... session happens ...
const recording = stopRecording();
// { events: [...], startTime, endTime }
```

2. **Workflow Builder** - Define multi-step automations as state machines that AI can execute. Steps can be browser controls, waits, conditions, or AI prompts. Supports branching and error handlers.

```tsx
registerWorkflow({
  id: 'login-flow',
  entryPoint: 'click-login',
  steps: {
    'click-login': { type: 'browser_control', action: 'click', args: { selector: '#login' }, next: 'wait' },
    'wait': { type: 'wait', waitMs: 500, next: 'fill-form' },
    // ...
  }
});
await executeWorkflow('login-flow');
```

3. **Smart Element Detection** - Scans the DOM for interactive elements, returns bounding boxes and auto-generated selectors. Click by element ID instead of hardcoding selectors.

```tsx
const { elements } = await detectElements();
// [{ id: 'det_123', type: 'button', text: 'Submit', selector: '#submit-btn', bounds: {...} }, ...]
await clickDetectedElement('det_123');
```

**Why These Three?**

I'm building AI agents that need to interact with web UIs. The common pattern is:
1. AI sees screen (via frame capture)
2. AI decides what to do
3. AI executes browser control
4. Repeat

Session recording lets me debug what went wrong. Workflows let me define reliable multi-step sequences. Element detection means I don't need to maintain selector mappings as UIs change.

**Tech Stack**
- React hook with ~2000 LOC
- WebSocket proxy (Deno/Supabase Edge Functions) to keep API key server-side
- AudioWorklet for low-latency mic capture
- Linear interpolation resampling for audio output
- Full TypeScript

**Links**
- GitHub: https://github.com/loffloff/gemini-live-react
- npm: `npm install gemini-live-react`
- Used in production at deflectionrate.com

Would love feedback on the API design. The workflow builder especially - I went with a simple state machine but wondering if there's a better abstraction for this.

---

## Alternative Shorter Version (if needed)

Show HN: React hook for Gemini Live with session recording, workflows, and element detection

I built a React hook for real-time voice AI with Google Gemini. Just added three features that make it useful for building AI agents:

1. **Session Recording** - Record everything (transcripts, tool calls, browser actions) to JSON for debugging/training
2. **Workflow Builder** - Define multi-step automations as state machines with branching and error handling
3. **Smart Element Detection** - Auto-detect clickable elements without hardcoding selectors

The hook handles all the audio format juggling (Gemini wants 16kHz in, sends 24kHz out, browsers use 44.1/48kHz), endianness conversion, buffer management, and playback chaining that makes raw Gemini Live painful to work with.

GitHub: https://github.com/loffloff/gemini-live-react

Looking for feedback on the workflow builder API - went with a simple state machine but open to suggestions.
