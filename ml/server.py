import json
import os
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ml.train_model import MODELS_DIR, engineer_features, main as train_all_models

CLASSIFIER_PATH = os.path.join(MODELS_DIR, "calibrated_delay_classifier.pkl")
REGRESSOR_PATH = os.path.join(MODELS_DIR, "delay_days_regressor.pkl")
EVALUATION_PATH = os.path.join(MODELS_DIR, "evaluation_metrics.json")
DIST_DIR = os.path.join(os.path.dirname(MODELS_DIR), "dist")

app = FastAPI(title="Land Acquisition Risk Predictor API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

classifier_model = None
regressor_model = None
evaluation_cache = None


def ensure_models_loaded():
    global classifier_model, regressor_model, evaluation_cache
    if not (
        os.path.exists(CLASSIFIER_PATH)
        and os.path.exists(REGRESSOR_PATH)
        and os.path.exists(EVALUATION_PATH)
    ):
        train_all_models()

    if classifier_model is None:
        classifier_model = joblib.load(CLASSIFIER_PATH)
    if regressor_model is None:
        regressor_model = joblib.load(REGRESSOR_PATH)
    if evaluation_cache is None:
        with open(EVALUATION_PATH, "r", encoding="utf-8") as f:
            evaluation_cache = json.load(f)


@app.on_event("startup")
def startup_event():
    ensure_models_loaded()


class ProjectInput(BaseModel):
    project_type: Literal["Highway", "Railway", "Industrial Corridor", "Rural Road"]
    region: Literal[
        "Maharashtra",
        "Madhya Pradesh",
        "Uttar Pradesh",
        "Karnataka",
        "Gujarat",
        "Odisha",
    ]
    region_size_hectares: float
    affected_families_count: int
    compensation_disputed_flag: int
    environmental_clearance_status: Literal["Approved", "Pending", "Under Review"]
    litigations_count: int
    public_hearing_completed: int
    rehabilitation_progress_pct: float
    bureaucratic_delay_days: int


NEUTRAL_BASELINE = {
    "project_type": "Highway",
    "region": "Madhya Pradesh",
    "region_size_hectares": 240.0,
    "affected_families_count": 850,
    "compensation_disputed_flag": 0,
    "environmental_clearance_status": "Approved",
    "litigations_count": 1,
    "public_hearing_completed": 1,
    "rehabilitation_progress_pct": 60.0,
    "bureaucratic_delay_days": 45,
}

FEATURE_LABELS = [
    ("litigations_count", "Active Litigations"),
    ("environmental_clearance_status", "Environmental Clearance"),
    ("compensation_disputed_flag", "Compensation Dispute"),
    ("rehabilitation_progress_pct", "Rehabilitation & Resettlement"),
    ("public_hearing_completed", "Public Hearing (SIA)"),
    ("bureaucratic_delay_days", "Administrative File Latency"),
    ("affected_families_count", "Affected Families"),
    ("region_size_hectares", "Acquisition Footprint"),
    ("project_type", "Corridor Classification"),
    ("region", "State Jurisdiction"),
]


def format_display_value(key: str, data: dict) -> str:
    val = data[key]
    if key == "litigations_count":
        return f"{val} {'case' if val == 1 else 'cases'}"
    if key == "compensation_disputed_flag":
        return "Disputed" if val == 1 else "Undisputed"
    if key == "rehabilitation_progress_pct":
        return f"{float(val):.0f}% complete"
    if key == "public_hearing_completed":
        return "Completed" if val == 1 else "Pending"
    if key == "bureaucratic_delay_days":
        return f"{val} days"
    if key == "affected_families_count":
        return f"{int(val):,}"
    if key == "region_size_hectares":
        return f"{float(val):.0f} ha"
    return str(val)


@app.get("/api/health")
def health():
    ensure_models_loaded()
    return {"status": "ok", "backend": "sklearn-pkl"}


@app.get("/api/evaluation")
def get_evaluation():
    ensure_models_loaded()
    return evaluation_cache


@app.post("/api/predict")
def predict(payload: ProjectInput):
    try:
        ensure_models_loaded()
        raw_dict = payload.model_dump()
        df = engineer_features(pd.DataFrame([raw_dict]))

        prob = float(classifier_model.predict_proba(df)[0][1])
        probability_pct = round(min(98.5, max(2.0, prob * 100.0)), 1)
        predicted_delayed = 1 if probability_pct >= 50.0 else 0

        if probability_pct >= 70.0:
            risk_tier = "Critical Risk"
        elif probability_pct >= 40.0:
            risk_tier = "Moderate Watch"
        else:
            risk_tier = "Low Risk / On Track"

        expected_delay_days = max(5, int(round(float(regressor_model.predict(df)[0]))))
        band = max(12, int(round(expected_delay_days * 0.14)))
        range_min = max(5, expected_delay_days - band)
        range_max = expected_delay_days + band
        severity_label = (
            "Severe Overrun"
            if expected_delay_days >= 140
            else "Moderate Slippage"
            if expected_delay_days >= 65
            else "Minimal Slippage"
        )

        # Model-agnostic leave-one-out feature attribution relative to baseline
        raw_impacts = []
        for key, label in FEATURE_LABELS:
            perturbed = dict(raw_dict)
            perturbed[key] = NEUTRAL_BASELINE[key]
            p_df = engineer_features(pd.DataFrame([perturbed]))
            p_prob = float(classifier_model.predict_proba(p_df)[0][1]) * 100.0
            delta = probability_pct - p_prob
            raw_impacts.append((key, label, delta))

        delta_from_base = probability_pct - 50.0
        sum_raw = sum(item[2] for item in raw_impacts)
        scale = (delta_from_base / sum_raw) if abs(sum_raw) > 1e-3 else 1.0

        shap_contributions = []
        for key, label, raw_delta in raw_impacts:
            impact = round(raw_delta * scale, 1)
            shap_contributions.append(
                {
                    "key": key,
                    "label": label,
                    "displayValue": format_display_value(key, raw_dict),
                    "impactPct": impact,
                    "rawLogOdds": round(raw_delta / 15.0, 2),
                    "direction": (
                        "risk"
                        if impact > 0.2
                        else "mitigation"
                        if impact < -0.2
                        else "neutral"
                    ),
                }
            )
        shap_contributions.sort(key=lambda x: abs(x["impactPct"]), reverse=True)

        return {
            "source": "sklearn-pkl",
            "probabilityPct": probability_pct,
            "predictedDelayed": predicted_delayed,
            "riskTier": risk_tier,
            "engineered": {
                "displacementDensity": round(float(df["displacement_density"].iloc[0]), 2),
                "legalFrictionIndex": int(df["legal_friction_index"].iloc[0]),
                "statutoryGapScore": int(df["statutory_readiness_gap"].iloc[0]),
            },
            "delayForecast": {
                "expectedDelayDays": expected_delay_days,
                "rangeMinDays": range_min,
                "rangeMaxDays": range_max,
                "severityLabel": severity_label,
            },
            "shapContributions": shap_contributions,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")
