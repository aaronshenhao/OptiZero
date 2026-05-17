from typing import Annotated

from pydantic import BaseModel, Field, field_validator


NonNegativeFloat = Annotated[float, Field(ge=0)]


class BaseScenarioPolicy(BaseModel):
    max_overtime_pct: Annotated[float, Field(ge=0, le=20)] = 0
    facility_capacity_multipliers: dict[str, Annotated[float, Field(ge=0, le=2)]] = Field(
        default_factory=dict
    )
    demand_multiplier: Annotated[float, Field(gt=0, le=2)] = 1
    carbon_penalty_usd_per_kg: NonNegativeFloat | None = None
    unmet_demand_penalty_usd_per_unit: NonNegativeFloat | None = None

    @field_validator("facility_capacity_multipliers")
    @classmethod
    def validate_facility_ids(cls, multipliers: dict[str, float]) -> dict[str, float]:
        for facility_id in multipliers:
            if not facility_id.startswith("factory_"):
                raise ValueError("facility_capacity_multipliers keys must be facility ids")
        return multipliers


class ScenarioPolicy(BaseScenarioPolicy):
    carbon_cap_kg: NonNegativeFloat | None = None


class ParetoScenarioPolicy(BaseScenarioPolicy):
    pass


class SolveRequest(BaseModel):
    dataset_id: str
    scenario: ScenarioPolicy


class ExplainRequest(BaseModel):
    dataset_id: str
    scenario: ScenarioPolicy


class ParetoRequest(BaseModel):
    dataset_id: str
    scenario: ParetoScenarioPolicy
    carbon_cap_kg_points: list[NonNegativeFloat] = Field(min_length=1, max_length=50)
