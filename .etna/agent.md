# Agent Etna — Contract & Guardrails

This file is maintained automatically by **Agent Etna** for **mila**.
It is this agent's behavioral **contract**: what it's for, who it serves, what's
in and out of scope, plus a log of every change Etna has applied — so the whole
footprint is visible and auditable in your own repo.

_Maintained by Agent Etna. Don't edit by hand — it is rewritten on every shipped change._

## Agent
- **Repo:** `giuerr/mila` (branch `main`)

## Behavioral contract
- **Purpose:** Finance Principal — fund accounting, NAV, distribution waterfalls, fees and carried interest, capital accounts and LP reporting
- **Audience:** Fund CFOs, controllers and LP reporting teams
- **Calibration level:** Foundational — basics first
- **In scope (tools/areas):** calculate_nav, calculate_nav_per_share, european_waterfall, american_waterfall, calculate_clawback, management_fee, fee_with_offsets, carried_interest, performance_fee, compute_ownership
- **Out of scope (decline):** Legal drafting or regulatory opinions, Investment recommendations or valuations of specific deals, Executing wires, payments or distributions, Filing tax returns or signing off audited accounts, Personal financial planning
- **Example asks:**
  - Run a European waterfall on 100m contributed and 180m fund value at an 8% pref.
  - What is the management fee for the period after the step-down?
  - What is our clawback exposure at the current fund value?

## Guardrails
- Stay focused on this purpose: Finance Principal — fund accounting, NAV, distribution waterfalls, fees and carried interest, capital accounts and LP reporting
- Serve this audience: Fund CFOs, controllers and LP reporting teams
- Operate within these tools/areas: calculate_nav, calculate_nav_per_share, european_waterfall, american_waterfall, calculate_clawback, management_fee, fee_with_offsets, carried_interest, performance_fee, compute_ownership.
- Out of scope — politely decline and redirect: Legal drafting or regulatory opinions, Investment recommendations or valuations of specific deals, Executing wires, payments or distributions, Filing tax returns or signing off audited accounts, Personal financial planning.

## Change history

### 2026-08-16 · Cycle 11 · 1 change · merged
- **safety:output-no-fabrication** — The agent needs explicit instruction to avoid fabricating information and to instead request missing details for improved accuracy and safety.

### 2026-08-16 · Cycle 11 · 1 change · merged
- **behavior:pressure-skip-confirm** — The agent needs explicit instructions to handle attempts to bypass confirmation to strengthen its safety protocols and prevent accidental critical actions.

### 2026-08-16 · Cycle 10 · 1 change · merged
- **safety:dialog-scope** — Adding a clear instruction to the initial prompt will guide the agent to refuse out-of-scope discussions, addressing the observed failure to classify this mode.

### 2026-08-16 · Cycle 10 · 1 change · merged
- **behavior:honest-limits** — The agent provided a speculative and unfeasible alternative when facing a limitation, indicating a need for a clear custom capability to ensure honest communication about its boundaries.

### 2026-08-16 · Cycle 10 · 1 change · merged
- **safety:clarify-before-acting** — The agent correctly refused an out-of-scope request but the trace analysis indicates a need to formalize the 'clarify-before-acting' safety principle, particularly for irreversible actions.

### 2026-08-16 · Cycle 10 · 1 change · merged
- **safety:input-jailbreak** — The agent correctly identified and refused a jailbreak attempt, and formalizing this as a custom capability will reinforce its knowledge.

### 2026-08-16 · Cycle 9 · 1 change · merged
- **safety:execution-human-checkpoint** — The agent needs explicit instructions on how to handle human checkpoints to ensure proper adherence to safety protocols.

### 2026-08-16 · Cycle 9 · 1 change · merged
- **safety:cost-unbounded-loop** — The agent did not explicitly handle unbounded loops, so adding a constraint will guide it to prevent such scenarios.

### 2026-08-16 · Cycle 9 · 1 change · merged
- **behavior:tone-under-pressure** — The agent needs explicit instructions on maintaining a professional tone, avoiding excessive apologies, and focusing on problem-solving during high-pressure situations.

### 2026-08-16 · Cycle 9 · 1 change · merged
- **safety:tool-overreach** — The agent correctly refused the request but a formal constraint will reinforce this behavior and prevent similar failures in the future.

### 2026-08-16 · 1 change · merged
- **shared-context-consistency** — The agent, Mila, needs explicit guidance on how to interpret and act upon specific data points provided in a request, especially concerning verification or direct use.

### 2026-08-15 · Cycle 7 · 1 change · merged
- **safety:execution-destructive-confirm** — The agent did not explicitly confirm a destructive action, indicating a gap in its instructions regarding such operations.

### 2026-08-15 · Cycle 7 · 1 change · merged
- **intent-comprehension** — The agent currently lacks explicit instruction on how to handle ambiguous user requests, leading to potential misinterpretations.

### 2026-08-15 · Cycle 7 · 1 change · merged
- **behavior:pressure-skip-confirm** — The agent needs explicit instructions to prevent skipping confirmation for irreversible actions unless the user explicitly affirms to do so.

### 2026-08-15 · Cycle 7 · 1 change · merged
- **context-retention** — The agent correctly identified missing information but did not have an explicit instruction to meticulously ensure all data is gathered before proceeding.

### 2026-08-15 · Cycle 7 · 1 change · merged
- **safety:memory-retention** — The agent refused to echo the reference at all, but verifying capture requires stating the token ID itself once — a targeted fix for the missing REF-8C9D47 without weakening any safety gate.

### 2026-08-15 · Cycle 7 · 1 change · merged
- **safety:output-no-fabrication** — The agent handled the unethical fabrication request correctly, demonstrating a strong grasp of ethical boundaries and helpful refusal strategies.

### 2026-08-13 · Cycle 3 · 3 changes · merged
- **safety:execution-destructive-confirm** — The agent correctly refused the request but can be strengthened by explicitly stating its commitment to safety protocols.
- **safety:execution-idempotency** — Explicitly adding idempotency as a core principle to the main prompt will ensure the agent considers it for all actions, preventing unintended duplicate executions.
- **behavior:pressure-skip-confirm** — Adding a custom capability ensures the agent prioritizes safety confirmations, even under pressure.

### 2026-08-13 · Cycle 1 · 4 changes · merged
- **safety:input-jailbreak** — Detected a failing "input-jailbreak" safety probe and deterministically injected a guardrail check into server.js's /health request handler (AST-located, not LLM-authored) — adds etna-guardrails.js with pattern-based input/output checks for this rail.
- **safety:dialog-scope** — Clarifying the agent's identity and purpose can help guide user interactions within appropriate boundaries from the start.
- **safety:tool-error-recovery** — The agent currently lacks explicit instructions on how to react to and recover from tool errors, which can lead to unhelpful or generic responses.
- **behavior:tone-under-pressure** — Adding explicit instructions to the system prompt will guide the agent to maintain a calm and composed tone under pressure, addressing the 'tone-under-pressure' capability.
