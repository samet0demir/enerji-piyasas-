// API Configuration
const API_BASE_URL = 'http://localhost:5001/api';

// Global state
let chartInstance = null;
let autoRefreshInterval = null;
let currentData = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadPredictions(7);
});

// Event Listeners
function initializeEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        const days = parseInt(document.getElementById('daysSelect').value);
        loadPredictions(days);
    });

    // Days select
    document.getElementById('daysSelect').addEventListener('change', (e) => {
        const days = parseInt(e.target.value);
        loadPredictions(days);
    });

    // Auto refresh checkbox
    document.getElementById('autoRefresh').addEventListener('change', (e) => {
        if (e.target.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
}

// Load predictions from API
async function loadPredictions(days) {
    try {
        showLoading();

        const response = await fetch(`${API_BASE_URL}/predictions/${days}`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error('API returned error');
        }

        currentData = result.data;

        // Update UI
        updateSummaryCards(currentData.summary, currentData.forecasts);
        updateChart(currentData.forecasts);
        updateTable(currentData.forecasts);
        updateLastUpdateTime();

        hideLoading();

    } catch (error) {
        console.error('Error loading predictions:', error);
        showError('Veri yüklenirken hata oluştu. Lütfen tekrar deneyin.');
        hideLoading();
    }
}

// Update summary cards
function updateSummaryCards(summary, forecasts) {
    // Min price
    const minForecast = forecasts.reduce((min, f) =>
        f.predicted_price < min.predicted_price ? f : min
    );
    document.getElementById('minPrice').textContent = formatPrice(summary.min_price);
    document.getElementById('minPriceDate').textContent = formatDateTime(minForecast.date);

    // Max price
    const maxForecast = forecasts.reduce((max, f) =>
        f.predicted_price > max.predicted_price ? f : max
    );
    document.getElementById('maxPrice').textContent = formatPrice(summary.max_price);
    document.getElementById('maxPriceDate').textContent = formatDateTime(maxForecast.date);

    // Average price
    document.getElementById('avgPrice').textContent = formatPrice(summary.avg_price);
    document.getElementById('avgPriceInfo').textContent = `${summary.days} günlük ortalama`;
}

// Update chart
function updateChart(forecasts) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    // Prepare data
    const labels = forecasts.map(f => {
        const date = new Date(f.date);
        const day = date.getDate();
        const month = date.toLocaleDateString('tr-TR', { month: 'short' });
        const hour = date.getHours().toString().padStart(2, '0');
        return `${day} ${month} ${hour}:00`;
    });

    const predictedPrices = forecasts.map(f => f.predicted_price);
    const lowerBounds = forecasts.map(f => f.lower_bound);
    const upperBounds = forecasts.map(f => f.upper_bound);

    // Destroy existing chart
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Create new chart
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Tahmin Fiyat',
                    data: predictedPrices,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: 'rgb(59, 130, 246)',
                    pointHoverBorderColor: 'white',
                    pointHoverBorderWidth: 2
                },
                {
                    label: 'Alt Sınır',
                    data: lowerBounds,
                    borderColor: 'rgb(156, 163, 175)',
                    backgroundColor: 'rgba(156, 163, 175, 0.05)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Üst Sınır',
                    data: upperBounds,
                    borderColor: 'rgb(156, 163, 175)',
                    backgroundColor: 'rgba(156, 163, 175, 0.05)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: '-1',
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (context) => {
                            return context[0].label;
                        },
                        label: (context) => {
                            const datasetLabel = context.dataset.label;
                            const value = formatPrice(context.parsed.y);
                            return `${datasetLabel}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 20
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: (value) => formatPrice(value)
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

// Update table - Günlük özet + detay
function updateTable(forecasts) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    // Günlere grupla
    const dailyGroups = groupByDay(forecasts);

    // Her gün için özet satır oluştur
    Object.keys(dailyGroups).forEach((dateKey, index) => {
        const dayForecasts = dailyGroups[dateKey];
        const dayStats = calculateDayStats(dayForecasts);

        // Özet satır
        const summaryRow = document.createElement('tr');
        summaryRow.className = 'table-row bg-gray-50 hover:bg-gray-100 cursor-pointer font-medium';
        summaryRow.dataset.day = dateKey;
        summaryRow.dataset.expanded = 'false';

        summaryRow.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                    <span>${formatDayName(dateKey)}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                ${formatPrice(dayStats.avg)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                ${formatPrice(dayStats.min)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                ${formatPrice(dayStats.max)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">${dayForecasts.length} saat</span>
            </td>
        `;

        // Tıklama eventi
        summaryRow.addEventListener('click', () => toggleDayDetails(dateKey, dayForecasts));

        tbody.appendChild(summaryRow);

        // Detay satırları (başlangıçta gizli)
        const detailsContainer = document.createElement('tr');
        detailsContainer.id = `details-${dateKey}`;
        detailsContainer.className = 'hidden';
        detailsContainer.innerHTML = `
            <td colspan="5" class="px-0 py-0">
                <div class="bg-white border-t border-b">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-12 py-2 text-left text-xs font-medium text-gray-500">Saat</th>
                                <th class="px-6 py-2 text-right text-xs font-medium text-gray-500">Tahmin</th>
                                <th class="px-6 py-2 text-right text-xs font-medium text-gray-500">Alt Sınır</th>
                                <th class="px-6 py-2 text-right text-xs font-medium text-gray-500">Üst Sınır</th>
                                <th class="px-6 py-2 text-right text-xs font-medium text-gray-500">Belirsizlik</th>
                            </tr>
                        </thead>
                        <tbody id="details-body-${dateKey}">
                        </tbody>
                    </table>
                </div>
            </td>
        `;

        tbody.appendChild(detailsContainer);
    });
}

// Günlük detayları aç/kapat
function toggleDayDetails(dateKey, dayForecasts) {
    const detailsRow = document.getElementById(`details-${dateKey}`);
    const summaryRow = document.querySelector(`[data-day="${dateKey}"]`);
    const arrow = summaryRow.querySelector('svg');
    const isExpanded = summaryRow.dataset.expanded === 'true';

    if (isExpanded) {
        // Kapat
        detailsRow.classList.add('hidden');
        summaryRow.dataset.expanded = 'false';
        arrow.style.transform = 'rotate(0deg)';
    } else {
        // Aç
        detailsRow.classList.remove('hidden');
        summaryRow.dataset.expanded = 'true';
        arrow.style.transform = 'rotate(90deg)';

        // Detayları doldur (ilk açılışta)
        const detailsBody = document.getElementById(`details-body-${dateKey}`);
        if (detailsBody.children.length === 0) {
            dayForecasts.forEach(forecast => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50';

                const uncertainty = forecast.upper_bound - forecast.lower_bound;
                const priceClass = getPriceClass(forecast.predicted_price);

                const date = new Date(forecast.date);
                const hour = date.getHours().toString().padStart(2, '0') + ':00';

                tr.innerHTML = `
                    <td class="px-12 py-2 whitespace-nowrap text-sm text-gray-600">${hour}</td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm text-right ${priceClass}">${formatPrice(forecast.predicted_price)}</td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-600">${formatPrice(forecast.lower_bound)}</td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-600">${formatPrice(forecast.upper_bound)}</td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-500">±${formatPrice(uncertainty / 2)}</td>
                `;

                detailsBody.appendChild(tr);
            });
        }
    }
}

// Günlük istatistikler hesapla
function calculateDayStats(forecasts) {
    const prices = forecasts.map(f => f.predicted_price);
    return {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: prices.reduce((a, b) => a + b, 0) / prices.length
    };
}

// Günlere grupla
function groupByDay(forecasts) {
    const groups = {};

    forecasts.forEach(forecast => {
        const date = new Date(forecast.date);
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }

        groups[dateKey].push(forecast);
    });

    return groups;
}

// Update last update time
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = timeString;
}

// Auto refresh
function startAutoRefresh() {
    if (autoRefreshInterval) return;

    autoRefreshInterval = setInterval(() => {
        const days = parseInt(document.getElementById('daysSelect').value);
        loadPredictions(days);
    }, 5 * 60 * 1000); // 5 minutes

    console.log('Auto refresh started (5 minutes)');
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log('Auto refresh stopped');
    }
}

// Utility functions
function formatPrice(price) {
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price) + ' TRY';
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('tr-TR', { month: 'short' });
    const year = date.getFullYear();
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const dayName = date.toLocaleDateString('tr-TR', { weekday: 'long' });

    return `${day} ${month} ${year}, ${hour}:${minute} (${dayName})`;
}

function formatDateTimeFull(dateString) {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');

    return `${day}.${month}.${year} ${hour}:${minute}`;
}

function formatDayName(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('tr-TR', { month: 'long' });
    const year = date.getFullYear();
    const dayName = date.toLocaleDateString('tr-TR', { weekday: 'long' });

    return `${day} ${month} ${year} (${dayName})`;
}

function getPriceClass(price) {
    if (price > 3000) return 'price-high';
    if (price < 2000) return 'price-low';
    return 'price-medium';
}

function showLoading() {
    document.getElementById('refreshBtn').disabled = true;
    document.getElementById('refreshBtn').innerHTML = `
        <div class="loading"></div>
        <span>Yükleniyor...</span>
    `;
}

function hideLoading() {
    document.getElementById('refreshBtn').disabled = false;
    document.getElementById('refreshBtn').innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        <span>Yenile</span>
    `;
}

function showError(message) {
    alert(message);
}
