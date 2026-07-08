(function () {
  'use strict';

  function fmtRatio(cell) {
    if (cell.demand === 0 && cell.available === 0) return '–';
    if (cell.available === 0) return cell.demand + '/0';
    return (cell.demand / cell.available).toFixed(1);
  }

  function cellClass(cell) {
    if (cell.demand === 0 && cell.available === 0) return '';
    if (cell.overloaded) return 'workload-cell-over';
    if (cell.demand === cell.available && cell.demand > 0) return 'workload-cell-full';
    return 'workload-cell-ok';
  }

  function buildHeaderRow(weeks) {
    const tr = document.createElement('tr');
    const first = document.createElement('th');
    first.textContent = 'PIC';
    tr.appendChild(first);
    weeks.forEach(function (w) {
      const th = document.createElement('th');
      th.textContent = 'W' + w.index;
      const sub = document.createElement('span');
      sub.className = 'week-sub';
      sub.textContent = w.mondayISO.slice(5);
      th.appendChild(sub);
      tr.appendChild(th);
    });
    return tr;
  }

  function renderPicList(state) {
    const picEditor = document.getElementById('pic-list-editor');
    picEditor.innerHTML = '';
    (state.project.picList || []).forEach(function (pic) {
      const row = document.createElement('div');
      row.className = 'pic-editor-row';
      const label = document.createElement('span');
      label.textContent = pic;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'pic-remove-btn';
      removeBtn.dataset.pic = pic;
      row.appendChild(label);
      row.appendChild(removeBtn);
      picEditor.appendChild(row);
    });
  }

  function renderResources(state) {
    renderPicList(state);

    const wl = PP.computeWorkload(state.project, state.calc.computed);
    state.workload = wl;
    const picFte = (state.project.settings.picFte = state.project.settings.picFte || {});

    const capWrap = document.getElementById('capacity-grid');
    capWrap.innerHTML = '';
    const wlWrap = document.getElementById('workload-grid');
    wlWrap.innerHTML = '';

    if (!wl.weeks.length) {
      capWrap.textContent = 'No dated tasks yet — the weekly grids appear once tasks have planned dates.';
      wlWrap.textContent = '';
      return;
    }

    const capTable = document.createElement('table');
    capTable.className = 'resource-grid';
    capTable.appendChild(buildHeaderRow(wl.weeks));
    wl.pics.forEach(function (pic) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = pic;
      tr.appendChild(name);
      wl.weeks.forEach(function (w) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.min = '0';
        input.value = PP.weekFteFor(picFte, pic, w.mondayISO);
        input.dataset.pic = pic;
        input.dataset.week = w.mondayISO;
        td.appendChild(input);
        tr.appendChild(td);
      });
      capTable.appendChild(tr);
    });
    capWrap.appendChild(capTable);

    const wlTable = document.createElement('table');
    wlTable.className = 'resource-grid';
    wlTable.appendChild(buildHeaderRow(wl.weeks));
    wl.pics.forEach(function (pic) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = pic;
      tr.appendChild(name);
      wl.weeks.forEach(function (w) {
        const td = document.createElement('td');
        const cell = wl.cells.get(pic + '|' + w.mondayISO);
        td.textContent = fmtRatio(cell);
        const cls = cellClass(cell);
        if (cls) td.className = cls;
        td.dataset.pic = pic;
        td.dataset.week = w.mondayISO;
        tr.appendChild(td);
      });
      wlTable.appendChild(tr);
    });
    wlWrap.appendChild(wlTable);
  }

  function renderDrilldown(state, pic, weekISO) {
    const box = document.getElementById('workload-drilldown');
    box.innerHTML = '';
    const cell = state.workload.cells.get(pic + '|' + weekISO);
    if (!cell || !cell.taskIds.length) return;
    const title = document.createElement('div');
    title.textContent = pic + ' — week of ' + weekISO + ' (' + cell.demand + ' manday(s) / ' + (Math.round(cell.available * 100) / 100) + ' available)';
    box.appendChild(title);
    const byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    const ul = document.createElement('ul');
    cell.taskIds.forEach(function (id) {
      const t = byId.get(id);
      const c = state.calc.computed.get(id);
      const li = document.createElement('li');
      li.textContent = (c ? c.wbs + ' ' : '') + t.name + ' (' + t.plannedStart + ' → ' + t.plannedFinish + ')';
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function wireResources(state, onChanged) {
    document.getElementById('add-pic-button').addEventListener('click', function () {
      const input = document.getElementById('new-pic-input');
      const name = input.value.trim();
      if (!name) return;
      state.project.picList = state.project.picList || [];
      if (state.project.picList.indexOf(name) === -1) state.project.picList.push(name);
      input.value = '';
      onChanged();
    });

    document.getElementById('pic-list-editor').addEventListener('click', function (e) {
      const btn = e.target.closest('.pic-remove-btn');
      if (!btn) return;
      state.project.picList = state.project.picList.filter(function (p) { return p !== btn.dataset.pic; });
      if (state.project.settings.picFte) delete state.project.settings.picFte[btn.dataset.pic];
      onChanged();
    });

    document.getElementById('capacity-grid').addEventListener('change', function (e) {
      const input = e.target.closest('input[type="number"]');
      if (!input) return;
      const pic = input.dataset.pic;
      const week = input.dataset.week;
      let v = input.value.trim() === '' ? 1 : Number(input.value);
      if (!isFinite(v) || v < 0) v = 1;
      const picFte = (state.project.settings.picFte = state.project.settings.picFte || {});
      if (v === 1) {
        if (picFte[pic]) {
          delete picFte[pic][week];
          if (!Object.keys(picFte[pic]).length) delete picFte[pic];
        }
      } else {
        picFte[pic] = picFte[pic] || {};
        picFte[pic][week] = v;
      }
      onChanged();
    });

    document.getElementById('workload-grid').addEventListener('click', function (e) {
      const td = e.target.closest('td[data-pic]');
      if (!td) return;
      renderDrilldown(state, td.dataset.pic, td.dataset.week);
    });
  }

  window.PP = window.PP || {};
  window.PP.renderResources = renderResources;
  window.PP.wireResources = wireResources;
})();
