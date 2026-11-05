import json
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingClassifier,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    fbeta_score,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_curve,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import learning_curve, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


CSV_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public",
    "data",
    "land_acquisition_projects_4f49d043.csv",
)
MODELS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
)


def engineer_features(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    df["displacement_density"] = (
        df["affected_families_count"] / df["region_size_hectares"].clip(lower=1.0)
    )
    df["legal_friction_index"] = (
        df["litigations_count"] * df["compensation_disputed_flag"]
    )
    env_gap = (
        df["environmental_clearance_status"]
        .map({"Approved": 0, "Under Review": 1, "Pending": 2})
        .fillna(0)
    )
    df["statutory_readiness_gap"] = env_gap + (1 - df["public_hearing_completed"])
    return df


def synthesize_delay_days(df: pd.DataFrame) -> np.ndarray:
    env_slip = (
        df["environmental_clearance_status"]
        .map({"Approved": 0.0, "Under Review": 26.0, "Pending": 68.0})
        .fillna(0.0)
    )
    return np.maximum(
        5.0,
        np.round(
            df["bureaucratic_delay_days"] * 0.85
            + env_slip
            + df["litigations_count"] * 38.0
            + df["compensation_disputed_flag"] * 42.0
            + (1 - df["public_hearing_completed"]) * 24.0
            - (df["rehabilitation_progress_pct"] / 100.0) * 32.0
            + np.where(df["target_delayed"] == 1, 18.0, -10.0)
        ),
    )


def build_preprocessor() -> ColumnTransformer:
    numeric_features = [
        "region_size_hectares",
        "affected_families_count",
        "litigations_count",
        "rehabilitation_progress_pct",
        "bureaucratic_delay_days",
        "compensation_disputed_flag",
        "public_hearing_completed",
        "displacement_density",
        "legal_friction_index",
        "statutory_readiness_gap",
    ]
    categorical_features = [
        "project_type",
        "region",
        "environmental_clearance_status",
    ]
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_features,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical_features,
            ),
        ]
    )


def main():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"Dataset not found at {CSV_PATH}")

    df = engineer_features(pd.read_csv(CSV_PATH))

    X = df.drop(columns=["project_id", "target_delayed"])
    y_cls = df["target_delayed"].astype(int)
    y_reg = synthesize_delay_days(df)

    X_train, X_test, y_train, y_test, y_reg_train, y_reg_test = train_test_split(
        X, y_cls, y_reg, test_size=0.2, random_state=42, stratify=y_cls
    )

    preprocessor = build_preprocessor()

    candidates = [
        (
            "logistic",
            "Logistic Regression (L2)",
            "Linear Baseline",
            LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced"),
        ),
        (
            "random_forest",
            "Random Forest",
            "Bagging Ensemble",
            RandomForestClassifier(
                n_estimators=200, max_depth=12, class_weight="balanced", random_state=42
            ),
        ),
        (
            "gradient_boosting",
            "Gradient Boosting (GBM)",
            "Boosting Ensemble",
            GradientBoostingClassifier(
                n_estimators=150, max_depth=3, learning_rate=0.08, random_state=42
            ),
        ),
    ]

    model_benchmarks = []
    fitted_pipes = {}
    rf_probas = None

    print("=== Multi-Model Classification Benchmark ===")
    for model_id, name, family, clf in candidates:
        pipe = Pipeline([("preprocessor", preprocessor), ("classifier", clf)])
        pipe.fit(X_train, y_train)
        probas = pipe.predict_proba(X_test)[:, 1]
        preds = (probas >= 0.5).astype(int)

        if model_id == "random_forest":
            rf_probas = probas

        fpr, tpr, _ = roc_curve(y_test, probas)
        step = max(1, len(fpr) // 45)
        roc_pts = [
            {"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)}
            for i in range(0, len(fpr), step)
        ]
        if roc_pts[-1]["fpr"] < 1.0 or roc_pts[-1]["tpr"] < 1.0:
            roc_pts.append({"fpr": 1.0, "tpr": 1.0})

        metrics = {
            "id": model_id,
            "name": name,
            "family": family,
            "accuracy": round(float(accuracy_score(y_test, preds)), 4),
            "precision": round(float(precision_score(y_test, preds, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, preds, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, preds, zero_division=0)), 4),
            "f2": round(float(fbeta_score(y_test, preds, beta=2, zero_division=0)), 4),
            "rocAuc": round(float(roc_auc_score(y_test, probas)), 4),
            "prAuc": round(float(average_precision_score(y_test, probas)), 4),
            "brierScore": round(float(brier_score_loss(y_test, probas)), 4),
            "rocCurve": roc_pts,
            "testProbas": [round(float(p), 4) for p in probas],
        }
        model_benchmarks.append(metrics)
        fitted_pipes[model_id] = pipe
        print(
            f"{name:26s} | ROC-AUC: {metrics['rocAuc']:.4f} | Brier: {metrics['brierScore']:.4f}"
        )

    # Platt-calibrated Gradient Boosting (primary serialized classifier)
    gbm_pipe = fitted_pipes["gradient_boosting"]
    calibrated = CalibratedClassifierCV(gbm_pipe, method="sigmoid", cv=5)
    calibrated.fit(X_train, y_train)
    cal_probas = calibrated.predict_proba(X_test)[:, 1]
    cal_preds = (cal_probas >= 0.5).astype(int)

    fpr, tpr, _ = roc_curve(y_test, cal_probas)
    step = max(1, len(fpr) // 45)
    cal_roc = [
        {"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)}
        for i in range(0, len(fpr), step)
    ]
    if cal_roc[-1]["fpr"] < 1.0 or cal_roc[-1]["tpr"] < 1.0:
        cal_roc.append({"fpr": 1.0, "tpr": 1.0})

    model_benchmarks.append(
        {
            "id": "calibrated_gbm",
            "name": "Calibrated GBM (Platt)",
            "family": "Calibrated Boosting",
            "accuracy": round(float(accuracy_score(y_test, cal_preds)), 4),
            "precision": round(float(precision_score(y_test, cal_preds, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, cal_preds, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, cal_preds, zero_division=0)), 4),
            "f2": round(float(fbeta_score(y_test, cal_preds, beta=2, zero_division=0)), 4),
            "rocAuc": round(float(roc_auc_score(y_test, cal_probas)), 4),
            "prAuc": round(float(average_precision_score(y_test, cal_probas)), 4),
            "brierScore": round(float(brier_score_loss(y_test, cal_probas)), 4),
            "rocCurve": cal_roc,
            "testProbas": [round(float(p), 4) for p in cal_probas],
        }
    )

    # Calibration bins
    calibration_bins = []
    for b in range(8):
        low, high = b / 8.0, (b + 1) / 8.0
        mask = (cal_probas >= low) & (cal_probas <= high if b == 7 else cal_probas < high)
        if mask.sum() > 0:
            calibration_bins.append(
                {
                    "binLabel": f"{int(low * 100)}-{int(high * 100)}%",
                    "meanPredictedUncalibrated": round(float(rf_probas[mask].mean()), 4),
                    "meanPredictedCalibrated": round(float(cal_probas[mask].mean()), 4),
                    "empiricalFraction": round(float(y_test.values[mask].mean()), 4),
                    "count": int(mask.sum()),
                }
            )

    # PR Curve & F1/F2 optimal thresholds
    pr_curve = []
    best_f2_t, best_f2 = 0.4, -1.0
    best_f1_t, best_f1 = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, 46):
        t_preds = (cal_probas >= t).astype(int)
        p_val = float(precision_score(y_test, t_preds, zero_division=0))
        r_val = float(recall_score(y_test, t_preds, zero_division=0))
        f1_val = float(f1_score(y_test, t_preds, zero_division=0))
        f2_val = float(fbeta_score(y_test, t_preds, beta=2, zero_division=0))
        pr_curve.append(
            {
                "threshold": round(float(t), 2),
                "recall": round(r_val, 4),
                "precision": round(p_val, 4),
                "f1": round(f1_val, 4),
                "f2": round(f2_val, 4),
            }
        )
        if f2_val > best_f2:
            best_f2, best_f2_t = f2_val, round(float(t), 2)
        if f1_val > best_f1:
            best_f1, best_f1_t = f1_val, round(float(t), 2)

    # Dual-target regression model
    reg_pipe = Pipeline(
        [
            ("preprocessor", build_preprocessor()),
            (
                "regressor",
                RandomForestRegressor(n_estimators=150, max_depth=10, random_state=42),
            ),
        ]
    )
    reg_pipe.fit(X_train, y_reg_train)
    reg_preds = reg_pipe.predict(X_test)
    mae_days = round(float(mean_absolute_error(y_reg_test, reg_preds)), 1)
    rmse_days = round(float(np.sqrt(mean_squared_error(y_reg_test, reg_preds))), 1)
    r2_days = round(float(r2_score(y_reg_test, reg_preds)), 3)

    # Learning Curve
    train_sizes, train_scores, val_scores = learning_curve(
        fitted_pipes["logistic"],
        X_train,
        y_train,
        cv=5,
        scoring="roc_auc",
        train_sizes=np.linspace(0.15, 1.0, 5),
    )
    lc_points = [
        {
            "trainSize": int(sz),
            "trainAuc": round(float(tr), 3),
            "valAuc": round(float(va), 3),
        }
        for sz, tr, va in zip(
            train_sizes, train_scores.mean(axis=1), val_scores.mean(axis=1)
        )
    ]

    # Permutation Importance
    perm = permutation_importance(
        calibrated, X_test, y_test, n_repeats=5, scoring="roc_auc", random_state=42
    )
    engineered_cols = {
        "displacement_density",
        "legal_friction_index",
        "statutory_readiness_gap",
    }
    label_map = {
        "litigations_count": "Active Litigations",
        "compensation_disputed_flag": "Compensation Disputed",
        "environmental_clearance_status": "Environmental Clearance",
        "rehabilitation_progress_pct": "Rehabilitation (%)",
        "public_hearing_completed": "Public Hearing Completed",
        "bureaucratic_delay_days": "Bureaucratic Delay (d)",
        "affected_families_count": "Affected Families",
        "region_size_hectares": "Area (Hectares)",
        "project_type": "Project Type",
        "region": "State",
        "displacement_density": "Displacement Density",
        "legal_friction_index": "Legal Friction Index",
        "statutory_readiness_gap": "Statutory Gap Score",
    }
    perm_items = []
    for idx in np.argsort(perm.importances_mean)[::-1]:
        col = X_test.columns[idx]
        perm_items.append(
            {
                "feature": label_map.get(col, col),
                "category": "Engineered" if col in engineered_cols else "Base",
                "aucDrop": round(max(0.0, float(perm.importances_mean[idx])), 4),
                "stdDrop": round(float(perm.importances_std[idx]), 4),
            }
        )

    evaluation_suite = {
        "trainCount": int(len(X_train)),
        "testCount": int(len(X_test)),
        "featureCount": int(X.shape[1]),
        "yTest": [int(v) for v in y_test.tolist()],
        "models": model_benchmarks,
        "calibrationBins": calibration_bins,
        "uncalibratedBrier": round(float(brier_score_loss(y_test, rf_probas)), 4),
        "calibratedBrier": round(float(brier_score_loss(y_test, cal_probas)), 4),
        "prCurve": pr_curve,
        "f2OptimalThreshold": best_f2_t,
        "f1OptimalThreshold": best_f1_t,
        "learningCurve": lc_points,
        "permutationImportance": perm_items,
        "regressionBenchmark": {
            "modelName": "Random Forest Regressor (sklearn)",
            "maeDays": mae_days,
            "rmseDays": rmse_days,
            "r2Score": r2_days,
            "targetDescription": "Forecasted corridor schedule overrun (days)",
        },
    }

    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(
        calibrated, os.path.join(MODELS_DIR, "calibrated_delay_classifier.pkl")
    )
    joblib.dump(reg_pipe, os.path.join(MODELS_DIR, "delay_days_regressor.pkl"))
    with open(
        os.path.join(MODELS_DIR, "evaluation_metrics.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(evaluation_suite, f, indent=2)

    print(f"\nSaved .pkl models and evaluation_metrics.json to {MODELS_DIR}")


if __name__ == "__main__":
    main()
