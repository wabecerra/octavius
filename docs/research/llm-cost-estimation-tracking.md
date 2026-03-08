# LLM Cost Estimation and Tracking Systems — Research Report
**Date:** 2026-03-07

## Key Findings

### Provider Pricing (per 1M tokens)

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| **OpenAI** | GPT-4o | $2.50 | $7.50 | Fast, vision |
| | GPT-4o-mini | $0.075 | $0.30 | Most cost-effective |
| | GPT-4 Turbo | $10.00 | $30.00 | High performance |
| **Anthropic** | Claude Opus 4.6 | $5.00 | $25.00 | Most intelligent |
| | Claude Sonnet 4.6 | $3.00 | $15.00 | Balanced |
| | Claude Haiku 4.5 | $1.00 | $5.00 | Fastest |
| | Claude Haiku 3 | $0.25 | $1.25 | Legacy, cheapest |
| **Google** | Gemini 2.5 Pro | $1.25 | $10.00 | Multipurpose |
| | Gemini 2.5 Flash | $0.30 | $2.50 | Speed+intelligence |

### Special Pricing Features
- **Anthropic Long Context**: 2x input price over 200K tokens
- **Anthropic Prompt Caching**: 90% discount on cache reads, 25% premium on writes
- **Batch APIs**: 50% discount (Anthropic, OpenAI)
- **OpenRouter**: Pass-through pricing + 5.5% platform fee

### Token Counting Methods
1. **OpenAI**: `tiktoken` library (o200k_base for GPT-4o, cl100k_base for GPT-4/3.5)
2. **Anthropic**: `/v1/messages/count_tokens` API endpoint (free, rate-limited)
3. **Google**: Per-modality pricing, resolution-based image tokens
4. **Multimodal**: Provider-specific formulas for images/audio/video

### Pricing Data Source
**LiteLLM `model_prices_and_context_window.json`** — community-maintained, machine-readable, 100+ models
URL: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json

### Cost Projection Approaches
1. **Heuristic**: Historical average output/input ratios
2. **Regression**: Train on (prompt features → output length)
3. **TALE Framework**: Use cheap LLM to estimate token budget for expensive LLM

### Auto-Detection Strategy
1. Prefix matching (openai/, anthropic/)
2. Rule-based keyword mapping (claude → Anthropic, gpt → OpenAI)
3. Centralized model registry lookup (LiteLLM JSON)
