import math
import unittest

import pandas as pd

from quality_guards import validate_forecast_quality


class ForecastQualityTests(unittest.TestCase):
    def test_rejects_negative_nan_or_infinite_forecasts(self):
        forecasts = pd.DataFrame(
            {
                "ds": pd.date_range("2026-05-04", periods=4, freq="h"),
                "predicted_price": [100.0, -1.0, math.nan, math.inf],
            }
        )

        with self.assertRaises(ValueError) as ctx:
            validate_forecast_quality(forecasts, expected_hours=4)

        self.assertIn("invalid forecast values", str(ctx.exception))

    def test_requires_ensemble_to_beat_seasonal_naive_baseline(self):
        actuals = pd.Series([100.0, 110.0, 120.0, 130.0])
        forecasts = pd.DataFrame(
            {
                "ds": pd.date_range("2026-05-04", periods=4, freq="h"),
                "predicted_price": [180.0, 190.0, 200.0, 210.0],
            }
        )
        baseline = pd.Series([101.0, 111.0, 121.0, 131.0])

        with self.assertRaises(ValueError) as ctx:
            validate_forecast_quality(
                forecasts,
                expected_hours=4,
                actuals=actuals,
                seasonal_naive=baseline,
                min_baseline_improvement=0.01,
            )

        self.assertIn("does not beat seasonal naive baseline", str(ctx.exception))

    def test_returns_quality_report_for_valid_forecasts(self):
        actuals = pd.Series([100.0, 110.0, 120.0, 130.0])
        forecasts = pd.DataFrame(
            {
                "ds": pd.date_range("2026-05-04", periods=4, freq="h"),
                "predicted_price": [101.0, 111.0, 119.0, 129.0],
            }
        )
        baseline = pd.Series([120.0, 130.0, 140.0, 150.0])

        report = validate_forecast_quality(
            forecasts,
            expected_hours=4,
            actuals=actuals,
            seasonal_naive=baseline,
            min_baseline_improvement=0.01,
        )

        self.assertEqual(report["forecast_hours"], 4)
        self.assertGreater(report["baseline_improvement"], 0.01)


if __name__ == "__main__":
    unittest.main()
