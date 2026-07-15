(function () {
  'use strict';

  var MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseTimeToMinutes(text) {
    if (!text) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!m) return null;
    var h = Number(m[1]), mins = Number(m[2]);
    if (h > 23 || mins > 59) return null;
    return h * 60 + mins;
  }

  function validateActivityDates(dateStart, dateEnd, timeStart, timeEnd) {
    if (!dateStart || !dateEnd) return 'Start and end date are required.';
    if (dateEnd < dateStart) return 'End date cannot be before start date.';
    if (dateStart === dateEnd && timeStart && timeEnd) {
      var ts = parseTimeToMinutes(timeStart);
      var te = parseTimeToMinutes(timeEnd);
      if (ts != null && te != null && te <= ts) return 'End time must be after start time.';
    }
    return null;
  }

  function currentActivitiesYear(state) {
    return state.activitiesViewYear || Number(state.project.meta.statusDate.slice(0, 4));
  }

  function currentActivitiesMonth(state) {
    return state.activitiesViewMonth != null ? state.activitiesViewMonth : Number(state.project.meta.statusDate.slice(5, 7)) - 1;
  }

  function renderActivityGroupsEditor(state) {
    var editor = document.getElementById('activity-groups-editor');
    editor.innerHTML = '';
    state.project.activityGroups.forEach(function (group) {
      var row = document.createElement('div');
      row.className = 'activity-group-row';

      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = group.color;
      colorInput.dataset.groupId = group.id;
      colorInput.className = 'activity-group-color-input';

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = group.name;
      nameInput.dataset.groupId = group.id;
      nameInput.className = 'activity-group-name-input';

      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'activity-group-remove-btn';
      removeBtn.dataset.groupId = group.id;

      row.appendChild(colorInput);
      row.appendChild(nameInput);
      row.appendChild(removeBtn);
      editor.appendChild(row);
    });
  }

  function renderNewActivityGroupCheckboxes(state) {
    var wrap = document.getElementById('new-activity-groups');
    var checked = new Set(Array.from(wrap.querySelectorAll('input:checked')).map(function (el) { return el.value; }));
    wrap.innerHTML = '';
    state.project.activityGroups.forEach(function (group) {
      var label = document.createElement('label');
      label.className = 'activity-group-checkbox-label';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = group.id;
      checkbox.checked = checked.has(group.id);
      var swatch = document.createElement('span');
      swatch.className = 'activity-group-swatch';
      swatch.style.background = group.color;
      label.appendChild(checkbox);
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(group.name));
      wrap.appendChild(label);
    });
  }

  function renderActivitiesLegend(state) {
    var container = document.getElementById('activities-legend');
    container.innerHTML = '';

    var typeRow = document.createElement('div');
    typeRow.className = 'calendar-legend-row';
    [['Meeting', 'calendar-chip-Meeting'], ['Workshop', 'calendar-chip-Workshop']].forEach(function (pair) {
      var item = document.createElement('span');
      item.className = 'calendar-legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'calendar-legend-swatch ' + pair[1];
      var label = document.createElement('span');
      label.textContent = pair[0];
      item.appendChild(swatch);
      item.appendChild(label);
      typeRow.appendChild(item);
    });
    container.appendChild(typeRow);

    var groupRow = document.createElement('div');
    groupRow.className = 'calendar-legend-row';
    state.project.activityGroups.forEach(function (group) {
      var item = document.createElement('span');
      item.className = 'calendar-legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'calendar-legend-swatch';
      swatch.style.background = group.color;
      var label = document.createElement('span');
      label.textContent = group.name;
      item.appendChild(swatch);
      item.appendChild(label);
      groupRow.appendChild(item);
    });
    container.appendChild(groupRow);
  }

  function renderActivitiesCalendar(state) {
    var year = currentActivitiesYear(state);
    var month = currentActivitiesMonth(state);
    document.getElementById('activities-month-label').textContent = MONTH_NAMES_FULL[month] + ' ' + year;

    var layout = PP.computeCalendarLayout(year, month, state.project.activities);
    var groupById = new Map(state.project.activityGroups.map(function (g) { return [g.id, g]; }));
    var tooltip = document.getElementById('scurve-tooltip');

    var container = document.getElementById('activities-calendar');
    container.innerHTML = '';

    var dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day-header';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach(function (label) {
      var span = document.createElement('span');
      span.textContent = label;
      dayHeader.appendChild(span);
    });
    container.appendChild(dayHeader);

    layout.weeks.forEach(function (week, weekIndex) {
      var weekEl = document.createElement('div');
      weekEl.className = 'calendar-week';

      week.days.forEach(function (day, col) {
        var cell = document.createElement('div');
        cell.className = 'calendar-daynum' + (day ? '' : ' calendar-daynum-empty');
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = '1';
        if (day) {
          cell.dataset.date = day.date;
          cell.textContent = String(day.dayOfMonth);
          if (day.keyDate) {
            var star = document.createElement('span');
            star.className = 'calendar-keydate-star';
            star.textContent = '★';
            star.title = 'Key date';
            cell.appendChild(star);
          }
        }
        weekEl.appendChild(cell);
      });

      var rowSegments = layout.segments.filter(function (s) { return s.weekIndex === weekIndex; });
      rowSegments.forEach(function (seg) {
        var chip = document.createElement('div');
        chip.className = 'calendar-chip calendar-chip-' + seg.activity.type;
        chip.style.gridColumn = (seg.startCol + 1) + ' / ' + (seg.endCol + 2);
        chip.style.gridRow = String(seg.lane + 2);
        chip.dataset.activityId = seg.activity.id;

        var nameSpan = document.createElement('span');
        nameSpan.className = 'calendar-chip-name';
        nameSpan.textContent = seg.activity.name;
        chip.appendChild(nameSpan);

        if (seg.activity.timeStart || seg.activity.timeEnd) {
          var timeSpan = document.createElement('span');
          timeSpan.className = 'calendar-chip-time';
          timeSpan.textContent = (seg.activity.timeStart || '') + '–' + (seg.activity.timeEnd || '');
          chip.appendChild(timeSpan);
        }

        (seg.activity.groupIds || []).forEach(function (gid) {
          var g = groupById.get(gid);
          if (!g) return;
          var swatch = document.createElement('span');
          swatch.className = 'calendar-chip-group-swatch';
          swatch.style.background = g.color;
          chip.appendChild(swatch);
        });

        chip.addEventListener('mouseenter', function (e) {
          var groupNames = (seg.activity.groupIds || []).map(function (gid) {
            var g = groupById.get(gid);
            return g ? g.name : null;
          }).filter(Boolean).join(', ');
          var timeText = (seg.activity.timeStart || seg.activity.timeEnd)
            ? (seg.activity.timeStart || '') + '–' + (seg.activity.timeEnd || '')
            : 'All day';
          var lines = [
            seg.activity.type + ': ' + seg.activity.name,
            seg.activity.dateStart + (seg.activity.dateEnd !== seg.activity.dateStart ? ' to ' + seg.activity.dateEnd : ''),
            timeText,
          ];
          if (groupNames) lines.push('Groups: ' + groupNames);
          if (seg.activity.remarks) lines.push(seg.activity.remarks);
          tooltip.hidden = false;
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY + 12) + 'px';
          tooltip.textContent = lines.join(' — ');
        });
        chip.addEventListener('mouseleave', function () { tooltip.hidden = true; });

        weekEl.appendChild(chip);
      });

      container.appendChild(weekEl);
    });
  }

  function renderActivitiesList(state) {
    var container = document.getElementById('activities-table');
    container.innerHTML = '';
    var sorted = state.project.activities.slice().sort(function (a, b) { return a.dateStart < b.dateStart ? -1 : 1; });
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['Type', 'Name', 'Start', 'Time Start', 'End', 'Time End', 'Key date', ''].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    sorted.forEach(function (a) {
      var tr = document.createElement('tr');

      var typeTd = document.createElement('td');
      typeTd.textContent = a.type;
      tr.appendChild(typeTd);

      var nameTd = document.createElement('td');
      nameTd.textContent = a.name;
      tr.appendChild(nameTd);

      [['dateStart', 'date', a.dateStart], ['timeStart', 'text', a.timeStart || ''], ['dateEnd', 'date', a.dateEnd], ['timeEnd', 'text', a.timeEnd || '']].forEach(function (spec) {
        var td = document.createElement('td');
        var input = document.createElement('input');
        input.type = spec[1];
        input.value = spec[2];
        input.className = spec[1] === 'date' ? 'activity-date-input' : 'activity-time-input';
        if (spec[1] === 'text') input.placeholder = 'e.g. 9:30';
        input.dataset.activityId = a.id;
        input.dataset.field = spec[0];
        td.appendChild(input);
        tr.appendChild(td);
      });

      var keyTd = document.createElement('td');
      keyTd.textContent = a.keyDate ? 'Yes' : '';
      tr.appendChild(keyTd);

      var actionTd = document.createElement('td');
      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'activity-remove-btn';
      removeBtn.dataset.activityId = a.id;
      actionTd.appendChild(removeBtn);
      tr.appendChild(actionTd);
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  function renderActivities(state) {
    renderActivityGroupsEditor(state);
    renderNewActivityGroupCheckboxes(state);
    renderActivitiesLegend(state);
    renderActivitiesCalendar(state);
    renderActivitiesList(state);
  }

  function wireActivities(state, onChanged) {
    document.getElementById('add-activity-group-button').addEventListener('click', function () {
      var nameInput = document.getElementById('new-activity-group-name');
      var colorInput = document.getElementById('new-activity-group-color');
      var name = nameInput.value.trim();
      if (!name) return;
      state.project.addActivityGroup({ name: name, color: colorInput.value });
      nameInput.value = '';
      onChanged();
    });

    document.getElementById('activity-groups-editor').addEventListener('input', function (e) {
      var groupId = e.target.dataset.groupId;
      if (!groupId) return;
      if (e.target.classList.contains('activity-group-color-input')) {
        state.project.updateActivityGroup(groupId, { color: e.target.value });
        onChanged();
      }
    });

    document.getElementById('activity-groups-editor').addEventListener('change', function (e) {
      var groupId = e.target.dataset.groupId;
      if (!groupId) return;
      if (e.target.classList.contains('activity-group-name-input')) {
        state.project.updateActivityGroup(groupId, { name: e.target.value });
        onChanged();
      }
    });

    document.getElementById('activity-groups-editor').addEventListener('click', function (e) {
      var btn = e.target.closest('.activity-group-remove-btn');
      if (!btn) return;
      state.project.deleteActivityGroup(btn.dataset.groupId);
      onChanged();
    });

    document.getElementById('add-activity-button').addEventListener('click', function () {
      var type = document.getElementById('new-activity-type').value;
      var name = document.getElementById('new-activity-name').value.trim();
      var dateStart = document.getElementById('new-activity-date-start').value;
      var dateEnd = document.getElementById('new-activity-date-end').value || dateStart;
      var timeStart = document.getElementById('new-activity-time-start').value.trim() || null;
      var timeEnd = document.getElementById('new-activity-time-end').value.trim() || null;
      var keyDate = document.getElementById('new-activity-keydate').checked;
      var remarks = document.getElementById('new-activity-remarks').value.trim();
      var groupIds = Array.from(document.querySelectorAll('#new-activity-groups input:checked')).map(function (el) { return el.value; });
      if (!name || !dateStart) {
        window.alert('Name and start date are required.');
        return;
      }
      var addError = validateActivityDates(dateStart, dateEnd, timeStart, timeEnd);
      if (addError) {
        window.alert(addError);
        return;
      }
      state.project.addActivity({
        type: type, name: name, dateStart: dateStart, dateEnd: dateEnd,
        timeStart: timeStart, timeEnd: timeEnd, groupIds: groupIds, keyDate: keyDate, remarks: remarks,
      });
      document.getElementById('new-activity-name').value = '';
      document.getElementById('new-activity-date-start').value = '';
      document.getElementById('new-activity-date-end').value = '';
      document.getElementById('new-activity-time-start').value = '';
      document.getElementById('new-activity-time-end').value = '';
      document.getElementById('new-activity-keydate').checked = false;
      document.getElementById('new-activity-remarks').value = '';
      onChanged();
    });

    document.getElementById('activities-table').addEventListener('click', function (e) {
      var btn = e.target.closest('.activity-remove-btn');
      if (!btn) return;
      state.project.deleteActivity(btn.dataset.activityId);
      onChanged();
    });

    document.getElementById('activities-table').addEventListener('change', function (e) {
      var input = e.target;
      var activityId = input.dataset.activityId;
      var field = input.dataset.field;
      if (!activityId || !field) return;
      var activity = state.project.activities.find(function (a) { return a.id === activityId; });
      if (!activity) return;

      var isTimeField = field === 'timeStart' || field === 'timeEnd';
      var newValue = isTimeField ? (input.value.trim() || null) : input.value;

      var candidateDateStart = field === 'dateStart' ? newValue : activity.dateStart;
      var candidateDateEnd = field === 'dateEnd' ? newValue : activity.dateEnd;
      var candidateTimeStart = field === 'timeStart' ? newValue : activity.timeStart;
      var candidateTimeEnd = field === 'timeEnd' ? newValue : activity.timeEnd;

      var error = validateActivityDates(candidateDateStart, candidateDateEnd, candidateTimeStart, candidateTimeEnd);
      if (error) {
        window.alert(error);
        input.value = activity[field] || '';
        return;
      }

      var patch = {};
      patch[field] = newValue;
      state.project.updateActivity(activityId, patch);
      onChanged();
    });

    document.getElementById('activities-month-prev').addEventListener('click', function () {
      var year = currentActivitiesYear(state);
      var month = currentActivitiesMonth(state) - 1;
      if (month < 0) { month = 11; year -= 1; }
      state.activitiesViewYear = year;
      state.activitiesViewMonth = month;
      renderActivitiesCalendar(state);
    });
    document.getElementById('activities-month-next').addEventListener('click', function () {
      var year = currentActivitiesYear(state);
      var month = currentActivitiesMonth(state) + 1;
      if (month > 11) { month = 0; year += 1; }
      state.activitiesViewYear = year;
      state.activitiesViewMonth = month;
      renderActivitiesCalendar(state);
    });

    var calDrag = null;

    document.getElementById('activities-calendar').addEventListener('mousedown', function (e) {
      var chip = e.target.closest('.calendar-chip');
      if (!chip) return;
      var activity = state.project.activities.find(function (a) { return a.id === chip.dataset.activityId; });
      if (!activity) return;
      calDrag = { activityId: activity.id, origDateStart: activity.dateStart, origDateEnd: activity.dateEnd, targetCell: null };
      chip.classList.add('is-dragging');
    });

    document.addEventListener('mousemove', function (e) {
      if (!calDrag) return;
      if (calDrag.targetCell) calDrag.targetCell.classList.remove('calendar-daynum-drop-target');
      var hitEl = document.elementFromPoint(e.clientX, e.clientY);
      var cell = hitEl && hitEl.closest('.calendar-daynum[data-date]');
      calDrag.targetCell = cell || null;
      if (cell) cell.classList.add('calendar-daynum-drop-target');
    });

    document.addEventListener('mouseup', function () {
      if (!calDrag) return;
      var drag = calDrag;
      calDrag = null;
      document.querySelectorAll('.calendar-chip.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); });
      if (drag.targetCell) drag.targetCell.classList.remove('calendar-daynum-drop-target');
      if (!drag.targetCell) return;
      var targetDate = drag.targetCell.dataset.date;
      if (targetDate === drag.origDateStart) return;
      var deltaDays = Math.round((PP.parseISO(targetDate) - PP.parseISO(drag.origDateStart)) / 86400000);
      var newDateStart = PP.addCalendarDays(drag.origDateStart, deltaDays);
      var newDateEnd = PP.addCalendarDays(drag.origDateEnd, deltaDays);
      state.project.updateActivity(drag.activityId, { dateStart: newDateStart, dateEnd: newDateEnd });
      onChanged();
    });

    document.getElementById('download-activities-template-button').addEventListener('click', function () {
      var blob = new Blob([PP.activitiesCsvTemplateText()], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'activities-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    document.getElementById('mass-upload-activities-button').addEventListener('click', function () {
      document.getElementById('mass-upload-activities-input').click();
    });

    document.getElementById('mass-upload-activities-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var rows = PP.parseCsvText(PP.stripBom(reader.result));
        var result = PP.parseActivitiesCsv(rows, state.project.activityGroups);
        if (result.errors.length) {
          window.alert('Cannot import — ' + result.errors.length + ' error(s):\n' + result.errors.join('\n'));
          return;
        }
        var created = state.project.addActivities(result.activities);
        window.alert('Imported ' + created.length + ' activity(ies).');
        onChanged();
      };
      reader.onerror = function () {
        window.alert('Failed to read that file.');
      };
      reader.readAsText(file, 'UTF-8');
      e.target.value = '';
    });
  }

  window.PP = window.PP || {};
  window.PP.renderActivities = renderActivities;
  window.PP.wireActivities = wireActivities;
})();
