const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Public pages stay open; every administrative endpoint uses the same guard.
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.json({ limit: '16kb' }));
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
function equal(a, b) {
    return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),
        crypto.createHash('sha256').update(b).digest());
}
function requireAdmin(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return res.status(503).send('Администрирование не настроено');
    const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(req.headers.authorization || '');
    const decoded = match ? Buffer.from(match[1], 'base64').toString() : '';
    const colon = decoded.indexOf(':');
    if (colon < 0 || !equal(decoded.slice(0, colon), ADMIN_USERNAME) || !equal(decoded.slice(colon + 1), ADMIN_PASSWORD)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Grant Admin", charset="UTF-8"');
        return res.status(401).send('Требуется авторизация');
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
        // Browser writes must carry the exact configured public/admin origin.
        if (!process.env.ADMIN_ORIGIN || req.headers.origin !== process.env.ADMIN_ORIGIN) {
            return res.status(403).send('Недопустимый источник запроса');
        }
    }
    next();
}
app.get(['/', '/index.html', '/start-sales.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin.html', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
// Public booking is handled on Avito; obsolete forms must never pretend success.
app.post('/api/submit-form', (req, res) => res.status(410).json({ success: false, error: 'Используйте объявление на Avito' }));
app.use('/api', requireAdmin);

// Health check; no self-pinging or external keep-alive dependency.
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SEO файлы (явно, чтобы не зависеть от cwd/статики на хостинге)
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, 'robots.txt'));
});

app.get('/favicon.svg', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(__dirname, 'favicon.svg'));
});

// Статические файлы
app.use('/images', express.static(path.join(__dirname, 'images'), { dotfiles: 'deny', index: false }));
for (const file of ['styles.css', 'script.js', 'google72712df90b9e25b7.html', 'yandex_0e2572565aa11afc.html', 'yandex_9a2800b80c3250ef.html']) {
    app.get('/' + file, (req, res) => res.sendFile(path.join(__dirname, file)));
}

// Инициализация базы данных PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : false
});

pool.on('error', () => console.error('Ошибка подключения к PostgreSQL'));
if (process.env.DATABASE_URL) initDatabase();

// Создание таблиц
async function initDatabase() {
    try {
        // Таблица для бронирований
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                booking_type VARCHAR(50),
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                email VARCHAR(255) NOT NULL,
                check_in VARCHAR(50),
                check_out VARCHAR(50),
                bathhouse INTEGER DEFAULT 0,
                message TEXT,
                timestamp VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Таблица bookings готова');

        // Таблица для отзывов
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                timestamp VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Таблица reviews готова');

        // Таблица для инвестиций
        await pool.query(`
            CREATE TABLE IF NOT EXISTS investments (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                timestamp VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Таблица investments готова');
    } catch (err) {
        console.error('❌ Ошибка создания таблиц:', err.message);
    }
}

// API endpoint для получения всех бронирований (для админки)
app.get('/api/bookings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения бронирований:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка получения данных' });
    }
});

// API endpoint для получения всех отзывов
app.get('/api/reviews', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения отзывов:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка получения данных' });
    }
});

// API endpoint для получения всех заявок на инвестиции
app.get('/api/investments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM investments ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения заявок на инвестиции:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка получения данных' });
    }
});

// API endpoint для удаления записи
app.delete('/api/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    let tableName;
    
    if (type === 'bookings') tableName = 'bookings';
    else if (type === 'reviews') tableName = 'reviews';
    else if (type === 'investments') tableName = 'investments';
    else {
        return res.status(400).json({ success: false, error: 'Неизвестный тип' });
    }
    
    try {
        const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Запись не найдена' });
        }
        console.log(`✓ ${type} удален с ID: ${id}`);
        res.json({ success: true, message: 'Запись удалена' });
    } catch (err) {
        console.error(`Ошибка удаления ${type}:`, err.message);
        res.status(500).json({ success: false, error: 'Ошибка удаления данных' });
    }
});

// API endpoint для обновления записи
app.put('/api/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const data = req.body;
    
    try {
        if (type === 'bookings') {
            const result = await pool.query(
                `UPDATE bookings SET 
                    booking_type = $1, name = $2, phone = $3, email = $4, 
                    check_in = $5, check_out = $6, bathhouse = $7, message = $8
                WHERE id = $9`,
                [data.booking_type, data.name, data.phone, data.email, 
                 data.check_in, data.check_out, data.bathhouse ? 1 : 0, data.message || '', id]
            );
            
            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, error: 'Запись не найдена' });
            }
            
            console.log(`✓ Бронирование обновлено с ID: ${id}`);
            res.json({ success: true, message: 'Запись обновлена' });
        } else if (type === 'reviews') {
            const result = await pool.query(
                `UPDATE reviews SET name = $1, email = $2, text = $3 WHERE id = $4`,
                [data.name, data.email, data.text, id]
            );
            
            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, error: 'Запись не найдена' });
            }
            
            console.log(`✓ Отзыв обновлен с ID: ${id}`);
            res.json({ success: true, message: 'Запись обновлена' });
        } else if (type === 'investments') {
            const result = await pool.query(
                `UPDATE investments SET name = $1, phone = $2 WHERE id = $3`,
                [data.name, data.phone, id]
            );
            
            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, error: 'Запись не найдена' });
            }
            
            console.log(`✓ Заявка на инвестиции обновлена с ID: ${id}`);
            res.json({ success: true, message: 'Запись обновлена' });
        } else {
            res.status(400).json({ success: false, error: 'Неизвестный тип' });
        }
    } catch (error) {
        console.error('Ошибка обновления:', error);
        res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
    }
});

// Запуск сервера
const server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`✓ Сервер запущен на http://localhost:${PORT}`);
    console.log(`✓ База данных: PostgreSQL`);
    console.log(`✓ DATABASE_URL: ${process.env.DATABASE_URL ? '✓ установлен' : '✗ НЕ УСТАНОВЛЕН!'}`);
    if (process.env.NODE_ENV === 'production') {
        console.log(`✓ Режим: Production`);
        console.log(`✓ Админка защищена (username: ${ADMIN_USERNAME})`);
    } else {
        console.log(`✓ Режим: Development`);
    }
    console.log('='.repeat(50));
    console.log('\n✓ Ожидание запросов...\n');
});

module.exports = { app, server, pool };

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nЗакрытие соединений...');
    await pool.end();
    console.log('База данных закрыта');
    process.exit(0);
});
