"""Strategy builders for rates IRD multi-leg structures."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class StrategyLeg:
    instrument: str
    notional: float
    leg_type: str
    index: str
    tenor: str
    spread: float
    direction: str
    daycount: str
    freq: int
    fixed_rate: float | None = None
    currency: str = "EUR"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _std_leg(
    *,
    instrument: str = "irs",
    notional: float,
    leg_type: str,
    index: str,
    tenor: str,
    spread: float = 0.0,
    direction: str,
    daycount: str = "ACT/360",
    freq: int = 2,
    fixed_rate: float | None = None,
    currency: str = "EUR",
) -> dict[str, Any]:
    return StrategyLeg(
        instrument=instrument,
        notional=float(notional),
        leg_type=leg_type,
        index=index,
        tenor=tenor,
        spread=float(spread),
        direction=direction,
        daycount=daycount,
        freq=int(freq),
        fixed_rate=float(fixed_rate) if fixed_rate is not None else None,
        currency=currency,
    ).to_dict()


def build_curve_trade(
    short_tenor: str,
    long_tenor: str,
    notional: float,
    belly_notional: float | None = None,
    index: str = "EURIBOR6M",
    daycount: str = "30/360",
    freq: int = 2,
    fixed_rate_short: float | None = None,
    fixed_rate_long: float | None = None,
) -> list[dict[str, Any]]:
    """2-leg curve trade (e.g. 2s10s, 5s30s): receive short and pay long."""
    long_notional = belly_notional if belly_notional is not None else notional
    return [
        _std_leg(
            instrument="irs",
            notional=notional,
            leg_type="fixed",
            index=index,
            tenor=short_tenor,
            spread=0.0,
            direction="receive",
            daycount=daycount,
            freq=freq,
            fixed_rate=fixed_rate_short,
        ),
        _std_leg(
            instrument="irs",
            notional=long_notional,
            leg_type="fixed",
            index=index,
            tenor=long_tenor,
            spread=0.0,
            direction="pay",
            daycount=daycount,
            freq=freq,
            fixed_rate=fixed_rate_long,
        ),
    ]


def build_fly_trade(
    wing_short_tenor: str,
    belly_tenor: str,
    wing_long_tenor: str,
    notional: float,
    index: str = "EURIBOR6M",
    daycount: str = "30/360",
    freq: int = 2,
) -> list[dict[str, Any]]:
    """3-leg butterfly (e.g. 2s5s10s): pay wings, receive double belly."""
    return [
        _std_leg(instrument="irs", notional=notional, leg_type="fixed", index=index, tenor=wing_short_tenor, direction="pay", daycount=daycount, freq=freq),
        _std_leg(instrument="irs", notional=2 * notional, leg_type="fixed", index=index, tenor=belly_tenor, direction="receive", daycount=daycount, freq=freq),
        _std_leg(instrument="irs", notional=notional, leg_type="fixed", index=index, tenor=wing_long_tenor, direction="pay", daycount=daycount, freq=freq),
    ]


def build_asw_trade(
    bond_tenor: str,
    swap_tenor: str,
    notional: float,
    bond_coupon: float,
    bond_yield: float,
    swap_fixed_rate: float,
    index: str = "EURIBOR6M",
) -> list[dict[str, Any]]:
    """Asset swap package: long bond + payer swap hedge."""
    return [
        _std_leg(
            instrument="bond",
            notional=notional,
            leg_type="fixed",
            index="BOND",
            tenor=bond_tenor,
            spread=0.0,
            direction="receive",
            daycount="30/360",
            freq=2,
            fixed_rate=bond_coupon,
        )
        | {"yield": float(bond_yield)},
        _std_leg(
            instrument="irs",
            notional=notional,
            leg_type="fixed",
            index=index,
            tenor=swap_tenor,
            spread=0.0,
            direction="pay",
            daycount="30/360",
            freq=2,
            fixed_rate=swap_fixed_rate,
        ),
    ]


def build_basis_trade(
    tenor: str,
    notional: float,
    pay_index: str,
    receive_index: str,
    pay_spread: float = 0.0,
    receive_spread: float = 0.0,
    pay_currency: str = "EUR",
    receive_currency: str = "EUR",
    freq: int = 4,
) -> list[dict[str, Any]]:
    """Float-vs-float basis leg pair."""
    return [
        _std_leg(
            instrument="basis_swap",
            notional=notional,
            leg_type="float",
            index=pay_index,
            tenor=tenor,
            spread=pay_spread,
            direction="pay",
            daycount="ACT/360",
            freq=freq,
            currency=pay_currency,
        ),
        _std_leg(
            instrument="basis_swap",
            notional=notional,
            leg_type="float",
            index=receive_index,
            tenor=tenor,
            spread=receive_spread,
            direction="receive",
            daycount="ACT/360",
            freq=freq,
            currency=receive_currency,
        ),
    ]
