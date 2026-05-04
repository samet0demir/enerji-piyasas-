#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Weekly model workflow using the ensemble pipeline.

Steps:
1. Compare last week's published forecasts with actuals.
2. Train multivariate Prophet.
3. Train XGBoost residual model.
4. Load Prophet + XGBoost (+ optional LSTM) ensemble.
5. Run validation gates and save this week's forecast.
6. Export frontend JSON.
"""

import os
import sys
from datetime import datetime, timedelta

import pandas as pd

script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)


def get_monday_date(offset_weeks=0):
    today = datetime.now()
    this_monday = today - timedelta(days=today.weekday())
    target_monday = this_monday + timedelta(weeks=offset_weeks)
    return target_monday.strftime("%Y-%m-%d")


def get_sunday_date(monday_date):
    monday = datetime.strptime(monday_date, "%Y-%m-%d")
    return (monday + timedelta(days=6)).strftime("%Y-%m-%d")


def _validate_recent_window(ensemble, df, expected_hours=168):
    from quality_guards import validate_forecast_quality

    validation = df.tail(expected_hours).copy()
    if len(validation) != expected_hours:
        raise ValueError(f"validation window has {len(validation)} rows, expected {expected_hours}")

    predictions = ensemble.predict(validation)
    validation_forecasts = pd.DataFrame({
        "ds": validation["ds"].values,
        "predicted_price": predictions["ensemble_pred"],
    })
    validation_forecasts["predicted_price"] = validation_forecasts["predicted_price"].clip(lower=0)

    report = validate_forecast_quality(
        validation_forecasts,
        expected_hours=expected_hours,
        actuals=validation["y"],
        seasonal_naive=validation["price_lag_168h"],
        min_baseline_improvement=0.01,
    )
    report["validation_start"] = validation["ds"].min().isoformat()
    report["validation_end"] = validation["ds"].max().isoformat()
    return report


def run_weekly_cycle():
    print("\n" + "=" * 70)
    print("WEEKLY ENSEMBLE WORKFLOW STARTING")
    print("=" * 70)
    print(f"Run time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    this_week_monday = get_monday_date(0)
    this_week_sunday = get_sunday_date(this_week_monday)
    last_week_monday = get_monday_date(-1)
    last_week_sunday = get_sunday_date(last_week_monday)

    print(f"This week: {this_week_monday} - {this_week_sunday}")
    print(f"Last week: {last_week_monday} - {last_week_sunday}")

    print("\n[1/6] Comparing last week's forecasts")
    from compare_forecasts import compare_week

    comparison = compare_week(last_week_monday, last_week_sunday)
    if not comparison or comparison["total_predictions"] < 168:
        raise ValueError(f"Last week comparison incomplete: {comparison}")

    print("\n[2/6] Training multivariate Prophet")
    from train_prophet import main as train_prophet

    prophet_model, prophet_mae, prophet_rmse, prophet_mape = train_prophet()
    print(f"Prophet trained: MAE={prophet_mae:.2f}, RMSE={prophet_rmse:.2f}, MAPE={prophet_mape:.2f}%")

    print("\n[3/6] Training XGBoost residual model")
    from train_xgboost import main as train_xgboost

    _xgb_model, _xgb_features, xgb_mae, xgb_rmse, xgb_mape = train_xgboost()
    print(f"XGBoost trained: MAE={xgb_mae:.2f}, RMSE={xgb_rmse:.2f}, MAPE={xgb_mape:.2f}%")

    print("\n[4/6] Loading ensemble and running validation gate")
    from ensemble import EnsembleModel
    from features import load_combined_data, engineer_features
    from quality_guards import validate_forecast_quality, save_quality_report

    df = engineer_features(load_combined_data())
    ensemble = EnsembleModel().load_models()
    validation_report = _validate_recent_window(ensemble, df)

    print("\n[5/6] Forecasting current week")
    forecasts = ensemble.forecast_future(df, days=7, start_date=this_week_monday)
    forecast_report = validate_forecast_quality(forecasts, expected_hours=168)

    quality_report = {
        **validation_report,
        "current_forecast": forecast_report,
        "clipped_negative_predictions": int(forecasts.attrs.get("clipped_negative_predictions", 0)),
        "model_type": "Prophet + XGBoost + LSTM Ensemble" if ensemble.use_lstm else "Prophet + XGBoost Ensemble",
        "models_count": 3 if ensemble.use_lstm else 2,
        "last_week_mape": float(comparison["mape"]),
        "last_week_mae": float(comparison["mae"]),
        "last_week_rmse": float(comparison["rmse"]),
    }
    save_quality_report(quality_report)

    from predict import save_forecast_to_db

    save_forecast_to_db(forecasts, this_week_monday, this_week_sunday)

    print("\n[6/6] Exporting frontend JSON")
    from export_json import export_forecasts

    export_forecasts()

    print("\n" + "=" * 70)
    print("WEEKLY ENSEMBLE WORKFLOW COMPLETED")
    print("=" * 70)
    return True


def main():
    try:
        run_weekly_cycle()
        sys.exit(0)
    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
