import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css'; // Stil dosyasını dahil edelim
// Backend API'mizin adresi
const API_URL = 'http://localhost:5001/api/health';
  function App() {
  //Gelen mesajı, yüklenme durumunu ve olası hataları saklamak için state'ler
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bu hook, component ilk render edildiğinde sadece bir kez çalışır
  useEffect(() => {
    // Backend'e istek atmak için bir fonksiyon
    const fetchHealthStatus = async () => {
      try {
        // Axios ile GET isteği atıyoruz
        const response = await axios.get(API_URL);
        // İstek başarılıysa, backend'den gelen mesajı state'e kaydediyoruz
        if (response.data && response.data.status === 'UP') {
        setMessage(`Backend Durumu: ${response.data.status} - Mesaj: "${response.data.message}"`);
          } else {
            throw new Error('Beklenen formatta cevap alınamadı.');
          }
        } catch (err) {
          // Bir hata olursa, hata mesajını state'e kaydediyoruz
          setError('Backend ile bağlantı kurulamadı. Backend sunucusunun çalıştığından emin olun.');
          console.error(err);
        } finally {
        // Her durumda (başarılı veya hatalı), yüklenme durumunu bitiriyoruz
        setIsLoading(false);
        }
  };

  fetchHealthStatus(); // Fonksiyonu çağır
}, []); // Boş dependency array `[]` -> "sadece ilk başta çalış" demek

return (
  <div className="container">
    <h1>Enerji Projesi Frontend</h1>
    <div className="status-box">
      {isLoading && <p>Backend'e bağlanılıyor...</p>}
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
    </div>
  </div>
  );
}
export default App;