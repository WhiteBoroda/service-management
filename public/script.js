// Глобальные переменные
let clients = [];
let services = [];
let employees = [];
let expenses = [];
let editingClientId = null;
let editingServiceId = null;
let editingExpenseId = null;
let assigningServiceId = null;
let currentCompanyId = null;
let companies = [];
let tariffPlans = [];
let slaLevels = [];
let currentUser = null;
let authToken = null;

window.addEventListener('load', async () => {
    authToken = localStorage.getItem('authToken');

    if (authToken) {
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                showMainApp();
                await init();
            } else {
                showLoginScreen();
            }
        } catch (error) {
            console.error('Ошибка проверки авторизации:', error);
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
});
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
}

// Показать основное приложение
function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    // Обновляем информацию о пользователе
    document.getElementById('currentUserName').textContent = currentUser.full_name;
    document.getElementById('currentUserRole').textContent = getRoleDisplayName(currentUser.role);

    // Применяем права доступа
    applyRolePermissions();
}

// Обработка формы входа
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);

            showMainApp();
            await init();
        } else {
            document.getElementById('loginError').textContent = data.error || 'Ошибка входа';
            document.getElementById('loginError').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        document.getElementById('loginError').textContent = 'Ошибка соединения с сервером';
        document.getElementById('loginError').classList.remove('hidden');
    }
});

// Выход из системы
async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }

    showLoginScreen();
}

// Получить отображаемое название роли
function getRoleDisplayName(role) {
    const roleNames = {
        'admin': 'Администратор',
        'user': 'Пользователь',
        'viewer': 'Наблюдатель'
    };
    return roleNames[role] || role;
}

// Применить права доступа к интерфейсу
function applyRolePermissions() {
    const userRole = currentUser.role;
    const roleHierarchy = { viewer: 1, user: 2, admin: 3 };
    const userLevel = roleHierarchy[userRole] || 0;

    // Скрываем элементы, к которым нет доступа
    document.querySelectorAll('[data-role]').forEach(element => {
        const requiredRole = element.getAttribute('data-role');
        const requiredLevel = roleHierarchy[requiredRole] || 0;

        if (userLevel < requiredLevel) {
            element.classList.add('hidden');
        } else {
            element.classList.remove('hidden');
        }
    });

    // Дополнительная логика скрытия вкладок
    const tabButtons = document.querySelectorAll('.tab[data-role]');
    tabButtons.forEach(tab => {
        const requiredRole = tab.getAttribute('data-role');
        const requiredLevel = roleHierarchy[requiredRole] || 0;

        if (userLevel < requiredLevel) {
            tab.style.display = 'none';
        }
    });
}

// Обновленная функция apiCall с авторизацией
async function apiCall(method, endpoint, data = null) {
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        // Добавляем токен авторизации
        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(endpoint, options);

        // Проверяем авторизацию
        if (response.status === 401) {
            showLoginScreen();
            throw new Error('Требуется авторизация');
        }

        if (response.status === 403) {
            showMessage('Недостаточно прав для выполнения действия', 'error');
            throw new Error('Недостаточно прав');
        }

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        if (error.message !== 'Требуется авторизация' && error.message !== 'Недостаточно прав') {
            showMessage('Ошибка API: ' + error.message, 'error');
        }
        throw error;
    }
}

// Управление пользователями
function showAddUserForm() {
    document.getElementById('addUserForm').classList.remove('hidden');
}

function hideAddUserForm() {
    document.getElementById('addUserForm').classList.add('hidden');
    document.getElementById('newUsername').value = '';
    document.getElementById('newFullName').value = '';
    document.getElementById('newPassword').value = '';
}

async function addUser() {
    const username = document.getElementById('newUsername').value.trim();
    const fullName = document.getElementById('newFullName').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newUserRole').value;

    if (!username || !fullName || !password) {
        showMessage('Заполните все поля', 'error');
        return;
    }

    try {
        await apiCall('POST', '/api/users', {
            username,
            full_name: fullName,
            password,
            role
        });

        showMessage('Пользователь создан');
        hideAddUserForm();
        renderUsers();
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
    }
}
// API функции

// Инициализация
async function init() {
    try {
        showMessage('Загрузка данных...', 'info');

        // Загружаем новые данные для мульти-компанийности
        companies = await apiCall('GET', '/api/companies');
        tariffPlans = await apiCall('GET', '/api/tariff-plans');
        slaLevels = await apiCall('GET', '/api/sla-levels');

        renderCompanySelector();

        if (companies.length > 0) {
            currentCompanyId = companies[0].id;
            await loadCompanyData();
        } else {
            // Fallback для старых данных без компаний
            clients = await apiCall('GET', '/api/clients');
            services = await apiCall('GET', '/api/services');
            employees = await apiCall('GET', '/api/employees');
            expenses = await apiCall('GET', '/api/expenses');
            updateStats();
            renderAll();
        }

        showMessage('Данные загружены', 'success');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showMessage('Ошибка загрузки данных', 'error');
    }
}


// Показать сообщение
function showMessage(text, type = 'success') {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);

    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}

// Переключение вкладок
function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('[id^="tab-"]').forEach(content => content.classList.add('hidden'));

    event.target.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

// Обновление статистики
function updateStats() {
    document.getElementById('clientsCount').textContent = clients.length;
    document.getElementById('servicesCount').textContent = services.length;
    document.getElementById('employeesCount').textContent = employees.length;

    const connections = clients.reduce((total, client) => {
        const services = client.services || {};
        return total + Object.values(services).filter(s => s.Use === 1).length;
    }, 0);
    document.getElementById('connectionsCount').textContent = connections;

    // Финансовая сводка - все в гривнах
    const totalSalaries = employees.reduce((sum, emp) => sum + (emp.salary || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.monthly_amount || 0), 0);

    document.getElementById('totalSalaries').textContent = totalSalaries.toLocaleString();
    document.getElementById('totalExpenses').textContent = totalExpenses.toFixed(2);
    document.getElementById('totalCosts').textContent = (totalSalaries + totalExpenses).toFixed(0);
}

// Рендер всех данных
function renderAll() {
    renderClients();
    renderServices();
    renderEmployees();
    renderExpenses();
    renderUsers();
}
async function renderUsers() {
    try {
        const users = await apiCall('GET', '/api/users');
        const container = document.getElementById('usersList');
        container.innerHTML = '';

        users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'client-card';
            userDiv.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <div>
                        <div class="font-medium">${user.full_name}</div>
                        <div class="text-sm text-gray-500">@${user.username}</div>
                    </div>
                    <div class="flex gap-2 items-center">
                        <span class="tag">${getRoleDisplayName(user.role)}</span>
                        <span class="tag ${user.is_active ? 'tag-saas' : 'tag-inactive'}">
                            ${user.is_active ? 'Активен' : 'Заблокирован'}
                        </span>
                        <button class="btn btn-secondary btn-small" onclick="toggleUserStatus(${user.id}, ${user.is_active})">
                            ${user.is_active ? 'Заблокировать' : 'Активировать'}
                        </button>
                    </div>
                </div>
                <div class="text-sm text-gray-600">
                    Создан: ${new Date(user.created_at).toLocaleDateString()}
                    ${user.last_login ? `| Последний вход: ${new Date(user.last_login).toLocaleDateString()}` : ''}
                </div>
            `;
            container.appendChild(userDiv);
        });
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

async function toggleUserStatus(userId, isActive) {
    try {
        await apiCall('PUT', `/api/users/${userId}`, {
            is_active: !isActive
        });
        showMessage(isActive ? 'Пользователь заблокирован' : 'Пользователь активирован');
        renderUsers();
    } catch (error) {
        console.error('Ошибка изменения статуса пользователя:', error);
    }
}

// Рендер клиентов
function renderClients() {
    const container = document.getElementById('clientsList');
    container.innerHTML = '';

    if (clients.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">Нет клиентов. Импортируйте данные или добавьте вручную.</div>';
        return;
    }

    clients.forEach(client => {
        const clientDiv = document.createElement('div');
        clientDiv.className = 'client-card';

        const services = client.services || {};
        const activeServices = Object.entries(services).filter(([_, serviceData]) => serviceData.Use === 1);

        const servicesList = activeServices.length > 0
            ? activeServices.map(([serviceName, serviceData]) =>
                `<span class="tag tag-${serviceData.Type?.toLowerCase() || 'saas'}">${serviceName}</span>`
              ).join('')
            : '<span class="text-gray-500">Нет активных сервисов</span>';

        // Формируем отображение оборудования
        const metadata = client.metadata || {};
        let equipmentHtml = '';

        if (Object.keys(metadata).length > 0) {
            // Функция для получения иконки по типу оборудования
            const getEquipmentIcon = (category) => {
                const iconMap = {
                    'рабочие_места': '💻',
                    'печатная_техника': '🖨️',
                    'сетевое_оборудование': '🌐',
                    'видеонаблюдение': '📹',
                    'ip_телефония': '☎️',
                    'сервера': '🖥️',
                    'storage': '💾',
                    'безопасность': '🔒'
                };
                return iconMap[category] || '⚙️';
            };

            let totalEquipment = 0;
            let totalComplexity = 0;

            const equipmentSections = Object.entries(metadata).map(([category, data]) => {
                const icon = getEquipmentIcon(category);
                const categoryName = category.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

                if (typeof data === 'object' && data !== null) {
                    if (data.count !== undefined && data.weight !== undefined) {
                        // Простая категория с весом
                        totalEquipment += data.count;
                        totalComplexity += data.count * data.weight;

                        return `
                            <div class="equipment-category">
                                <span class="font-medium" style="color: #374151;">
                                    ${icon} ${categoryName}: <strong class="green">${data.count}</strong> 
                                    <span class="text-xs text-gray-500">(вес: ${data.weight})</span>
                                </span>
                            </div>
                        `;
                    } else {
                        // Сложная категория с элементами
                        let categoryTotal = 0;
                        let categoryComplexity = 0;

                        const items = Object.entries(data).map(([item, itemData]) => {
                            let count, weight;
                            if (typeof itemData === 'object' && itemData.count !== undefined) {
                                count = itemData.count || 0;
                                weight = itemData.weight || 1;
                            } else {
                                // Старый формат - просто число
                                count = parseInt(itemData) || 0;
                                weight = 1;
                            }

                            categoryTotal += count;
                            categoryComplexity += count * weight;

                            return `<span class="equipment-item">${item.replace(/_/g, ' ')}: <strong class="green">${count}</strong> <span class="text-xs text-gray-500">(${weight})</span></span>`;
                        }).join('');

                        totalEquipment += categoryTotal;
                        totalComplexity += categoryComplexity;

                        return `
                            <div class="equipment-category">
                                <div class="font-medium" style="color: #374151; margin-bottom: 4px;">
                                    ${icon} ${categoryName} (${categoryTotal}):
                                </div>
                                <div style="margin-left: 20px; display: flex; flex-wrap: wrap; gap: 6px;">
                                    ${items}
                                </div>
                            </div>
                        `;
                    }
                } else {
                    // Очень старый формат - просто число
                    const count = parseInt(data) || 0;
                    totalEquipment += count;
                    totalComplexity += count * 1; // Вес по умолчанию = 1

                    return `
                        <div class="equipment-category">
                            <span class="font-medium" style="color: #374151;">
                                ${icon} ${categoryName}: <strong class="green">${data}</strong>
                            </span>
                        </div>
                    `;
                }
            }).join('');

            equipmentHtml = `
                <div style="margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #1f2937; display: flex; align-items: center; justify-content: space-between;">
                        <span>📊 Инфраструктура</span>
                        <div style="font-size: 12px; display: flex; gap: 10px;">
                            <span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px;">
                                Всего: ${totalEquipment} ед.
                            </span>
                            <span style="background: #f97316; color: white; padding: 2px 8px; border-radius: 12px;">
                                Сложность: ${totalComplexity.toFixed(1)}
                            </span>
                        </div>
                    </h4>
                    <div style="display: grid; gap: 8px; font-size: 13px;">
                        ${equipmentSections}
                    </div>
                </div>
            `;
        }

        clientDiv.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="client-name">🏢 ${client.name}</div>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-small" onclick="editClient(${client.id})">✏️ Изменить</button>
                    <button class="btn btn-danger btn-small" onclick="deleteClient(${client.id})">🗑️ Удалить</button>
                </div>
            </div>
            <div class="text-sm">
                <p class="mb-2"><strong>Активных сервисов:</strong> ${activeServices.length}</p>
                <div>${servicesList}</div>
                ${equipmentHtml}
            </div>
        `;
        container.appendChild(clientDiv);
    });
}

// Рендер сервисов
function renderServices() {
    const container = document.getElementById('servicesList');
    container.innerHTML = '';

    if (services.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">Нет сервисов. Импортируйте данные или добавьте вручную.</div>';
        return;
    }

    services.forEach(service => {
        const clientsUsingService = clients.filter(client =>
            client.services && client.services[service.name]?.Use === 1
        );

        const serviceDiv = document.createElement('div');
        serviceDiv.className = 'service-card';
        serviceDiv.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="service-name">⚙️ ${service.name}</div>
                <div class="flex gap-2">
                    <span class="tag tag-${service.type?.toLowerCase() || 'saas'}">${service.type || 'SaaS'}</span>
                    <button class="btn btn-success btn-small" onclick="assignServiceToClients(${service.id})">👥 Назначить</button>
                    <button class="btn btn-primary btn-small" onclick="editService(${service.id})">✏️ Изменить</button>
                    <button class="btn btn-danger btn-small" onclick="deleteService(${service.id})">🗑️ Удалить</button>
                </div>
            </div>
            <div class="text-sm text-gray-600">
                <p><strong>Описание:</strong> ${service.description || 'Нет описания'}</p>
                <p><strong>Тип:</strong> ${service.type || 'SaaS'} | <strong>Качество:</strong> ${service.quality || 'Medium'}</p>
                <p><strong>Вес сложности:</strong> ${service.weight || 1} | <strong>Клиентов:</strong> ${clientsUsingService.length}</p>
                <p style="color: #9ca3af; font-size: 12px;">Реальные цены рассчитываются автоматически по весу</p>
            </div>
            ${clientsUsingService.length > 0 ? `
                <div style="margin-top: 8px;">
                    <strong>Используют:</strong> ${clientsUsingService.map(c => c.name).join(', ')}
                </div>
            ` : ''}
        `;
        container.appendChild(serviceDiv);
    });
}

// Рендер сотрудников
function renderEmployees() {
    const container = document.getElementById('employeesList');
    container.innerHTML = '';

    if (employees.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">Нет сотрудников. Добавьте сотрудников для расчета затрат.</div>';
        return;
    }

    employees.forEach(employee => {
        const employeeDiv = document.createElement('div');
        employeeDiv.className = 'employee-card';
        employeeDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="font-medium">👤 ${employee.name}</div>
                <div class="font-bold green">₴${employee.salary || 0}/мес</div>
            </div>
        `;
        container.appendChild(employeeDiv);
    });
}

// Рендер затрат
function renderExpenses() {
    const container = document.getElementById('expensesList');
    container.innerHTML = '';

    if (expenses.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">Нет затрат</div>';
        return;
    }

    expenses.forEach(expense => {
        const expenseDiv = document.createElement('div');
        expenseDiv.className = 'expense-card';
        expenseDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; background: white;';

        const periodText = expense.period_type === 'months' ? 'мес' : 'лет';
        const originalAmount = `₴${expense.amount}/${expense.period} ${periodText}`;

        expenseDiv.innerHTML = `
            <div>
                <div class="font-medium">💸 ${expense.name}</div>
                <div class="text-sm text-gray-500">
                    ${originalAmount} → ₴${(expense.monthly_amount || 0).toFixed(2)}/мес
                </div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-primary btn-small" onclick="editExpense(${expense.id})">✏️</button>
                <button class="btn btn-danger btn-small" onclick="deleteExpense(${expense.id})">🗑️</button>
            </div>
        `;
        container.appendChild(expenseDiv);
    });
}

// Управление формами
function showAddClientForm() {
    document.getElementById('addClientForm').classList.remove('hidden');
}

function hideAddClientForm() {
    document.getElementById('addClientForm').classList.add('hidden');
    document.getElementById('clientName').value = '';
}

function showAddServiceForm() {
    document.getElementById('addServiceForm').classList.remove('hidden');
}

function hideAddServiceForm() {
    document.getElementById('addServiceForm').classList.add('hidden');
    document.getElementById('serviceName').value = '';
    document.getElementById('serviceDescription').value = '';
}

function hideEditClientForm() {
    document.getElementById('editClientForm').classList.add('hidden');
    editingClientId = null;
}

function hideEditServiceForm() {
    document.getElementById('editServiceForm').classList.add('hidden');
    editingServiceId = null;
}

function hideEditExpenseForm() {
    document.getElementById('editExpenseForm').classList.add('hidden');
    editingExpenseId = null;
}

function hideAssignServiceForm() {
    document.getElementById('assignServiceForm').classList.add('hidden');
    assigningServiceId = null;
}

// Переключение вкладок в форме редактирования
function showEditTab(tabName, clickedTab) {
    // Обновляем активную вкладку
    document.querySelectorAll('#editClientForm .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    clickedTab.classList.add('active');

    // Показываем/скрываем контент
    document.getElementById('editServicesTab').classList.toggle('hidden', tabName !== 'services');
    document.getElementById('editEquipmentTab').classList.toggle('hidden', tabName !== 'equipment');
}

// Назначение сервиса клиентам
function assignServiceToClients(serviceId) {
    assigningServiceId = serviceId;
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    document.getElementById('assignServiceName').textContent = service.name;

    const clientsEditor = document.getElementById('serviceClientsEditor');
    clientsEditor.innerHTML = '';

    clients.forEach(client => {
        const clientService = client.services?.[service.name];
        const isActive = clientService?.Use === 1;

        const clientDiv = document.createElement('div');
        clientDiv.className = `service-checkbox ${isActive ? 'active' : ''}`;

        clientDiv.innerHTML = `
            <input type="checkbox" 
                   id="client_${client.id}" 
                   ${isActive ? 'checked' : ''}
                   onchange="toggleClientCheckbox(this, ${client.id})">
            <div style="flex: 1;">
                <div class="font-medium">🏢 ${client.name}</div>
                <div class="text-xs text-gray-500">
                    ${Object.keys(client.services || {}).filter(s => client.services[s]?.Use === 1).length} активных сервисов
                </div>
            </div>
        `;
        clientsEditor.appendChild(clientDiv);
    });

    document.getElementById('assignServiceForm').classList.remove('hidden');
    document.getElementById('assignServiceForm').scrollIntoView({ behavior: 'smooth' });
}

function toggleClientCheckbox(checkbox, clientId) {
    const clientDiv = checkbox.parentElement;
    if (checkbox.checked) {
        clientDiv.classList.add('active');
    } else {
        clientDiv.classList.remove('active');
    }
}

// Сохранение назначений сервиса клиентам
async function saveServiceAssignments() {
    if (!assigningServiceId) return;

    const service = services.find(s => s.id === assigningServiceId);
    if (!service) return;

    // Обновляем каждого клиента
    const updatePromises = clients.map(async (client) => {
        const checkbox = document.getElementById(`client_${client.id}`);
        if (!checkbox) return;

        const updatedServices = { ...client.services };

        if (checkbox.checked) {
            // Добавляем сервис клиенту
            updatedServices[service.name] = {
                Use: 1,
                Description: service.description || '',
                Type: service.type || 'SaaS',
                Quality: service.quality || 'Medium',
                Weight: service.weight || 1
            };
        } else {
            // Убираем сервис у клиента
            delete updatedServices[service.name];
        }

        try {
            await apiCall('PUT', `/api/clients/${client.id}`, {
                name: client.name,
                metadata: client.metadata || {},
                services: updatedServices
            });
        } catch (error) {
            console.error(`Ошибка обновления клиента ${client.name}:`, error);
            throw error;
        }
    });

    try {
        await Promise.all(updatePromises);
        showMessage(`Сервис "${service.name}" назначен выбранным клиентам`);
        hideAssignServiceForm();
        await init(); // Перезагружаем данные
    } catch (error) {
        console.error('Ошибка назначения сервиса:', error);
        showMessage('Ошибка назначения сервиса', 'error');
    }
}

// Редактирование клиента
function editClient(clientId) {
    editingClientId = clientId;
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    document.getElementById('editClientName').textContent = client.name;

    // Рендерим редактор сервисов
    renderClientServicesEditor(client);

    // Рендерим редактор оборудования
    renderEquipmentEditor(client);

    // Показываем форму и переключаемся на первую вкладку
    document.getElementById('editClientForm').classList.remove('hidden');
    showEditTab('services', document.getElementById('servicesTab'));
}

// Рендер редактора сервисов
function renderClientServicesEditor(client) {
    const servicesEditor = document.getElementById('clientServicesEditor');
    servicesEditor.innerHTML = '';

    services.forEach(service => {
        const clientService = client.services?.[service.name];
        const isActive = clientService?.Use === 1;

        const serviceDiv = document.createElement('div');
        serviceDiv.className = `service-checkbox ${isActive ? 'active' : ''}`;

        serviceDiv.innerHTML = `
            <input type="checkbox" 
                   id="service_${service.id}" 
                   ${isActive ? 'checked' : ''}
                   onchange="toggleServiceCheckbox(this, ${service.id})">
            <div style="flex: 1;">
                <div class="font-medium">${service.name}</div>
                <div class="text-xs text-gray-500">${service.type} | ${service.description}</div>
            </div>
        `;
        servicesEditor.appendChild(serviceDiv);
    });
}

function toggleServiceCheckbox(checkbox, serviceId) {
    const serviceDiv = checkbox.parentElement;
    if (checkbox.checked) {
        serviceDiv.classList.add('active');
    } else {
        serviceDiv.classList.remove('active');
    }
}

// Сохранение изменений клиента (сервисы + оборудование)
async function saveClientChanges() {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    // Собираем данные о сервисах
    const updatedServices = {};
    services.forEach(service => {
        const checkbox = document.getElementById(`service_${service.id}`);
        if (checkbox) {
            updatedServices[service.name] = {
                Use: checkbox.checked ? 1 : 0,
                Description: service.description,
                Type: service.type,
                Quality: service.quality || 'Medium',
                Weight: service.weight || 1
            };
        }
    });

    try {
        await apiCall('PUT', `/api/clients/${editingClientId}`, {
            name: client.name,
            metadata: client.metadata || {},
            services: updatedServices
        });

        showMessage('Клиент обновлен');
        hideEditClientForm();
        await init();
    } catch (error) {
        console.error('Ошибка обновления клиента:', error);
        showMessage('Ошибка обновления клиента', 'error');
    }
}

// Рендер редактора оборудования
function renderEquipmentEditor(client) {
    const equipmentEditor = document.getElementById('equipmentEditor');
    equipmentEditor.innerHTML = '';

    const metadata = client.metadata || {};

    if (Object.keys(metadata).length === 0) {
        equipmentEditor.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">Нет оборудования. Добавьте категории выше.</div>';
        return;
    }

    Object.entries(metadata).forEach(([categoryName, categoryData]) => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'equipment-editor-category';

        const getEquipmentIcon = (category) => {
            const iconMap = {
                'рабочие_места': '💻',
                'печатная_техника': '🖨️',
                'сетевое_оборудование': '🌐',
                'видеонаблюдение': '📹',
                'ip_телефония': '☎️',
                'сервера': '🖥️',
                'storage': '💾',
                'безопасность': '🔒'
            };
            return iconMap[category] || '⚙️';
        };

        const icon = getEquipmentIcon(categoryName);
        const displayName = categoryName.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

        let itemsHtml = '';
        let isComplexCategory = false;

        // Проверяем структуру данных - новая (с весами) или старая (простые числа)
        if (typeof categoryData === 'object' && categoryData !== null) {
            if (categoryData.count !== undefined && categoryData.weight !== undefined) {
                // Простая категория с весом
                itemsHtml = `
                    <div class="equipment-editor-item" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 80px; gap: 8px; align-items: center;">
                        <span>${displayName}</span>
                        <input type="number"
                               value="${categoryData.count}"
                               min="0"
                               class="equipment-input"
                               style="width: 100%;"
                               onchange="updateSimpleEquipmentCount('${categoryName}', this.value, '${categoryData.weight}')">
                        <input type="number"
                               value="${categoryData.weight}"
                               min="0.1"
                               max="10"
                               step="0.1"
                               class="equipment-input"
                               style="width: 100%;"
                               onchange="updateSimpleEquipmentWeight('${categoryName}', '${categoryData.count}', this.value)">
                        <span class="text-xs text-gray-500">Итог: ${(categoryData.count * categoryData.weight).toFixed(1)}</span>
                        <button class="btn btn-danger btn-small" onclick="removeEquipmentCategory('${categoryName}')">🗑️</button>
                    </div>
                `;
            } else {
                // Сложная категория с элементами
                isComplexCategory = true;
                itemsHtml = Object.entries(categoryData).map(([itemName, itemData]) => {
                    // Обработка старого формата (просто числа) и нового (объекты с count/weight)
                    let count, weight;
                    if (typeof itemData === 'object' && itemData.count !== undefined) {
                        count = itemData.count || 0;
                        weight = itemData.weight || 1;
                    } else {
                        // Старый формат - просто число
                        count = itemData || 0;
                        weight = 1; // Дефолтный вес
                    }

                    return `
                        <div class="equipment-editor-item" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 80px; gap: 8px; align-items: center;">
                            <span>${itemName.replace(/_/g, ' ')}</span>
                            <input type="number"
                                   value="${count}"
                                   min="0"
                                   class="equipment-input"
                                   style="width: 100%;"
                                   onchange="updateEquipmentCount('${categoryName}', '${itemName}', this.value, '${weight}')">
                            <input type="number"
                                   value="${weight}"
                                   min="0.1"
                                   max="10"
                                   step="0.1"
                                   class="equipment-input"
                                   style="width: 100%;"
                                   onchange="updateEquipmentWeight('${categoryName}', '${itemName}', '${count}', this.value)">
                            <span class="text-xs text-gray-500">Итог: ${(count * weight).toFixed(1)}</span>
                            <button class="btn btn-danger btn-small" onclick="removeEquipmentItem('${categoryName}', '${itemName}')">🗑️</button>
                        </div>
                    `;
                }).join('');
            }
        } else {
            // Очень старый формат - просто число
            itemsHtml = `
                <div class="equipment-editor-item" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 80px; gap: 8px; align-items: center;">
                    <span>${displayName}</span>
                    <input type="number"
                           value="${categoryData}"
                           min="0"
                           class="equipment-input"
                           style="width: 100%;"
                           onchange="updateSimpleEquipmentCount('${categoryName}', this.value, '1')">
                    <input type="number"
                           value="1"
                           min="0.1"
                           max="10"
                           step="0.1"
                           class="equipment-input"
                           style="width: 100%;"
                           onchange="updateSimpleEquipmentWeight('${categoryName}', '${categoryData}', this.value)">
                    <span class="text-xs text-gray-500">Итог: ${categoryData}</span>
                    <button class="btn btn-danger btn-small" onclick="removeEquipmentCategory('${categoryName}')">🗑️</button>
                </div>
            `;
        }

        // Заголовок с колонками
        const headerHtml = isComplexCategory ? `
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 80px; gap: 8px; align-items: center; margin-bottom: 8px; font-size: 12px; color: #6b7280; font-weight: 500;">
                <span>Название</span>
                <span>Количество</span>
                <span>Вес</span>
                <span>Итого</span>
                <span></span>
            </div>
        ` : '';

        categoryDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h5 style="margin: 0; color: #374151;">${icon} ${displayName}</h5>
                ${isComplexCategory ?
                    `<button class="btn btn-danger btn-small" onclick="removeEquipmentCategory('${categoryName}')">🗑️ Удалить категорию</button>` :
                    ''
                }
            </div>
            ${headerHtml}
            ${itemsHtml}
            ${isComplexCategory ?
                `<div style="margin-top: 10px; padding: 8px; background: #e0f2fe; border-radius: 4px; border: 1px dashed #0284c7;">
                    <button class="btn btn-primary btn-small" onclick="showAddItemForm('${categoryName}')" style="width: 100%;">
                        ➕ Добавить элемент в "${displayName}"
                    </button>
                 </div>` :
                ''
            }
        `;

        equipmentEditor.appendChild(categoryDiv);
    });
}

// Показать форму добавления элемента в существующую категорию
function showAddItemForm(categoryName) {
    const existingForm = document.getElementById('addItemForm');
    if (existingForm) {
        existingForm.remove();
    }

    const categoryDiv = event.target.parentElement.parentElement;
    const formDiv = document.createElement('div');
    formDiv.id = 'addItemForm';
    formDiv.style.cssText = 'margin-top: 10px; padding: 10px; background: #e0f2fe; border-radius: 6px; border: 1px solid #0284c7;';

    formDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 80px 80px; gap: 8px; align-items: center;">
            <input type="text"
                   id="addItemName"
                   placeholder="Название элемента"
                   style="padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
            <input type="number"
                   id="addItemCount"
                   placeholder="Количество"
                   min="1"
                   value="1"
                   style="padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
            <input type="number"
                   id="addItemWeight"
                   placeholder="Вес"
                   min="0.1"
                   max="10"
                   step="0.1"
                   value="1"
                   style="padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
            <button class="btn btn-success btn-small" onclick="addItemToCategory('${categoryName}')">➕</button>
            <button class="btn btn-secondary btn-small" onclick="cancelAddItem()">❌</button>
        </div>
    `;

    categoryDiv.appendChild(formDiv);
    document.getElementById('addItemName').focus();
}
// Добавить элемент в существующую категорию
function addItemToCategory(categoryName) {
    const itemName = document.getElementById('addItemName').value.trim().replace(/\s+/g, '_').toLowerCase();
    const itemCount = parseInt(document.getElementById('addItemCount').value) || 1;
    const itemWeight = parseFloat(document.getElementById('addItemWeight').value) || 1;

    if (!itemName) {
        showMessage('Введите название элемента', 'error');
        return;
    }

    if (itemCount <= 0) {
        showMessage('Количество должно быть больше 0', 'error');
        return;
    }

    if (itemWeight <= 0) {
        showMessage('Вес должен быть больше 0', 'error');
        return;
    }

    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    if (!client.metadata) client.metadata = {};
    if (!client.metadata[categoryName]) client.metadata[categoryName] = {};

    // Проверяем, что категория - объект
    if (typeof client.metadata[categoryName] !== 'object' || client.metadata[categoryName].count !== undefined) {
        // Если была простая категория, превращаем в сложную
        const oldValue = client.metadata[categoryName];
        client.metadata[categoryName] = {
            'существующие': oldValue
        };
    }

    // Проверяем, не существует ли уже такой элемент
    if (client.metadata[categoryName][itemName]) {
        showMessage(`Элемент "${itemName}" уже существует`, 'error');
        return;
    }

    client.metadata[categoryName][itemName] = {
        count: itemCount,
        weight: itemWeight
    };

    // Удаляем форму и перерендериваем
    cancelAddItem();
    renderEquipmentEditor(client);

    showMessage('Элемент добавлен в категорию');
}
// Отменить добавление элемента
function cancelAddItem() {
    const formDiv = document.getElementById('addItemForm');
    if (formDiv) {
        formDiv.remove();
    }
}
// Добавление нового элемента оборудования
function addEquipmentItem() {
    const categoryName = document.getElementById('newCategoryName').value.trim().replace(/\s+/g, '_').toLowerCase();
    const itemName = document.getElementById('newItemName').value.trim().replace(/\s+/g, '_').toLowerCase();
    const itemCount = parseInt(document.getElementById('newItemCount').value) || 1;
    const itemWeight = parseFloat(document.getElementById('newItemWeight').value) || 1;

    if (!categoryName) {
        showMessage('Введите название категории', 'error');
        return;
    }

    if (itemCount <= 0) {
        showMessage('Количество должно быть больше 0', 'error');
        return;
    }

    if (itemWeight <= 0) {
        showMessage('Вес должен быть больше 0', 'error');
        return;
    }

    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    if (!client.metadata) client.metadata = {};

    // Проверяем, существует ли уже такая категория
    const categoryExists = client.metadata[categoryName];

    if (itemName) {
        // Создаем категорию с элементами (сложная структура)
        if (!categoryExists) {
            client.metadata[categoryName] = {};
        } else if (typeof client.metadata[categoryName] === 'object' && client.metadata[categoryName].count !== undefined) {
            // Если была простая категория, превращаем в сложную
            const oldValue = client.metadata[categoryName];
            client.metadata[categoryName] = {
                'общие': oldValue
            };
        }

        // Проверяем, не существует ли уже такой элемент
        if (client.metadata[categoryName][itemName]) {
            showMessage(`Элемент "${itemName}" уже существует в категории "${categoryName}"`, 'error');
            return;
        }

        // Сохраняем с весом
        client.metadata[categoryName][itemName] = {
            count: itemCount,
            weight: itemWeight
        };
        showMessage(`Добавлен элемент "${itemName}" в категорию "${categoryName}"`);
    } else {
        // Создаем простую категорию (одно значение с весом)
        if (categoryExists) {
            showMessage(`Категория "${categoryName}" уже существует`, 'error');
            return;
        }

        client.metadata[categoryName] = {
            count: itemCount,
            weight: itemWeight
        };
        showMessage(`Создана категория "${categoryName}"`);
    }

    // Очищаем поля
    document.getElementById('newCategoryName').value = '';
    document.getElementById('newItemName').value = '';
    document.getElementById('newItemCount').value = '1';
    document.getElementById('newItemWeight').value = '1';

    // Перерендериваем редактор
    renderEquipmentEditor(client);
}

// Обновление количества оборудования
function updateEquipmentCount(categoryName, itemName, newCount, currentWeight) {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    const count = parseInt(newCount) || 0;
    const weight = parseFloat(currentWeight) || 1;

    if (count <= 0) {
        removeEquipmentItem(categoryName, itemName);
        return;
    }

    if (!client.metadata) client.metadata = {};
    if (!client.metadata[categoryName]) client.metadata[categoryName] = {};

    client.metadata[categoryName][itemName] = {
        count: count,
        weight: weight
    };

    // Обновляем итоговое значение в интерфейсе
    const totalSpan = event.target.parentElement.querySelector('.text-xs');
    if (totalSpan) {
        totalSpan.textContent = `Итог: ${(count * weight).toFixed(1)}`;
    }
}

// Обновление веса оборудования
function updateEquipmentWeight(categoryName, itemName, currentCount, newWeight) {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    const count = parseInt(currentCount) || 0;
    const weight = parseFloat(newWeight) || 1;

    if (weight <= 0) {
        showMessage('Вес должен быть больше 0', 'error');
        event.target.value = 1;
        return;
    }

    if (!client.metadata) client.metadata = {};
    if (!client.metadata[categoryName]) client.metadata[categoryName] = {};

    client.metadata[categoryName][itemName] = {
        count: count,
        weight: weight
    };

    // Обновляем итоговое значение в интерфейсе
    const totalSpan = event.target.parentElement.querySelector('.text-xs');
    if (totalSpan) {
        totalSpan.textContent = `Итог: ${(count * weight).toFixed(1)}`;
    }
}

// Обновление простого значения оборудования
function updateSimpleEquipmentCount(categoryName, newCount, currentWeight) {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    const count = parseInt(newCount) || 0;
    const weight = parseFloat(currentWeight) || 1;

    if (count <= 0) {
        removeEquipmentCategory(categoryName);
        return;
    }

    if (!client.metadata) client.metadata = {};
    client.metadata[categoryName] = {
        count: count,
        weight: weight
    };

    // Обновляем итоговое значение в интерфейсе
    const totalSpan = event.target.parentElement.querySelector('.text-xs');
    if (totalSpan) {
        totalSpan.textContent = `Итог: ${(count * weight).toFixed(1)}`;
    }
}

// Обновление веса простого оборудования
function updateSimpleEquipmentWeight(categoryName, currentCount, newWeight) {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client) return;

    const count = parseInt(currentCount) || 0;
    const weight = parseFloat(newWeight) || 1;

    if (weight <= 0) {
        showMessage('Вес должен быть больше 0', 'error');
        event.target.value = 1;
        return;
    }

    if (!client.metadata) client.metadata = {};
    client.metadata[categoryName] = {
        count: count,
        weight: weight
    };

    // Обновляем итоговое значение в интерфейсе
    const totalSpan = event.target.parentElement.querySelector('.text-xs');
    if (totalSpan) {
        totalSpan.textContent = `Итог: ${(count * weight).toFixed(1)}`;
    }
}

// Удаление элемента оборудования
function removeEquipmentItem(categoryName, itemName) {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client || !client.metadata || !client.metadata[categoryName]) return;

    if (typeof client.metadata[categoryName] === 'object') {
        delete client.metadata[categoryName][itemName];

        // Если категория стала пустой, удаляем её
        if (Object.keys(client.metadata[categoryName]).length === 0) {
            delete client.metadata[categoryName];
        }
    }

    renderEquipmentEditor(client);
    showMessage('Элемент удален');
}

// Удаление категории оборудования
function removeEquipmentCategory(categoryName) {
    if (!editingClientId) return;

    const client = clients.find(c => c.id === editingClientId);
    if (!client || !client.metadata) return;

    delete client.metadata[categoryName];

    renderEquipmentEditor(client);
    showMessage('Категория удалена');
}


// Редактирование сервиса
function editService(serviceId) {
    editingServiceId = serviceId;
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    // Заполняем форму редактирования данными сервиса
    document.getElementById('editServiceName').textContent = service.name;
    document.getElementById('editServiceNameInput').value = service.name;
    document.getElementById('editServiceDescriptionInput').value = service.description || '';
    document.getElementById('editServiceTypeInput').value = service.type || 'SaaS';
    document.getElementById('editServiceWeightInput').value = service.weight || 1;
    document.getElementById('editServiceQualityInput').value = service.quality || 'Medium';
    document.getElementById('editServiceBasePriceInput').value = service.base_price || 0;

    // Показываем форму редактирования
    document.getElementById('editServiceForm').classList.remove('hidden');

    // Скроллим к форме
    document.getElementById('editServiceForm').scrollIntoView({ behavior: 'smooth' });
}

// Сохранение изменений сервиса
async function saveServiceChanges() {
    if (!editingServiceId) return;

    const name = document.getElementById('editServiceNameInput').value.trim();
    const description = document.getElementById('editServiceDescriptionInput').value.trim();
    const type = document.getElementById('editServiceTypeInput').value;
    const weight = parseInt(document.getElementById('editServiceWeightInput').value) || 1;
    const quality = document.getElementById('editServiceQualityInput').value;
    const base_price = parseFloat(document.getElementById('editServiceBasePriceInput').value) || 0;

    if (!name) {
        showMessage('Введите название сервиса', 'error');
        return;
    }

    if (weight < 1 || weight > 5) {
        showMessage('Вес сложности должен быть от 1 до 5', 'error');
        return;
    }

    try {
        await apiCall('PUT', `/api/services/${editingServiceId}`, {
            name,
            description,
            type,
            weight,
            quality,
            base_price
        });

        showMessage('Сервис обновлен');
        hideEditServiceForm();
        await init(); // Перезагружаем данные
    } catch (error) {
        console.error('Ошибка обновления сервиса:', error);
        showMessage('Ошибка обновления сервиса', 'error');
    }
}

// Удаление сервиса
async function deleteService(serviceId) {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    // Проверяем, используется ли сервис клиентами
    const clientsUsingService = clients.filter(client =>
        client.services && client.services[service.name]?.Use === 1
    );

    let confirmMessage = `Удалить сервис "${service.name}"?`;
    if (clientsUsingService.length > 0) {
        confirmMessage += `\n\nВнимание: Сервис используется ${clientsUsingService.length} клиентами:\n${clientsUsingService.map(c => c.name).join(', ')}\n\nСервис будет удален из всех списков клиентов.`;
    }

    if (!confirm(confirmMessage)) return;

    try {
        await apiCall('DELETE', `/api/services/${serviceId}`);
        showMessage(`Сервис "${service.name}" удален`);
        await init(); // Перезагружаем данные
    } catch (error) {
        console.error('Ошибка удаления сервиса:', error);
        showMessage('Ошибка удаления сервиса', 'error');
    }
}

// Редактирование затраты
function editExpense(expenseId) {
    editingExpenseId = expenseId;
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    // Заполняем форму редактирования данными затраты
    document.getElementById('editExpenseName').textContent = expense.name;
    document.getElementById('editExpenseNameInput').value = expense.name;
    document.getElementById('editExpenseAmountInput').value = expense.amount || 0;
    document.getElementById('editExpensePeriodInput').value = expense.period || 1;
    document.getElementById('editExpensePeriodTypeInput').value = expense.period_type || 'months';

    // Показываем форму редактирования
    document.getElementById('editExpenseForm').classList.remove('hidden');

    // Скроллим к форме
    document.getElementById('editExpenseForm').scrollIntoView({ behavior: 'smooth' });
}

// Сохранение изменений затраты
async function saveExpenseChanges() {
    if (!editingExpenseId) return;

    const name = document.getElementById('editExpenseNameInput').value.trim();
    const amount = parseFloat(document.getElementById('editExpenseAmountInput').value) || 0;
    const period = parseInt(document.getElementById('editExpensePeriodInput').value) || 1;
    const period_type = document.getElementById('editExpensePeriodTypeInput').value;

    if (!name) {
        showMessage('Введите название затраты', 'error');
        return;
    }

    if (amount <= 0) {
        showMessage('Сумма должна быть больше 0', 'error');
        return;
    }

    if (period <= 0) {
        showMessage('Период должен быть больше 0', 'error');
        return;
    }

    try {
        await apiCall('PUT', `/api/expenses/${editingExpenseId}`, {
            name,
            amount,
            period,
            period_type
        });

        showMessage('Затрата обновлена');
        hideEditExpenseForm();
        await init(); // Перезагружаем данные
    } catch (error) {
        console.error('Ошибка обновления затраты:', error);
        showMessage('Ошибка обновления затраты', 'error');
    }
}

// Удаление затраты
async function deleteExpense(expenseId) {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    if (!confirm(`Удалить затрату "${expense.name}"?\n\nСумма: $${expense.amount} за ${expense.period} ${expense.period_type === 'months' ? 'мес' : 'лет'}`)) return;

    try {
        await apiCall('DELETE', `/api/expenses/${expenseId}`);
        showMessage(`Затрата "${expense.name}" удалена`);
        await init(); // Перезагружаем данные
    } catch (error) {
        console.error('Ошибка удаления затраты:', error);
        showMessage('Ошибка удаления затраты', 'error');
    }
}

// CRUD операции
async function addClient() {
    const name = document.getElementById('clientName').value.trim();
    if (!name) {
        showMessage('Введите название предприятия', 'error');
        return;
    }

    try {
        await apiCall('POST', '/api/clients', { name, metadata: {}, services: {} });
        showMessage('Клиент добавлен');
        hideAddClientForm();
        await init();
    } catch (error) {
        console.error('Ошибка добавления клиента:', error);
    }
}

async function deleteClient(id) {
    if (!confirm('Удалить клиента?')) return;

    try {
        await apiCall('DELETE', `/api/clients/${id}`);
        showMessage('Клиент удален');
        await init();
    } catch (error) {
        console.error('Ошибка удаления клиента:', error);
    }
}


async function addService() {
    // Проверяем, выбрана ли компания (для новой мульти-компанийной версии)
    if (currentCompanyId && !currentCompanyId) {
        showMessage('Выберите компанию', 'error');
        return;
    }

    // Получаем данные из формы
    const name = document.getElementById('serviceName').value.trim();
    const description = document.getElementById('serviceDescription').value.trim();
    const type = document.getElementById('serviceType').value;
    const weight = parseInt(document.getElementById('serviceWeight').value) || 1;
    const quality = document.getElementById('serviceQuality').value;

    // Новое поле для специализаций (если есть в форме)
    const specializationsText = document.getElementById('serviceSpecializations')?.value.trim() || '';
    const requiredSpecializations = specializationsText ?
        specializationsText.split(',').map(s => s.trim()) : [];

    // Валидация
    if (!name) {
        showMessage('Введите название сервиса', 'error');
        return;
    }

    if (weight < 1 || weight > 5) {
        showMessage('Вес сложности должен быть от 1 до 5', 'error');
        return;
    }

    try {
        // Подготавливаем данные для отправки
        const serviceData = {
            name,
            description,
            type,
            weight,
            quality: quality || 'Medium',
            base_price: 0,
            required_specializations: requiredSpecializations
        };

        // Добавляем company_id только если работаем с мульти-компанийной версией
        if (typeof currentCompanyId !== 'undefined' && currentCompanyId) {
            serviceData.company_id = currentCompanyId;
        }

        // Отправляем запрос на сервер
        await apiCall('POST', '/api/services', serviceData);

        showMessage('Сервис добавлен');
        hideAddServiceForm();

        // Перезагружаем данные
        if (typeof loadCompanyData === 'function' && currentCompanyId) {
            // Новая версия - загружаем данные компании
            await loadCompanyData();
        } else {
            // Старая версия - загружаем все данные
            await init();
        }
    } catch (error) {
        console.error('Ошибка добавления сервиса:', error);
        showMessage('Ошибка добавления сервиса', 'error');
    }
}

async function addExpense() {
    const name = document.getElementById('expenseName').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const period = parseInt(document.getElementById('expensePeriod').value) || 1;
    const periodType = document.getElementById('expensePeriodType').value;

    if (!name || amount <= 0) {
        showMessage('Заполните все поля корректно', 'error');
        return;
    }

    try {
        await apiCall('POST', '/api/expenses', { name, amount, period, period_type: periodType });
        showMessage('Затрата добавлена');
        document.getElementById('expenseName').value = '';
        document.getElementById('expenseAmount').value = '';
        await init();
    } catch (error) {
        console.error('Ошибка добавления затраты:', error);
    }
}

// Расчет цен сервисов
async function calculatePrices() {
    if (!currentCompanyId) {
        showMessage('Выберите компанию', 'error');
        return;
    }

    try {
        const result = await apiCall('POST', '/api/calculate-prices', {
            company_id: currentCompanyId
        });

        showPricingResults(result);
        showMessage('Расчет цен выполнен успешно');
    } catch (error) {
        console.error('Ошибка расчета цен:', error);
        showMessage('Ошибка расчета цен: ' + error.message, 'error');
    }
}
function showPricingResults(clientPrices, totalCosts, totalWeight, margin, result) {
    // Если передан новый формат результата (из мульти-компанийной версии)
    if (result && result.clientPrices) {
        const resultsHtml = `
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #22c55e;">
                <h3 style="color: #22c55e; margin-bottom: 15px;">Результаты расчета цен</h3>
                
                <div style="background: #f0fdf4; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <h4>Общая информация:</h4>
                    <p><strong>Общие затраты:</strong> ₴${result.totalMonthlyCosts.toFixed(2)}/мес</p>
                    <p><strong>Общий вес системы:</strong> ${result.totalSystemWeight.toFixed(1)} единиц</p>
                    <p><strong>Стоимость единицы:</strong> ₴${result.costPerUnit.toFixed(2)}/мес</p>
                    <p><strong>Маржа:</strong> ${result.profitMargin.toFixed(1)}%</p>
                </div>
                
                <div style="background: #eff6ff; padding: 15px; border-radius: 6px;">
                    <h4>Цены для клиентов:</h4>
                    ${Object.values(result.clientPrices).map(client => `
                        <div style="background: white; padding: 12px; margin: 8px 0; border-radius: 6px; border-left: 4px solid #3b82f6;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <strong>${client.name}</strong>
                                <span style="font-size: 18px; font-weight: bold; color: #22c55e;">₴${client.finalPrice.toFixed(2)}/мес</span>
                            </div>
                            <div style="font-size: 13px; color: #6b7280;">
                                Сервисы: ${client.servicesWeight.toFixed(1)} | 
                                Оборудование: ${client.equipmentWeight.toFixed(1)} | 
                                Тариф: ${client.tariffMultiplier}x | 
                                SLA: ${client.slaMultiplier}x
                            </div>
                            <div style="font-size: 13px; color: #059669;">
                                Базовый вес: ${client.baseWeight.toFixed(1)} → 
                                Скорректированный: ${client.adjustedWeight.toFixed(1)} 
                                (${client.weightPercentage.toFixed(1)}% от общего)
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="background: #ecfdf5; padding: 15px; border-radius: 6px; margin-top: 15px;">
                    <h4>Итоговые показатели:</h4>
                    <p><strong>Общая выручка:</strong> ₴${result.summary.totalRevenue.toFixed(2)}/мес</p>
                    <p><strong>Чистая прибыль:</strong> ₴${result.summary.totalProfit.toFixed(2)}/мес</p>
                    <p><strong>Рентабельность:</strong> ${((result.summary.totalProfit / result.totalMonthlyCosts) * 100).toFixed(1)}%</p>
                </div>
            </div>
        `;

        const financeCard = document.getElementById('tab-finance');
        const existingResults = financeCard.querySelector('.pricing-results');
        if (existingResults) {
            existingResults.remove();
        }

        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'pricing-results';
        resultsDiv.innerHTML = resultsHtml;

        const expensesSection = financeCard.querySelector('h3');
        expensesSection.parentNode.insertBefore(resultsDiv, expensesSection);

        return; // Выходим, если обработали новый формат
    }

    // Старый формат результата (для обратной совместимости)
    const resultsHtml = `
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #22c55e;">
            <h3 style="color: #22c55e; margin-bottom: 15px;">Результаты расчета справедливых цен</h3>

            <div style="background: #f0fdf4; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h4>Общая информация:</h4>
                <p><strong>Общие затраты компании:</strong> ₴${totalCosts.toFixed(2)}/мес</p>
                <p><strong>Общий вес системы:</strong> ${totalWeight.toFixed(1)} единиц сложности</p>
                <p><strong>Маржа прибыли:</strong> ${(margin * 100).toFixed(1)}%</p>
                <p><strong>Стоимость 1 единицы сложности:</strong> ₴${(totalCosts / totalWeight).toFixed(2)}/мес</p>
            </div>

            <div style="background: #eff6ff; padding: 15px; border-radius: 6px;">
                <h4>Цены для клиентов:</h4>
                ${Object.values(clientPrices).map(client => `
                    <div style="background: white; padding: 12px; margin: 8px 0; border-radius: 6px; border-left: 4px solid #3b82f6;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <strong>${client.name}</strong>
                            <span style="font-size: 18px; font-weight: bold; color: #22c55e;">₴${client.finalPrice.toFixed(2)}/мес</span>
                        </div>
                        <div style="font-size: 13px; color: #6b7280;">
                            <span>Сервисы: ${client.servicesWeight.toFixed(1)} | </span>
                            <span>Оборудование: ${client.equipmentWeight.toFixed(1)} | </span>
                            <span>Итого: ${client.totalWeight.toFixed(1)} (${client.weightPercentage.toFixed(1)}% от общего веса)</span>
                        </div>
                        <div style="font-size: 13px; color: #059669; margin-top: 4px;">
                            Доля затрат: ₴${client.costShare.toFixed(2)} + маржа ${(margin * 100).toFixed(1)}% = ₴${client.finalPrice.toFixed(2)}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top: 15px; padding: 10px; background: #fef3c7; border-radius: 6px; font-size: 14px;">
                <strong>Принцип расчета:</strong> Цена для каждого клиента пропорциональна сложности его инфраструктуры.
                Учитывается вес обслуживания сервисов и оборудования. Чем сложнее инфраструктура - тем выше цена.
            </div>
        </div>
    `;

    // Показываем результаты перед разделом затрат
    const financeCard = document.getElementById('tab-finance');
    const existingResults = financeCard.querySelector('.pricing-results');
    if (existingResults) {
        existingResults.remove();
    }

    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'pricing-results';
    resultsDiv.innerHTML = resultsHtml;

    const expensesSection = financeCard.querySelector('h3');
    expensesSection.parentNode.insertBefore(resultsDiv, expensesSection);
}
// Импорт/экспорт
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
        showMessage('Выберите JSON файл', 'error');
        return;
    }

    try {
        showMessage('Импорт данных...', 'info');
        const text = await file.text();
        const data = JSON.parse(text);

        const result = await apiCall('POST', '/api/import-data', data);
        showMessage(`Импортировано: ${result.imported.clients} клиентов, ${result.imported.services} сервисов`);
        await init();
    } catch (error) {
        showMessage('Ошибка импорта: ' + error.message, 'error');
    }
}

async function exportData() {
    try {
        const data = await apiCall('GET', '/api/export-data');

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `service_management_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage('Данные экспортированы');
    } catch (error) {
        console.error('Ошибка экспорта:', error);
    }
}

async function importDemoData() {
    const demoData = {
        "предприятия": [
            {
                "название_предприятия": "HD B-EAST",
                "рабочие_места": {
                    "тонкие_клиенты": { "count": 60, "weight": 0.8 },
                    "ноутбуки": { "count": 40, "weight": 2.0 },
                    "десктопы": { "count": 105, "weight": 1.2 }
                },
                "печатная_техника": {
                    "принтеры": { "count": 30, "weight": 1.0 },
                    "МФУ": { "count": 15, "weight": 2.5 },
                    "высоконагруженные": { "count": 8, "weight": 8.0 }
                },
                "сетевое_оборудование": {
                    "cisco": { "count": 42, "weight": 3.5 }
                },
                "видеонаблюдение": {
                    "ip_камеры": { "count": 139, "weight": 0.3 },
                    "видеорегистраторы": { "count": 4, "weight": 2.5 }
                },
                "ip_телефония": {
                    "стандартные_телефоны": { "count": 68, "weight": 0.4 },
                    "телефоны_руководителей": { "count": 4, "weight": 1.0 }
                },
                "SaaS сервисы": {
                    "1С_УПП поддержка": {"Use": 1, "Description": "Поддержка 1C", "Type": "SaaS", "Quality": "High", "Weight": 4},
                    "GWS": {"Use": 1, "Description": "Google Workspace", "Type": "SaaS", "Quality": "High", "Weight": 1},
                    "Office 365": {"Use": 1, "Description": "Microsoft Office 365", "Type": "SaaS", "Quality": "High", "Weight": 1}
                },
                "IaaS сервіси": {
                    "Windows AD": {"Use": 1, "Description": "Active Directory", "Type": "IaaS", "Weight": 5},
                    "Backup": {"Use": 1, "Description": "Система резервного копирования", "Type": "IaaS", "Weight": 3}
                }
            },
            {
                "название_предприятия": "TechCorp Ltd",
                "рабочие_места": {
                    "ноутбуки": { "count": 25, "weight": 2.0 },
                    "десктопы": { "count": 15, "weight": 1.2 },
                    "мобильные_устройства": { "count": 30, "weight": 1.5 }
                },
                "печатная_техника": {
                    "принтеры": { "count": 8, "weight": 1.0 },
                    "МФУ": { "count": 3, "weight": 2.5 }
                },
                "сетевое_оборудование": {
                    "mikrotik": { "count": 12, "weight": 3.0 },
                    "ubiquiti": { "count": 8, "weight": 2.5 }
                },
                "сервера": {
                    "файловые_серверы": { "count": 2, "weight": 3.0 },
                    "web_серверы": { "count": 1, "weight": 4.0 }
                },
                "SaaS сервисы": {
                    "GWS": {"Use": 1, "Description": "Google Workspace", "Type": "SaaS", "Quality": "High", "Weight": 1},
                    "Slack": {"Use": 1, "Description": "Корпоративный мессенджер", "Type": "SaaS", "Quality": "Medium", "Weight": 1}
                },
                "IaaS сервіси": {
                    "Cloud Storage": {"Use": 1, "Description": "Облачное хранилище", "Type": "IaaS", "Weight": 2}
                }
            },
            {
                "название_предприятия": "Small Office",
                "рабочие_места": {
                    "ноутбуки": { "count": 5, "weight": 2.0 },
                    "планшеты": { "count": 3, "weight": 1.0 }
                },
                "печатная_техника": {
                    "принтеры": { "count": 1, "weight": 1.0 }
                },
                "SaaS сервисы": {
                    "GWS": {"Use": 1, "Description": "Google Workspace", "Type": "SaaS", "Quality": "High", "Weight": 1}
                }
            }
        ]
    };

    try {
        const result = await apiCall('POST', '/api/import-data', demoData);
        showMessage(`Демо данные загружены: ${result.imported.clients} клиентов, ${result.imported.services} сервисов`);
        await init();
    } catch (error) {
        console.error('Ошибка импорта демо данных:', error);
    }
}
function renderCompanySelector() {
    const select = document.getElementById('companySelect');
    if (!select) return; // Если селектора нет в старой версии HTML

    select.innerHTML = companies.map(company =>
        `<option value="${company.id}">${company.name}</option>`
    ).join('');

    if (companies.length > 0) {
        select.value = companies[0].id;
        currentCompanyId = companies[0].id;
        updateCompanyInfo();
    }
}

async function switchCompany() {
    const selectElement = document.getElementById('companySelect');
    if (!selectElement) return;

    currentCompanyId = parseInt(selectElement.value);

    if (currentCompanyId) {
        await loadCompanyData();
        updateCompanyInfo();
    }
}

async function loadCompanyData() {
    if (!currentCompanyId) return;

    try {
        clients = await apiCall('GET', `/api/clients?company_id=${currentCompanyId}`);
        services = await apiCall('GET', `/api/services?company_id=${currentCompanyId}`);
        employees = await apiCall('GET', `/api/employees?company_id=${currentCompanyId}`);
        expenses = await apiCall('GET', `/api/expenses?company_id=${currentCompanyId}`);

        updateStats();
        renderAll();
    } catch (error) {
        console.error('Ошибка загрузки данных компании:', error);
        showMessage('Ошибка загрузки данных компании', 'error');
    }
}

function updateCompanyInfo() {
    const infoElement = document.getElementById('currentCompanyInfo');
    if (!infoElement || !currentCompanyId) return;

    const company = companies.find(c => c.id === currentCompanyId);

    if (company) {
        infoElement.textContent = company.description;
        infoElement.style.display = 'block';
    }
}

async function showAssignClientForm() {
    const form = document.getElementById('assignClientForm');
    if (!form) return; // Если формы нет в старой версии HTML

    // Загружаем всех клиентов (не только текущей компании)
    const allClients = await apiCall('GET', '/api/clients');

    const clientSelect = document.getElementById('assignClientSelect');
    clientSelect.innerHTML = '<option value="">Выберите клиента</option>' +
        allClients.map(client =>
            `<option value="${client.id}">${client.name}</option>`
        ).join('');

    const tariffSelect = document.getElementById('assignTariffSelect');
    tariffSelect.innerHTML = '<option value="">Выберите тариф</option>' +
        tariffPlans.map(tariff =>
            `<option value="${tariff.id}">${tariff.name} (${tariff.multiplier}x)</option>`
        ).join('');

    const slaSelect = document.getElementById('assignSlaSelect');
    slaSelect.innerHTML = '<option value="">Выберите SLA</option>' +
        slaLevels.map(sla =>
            `<option value="${sla.id}">${sla.name} (${sla.response_time_hours}ч, ${sla.multiplier}x)</option>`
        ).join('');

    form.classList.remove('hidden');
}

function hideAssignClientForm() {
    const form = document.getElementById('assignClientForm');
    if (form) form.classList.add('hidden');
}

async function assignClientToCompany() {
    const clientId = document.getElementById('assignClientSelect').value;
    const tariffId = document.getElementById('assignTariffSelect').value;
    const slaId = document.getElementById('assignSlaSelect').value;

    if (!clientId || !tariffId || !slaId) {
        showMessage('Заполните все поля', 'error');
        return;
    }

    try {
        await apiCall('POST', '/api/client-company-assignments', {
            client_id: parseInt(clientId),
            company_id: currentCompanyId,
            tariff_plan_id: parseInt(tariffId),
            sla_level_id: parseInt(slaId)
        });

        showMessage('Клиент назначен к компании');
        hideAssignClientForm();
        await loadCompanyData();
    } catch (error) {
        console.error('Ошибка назначения клиента:', error);
        showMessage('Ошибка назначения клиента', 'error');
    }
}

async function addEmployee() {
    // Проверяем, выбрана ли компания (для новой мульти-компанийной версии)
    if (typeof currentCompanyId !== 'undefined' && currentCompanyId && !currentCompanyId) {
        showMessage('Выберите компанию', 'error');
        return;
    }

    // Получаем основные данные из формы
    const name = document.getElementById('employeeName').value.trim();
    const salary = parseFloat(document.getElementById('employeeSalary').value) || 0;

    // Новые поля для мульти-компанийной версии (если есть в форме)
    const specializationsText = document.getElementById('employeeSpecializations')?.value.trim() || '';
    const hourlyRateInput = document.getElementById('employeeHourlyRate');
    const hourlyRate = hourlyRateInput ? parseFloat(hourlyRateInput.value) || null : null;
    const servicesText = document.getElementById('employeeServices')?.value.trim() || '';

    // Валидация основных полей
    if (!name) {
        showMessage('Введите имя сотрудника', 'error');
        return;
    }

    if (salary <= 0) {
        showMessage('Зарплата должна быть больше 0₴', 'error');
        return;
    }

    // Валидация почасовой ставки (если введена)
    if (hourlyRate !== null && hourlyRate <= 0) {
        showMessage('Почасовая ставка должна быть больше 0₴', 'error');
        return;
    }

    // Обработка специализаций и поддерживаемых сервисов
    const specializations = specializationsText ?
        specializationsText.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];

    const supportedServices = servicesText ?
        servicesText.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];

    try {
        // Подготавливаем данные для отправки
        const employeeData = {
            name,
            salary,
            supported_services: supportedServices
        };

        // Добавляем поля для мульти-компанийной версии если они доступны
        if (typeof currentCompanyId !== 'undefined' && currentCompanyId) {
            employeeData.company_id = currentCompanyId;
        }

        if (specializations.length > 0) {
            employeeData.specializations = specializations;
        }

        if (hourlyRate !== null) {
            employeeData.hourly_rate = hourlyRate;
        }

        // Отправляем запрос на сервер
        await apiCall('POST', '/api/employees', employeeData);

        showMessage('Сотрудник добавлен');

        // Очищаем форму
        document.getElementById('employeeName').value = '';
        document.getElementById('employeeSalary').value = '';

        // Очищаем новые поля если они есть
        if (document.getElementById('employeeSpecializations')) {
            document.getElementById('employeeSpecializations').value = '';
        }
        if (document.getElementById('employeeHourlyRate')) {
            document.getElementById('employeeHourlyRate').value = '';
        }
        if (document.getElementById('employeeServices')) {
            document.getElementById('employeeServices').value = '';
        }

        // Перезагружаем данные
        if (typeof loadCompanyData === 'function' && currentCompanyId) {
            // Новая версия - загружаем данные компании
            await loadCompanyData();
        } else {
            // Старая версия - загружаем все данные
            await init();
        }
    } catch (error) {
        console.error('Ошибка добавления сотрудника:', error);
        showMessage('Ошибка добавления сотрудника', 'error');
    }
}

// Инициализация при загрузке страницы
window.addEventListener('load', init);
