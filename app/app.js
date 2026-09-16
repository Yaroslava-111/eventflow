/* =============================================
   EventFlow — app.js
   Состояние интерфейса, рендеринг, базовые сценарии
   ============================================= */

(function () {
  'use strict';

  /* --- Настройки события (соответствуют data/event-settings.json) --- */
  const DEFAULT_EVENT = {
    name: 'Практикум «Продукты с ИИ»',
    venue: 'Учебный центр',
    capacity: 120,
  };

  /* --- Состояние --- */
  let allParticipants = [];
  let filteredParticipants = [];
  let activityLog = [];
  let searchTerm = '';
  let filterStatus = 'all';
  let filterTicket = 'all';
  let sortMode = 'name-asc';

  /* --- Элементы DOM --- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    eventInfo: $('#eventInfo'),
    metricTotal: $('#metricTotal'),
    metricConfirmed: $('#metricConfirmed'),
    metricCheckedIn: $('#metricCheckedIn'),
    metricWaitlist: $('#metricWaitlist'),
    searchInput: $('#searchInput'),
    filterStatus: $('#filterStatus'),
    filterTicket: $('#filterTicket'),
    sortSelect: $('#sortSelect'),
    participantsBody: $('#participantsBody'),
    emptyState: $('#emptyState'),
    noResults: $('#noResults'),
    activityLog: $('#activityLog'),
    loadingOverlay: $('#loadingOverlay'),
    toastContainer: $('#toastContainer'),
    modalParticipant: $('#modalParticipant'),
    modalImport: $('#modalImport'),
    modalRestore: $('#modalRestore',
    ),
  };

  /* --- Утилиты --- */

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* --- Toast-уведомления --- */

  function showToast(message, type, undoCallback) {
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + type;

    let html = '<span class="toast-message">' + escapeHtml(message) + '</span>';
    if (undoCallback) {
      html += '<button type="button" class="toast-undo">Отменить</button>';
    }
    html += '<button type="button" class="toast-close" aria-label="Закрыть">&times;</button>';
    toast.innerHTML = html;

    if (undoCallback) {
      toast.querySelector('.toast-undo').addEventListener('click', () => {
        undoCallback();
        toast.remove();
      });
    }
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    els.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  /* --- Рендеринг показателей --- */

  function renderMetrics() {
    const active = allParticipants.filter((p) => !p.archivedAt);
    const confirmed = active.filter((p) => p.status === 'confirmed');
    const checkedIn = active.filter((p) => p.checkedIn);
    const waitlist = active.filter((p) => p.status === 'waitlist');

    els.metricTotal.textContent = active.length;
    els.metricConfirmed.textContent = confirmed.length;
    els.metricCheckedIn.textContent = checkedIn.length;
    els.metricWaitlist.textContent = waitlist.length;
  }

  /* --- Фильтрация и сортировка --- */

  function applyFiltersAndSort() {
    let list = allParticipants.filter((p) => !p.archivedAt);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.email.toLowerCase().includes(term) ||
          (p.company && p.company.toLowerCase().includes(term))
      );
    }

    if (filterStatus !== 'all') {
      list = list.filter((p) => p.status === filterStatus);
    }

    if (filterTicket !== 'all') {
      list = list.filter((p) => p.ticket === filterTicket);
    }

    const [field, dir] = sortMode.split('-');
    list.sort((a, b) => {
      let cmp = 0;
      if (field === 'name') {
        cmp = a.name.localeCompare(b.name, 'ru');
      } else if (field === 'date') {
        cmp = (a.registeredAt || '').localeCompare(b.registeredAt || '');
      }
      return dir === 'desc' ? -cmp : cmp;
    });

    filteredParticipants = list;
  }

  /* --- Рендеринг таблицы --- */

  function renderTable() {
    applyFiltersAndSort();

    const hasAnyParticipants = allParticipants.filter((p) => !p.archivedAt).length > 0;

    if (!hasAnyParticipants) {
      els.participantsBody.innerHTML = '';
      els.emptyState.hidden = false;
      els.noResults.hidden = true;
      return;
    }

    els.emptyState.hidden = true;

    if (filteredParticipants.length === 0) {
      els.participantsBody.innerHTML = '';
      els.noResults.hidden = false;
      return;
    }

    els.noResults.hidden = true;

    const statusLabels = {
      new: 'Новый',
      confirmed: 'Подтверждён',
      waitlist: 'Лист ожидания',
      cancelled: 'Отменён',
    };

    const ticketLabels = {
      standard: 'Стандартный',
      business: 'Бизнес',
      vip: 'VIP',
    };

    let html = '';
    filteredParticipants.forEach((p) => {
      const checkMark = p.checkedIn
        ? '<span class="check-indicator check-indicator--yes" title="Пришёл">&#10003;</span>'
        : '<span class="check-indicator check-indicator--no">—</span>';

      html +=
        '<tr data-id="' +
        p.id +
        '">' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + escapeHtml(p.email) + '</td>' +
        '<td>' + escapeHtml(p.company || '—') + '</td>' +
        '<td><span class="badge badge--' + p.ticket + '">' + (ticketLabels[p.ticket] || p.ticket) + '</span></td>' +
        '<td><span class="badge badge--' + p.status + '">' + (statusLabels[p.status] || p.status) + '</span></td>' +
        '<td>' + checkMark + '</td>' +
        '<td class="date-cell">' + formatDate(p.registeredAt) + '</td>' +
        '<td class="table-actions">' +
          '<button type="button" class="btn-icon btn-edit" data-id="' + p.id + '" title="Редактировать">&#9998;</button>' +
          '<button type="button" class="btn-icon btn-archive" data-id="' + p.id + '" title="Архивировать">&#128465;</button>' +
          (p.status === 'confirmed' && !p.checkedIn
            ? '<button type="button" class="btn-icon btn-checkin" data-id="' + p.id + '" title="Отметить приход">&#10003;</button>'
            : '') +
        '</td>' +
        '</tr>';
    });

    els.participantsBody.innerHTML = html;
  }

  /* --- Рендеринг журнала --- */

  function renderActivity() {
    if (activityLog.length === 0) {
      els.activityLog.innerHTML = '<p class="activity-empty">Журнал пуст</p>';
      return;
    }

    const sorted = [...activityLog].sort(
      (a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')
    );
    const recent = sorted.slice(0, 20);

    const dotClass = {
      created: 'created',
      updated: 'updated',
      archived: 'archived',
      unarchived: 'unarchived',
      checked_in: 'checked_in',
      imported: 'imported',
      restored: 'restored',
    };

    let html = '';
    recent.forEach((entry) => {
      html +=
        '<div class="activity-item">' +
        '<span class="activity-dot activity-dot--' + (dotClass[entry.action] || 'updated') + '"></span>' +
        '<span class="activity-text">' + escapeHtml(entry.details) + '</span>' +
        '<span class="activity-time">' + formatDate(entry.timestamp) + '</span>' +
        '</div>';
    });

    els.activityLog.innerHTML = html;
  }

  /* --- Полный рендеринг --- */

  function render() {
    renderMetrics();
    renderTable();
    renderActivity();
  }

  /* --- Загрузка данных --- */

  function loadAll() {
    return Promise.all([
      participantsDB.getAll(),
      activityDB.getAll(),
      settingsDB.get('event'),
    ]).then(([participants, activity, eventSettings]) => {
      allParticipants = participants;
      activityLog = activity;

      if (eventSettings) {
        els.eventInfo.textContent =
          eventSettings.name +
          (eventSettings.venue ? ' · ' + eventSettings.venue : '') +
          (eventSettings.capacity ? ' · Мест: ' + eventSettings.capacity : '');
      } else {
        els.eventInfo.textContent =
          DEFAULT_EVENT.name +
          (DEFAULT_EVENT.venue ? ' · ' + DEFAULT_EVENT.venue : '') +
          (DEFAULT_EVENT.capacity ? ' · Мест: ' + DEFAULT_EVENT.capacity : '');
      }

      render();
    });
  }

  /* --- Обработчики событий --- */

  function setupEventListeners() {
    els.searchInput.addEventListener(
      'input',
      debounce(function () {
        searchTerm = this.value.trim();
        renderTable();
      }, 200)
    );

    els.filterStatus.addEventListener('change', function () {
      filterStatus = this.value;
      renderTable();
    });

    els.filterTicket.addEventListener('change', function () {
      filterTicket = this.value;
      renderTable();
    });

    els.sortSelect.addEventListener('change', function () {
      sortMode = this.value;
      renderTable();
    });

    $('#btnResetFilters').addEventListener('click', function () {
      searchTerm = '';
      filterStatus = 'all';
      filterTicket = 'all';
      sortMode = 'name-asc';
      els.searchInput.value = '';
      els.filterStatus.value = 'all';
      els.filterTicket.value = 'all';
      els.sortSelect.value = 'name-asc';
      renderTable();
    });

    $('#btnAddParticipant').addEventListener('click', function () {
      openParticipantModal();
    });

    document.querySelectorAll('.js-btn-add').forEach((btn) => {
      btn.addEventListener('click', function () {
        openParticipantModal();
      });
    });

    $('#btnCloseParticipant').addEventListener('click', closeParticipantModal);
    $('#btnCancelParticipant').addEventListener('click', closeParticipantModal);

    els.modalParticipant.addEventListener('click', function (e) {
      if (e.target === els.modalParticipant) {
        closeParticipantModal();
      }
    });

    $('#formParticipant').addEventListener('submit', handleParticipantSubmit);

    $('#field-status').addEventListener('change', updateCheckedInState);

    els.participantsBody.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      const id = btn.dataset.id;

      if (btn.classList.contains('btn-edit')) {
        openParticipantModal(id);
      } else if (btn.classList.contains('btn-archive')) {
        handleArchive(id);
      } else if (btn.classList.contains('btn-checkin')) {
        handleCheckIn(id);
      }
    });

    $('#btnImportCsv').addEventListener('click', function () {
      openImportModal();
    });

    document.querySelectorAll('.js-btn-import').forEach((btn) => {
      btn.addEventListener('click', function () {
        openImportModal();
      });
    });

    $('#btnCloseImport').addEventListener('click', closeImportModal);
    $('#btnCancelImport').addEventListener('click', closeImportModal);

    els.modalImport.addEventListener('click', function (e) {
      if (e.target === els.modalImport) {
        closeImportModal();
      }
    });

    $('#btnChooseFile').addEventListener('click', function () {
      $('#csvFileInput').click();
    });

    $('#csvFileInput').addEventListener('change', handleCsvFileSelect);
    $('#btnConfirmImport').addEventListener('click', handleConfirmImport);

    $('#btnExportJson').addEventListener('click', handleExportJson);

    $('#btnRestoreJson').addEventListener('click', function () {
      openRestoreModal();
    });

    $('#btnCloseRestore').addEventListener('click', closeRestoreModal);
    $('#btnCancelRestore').addEventListener('click', closeRestoreModal);

    els.modalRestore.addEventListener('click', function (e) {
      if (e.target === els.modalRestore) {
        closeRestoreModal();
      }
    });

    $('#btnChooseJson').addEventListener('click', function () {
      $('#jsonFileInput').click();
    });

    $('#jsonFileInput').addEventListener('change', handleJsonFileSelect);
    $('#btnConfirmRestore').addEventListener('click', handleConfirmRestore);

    $('#btnClearActivity').addEventListener('click', handleClearActivity);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeParticipantModal();
        closeImportModal();
        closeRestoreModal();
      }
    });
  }

  /* --- Модальное окно участника --- */

  let editingParticipantId = null;

  function openParticipantModal(id) {
    editingParticipantId = id || null;
    const form = $('#formParticipant');
    form.reset();

    $('#modalParticipantTitle').textContent = id ? 'Редактировать участника' : 'Новый участник';

    if (id) {
      const p = allParticipants.find((x) => x.id === id);
      if (p) {
        $('#field-name').value = p.name;
        $('#field-email').value = p.email;
        $('#field-company').value = p.company || '';
        $('#field-ticket').value = p.ticket;
        $('#field-status').value = p.status;
        $('#field-checkedIn').checked = p.checkedIn;
      }
    }

    updateCheckedInState();
    clearFormErrors();
    els.modalParticipant.hidden = false;
    $('#field-name').focus();
  }

  function closeParticipantModal() {
    els.modalParticipant.hidden = true;
    editingParticipantId = null;
  }

  function updateCheckedInState() {
    const status = $('#field-status').value;
    const cb = $('#field-checkedIn');
    const hint = $('#hint-checkedIn');

    if (status !== 'confirmed') {
      cb.checked = false;
      cb.disabled = true;
      hint.textContent = 'Доступно только для статуса «Подтверждён»';
    } else {
      cb.disabled = false;
      hint.textContent = '';
    }
  }

  function clearFormErrors() {
    $$('.form-error').forEach((el) => (el.textContent = ''));
    $$('.form-input, .form-select').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function showFieldError(fieldId, message) {
    const errorEl = $('#error-' + fieldId);
    const inputEl = $('#field-' + fieldId);
    if (errorEl) errorEl.textContent = message;
    if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
  }

  function handleParticipantSubmit(e) {
    e.preventDefault();
    clearFormErrors();

    const name = $('#field-name').value.trim();
    const email = $('#field-email').value.trim();
    const company = $('#field-company').value.trim();
    const ticket = $('#field-ticket').value;
    const status = $('#field-status').value;
    const checkedIn = $('#field-checkedIn').checked;

    let hasError = false;

    if (!name) {
      showFieldError('name', 'Введите имя участника');
      hasError = true;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      showFieldError('email', 'Введите email');
      hasError = true;
    } else if (!emailRegex.test(email)) {
      showFieldError('email', 'Введите корректный email, например name@example.com');
      hasError = true;
    }

    if (checkedIn && status !== 'confirmed') {
      showFieldError('status', 'Отметка прихода доступна только для подтверждённого статуса');
      hasError = true;
    }

    if (hasError) return;

    const data = {
      name,
      email: email.toLowerCase(),
      company,
      ticket,
      status,
      checkedIn,
    };

    const existingByEmail = allParticipants.find((p) => p.email.toLowerCase() === data.email);
    if (existingByEmail && existingByEmail.id !== editingParticipantId) {
      showFieldError('email', 'Участник с таким email уже существует');
      return;
    }

    const save = editingParticipantId
      ? participantsDB.update(editingParticipantId, data)
      : participantsDB.add(data);

    save
      .then(() => {
        const actionName = editingParticipantId ? 'updated' : 'created';
        const actionLabel = editingParticipantId ? 'обновлён' : 'добавлен';

        return activityDB.add({
          action: actionName,
          participantId: editingParticipantId,
          participantName: name,
          details: 'Участник ' + name + ' ' + actionLabel,
        });
      })
      .then(() => {
        closeParticipantModal();
        showToast(
          editingParticipantId ? 'Изменения сохранены' : 'Участник добавлен',
          'success'
        );
        return loadAll();
      })
      .catch((err) => {
        showToast('Ошибка сохранения: ' + err.message, 'error');
      });
  }

  /* --- Архивация --- */

  function handleArchive(id) {
    const participant = allParticipants.find((p) => p.id === id);
    if (!participant) return;

    participantsDB
      .archive(id)
      .then(() => {
        return activityDB.add({
          action: 'archived',
          participantId: id,
          participantName: participant.name,
          details: 'Участник ' + participant.name + ' архивирован',
        });
      })
      .then(() => {
        showToast('Участник ' + participant.name + ' архивирован', 'warning', () => {
          participantsDB
            .unarchive(id)
            .then(() => {
              return activityDB.add({
                action: 'unarchived',
                participantId: id,
                participantName: participant.name,
                details: 'Архивация участника ' + participant.name + ' отменена',
              });
            })
            .then(() => loadAll())
            .then(() => showToast('Архивация отменена', 'info'));
        });
        return loadAll();
      })
      .catch((err) => {
        showToast('Ошибка архивации: ' + err.message, 'error');
      });
  }

  /* --- Отметка прихода --- */

  function handleCheckIn(id) {
    const participant = allParticipants.find((p) => p.id === id);
    if (!participant) return;

    participantsDB
      .checkIn(id)
      .then(() => {
        return activityDB.add({
          action: 'checked_in',
          participantId: id,
          participantName: participant.name,
          details: 'Отмечен приход: ' + participant.name,
        });
      })
      .then(() => {
        showToast(participant.name + ' отмечен как пришедший', 'success');
        return loadAll();
      })
      .catch((err) => {
        showToast('Ошибка: ' + err.message, 'error');
      });
  }

  /* --- CSV: импорт --- */

  let importData = null;

  function openImportModal() {
    importData = null;
    $('#importSelect').hidden = false;
    $('#importPreview').hidden = true;
    $('#importFooter').hidden = true;
    $('#csvFileInput').value = '';
    els.modalImport.hidden = false;
  }

  function closeImportModal() {
    els.modalImport.hidden = true;
    importData = null;
  }

  function handleCsvFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const text = evt.target.result;
      parseAndPreviewCsv(text);
    };
    reader.onerror = function () {
      showToast('Не удалось прочитать файл', 'error');
    };
    reader.readAsText(file);
  }

  function parseAndPreviewCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      showToast('Файл не содержит данных', 'error');
      return;
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredFields = ['name', 'email', 'ticket', 'status'];
    const missingFields = requiredFields.filter((f) => !header.includes(f));

    if (missingFields.length > 0) {
      showToast('Отсутствуют обязательные колонки: ' + missingFields.join(', '), 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validStatuses = ['new', 'confirmed', 'waitlist', 'cancelled'];
    const validTickets = ['standard', 'business', 'vip'];

    const correct = [];
    const errors = [];
    const seenEmails = new Set();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row = {};
      header.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      const rowNum = i + 1;
      const rowErrors = [];

      if (!row.name) {
        rowErrors.push('Отсутствует имя');
      }

      if (!row.email || !emailRegex.test(row.email)) {
        rowErrors.push('Невалидный email');
      }

      if (row.status && !validStatuses.includes(row.status)) {
        rowErrors.push('Невалидный статус: «' + row.status + '»');
      }

      if (row.ticket && !validTickets.includes(row.ticket)) {
        rowErrors.push('Невалидный тип билета: «' + row.ticket + '»');
      }

      if (row.checked_in === 'true' && row.status !== 'confirmed') {
        rowErrors.push('Приход отмечен для неподтверждённого участника');
      }

      const emailLower = (row.email || '').toLowerCase();
      if (emailLower && seenEmails.has(emailLower)) {
        rowErrors.push('Дубликат email в файле');
      }
      if (emailLower) {
        seenEmails.add(emailLower);
      }

      if (allParticipants.some((p) => p.email.toLowerCase() === emailLower)) {
        rowErrors.push('Email уже есть в базе данных');
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors, raw: row });
      } else {
        correct.push({
          name: row.name,
          email: row.email,
          company: row.company || '',
          ticket: row.ticket || 'standard',
          status: row.status || 'new',
          checkedIn: row.checked_in === 'true',
          registeredAt: row.registered_at || new Date().toISOString(),
        });
      }
    }

    importData = { correct, errors };

    $('#importSelect').hidden = true;
    $('#importPreview').hidden = false;
    $('#importFooter').hidden = false;

    $('#importTotal').textContent = lines.length - 1;
    $('#importCorrect').textContent = correct.length;
    $('#importErrors').textContent = errors.length;

    const errorList = $('#importErrorList');
    const errorItems = $('#importErrorItems');
    const suggestion = $('#importSuggestion');
    const suggestionText = $('#importSuggestionText');
    const confirmBtn = $('#btnConfirmImport');

    if (errors.length > 0) {
      errorList.hidden = false;
      errorItems.innerHTML = errors
        .map(
          (e) =>
            '<li>Строка ' + e.row + ': ' + escapeHtml(e.errors.join('; ')) + '</li>'
        )
        .join('');
      suggestion.hidden = false;
      suggestionText.textContent =
        'Строки с ошибками не будут импортированы. Можно загрузить только корректные (' +
        correct.length +
        ').';
      confirmBtn.textContent = 'Загрузить только корректные';
    } else {
      errorList.hidden = true;
      suggestion.hidden = true;
      confirmBtn.textContent = 'Импортировать';
    }

    confirmBtn.disabled = correct.length === 0;
  }

  function handleConfirmImport() {
    if (!importData || importData.correct.length === 0) return;

    const records = importData.correct;
    const activityEntries = records.map((r) => ({
      action: 'imported',
      participantId: null,
      participantName: r.name,
      details: 'Импортирован участник ' + r.name,
    }));

    importParticipants(records, activityEntries)
      .then(() => {
        showToast('Импортировано участников: ' + records.length, 'success');
        closeImportModal();
        return loadAll();
      })
      .catch((err) => {
        showToast('Ошибка импорта: ' + err.message, 'error');
      });
  }

  /* --- Экспорт JSON --- */

  function handleExportJson() {
    exportBackup()
      .then((data) => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'eventflow-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Резервная копия сохранена', 'success');
      })
      .catch((err) => {
        showToast('Ошибка экспорта: ' + err.message, 'error');
      });
  }

  /* --- Восстановление JSON --- */

  let restoreData = null;

  function openRestoreModal() {
    restoreData = null;
    $('#restoreSelect').hidden = false;
    $('#restorePreview').hidden = true;
    $('#restoreFooter').hidden = true;
    $('#jsonFileInput').value = '';
    els.modalRestore.hidden = false;
  }

  function closeRestoreModal() {
    els.modalRestore.hidden = true;
    restoreData = null;
  }

  function handleJsonFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = JSON.parse(evt.target.result);

        if (data.schemaVersion === undefined || Number(data.schemaVersion) !== 1) {
          const keys = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'не объект';
          const sv = data && data.schemaVersion !== undefined ? JSON.stringify(data.schemaVersion) : 'отсутствует';
          showToast(
            'Несовместимая версия схемы. Ожидалась 1, получено: ' + sv + '. Ключи файла: ' + keys + '.',
            'error'
          );
          return;
        }

        if (!Array.isArray(data.participants) || !Array.isArray(data.activity)) {
          showToast('Неверная структура файла резервной копии', 'error');
          return;
        }

        restoreData = data;

        $('#restoreSelect').hidden = true;
        $('#restorePreview').hidden = false;
        $('#restoreFooter').hidden = false;

        $('#restoreParticipants').textContent = data.participants.length;
        $('#restoreActivity').textContent = data.activity.length;
        $('#btnConfirmRestore').disabled = false;
      } catch (err) {
        showToast('Не удалось прочитать JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function handleConfirmRestore() {
    if (!restoreData) return;

    const participants = restoreData.participants;
    const activity = restoreData.activity;
    const settings = getRestoreSettings(restoreData);

    restoreBackup(participants, activity, settings)
      .then(() => {
        showToast('Данные восстановлены из резервной копии', 'success');
        closeRestoreModal();
        return loadAll();
      })
      .catch((err) => {
        showToast('Ошибка восстановления: ' + err.message, 'error');
      });
  }

  /* --- Очистка журнала действий --- */

  function handleClearActivity() {
    if (!window.confirm('Очистить журнал последних действий? Это действие нельзя отменить.')) {
      return;
    }

    activityDB
      .clear()
      .then(() => {
        showToast('Журнал действий очищен', 'success');
        return loadAll();
      })
      .catch((err) => {
        showToast('Ошибка очистки журнала: ' + err.message, 'error');
      });
  }

  /* --- Инициализация --- */

  function init() {
    setupEventListeners();

    els.loadingOverlay.hidden = false;

    openDB()
      .then(() => ensureEventSettings())
      .then(() => loadAll())
      .then(() => {
        els.loadingOverlay.hidden = true;
      })
      .catch((err) => {
        els.loadingOverlay.hidden = true;
        showToast('Ошибка загрузки: ' + err.message, 'error');
      });
  }

  function ensureEventSettings() {
    return settingsDB.get('event').then((event) => {
      if (!event) {
        return settingsDB.set('event', DEFAULT_EVENT);
      }
      return event;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
