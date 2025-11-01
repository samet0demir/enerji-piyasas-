#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
EPİAŞ MCP Fiyat Tahmini - Haftalık İş Akışı
===========================================

Bu script haftalık döngüyü orkestre eder:
1. Geçen hafta tahmin vs gerçek karşılaştırması
2. Model eğitimi (dün'e kadar veriyle)
3. Bu hafta tahmini
4. JSON export

Her Pazartesi sabah 03:00'da GitHub Actions tarafından çalıştırılır.
"""

import sys
import os
from datetime import datetime, timedelta

# Script'in çalıştığı dizin
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)

# Modülleri import et
from train_prophet import main as train_model
from compare_forecasts import compare_week
from export_json import export_forecasts

def get_monday_date(offset_weeks=0):
    """
    Pazartesi tarihini döndürür

    Args:
        offset_weeks (int): Kaç hafta öncesi/sonrası (0 = bu hafta, -1 = geçen hafta)

    Returns:
        str: Pazartesi tarihi (YYYY-MM-DD)
    """
    today = datetime.now()
    days_since_monday = today.weekday()  # Pazartesi = 0
    this_monday = today - timedelta(days=days_since_monday)
    target_monday = this_monday + timedelta(weeks=offset_weeks)
    return target_monday.strftime('%Y-%m-%d')

def get_sunday_date(monday_date):
    """
    Pazartesi tarihinden Pazar tarihini hesaplar

    Args:
        monday_date (str): Pazartesi tarihi (YYYY-MM-DD)

    Returns:
        str: Pazar tarihi (YYYY-MM-DD)
    """
    monday = datetime.strptime(monday_date, '%Y-%m-%d')
    sunday = monday + timedelta(days=6)
    return sunday.strftime('%Y-%m-%d')

def run_weekly_cycle():
    """
    Haftalık döngüyü çalıştırır
    """
    print("\n" + "="*70)
    print("HAFTALİK İŞ AKIŞI BAŞLIYOR")
    print("="*70)
    print(f"Tarih: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)

    # Tarihleri hesapla
    this_week_monday = get_monday_date(0)
    this_week_sunday = get_sunday_date(this_week_monday)

    last_week_monday = get_monday_date(-1)
    last_week_sunday = get_sunday_date(last_week_monday)

    print(f"\n📅 BU HAFTA: {this_week_monday} (Pazartesi) - {this_week_sunday} (Pazar)")
    print(f"📅 GEÇEN HAFTA: {last_week_monday} (Pazartesi) - {last_week_sunday} (Pazar)")

    # =====================================================================
    # ADIM 1: Geçen hafta tahmin vs gerçek karşılaştırması
    # =====================================================================
    print("\n" + "="*70)
    print("ADIM 1: Geçen hafta tahmin vs gerçek karşılaştırması")
    print("="*70)

    try:
        result = compare_week(last_week_monday, last_week_sunday)
        if result:
            print(f"\n✅ Geçen hafta karşılaştırması tamamlandı!")
            print(f"   MAPE: {result['mape']:.2f}%")
            print(f"   MAE: {result['mae']:.2f} TRY")
            print(f"   RMSE: {result['rmse']:.2f} TRY")
        else:
            print("\n⚠️  Geçen hafta karşılaştırması yapılamadı (veri eksik olabilir)")
    except Exception as e:
        print(f"\n❌ Geçen hafta karşılaştırması HATA: {e}")

    # =====================================================================
    # ADIM 2: Model eğitimi
    # =====================================================================
    print("\n" + "="*70)
    print("ADIM 2: Model eğitimi")
    print("="*70)
    print(f"📚 Eğitim verisi: {this_week_monday} tarihine KADAR (dahil değil)")

    try:
        model, mae, rmse, mape = train_model(end_date=this_week_monday)
        print(f"\n✅ Model eğitimi tamamlandı!")
        print(f"   Test performansı: MAE={mae:.2f} TRY, MAPE={mape:.2f}%")
    except Exception as e:
        print(f"\n❌ Model eğitimi HATA: {e}")
        import traceback
        traceback.print_exc()
        return False

    # =====================================================================
    # ADIM 3: Bu hafta tahmini
    # =====================================================================
    print("\n" + "="*70)
    print("ADIM 3: Bu hafta tahmini")
    print("="*70)
    print(f"🔮 Tahmin aralığı: {this_week_monday} - {this_week_sunday}")

    try:
        # Prophet modelini yükle
        from prophet.serialize import model_from_json
        model_path = os.path.join(script_dir, '../../models/prophet_model.json')

        with open(model_path, 'r') as f:
            model = model_from_json(f.read())

        # Bu hafta için 7 günlük tahmin yap
        import pandas as pd
        future = model.make_future_dataframe(periods=7*24, freq='H')

        # FEATURE ENGINEERING: Gelecek tarihler için de feature'ları ekle
        print("   [*] Feature engineering uygulanıyor...")
        future['hour'] = future['ds'].dt.hour
        future['is_weekend'] = (future['ds'].dt.dayofweek >= 5).astype(int)
        future['is_peak_hour'] = future['hour'].isin([8, 9, 10, 18, 19, 20, 21]).astype(int)
        future['is_daytime'] = future['hour'].isin(range(10, 16)).astype(int)
        future['day_of_week'] = future['ds'].dt.dayofweek

        forecast = model.predict(future)

        # Sadece bu haftanın tahminlerini al
        last_history_date = model.history['ds'].max()
        future_forecast = forecast[forecast['ds'] > last_history_date]

        # İlk 168 saati al (7 gün * 24 saat)
        future_forecast = future_forecast.head(168)

        print(f"✅ {len(future_forecast)} saatlik tahmin üretildi")

        # Tahminleri database'e kaydet
        from predict import save_forecast_to_db, save_forecast_csv, visualize_forecast

        save_forecast_to_db(future_forecast, this_week_monday, this_week_sunday)

        # CSV ve grafik kaydet
        save_forecast_csv(future_forecast, days=7)
        visualize_forecast(future_forecast, days=7)

        print(f"✅ Tahminler CSV ve grafiğe kaydedildi")

    except Exception as e:
        print(f"\n❌ Tahmin yapma HATA: {e}")
        import traceback
        traceback.print_exc()
        return False

    # =====================================================================
    # ADIM 4: JSON Export
    # =====================================================================
    print("\n" + "="*70)
    print("ADIM 4: JSON Export (Frontend için)")
    print("="*70)

    try:
        export_forecasts()
        print(f"✅ JSON export tamamlandı")
    except Exception as e:
        print(f"\n❌ JSON export HATA: {e}")
        import traceback
        traceback.print_exc()

    # =====================================================================
    # ÖZET
    # =====================================================================
    print("\n" + "="*70)
    print("✅ HAFTALİK İŞ AKIŞI TAMAMLANDI!")
    print("="*70)
    print(f"📅 Yeni hafta tahmini hazır: {this_week_monday} - {this_week_sunday}")
    print(f"📊 Geçen hafta performansı kaydedildi")
    print(f"📁 JSON dosyası frontend için güncellendi")
    print("="*70)

    return True

def main():
    """Ana fonksiyon"""
    try:
        success = run_weekly_cycle()
        if success:
            print("\n✅ İşlem başarılı!")
            sys.exit(0)
        else:
            print("\n❌ İşlem başarısız!")
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
