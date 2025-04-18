const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    // Инициализация UI
    setupTabs();
    setupRequestForm();
    
    // Загрузка данных пользователя Telegram
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = tg.initDataUnsafe.user;
    }
    
    // Загрузка заявок при открытии вкладки
    document.querySelector('[data-tab="requests-list"]').addEventListener('click', loadRequests);
});

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

function setupRequestForm() {
    const form = document.getElementById('request-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const phone = document.getElementById('phone').value;
        const message = document.getElementById('message').value;
        
        try {
            const response = await fetch('/api/requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, phone, message })
            });
            
            if (response.ok) {
                tg.showAlert('Заявка успешно отправлена!');
                form.reset();
            } else {
                const error = await response.json();
                tg.showAlert(error.error || 'Ошибка при отправке заявки');
            }
        } catch (error) {
            tg.showAlert('Ошибка соединения');
            console.error(error);
        }
    });
}

async function loadRequests() {
    try {
        const statusFilter = document.getElementById('status-filter').value;
        let url = '/api/requests';
        if (statusFilter !== 'all') {
            url += `?status=${statusFilter}`;
        }
        
        const response = await fetch(url);
        const requests = await response.json();
        
        const container = document.getElementById('requests-container');
        container.innerHTML = '';
        
        if (requests.length === 0) {
            container.innerHTML = '<p>Нет заявок</p>';
            return;
        }
        
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
                
                ${currentUser ? `
                <select class="status-select" data-request-id="${request.id}">
                    <option value="new" ${request.status === 'new' ? 'selected' : ''}>Новая</option>
                    <option value="in_progress" ${request.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                    <option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Завершена</option>
                </select>
                ` : ''}
            `;
            
            container.appendChild(card);
        });
        
        // Добавляем обработчики для изменения статуса
        document.querySelectorAll('.status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const requestId = e.target.getAttribute('data-request-id');
                const newStatus = e.target.value;
                
                try {
                    const response = await fetch(`/api/requests/${requestId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ status: newStatus })
                    });
                    
                    if (!response.ok) {
                        const error = await response.json();
                        tg.showAlert(error.error || 'Ошибка обновления статуса');
                    }
                } catch (error) {
                    tg.showAlert('Ошибка соединения');
                    console.error(error);
                }
            });
        });
        
    } catch (error) {
        tg.showAlert('Ошибка загрузки заявок');
        console.error(error);
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

// Обновляем список при изменении фильтра
document.getElementById('status-filter').addEventListener('change', loadRequests);