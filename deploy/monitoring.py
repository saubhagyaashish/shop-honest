"""Alerts for the backend, through the Cloud Monitoring API (safe to re-run).

    uv run --project backend python deploy/monitoring.py setup        # email channel + always-on alerts
    uv run --project backend python deploy/monitoring.py uptime on    # judging days: probe /api/health every 5 min
    uv run --project backend python deploy/monitoring.py uptime off

Always on, free while nothing goes wrong: an alert on any ERROR log from the
service, and on 5xx responses. The uptime probe is only for judging days: it
wakes the service every few minutes, which with CPU always allocated would
keep an instance running (about $3 a day). On judging days min-instances=1
keeps one warm anyway, so the probe costs nothing extra then.

Alerts go to ALERT_EMAIL, or the active gcloud account.
"""

import os
import subprocess
import sys

import httpx

PROJECT = "shop-honest-72fd8"
SERVICE = "shop-honest-api"
HOST = "shop-honest-api-384726360574.asia-south1.run.app"
API = f"https://monitoring.googleapis.com/v3/projects/{PROJECT}"
GCLOUD = os.environ.get("GCLOUD", os.path.expanduser("~/google-cloud-sdk/bin/gcloud"))

CHANNEL = "Shop Honest alerts"
ERRORS = "Shop Honest API: errors logged"
SERVER_ERRORS = "Shop Honest API: 5xx responses"
UPTIME = "Shop Honest API: /api/health"
UPTIME_ALERT = "Shop Honest API: health check failing"


def gcloud(*args: str) -> str:
    return subprocess.run([GCLOUD, *args], check=True, capture_output=True, text=True).stdout.strip()


def client() -> httpx.Client:
    token = gcloud("auth", "print-access-token")
    return httpx.Client(headers={"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT}, timeout=60)


def find(c: httpx.Client, kind: str, field: str, name: str) -> dict | None:
    r = c.get(f"{API}/{kind}", params={"pageSize": 200})
    r.raise_for_status()
    return next((item for item in r.json().get(field, []) if item.get("displayName") == name), None)


def ensure(c: httpx.Client, kind: str, field: str, body: dict) -> dict:
    """Create the resource unless one with the same display name exists (then update it)."""
    existing = find(c, kind, field, body["displayName"])
    if existing:
        r = c.patch(f"https://monitoring.googleapis.com/v3/{existing['name']}", json=body)
        verb = "updated"
    else:
        r = c.post(f"{API}/{kind}", json=body)
        verb = "created"
    if r.status_code >= 400:
        sys.exit(f"{kind}: {r.status_code} {r.text[:400]}")
    print(f"  {verb}: {body['displayName']}")
    return r.json()


def channel(c: httpx.Client) -> str:
    email = os.environ.get("ALERT_EMAIL") or gcloud("config", "get-value", "account")
    body = {"type": "email", "displayName": CHANNEL, "labels": {"email_address": email}}
    return ensure(c, "notificationChannels", "notificationChannels", body)["name"]


def policy(name: str, condition: dict, channel_name: str, *, rate_limit_s: int | None = None) -> dict:
    body = {
        "displayName": name,
        "combiner": "OR",
        "conditions": [condition],
        "notificationChannels": [channel_name],
        "alertStrategy": {"autoClose": "1800s"},
        "documentation": {
            "content": "Shop Honest backend on Cloud Run. Logs: Cloud Run → shop-honest-api → Logs. Rollback: "
            "gcloud run services update-traffic shop-honest-api --region asia-south1 --to-revisions REVISION=100",
            "mimeType": "text/markdown",
        },
    }
    if rate_limit_s:
        body["alertStrategy"]["notificationRateLimit"] = {"period": f"{rate_limit_s}s"}
    return body


def setup() -> None:
    with client() as c:
        print("Notification channel")
        ch = channel(c)
        print("Always-on alerts")
        logs = f'resource.type="cloud_run_revision" AND resource.labels.service_name="{SERVICE}" AND severity>=ERROR'
        ensure(
            c,
            "alertPolicies",
            "alertPolicies",
            policy(ERRORS, {"displayName": "ERROR logged", "conditionMatchedLog": {"filter": logs}}, ch, rate_limit_s=3600),
        )
        five_xx = {
            "displayName": "More than 3 server errors in 5 minutes",
            "conditionThreshold": {
                "filter": f'resource.type="cloud_run_revision" AND resource.labels.service_name="{SERVICE}" '
                'AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"',
                "aggregations": [
                    {"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM"}
                ],
                "comparison": "COMPARISON_GT",
                "thresholdValue": 3,
                "duration": "0s",
            },
        }
        ensure(c, "alertPolicies", "alertPolicies", policy(SERVER_ERRORS, five_xx, ch))


def uptime(state: str) -> None:
    with client() as c:
        check = find(c, "uptimeCheckConfigs", "uptimeCheckConfigs", UPTIME)
        alert = find(c, "alertPolicies", "alertPolicies", UPTIME_ALERT)
        if state == "off":
            for item in (alert, check):
                if item:
                    c.delete(f"https://monitoring.googleapis.com/v3/{item['name']}").raise_for_status()
                    print(f"  deleted: {item['displayName']}")
            return
        ch = channel(c)
        body = {
            "displayName": UPTIME,
            "monitoredResource": {"type": "uptime_url", "labels": {"project_id": PROJECT, "host": HOST}},
            "httpCheck": {"path": "/api/health", "port": 443, "useSsl": True, "validateSsl": True},
            "contentMatchers": [{"content": '"ok":true', "matcher": "CONTAINS_STRING"}],
            "period": "300s",
            "timeout": "10s",
        }
        created = check or ensure(c, "uptimeCheckConfigs", "uptimeCheckConfigs", body)
        check_id = created["name"].split("/")[-1]
        failing = {
            "displayName": "Health check failing from 2+ regions",
            "conditionThreshold": {
                "filter": f'metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url" '
                f'AND metric.labels.check_id="{check_id}"',
                "aggregations": [
                    {
                        "alignmentPeriod": "600s",
                        "perSeriesAligner": "ALIGN_NEXT_OLDER",
                        "crossSeriesReducer": "REDUCE_COUNT_FALSE",
                        "groupByFields": ["resource.label.*"],
                    }
                ],
                "comparison": "COMPARISON_GT",
                "thresholdValue": 1,
                "duration": "600s",
            },
        }
        ensure(c, "alertPolicies", "alertPolicies", policy(UPTIME_ALERT, failing, ch))


if __name__ == "__main__":
    match sys.argv[1:]:
        case ["setup"]:
            setup()
        case ["uptime", ("on" | "off") as state]:
            uptime(state)
        case _:
            sys.exit(__doc__)
