const tg = window.Telegram?.WebApp;
if (tg) {
  const tg = window.Telegram.WebApp;
  tg.ready(); // Явно указываем, что приложение готово
  tg.expand();
  tg.enableClosingConfirmation();
  console.log('WebApp initialized:', tg.initDataUnsafe);
} else {
  console.warn('Telegram WebApp not detected, running in browser mode');
}
// Конфигурация
const API_BASE_URL = 'http://localhost:3000/api';
const IS_TELEGRAM_WEBAPP = !!window.Telegram?.WebApp;
const IS_DEVELOPMENT = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Проверка доступности API
async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) throw new Error('API не отвечает');
        const data = await response.json();
        return data.status === 'healthy';
    } catch (error) {
        console.error('Health check failed:', error);
        return false;
    }
} 

let appState = {
  requests: [],
  stats: {
    new: 0,
    in_progress: 0,
    completed: 0
  }
};

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showAlert('Произошла непредвиденная ошибка');
});

// Универсальный метод для запросов
async function makeRequest(url, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (window.Telegram?.WebApp?.initData) {
    headers['Telegram-Init-Data'] = window.Telegram.WebApp.initData;
  }

    const config = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || errorData.message || `Ошибка ${response.status}`;
            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (error) {
        console.error(`Request to ${url} failed:`, error);
        throw error;
    }
}

function showErrorState(message) {
  const container = document.getElementById('requests-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="error-state">
      <p>${message}</p>
      <button onclick="loadRequests()" class="retry-btn">Повторить попытку</button>
    </div>
  `;
}
// Безопасное отображение сообщений
function showAlert(message, duration = 3000) {
  try {
    // Пытаемся использовать Telegram WebApp alert
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert(message);
    } else {
      // Fallback для браузера
      showFallbackAlert(message, duration);
    }
  } catch (e) {
    console.error('Show alert error:', e);
    showFallbackAlert(message, duration);
  }
}

function showFallbackAlert(message, duration) {
  const alertEl = document.createElement('div');
  alertEl.className = 'custom-alert';
  alertEl.textContent = message;
  document.body.appendChild(alertEl);

  setTimeout(() => {
    alertEl.remove();
  }, duration);
}

// Загрузка заявок
async function loadRequests() {
  try {
    const tg = window.Telegram?.WebApp;
    const url = new URL(`${API_BASE_URL}/requests`);
    
    if (tg?.initDataUnsafe?.id) {
      url.searchParams.append('id', tg.initDataUnsafe.id);
    }
    
    const statusFilter = document.getElementById('status-filter')?.value;
    if (statusFilter && statusFilter !== 'all') {
      url.searchParams.append('status', statusFilter);
    }
    
    console.log('Fetching from:', url.toString());
    
    const response = await fetch(url.toString(), {
      headers: {
        'Telegram-Init-Data': tg?.initData || '',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    appState.requests = data;
    renderRequests();
    
  } catch (error) {
    console.error('Load requests failed:', error);
    showErrorState(`Ошибка загрузки: ${error.message}`);
    showFallbackAlert('Не удалось загрузить заявки. Попробуйте позже.', 3000);
    
    // Для диагностики в режиме разработки
    if (IS_DEVELOPMENT) {
      console.debug('Error details:', {
        error: error.toString(),
        stack: error.stack,
        time: new Date().toISOString()
      });
    }
  }
}

// Поиск заявок
async function searchRequests() {
    const searchQuery = document.getElementById('search-input')?.value?.trim();
    if (!searchQuery) return loadRequests();

    const container = document.getElementById('requests-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Поиск...</div>';

    try {
        const params = new URLSearchParams({ query: searchQuery });
        
        if (IS_TELEGRAM_WEBAPP && tg.initDataUnsafe?.id) {
            params.append('id', tg.initDataUnsafe.id);
        }

        const requests = await makeRequest(`${API_BASE_URL}/requests/search?${params.toString()}`);
        renderRequests(requests);
    } catch (error) {
        container.innerHTML = '<div class="error">Ошибка поиска</div>';
        showAlert(`Ошибка поиска: ${error.message}`);
    }
}

// Обновление статуса
async function updateRequestStatus(event) {
  const select = event.target;
  const requestId = select.dataset.requestId;
  const newStatus = select.value;
  
  // Блокируем интерфейс на время запроса
  select.disabled = true;
  const originalStatus = select.value;
  
  try {
    const response = await fetch(`${API_BASE_URL}/requests/${requestId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
      },
      body: JSON.stringify({ status: newStatus })
    });
    
    if (!response.ok) throw new Error('Ошибка обновления');
    
    // Обновляем локальное состояние
    const updatedRequest = await response.json();
    updateLocalRequestState(updatedRequest);
    
    // Показываем уведомление
    showAlert('Статус обновлён!', 2000);
    
  } catch (error) {
    console.error('Update status error:', error);
    select.value = originalStatus;
    showAlert('Ошибка обновления статуса');
  } finally {
    select.disabled = false;
  }
}

// Обновление статистики
async function updateStats() {
  try {
    const tg = window.Telegram?.WebApp;
    const response = await fetch(`${API_BASE_URL}/requests/stats`, {
      headers: {
        'Telegram-Init-Data': tg?.initData || ''
      }
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const stats = await response.json();
    
    // Обновляем глобальное состояние
    appState.stats = {
      new: stats.new || 0,
      in_progress: stats.in_progress || 0,
      completed: stats.completed || 0
    };
    
    // Рендерим обновлённую статистику
    renderStats();
    
  } catch (error) {
    console.error('Update stats failed:', error);
    // Устанавливаем нулевые значения при ошибке
    appState.stats = { new: 0, in_progress: 0, completed: 0 };
    renderStats();
  }
}

function renderStats() {
  // Безопасное обновление DOM
  const safeUpdate = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  
  safeUpdate('new-count', appState.stats.new);
  safeUpdate('progress-count', appState.stats.in_progress);
  safeUpdate('completed-count', appState.stats.completed);
}

function updateLocalRequestState(updatedRequest) {
  appState.requests = appState.requests.map(request => 
    request.id === updatedRequest.id ? updatedRequest : request
  );
  
  renderRequests();
  updateStats(); // Обновляем статистику после изменения
}

// Инициализация приложения
async function initApp() {
  try {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.enableClosingConfirmation();
      document.documentElement.classList.add(tg.colorScheme);
    }
    
    // Проверяем доступность API перед загрузкой данных
    const isApiHealthy = await checkAPIHealth();
    if (!isApiHealthy) {
      throw new Error('API недоступен');
    }
    
    await Promise.all([loadRequests(), updateStats()]);
    
    setInterval(async () => {
      await loadRequests();
      await updateStats();
    }, 30000);
    
  } catch (error) {
    console.error('App initialization failed:', error);
    showErrorState(`Ошибка инициализации: ${error.message}`);
    showFallbackAlert('Ошибка при запуске приложения', 5000);
  }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);

// Настройка обработчиков событий
function setupEventListeners() {
    const addSafeListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, async () => {
                try {
                    await handler();
                } catch (error) {
                    showAlert(`Ошибка: ${error.message}`);
                }
            });
        }
    };

    addSafeListener('refresh-btn', 'click', loadRequests);
    addSafeListener('search-btn', 'click', searchRequests);
    addSafeListener('status-filter', 'change', loadRequests);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchRequests();
        });
    }
}

// Рендер заявок
function renderRequests() {
  const container = document.getElementById('requests-container');
  if (!container) return;
  
  // Получаем текущий фильтр
  const statusFilter = document.getElementById('status-filter')?.value;
  
  // Фильтруем заявки
  const filteredRequests = statusFilter && statusFilter !== 'all'
    ? appState.requests.filter(req => req.status === statusFilter)
    : appState.requests;
  
  // Рендерим
  container.innerHTML = filteredRequests.length ? '' : '<div class="empty">Нет заявок</div>';
  
  filteredRequests.forEach(request => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <div class="request-header">
        <h3>${escapeHtml(request.name)}</h3>
        <span class="status-badge ${request.status}">${getStatusText(request.status)}</span>
      </div>
      <div class="request-body">
        <p><strong>Телефон:</strong> ${formatPhone(request.phone)}</p>
        ${request.message ? `<p><strong>Сообщение:</strong> ${escapeHtml(request.message)}</p>` : ''}
        <p class="date">${formatDate(request.created_at)}</p>
      </div>
      <div class="request-actions">
        <select class="status-select" data-request-id="${request.id}">
          <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
          <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
          <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
        </select>
      </div>
      <div class="request-status ${request.status}">${getStatusText(request.status)}</div>
    `;
    container.appendChild(card);
  });
}

function renderStats() {
  document.getElementById('new-count').textContent = appState.stats.new;
  document.getElementById('progress-count').textContent = appState.stats.in_progress;
  document.getElementById('completed-count').textContent = appState.stats.completed;
}

// Вспомогательные функции
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatPhone(phone) {
    if (!phone) return 'Не указан';
    const cleaned = phone.toString().replace(/\D/g, '');
    const match = cleaned.match(/^(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
        return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}-${match[5]}`;
    }
    return cleaned;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        console.error('Date formatting error:', e);
        return 'Дата не указана';
    }
}

function getStatusText(status) {
    const statusMap = {
        'new': 'Новая',
        'in_progress': 'В работе',
        'completed': 'Завершена'
    };
    return statusMap[status] || 'Неизвестный статус';
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    
    // Инициализация
    tg.expand();
    tg.enableClosingConfirmation();
    tg.ready();
    
    // Параметры запуска
    console.log('Launch params:', tg.initDataUnsafe);
    
    // Цветовая схема
    document.documentElement.style.setProperty('--tg-color-scheme', tg.colorScheme);
    document.documentElement.style.setProperty('--tg-bg-color', tg.backgroundColor);
    
    // Загрузка данных
    loadRequests();
  } else {
    console.warn('Running in browser mode');
    loadRequests();
  }
});