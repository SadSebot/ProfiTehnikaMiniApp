const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Базовый URL API
const API_BASE_URL = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        await loadRequests();
        await updateStats();
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        tg.showAlert('Ошибка инициализации приложения');
    }
}

function setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', loadRequests);
    document.getElementById('search-btn').addEventListener('click', searchRequests);
    document.getElementById('status-filter').addEventListener('change', loadRequests);
    
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchRequests();
    });
}

async function loadRequests() {
    const container = document.getElementById('requests-container');
    container.innerHTML = '<div class="loading">Загрузка данных...</div>';
    
    const statusFilter = document.getElementById('status-filter').value;
    
    try {
        let url = `${API_BASE_URL}/requests`;
        const params = new URLSearchParams();
        
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (tg.initDataUnsafe.user) params.append('user_id', tg.initDataUnsafe.user.id);
        
        url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: {
                'Telegram-Init-Data': tg.initData
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const requests = await response.json();
        renderRequests(requests);
        updateStats(requests);
    } catch (error) {
        container.innerHTML = '<div class="error">Ошибка загрузки данных</div>';
        console.error('Load requests error:', error);
        tg.showAlert('Ошибка загрузки заявок');
    }
}

async function searchRequests() {
    const searchQuery = document.getElementById('search-input').value.trim();
    if (!searchQuery) return loadRequests();
    
    const container = document.getElementById('requests-container');
    container.innerHTML = '<div class="loading">Поиск...</div>';
    
    try {
        const params = new URLSearchParams({ query: searchQuery });
        if (tg.initDataUnsafe.user) params.append('user_id', tg.initDataUnsafe.user.id);
        
        const response = await fetch(`${API_BASE_URL}/requests/search?${params.toString()}`, {
            headers: {
                'Telegram-Init-Data': tg.initData
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const requests = await response.json();
        renderRequests(requests);
    } catch (error) {
        container.innerHTML = '<div class="error">Ошибка поиска</div>';
        console.error('Search error:', error);
        tg.showAlert('Ошибка поиска');
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
                'Telegram-Init-Data': tg.initData
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Ошибка обновления статуса');
        }
        
        tg.showAlert('Статус успешно обновлен');
        loadRequests();
    } catch (error) {
        console.error('Update status error:', error);
        tg.showAlert(error.message || 'Ошибка обновления статуса');
        loadRequests(); // Восстанавливаем предыдущее состояние
    }
}

async function updateStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/requests/stats`, {
            headers: {
                'Telegram-Init-Data': tg.initData
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
        // Можно оставить предыдущие значения или показать ошибку
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