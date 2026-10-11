"""What a product's price history says about an advertised MRP.

The test is the regulator's: is the reference price one the product actually
sold at? A discount quoted off an MRP it never sold at, across enough history,
is misleading however long ago that MRP was set; a recent raise is quoted as
supporting evidence, not required.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime


@dataclass(frozen=True)
class PricePoint:
    day: date
    low: float  # lowest selling price seen that day
    high: float  # highest selling price seen that day
    mrp: float | None


@dataclass(frozen=True)
class History:
    key: str
    currency: str
    points: list[PricePoint]  # one per day, oldest first


# How much history the MRP rule needs, and how far the advertised discount must exceed the real one.
MIN_WEEKS = 8
MIN_GAP_POINTS = 10


@dataclass(frozen=True)
class PriceFacts:
    weeks: int
    lowest_sold: float
    highest_sold: float
    ever_sold_at_mrp: bool
    advertised_discount: int  # % off the advertised MRP
    real_discount: int  # % off the highest price it really sold at
    prior_mrp: float | None  # the MRP before the current one, if it changed
    mrp_changed_days_ago: int | None
    since: date  # the first day of history

    @property
    def enough_history(self) -> bool:
        return self.weeks >= MIN_WEEKS

    @property
    def misleading(self) -> bool:
        return (
            self.enough_history and not self.ever_sold_at_mrp and self.advertised_discount - self.real_discount >= MIN_GAP_POINTS
        )


def price_facts(price: float, mrp: float, history: History, today: date | None = None) -> PriceFacts:
    points = history.points
    today = today or datetime.now(UTC).date()
    highest = max(p.high for p in points)
    changed_on, prior = None, None
    for earlier, later in zip(reversed(points[:-1]), reversed(points[1:]), strict=True):
        if earlier.mrp is not None and later.mrp == mrp and earlier.mrp != mrp:
            changed_on, prior = later.day, earlier.mrp
            break
        if later.mrp != mrp:
            break
    return PriceFacts(
        weeks=(points[-1].day - points[0].day).days // 7,
        lowest_sold=min(p.low for p in points),
        highest_sold=highest,
        ever_sold_at_mrp=any(p.high >= mrp - 0.5 for p in points),
        advertised_discount=int((1 - price / mrp) * 100),
        real_discount=max(0, int((1 - price / highest) * 100)),
        prior_mrp=prior,
        mrp_changed_days_ago=(today - changed_on).days if changed_on else None,
        since=points[0].day,
    )
