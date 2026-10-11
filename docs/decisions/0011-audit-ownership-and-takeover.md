# 0011. Audits have an owner with a heartbeat; other instances can take over

**Status:** Accepted · 2026-10-11

## Context
On Cloud Run the backend can run on several instances that share Firestore. An audit runs as a background task on the instance that received "start", but the viewer's requests can land on any instance. Before this, two things only worked if they reached the right instance:
- **"Skip to report"** was a signal held in one instance's memory.
- **A crashed or scaled-in instance** left its audit "running" until an 8-minute safety net closed it.

## Decision
- **Every audit has an owner, which writes a heartbeat.** The owner is the instance running it, and the heartbeat goes on the audit's record every `HEARTBEAT_S` (10 s).
- **A quiet audit gets taken over.** When a request, or a stream that has gone quiet, finds an audit whose owner hasn't heartbeated for `ABANDONED_AFTER_S` (45 s), that instance claims it in a Firestore transaction, so only one instance can win.
  - **A replay continues from the event after the last stored one.** Recordings are deterministic, so the viewer sees one unbroken stream.
  - **A live audit is closed as failed.** A dead browser can't be resumed.
- **An owner that lost its audit stops without writing.** If a stalled owner wakes up, its next heartbeat finds another owner and it stops silently. Event writes use create-only documents, so even a late write can't overwrite the new owner's events.
- **Skip is a flag on the audit's record.** The owner checks it about once a second while waiting between events, so a skip sent to any instance works.
- **The cap on live browsers stays per instance,** on purpose: it protects each instance's memory.

## Consequences
- **Skip works from any instance:** a replay finishes within a few seconds of the click.
- **A crashed instance's replay resumes elsewhere** within about a minute, and a crashed live audit fails within about a minute instead of 8. Tested with two server processes on Firestore, one killed with SIGKILL mid-replay.
- **Small extra Firestore cost:** a heartbeat every 10 s per running audit, plus about one read a second during replay pauses. Both are well within the free daily allowance at hackathon scale.
