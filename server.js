// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

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
    // Таблица клиентов
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        metadata TEXT,
        services TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица сервисов
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        type TEXT CHECK(type IN ('SaaS', 'IaaS', 'PaaS')),
        weight INTEGER DEFAULT 1,
        quality TEXT CHECK(quality IN ('High', 'Medium', 'Low')),
        base_price REAL DEFAULT 0,
        calculated_price REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица сотрудников
    db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        salary REAL NOT NULL,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица финансовых настроек
    db.run(`CREATE TABLE IF NOT EXISTS financial_settings (
        id INTEGER PRIMARY KEY,
        expected_monthly_revenue REAL DEFAULT 0,
        profit_margin REAL DEFAULT 20,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Вставляем начальные финансовые настройки
    db.run(`INSERT OR IGNORE INTO financial_settings (id, expected_monthly_revenue, profit_margin) 
            VALUES (1, 0, 20)`);
});

// API маршруты

// Клиенты
app.get('/api/clients', (req, res) => {
    db.all('SELECT * FROM clients ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const clients = rows.map(row => ({
            ...row,
            metadata: JSON.parse(row.metadata || '{}'),
            services: JSON.parse(row.services || '{}')
        }));
        
        res.json(clients);
    });
});

app.post('/api/clients', (req, res) => {
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
    
    stmt.finalize();
});

app.put('/api/clients/:id', (req, res) => {
    const { name, metadata, services } = req.body;
    
    db.run(`UPDATE clients SET name = ?, metadata = ?, services = ? WHERE id = ?`, 
        [name, JSON.stringify(metadata || {}), JSON.stringify(services || {}), req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Клиент обновлен' });
        }
    );
});

app.delete('/api/clients/:id', (req, res) => {
    db.run('DELETE FROM clients WHERE id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Клиент удален' });
    });
});

// Сервисы
app.get('/api/services', (req, res) => {
    db.all('SELECT * FROM services ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/services', (req, res) => {
    const { name, description, type, weight, quality, base_price } = req.body;
    
    const stmt = db.prepare(`INSERT INTO services 
        (name, description, type, weight, quality, base_price) 
        VALUES (?, ?, ?, ?, ?, ?)`);
    
    stmt.run([name, description, type, weight || 1, quality || 'Medium', base_price || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Сервис добавлен' });
    });
    
    stmt.finalize();
});

// Обновление сервиса
app.put('/api/services/:id', (req, res) => {
    const { name, description, type, weight, quality, base_price, calculated_price } = req.body;

    // Если передан только calculated_price (из расчета цен)
    if (calculated_price !== undefined && Object.keys(req.body).length === 1) {
        db.run('UPDATE services SET calculated_price = ? WHERE id = ?',
            [calculated_price, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Цена сервиса обновлена' });
        });
    } else {
        // Полное обновление сервиса
        db.run(`UPDATE services SET 
                name = ?, description = ?, type = ?, weight = ?, quality = ?, base_price = ?
                WHERE id = ?`,
            [name, description, type, weight || 1, quality || 'Medium', base_price || 0, req.params.id],
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

    // Сначала получаем имя сервиса для очистки клиентских данных
    db.get('SELECT name FROM services WHERE id = ?', serviceId, (err, service) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!service) return res.status(404).json({ error: 'Сервис не найден' });

        const serviceName = service.name;

        // Удаляем сервис из списков клиентов
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
                    // Удаляем сам сервис
                    db.run('DELETE FROM services WHERE id = ?', serviceId, function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ message: 'Сервис удален и очищен из списков клиентов' });
                    });
                })
                .catch(err => res.status(500).json({ error: err.message }));
        });
    });
});

// Сотрудники
app.get('/api/employees', (req, res) => {
    db.all('SELECT * FROM employees ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const employees = rows.map(row => ({
            ...row,
            supported_services: JSON.parse(row.supported_services || '[]')
        }));

        res.json(employees);
    });
});

app.post('/api/employees', (req, res) => {
    const { name, salary, supported_services } = req.body;

    const stmt = db.prepare(`INSERT INTO employees (name, salary, supported_services) VALUES (?, ?, ?)`);

    stmt.run([name, salary, JSON.stringify(supported_services || [])], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Сотрудник добавлен' });
    });

    stmt.finalize();
});

// Затраты
app.get('/api/expenses', (req, res) => {
    db.all('SELECT * FROM expenses ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/expenses', (req, res) => {
    const { name, amount, period, period_type } = req.body;
    const monthly_amount = period_type === 'months' ? amount / period : amount / (period * 12);

    const stmt = db.prepare(`INSERT INTO expenses (name, amount, period, period_type, monthly_amount) 
                           VALUES (?, ?, ?, ?, ?)`);

    stmt.run([name, amount, period, period_type, monthly_amount], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Затрата добавлена' });
    });

    stmt.finalize();
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

// Финансовые настройки
app.get('/api/financial-settings', (req, res) => {
    db.get('SELECT * FROM financial_settings WHERE id = 1', (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { expected_monthly_revenue: 0, profit_margin: 20 });
    });
});

app.put('/api/financial-settings', (req, res) => {
    const { expected_monthly_revenue, profit_margin } = req.body;
    
    db.run(`UPDATE financial_settings 
            SET expected_monthly_revenue = ?, profit_margin = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = 1`, 
        [expected_monthly_revenue, profit_margin], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Настройки обновлены' });
    });
});

// Импорт данных из JSON файла
app.post('/api/import-data', (req, res) => {
    const { предприятия } = req.body;
    
    if (!предприятия || !Array.isArray(предприятия)) {
        return res.status(400).json({ error: 'Неверный формат данных' });
    }

    db.serialize(() => {
        // Извлекаем все уникальные сервисы
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
                            calculated_price: 0
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
                            calculated_price: 0
                        });
                    }
                });
            }
        });

        // Вставляем сервисы
        const serviceStmt = db.prepare(`INSERT OR REPLACE INTO services 
            (name, description, type, weight, quality, base_price, calculated_price) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`);
        
        Array.from(allServices.values()).forEach(service => {
            serviceStmt.run([
                service.name,
                service.description,
                service.type,
                service.weight,
                service.quality,
                service.base_price,
                service.calculated_price
            ]);
        });
        serviceStmt.finalize();

        // Вставляем клиентов с универсальной структурой
        const clientStmt = db.prepare(`INSERT OR REPLACE INTO clients 
            (name, metadata, services) VALUES (?, ?, ?)`);
        
        предприятия.forEach(enterprise => {
            const services = {
                ...(enterprise["SaaS сервисы"] || {}),
                ...(enterprise["IaaS сервіси"] || {})
            };

            // Создаем объект метаданных со всеми полями, кроме названия и сервисов
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
    db.all('SELECT * FROM clients ORDER BY name', (err, clients) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all('SELECT * FROM services ORDER BY name', (err, services) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Преобразуем данные в исходный формат
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
                        ...metadata, // Все дополнительные поля из метаданных
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
        db.run('DELETE FROM clients', (err) => {
            if (err) console.error('Error clearing clients:', err);
        });
        
        db.run('DELETE FROM services', (err) => {
            if (err) console.error('Error clearing services:', err);
        });
        
        db.run('DELETE FROM employees', (err) => {
            if (err) console.error('Error clearing employees:', err);
        });
        
        db.run('DELETE FROM expenses', (err) => {
            if (err) console.error('Error clearing expenses:', err);
        });
        
        // Сбрасываем финансовые настройки
        db.run('UPDATE financial_settings SET expected_monthly_revenue = 0, profit_margin = 20 WHERE id = 1', (err) => {
            if (err) console.error('Error resetting financial settings:', err);
        });
        
        res.json({ message: 'Все данные очищены' });
    });
});

// Статистика данных
app.get('/api/stats', (req, res) => {
    db.serialize(() => {
        let stats = {};
        
        db.get('SELECT COUNT(*) as count FROM clients', (err, result) => {
            stats.clients = result?.count || 0;
            
            db.get('SELECT COUNT(*) as count FROM services', (err, result) => {
                stats.services = result?.count || 0;
                
                db.get('SELECT COUNT(*) as count FROM employees', (err, result) => {
                    stats.employees = result?.count || 0;
                    
                    db.get('SELECT COUNT(*) as count FROM expenses', (err, result) => {
                        stats.expenses = result?.count || 0;
                        
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// Расчет цен сервисов
app.post('/api/calculate-prices', (req, res) => {
    // Получаем все данные для расчета
    db.all('SELECT * FROM employees', (err, employees) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all('SELECT * FROM expenses', (err, expenses) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.all('SELECT * FROM services', (err, services) => {
                if (err) return res.status(500).json({ error: err.message });
                
                db.all('SELECT * FROM clients', (err, clients) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    db.get('SELECT * FROM financial_settings WHERE id = 1', (err, settings) => {
                        if (err) return res.status(500).json({ error: err.message });
                        
                        // Выполняем расчет
                        const totalEmployeeCosts = employees.reduce((sum, emp) => sum + emp.salary, 0);
                        const totalExpenses = expenses.reduce((sum, exp) => sum + exp.monthly_amount, 0);
                        const totalMonthlyCosts = totalEmployeeCosts + totalExpenses;
                        
                        const totalServiceWeight = services.reduce((sum, service) => {
                            const clientsUsingService = clients.filter(client => {
                                const clientServices = JSON.parse(client.services || '{}');
                                return clientServices[service.name]?.Use === 1;
                            }).length;
                            return sum + (service.weight * clientsUsingService);
                        }, 0);
                        
                        // Обновляем цены сервисов
                        const updatePromises = services.map(service => {
                            return new Promise((resolve, reject) => {
                                const clientsUsingService = clients.filter(client => {
                                    const clientServices = JSON.parse(client.services || '{}');
                                    return clientServices[service.name]?.Use === 1;
                                }).length;
                                
                                const serviceWeight = service.weight * clientsUsingService;
                                const costAllocation = totalMonthlyCosts * (serviceWeight / totalServiceWeight);
                                const priceWithMargin = costAllocation * (1 + (settings?.profit_margin || 20) / 100);
                                const calculatedPrice = isNaN(priceWithMargin) ? 0 : Math.round(priceWithMargin * 100) / 100;
                                
                                db.run('UPDATE services SET calculated_price = ? WHERE id = ?', 
                                    [calculatedPrice, service.id], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            });
                        });
                        
                        Promise.all(updatePromises)
                            .then(() => res.json({ message: 'Цены рассчитаны и обновлены' }))
                            .catch(err => res.status(500).json({ error: err.message }));
                    });
                });
            });
        });
    });
});

// Статическая раздача фронтенда
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Доступ к приложению: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Остановка сервера...');
    db.close((err) => {
        if (err) console.error('Ошибка закрытия БД:', err);
        else console.log('✅ База данных закрыта');
        process.exit(0);
    });
});