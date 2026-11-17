// Логи и Архивы
let serverEmployees = [];
let serverLogs = [];
let serverArchive = [];

let currentAdmin = localStorage.getItem('currentAdmin') || null;

// Подключение к WebSocket серверу
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const socket = new WebSocket(`${protocol}${window.location.host}`);

socket.onmessage = (event) => {
    const response = JSON.parse(event.data);

    switch (response.type) {
        case 'INIT':
            serverEmployees = response.employees;
            serverLogs = response.logs;
            serverArchive = response.archive;
            renderUchetTable();
            renderEmployeesTable();
            updateArchiveDropdown();  
            
            // 🚨 НАШЕ ИСПРАВЛЕНИЕ: Если оператор уже был авторизован, 
            // сразу сообщаем серверу его имя после переподключения сокета!
            if (currentAdmin) {
                socket.send(JSON.stringify({
                    action: 'RESTORE_ONLINE',
                    data: { displayName: currentAdmin }
                }));
            }
            break;
        case 'UPDATE_EMPLOYEES':
            serverEmployees = response.data;
            renderEmployeesTable();
            renderUchetTable(); 
            break;
        case 'UPDATE_LOGS':
            // Сервер прислал актуальный массив логов. 
            // Жестко записываем его в память фронтенда
            serverLogs = response.data;
            
            // Сразу же принудительно перерисовываем таблицу и счетчики на экране
            renderUchetTable();
            break;

        case 'ARCHIVE_COMPLETE':
            serverLogs = response.logs;
            serverArchive = response.archive;
            renderUchetTable();
            updateArchiveDropdown();
            break;
        case 'ERROR':
            showMessage(response.target, response.text, 'error');
            break;
        case 'SUCCESS':
            showMessage(response.target, response.text, 'success');
            break;
        case 'LOGIN_SUCCESS':
            // Сервер подтвердил пароль, сохраняем имя и открываем сайт
            currentAdmin = response.displayName;
            localStorage.setItem('currentAdmin', currentAdmin);
            checkAuthStatus();
            break;
        case 'UPDATE_ONLINE':
            const onlineBlock = document.getElementById('onlineOperatorsBlock');
            const onlineList = document.getElementById('onlineOperatorsList');
            
            if (onlineBlock && onlineList) {
                if (response.users && response.users.length > 0) {
                    onlineBlock.style.display = 'block'; // Показываем плашку
                    
                    // Выводим имена через запятую. Красиво подсвечиваем
                    onlineList.innerHTML = response.users.map(user => {
                        return `<span style="background: #27ae60; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-right: 4px;">ON</span><b>${user}</b>`;
                    }).join(', ');
                } else {
                    onlineBlock.style.display = 'none'; // Прячем, если пусто
                }
            }
            break;
       
    }
};
window.onload = () => {
    checkAuthStatus();
    initScanFocus();

    // enter когда авторизируешься
    const authPassInput = document.getElementById('authPass');
    if (authPassInput) {
        authPassInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin(); 
            }
        };
    }
        // Восстановление выбранной смены из памяти после перезагрузки
    const savedShift = localStorage.getItem('selectedShift');
    const shiftSelect = document.getElementById('shiftSelect');
    if (savedShift && shiftSelect) {
        shiftSelect.value = savedShift;
    }
        // Восстановление режима сканера (Выдача/Сдача) после перезагрузки
    const savedMode = localStorage.getItem('selectedMode');
    if (savedMode) {
        const modeInput = document.querySelector(`input[name="scanMode"][value="${savedMode}"]`);
        if (modeInput) {
            modeInput.checked = true;
        }
    }

};
function checkAuthStatus() {
    const authOverlay = document.getElementById('authOverlay');
    const mainInterface = document.getElementById('mainInterface');
    
    if (currentAdmin) {
        if(authOverlay) authOverlay.style.display = 'none';
        if(mainInterface) mainInterface.style.display = 'block';
        
        const opName = document.getElementById('currentOperatorName');
        if (opName) {
            // Обычная текстовая проверка имени для вывода бейджа
            let roleBadge = '';
            if (currentAdmin === "Тигран") {
                roleBadge = `<span style="background: #e74c3c; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 6px;">👑 Создатель</span>`;
            } else if (currentAdmin === "Реймхе Н.С.") {
                roleBadge = `<span style="background: #e67e22; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 6px;">🛠️ Админ</span>`;
            } else if (currentAdmin === "Мазанова К.В."){
                roleBadge = `<span style="background: #e67e22; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 6px;">🛠️ Админ</span>`;
            } else {
                roleBadge = `<span style="background: #3498db; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 6px;">👤 Оператор</span>`;
            }
            
            // Записываем бейдж и имя в шапку
            opName.innerHTML = `${roleBadge} <b style="color: #fff;">${currentAdmin}</b>`;
        }
        

        renderUchetTable();
        renderEmployeesTable();
    } else {
        if(authOverlay) authOverlay.style.display = 'flex';
        if(mainInterface) mainInterface.style.display = 'none';
        const regCard = document.getElementById('regFormCard');
        if(regCard) regCard.style.display = 'none';
        const loginCard = document.getElementById('loginFormCard');
        if(loginCard) loginCard.style.display = 'block';
    }
}
function handleLogin() {
    const login = document.getElementById('authLogin').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    
    if (!login || !pass) {
        showMessage('authMessage', 'Заполните все поля!', 'error');
        return;
    }

    // Отправляем логин и пароль на проверку серверу по сокету
    socket.send(JSON.stringify({ 
        action: 'LOGIN', 
        data: { login, pass } 
    }));
}
function handleLogout() {
    // Сообщаем серверу, что мы выходим из учетки
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'LOGOUT' }));
    }

    currentAdmin = null;
    localStorage.removeItem('currentAdmin');
    document.getElementById('authLogin').value = '';
    document.getElementById('authPass').value = '';
    checkAuthStatus();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    const targetBtn = document.getElementById('btn-' + tabId);
    if (targetBtn) targetBtn.classList.add('active');
    
    document.getElementById('debtorsBlock').style.display = 'none';
    
    if (tabId === 'tab-uchet') {
        initScanFocus();
        renderUchetTable();
    } else if (tabId === 'tab-employees') {
        renderEmployeesTable();
    } else if (tabId === 'tab-archive') {
        updateArchiveDropdown();
    }
}
function toggleAuthCard(showReg) {
    return false;
}
function toggleEmpTypeFields() {
    const type = document.getElementById('empType').value;
    const stateFields = document.querySelectorAll('.state-field');
    const outsourceFields = document.querySelectorAll('.outsource-field');

    if (type === 'Штат') {
        stateFields.forEach(el => el.style.display = 'block');
        outsourceFields.forEach(el => el.style.display = 'none');
    } else {
        stateFields.forEach(el => el.style.display = 'none');
        outsourceFields.forEach(el => el.style.display = 'block');
    }
}
function addEmployee(e) {
    e.preventDefault();
    const phone = document.getElementById('empPhone').value.trim();
    const name = document.getElementById('empName').value.trim();
    const type = document.getElementById('empType').value;
    const vest = document.getElementById('empVest').value.trim();
    
    let infoField = '';
    
    if (type === 'Штат') {
        const role = document.getElementById('empRole').value;
        const staffShift = document.getElementById('empStaffShift').value;
        // Для штата пишем должность и его фиксированную смену
        infoField = `${role} (${staffShift})`;
    } else {
        // Для аутсорса пишем название компании
        infoField = document.getElementById('empCompany').value.trim() || 'Аутсорс';
    }

    socket.send(JSON.stringify({ action: 'ADD_EMPLOYEE', data: { phone, name, type, infoField, vest } }));
    document.getElementById('empForm').reset();
    toggleEmpTypeFields();
}
function deleteEmployee(phone) {
    if (confirm('Удалить сотрудника из базы данных?')) {
        socket.send(JSON.stringify({ action: 'DELETE_EMPLOYEE', phone }));
    }
}

function renderEmployeesTable() {
    const tbodyStaff = document.querySelector('#empTableStaff tbody');
    const tbodyOutsource = document.querySelector('#empTableOutsource tbody');
    const filterStaffShift = document.getElementById('filterStaffShift');
    const filterOutsourceCompany = document.getElementById('filterOutsourceCompany');
    
    // Новые элементы поиска
    const searchStaffInput = document.getElementById('searchStaff');
    const searchOutsourceInput = document.getElementById('searchOutsource');
    
    if (!tbodyStaff || !tbodyOutsource || !filterStaffShift || !filterOutsourceCompany || !searchStaffInput || !searchOutsourceInput) return;
    
    const currentSelectedCompany = filterOutsourceCompany.value;
    filterOutsourceCompany.innerHTML = '<option value="all">Все компании</option>';
    
    const companies = [...new Set(serverEmployees.filter(e => e.type === 'Аутсорс').map(e => e.infoField))].filter(Boolean);
    companies.sort().forEach(comp => {
        const opt = document.createElement('option');
        opt.value = comp;
        opt.innerText = comp;
        filterOutsourceCompany.appendChild(opt);
    });

    if (companies.includes(currentSelectedCompany)) {
        filterOutsourceCompany.value = currentSelectedCompany;
    } else {
        filterOutsourceCompany.value = 'all';
    }

    tbodyStaff.innerHTML = '';
    tbodyOutsource.innerHTML = '';
    
    const selectedShift = filterStaffShift.value;
    const selectedCompany = filterOutsourceCompany.value;
    
    // Приводим поисковые запросы к нижнему регистру для живого поиска
    const queryStaff = searchStaffInput.value.toLowerCase();
    const queryOutsource = searchOutsourceInput.value.toLowerCase();
    
    serverEmployees.forEach(emp => {
        const tr = document.createElement('tr');
        
        // Формируем сплошную строку с данными сотрудника для поиска по ней
        const empRawText = `${emp.phone} ${emp.name} ${emp.infoField} ${emp.vest}`.toLowerCase();
        
        if (emp.type === 'Штат') {
            // Проверяем фильтр смены И совпадение по тексту поиска
            const matchesShift = (selectedShift === 'all' || emp.infoField.includes(selectedShift));
            const matchesSearch = empRawText.includes(queryStaff);
            
            if (matchesShift && matchesSearch) {
                tr.innerHTML = `
                    <td>${emp.phone}</td>
                    <td><b>${emp.name}</b></td>
                    <td>${emp.infoField}</td>
                    <td><b>№${emp.vest}</b></td>
                    <td><button class="delete-btn" onclick="deleteEmployee('${emp.phone}')">❌</button></td>
                `;
                tbodyStaff.appendChild(tr);
            }
        } else {
            // Проверяем фильтр компании И совпадение по тексту поиска
            const matchesCompany = (selectedCompany === 'all' || emp.infoField === selectedCompany);
            const matchesSearch = empRawText.includes(queryOutsource);
            
            if (matchesCompany && matchesSearch) {
                tr.innerHTML = `
                    <td>${emp.phone}</td>
                    <td><b>${emp.name}</b></td>
                    <td>${emp.infoField}</td>
                    <td><b>№${emp.vest}</b></td>
                    <td><button class="delete-btn" onclick="deleteEmployee('${emp.phone}')">❌</button></td>
                `;
                tbodyOutsource.appendChild(tr);
            }
        }
    });
}
function initScanFocus() {
    const loginInput = document.getElementById('scanLogin');
    const tsdInput = document.getElementById('scanTsd');
    
    if(!loginInput || !tsdInput) return;
    
    // Принудительно возвращаем фокус на первое поле при клике по экрану
    loginInput.focus();
    
    // Блокируем отправку встроенной формы по нажатию Enter в полях
    loginInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Запрещаем перезагрузку страницы браузером
            if (loginInput.value.trim() !== '') {
                tsdInput.focus();
            }
        }
    };

    tsdInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Запрещаем перезагрузку страницы браузером
            if (tsdInput.value.trim() !== '' && loginInput.value.trim() !== '') {
                processScan();
            }
        }
    };
}
function processScan() {
    const login = document.getElementById('scanLogin').value.trim();
    const tsd = document.getElementById('scanTsd').value.trim();
    const mode = document.querySelector('input[name="scanMode"]:checked').value;
    const currentShift = document.getElementById('shiftSelect').value;
    
    if (!login || !tsd) return;

    // Быстрая локальная проверка, есть ли вообще такой сотрудник в базе
    const emp = serverEmployees.find(e => e.phone === login);
    if (!emp) {
        showMessage('scanMessage', 'Ошибка: Внесите сотрудника в "Базу Сотрудников"!', 'error');
        resetScanFields();
        return;
    }

    if (mode === 'issue') {
        // Отправляем команду НА ВЫДАЧУ
        socket.send(JSON.stringify({
            action: 'ISSUE_TSD',
            data: {
                shift: currentShift,
                phone: login,
                tsdNumber: tsd,
                operator: currentAdmin || "Система"
            }
        }));
    } else {
        // Отправляем команду НА СДАЧУ
        socket.send(JSON.stringify({
            action: 'RETURN_TSD',
            data: {
                phone: login,
                tsdNumber: tsd
            }
        }));
    }
    resetScanFields();
}
function resetScanFields() {
    document.getElementById('scanLogin').value = '';
    document.getElementById('scanTsd').value = '';
    document.getElementById('scanLogin').focus();
}
function renderUchetTable() {
    const tbody = document.querySelector('#uchetTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    serverLogs.forEach(log => {
        const emp = serverEmployees.find(e => e.phone === log.phone) || { name: 'Удален из базы', type: '-', infoField: '-', vest: '-' };
        const tr = document.createElement('tr');
        
        let typeBadge = '-';
        if(emp.type !== '-') {
            const badgeColor = emp.type === 'Штат' ? 'type-sbl' : 'type-outsource';
            typeBadge = `<span class="type-badge ${badgeColor}">${emp.type}</span>`;
        }
        
        const statusBadge = log.timeReturned 
            ? '<span class="status-badge status-returned">Сдан</span>' 
            : '<span class="status-badge status-issued">Выдан</span>';
        
        tr.innerHTML = `
            <td><span class="shift-badge">${log.shift}</span></td>
            <td>${log.phone}</td>
            <td><b>№ ${log.tsdNumber}</b></td>
            <td><b>${emp.name}</b></td>
            <td>${typeBadge}</td>
            <td>${emp.infoField}</td>
            <td>Жилет №${emp.vest}</td>
            <td>${formatDateTime(log.timeIssued)}</td>
            <td style="font-weight: 500;">${log.timeReturned ? formatDateTime(log.timeReturned) : '<span style="color:red">В работе</span>'}</td>
            <td class="status-cell">${statusBadge}</td>
            <td><i>${log.operator || 'Не указан'}</i></td>
        `;
        tbody.appendChild(tr);
    });
    filterTable();
    // --- АВТОМАТИЧЕСКИЙ ПЕРЕСЧЕТ СЧЕТЧИКОВ ТСД ---
    let totalInWork = 0;
    let staffInWork = 0;
    let outsourceInWork = 0;

    serverLogs.forEach(log => {
        // Считаем только те ТСД, которые еще не сданы (в работе)
        if (!log.timeReturned) {
            totalInWork++;
            
            // Проверяем тип сотрудника по его номеру телефона в базе данных
            const emp = serverEmployees.find(e => e.phone === log.phone);
            if (emp) {
                if (emp.type === 'Штат') {
                    staffInWork++;
                } else if (emp.type === 'Аутсорс') {
                    outsourceInWork++;
                }
            }
        }
    });

    // Выводим получившиеся цифры в HTML-индикаторы
    const elTotal = document.getElementById('countTotal');
    const elStaff = document.getElementById('countStaff');
    const elOutsource = document.getElementById('countOutsource');

    if (elTotal) elTotal.innerText = totalInWork;
    if (elStaff) elStaff.innerText = staffInWork;
    if (elOutsource) elOutsource.innerText = outsourceInWork;
        // Проверка: если в работе осталось 0 ТСД, а в журнале вообще ЕСТЬ записи — показываем напоминание начальнику
    const reminderBlock = document.getElementById('archiveReminderBlock');
    if (reminderBlock) {
        if (totalInWork === 0 && serverLogs.length > 0) {
            reminderBlock.style.display = 'block'; // Показываем жирную плашку
        } else {
            reminderBlock.style.display = 'none';  // Прячем, если кто-то еще работает
        }
    }

}
function filterTable() {
    const searchInput = document.getElementById('filterSearch');
    const statusSelect = document.getElementById('filterStatus');
    if (!searchInput || !statusSelect) return;

    const searchText = searchInput.value.toLowerCase();
    const statusFilter = statusSelect.value;
    const rows = document.querySelectorAll('#uchetTable tbody tr');

    rows.forEach(row => {
        const cells = row.getElementsByTagName('td');
        if (cells.length === 0) return;
        
        const rowText = row.innerText.toLowerCase();
        const statusCell = row.querySelector('.status-cell');
        const statusCellText = statusCell ? statusCell.innerText.trim() : '';
        
        let matchesSearch = rowText.includes(searchText);
        let matchesStatus = true;
        
        if (statusFilter === 'Выдан') matchesStatus = (statusCellText === 'Выдан');
        if (statusFilter === 'Сдан') matchesStatus = (statusCellText === 'Сдан');
        
        row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
}
function checkDebtors() {
    const selectedShift = document.getElementById('shiftSelect').value;
    const activeDebtors = serverLogs.filter(l => l.shift === selectedShift && !l.timeReturned);
    const block = document.getElementById('debtorsBlock');
    if (!block) return;
    
    if (activeDebtors.length === 0) {
        block.style.display = 'block';
        block.style.backgroundColor = '#e8f8f0';
        block.style.borderColor = '#2ecc71';
        block.innerHTML = `<h3 style="color: #27ae60;">🎉 Отлично! Все сотрудники смены "${selectedShift}" сдали ТСД!</h3>`;
        playSound('success');
    } else {
        block.style.display = 'block';
        block.style.backgroundColor = '#fdf2e9';
        block.style.borderColor = '#e67e22';
        block.innerHTML = `<h3>⚠️ Не сдали ТСД в смене "${selectedShift}" (${activeDebtors.length} чел.):</h3><ul id="debtorsList"></ul>`;
        
        const list = document.getElementById('debtorsList');
        if (list) {
            list.innerHTML = '';
            activeDebtors.forEach(log => {
                const emp = serverEmployees.find(e => e.phone === log.phone) || { name: 'Неизвестный', infoField: '-', vest: '-' };
                const li = document.createElement('li');
                li.innerHTML = `📱 <b>${log.phone}</b> | 👤 <b>${emp.name}</b> (${emp.infoField}) | Жилет: №${emp.vest} → <b>ТСД №${log.tsdNumber}</b>`;
                list.appendChild(li);
            });
        }
        playSound('error');
    }
}
function archiveCurrentDay() {
    if (serverLogs.length === 0) { 
        alert('Журнал пуст!'); 
        return; 
    }
    
    // Жесткая проверка: если кто-то не сдал ТСД, прерываем
    if (serverLogs.some(l => !l.timeReturned)) {
        alert('⛔ Ошибка: На складе есть не сданные ТСД! Архивировать нельзя.');
        checkDebtors(); // Подсвечиваем должников
        return;
    }
    
    if (confirm('Перенести текущие записи в архив? Рабочий экран очистится.')) {
        // Отправляем серверу только имя того, кто жмет кнопку
        socket.send(JSON.stringify({ 
            action: 'ARCHIVE_DAY', 
            operator: currentAdmin 
        }));
        
        const debtorsBlk = document.getElementById('debtorsBlock');
        if (debtorsBlk) debtorsBlk.style.display = 'none';
    }
}

function exportToExcel() {
    if(serverLogs.length === 0) { alert('Таблица пуста.'); return; }
    
    let csvContent = "\uFEFF"; 
    csvContent += "Смена;Логин;Номер ТСД;ФИО;Тип;Компания / Должность;Номер Жилета;Время Выдачи;Время Сдачи;Статус;Оператор\n";
    
    serverLogs.forEach(log => {
        const emp = serverEmployees.find(e => e.phone === log.phone) || { name: 'Удален', type: '-', infoField: '-', vest: '-' };
        const status = log.timeReturned ? "Сдан" : "В работе";
        const returnTime = log.timeReturned ? formatDateTime(log.timeReturned) : "-";
        
        csvContent += `${log.shift};${log.phone};${log.tsdNumber};${emp.name};${emp.type};${emp.infoField};${emp.vest};${formatDateTime(log.timeIssued)};${returnTime};${status};${log.operator || 'Не указан'}\n`;
    });
    
    downloadCSV(csvContent, `Otchet_TSD_${new Date().toLocaleDateString('ru-RU')}.csv`);
}
function updateArchiveDropdown() {
    const select = document.getElementById('archiveDaySelect');
    if (!select) return;
    
    // 1. Запоминаем, какой архив был открыт у пользователя прямо сейчас
    const previouslySelected = select.value;
    
    select.innerHTML = '<option value="">Выберите день архива...</option>';
    
    const uniqueDays = [...new Set(serverArchive.map(log => log.archiveSheetName))].filter(Boolean);
    
    uniqueDays.forEach(day => {
        const opt = document.createElement('option');
        opt.value = day;
        opt.innerText = day;
        select.appendChild(opt);
    });
    
    // 2. Если этот день всё ещё есть в базе, возвращаем его на место
    if (uniqueDays.includes(previouslySelected)) {
        select.value = previouslySelected;
    }
    
    // 3. Перерисовываем таблицу архива
    renderArchiveTable();
}
function renderArchiveTable() {
    const tbody = document.querySelector('#archiveTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const selectedDay = document.getElementById('archiveDaySelect').value;
    if (!selectedDay) return;
    
    const filteredLogs = serverArchive.filter(log => log.archiveSheetName === selectedDay);
    
    filteredLogs.forEach(log => {
        const emp = serverEmployees.find(e => e.phone === log.phone) || { name: 'Удален из базы', type: '-', infoField: '-', vest: '-' };
        const tr = document.createElement('tr');
        
        let typeBadge = '-';
        if(emp.type !== '-') {
            const badgeColor = emp.type === 'Штат' ? 'type-sbl' : 'type-outsource';
            typeBadge = `<span class="type-badge ${badgeColor}">${emp.type}</span>`;
        }
        
        tr.innerHTML = `
            <td><span class="shift-badge">${log.shift}</span></td>
            <td>${log.phone}</td>
            <td><b>№ ${log.tsdNumber}</b></td>
            <td><b>${emp.name}</b></td>
            <td>${typeBadge}</td>
            <td>${emp.infoField}</td>
            <td>Жилет №${emp.vest}</td>
            <td>${formatDateTime(log.timeIssued)}</td>
            <td>${log.timeReturned ? formatDateTime(log.timeReturned) : 'Не сдан'}</td>
            <td><i>${log.operator || 'Не указан'}</i></td>
        `;
        tbody.appendChild(tr);
    });
}
function exportArchiveToExcel() {
    const selectedDay = document.getElementById('archiveDaySelect').value;
    if (!selectedDay) { alert('Сначала выберите день из списка!'); return; }
    
    const filteredLogs = serverArchive.filter(log => log.archiveSheetName === selectedDay);
    if (filteredLogs.length === 0) { alert('Нет данных.'); return; }
    
    let csvContent = "\uFEFF"; 
    csvContent += "Смена;Логин;Номер ТСД;ФИО;Тип;Компания / Должность;Номер Жилета;Время Выдачи;Время Сдачи;Оператор\n";
    
    filteredLogs.forEach(log => {
        const emp = serverEmployees.find(e => e.phone === log.phone) || { name: 'Удален', type: '-', infoField: '-', vest: '-' };
        const returnTime = log.timeReturned ? formatDateTime(log.timeReturned) : "Не сдан";
        csvContent += `${log.shift};${log.phone};${log.tsdNumber};${emp.name};${emp.type};${emp.infoField};${emp.vest};${formatDateTime(log.timeIssued)};${returnTime};${log.operator || 'Не указан'}\n`;
    });
    
    downloadCSV(csvContent, `Otchet_${selectedDay}.csv`);
}
function clearAllData() {
    if (confirm('Внимание! Это полностью очистит ВСЕ данные на сервере (включая сотрудников и архивы). Сбросить?')) {
        socket.send(JSON.stringify({ action: 'CLEAR_ALL' }));
        localStorage.removeItem('currentAdmin');
        currentAdmin = null;
        location.reload();
    }
}
function showMessage(elementId, text, type) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.innerText = text;
    el.className = `message msg-${type}`;
    playSound(type);
    if(type === 'success' && elementId === 'scanMessage') setTimeout(() => el.className = 'message', 4000);
}
function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'success') {
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        } else {
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        }
    } catch(e) { console.log(e); }
}
function formatDateTime(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    return d.toLocaleString('ru-RU', { hour12: false });
}
function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}