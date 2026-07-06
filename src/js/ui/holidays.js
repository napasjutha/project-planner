(function () {
  'use strict';

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function countTasksSpanningDate(tasks, dateISO) {
    return tasks.filter(function (t) {
      return t.plannedStart && t.plannedFinish && t.plannedStart <= dateISO && dateISO <= t.plannedFinish;
    }).length;
  }

  function weekdayName(dateISO) {
    var d = new Date(PP.parseISO(dateISO));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  }

  function renderHolidaysTable(state) {
    var container = document.getElementById('holidays-table');
    container.innerHTML = '';
    var sorted = state.project.holidays.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['Date', 'Day', 'Label', 'Tasks spanning', ''].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    sorted.forEach(function (h) {
      var tr = document.createElement('tr');
      [h.date, weekdayName(h.date), h.label, String(countTasksSpanningDate(state.project.tasks, h.date))].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      var actionTd = document.createElement('td');
      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'holiday-remove-btn';
      removeBtn.dataset.date = h.date;
      actionTd.appendChild(removeBtn);
      tr.appendChild(actionTd);
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  function renderCalendarStrip(state) {
    var container = document.getElementById('holidays-calendar');
    container.innerHTML = '';
    var year = state.holidaysViewYear || Number(state.project.meta.statusDate.slice(0, 4));
    document.getElementById('holidays-year-label').textContent = String(year);
    var holidaySet = new Set(state.project.holidays.map(function (h) { return h.date; }));

    for (var m = 0; m < 12; m++) {
      var monthDiv = document.createElement('div');
      monthDiv.className = 'holiday-month';
      var title = document.createElement('div');
      title.className = 'holiday-month-title';
      title.textContent = MONTH_NAMES[m] + ' ' + year;
      monthDiv.appendChild(title);

      var grid = document.createElement('div');
      grid.className = 'holiday-month-grid';
      var firstOfMonth = Date.UTC(year, m, 1);
      var daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      var startWeekday = new Date(firstOfMonth).getUTCDay();
      for (var pad = 0; pad < startWeekday; pad++) {
        grid.appendChild(document.createElement('span'));
      }
      for (var day = 1; day <= daysInMonth; day++) {
        var dateISO = PP.toISO(Date.UTC(year, m, day));
        var dow = new Date(Date.UTC(year, m, day)).getUTCDay();
        var cell = document.createElement('span');
        cell.className = 'holiday-day';
        cell.textContent = String(day);
        if (dow === 0 || dow === 6) cell.classList.add('holiday-day-weekend');
        if (holidaySet.has(dateISO)) cell.classList.add('holiday-day-holiday');
        grid.appendChild(cell);
      }
      monthDiv.appendChild(grid);
      container.appendChild(monthDiv);
    }
  }

  function renderHolidays(state) {
    renderHolidaysTable(state);
    renderCalendarStrip(state);
  }

  function showImpactBanner(state, dateISO) {
    var banner = document.getElementById('holiday-impact-banner');
    if (!dateISO) { banner.textContent = ''; return; }
    var count = countTasksSpanningDate(state.project.tasks, dateISO);
    banner.textContent = count > 0 ? count + ' task(s) span this date' : '';
  }

  function parseBulkLine(line) {
    var parts = line.split(/\t|,/).map(function (s) { return s.trim(); });
    if (parts.length < 2) return null;
    var date = parts[0];
    var label = parts.slice(1).join(' ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { date: date, label: label };
  }

  function wireHolidays(state, onChanged) {
    document.getElementById('new-holiday-date').addEventListener('input', function (e) {
      showImpactBanner(state, e.target.value);
    });

    document.getElementById('add-holiday-button').addEventListener('click', function () {
      var dateInput = document.getElementById('new-holiday-date');
      var labelInput = document.getElementById('new-holiday-label');
      var date = dateInput.value;
      if (!date) return;
      if (state.project.holidays.some(function (h) { return h.date === date; })) {
        window.alert('A holiday is already set for that date.');
        return;
      }
      state.project.holidays.push({ date: date, label: labelInput.value || '' });
      dateInput.value = '';
      labelInput.value = '';
      showImpactBanner(state, null);
      onChanged();
    });

    document.getElementById('holidays-table').addEventListener('click', function (e) {
      var btn = e.target.closest('.holiday-remove-btn');
      if (!btn) return;
      state.project.holidays = state.project.holidays.filter(function (h) { return h.date !== btn.dataset.date; });
      onChanged();
    });

    document.getElementById('holidays-bulk-import-button').addEventListener('click', function () {
      var textarea = document.getElementById('holidays-bulk-input');
      var lines = textarea.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var existing = new Set(state.project.holidays.map(function (h) { return h.date; }));
      var added = 0;
      var skipped = 0;
      lines.forEach(function (line) {
        var parsed = parseBulkLine(line);
        if (!parsed || existing.has(parsed.date)) { skipped++; return; }
        state.project.holidays.push(parsed);
        existing.add(parsed.date);
        added++;
      });
      textarea.value = '';
      window.alert('Imported ' + added + ' holiday(s), skipped ' + skipped + '.');
      onChanged();
    });

    document.getElementById('holidays-year-prev').addEventListener('click', function () {
      state.holidaysViewYear = (state.holidaysViewYear || Number(state.project.meta.statusDate.slice(0, 4))) - 1;
      renderCalendarStrip(state);
    });
    document.getElementById('holidays-year-next').addEventListener('click', function () {
      state.holidaysViewYear = (state.holidaysViewYear || Number(state.project.meta.statusDate.slice(0, 4))) + 1;
      renderCalendarStrip(state);
    });
  }

  window.PP = window.PP || {};
  window.PP.renderHolidays = renderHolidays;
  window.PP.wireHolidays = wireHolidays;
})();
