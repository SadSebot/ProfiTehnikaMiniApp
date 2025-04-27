const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.MainButton?.hide();
}

// Конфигурация
const API_BASE_URL = 'http://localhost:3000/api';
const IS_TELEGRAM_WEBAPP = !!window.Telegram?.WebApp;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

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

    // Добавляем Telegram Init Data если доступно
    if (IS_TELEGRAM_WEBAPP && tg.initData) {
        headers['Telegram-Init-Data'] = tg.initData;
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
            throw new Error(errorData.message || `Ошибка ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Request to ${url} failed:`, error);
        throw error;
    }
}

// Безопасное отображение сообщений
function showAlert(message, duration = 3000) {
    if (IS_TELEGRAM_WEBAPP && tg.showAlert) {
        tg.showAlert(message).catch(() => showFallbackAlert(message, duration));
    } else {
        showFallbackAlert(message, duration);
    }
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

    container.innerHTML = '<div class="loading">Загрузка данных...</div>';

    try {
        const statusFilter = document.getElementById('status-filter')?.value || 'all';
        const params = new URLSearchParams({ status: statusFilter });

        if (IS_TELEGRAM_WEBAPP && tg.initDataUnsafe?.user?.id) {
            params.append('user_id', tg.initDataUnsafe.user.id);
        }

        const requests = await makeRequest(`${API_BASE_URL}/requests?${params.toString()}`);
        renderRequests(requests);
        await updateStats();
    } catch (error) {
        container.innerHTML = '<div class="error">Ошибка загрузки</div>';
        showAlert(`Ошибка: ${error.message}`);
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
            params.append('user_id', tg.initDataUnsafe.user.id);
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

    try {
        await makeRequest(
            `${API_BASE_URL}/requests/${requestId}`,
            'PUT',
            { status: newStatus }
        );
        
        showAlert('Статус обновлен');
        await loadRequests();
    } catch (error) {
        showAlert(`Ошибка обновления: ${error.message}`);
        await loadRequests(); // Восстановление предыдущего состояния
    }
}

// Обновление статистики
async function updateStats() {
    try {
        const stats = await makeRequest(`${API_BASE_URL}/requests/stats`);
        
        const updateCounter = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value || 0;
        };

        updateCounter('new-count', stats.new);
        updateCounter('progress-count', stats.in_progress);
        updateCounter('completed-count', stats.completed);
    } catch (error) {
        console.error('Failed to update stats:', error);
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
    if (!container) return;

    if (!requests?.length) {
        container.innerHTML = '<div class="empty">Нет заявок</div>';
        return;
    }

    container.innerHTML = '';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'request-card';
        
        const statusClass = `status-${request.status || 'new'}`;
        const statusText = getStatusText(request.status);
        const requestDate = request.created_at || request.request_date || new Date().toISOString();

        card.innerHTML = `
            <div class="request-header">
                <span class="request-name">${escapeHtml(request.name)}</span>
                <span class="request-status ${statusClass}">${statusText}</span>
            </div>
            <div class="request-contacts">
                <a href="tel:${request.phone}" class="request-phone">${formatPhone(request.phone)}</a>
                ${request.email ? `<a href="mailto:${request.email}" class="request-email">${escapeHtml(request.email)}</a>` : ''}
            </div>
            <div class="request-date">${formatDate(requestDate)}</div>
            ${request.message ? `<div class="request-message">${escapeHtml(request.message)}</div>` : ''}
            
            <select class="status-select" data-request-id="${request.id}">
                <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
                <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
            </select>
        `;

        card.querySelector('.status-select')?.addEventListener('change', updateRequestStatus);
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
    if (!phone) return '';
    const numbers = phone.toString().replace(/\D/g, '');
    return `+${numbers.substring(0, 1)} (${numbers.substring(1, 4)}) ${numbers.substring(4, 7)}-${numbers.substring(7, 9)}-${numbers.substring(9, 11)}`;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

function getStatusText(status) {
    const statusMap = {
        'new': 'Новая',
        'in_progress': 'В работе',
        'completed': 'Завершена'
    };
    return statusMap[status] || 'Новая';
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);