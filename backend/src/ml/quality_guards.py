#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Forecast quality gates used by weekly automation.
"""

from __future__ import annotations

import json
import math
import os
from typing import Optional

import numpy as np
import pandas as pd


QUALITY_REPORT_PATH = os.path.join(os.path.dirname(__file__), "../../models/quality_report.json")


def _mae(actuals: pd.Series, predictions: pd.Series) -> float:
    return float(np.mean(np.abs(actuals.to_numpy(dtype=float) - predictions.to_numpy(dtype=float))))


def validate_forecast_quality(
    forecasts: pd.DataFrame,
    expected_hours: int = 168,
    actuals: Optional[pd.Series] = None,
    seasonal_naive: Optional[pd.Series] = None,
    min_baseline_improvement: float = 0.01,
) -> dict:
    if len(forecasts) != expected_hours:
        raise ValueError(f"forecast has {len(forecasts)} rows, expected {expected_hours}")

    predictions = forecasts["predicted_price"].astype(float)
    invalid_mask = ~np.isfinite(predictions) | (predictions < 0)
    invalid_count = int(invalid_mask.sum())
    if invalid_count:
        raise ValueError(f"invalid forecast values: {invalid_count} negative, NaN, or infinite predictions")

    report = {
        "forecast_hours": int(len(forecasts)),
        "min_prediction": float(predictions.min()),
        "max_prediction": float(predictions.max()),
        "avg_prediction": float(predictions.mean()),
        "invalid_predictions": invalid_count,
    }

    if actuals is not None and seasonal_naive is not None:
        actuals = actuals.reset_index(drop=True).astype(float)
        baseline = seasonal_naive.reset_index(drop=True).astype(float)
        aligned_predictions = predictions.reset_index(drop=True)

        model_mae = _mae(actuals, aligned_predictions)
        baseline_mae = _mae(actuals, baseline)
        improvement = (baseline_mae - model_mae) / baseline_mae if baseline_mae > 0 else math.inf

        report.update({
            "model_mae": model_mae,
            "seasonal_naive_mae": baseline_mae,
            "baseline_improvement": float(improvement),
        })

        if improvement < min_baseline_improvement:
            raise ValueError(
                f"ensemble does not beat seasonal naive baseline: improvement={improvement:.2%}, "
                f"required={min_baseline_improvement:.2%}"
            )

    return report


def save_quality_report(report: dict, path: str = QUALITY_REPORT_PATH) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
