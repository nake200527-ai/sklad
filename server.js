// ==========================================
// ЧАСТЬ 1: ИНИЦИАЛИЗАЦИЯ И HTTP-СЕРВЕР
// ==========================================
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = 80; // Работает напрямую без двоеточий в ссылке

// Пути к файлам данных на сервере
const EMPLOYEES_FILE = path.join(__dirname, 'warehouse_employees.json');
const LOGS_FILE = path.join(__dirname, 'tsd_logs.json');
const ARCHIVE_FILE = path.join(__dirname, 'tsd_archive.json');

// Учетки
const WAREHOUSE_USERS = [
    { login: "Тигран", displayName: "Тигран", pass: "NaKe2005272@" },
    { login: "Реймхе", displayName: "Реймхе Н.С.", pass: "120600"},
    { login: "Мазанова", displayName: "Мазанова К.В.", pass: "14021990"},
    { login: "Киселев", displayName: "Киселев А.А.", pass: "2535" },
    { login: "Минаев", displayName: "Минаев Д.М.", pass: "2536" },
    { login: "Туктагулова", displayName: "Туктагулова И.М.", pass: "2537" },
    { login: "Филатов", displayName: "Филатов П.В.", pass: "35508666" },
    { login: "Гринцов", displayName: "Гринцов А.О.", pass: "89934484" },
    { login: "Титов", displayName: "Титов Н.М.", pass: "1537" },
    { login: "Александров", displayName: "Александров Е.В.", pass: "3535" },
    { login: "Алексеева", displayName: "Алексеева А.А.", pass: "3536" },
    { login: "Затевальнева", displayName: "Затевальнева Э.И.", pass: "3537" },
    { login: "Дьяконов", displayName: "Дьяконов А.В.", pass: "4535" },
    { login: "Балинский", displayName: "Балинский М.А.", pass: "4536" },
    { login: "Лаптев",displayName: "Лаптев Т.А.", pass: "4537"}
];


// Инициализация базы данных при первом старте
if (!fs.existsSync(EMPLOYEES_FILE)) fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify([]));
if (!fs.existsSync(LOGS_FILE)) fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
if (!fs.existsSync(ARCHIVE_FILE)) fs.writeFileSync(ARCHIVE_FILE, JSON.stringify([]));

const readData = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) {
        console.error(`🚨 КРИТИЧЕСКАЯ ОШИБКА: Файл ${filePath} поврежден!`, e);
        return []; // Возвращаем пустой массив вместо падения сервера
    }
};

const writeData = (filePath, data) => {
    // fs.writeFile делает запись в фоновом режиме, вообще не нагружая процессор и не тормозя сервер
    fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) {
            console.error(`🚨 Ошибка при фоновом сохранении файла ${filePath}:`, err);
        }
    });
};


const clients = new Set();

function broadcast(data) {
    const message = JSON.stringify(data);
    for (const client of clients) {
        sendWSMessage(client, message);
    }
}

// Создание HTTP сервера (Прямая раздача HTML, CSS, JS и картинок)
const server = http.createServer((req, res) => {
    // НА СЕРВЕРЕ: Исправление обработки картинок
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const ext = path.extname(filePath).toLowerCase(); // ДОБАВИТЬ .toLowerCase()

    let contentType = 'text/html';
    let isBinary = false;

    if (ext === '.js') contentType = 'text/javascript';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.png') {
    contentType = 'image/png';
    isBinary = true;
}
// Добавим поддержку jpg/jpeg на будущее, если логотип поменяется
if (ext === '.jpg' || ext === '.jpeg') {
    contentType = 'image/jpeg';
    isBinary = true;
}

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            const headers = { 'Content-Type': contentType };
            if (!isBinary) {
                headers['Content-Type'] += '; charset=utf-8';
            }
            res.writeHead(200, headers);
            res.end(content);
        }
    });
});
// ==========================================
// ЧАСТЬ 2: РУКОПОЖАТИЕ И СЕТЕВОЙ БУФЕР WEBSOCKET
// ==========================================
server.on('upgrade', (req, socket, head) => {
    if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
        const key = req.headers['sec-websocket-key'];
        const hash = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + hash + '\r\n\r\n'
        );

        clients.add(socket);
                const initPayload = {
            type: 'INIT',
            employees: readData(EMPLOYEES_FILE),
            logs: readData(LOGS_FILE),
            archive: readData(ARCHIVE_FILE)
            
        };
        sendWSMessage(socket, JSON.stringify(initPayload));

        let buffer = Buffer.alloc(0);
        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (true) {
                if (buffer.length < 2) break;
                const secondByte = buffer[1];
                const hasMask = (secondByte & 0x80) !== 0;
                let payloadLength = secondByte & 0x7F;
                let dataOffset = 2;

                if (payloadLength === 126) {
                    if (buffer.length < 4) break;
                    payloadLength = buffer.readUInt16BE(2);
                    dataOffset = 4;
                } else if (payloadLength === 127) {
                    if (buffer.length < 10) break;
                    payloadLength = Number(buffer.readBigUInt64BE(2));
                    dataOffset = 10;
                }

                if (hasMask) {
                    if (buffer.length < dataOffset + 4) break;
                    dataOffset += 4;
                }

                if (buffer.length < dataOffset + payloadLength) break;

                const rawData = buffer.subarray(dataOffset - (hasMask ? 4 : 0), dataOffset + payloadLength);
                let payload = rawData.subarray(hasMask ? 4 : 0);

                if (hasMask) {
                    const mask = rawData.subarray(0, 4);
                    const unmasked = Buffer.alloc(payload.length);
                    for (let i = 0; i < payload.length; i++) {
                        unmasked[i] = payload[i] ^ mask[i % 4];
                    }
                    payload = unmasked;
                }

                buffer = buffer.subarray(dataOffset + payloadLength);

                try {
                    handleWSMessage(socket, JSON.parse(payload.toString('utf8')));
                } catch (e) {
                    console.error('Ошибка парсинга JSON:', e);
                }
            }
        });

                // Железобетонное удаление из онлайна при любом закрытии сокета
        socket.on('close', () => {
            clients.delete(socket); // Удаляем сокет из списка подключений
            socket.operatorName = null; // Стираем имя оператора
            broadcastOnlineUsers(); // Рассылаем всем обновленный, чистый список
        });

    }
});
// ==========================================
// ЧАСТЬ 3: БИЗНЕС-ЛОГИКА И ЗАЩИТА ОТ ОШИБОК
// ==========================================
function broadcastOnlineUsers() {
    // Собираем имена всех клиентов, у которых isAuthenticated равен true
    const onlineNames = [...clients]
        .map(c => c.operatorName)
        .filter(Boolean);
        
    // Оставляем только уникальные имена (если один зашел с ПК и телефона)
    const uniqueUsers = [...new Set(onlineNames)];
    
    // Рассылаем этот список абсолютно ВСЕМ подключенным пользователям
    broadcast({ type: 'UPDATE_ONLINE', users: uniqueUsers });
}
function handleWSMessage(ws, request) {
    switch (request.action) {
                case 'LOGIN': {
            const { login, pass } = request.data;
            const admin = WAREHOUSE_USERS.find(a => a.login.toLowerCase() === login.toLowerCase() && a.pass === pass);
            
            if (!admin) {
                sendWSMessage(ws, JSON.stringify({ type: 'ERROR', target: 'authMessage', text: 'Неверный логин или пароль!' }));
                return;
            }
            
            // 🚨 ВАЖНО: Привязываем флаг авторизации и ПОЛНОЕ имя к текущему соединению
            ws.isAuthenticated = true;
            ws.operatorName = admin.displayName;
            
            sendWSMessage(ws, JSON.stringify({ type: 'LOGIN_SUCCESS', displayName: admin.displayName }));
            
            // Рассылаем всем обновленный список людей в сети
            broadcastOnlineUsers();
            break;
        }
        case 'RESTORE_ONLINE': {
            const { displayName } = request.data;
            
            // Привязываем имя к новому сокету после перезагрузки страницы пользователем
            ws.isAuthenticated = true;
            ws.operatorName = displayName;
            
            // Рассылаем всем актуальный список онлайн
            broadcastOnlineUsers();
            break;
        }

        case 'ADD_EMPLOYEE': {
            let emps = readData(EMPLOYEES_FILE);
            if (emps.some(e => e.phone === request.data.phone)) {
                sendWSMessage(ws, JSON.stringify({ type: 'ERROR', target: 'empFormMessage', text: 'Этот номер телефона уже внесен в базу!' }));
                return;
            }
            emps.push(request.data);
            writeData(EMPLOYEES_FILE, emps);
            broadcast({ type: 'UPDATE_EMPLOYEES', data: emps });
            sendWSMessage(ws, JSON.stringify({ type: 'SUCCESS', target: 'empFormMessage', text: 'Сотрудник внесен на сервер!' }));
            break;
        }
        case 'DELETE_EMPLOYEE': {
            let emps = readData(EMPLOYEES_FILE).filter(e => e.phone !== request.phone);
            writeData(EMPLOYEES_FILE, emps);
            broadcast({ type: 'UPDATE_EMPLOYEES', data: emps });
            break;
        }
                case 'ISSUE_TSD': { // Безопасная выдача ТСД на сервере
            const { shift, phone, tsdNumber, operator } = request.data;
            let currentLogs = readData(LOGS_FILE);
            
            // 1. Проверяем, не занят ли ТСД прямо сейчас в базе сервера
            const busyLog = currentLogs.find(l => l.tsdNumber === tsdNumber && !l.timeReturned);
            if (busyLog) {
                const emps = readData(EMPLOYEES_FILE);
                const holder = emps.find(e => e.phone === busyLog.phone) || { name: "другого сотрудника" };
                sendWSMessage(ws, JSON.stringify({ 
                    type: 'ERROR', target: 'scanMessage', text: `🚨 Ошибка: ТСД №${tsdNumber} уже выдан! Он у: ${holder.name}` 
                }));
                return;
            }

            // 2. Проверяем, нет ли у этого сотрудника уже другого ТСД на руках
            const empHasTsd = currentLogs.some(l => l.phone === phone && !l.timeReturned);
            if (empHasTsd) {
                sendWSMessage(ws, JSON.stringify({ 
                    type: 'ERROR', target: 'scanMessage', text: `🚨 Ошибка: За этим сотрудником уже числится другой ТСД!` 
                }));
                return;
            }

            // 3. Сервер САМ создает новую запись и добавляет её в начало файла
            const newLogEntry = {
                id: Date.now(),
                shift,
                phone,
                tsdNumber,
                timeIssued: new Date().toISOString(),
                timeReturned: null,
                operator: operator || "Система"
            };

            currentLogs.unshift(newLogEntry);
            writeData(LOGS_FILE, currentLogs);
            
            // Рассылаем обновленный массив ВСЕМ операторам в реальном времени
            broadcast({ type: 'UPDATE_LOGS', data: currentLogs });
            sendWSMessage(ws, JSON.stringify({ type: 'SUCCESS', target: 'scanMessage', text: '🟢 ТСД успешно выдан!' }));
            break;
        }

        case 'RETURN_TSD': { // Безопасная сдача ТСД на сервере
            const { phone, tsdNumber } = request.data;
            let currentLogs = readData(LOGS_FILE);

            // Ищем активную выдачу на сервере
            const activeLog = currentLogs.find(l => l.phone === phone && !l.timeReturned);
            
            if (!activeLog) {
                sendWSMessage(ws, JSON.stringify({ type: 'ERROR', target: 'scanMessage', text: `Ошибка: У сотрудника нет активных выдач ТСД!` }));
                return;
            }
            if (activeLog.tsdNumber !== tsdNumber) {
                sendWSMessage(ws, JSON.stringify({ type: 'ERROR', target: 'scanMessage', text: `🚨 ОШИБКА: Числится ТСД №${activeLog.tsdNumber}, а сканируете №${tsdNumber}!` }));
                return;
            }

            // Проставляем время сдачи прямо в серверном файле
            activeLog.timeReturned = new Date().toISOString();
            writeData(LOGS_FILE, currentLogs);
            
            // Рассылаем обновленный массив ВСЕМ операторам в реальном времени
            broadcast({ type: 'UPDATE_LOGS', data: currentLogs });
            sendWSMessage(ws, JSON.stringify({ type: 'SUCCESS', target: 'scanMessage', text: '🟢 ТСД успешно сдан!' }));
            break;
        }

                    case 'ARCHIVE_DAY': {
            // Читаем текущие логи и архив прямо с диска сервера
            let currentLogs = readData(LOGS_FILE);
            let currentArchive = readData(ARCHIVE_FILE);

            if (currentLogs.length === 0) {
                sendWSMessage(ws, JSON.stringify({ type: 'ERROR', target: 'scanMessage', text: '🚨 Журнал уже пуст!' }));
                return;
            }

            // Автоматически берем имя оператора, который нажал кнопку
            const senderName = request.operator || "Система";

            // Генерируем дату архива
            const archiveDate = new Date().toLocaleDateString('ru-RU');
            const sheetName = `Архив_${archiveDate}`;

            // Переносим записи текущей смены в архив
            currentLogs.forEach(log => {
                log.archiveSheetName = sheetName;
                currentArchive.push(log);
            });

            // Перезаписываем файлы на сервере (очищаем день, пополняем архив)
            writeData(LOGS_FILE, []);
            writeData(ARCHIVE_FILE, currentArchive);

            // Даем команду ВСЕМ открытым вкладкам операторов мгновенно очистить рабочие экраны
            broadcast({ 
                type: 'ARCHIVE_COMPLETE', 
                logs: [], 
                archive: currentArchive 
            });
            break;
        }


        case 'CLEAR_ALL': {
            writeData(EMPLOYEES_FILE, []);
            writeData(LOGS_FILE, []);
            writeData(ARCHIVE_FILE, []);
            broadcast({ type: 'INIT', employees: [], logs: [], archive: [] });
            break;
        }
                case 'LOGOUT': {
            ws.isAuthenticated = false;
            ws.operatorName = null; // Обнуляем имя на сервере
            broadcastOnlineUsers(); // Сразу пересчитываем онлайн для всех
            break;
        }

    }
}

function sendWSMessage(socket, text) {
    if (socket.destroyed) return;
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;

    if (len <= 125) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = len;
    } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, payload]));
}

server.listen(PORT, () => {
    console.log(`Сервер успешно перезапущен на порту ${PORT}`);
});