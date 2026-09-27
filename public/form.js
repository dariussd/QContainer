// 前端共用的表单渲染 / 数据展示工具（ES module，由 /form.js 提供）。
// 所有文本都用 textContent 写入，避免把用户输入当 HTML 解析。

export async function loadFields() {
  const res = await fetch('/api/fields');
  if (!res.ok) throw new Error('字段定义加载失败');
  return (await res.json()).fields;
}

// 按字段定义生成表单，填进 container；values 用来预填（例如填入上一条记录）
export function renderForm(container, fields, values = {}, onSubmit) {
  const form = document.createElement('form');
  form.className = 'form';
  form.noValidate = true;

  for (const f of fields) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.htmlFor = `f_${f.key}`;
    label.textContent = f.required ? `${f.label} *` : f.label;
    wrap.appendChild(label);

    let el;
    if (f.type === 'textarea') {
      el = document.createElement('textarea');
      el.rows = 3;
    } else if (f.type === 'select') {
      el = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '—';
      el.appendChild(blank);
      for (const opt of f.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        el.appendChild(o);
      }
    } else {
      el = document.createElement('input');
      el.type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
      if (f.type === 'number') el.inputMode = 'decimal';
    }

    el.id = `f_${f.key}`;
    el.name = f.key;
    if (f.placeholder) el.placeholder = f.placeholder;
    if (f.maxLength) el.maxLength = f.maxLength;
    el.value = values[f.key] ?? f.default ?? '';

    wrap.appendChild(el);
    form.appendChild(wrap);
  }

  // 不传 onSubmit 时只渲染控件（配置页拿它做预览）
  if (onSubmit) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '保存到容器';
    actions.appendChild(submit);
    if (onSubmit.onCancel) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'ghost';
      cancel.textContent = '取消';
      cancel.onclick = onSubmit.onCancel;
      actions.appendChild(cancel);
    }
    form.appendChild(actions);

    form.onsubmit = (e) => {
      e.preventDefault();
      const data = {};
      form.querySelectorAll('[name]').forEach((el) => {
        data[el.name] = el.value;
      });
      onSubmit.onSave?.(data, { setBusy: (busy) => { submit.disabled = busy; } });
    };
  }

  container.appendChild(form);
  return form;
}

// 把一条记录渲染成「字段名 / 值」列表；空值默认不显示
export function renderData(container, fields, data, { hideEmpty = true, extras = [] } = {}) {
  const dl = document.createElement('dl');
  dl.className = 'data';
  let shown = 0;

  for (const f of fields) {
    const value = (data?.[f.key] ?? '').toString().trim();
    if (!value && hideEmpty) continue;
    const dt = document.createElement('dt');
    dt.textContent = f.label;
    const dd = document.createElement('dd');
    dd.textContent = value || '—';
    dl.append(dt, dd);
    shown++;
  }

  // 记录里有、但已不在当前字段定义中的键（字段被删或改名）：也显示出来，标注一下，别让历史数据看不见
  for (const item of extras) {
    const dt = document.createElement('dt');
    dt.className = 'removed';
    dt.textContent = `${item.key}（已移除字段）`;
    const dd = document.createElement('dd');
    dd.textContent = item.value;
    dl.append(dt, dd);
    shown++;
  }

  if (shown === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = '（无内容）';
    container.appendChild(p);
    return;
  }
  container.appendChild(dl);
}
