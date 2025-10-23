#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
EPİAŞ MCP Fiyat Tahmini - Prophet Model Eğitimi
================================================

Bu script:
1. SQLite veri tabanından 2 yıllık MCP verilerini çeker
2. Türkiye resmi tatillerini otomatik ekler
3. Ramazan ve Kurban Bayramı tarihlerini manuel ekler
4. Prophet modelini eğitir ve kaydeder
5. Model performansını değerlendirir
"""

import pandas as pd
import numpy as np
from prophet import Prophet
import sqlite3
import json
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import os

# Veri tabanı yolu
DB_PATH = os.path.join(os.path.dirname(__file__), '../../data/energy.db')
MODEL_PATH = os.path.join(os.path.dirname(__file__), '../../models/prophet_model.json')

def load_data_from_db():
    """
    SQLite veri tabanından MCP verilerini yükler
    Returns:
        pd.DataFrame: 'ds' (tarih-saat) ve 'y' (fiyat) kolonları
    """
    print("[*] Veri tabanından MCP verileri yükleniyor...")

    conn = sqlite3.connect(DB_PATH)

    # MCP verilerini çek (date kolonu zaten ISO8601 formatında tam tarih-saat içeriyor)
    query = """
        SELECT
            date as ds,
            price as y
        FROM mcp_data
        ORDER BY date
    """

    df = pd.read_sql_query(query, conn)
    conn.close()

    # Tarih formatını düzelt ve timezone kaldır (Prophet timezone desteklemiyor)
    df['ds'] = pd.to_datetime(df['ds']).dt.tz_localize(None)

    print(f"[+] {len(df)} kayit yuklendi")
    print(f"[*] Tarih araligi: {df['ds'].min()} -> {df['ds'].max()}")
    print(f"[*] Fiyat araligi: {df['y'].min():.2f} TRY -> {df['y'].max():.2f} TRY")
    print(f"[*] Ortalama fiyat: {df['y'].mean():.2f} TRY")

    return df

def create_turkish_holidays():
    """
    Türkiye'ye özel tatil günlerini oluşturur

    Returns:
        pd.DataFrame: Tatil tarihleri ve isimleri
    """
    print("\n[*] Turk tatilleri olusturuluyor...")

    holidays = pd.DataFrame({
        'holiday': [
            # 2024 Ramazan Bayramı (6-14 Nisan, uzatmalı)
            'Ramazan_Bayrami', 'Ramazan_Bayrami', 'Ramazan_Bayrami',
            'Ramazan_Bayrami', 'Ramazan_Bayrami', 'Ramazan_Bayrami',
            'Ramazan_Bayrami', 'Ramazan_Bayrami', 'Ramazan_Bayrami',

            # 2024 Kurban Bayramı (15-19 Haziran)
            'Kurban_Bayrami', 'Kurban_Bayrami', 'Kurban_Bayrami',
            'Kurban_Bayrami', 'Kurban_Bayrami',

            # 2025 Ramazan Bayramı (29 Mart - 1 Nisan)
            'Ramazan_Bayrami', 'Ramazan_Bayrami', 'Ramazan_Bayrami',

            # 2025 Kurban Bayramı (5-9 Haziran)
            'Kurban_Bayrami', 'Kurban_Bayrami', 'Kurban_Bayrami',
            'Kurban_Bayrami', 'Kurban_Bayrami',
        ],
        'ds': pd.to_datetime([
            # 2024 Ramazan (9 günlük uzatma)
            '2024-04-06', '2024-04-07', '2024-04-08', '2024-04-09', '2024-04-10',
            '2024-04-11', '2024-04-12', '2024-04-13', '2024-04-14',

            # 2024 Kurban
            '2024-06-15', '2024-06-16', '2024-06-17', '2024-06-18', '2024-06-19',

            # 2025 Ramazan
            '2025-03-29', '2025-03-30', '2025-04-01',

            # 2025 Kurban
            '2025-06-05', '2025-06-06', '2025-06-07', '2025-06-08', '2025-06-09',
        ]),
        'lower_window': 0,
        'upper_window': 1,  # Bayram öncesi gün etkisini de yakala
    })

    print(f"[+] {len(holidays)} bayram gunu eklendi:")
    print(f"   - Ramazan Bayrami: {len(holidays[holidays['holiday']=='Ramazan_Bayrami'])} gun")
    print(f"   - Kurban Bayrami: {len(holidays[holidays['holiday']=='Kurban_Bayrami'])} gun")

    return holidays

def train_prophet_model(df, holidays):
    """
    Prophet modelini eğitir

    Args:
        df: Eğitim verisi
        holidays: Tatil günleri

    Returns:
        Prophet: Eğitilmiş model
    """
    print("\n[*] Prophet modeli egitiliyor...")

    model = Prophet(
        # Tatil günleri
        holidays=holidays,

        # Mevsimsellik ayarları
        daily_seasonality=True,   # Gün içi saatlik desenleri yakala (00:00-23:00)
        weekly_seasonality=True,  # Hafta sonu etkisini yakala (Pazar 0 TRY fiyatları)
        yearly_seasonality=True,  # Mevsimsel desenleri yakala (yaz/kış)

        # Değişim noktaları (trend değişiklikleri)
        changepoint_prior_scale=0.05,  # Trend esnekliği (düşük = daha stabil)

        # Bayram etkisi gücü
        holidays_prior_scale=10.0,  # Yüksek = bayramlar güçlü etki

        # Mevsimsellik esnekliği
        seasonality_prior_scale=10.0,

        # Tahmin aralığı genişliği
        interval_width=0.95,  # %95 güven aralığı
    )

    # Türkiye resmi tatillerini ekle (23 Nisan, 1 Mayıs, 19 Mayıs, 30 Ağustos, 29 Ekim)
    model.add_country_holidays(country_name='TR')

    print("   [*] Egitim basliyor (bu birkac dakika surebilir)...")
    model.fit(df)

    print("[+] Model egitimi tamamlandi!")

    return model

def evaluate_model(model, df):
    """
    Modeli mevcut veri üzerinde değerlendirir

    Args:
        model: Eğitilmiş Prophet modeli
        df: Test verisi
    """
    print("\n[*] Model performansi degerlendiriliyor...")

    # Train/test split (son 30 gün test)
    split_date = df['ds'].max() - timedelta(days=30)
    test = df[df['ds'] > split_date]

    print(f"   Test seti: {len(test)} kayit ({test['ds'].min()} -> {test['ds'].max()})")

    # Mevcut model ile test seti için tahmin (yeniden eğitim yapmadan)
    forecast = model.predict(test[['ds']])

    # Performans metrikleri
    y_true = test['y'].values
    y_pred = forecast['yhat'].values

    mae = np.mean(np.abs(y_true - y_pred))
    rmse = np.sqrt(np.mean((y_true - y_pred)**2))

    # MAPE hesapla (sıfır değerleri filtrele)
    mask = y_true != 0
    if mask.sum() > 0:
        mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100
    else:
        mape = 0.0

    print(f"\n[*] Performans Metrikleri (Son 30 Gun):")
    print(f"   MAE (Ortalama Mutlak Hata): {mae:.2f} TRY")
    print(f"   RMSE (Kok Ortalama Kare Hata): {rmse:.2f} TRY")
    print(f"   MAPE (Ortalama Yuzde Hata): {mape:.2f}%")

    # Görselleştirme
    plt.figure(figsize=(15, 6))
    plt.plot(test['ds'], y_true, label='Gercek', color='blue', alpha=0.7)
    plt.plot(test['ds'], y_pred, label='Tahmin', color='red', alpha=0.7)
    plt.fill_between(test['ds'],
                     forecast['yhat_lower'],
                     forecast['yhat_upper'],
                     alpha=0.2, color='red', label='%95 Guven Araligi')
    plt.xlabel('Tarih')
    plt.ylabel('Fiyat (TRY/MWh)')
    plt.title('Prophet Model Performansi - Son 30 Gun')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.xticks(rotation=45)
    plt.tight_layout()

    chart_path = os.path.join(os.path.dirname(__file__), '../../models/test_performance.png')
    plt.savefig(chart_path, dpi=150)
    print(f"\n[*] Grafik kaydedildi: {chart_path}")

    return mae, rmse, mape

def save_model(model):
    """
    Eğitilmiş modeli JSON formatında kaydeder

    Args:
        model: Eğitilmiş Prophet modeli
    """
    print(f"\n[*] Model kaydediliyor: {MODEL_PATH}")

    # Model parametrelerini kaydet
    from prophet.serialize import model_to_json
    with open(MODEL_PATH, 'w') as f:
        f.write(model_to_json(model))

    print("[+] Model basariyla kaydedildi!")

def main():
    """Ana eğitim fonksiyonu"""
    print("="*60)
    print("EPIAS MCP Fiyat Tahmini - Prophet Model Egitimi")
    print("="*60)

    # 1. Veri yükleme
    df = load_data_from_db()

    # 2. Tatil günlerini oluştur
    holidays = create_turkish_holidays()

    # 3. Modeli eğit
    model = train_prophet_model(df, holidays)

    # 4. Performansı değerlendir
    mae, rmse, mape = evaluate_model(model, df)

    # 5. Modeli kaydet
    save_model(model)

    print("\n" + "="*60)
    print("[+] Egitim tamamlandi!")
    print("="*60)
    print(f"[*] Model Ozeti:")
    print(f"   - Toplam veri: {len(df)} saat")
    print(f"   - Test performansi: MAE={mae:.2f} TRY, MAPE={mape:.2f}%")
    print(f"   - Model dosyasi: {MODEL_PATH}")
    print("="*60)

if __name__ == "__main__":
    main()
