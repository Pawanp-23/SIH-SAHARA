"""ORM models for workflow data.

Analytics tables (personnel, daily, features, scores, forecast) are written by the seed
pipeline with pandas and read with SQL; they hold pseudonymous IDs only. Real identities
live in `identity_vault`, which only the break-glass flow can read.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .core.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class IdentityVault(Base):
    __tablename__ = "identity_vault"
    person_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))       # synthetic name
    service_no: Mapped[str] = mapped_column(String(20))


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[str] = mapped_column(String(10), index=True)
    modality: Mapped[str] = mapped_column(String(30))            # checkin | readiness | camera_ppg | wearable | hrms_prediction
    granted: Mapped[bool] = mapped_column(Boolean)
    version: Mapped[str] = mapped_column(String(10), default="1.0")
    receipt_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tier: Mapped[str] = mapped_column(String(4))                 # T0 crisis, T1 high, T2 moderate, T3 evidence request, UH unit hotspot
    person_id: Mapped[str | None] = mapped_column(String(10), index=True, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    battalion: Mapped[str] = mapped_column(String(10), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(15), default="open")   # open | acknowledged | escalated | closed
    recipient_role: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sla_due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acked_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    escalated_to: Mapped[str | None] = mapped_column(String(40), nullable=True)


class CaseAction(Base):
    __tablename__ = "case_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[str] = mapped_column(String(10), index=True)
    actor: Mapped[str] = mapped_column(String(40))
    action_type: Mapped[str] = mapped_column(String(40))          # offer_support | counselling_referral | roster_review | monitor | close
    rationale: Mapped[str] = mapped_column(Text)
    followup_days: Mapped[int] = mapped_column(Integer, default=7)
    pre_scores: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WelfareNeed(Base):
    __tablename__ = "welfare_needs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[str] = mapped_column(String(10), index=True)
    category: Mapped[str] = mapped_column(String(30))            # family_medical | housing | finance | child_education | leave | transfer | allowance
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(15), default="open")
    owner_branch: Mapped[str] = mapped_column(String(40), default="Welfare Cell")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sla_days: Mapped[int] = mapped_column(Integer, default=14)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    actor: Mapped[str] = mapped_column(String(40))
    role: Mapped[str] = mapped_column(String(30))
    action: Mapped[str] = mapped_column(String(60))
    resource: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(String(30))
    subject_person: Mapped[str | None] = mapped_column(String(10), index=True, nullable=True)
    outcome: Mapped[str] = mapped_column(String(15))              # allowed | denied
    detail: Mapped[str] = mapped_column(Text, default="")
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class ScoreUpdate(Base):
    """Latest re-scored snapshot after new personnel evidence (keeps demo updates auditable)."""
    __tablename__ = "score_updates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[str] = mapped_column(String(10), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    scores: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

