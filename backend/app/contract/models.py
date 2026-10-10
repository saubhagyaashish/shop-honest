"""Pydantic mirror of web/src/shared/contract.ts, the source of truth (ADR-0006).

Field names stay camelCase to match the JSON on the wire exactly. Optional
fields are omitted when empty: serialise with `dump()` below, never with
plain model_dump(), so no `null`s leak into events.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

PatternId = Literal[
    "false_urgency",
    "basket_sneaking",
    "confirm_shaming",
    "forced_action",
    "subscription_trap",
    "interface_interference",
    "bait_and_switch",
    "drip_pricing",
    "disguised_advertisement",
    "nagging",
    "trick_question",
    "saas_billing",
    "rogue_malware",
    "misleading_price",
]
JourneyStep = Literal["product", "variant", "cart", "checkout", "payment"]
JOURNEY_STEPS: tuple[JourneyStep, ...] = ("product", "variant", "cart", "checkout", "payment")
AgentName = Literal["navigator", "pattern_analyst", "evidence", "price_historian", "seller_trust", "adjudicator", "reporter"]
Severity = Literal["high", "medium", "low"]
FindingStatus = Literal["confirmed", "needs_review"]
StepStatus = Literal["audited", "blocked"]
JurisdictionCode = Literal["IN", "SG", "GB", "EU", "US", "KR", "AU"]
CurrencyCode = Literal["INR", "SGD", "GBP", "EUR", "USD", "KRW", "AUD"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BBox(Model):
    x: float
    y: float
    w: float
    h: float


class EvidenceFrame(Model):
    screenshotUrl: str
    caption: str
    bbox: BBox | None = None


class Evidence(Model):
    frames: list[EvidenceFrame]
    elementText: str | None = None
    observations: list[str]


class RuleCitation(Model):
    source: str
    clause: str
    verified: bool | None = None


class Money(Model):
    amount: float
    currency: CurrencyCode


class PriceDriftLine(Model):
    label: str
    amount: Money
    kind: Literal["sneaked_item", "subscription", "fee", "upgrade"]
    firstSeen: JourneyStep
    recurring: Literal["monthly", "yearly"] | None = None
    findingId: str | None = None


class PriceDrift(Model):
    advertised: Money
    payable: Money
    lines: list[PriceDriftLine]
    claimedSaving: Money | None = None
    genuineSaving: Money | None = None
    savingFindingId: str | None = None


class Precedent(Model):
    id: str
    jurisdiction: JurisdictionCode
    company: str
    regulator: str
    date: str
    outcome: str
    amount: Money | None = None
    patternIds: list[PatternId]
    summary: str
    sourceUrl: str
    confidence: Literal["official", "reported"]


class UpcomingLaw(Model):
    law: str
    effectiveFrom: str
    summary: str


class JurisdictionExposure(Model):
    code: JurisdictionCode
    name: str
    law: str
    regulator: str
    status: Literal["in_force", "coming"]
    maxPenalty: str
    penaltyHeadline: str
    upcoming: UpcomingLaw | None = None
    citations: dict[str, RuleCitation]
    precedents: list[Precedent]


class Exposure(Model):
    priceDrift: PriceDrift
    jurisdictions: list[JurisdictionExposure]
    strictest: JurisdictionCode | None = None
    disclaimer: str


class Finding(Model):
    id: str
    patternId: PatternId
    title: str
    explanation: str
    severity: Severity
    confidence: float
    status: FindingStatus
    step: JourneyStep
    pageUrl: str
    rule: RuleCitation
    detectedBy: AgentName
    evidence: Evidence
    remediation: str


class StepCapture(Model):
    step: JourneyStep
    url: str
    screenshotUrl: str | None = None
    status: StepStatus | None = None
    blockedReason: str | None = None


class AuditReport(Model):
    auditId: str
    targetUrl: str
    startedAt: str
    completedAt: str
    trustScore: float
    steps: list[StepCapture]
    findings: list[Finding]
    summary: str
    exposure: Exposure | None = None


# Events (the discriminated union AuditEvent)


class AuditStarted(Model):
    type: Literal["audit.started"] = "audit.started"
    auditId: str
    targetUrl: str
    startedAt: str


class StepStarted(Model):
    type: Literal["step.started"] = "step.started"
    step: JourneyStep
    url: str


class StepCaptured(Model):
    type: Literal["step.captured"] = "step.captured"
    step: JourneyStep
    url: str
    screenshotUrl: str


class StepBlocked(Model):
    type: Literal["step.blocked"] = "step.blocked"
    step: JourneyStep
    url: str
    reason: str
    screenshotUrl: str | None = None


class AgentLog(Model):
    type: Literal["agent.log"] = "agent.log"
    agent: AgentName
    message: str


class PriceObserved(Model):
    type: Literal["price.observed"] = "price.observed"
    step: JourneyStep
    label: str
    total: Money


class FindingEvent(Model):
    type: Literal["finding"] = "finding"
    finding: Finding


class AuditCompleted(Model):
    type: Literal["audit.completed"] = "audit.completed"
    report: AuditReport


class AuditFailed(Model):
    type: Literal["audit.failed"] = "audit.failed"
    error: str


AuditEvent = Annotated[
    AuditStarted
    | StepStarted
    | StepCaptured
    | StepBlocked
    | AgentLog
    | PriceObserved
    | FindingEvent
    | AuditCompleted
    | AuditFailed,
    Field(discriminator="type"),
]
AUDIT_EVENT = TypeAdapter(AuditEvent)
TERMINAL_EVENTS = frozenset({"audit.completed", "audit.failed"})


def dump(model: BaseModel) -> dict[str, Any]:
    """JSON-ready dict with empty optional fields left out, as the TypeScript contract expects."""
    return model.model_dump(mode="json", exclude_none=True)


# API request / response bodies (docs/API.md)

AuditMode = Literal["replay", "live"]
AuditStatus = Literal["queued", "running", "completed", "failed"]


class CreateAuditRequest(Model):
    targetUrl: str
    mode: Literal["auto", "replay", "live"] = "auto"


class CreateAuditResponse(Model):
    auditId: str
    mode: AuditMode
    eventsUrl: str


class AuditStatusResponse(Model):
    auditId: str
    status: AuditStatus
    mode: AuditMode
    targetUrl: str
    createdAt: str
    report: AuditReport | None = None
    error: str | None = None
