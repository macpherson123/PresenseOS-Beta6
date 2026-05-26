# Offline Voice Assistant — Design Proposal

## Scope (hard fence)

This assistant exists for two jobs, and nothing else:

1. **Voice-to-text dictation for messaging** (Presence chat, SMS) — speak, see text in the keyboard's text field, send.
2. **OS navigation by voice command** — "open browser", "go home", "lock", "open settings", "new chat to Sam".

Explicitly out of scope: weather, web search, "what's the capital of…", playing music, jokes, calendar, alarms-by-voice, anything that touches the network. The whole point is that it is small, fast, private, and never reaches out. If it grows, it loses the trust premise.

## On-device model

Use **whisper.cpp tiny.en (~39 MB) or base.en (~74 MB)** for speech-to-text, compiled as a JNI/Obj-C bridge.

- Tiny.en is real-time on a low-end Android with int8 quantization, ~1.5s for a 4-second utterance.
- Base.en is more accurate for messaging dictation but slower; offer it as the "Accuracy" preset.
- INT8 quantized GGML format, shipped inside the APK or downloaded once on first run.
- No Internet permission requested for the voice subsystem — fail loud if the bridge ever tries.

For intent matching (the "OS navigation" half) we do **not** use an LLM. We use a hand-written grammar: a few dozen regex / keyword rules over the transcript. That's faster, deterministic, debuggable, and matches the scope.

## The wizard (voice fingerprinting + tuning)

First-launch wizard, 90 seconds:

1. "Say each phrase clearly. We never send this anywhere." (Mic permission rationale.)
2. **15 sentences** covering the phonetic range — drawn from the existing PresenceOS interaction surface ("open browser", "send Sam I'll be there in five", "lock the phone"). User reads each, we record the WAV locally.
3. Extract a **speaker embedding** (small x-vector or ECAPA-TDNN, 256-d). This is the user's voice fingerprint. ~5 MB model.
4. Compute personal calibration: noise floor of their environment, average loudness, average speaking rate.
5. (Optional, slower) **LoRA-style fine-tune of the Whisper decoder** on those 15 utterances — small adapter weights only, takes ~30s on-device. Improves accuracy on the user's accent/cadence by a measurable amount. Can be skipped on cheap hardware.
6. Store everything under `/data/user/0/com.presenceos.lite/files/voice/` — encrypted with Android Keystore.

The wizard re-runs whenever the user wants to retrain (Settings → Voice → Re-train). No cloud step ever.

## Wake-up

Push-to-talk by default — long-press a dedicated key on the PresenceKeyboard or hold the home gesture for 600ms. **No always-on wake word in v1**: wake words mean a model that's always running, always listening, and that's the kind of trust-erosion we're trying to avoid. Add it later behind an explicit opt-in if users ask for it.

## End-to-end flow

```
[hold-to-talk] → record WAV (16kHz mono)
              → speaker-verify against fingerprint (reject if mismatch >threshold)
              → whisper.cpp transcribe → text
              → if keyboard is focused: insert text, done
              → else: match transcript against navigation grammar
                    → matched verb → route action via PresenceDeviceControl / router.push
                    → no match → toast "didn't catch that", no fallback to web
```

Total target latency on a mid-range Android: **< 1.2s** from key-release to action.

## Navigation grammar (starting set)

| Phrase pattern | Action |
|---|---|
| "open / launch \<app\>" | `router.push('/<app>')` |
| "go home" | `router.push('/home')` |
| "lock (the phone)" | `PresenceDeviceControl.lockNow()` |
| "torch on / off" | toggle torch |
| "new chat (to) \<contact\>" | `router.push('/messages')` with `to=` param |
| "send \<contact\> \<message\>" | new SMS or chat, prefilled |
| "back" | `router.back()` |
| "call \<contact\>" | dialer |

If the transcript matches none of these, do nothing visible — show a one-line toast and discard.

## What we ship in v1

- Wizard screen (the 15-sentence flow + retrain button in Settings)
- A `VoiceContext` provider that exposes `startListening()` / `stopListening()` and emits transcripts
- PresenceKeyboard gains a mic key that's push-to-talk into its text field
- A `useVoiceNavigation()` hook that matches transcripts against the grammar and dispatches

## What we don't ship in v1

- Wake word
- Conversational dialog / multi-turn
- TTS replies (assistant doesn't talk back — it just acts)
- Any model larger than ~80MB
- Anything that requires Internet permission

## Open questions for the next pass

1. Which JNI binding for whisper.cpp — write our own thin one, or use an existing community wrapper? Affects APK size and licence.
2. Speaker-verification threshold — too strict locks out colds/illness, too loose lets siblings issue commands. Probably needs a per-user calibration after wizard.
3. Do we ship the model in-APK (adds ~40MB to download) or fetch on first run (needs Internet permission once, which breaks the "no network" promise)? **Recommend in-APK** to keep the promise unconditional.
