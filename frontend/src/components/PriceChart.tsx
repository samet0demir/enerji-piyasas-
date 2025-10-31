import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PriceData {
  date: string;
  hour: string;
  price: number;
}

interface Props {
  data: PriceData[];
}

export default function PriceChart({ data }: Props) {
  // Son 48 saat (2 gün) verisi göster
  const recentData = data.slice(-48).map(item => ({
    time: `${item.date.split('T')[0]} ${item.hour}`,
    price: item.price
  }));

  return (
    <div className="chart-container">
      <h2>MCP Fiyatları (Son 48 Saat)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={recentData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            interval={11} // Her 12. değeri göster (her 12 saat)
          />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#8884d8"
            name="Fiyat (TL/MWh)"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
