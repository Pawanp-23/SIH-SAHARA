"""Request bodies (validated by Pydantic). Responses are plain dicts built by services."""
from typing import Literal

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)


class ConsentIn(BaseModel):
    modality: Literal["checkin", "readiness", "camera_ppg", "wearable", "hrms_prediction"]
    granted: bool


class CheckInIn(BaseModel):
    energy: int = Field(ge=1, le=5)
    sleep_quality: int = Field(ge=1, le=5)
    workload_feel: int = Field(ge=1, le=5)
    who5_items: list[int] | None = Field(default=None, min_length=5, max_length=5, description="Five WHO-5 items, 0-5 each")
    burnout_items: list[int] | None = Field(default=None, min_length=4, max_length=4, description="Four CBI-based items, 0-4 each")
    urgent_support: bool = False


class ReadinessIn(BaseModel):
    """Summary features computed on the phone. Raw taps and camera frames never leave the device."""
    rt_median_ms: float = Field(ge=100, le=2000)
    lapses: int = Field(ge=0, le=100)
    false_starts: int = Field(ge=0, le=100)
    trials: int = Field(ge=5, le=500)
    hr_bpm: float | None = Field(default=None, ge=30, le=220)
    hrv_ms: float | None = Field(default=None, ge=5, le=300)
    signal_quality: float = Field(default=0.9, ge=0, le=1)


class CrisisIn(BaseModel):
    trigger: Literal["help_button", "urgent_item", "keyword_on_device"] = "help_button"


class WelfareNeedIn(BaseModel):
    category: Literal["family_medical", "housing", "finance", "child_education", "leave", "transfer", "allowance"]
    description: str = Field(default="", max_length=500)


class CaseActionIn(BaseModel):
    action_type: Literal["offer_support", "counselling_referral", "roster_review", "recovery_window",
                         "resolve_need", "monitor", "close"]
    rationale: str = Field(min_length=3, max_length=1000)
    followup_days: int = Field(default=7, ge=1, le=60)


class RevealIn(BaseModel):
    justification: str = Field(min_length=10, max_length=500)
    approver: str = Field(min_length=3, max_length=60)


class RosterIn(BaseModel):
    company: str = Field(min_length=3, max_length=20)
