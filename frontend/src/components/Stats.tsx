interface StatsProps {
  latestPrice?: number;
  avgPrice?: number;
  minPrice?: number;
  maxPrice?: number;
}

export default function Stats({ latestPrice, avgPrice, minPrice, maxPrice }: StatsProps) {
  return (
    <div className="stats-container">
      <div className="stat-card">
        <h3>Son Fiyat</h3>
        <p className="stat-value">{latestPrice ? `${latestPrice.toFixed(2)} TL` : '-'}</p>
      </div>
      <div className="stat-card">
        <h3>Ortalama (48h)</h3>
        <p className="stat-value">{avgPrice ? `${avgPrice.toFixed(2)} TL` : '-'}</p>
      </div>
      <div className="stat-card">
        <h3>Minimum (48h)</h3>
        <p className="stat-value">{minPrice ? `${minPrice.toFixed(2)} TL` : '-'}</p>
      </div>
      <div className="stat-card">
        <h3>Maksimum (48h)</h3>
        <p className="stat-value">{maxPrice ? `${maxPrice.toFixed(2)} TL` : '-'}</p>
      </div>
    </div>
  );
}
