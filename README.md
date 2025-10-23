# EPİAŞ MCP Fiyat Tahmin Sistemi

> Türkiye elektrik piyasasında saatlik elektrik fiyatlarını (MCP - Market Clearing Price) makine öğrenmesi ile 7 gün önceden tahmin eden sistem.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)]()
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)]()
[![Prophet](https://img.shields.io/badge/Prophet-Time%20Series-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)]()
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)]()

---

## 📊 Proje Özeti

Bu proje, **EPİAŞ (Enerji Piyasaları İşletme A.Ş.)** Şeffaflık Platformu'ndan alınan gerçek piyasa verilerini kullanarak, **Facebook Prophet** zaman serisi modeli ile elektrik fiyat tahminleri yapar.

### Temel Özellikler

- ✅ **2 yıllık geçmiş veri** (17,712+ saatlik kayıt)
- ✅ **7 günlük tahmin** (168 saatlik detay)
- ✅ **Otomatik veri toplama** (günlük senkronizasyon)
- ✅ **Haftalık model güncelleme** (her Pazar otomatik eğitim)
- ✅ **REST API** (tahminleri sunmak için)
- ✅ **%14.7 MAPE** (akademik standartlarda "iyi" seviye)

---

## 🎯 Kullanım Alanları

1. **Enerji Tüccarları** - Alım-satım kararları için fiyat tahminleri
2. **Sanayi Tesisleri** - Üretim planlaması (ucuz saatlerde operasyon)
3. **Enerji Perakende Şirketleri** - Fiyatlandırma stratejileri
4. **Araştırmacılar** - Enerji piyasası analizi ve akademik çalışmalar

---

## 📈 Model Performansı

### Metrikler (Son 30 Gün Test Seti)

| Metrik | Değer | Açıklama |
|--------|-------|----------|
| **MAE** | 429 TRY | Ortalama mutlak hata |
| **RMSE** | 574 TRY | Kök ortalama kare hata |
| **MAPE** | 14.7% | Yüzde hata (100+ TRY fiyatlar) |

**Sektör Standartları:**
- MAPE < 10%: Mükemmel ⭐⭐⭐
- MAPE 10-15%: İyi ⭐⭐ **(Bizim modelimiz bu seviyede)**
- MAPE 15-20%: Kabul edilebilir ⭐
- MAPE > 20%: Zayıf

### Örnek Tahminler

```
Tarih: 23 Ekim 2025 (Çarşamba)

00:00 → 3,065 TRY (güven aralığı: 2,032 - 4,066)
12:00 → 2,285 TRY (güven aralığı: 1,303 - 3,271)
18:00 → 3,371 TRY (güven aralığı: 2,365 - 4,409)
```

---

## 🚀 Hızlı Başlangıç

### Gereksinimler

- **Node.js** 18+ (TypeScript backend için)
- **Python** 3.9+ (Prophet modeli için)
- **Git** (projeyi klonlamak için)

### Kurulum

```bash
# 1. Projeyi klonla
git clone https://github.com/yourusername/epias-mcp-forecast.git
cd epias-mcp-forecast

# 2. Backend kurulumu
cd backend
npm install

# 3. Python sanal ortam oluştur
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# 4. Python bağımlılıklarını kur
pip install -r requirements.txt

# 5. Çevre değişkenlerini ayarla
copy .env.example .env
# .env dosyasını düzenle (EPİAŞ kimlik bilgileri)

# 6. Veritabanını başlat
npm run dev  # İlk çalıştırmada otomatik oluşur
```

### EPİAŞ Kimlik Bilgileri

`.env` dosyasına ekle:

```env
EPIAS_USERNAME=your_email@example.com
EPIAS_PASSWORD=your_password
```

**EPİAŞ hesabı yoksa:** [https://giris.epias.com.tr](https://giris.epias.com.tr) adresinden ücretsiz kayıt olabilirsiniz.

---

## 💻 Kullanım

### 1. Backend API'yi Başlat

```bash
cd backend
npm run dev
```

API şu adreste çalışır: `http://localhost:5001`

### 2. İlk Veri Toplama (Tek Seferlik)

```bash
# Eksik günleri çek (örnek: son 6 gün)
npx tsx src/scripts/fetchMissingData.ts
```

### 3. Model Eğitimi

```bash
# Python venv'i aktifleştir
.\venv\Scripts\activate

# Modeli eğit
python src/ml/train_prophet.py
```

**Süre:** ~10-15 saniye
**Çıktı:** `models/prophet_model.json` (eğitilmiş model)

### 4. Tahmin Üretme

```bash
# 7 günlük tahmin
python src/ml/predict.py 7
```

**Çıktı:** `src/ml/forecasts/forecast_7days.csv` (168 saatlik tahmin)

### 5. API Üzerinden Tahmin Alma

```bash
# REST API ile
curl http://localhost:5001/api/predictions/7
```

---

## 🤖 Otomasyon (Önerilen)

### Windows Task Scheduler ile Otomatik Çalıştırma

```bash
# Yönetici olarak çalıştır
backend/setup-scheduler.bat
```

**Oluşturulan görevler:**
1. **Günlük veri toplama** - Her gün saat 02:00
2. **Haftalık model eğitimi** - Her Pazar saat 03:00

**Detaylı kullanım:** [OTOMASYON_KULLANIMI.md](OTOMASYON_KULLANIMI.md) dosyasına bakın.

---

## 📁 Proje Yapısı

```
enerji/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server
│   │   ├── routes/
│   │   │   └── predictions.ts    # Tahmin API endpoint'leri
│   │   ├── services/
│   │   │   ├── database.ts       # SQLite veritabanı
│   │   │   └── epiasClient.ts    # EPİAŞ API client
│   │   ├── ml/
│   │   │   ├── train_prophet.py  # Model eğitimi
│   │   │   └── predict.py        # Tahmin üretimi
│   │   └── scripts/
│   │       ├── dailyDataSync.ts  # Günlük veri toplama
│   │       └── weeklyModelTraining.ts  # Haftalık eğitim
│   ├── data/
│   │   └── energy.db             # SQLite veritabanı (17,712 kayıt)
│   ├── models/
│   │   └── prophet_model.json    # Eğitilmiş model
│   └── logs/                     # İşlem logları
├── TEKNIK_RAPOR.md               # Detaylı teknik dokümantasyon
├── IYILESTIRME_PLANI.md          # Gelecek geliştirmeler
└── README.md                     # Bu dosya
```

---

## 🔧 Teknik Detaylar

### Kullanılan Teknolojiler

**Backend:**
- Node.js + TypeScript
- Express.js (REST API)
- better-sqlite3 (veritabanı)
- axios (HTTP istekleri)

**Machine Learning:**
- Python 3.9+
- Facebook Prophet (zaman serisi tahmini)
- pandas (veri işleme)
- numpy (numerik hesaplamalar)

**Veritabanı:**
- SQLite (dosya tabanlı, basit kurulum)

### Model Yaklaşımı

**Neden Prophet?**
1. ✅ Saatlik, günlük, yıllık döngüleri otomatik yakalar
2. ✅ Tatil günlerini modelleyebilir (Ramazan/Kurban Bayramı)
3. ✅ Eksik veri ve aykırı değerlere dayanıklı
4. ✅ Güven aralıkları verir (risk yönetimi için kritik)
5. ✅ Hızlı eğitim (10-15 saniye)

**Modelin öğrendiği paternler:**
- **Saatlik:** Gece düşük, akşam yüksek (pik saatleri)
- **Günlük:** Hafta içi yüksek, Pazar düşük
- **Yıllık:** Kış yüksek (ısınma), yaz değişken (klima vs solar)
- **Tatil:** Bayramlarda düşük talep

---

## 📊 API Dokümantasyonu

### Endpoint'ler

#### 1. Tahmin Al

```http
GET /api/predictions/:days
```

**Parametreler:**
- `days` (path): Tahmin gün sayısı (1-7 arası)

**Örnek:**
```bash
curl http://localhost:5001/api/predictions/7
```

#### 2. Sunucu Durumu

```http
GET /api/health
```

---

## 🐛 Bilinen Limitasyonlar

### Mevcut Model (v1.0)

1. **Univariate yaklaşım** - Sadece geçmiş MCP verisini kullanır
   - Talep, üretim, gaz fiyatı gibi sürücüler dahil değil
   - **Çözüm:** Faz 3 geliştirmelerinde multivariate model

2. **Spike yakalayamama** - Ani fiyat sıçramalarını tahmin edemez
   - Örn: Santral arızası, gaz kesintisi
   - **Çözüm:** İki aşamalı model (classification + regression)

3. **7 günden uzun tahmin güvenilmez** - Uzun vadede doğruluk düşer
   - **Kabul edilen sınırlama:** Kısa vadeli tahmin odaklı sistem

### Gelecek İyileştirmeler

Detaylı iyileştirme planı için: [IYILESTIRME_PLANI.md](IYILESTIRME_PLANI.md)

**Öncelikli:**
- [ ] Multivariate model (talep + üretim + hava durumu)
- [ ] XGBoost ensemble
- [ ] P&L (kar/zarar) simülasyonu
- [ ] Drift detection (model bozulma tespiti)

---

## 📝 Lisans

Bu proje MIT lisansı altında açık kaynaklıdır.

---

## 👤 Geliştirici

**Samet Demir**
- LinkedIn: [linkedin.com/in/samet-demir](https://linkedin.com/in/samet-demir)
- Email: demirsamett11@gmail.com

---

## 📚 Ek Kaynaklar

- [TEKNIK_RAPOR.md](TEKNIK_RAPOR.md) - Detaylı teknik dokümantasyon
- [IYILESTIRME_PLANI.md](IYILESTIRME_PLANI.md) - Gelecek geliştirmeler roadmap
- [OTOMASYON_KULLANIMI.md](OTOMASYON_KULLANIMI.md) - Otomasyon kurulum rehberi
- [EPİAŞ Şeffaflık Platformu](https://seffaflik.epias.com.tr) - Resmi veri kaynağı

---

**Son Güncelleme:** 22 Ekim 2025
**Versiyon:** 1.0 (MVP)
**Durum:** Üretim için hazır (otomasyon kurulumu gerekli)
