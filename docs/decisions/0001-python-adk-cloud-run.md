# 0001. Python + Google ADK on one Cloud Run service

**Status:** Accepted · 2026-10-10

## Context
The backend has to drive a real browser, call Gemini from several cooperating agents, and stream results for one to two minutes per audit. The hackathon rewards real use of Google Cloud, and we have days, not weeks.

## Decision
- **Python 3.12** with **Google's Agent Development Kit (ADK)** for the agents. ADK's Python SDK is its most complete, and Playwright, the Google Cloud clients and the evaluation tooling are all first-class in Python.
- **FastAPI** for the HTTP API and the event stream.
- **One Cloud Run service** runs the API, the audit runner and **Playwright Chromium** in the same container (official Playwright Python base image), with CPU always allocated so audits keep running after the POST returns.

## Consequences
- Simple to build, deploy and debug: one image, one service, one log stream.
- The image is heavy (about 1.5 GB) and cold starts are slow, so we use `min-instances=1` only on judging days.
- A long audit occupies an instance, so concurrency is kept low (2 per instance) and Cloud Run scales out.
- If audits ever need stronger isolation or longer runtimes, the runner can move to a **Cloud Run Job per audit** without changing the API or the event format.
