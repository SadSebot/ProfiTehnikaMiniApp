// Инициализация Telegram WebApp
const initTelegramWebApp = () => {
  if (!window.Telegram?.WebApp) {
    console.warn('Telegram WebApp not detected, running in browser mode');
    return null;
  }

  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
  
  console.log('WebApp initialized:', tg.initDataUnsafe);
  return tg;
};

// Конфигурация приложения
const CONFIG = {
  API_BASE_URL: 'http://localhost:3000/api',
  IS_TELEGRAM_WEBAPP: !!window.Telegram?.WebApp,
  IS_DEVELOPMENT: ['localhost', '127.0.0.1'].includes(window.location.hostname),
  POLLING_INTERVAL: 30000 // 30 секунд
};

// Состояние приложения
const state = {
  requests: [],
  stats: {
    new: 0,
    in_progress: 0,
    completed: 0
  },
  pollingInterval: null
};

// DOM элементы
const elements = {
  container: document.getElementById('requests-container'),
  statusFilter: document.getElementById('status-filter'),
  searchInput: document.getElementById('search-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  searchBtn: document.getElementById('search-btn'),
  newCount: document.getElementById('new-count'),
  progressCount: document.getElementById('progress-count'),
  completedCount: document.getElementById('completed-count')
};

// Утилиты
const utils = {
  escapeHtml: (unsafe) => {
    if (!unsafe) return '';
    return unsafe.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  formatPhone: (phone) => {
    if (!phone) return 'Не указан';
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})$/);
    return match 
      ? `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}-${match[5]}` 
      : cleaned;
  },

  formatDate: (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Дата не указана';
    }
  },

  getStatusText: (status) => {
    const statusMap = {
      'new': 'Новая',
      'in_progress': 'В работе',
      'completed': 'Завершена'
    };
    return statusMap[status] || 'Неизвестный статус';
  }
};

// API методы
const api = {
  makeRequest: async (endpoint, method = 'GET', body = null) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(CONFIG.IS_TELEGRAM_WEBAPP && window.Telegram.WebApp.initData && {
        'Telegram-Init-Data': window.Telegram.WebApp.initData
      })
    };

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP error ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  },

  loadRequests: async () => {
    const params = new URLSearchParams();
    const tg = window.Telegram?.WebApp;

    if (tg?.initDataUnsafe?.user?.id) {
      params.append('user_id', tg.initDataUnsafe.user.id);
    }

    if (elements.statusFilter?.value && elements.statusFilter.value !== 'all') {
      params.append('status', elements.statusFilter.value);
    }

    return api.makeRequest(`/requests?${params.toString()}`);
  },

  updateRequestStatus: async (id, status) => {
    return api.makeRequest(`/requests/${id}/status`, 'PUT', { status });
  },

  getStats: async () => {
    return api.makeRequest('/requests/stats');
  },

  searchRequests: async (query) => {
    const params = new URLSearchParams({ query });
    const tg = window.Telegram?.WebApp;

    if (tg?.initDataUnsafe?.user?.id) {
      params.append('user_id', tg.initDataUnsafe.user.id);
    }

    return api.makeRequest(`/requests/search?${params.toString()}`);
  }
};

// UI методы
const ui = {
  showAlert: (message, duration = 3000) => {
    try {
      if (CONFIG.IS_TELEGRAM_WEBAPP && window.Telegram.WebApp.showAlert) {
        window.Telegram.WebApp.showAlert(message);
        return;
      }
    } catch (error) {
      console.error('Telegram alert failed:', error);
    }

    const alertEl = document.createElement('div');
    alertEl.className = 'custom-alert';
    alertEl.textContent = message;
    document.body.appendChild(alertEl);

    setTimeout(() => alertEl.remove(), duration);
  },

  renderRequests: (requests = state.requests) => {
    if (!elements.container) return;

    if (!requests.length) {
      elements.container.innerHTML = '<div class="empty-state">Нет заявок</div>';
      return;
    }

    elements.container.innerHTML = requests.map(request => `
      <div class="request-card">
        <div class="request-header">
          <h3>${utils.escapeHtml(request.name)}</h3>
          <span class="status-badge ${request.status}">
            ${utils.getStatusText(request.status)}
          </span>
        </div>
        <div class="request-body">
          <p><strong>Телефон:</strong> ${utils.formatPhone(request.phone)}</p>
          ${request.message ? `
            <p><strong>Сообщение:</strong> ${utils.escapeHtml(request.message)}</p>
          ` : ''}
          <p class="date">${utils.formatDate(request.created_at)}</p>
        </div>
        <div class="request-actions">
          <select class="status-select" data-request-id="${request.id}"
            ${request.status === 'completed' ? 'disabled' : ''}>
            <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
            <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
            <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
          </select>
        </div>
      </div>
    `).join('');

    // Добавляем обработчики событий
    document.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', handlers.updateRequestStatus);
    });
  },

  renderStats: () => {
    if (elements.newCount) elements.newCount.textContent = state.stats.new;
    if (elements.progressCount) elements.progressCount.textContent = state.stats.in_progress;
    if (elements.completedCount) elements.completedCount.textContent = state.stats.completed;
  },

  showLoading: () => {
    if (elements.container) {
      elements.container.innerHTML = '<div class="loading-state">Загрузка...</div>';
    }
  },

  showError: (message) => {
    if (elements.container) {
      elements.container.innerHTML = `
        <div class="error-state">
          <p>${message}</p>
          <button id="retry-btn">Повторить</button>
        </div>
      `;
      document.getElementById('retry-btn')?.addEventListener('click', handlers.loadRequests);
    }
  }
};

// Обработчики событий
const handlers = {
  loadRequests: async () => {
    try {
      ui.showLoading();
      state.requests = await api.loadRequests();
      ui.renderRequests();
    } catch (error) {
      console.error('Failed to load requests:', error);
      ui.showError('Ошибка загрузки заявок');
      ui.showAlert('Не удалось загрузить заявки');
    }
  },

  updateRequestStatus: async (event) => {
    const select = event.target;
    const requestId = select.dataset.requestId;
    const newStatus = select.value;

    select.disabled = true;
    const originalStatus = select.value;

    try {
      const updatedRequest = await api.updateRequestStatus(requestId, newStatus);
      
      // Обновляем состояние
      state.requests = state.requests.map(req => 
        req.id === requestId ? updatedRequest : req
      );
      
      ui.showAlert('Статус обновлен!');
      handlers.updateStats();
    } catch (error) {
      console.error('Failed to update status:', error);
      select.value = originalStatus;
      ui.showAlert('Ошибка обновления статуса');
    } finally {
      select.disabled = false;
    }
  },

  updateStats: async () => {
    try {
      state.stats = await api.getStats();
      ui.renderStats();
    } catch (error) {
      console.error('Failed to update stats:', error);
      state.stats = { new: 0, in_progress: 0, completed: 0 };
      ui.renderStats();
    }
  },

  searchRequests: async () => {
    const query = elements.searchInput?.value.trim();
    if (!query) return handlers.loadRequests();

    try {
      ui.showLoading();
      state.requests = await api.searchRequests(query);
      ui.renderRequests();
    } catch (error) {
      console.error('Search failed:', error);
      ui.showError('Ошибка поиска');
      ui.showAlert('Не удалось выполнить поиск');
    }
  },

  handleStatusFilterChange: () => {
    handlers.loadRequests();
  },

  handleSearchKeyPress: (event) => {
    if (event.key === 'Enter') {
      handlers.searchRequests();
    }
  }
};

// Инициализация приложения
const initApp = () => {
  // Инициализация Telegram WebApp
  initTelegramWebApp();

  // Настройка обработчиков событий
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', handlers.loadRequests);
  }

  if (elements.searchBtn) {
    elements.searchBtn.addEventListener('click', handlers.searchRequests);
  }

  if (elements.statusFilter) {
    elements.statusFilter.addEventListener('change', handlers.handleStatusFilterChange);
  }

  if (elements.searchInput) {
    elements.searchInput.addEventListener('keypress', handlers.handleSearchKeyPress);
  }

  // Загрузка данных
  handlers.loadRequests();
  handlers.updateStats();

  // Настройка периодического обновления
  state.pollingInterval = setInterval(() => {
    handlers.loadRequests();
    handlers.updateStats();
  }, CONFIG.POLLING_INTERVAL);

  // Очистка при размонтировании
  window.addEventListener('beforeunload', () => {
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
    }
  });
};

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);