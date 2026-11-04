# Changelog

## 0.3.0

- Added native Ollama support using `GET /api/tags` and streaming `POST /api/chat` NDJSON.
- Added LM Studio support through its OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints.
- Added a Local OpenAI-compatible provider for vLLM, LocalAI, llama.cpp servers, Jan and similar runtimes.
- Added local model server URL presets and model discovery, with optional API-key authentication.
- Allowed HTTP only for localhost and private-network model servers; public endpoints still require HTTPS.
- Updated Agent Hub connection forms and setup guidance for local inference.
- Updated the single-model engine so local runtimes work without a fabricated API key.
- Added unit tests for local model discovery, streaming, keyless execution and endpoint security.


## 0.2.0

- Replaced sequential multi-agent Team mode with a single-model execution flow.
- Added a global Primary Model selector in the Chat toolbar.
- All chat modes and instruction profiles now use the same selected provider and model.
- Removed provider/model overrides from agent-profile configuration; legacy profile assignments are ignored at runtime.
- Added automatic migration of existing installations to a connected Primary Model without deleting saved profiles.
- Added a unified system instruction requiring the one model to handle planning, architecture, UI, implementation, debugging, testing and review end-to-end.

## 0.1.0

- Initial Infernum Code release with DeepSeek, Gemini, OpenAI, Anthropic and Custom API connections.
- Added Agent Hub, Agent Library, workspace context, Agent Mode file proposals and Liquid Glass UI.

