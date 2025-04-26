const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Базовый URL API (замените на ваш продакшен URL)
const API_BASE_URL = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        // Проверяем доступность API перед началом работы
        await Promise.all([loadRequests(), updateStats()]);
        setupEventListeners();
    } catch (error) {
        console.error('Init error:', error);
        showAlertSafe(`Ошибка инициализации: ${error.message}`);
    }
}

async function safeFetch(url, options = {}) {
    try {
        // Добавляем обязательные заголовки
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Telegram-Init-Data': tg.initData || ''
        };
        
        const response = await fetch(url, {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.message || `HTTP Error ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        throw new Error(error.message || 'Network request failed');
    }
}
function setupEventListeners() {
    const safeAddListener = (elementId, event, handler) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, async () => {
                try {
                    await handler();
                } catch (error) {
                    showAlertSafe(`Ошибка: ${error.message}`);
                }
            });
        }
    };
    
    safeAddListener('refresh-btn', 'click', loadRequests);
    safeAddListener('search-btn', 'click', searchRequests);
    safeAddListener('status-filter', 'change', loadRequests);
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchRequests().catch(console.error);
        });
    }
}

function showAlertSafe(message, duration = 3000) {
    // Пытаемся использовать Telegram WebApp API
    if (typeof tg.showAlert === 'function') {
        tg.showAlert(message).catch(e => {
            console.warn('Telegram.showAlert failed:', e);
            showFallbackAlert(message, duration);
        });
        return;
    }
    
    // Fallback решение
    showFallbackAlert(message, duration);
}

function showFallbackAlert(message, duration) {
    const alertEl = document.createElement('div');
    alertEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: alertFadeIn 0.3s ease-out;
    `;
    
    alertEl.textContent = message;
    document.body.appendChild(alertEl);
    
    setTimeout(() => {
        alertEl.style.animation = 'alertFadeOut 0.3s ease-out';
        setTimeout(() => alertEl.remove(), 300);
    }, duration);
}


async function loadRequests() {
    const container = document.getElementById('requests-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Загрузка данных...</div>';
    
    try {
        const statusFilter = document.getElementById('status-filter')?.value || 'all';
        const params = new URLSearchParams();
        
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (tg.initDataUnsafe?.user?.id) params.append('user_id', tg.initDataUnsafe.user.id);
        
        // 4. Используем safeFetch вместо прямого fetch
        const requests = await safeFetch(`${API_BASE_URL}/requests?${params.toString()}`);
        
        renderRequests(requests);
        updateStats(requests);
    } catch (error) {
        container.innerHTML = '<div class="error">Ошибка загрузки</div>';
        showAlertSafe(`Не удалось загрузить данные: ${error.message}`);
    }
}


async function searchRequests() {
    const searchQuery = document.getElementById('search-input').value.trim();
    if (!searchQuery) return loadRequests();
    
    const container = document.getElementById('requests-container');
    container.innerHTML = '<div class="loading">Поиск...</div>';
    
    try {
        const params = new URLSearchParams({ query: searchQuery });
        if (tg.initDataUnsafe?.user?.id) params.append('user_id', tg.initDataUnsafe.user.id);
        
        const response = await fetch(`${API_BASE_URL}/requests/search?${params.toString()}`, {
            headers: {
                'Telegram-Init-Data': tg.initData || '',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const requests = await response.json();
        renderRequests(requests);
    } catch (error) {
        container.innerHTML = '<div class="error">Ошибка поиска</div>';
        console.error('Search error:', error);
        showAlertSafe(error.message || 'Ошибка поиска');
    }
}

function renderRequests(requests) {
    const container = document.getElementById('requests-container');
    
    if (!requests || requests.length === 0) {
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
        
        card.querySelector('.status-select').addEventListener('change', (e) => updateRequestStatus(e));
        container.appendChild(card);
    });
}

async function updateRequestStatus(event) {
    const select = event.target;
    const requestId = select.getAttribute('data-request-id');
    const newStatus = select.value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/requests/${requestId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Telegram-Init-Data': tg.initData || ''
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        showAlertSafe('Статус успешно обновлен');
        loadRequests();
    } catch (error) {
        console.error('Update status error:', error);
        showAlertSafe(error.message || 'Ошибка обновления статуса');
        loadRequests();
    }
}

async function updateStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/requests/stats`, {
            headers: {
                'Telegram-Init-Data': tg.initData || '',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const stats = await response.json();
        
        document.getElementById('new-count').textContent = stats.new || 0;
        document.getElementById('progress-count').textContent = stats.in_progress || 0;
        document.getElementById('completed-count').textContent = stats.completed || 0;
    } catch (error) {
        console.error('Update stats error:', error);
    }
}

// Вспомогательные функции
function escapeHtml(unsafe) {
    return unsafe?.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;") || '';
}

function formatPhone(phone) {
    return phone?.toString().replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) $3-$4-$5') || '';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(status) {
    const statusMap = {
        'new': 'Новая',
        'in_progress': 'В работе',
        'completed': 'Завершена'
    };
    return statusMap[status] || 'Новая';
}