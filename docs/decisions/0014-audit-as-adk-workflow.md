# 0014. The live audit runs as an ADK agent graph, with an Adjudicator that checks evidence through tools

**Status:** Accepted · 2026-10-15 (on by default; `AGENT_GRAPH=false` switches it off)

## Context
Until now each model call built its own one-agent ADK `LlmAgent` and runner (`models/call.py`), and plain Python passed outputs from one agent to the next. It worked and it was honest, but nothing in it used what ADK is for: a graph the framework runs, and agents that decide to call tools. The Adjudicator could only score the crop it was handed.

ADK 2.11, the version we run, deprecates `SequentialAgent`, `LoopAgent` and `ParallelAgent` in favour of `Workflow`: a graph of nodes with routed edges, where function nodes and LLM agents run side by side.

## Decision
- **Two `Workflow` graphs.**
  - **`audit`** (`runner/audit_graph.py`), one run per live audit: navigate → collect reviews → summarise → report.
  - **`screen_review`** (`agents/review_graph.py`), one session per screen the journey hands for review: prepare → analyse → ground → adjudicate. Routes skip the rest when there's nothing to judge, the analyst finds nothing, or the evidence rules drop every claim.
- **The Navigator stays code, inside a node.** Scripted journeys and the click guard are what keep the demo stores at 9/9 and the agent from ever paying or signing in. A model only picks a control when wording fails, as before (ADR-0013).
- **The agents run as child nodes (`ctx.run_node`).** That way they receive their input exactly as before, screenshot included. An LLM agent wired straight to an edge gets the previous node's output as a quoted transcript, without the image.
- **The Adjudicator runs the one check that settles the claim before it rules** (`agents/tools.py`):

  | Claim | Check | What it does |
  |---|---|---|
  | Interface interference | `measure_elements` | Size, font and colour of the cited options, and how many times larger one is than another |
  | False urgency on the product page | `compare_reloads` | Did the figure change between the first look and the look after a reload? |
  | Nagging | `find_on_other_screens` | Did the same popup interrupt the shopper on other screens? |

  Claims about wording (confirm shaming, trick questions) get no tool. No measurement adds to what the crop and the facts already show, and every tool call costs another model turn: giving every claim a tool cost 57% more input tokens on Store A. The checks read what was already captured, never the live page, because reviews run in the background while the browser moves on. Each call is narrated in the agent log with a tool chip, and capped at `ADJUDICATOR_MAX_TOOL_CALLS` per claim (2).
- **Budgets move into the model.** `MeteredLlm` (`models/metered.py`) counts every call an agent makes against the audit's call and token budgets, holds the concurrency limit and applies the time limit. It's the same accounting `ModelCaller.ask` did around a single call.
- **Same judgement, same failures.** The steps around the models are shared with the old path: grounding, the evidence rules, `decide()`, the closing line and the report. A node that fails stores its error, and the runner raises it after the graph ends, so failures read exactly as before. Cancellation passes straight through. ADK logs a failed node at ERROR, and every ERROR log raises an alert, so its node runner is kept quiet; failures we handle are logged as warnings, as before.

## Consequences
- **Measured on `gemini-3.6-flash`, 2 runs per store:** Store A 9/9, Store B 0 false alarms, Store C 6/6. Alternating audits with and without the graph, Store A took 26.9 s with it and 28.6 s without, and used 21.0k input tokens against 17.2k (+22%).
- The old path stays, and `AGENT_GRAPH=false` switches back to it. Tests run both paths (parity on the demo-store fixtures, and live audits in a real browser).
- One more model turn per claim that has a check. On Store A that's the interface-interference claims.
- Local models without native schema-plus-tools support answer through ADK's `set_model_response` tool. Gemma 3 4B is weaker at that, so local development may prefer `AGENT_GRAPH=false`.
- F3's Fixer joins the `audit` graph as a node between summarise and report, without touching the runner.
