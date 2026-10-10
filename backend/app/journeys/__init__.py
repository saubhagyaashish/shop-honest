"""Journeys: how the Navigator walks a particular kind of store.

Each journey knows one site family's controls (where "add to cart" is, how to
reach checkout); what it *sees* comes from the generic signals.js. General
navigation for any store is Phase 5; until then sites without a journey get
409 no_navigator.
"""

from typing import TYPE_CHECKING, Protocol

from app.journeys.bazaarnest import BazaarNestJourney

if TYPE_CHECKING:
    from app.runner.walk import Walk


class Journey(Protocol):
    name: str

    def matches(self, url: str) -> bool: ...

    async def walk(self, walk: "Walk") -> None: ...


JOURNEYS: list[Journey] = [BazaarNestJourney()]


def journey_for(url: str) -> Journey | None:
    return next((j for j in JOURNEYS if j.matches(url)), None)
