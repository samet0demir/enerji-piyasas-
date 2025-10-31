#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
EPİAŞ MCP Fiyat Tahmini - İlk Kurulum (2 Hafta)
===============================================

Bu script 2 haftalık tahmin ve karşılaştırma yapar:
- 1. Hafta: 20-26 Ekim 2025 (tahmin + gerçek → karşılaştırma)
- 2. Hafta: 27 Ekim - 2 Kasım 2025 (sadece tahmin, hafta devam ediyor)

SADECE İLK KURULUM İÇİN KULLANILIR!
Sonraki haftalar için weekly_workflow.py otomatik çalışacak.
"""

import sys
import os
from datetime import datetime

# Script'in çalıştığı dizin
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)

# Modülleri import et
from train_prophet import main as train_model
from compare_forecasts import compare_week
from export_json import export_forecasts
from prophet.serialize import model_from_json
import pandas as pd

def setup_week_1():
    """
    1. Hafta: 20-26 Ekim 2025
    - 19 Ekim'e kadar veriyle model eğit
    - 20-26 Ekim tahmini yap
    - Gerçek verilerle karşılaştır (geçmiş hafta olduğu için gerçek veri var)
    """
    print("\n" + "="*70)
    print("1. HAFTA KURULUMU: 20-26 Ekim 2025")
    print("="*70)

    week_start = '2025-10-20'
    week_end = '2025-10-26'
    train_until = '2025-10-20'  # 20 Ekim DAHİL DEĞİL

    # 1. Model eğit
    print(f"\n[1/3] Model eğitimi ({train_until} tarihine kadar veri)")
    try:
        model, mae, rmse, mape = train_model(end_date=train_until)
        print(f"[OK] Model eğitildi: MAE={mae:.2f} TRY, MAPE={mape:.2f}%")
    except Exception as e:
        print(f"[ERROR] Model eğitimi HATA: {e}")
        return False

    # 2. Tahmin yap
    print(f"\n[2/3] Tahmin yapılıyor ({week_start} - {week_end})")
    try:
        # Model dosyasını yükle
        model_path = os.path.join(script_dir, '../../models/prophet_model.json')
        with open(model_path, 'r') as f:
            model = model_from_json(f.read())

        # 7 günlük tahmin
        future = model.make_future_dataframe(periods=7*24, freq='H')
        forecast = model.predict(future)

        # Sadece bu haftanın tahminlerini al
        last_history_date = model.history['ds'].max()
        future_forecast = forecast[forecast['ds'] > last_history_date].head(168)

        print(f"[OK] {len(future_forecast)} saatlik tahmin üretildi")

        # Database'e kaydet
        from predict import save_forecast_to_db, save_forecast_csv
        save_forecast_to_db(future_forecast, week_start, week_end)
        save_forecast_csv(future_forecast, days=7)

        print(f"[OK] Tahminler kaydedildi")

    except Exception as e:
        print(f"[ERROR] Tahmin yapma HATA: {e}")
        import traceback
        traceback.print_exc()
        return False

    # 3. Karşılaştır (gerçek veri var)
    print(f"\n[3/3] Tahmin vs gerçek karşılaştırması")
    try:
        result = compare_week(week_start, week_end)
        if result:
            print(f"[OK] Karşılaştırma tamamlandı:")
            print(f"   MAPE: {result['mape']:.2f}%")
            print(f"   MAE: {result['mae']:.2f} TRY")
            print(f"   RMSE: {result['rmse']:.2f} TRY")
        else:
            print(f"[WARNING] Karşılaştırma yapılamadı (gerçek veri eksik olabilir)")
    except Exception as e:
        print(f"[ERROR] Karşılaştırma HATA: {e}")

    print("\n[OK] 1. HAFTA TAMAMLANDI!")
    return True

def setup_week_2():
    """
    2. Hafta: 27 Ekim - 2 Kasım 2025
    - 26 Ekim'e kadar veriyle model eğit
    - 27 Ekim - 2 Kasım tahmini yap
    - Karşılaştırma YAPILMAZ (hafta henüz bitmedi)
    """
    print("\n" + "="*70)
    print("2. HAFTA KURULUMU: 27 Ekim - 2 Kasım 2025")
    print("="*70)

    week_start = '2025-10-27'
    week_end = '2025-11-02'
    train_until = '2025-10-27'  # 27 Ekim DAHİL DEĞİL

    # 1. Model eğit
    print(f"\n[1/2] Model eğitimi ({train_until} tarihine kadar veri)")
    try:
        model, mae, rmse, mape = train_model(end_date=train_until)
        print(f"[OK] Model eğitildi: MAE={mae:.2f} TRY, MAPE={mape:.2f}%")
    except Exception as e:
        print(f"[ERROR] Model eğitimi HATA: {e}")
        return False

    # 2. Tahmin yap
    print(f"\n[2/2] Tahmin yapılıyor ({week_start} - {week_end})")
    try:
        # Model dosyasını yükle
        model_path = os.path.join(script_dir, '../../models/prophet_model.json')
        with open(model_path, 'r') as f:
            model = model_from_json(f.read())

        # 7 günlük tahmin
        future = model.make_future_dataframe(periods=7*24, freq='H')
        forecast = model.predict(future)

        # Sadece bu haftanın tahminlerini al
        last_history_date = model.history['ds'].max()
        future_forecast = forecast[forecast['ds'] > last_history_date].head(168)

        print(f"[OK] {len(future_forecast)} saatlik tahmin üretildi")

        # Database'e kaydet
        from predict import save_forecast_to_db, save_forecast_csv, visualize_forecast
        save_forecast_to_db(future_forecast, week_start, week_end)
        save_forecast_csv(future_forecast, days=7)
        visualize_forecast(future_forecast, days=7)

        print(f"[OK] Tahminler kaydedildi")

    except Exception as e:
        print(f"[ERROR] Tahmin yapma HATA: {e}")
        import traceback
        traceback.print_exc()
        return False

    print("\n[OK] 2. HAFTA TAMAMLANDI!")
    print("[INFO] Not: Hafta henüz bitmediği için karşılaştırma yapılmadı.")
    return True

def main():
    """Ana kurulum fonksiyonu"""
    print("="*70)
    print("İLK KURULUM - 2 HAFTALİK TAHMİN VE KARŞILAŞTIRMA")
    print("="*70)
    print(f"Tarih: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)

    # 1. Hafta
    success_week1 = setup_week_1()

    # 2. Hafta
    success_week2 = setup_week_2()

    # JSON Export
    print("\n" + "="*70)
    print("JSON EXPORT (Frontend için)")
    print("="*70)
    try:
        export_forecasts()
        print("[OK] JSON export tamamlandı")
    except Exception as e:
        print(f"[ERROR] JSON export HATA: {e}")

    # Özet
    print("\n" + "="*70)
    print("İLK KURULUM TAMAMLANDI!")
    print("="*70)
    print(f"[OK] 1. Hafta (20-26 Ekim): {'Tamamlandı' if success_week1 else 'HATA'}")
    print(f"[OK] 2. Hafta (27 Ekim - 2 Kasım): {'Tamamlandı' if success_week2 else 'HATA'}")
    print("\n[DATABASE] Database'de:")
    print("   - 2 haftalık tahmin kaydı")
    print("   - 1 haftalık performans kaydı (20-26 Ekim)")
    print("\n[FRONTEND] Frontend:")
    print("   - forecasts.json dosyası hazır")
    print("   - Vercel'e deploy edilebilir")
    print("\n[NEXT STEP] Sonraki adım:")
    print("   - Her Pazartesi sabah 03:00'da weekly_workflow.py otomatik çalışacak")
    print("="*70)

    if success_week1 and success_week2:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
