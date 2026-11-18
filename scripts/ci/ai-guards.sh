#!/usr/bin/env bash
# AI architecture guards (docs/AGENT_DESIGN.md §5, AGENTS.md §1.2 and §3.9). Fails CI on violation.
set -euo pipefail
fail=0

# 1. Only the proposal-decision service may reference the decision RPCs (EVALUATION A23).
if grep -rnE "decide_proposal|approve_task" src/ | grep -v "^src/lib/services/proposals/decide.ts:"; then
  echo "::error::Decision RPCs may only be referenced from src/lib/services/proposals/decide.ts" >&2; fail=1
fi

# 2. Vendor AI SDKs only inside provider adapters.
if grep -rnE "from ['\"](openai|@anthropic-ai/[^'\"]+|@google/genai|@google/generative-ai|@ai-sdk/[^'\"]+|ai|@mistralai/[^'\"]+|cohere-ai|ollama)['\"]" src/ | grep -v "^src/lib/ai/providers/"; then
  echo "::error::AI vendor SDKs may only be imported under src/lib/ai/providers/" >&2; fail=1
fi

# 3. The scripted test provider is never part of the application.
if grep -rnE "scripted-provider|ScriptedProvider" src/; then
  echo "::error::The scripted test provider must not be imported from src/" >&2; fail=1
fi

exit $fail
