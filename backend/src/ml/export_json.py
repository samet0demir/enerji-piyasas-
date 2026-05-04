#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Export forecast and performance data for the frontend.
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

try:
    from db_config import DB_PATH
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from db_config import DB_PATH


OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../../public/forecasts.json")
QUALITY_REPORT_PATH = os.path.join(os.path.dirname(__file__), "../../models/quality_report.json")


def get_current_week_monday():
    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    return monday.strftime("%Y-%m-%d")


def _clean_number(value, digits=2):
    if value is None or pd.isna(value) or not np.isfinite(float(value)):
        return None
    return round(float(value), digits)


def _load_quality_report():
    if not os.path.exists(QUALITY_REPORT_PATH):
        return None
    with open(QUALITY_REPORT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def export_forecasts():
    print("\n" + "=" * 70)
    print("JSON EXPORT - Frontend data")
    print("=" * 70)

    conn = sqlite3.connect(DB_PATH)

    this_week_monday = get_current_week_monday()
    this_week_sunday = (datetime.strptime(this_week_monday, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
    last_week_monday = (datetime.strptime(this_week_monday, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
    last_week_sunday = (datetime.strptime(last_week_monday, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

    current_week_query = """
        SELECT
            forecast_datetime,
            predicted_price,
            actual_price,
            absolute_error,
            prophet_component,
            xgboost_component,
            lstm_component
        FROM forecast_history
        WHERE week_start = ?
        ORDER BY forecast_datetime
    """
    current_week = pd.read_sql_query(current_week_query, conn, params=[this_week_monday])
    current_week = current_week.replace([np.inf, -np.inf], np.nan)

    current_forecasts = []
    for _, row in current_week.iterrows():
        predicted = _clean_number(row["predicted_price"])
        current_forecasts.append({
            "datetime": row["forecast_datetime"],
            "predicted": predicted,
            "actual": _clean_number(row["actual_price"]),
            "prophet": _clean_number(row.get("prophet_component")),
            "xgboost": _clean_number(row.get("xgboost_component")),
            "lstm": _clean_number(row.get("lstm_component")),
            "lower": predicted,
            "upper": predicted,
        })

    last_week_perf_query = """
        SELECT week_start, week_end, mape, mae, rmse, total_predictions
        FROM weekly_performance
        WHERE week_start = ?
    """
    last_week_perf = pd.read_sql_query(last_week_perf_query, conn, params=[last_week_monday])
    last_week_perf = last_week_perf.replace([np.inf, -np.inf], np.nan)

    last_week_performance = None
    if len(last_week_perf) > 0:
        row = last_week_perf.iloc[0]
        last_week_performance = {
            "week": f"{last_week_monday} - {last_week_sunday}",
            "week_start": row["week_start"],
            "week_end": row["week_end"],
            "mape": _clean_number(row["mape"]),
            "mae": _clean_number(row["mae"]),
            "rmse": _clean_number(row["rmse"]),
            "total_predictions": int(row["total_predictions"]),
        }

    last_week_comparison_query = """
        SELECT forecast_datetime, predicted_price, actual_price, absolute_error, percentage_error
        FROM forecast_history
        WHERE week_start = ? AND actual_price IS NOT NULL
        ORDER BY forecast_datetime
    """
    last_week_comp = pd.read_sql_query(last_week_comparison_query, conn, params=[last_week_monday])
    last_week_comp = last_week_comp.replace([np.inf, -np.inf], np.nan)

    last_week_comparison = []
    for _, row in last_week_comp.iterrows():
        last_week_comparison.append({
            "datetime": row["forecast_datetime"],
            "predicted": _clean_number(row["predicted_price"]),
            "actual": _clean_number(row["actual_price"]),
            "error": _clean_number(row["absolute_error"]),
            "error_percent": _clean_number(row["percentage_error"]),
        })

    trend_query = """
        SELECT week_start, week_end, mape, mae, rmse, total_predictions
        FROM weekly_performance
        ORDER BY week_start DESC
        LIMIT 8
    """
    trend = pd.read_sql_query(trend_query, conn)
    trend = trend.replace([np.inf, -np.inf], np.nan)

    historical_trend = []
    for _, row in trend.iterrows():
        historical_trend.append({
            "week": f"{row['week_start']} - {row['week_end']}",
            "week_start": row["week_start"],
            "week_end": row["week_end"],
            "mape": _clean_number(row["mape"]),
            "mae": _clean_number(row["mae"]),
            "rmse": _clean_number(row["rmse"]),
            "total_predictions": int(row["total_predictions"]),
        })

    conn.close()

    quality = _load_quality_report()
    model_type = None
    models_count = None
    if quality:
        model_type = quality.get("model_type")
        models_count = quality.get("models_count")

    output_data = {
        "generated_at": datetime.now().isoformat(),
        "model_type": model_type or "Prophet + XGBoost Ensemble",
        "models_count": models_count or 2,
        "quality": quality,
        "current_week": {
            "start": this_week_monday,
            "end": this_week_sunday,
            "forecasts": current_forecasts,
        },
        "last_week_performance": last_week_performance,
        "last_week_comparison": last_week_comparison,
        "historical_trend": historical_trend,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2, allow_nan=False)

    frontend_path = os.path.join(os.path.dirname(__file__), "../../../frontend/public/forecasts.json")
    os.makedirs(os.path.dirname(frontend_path), exist_ok=True)
    with open(frontend_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2, allow_nan=False)

    print(f"[+] JSON saved: {OUTPUT_PATH}")
    print(f"[+] Frontend copy saved: {frontend_path}")
    return output_data


def main():
    return export_forecasts()


if __name__ == "__main__":
    main()
