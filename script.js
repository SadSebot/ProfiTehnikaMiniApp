const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

document.addEventListener('DOMContentLoaded', () => {
    loadRequests();
    updateStats();
    
    // Обработчики событий
    document.getElementById('refresh-btn').addEventListener('click', loadRequests);
    document.getElementById('search-btn').addEventListener('click', searchRequests);
    document.getElementById('status-filter').addEventListener('change', loadRequests);
    
    // Поиск при нажатии Enter
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchRequests();
        }
    });
});

async function loadRequests() {
    const container = document.getElementById('requests-container');
    container.innerHTML = '<div class="loading">Загрузка данных...</div>';
    
    const statusFilter = document.getElementById('status-filter').value;
    
    try {
        let url = '/api/zayavki';
        if (statusFilter !== 'all') {
            url += `?status=${statusFilter}`;
        }
        
        const response = await fetch(url);
        const requests = await response.json();
        
        renderRequests(requests);
        updateStats(requests);
    } catch (error) {
        container.innerHTML = '<div class="loading">Ошибка загрузки данных</div>';
        console.error(error);
        tg.showAlert('Ошибка загрузки заявок');
    }
}

async function searchRequests() {
    const searchQuery = document.getElementById('search-input').value.trim();
    if (!searchQuery) return loadRequests();
    
    const container = document.getElementById('requests-container');
    container.innerHTML = '<div class="loading">Поиск...</div>';
    
    try {
        const response = await fetch(`/api/zayavki/search?query=${encodeURIComponent(searchQuery)}`);
        const requests = await response.json();
        renderRequests(requests);
    } catch (error) {
        container.innerHTML = '<div class="loading">Ошибка поиска</div>';
        console.error(error);
        tg.showAlert('Ошибка поиска');
    }
}

function renderRequests(requests) {
    const container = document.getElementById('requests-container');
    
    if (requests.length === 0) {
        container.innerHTML = '<div class="loading">Нет заявок</div>';
        return;
    }
    
    container.innerHTML = '';
    
    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'request-card';
        
        const statusClass = `status-${request.status || 'new'}`;
        const statusText = getStatusText(request.status);
        
        card.innerHTML = `
            <div class="request-header">
                <span class="request-name">${request.name}</span>
                <span class="request-status ${statusClass}">${statusText}</span>
            </div>
            <a href="tel:${request.phone}" class="request-phone">${request.phone}</a>
            <div class="request-date">${new Date(request.request_date).toLocaleString()}</div>
            <div class="request-message">${request.message}</div>
            
            <select class="status-select" data-request-id="${request.id}">
                <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
                <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
            </select>
        `;
        
        // Обработчик изменения статуса
        card.querySelector('.status-select').addEventListener('change', async (e) => {
            const requestId = e.target.getAttribute('data-request-id');
            const newStatus = e.target.value;
            
            try {
                const response = await fetch(`/api/zayavki/${requestId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: newStatus })
                });
                
                if (response.ok) {
                    loadRequests(); // Обновляем список
                } else {
                    const error = await response.json();
                    tg.showAlert(error.error || 'Ошибка обновления статуса');
                }
            } catch (error) {
                tg.showAlert('Ошибка соединения');
                console.error(error);
            }
        });
        
        container.appendChild(card);
    });
}

function updateStats(requests) {
    // В реальном приложении нужно делать отдельный запрос для статистики
    // или анализировать полученные requests
    document.getElementById('new-count').textContent = '0';
    document.getElementById('progress-count').textContent = '0';
    document.getElementById('completed-count').textContent = '0';
    
    if (requests) {
        const newCount = requests.filter(r => r.status === 'new').length;
        const progressCount = requests.filter(r => r.status === 'in_progress').length;
        const completedCount = requests.filter(r => r.status === 'completed').length;
        
        document.getElementById('new-count').textContent = newCount;
        document.getElementById('progress-count').textContent = progressCount;
        document.getElementById('completed-count').textContent = completedCount;
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