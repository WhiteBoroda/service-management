// server.js - Обновленный для поддержки холдинговой структуры
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));


// Инициализация базы данных
const db = new sqlite3.Database('service_management.db');

// Создание таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'user', 'viewer')) DEFAULT 'user',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        created_by INTEGER REFERENCES users(id)
    )`);

    // Таблица сессий
    db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT
    )`);

    // Таблица логов
    db.run(`CREATE TABLE IF NOT EXISTS user_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        resource TEXT,
        resource_id INTEGER,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Создаем администратора по умолчанию
    bcrypt.hash('admin123', 10, (err, hash) => {
        if (err) {
            console.error('Ошибка создания пароля администратора:', err);
            return;
        }

        db.run(`INSERT OR IGNORE INTO users (username, password_hash, full_name, role) 
                VALUES ('admin', ?, 'Администратор системы', 'admin')`, [hash], (err) => {
            if (err) {
                console.error('Ошибка создания администратора:', err);
            } else {
                console.log('✅ Администратор создан: admin / admin123');
            }
        });
    });

    // Таблица компаний
    db.run(`CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        logo_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Тарифные планы
    db.run(`CREATE TABLE IF NOT EXISTS tariff_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        multiplier REAL NOT NULL DEFAULT 1.0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // SLA уровни
    db.run(`CREATE TABLE IF NOT EXISTS sla_levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        response_time_hours INTEGER NOT NULL,
        multiplier REAL NOT NULL DEFAULT 1.0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица клиентов
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        metadata TEXT,
        services TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Назначения клиент-компания
    db.run(`CREATE TABLE IF NOT EXISTS client_company_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        company_id INTEGER NOT NULL REFERENCES companies(id),
        tariff_plan_id INTEGER REFERENCES tariff_plans(id),
        sla_level_id INTEGER REFERENCES sla_levels(id),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(client_id, company_id)
    )`);

    // Таблица сервисов
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT CHECK(type IN ('SaaS', 'IaaS', 'PaaS')),
        weight INTEGER DEFAULT 1,
        quality TEXT CHECK(quality IN ('High', 'Medium', 'Low')),
        base_price REAL DEFAULT 0,
        calculated_price REAL DEFAULT 0,
        company_id INTEGER REFERENCES companies(id),
        required_specializations TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, company_id)
    )`);

    // Таблица сотрудников
    db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        salary REAL NOT NULL,
        company_id INTEGER REFERENCES companies(id),
        specializations TEXT,
        hourly_rate REAL,
        supported_services TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица затрат
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        period INTEGER NOT NULL,
        period_type TEXT CHECK(period_type IN ('months', 'years')),
        monthly_amount REAL NOT NULL,
        company_id INTEGER REFERENCES companies(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица финансовых настроек
    db.run(`CREATE TABLE IF NOT EXISTS financial_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER REFERENCES companies(id),
        expected_monthly_revenue REAL DEFAULT 0,
        profit_margin REAL DEFAULT 20,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id)
    )`);

    // Вставляем базовые данные
    db.run(`INSERT OR IGNORE INTO tariff_plans (name, multiplier, description) VALUES
        ('Базовый', 1.0, 'Стандартное обслуживание'),
        ('Премиум', 1.3, 'Расширенное обслуживание с дополнительными возможностями'),
        ('Корпоративный', 1.5, 'Максимальный уровень обслуживания с персональным менеджером')`);

    db.run(`INSERT OR IGNORE INTO sla_levels (name, response_time_hours, multiplier, description) VALUES
        ('Стандартный', 24, 1.0, 'Реакция в течение рабочего дня'),
        ('Ускоренный', 8, 1.2, 'Реакция в течение рабочего времени'),
        ('Приоритетный', 4, 1.5, 'Быстрая реакция в любое время'),
        ('Критический', 1, 2.0, 'Немедленная реакция 24/7')`);

    db.run(`INSERT OR IGNORE INTO companies (name, description) VALUES
        ('IT Services', 'Обслуживание IT-инфраструктуры и программного обеспечения'),
        ('Legal Services', 'Юридическое сопровождение деятельности холдинга'),
        ('Financial Services', 'Финансовые услуги и бухгалтерское обслуживание'),
        ('Transport Services', 'Транспортные и логистические услуги')`);

    // Создаем финансовые настройки для каждой компании
    db.all('SELECT id FROM companies', (err, companies) => {
        if (!err && companies) {
            companies.forEach(company => {
                db.run('INSERT OR IGNORE INTO financial_settings (company_id, profit_margin) VALUES (?, 20)', company.id);
            });
        }
    });
});

function requireAuth(requiredRole = null) {
    return async (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        // Проверяем токен в базе
        db.get(`SELECT u.*, s.expires_at FROM users u 
                JOIN user_sessions s ON u.id = s.user_id 
                WHERE s.session_token = ? AND s.expires_at > datetime('now') AND u.is_active = 1`,
            [token], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Недействительный токен' });
            }

            // Проверяем роль если требуется
            if (requiredRole) {
                const roleHierarchy = { viewer: 1, user: 2, admin: 3 };
                const userLevel = roleHierarchy[user.role] || 0;
                const requiredLevel = roleHierarchy[requiredRole] || 0;

                if (userLevel < requiredLevel) {
                    return res.status(403).json({ error: 'Недостаточно прав' });
                }
            }

            req.user = user;
            next();
        });
    };
}
function logAction(userId, action, resource = null, resourceId = null, details = null, req = null) {
    const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';

    db.run(`INSERT INTO user_actions (user_id, action, resource, resource_id, details, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, action, resource, resourceId, details, ip]);
}
// Вход в систему
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    // Находим пользователя
    db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // Проверяем пароль
        bcrypt.compare(password, user.password_hash, (err, isValid) => {
            if (err || !isValid) {
                return res.status(401).json({ error: 'Неверный логин или пароль' });
            }

            // Создаем сессию
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 часов

            db.run(`INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address, user_agent) 
                    VALUES (?, ?, ?, ?, ?)`,
                [user.id, sessionToken, expiresAt.toISOString(), req.ip, req.get('User-Agent')], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка создания сессии' });
                }

                // Обновляем время последнего входа
                db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);

                logAction(user.id, 'login', null, null, null, req);

                res.json({
                    success: true,
                    token: sessionToken,
                    user: {
                        id: user.id,
                        username: user.username,
                        full_name: user.full_name,
                        role: user.role
                    }
                });
            });
        });
    });
});

// Выход из системы
app.post('/api/auth/logout', requireAuth(), (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    db.run('DELETE FROM user_sessions WHERE session_token = ?', [token], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка выхода' });
        }

        logAction(req.user.id, 'logout', null, null, null, req);
        res.json({ success: true });
    });
});

// Проверка токена
app.get('/api/auth/me', requireAuth(), (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            full_name: req.user.full_name,
            role: req.user.role
        }
    });
});

// ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (только админ) ==========

// Список пользователей
app.get('/api/users', requireAuth('admin'), (req, res) => {
    db.all(`SELECT id, username, full_name, role, is_active, created_at, last_login 
            FROM users ORDER BY created_at DESC`, (err, users) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(users);
    });
});

// Создание пользователя
app.post('/api/users', requireAuth('admin'), (req, res) => {
    const { username, password, full_name, role } = req.body;

    if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    if (!['admin', 'user', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Неверная роль' });
    }

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка создания пароля' });
        }

        db.run(`INSERT INTO users (username, password_hash, full_name, role, created_by) 
                VALUES (?, ?, ?, ?, ?)`,
            [username, hash, full_name, role, req.user.id], function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
                }
                return res.status(500).json({ error: err.message });
            }

            logAction(req.user.id, 'create_user', 'users', this.lastID,
                `Создан пользователь ${username} с ролью ${role}`, req);

            res.json({ id: this.lastID, message: 'Пользователь создан' });
        });
    });
});

// Обновление пользователя
app.put('/api/users/:id', requireAuth('admin'), (req, res) => {
    const { full_name, role, is_active } = req.body;
    const userId = req.params.id;

    db.run(`UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?`,
        [full_name, role, is_active ? 1 : 0, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        logAction(req.user.id, 'update_user', 'users', userId,
            `Обновлен пользователь: роль ${role}, активен: ${is_active}`, req);

        res.json({ message: 'Пользователь обновлен' });
    });
});

// API для компаний
app.get('/api/companies', (req, res) => {
    db.all('SELECT * FROM companies ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/tariff-plans', (req, res) => {
    db.all('SELECT * FROM tariff_plans ORDER BY multiplier', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/sla-levels', (req, res) => {
    db.all('SELECT * FROM sla_levels ORDER BY response_time_hours', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Обновленные API для клиентов
app.get('/api/clients', requireAuth(), (req, res) => {
    const companyId = req.query.company_id;

    let query = `
        SELECT c.*, 
               GROUP_CONCAT(DISTINCT co.name) as companies,
               GROUP_CONCAT(DISTINCT tp.name) as tariff_plans,
               GROUP_CONCAT(DISTINCT sl.name) as sla_levels
        FROM clients c
        LEFT JOIN client_company_assignments cca ON c.id = cca.client_id AND cca.is_active = 1
        LEFT JOIN companies co ON cca.company_id = co.id
        LEFT JOIN tariff_plans tp ON cca.tariff_plan_id = tp.id
        LEFT JOIN sla_levels sl ON cca.sla_level_id = sl.id
    `;

    const params = [];
    if (companyId) {
        query += ' WHERE cca.company_id = ?';
        params.push(companyId);
    }

    query += ' GROUP BY c.id ORDER BY c.name';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const clients = rows.map(row => ({
            ...row,
            metadata: JSON.parse(row.metadata || '{}'),
            services: JSON.parse(row.services || '{}'),
            companies: row.companies ? row.companies.split(',') : [],
            tariff_plans: row.tariff_plans ? row.tariff_plans.split(',') : [],
            sla_levels: row.sla_levels ? row.sla_levels.split(',') : []
        }));

        res.json(clients);
    });
});

// Назначение клиента к компании
app.post('/api/client-company-assignments', (req, res) => {
    const { client_id, company_id, tariff_plan_id, sla_level_id } = req.body;

    const stmt = db.prepare(`INSERT OR REPLACE INTO client_company_assignments 
        (client_id, company_id, tariff_plan_id, sla_level_id) VALUES (?, ?, ?, ?)`);

    stmt.run([client_id, company_id, tariff_plan_id, sla_level_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Назначение создано' });
    });

    stmt.finalize();
});

// Обновленные API для сервисов
app.get('/api/services', (req, res) => {
    const companyId = req.query.company_id;

    let query = 'SELECT s.*, c.name as company_name FROM services s LEFT JOIN companies c ON s.company_id = c.id';
    const params = [];

    if (companyId) {
        query += ' WHERE s.company_id = ?';
        params.push(companyId);
    }

    query += ' ORDER BY s.name';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const services = rows.map(row => ({
            ...row,
            required_specializations: JSON.parse(row.required_specializations || '[]')
        }));

        res.json(services);
    });
});

app.post('/api/services', (req, res) => {
    const { name, description, type, weight, quality, base_price, company_id, required_specializations } = req.body;

    const stmt = db.prepare(`INSERT INTO services 
        (name, description, type, weight, quality, base_price, company_id, required_specializations) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    stmt.run([
        name, description, type, weight || 1, quality || 'Medium',
        base_price || 0, company_id, JSON.stringify(required_specializations || [])
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Сервис добавлен' });
    });

    stmt.finalize();
});

// Обновленные API для сотрудников
app.get('/api/employees', (req, res) => {
    const companyId = req.query.company_id;

    let query = 'SELECT e.*, c.name as company_name FROM employees e LEFT JOIN companies c ON e.company_id = c.id';
    const params = [];

    if (companyId) {
        query += ' WHERE e.company_id = ?';
        params.push(companyId);
    }

    query += ' ORDER BY e.name';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const employees = rows.map(row => ({
            ...row,
            supported_services: JSON.parse(row.supported_services || '[]'),
            specializations: JSON.parse(row.specializations || '[]')
        }));

        res.json(employees);
    });
});

app.post('/api/employees', (req, res) => {
    const { name, salary, company_id, specializations, hourly_rate, supported_services } = req.body;

    const stmt = db.prepare(`INSERT INTO employees 
        (name, salary, company_id, specializations, hourly_rate, supported_services) 
        VALUES (?, ?, ?, ?, ?, ?)`);

    stmt.run([
        name, salary, company_id,
        JSON.stringify(specializations || []),
        hourly_rate,
        JSON.stringify(supported_services || [])
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Сотрудник добавлен' });
    });

    stmt.finalize();
});

// Обновленные API для затрат
app.get('/api/expenses', (req, res) => {
    const companyId = req.query.company_id;

    let query = 'SELECT e.*, c.name as company_name FROM expenses e LEFT JOIN companies c ON e.company_id = c.id';
    const params = [];

    if (companyId) {
        query += ' WHERE e.company_id = ?';
        params.push(companyId);
    }

    query += ' ORDER BY e.name';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/expenses', (req, res) => {
    const { name, amount, period, period_type, company_id } = req.body;
    const monthly_amount = period_type === 'months' ? amount / period : amount / (period * 12);

    const stmt = db.prepare(`INSERT INTO expenses 
        (name, amount, period, period_type, monthly_amount, company_id) 
        VALUES (?, ?, ?, ?, ?, ?)`);

    stmt.run([name, amount, period, period_type, monthly_amount, company_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Затрата добавлена' });
    });

    stmt.finalize();
});

// Усовершенствованный алгоритм расчета цен
app.post('/api/calculate-prices', (req, res) => {
    const { company_id } = req.body;

    if (!company_id) {
        return res.status(400).json({ error: 'Выберите компанию' });
    }

    // Получаем все данные для расчета
    const promises = [
        new Promise((resolve, reject) => {
            db.all('SELECT * FROM employees WHERE company_id = ?', [company_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    specializations: JSON.parse(row.specializations || '[]'),
                    supported_services: JSON.parse(row.supported_services || '[]')
                })));
            });
        }),
        new Promise((resolve, reject) => {
            db.all('SELECT * FROM expenses WHERE company_id = ?', [company_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }),
        new Promise((resolve, reject) => {
            db.all('SELECT * FROM services WHERE company_id = ?', [company_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    required_specializations: JSON.parse(row.required_specializations || '[]')
                })));
            });
        }),
        new Promise((resolve, reject) => {
            db.all(`SELECT c.*, cca.tariff_plan_id, cca.sla_level_id, tp.multiplier as tariff_multiplier, 
                           sl.multiplier as sla_multiplier
                    FROM clients c
                    JOIN client_company_assignments cca ON c.id = cca.client_id
                    LEFT JOIN tariff_plans tp ON cca.tariff_plan_id = tp.id
                    LEFT JOIN sla_levels sl ON cca.sla_level_id = sl.id
                    WHERE cca.company_id = ? AND cca.is_active = 1`, [company_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    metadata: JSON.parse(row.metadata || '{}'),
                    services: JSON.parse(row.services || '{}'),
                    tariff_multiplier: row.tariff_multiplier || 1.0,
                    sla_multiplier: row.sla_multiplier || 1.0
                })));
            });
        }),
        new Promise((resolve, reject) => {
            db.get('SELECT * FROM financial_settings WHERE company_id = ?', [company_id], (err, row) => {
                if (err) reject(err);
                else resolve(row || { profit_margin: 20 });
            });
        })
    ];

    Promise.all(promises)
        .then(([employees, expenses, services, clients, settings]) => {
            const result = calculateAdvancedPricing(employees, expenses, services, clients, settings);
            res.json(result);
        })
        .catch(err => {
            console.error('Ошибка расчета цен:', err);
            res.status(500).json({ error: err.message });
        });
});

// Функция расчета цен с учетом всех факторов
function calculateAdvancedPricing(employees, expenses, services, clients, settings) {
    // 1. Считаем общие затраты компании
    const totalEmployeeCosts = employees.reduce((sum, emp) => sum + (emp.salary || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.monthly_amount || 0), 0);
    const totalMonthlyCosts = totalEmployeeCosts + totalExpenses;

    if (totalMonthlyCosts <= 0) {
        throw new Error('Нет данных о затратах компании');
    }

    // 2. Функция расчета веса оборудования
    function calculateEquipmentWeight(metadata) {
        let totalWeight = 0;
        Object.values(metadata || {}).forEach(categoryData => {
            if (typeof categoryData === 'object' && categoryData !== null) {
                if (categoryData.count !== undefined && categoryData.weight !== undefined) {
                    totalWeight += categoryData.count * categoryData.weight;
                } else {
                    Object.values(categoryData).forEach(itemData => {
                        if (typeof itemData === 'object' && itemData.count !== undefined) {
                            totalWeight += itemData.count * itemData.weight;
                        } else {
                            totalWeight += (parseInt(itemData) || 0) * 1;
                        }
                    });
                }
            } else {
                totalWeight += (parseInt(categoryData) || 0) * 1;
            }
        });
        return totalWeight;
    }

    // 3. Функция расчета веса сервисов с учетом специализации сотрудников
    function calculateServicesWeight(clientServices) {
        let totalWeight = 0;
        let specialistLoad = {};

        Object.entries(clientServices || {}).forEach(([serviceName, serviceData]) => {
            if (serviceData.Use === 1) {
                const service = services.find(s => s.name === serviceName);
                if (service) {
                    const serviceWeight = service.weight || 1;

                    // Находим сотрудников, которые могут обслуживать этот сервис
                    const availableEmployees = employees.filter(emp =>
                        emp.supported_services.includes(serviceName) ||
                        service.required_specializations.some(spec =>
                            emp.specializations.includes(spec)
                        )
                    );

                    if (availableEmployees.length === 0) {
                        // Если нет специалистов, увеличиваем вес (дорогое обслуживание)
                        totalWeight += serviceWeight * 1.5;
                    } else {
                        // Распределяем нагрузку между специалистами
                        availableEmployees.forEach(emp => {
                            if (!specialistLoad[emp.id]) specialistLoad[emp.id] = 0;
                            specialistLoad[emp.id] += serviceWeight / availableEmployees.length;
                        });
                        totalWeight += serviceWeight;
                    }
                }
            }
        });

        return { totalWeight, specialistLoad };
    }

    // 4. Рассчитываем веса для каждого клиента
    let totalSystemWeight = 0;
    const clientCalculations = {};

    clients.forEach(client => {
        const equipmentWeight = calculateEquipmentWeight(client.metadata);
        const { totalWeight: servicesWeight, specialistLoad } = calculateServicesWeight(client.services);
        const baseWeight = equipmentWeight + servicesWeight;

        // Применяем мультипликаторы тарифа и SLA
        const adjustedWeight = baseWeight * client.tariff_multiplier * client.sla_multiplier;

        clientCalculations[client.id] = {
            name: client.name,
            equipmentWeight,
            servicesWeight,
            baseWeight,
            tariffMultiplier: client.tariff_multiplier,
            slaMultiplier: client.sla_multiplier,
            adjustedWeight,
            specialistLoad
        };

        totalSystemWeight += adjustedWeight;
    });

    if (totalSystemWeight <= 0) {
        throw new Error('Нет активных клиентов для расчета');
    }

    // 5. Рассчитываем цены
    const profitMargin = (settings.profit_margin || 20) / 100;
    const costPerUnit = totalMonthlyCosts / totalSystemWeight;
    const clientPrices = {};

    Object.entries(clientCalculations).forEach(([clientId, calc]) => {
        const baseCost = calc.adjustedWeight * costPerUnit;
        const finalPrice = baseCost * (1 + profitMargin);

        clientPrices[clientId] = {
            ...calc,
            baseCost,
            finalPrice,
            weightPercentage: (calc.adjustedWeight / totalSystemWeight * 100)
        };
    });

    return {
        success: true,
        totalMonthlyCosts,
        totalSystemWeight,
        costPerUnit,
        profitMargin: profitMargin * 100,
        clientPrices,
        summary: {
            totalRevenue: Object.values(clientPrices).reduce((sum, client) => sum + client.finalPrice, 0),
            totalProfit: Object.values(clientPrices).reduce((sum, client) => sum + client.finalPrice, 0) - totalMonthlyCosts,
            clientCount: Object.keys(clientPrices).length
        }
    };
}

// Остальные API эндпоинты
app.post('/api/clients', requireAuth('user'), (req, res) => {
    const { name, metadata, services } = req.body;

    const stmt = db.prepare(`INSERT INTO clients (name, metadata, services) VALUES (?, ?, ?)`);

    stmt.run([
        name,
        JSON.stringify(metadata || {}),
        JSON.stringify(services || {})
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Клиент добавлен' });
    });
    logAction(req.user.id, 'create_client', 'clients', null, req.body.name, req);
    stmt.finalize();
});

app.put('/api/clients/:id', requireAuth('user'), (req, res) => {
    const { name, metadata, services } = req.body;

    db.run(`UPDATE clients SET name = ?, metadata = ?, services = ? WHERE id = ?`,
        [name, JSON.stringify(metadata || {}), JSON.stringify(services || {}), req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Клиент обновлен' });
        }
    );
    logAction(req.user.id, 'update_client', 'clients', req.params.id, req.body.name, req);
});

app.delete('/api/clients/:id', requireAuth('user'), (req, res) => {
    db.run('DELETE FROM clients WHERE id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Клиент удален' });
    });
    logAction(req.user.id, 'delete_client', 'clients', req.params.id, null, req);
});

// Обновление сервиса
app.put('/api/services/:id', (req, res) => {
    const { name, description, type, weight, quality, base_price, calculated_price, required_specializations } = req.body;

    if (calculated_price !== undefined && Object.keys(req.body).length === 1) {
        db.run('UPDATE services SET calculated_price = ? WHERE id = ?',
            [calculated_price, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Цена сервиса обновлена' });
        });
    } else {
        db.run(`UPDATE services SET 
                name = ?, description = ?, type = ?, weight = ?, quality = ?, base_price = ?, required_specializations = ?
                WHERE id = ?`,
            [name, description, type, weight || 1, quality || 'Medium', base_price || 0,
             JSON.stringify(required_specializations || []), req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Сервис обновлен' });
            }
        );
    }
});

// Удаление сервиса
app.delete('/api/services/:id', (req, res) => {
    const serviceId = req.params.id;

    db.get('SELECT name FROM services WHERE id = ?', serviceId, (err, service) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!service) return res.status(404).json({ error: 'Сервис не найден' });

        const serviceName = service.name;

        db.all('SELECT * FROM clients', (err, clients) => {
            if (err) return res.status(500).json({ error: err.message });

            const updatePromises = clients.map(client => {
                return new Promise((resolve, reject) => {
                    const clientServices = JSON.parse(client.services || '{}');
                    if (clientServices[serviceName]) {
                        delete clientServices[serviceName];

                        db.run('UPDATE clients SET services = ? WHERE id = ?',
                            [JSON.stringify(clientServices), client.id], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    } else {
                        resolve();
                    }
                });
            });

            Promise.all(updatePromises)
                .then(() => {
                    db.run('DELETE FROM services WHERE id = ?', serviceId, function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ message: 'Сервис удален и очищен из списков клиентов' });
                    });
                })
                .catch(err => res.status(500).json({ error: err.message }));
        });
    });
});

// Обновление сотрудника
app.put('/api/employees/:id', (req, res) => {
    const { name, salary, specializations, hourly_rate, supported_services } = req.body;

    db.run(`UPDATE employees SET 
            name = ?, salary = ?, specializations = ?, hourly_rate = ?, supported_services = ?
            WHERE id = ?`,
        [name, salary, JSON.stringify(specializations || []), hourly_rate,
         JSON.stringify(supported_services || []), req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Сотрудник обновлен' });
        }
    );
});

// Удаление сотрудника
app.delete('/api/employees/:id', (req, res) => {
    db.run('DELETE FROM employees WHERE id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Сотрудник удален' });
    });
});

// Обновление затраты
app.put('/api/expenses/:id', (req, res) => {
    const { name, amount, period, period_type } = req.body;
    const monthly_amount = period_type === 'months' ? amount / period : amount / (period * 12);

    db.run(`UPDATE expenses SET 
            name = ?, amount = ?, period = ?, period_type = ?, monthly_amount = ?
            WHERE id = ?`,
        [name, amount, period, period_type, monthly_amount, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Затрата обновлена' });
        }
    );
});

// Удаление затраты
app.delete('/api/expenses/:id', (req, res) => {
    db.run('DELETE FROM expenses WHERE id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Затрата не найдена' });
        }
        res.json({ message: 'Затрата удалена' });
    });
});

// Финансовые настройки по компаниям
app.get('/api/financial-settings', (req, res) => {
    const companyId = req.query.company_id;

    if (companyId) {
        db.get('SELECT * FROM financial_settings WHERE company_id = ?', companyId, (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(row || { expected_monthly_revenue: 0, profit_margin: 20 });
        });
    } else {
        db.get('SELECT * FROM financial_settings WHERE id = 1', (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(row || { expected_monthly_revenue: 0, profit_margin: 20 });
        });
    }
});

app.put('/api/financial-settings', (req, res) => {
    const { expected_monthly_revenue, profit_margin, company_id } = req.body;

    if (company_id) {
        db.run(`UPDATE financial_settings 
                SET expected_monthly_revenue = ?, profit_margin = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE company_id = ?`,
            [expected_monthly_revenue, profit_margin, company_id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Настройки обновлены' });
        });
    } else {
        db.run(`UPDATE financial_settings 
                SET expected_monthly_revenue = ?, profit_margin = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = 1`,
            [expected_monthly_revenue, profit_margin], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Настройки обновлены' });
        });
    }
});

// Импорт данных из JSON файла
app.post('/api/import-data', (req, res) => {
    const { предприятия } = req.body;

    if (!предприятия || !Array.isArray(предприятия)) {
        return res.status(400).json({ error: 'Неверный формат данных' });
    }

    db.serialize(() => {
        const allServices = new Map();
        предприятия.forEach(enterprise => {
            if (enterprise["SaaS сервисы"]) {
                Object.entries(enterprise["SaaS сервисы"]).forEach(([serviceName, serviceData]) => {
                    if (!allServices.has(serviceName)) {
                        allServices.set(serviceName, {
                            name: serviceName,
                            description: serviceData.Description || '',
                            type: serviceData.Type || 'SaaS',
                            weight: serviceData.Weight || 1,
                            quality: serviceData.Quality || 'Medium',
                            base_price: 0,
                            calculated_price: 0,
                            company_id: 1, // По умолчанию IT Services
                            required_specializations: []
                        });
                    }
                });
            }

            if (enterprise["IaaS сервіси"]) {
                Object.entries(enterprise["IaaS сервіси"]).forEach(([serviceName, serviceData]) => {
                    if (!allServices.has(serviceName)) {
                        allServices.set(serviceName, {
                            name: serviceName,
                            description: serviceData.Description || '',
                            type: serviceData.Type || 'IaaS',
                            weight: serviceData.Weight || 1,
                            quality: serviceData.Quality || 'Medium',
                            base_price: 0,
                            calculated_price: 0,
                            company_id: 1, // По умолчанию IT Services
                            required_specializations: []
                        });
                    }
                });
            }
        });

        const serviceStmt = db.prepare(`INSERT OR REPLACE INTO services 
            (name, description, type, weight, quality, base_price, calculated_price, company_id, required_specializations) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        Array.from(allServices.values()).forEach(service => {
            serviceStmt.run([
                service.name,
                service.description,
                service.type,
                service.weight,
                service.quality,
                service.base_price,
                service.calculated_price,
                service.company_id,
                JSON.stringify(service.required_specializations)
            ]);
        });
        serviceStmt.finalize();

        const clientStmt = db.prepare(`INSERT OR REPLACE INTO clients 
            (name, metadata, services) VALUES (?, ?, ?)`);

        предприятия.forEach(enterprise => {
            const services = {
                ...(enterprise["SaaS сервисы"] || {}),
                ...(enterprise["IaaS сервіси"] || {})
            };

            const metadata = {};
            Object.keys(enterprise).forEach(key => {
                if (key !== 'название_предприятия' &&
                    key !== 'SaaS сервисы' &&
                    key !== 'IaaS сервіси') {
                    metadata[key] = enterprise[key];
                }
            });

            clientStmt.run([
                enterprise.название_предприятия,
                JSON.stringify(metadata),
                JSON.stringify(services)
            ]);
        });
        clientStmt.finalize();

        res.json({
            message: 'Данные успешно импортированы',
            imported: {
                clients: предприятия.length,
                services: allServices.size
            }
        });
    });
});

// Экспорт данных в JSON формат
app.get('/api/export-data', (req, res) => {
    const companyId = req.query.company_id;

    let clientQuery = 'SELECT * FROM clients ORDER BY name';
    let serviceQuery = 'SELECT * FROM services ORDER BY name';

    if (companyId) {
        serviceQuery = 'SELECT * FROM services WHERE company_id = ? ORDER BY name';
    }

    db.all(clientQuery, (err, clients) => {
        if (err) return res.status(500).json({ error: err.message });

        const serviceParams = companyId ? [companyId] : [];
        db.all(serviceQuery, serviceParams, (err, services) => {
            if (err) return res.status(500).json({ error: err.message });

            const exportData = {
                предприятия: clients.map(client => {
                    const clientServices = JSON.parse(client.services || '{}');
                    const metadata = JSON.parse(client.metadata || '{}');
                    const saasServices = {};
                    const iaasServices = {};

                    Object.entries(clientServices).forEach(([serviceName, serviceData]) => {
                        const serviceInfo = services.find(s => s.name === serviceName);
                        const serviceType = serviceInfo?.type || serviceData.Type || 'SaaS';

                        if (serviceType === 'SaaS') {
                            saasServices[serviceName] = serviceData;
                        } else {
                            iaasServices[serviceName] = serviceData;
                        }
                    });

                    return {
                        название_предприятия: client.name,
                        ...metadata,
                        "SaaS сервисы": saasServices,
                        "IaaS сервіси": iaasServices
                    };
                })
            };

            res.json(exportData);
        });
    });
});

// Очистка всех данных
app.delete('/api/clear-all-data', (req, res) => {
    db.serialize(() => {
        db.run('DELETE FROM clients');
        db.run('DELETE FROM services');
        db.run('DELETE FROM employees');
        db.run('DELETE FROM expenses');
        db.run('DELETE FROM client_company_assignments');

        res.json({ message: 'Все данные очищены' });
    });
});

// Статистика данных
app.get('/api/stats', (req, res) => {
    const companyId = req.query.company_id;

    db.serialize(() => {
        let stats = {};

        const clientQuery = companyId ?
            'SELECT COUNT(*) as count FROM clients c JOIN client_company_assignments cca ON c.id = cca.client_id WHERE cca.company_id = ? AND cca.is_active = 1' :
            'SELECT COUNT(*) as count FROM clients';
        const clientParams = companyId ? [companyId] : [];

        db.get(clientQuery, clientParams, (err, result) => {
            stats.clients = result?.count || 0;

            const serviceQuery = companyId ?
                'SELECT COUNT(*) as count FROM services WHERE company_id = ?' :
                'SELECT COUNT(*) as count FROM services';
            const serviceParams = companyId ? [companyId] : [];

            db.get(serviceQuery, serviceParams, (err, result) => {
                stats.services = result?.count || 0;

                const employeeQuery = companyId ?
                    'SELECT COUNT(*) as count FROM employees WHERE company_id = ?' :
                    'SELECT COUNT(*) as count FROM employees';
                const employeeParams = companyId ? [companyId] : [];

                db.get(employeeQuery, employeeParams, (err, result) => {
                    stats.employees = result?.count || 0;

                    const expenseQuery = companyId ?
                        'SELECT COUNT(*) as count FROM expenses WHERE company_id = ?' :
                        'SELECT COUNT(*) as count FROM expenses';
                    const expenseParams = companyId ? [companyId] : [];

                    db.get(expenseQuery, expenseParams, (err, result) => {
                        stats.expenses = result?.count || 0;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Доступ к приложению: http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
    console.log('\nОстановка сервера...');
    db.close((err) => {
        if (err) console.error('Ошибка закрытия БД:', err);
        else console.log('База данных закрыта');
        process.exit(0);
    });
});