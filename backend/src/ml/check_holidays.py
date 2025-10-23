#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Prophet modelinin hangi tatilleri tanıdığını kontrol eder
"""

from prophet import Prophet
import pandas as pd

# Boş model oluştur ve Türkiye tatillerini ekle
model = Prophet()
model.add_country_holidays('TR')

# Tatil listesini al
print("="*60)
print("Prophet'in Otomatik Ekledigi Turkiye Tatilleri:")
print("="*60)

# 2024-2025 yılları için tatilleri göster
holidays_2024_2025 = model.train_holiday_names if hasattr(model, 'train_holiday_names') else []

# Prophet'in holidays modülünü kullanarak kontrol
from holidays import Turkey
tr_holidays = Turkey(years=[2024, 2025])

print("\n2024 Tatilleri:")
for date, name in sorted(tr_holidays.items()):
    if date.year == 2024:
        print(f"  {date}: {name}")

print("\n2025 Tatilleri:")
for date, name in sorted(tr_holidays.items()):
    if date.year == 2025:
        print(f"  {date}: {name}")

print("\n" + "="*60)
print("NOT: Ramazan ve Kurban Bayrami OTOMATIK eklenmez!")
print("Bunlari manuel olarak ekledik (22 gun)")
print("="*60)
