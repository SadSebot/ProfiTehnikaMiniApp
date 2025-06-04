const tg = window.Telegram?.WebApp;
if (tg) {
  const tg = window.Telegram.WebApp;
  tg.ready();
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

let appState = {
  requests: [],
  stats: {
    new: 0,
    in_progress: 0,
    completed: 0
  }
};

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

function showAlert(message, duration = 3000) {
  try {
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert(message);
    } else {
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

// Загрузка заявок с учетом фильтрации
async function loadRequests() {
  try {
    const tg = window.Telegram?.WebApp;
    const url = new URL(`${API_BASE_URL}/requests`);
    
    if (tg?.initDataUnsafe?.user?.id) {
      url.searchParams.append('user_id', tg.initDataUnsafe.user.id);
    }
    
    const statusFilter = document.getElementById('status-filter')?.value;
    if (statusFilter && statusFilter !== 'all') {
      url.searchParams.append('status', statusFilter);
    }

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(tg?.initData && {'Telegram-Init-Data': tg.initData})
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    appState.requests = data;
    renderRequests();
    
  } catch (error) {
    console.error('Load requests failed:', error);
    showErrorState('Ошибка загрузки данных');
  }
}

// Обновление статуса заявки
async function updateRequestStatus(event) {
  const select = event.target;
  const requestId = select.dataset.requestId;
  const newStatus = select.value;
  
  select.disabled = true;
  const originalStatus = select.dataset.originalStatus || select.value;

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
    
    const updatedRequest = await response.json();
    
    // Обновляем локальное состояние
    appState.requests = appState.requests.map(req => 
      req.id === updatedRequest.id ? updatedRequest : req
    );
    
    // Перерисовываем с учетом текущего фильтра
    renderRequests();
    updateStats();
    
    showAlert('Статус успешно изменён!', 2000);
    
  } catch (error) {
    console.error('Update error:', error);
    select.value = originalStatus;
    showAlert('Не удалось изменить статус');
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
    
    appState.stats = {
      new: stats.new || 0,
      in_progress: stats.in_progress || 0,
      completed: stats.completed || 0
    };
    
    renderStats();
    
  } catch (error) {
    console.error('Update stats failed:', error);
    appState.stats = { new: 0, in_progress: 0, completed: 0 };
    renderStats();
  }
}

// Рендеринг заявок
function renderRequests() {
  const container = document.getElementById('requests-container');
  if (!container) return;
  
  const statusFilter = document.getElementById('status-filter')?.value;
  
  const filteredRequests = statusFilter && statusFilter !== 'all'
    ? appState.requests.filter(req => req.status === statusFilter)
    : appState.requests;
  
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
        <select class="status-select" 
                data-request-id="${request.id}"
                data-original-status="${request.status}"
                onchange="updateRequestStatus(event)">
          <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
          <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
          <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
        </select>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderStats() {
  const safeUpdate = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  
  safeUpdate('new-count', appState.stats.new);
  safeUpdate('progress-count', appState.stats.in_progress);
  safeUpdate('completed-count', appState.stats.completed);
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

// Настройка обработчиков событий
function setupEventListeners() {
  // Обработчик фильтра по статусу
  const statusFilter = document.getElementById('status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      loadRequests();
    });
  }

  // Кнопка обновления
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadRequests();
    });
  }

  // Поиск
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchRequests();
      }
    });
  }
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
    
    setupEventListeners();
    
    const isApiHealthy = await checkAPIHealth();
    if (!isApiHealthy) {
      throw new Error('API недоступен');
    }
    
    await Promise.all([loadRequests(), updateStats()]);
    
    // Автообновление каждые 30 секунд
    setInterval(async () => {
      await loadRequests();
      await updateStats();
    }, 30000);
    
  } catch (error) {
    console.error('App initialization failed:', error);
    showErrorState(`Ошибка инициализации: ${error.message}`);
  }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);