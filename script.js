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

// Безопасное отображение сообщений
function showAlert(message, duration = 3000) {
    // Создаем или находим контейнер для уведомлений
    let alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alert-container';
        alertContainer.style.position = 'fixed';
        alertContainer.style.bottom = '20px';
        alertContainer.style.right = '20px';
        alertContainer.style.zIndex = '1000';
        document.body.appendChild(alertContainer);
    }

    const alertEl = document.createElement('div');
    alertEl.className = 'custom-alert';
    alertEl.textContent = message;
    alertContainer.appendChild(alertEl);

    setTimeout(() => {
        alertEl.classList.add('hide');
        setTimeout(() => alertEl.remove(), 300);
    }, duration);
}

function showFallbackAlert(message, duration) {
    const alertEl = document.createElement('div');
    alertEl.className = 'custom-alert';
    alertEl.textContent = message;
    document.body.appendChild(alertEl);

    setTimeout(() => {
        alertEl.classList.add('hide');
        setTimeout(() => alertEl.remove(), 300);
    }, duration);
}

// Загрузка заявок
async function loadRequests() {
    const container = document.getElementById('requests-container');
    if (!container) return;
  
    // Показываем состояние загрузки
    container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Загрузка данных...</p>
      </div>
    `;
  
    try {
      const statusFilter = document.getElementById('status-filter').value;
      const userId = tg?.initDataUnsafe?.user?.id;
      
      // Формируем URL с параметрами
      const url = new URL(`${API_BASE_URL}/requests`);
      const params = new URLSearchParams();
      
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (userId) params.append('user_id', userId);
      
      // Добавляем параметры к URL
      url.search = params.toString();
      
      console.log('Fetching requests from:', url.toString());
      
      const response = await fetch(url, {
        headers: {
          'Telegram-Init-Data': tg?.initData || ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const requests = await response.json();
      console.log('Received requests:', requests);
      
      if (!requests || !requests.length) {
        container.innerHTML = `
          <div class="empty-state">
            <p>Нет заявок по выбранному фильтру</p>
          </div>
        `;
        return;
      }
      
      renderRequests(requests);
    } catch (error) {
      console.error('Failed to load requests:', error);
      container.innerHTML = `
        <div class="error-state">
          <p>Ошибка загрузки данных</p>
          <button onclick="loadRequests()">Повторить</button>
        </div>
      `;
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
        
        if (IS_TELEGRAM_WEBAPP && tg.initDataUnsafe?.user?.id) {
            params.append('id', tg.initDataUnsafe.user.id);
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
    const requestId = select.getAttribute('data-request-id');
    const newStatus = select.value;
    
    // Сохраняем предыдущее значение для отката при ошибке
    const oldStatus = select.value;
    
    // Показываем состояние загрузки
    select.disabled = true;
    select.classList.add('loading');

    try {
        const response = await makeRequest(
            `${API_BASE_URL}/requests/${requestId}/status`, // Исправленный endpoint
            'PUT',
            { status: newStatus }
        );
        
        showAlert('Статус успешно обновлен');
        console.log('Status updated:', response);
        
        // Обновляем статистику после изменения статуса
        await updateStats();
        
    } catch (error) {
        console.error('Update status error:', error);
        
        // Возвращаем предыдущее значение
        select.value = oldStatus;
        showAlert(`Ошибка обновления: ${error.message}`);
        
    } finally {
        // Восстанавливаем интерактивность
        select.disabled = false;
        select.classList.remove('loading');
    }
}

// Обновление статистики
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/requests/stats`, {
            headers: {
                'Content-Type': 'application/json',
                'Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
            }
        });

        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }

        const stats = await response.json();
        
        // Безопасное обновление счетчиков
        const updateCounter = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value ?? 0;
        };

        updateCounter('new-count', stats.new);
        updateCounter('progress-count', stats.in_progress);
        updateCounter('completed-count', stats.completed);

    } catch (error) {
        console.error('Update stats error:', error);
        
        // Устанавливаем нулевые значения при ошибке
        ['new-count', 'progress-count', 'completed-count'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '0';
        });
    }
}

// Инициализация приложения
async function initApp() {
    try {
        const isHealthy = await checkAPIHealth();
        if (!isHealthy) {
            throw new Error('Сервер недоступен');
        }

        await Promise.all([loadRequests(), updateStats()]);
        setupEventListeners();
    } catch (error) {
        console.error('Init error:', error);
        showAlert(`Ошибка инициализации: ${error.message}`);
    }
}

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
function renderRequests(requests) {
    const container = document.getElementById('requests-container');
    if (!container) {
        console.error('Container not found');
        return;
    }

    // Очищаем контейнер
    container.innerHTML = '';

    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет заявок для отображения</div>';
        return;
    }

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'request-card';

        // Форматируем дату
        const formattedDate = formatDate(request.created_at || new Date().toISOString());
        
        // Определяем класс для статуса
        const statusClass = `status-${request.status || 'new'}`;
        const statusText = getStatusText(request.status);

        // Создаем HTML для карточки
        card.innerHTML = `
            <div class="request-header">
                <h3 class="request-title">Заявка #${request.id}</h3>
                <span class="request-status ${statusClass}">${statusText}</span>
            </div>
            
            <div class="request-body">
                <div class="request-field">
                    <span class="field-label">Имя:</span>
                    <span class="field-value">${escapeHtml(request.name || 'Не указано')}</span>
                </div>
                
                <div class="request-field">
                    <span class="field-label">Телефон:</span>
                    <span class="field-value">
                        <a href="tel:${request.phone ? request.phone.replace(/\D/g, '') : ''}">
                            ${request.phone ? formatPhone(request.phone) : 'Не указан'}
                        </a>
                    </span>
                </div>
                
                ${request.message ? `
                <div class="request-field">
                    <span class="field-label">Сообщение:</span>
                    <span class="field-value">${escapeHtml(request.message)}</span>
                </div>
                ` : ''}
                
                <div class="request-field">
                    <span class="field-label">Дата создания:</span>
                    <span class="field-value">${formattedDate}</span>
                </div>
            </div>
            
            <div class="request-footer">
                <select class="status-select" data-request-id="${request.id}">
                    <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
                    <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                    <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
                </select>
            </div>
        `;

        // Добавляем обработчик изменения статуса
        const select = card.querySelector('.status-select');
        if (select) {
            select.addEventListener('change', updateRequestStatus);
        }

        container.appendChild(card);
    });
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
ocument.addEventListener('DOMContentLoaded', () => {
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