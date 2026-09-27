// 扫码表单的字段定义。
//
// 运行时以数据库里的 field_defs 表为准：管理端 /fields.html 可以直接增删改、拖动排序，
// 保存后即时生效（扫码页刷新就是新表单，不需要重启服务）。
// 本文件里的 defaultFields 只用于「数据库里还没有任何定义」的首次启动，以及配置页的「恢复默认」。
//
// 字段属性：
//   key         提交/存储用的键名（改动等于删旧字段 + 建新字段，历史里的旧值会标注「已移除」显示）
//   label       表单上显示的中文名
//   type        text | textarea | number | date | select
//   required    必填
//   options     type=select 时的可选项
//   default     新建表单时的默认值
//   maxLength   最大字符数
//   placeholder 输入提示
export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select'];
export const MAX_FIELDS = 40;
export const MAX_OPTIONS = 50;

export const defaultFields = [
  { key: 'name', label: '品名', type: 'text', required: true, maxLength: 60, placeholder: '例如：955 型电机' },
  { key: 'spec', label: '规格', type: 'text', maxLength: 60, placeholder: '例如：220V / 1.5kW' },
  { key: 'batch', label: '批次号', type: 'text', maxLength: 40, placeholder: '例如：2026-0923-A' },
  { key: 'qty', label: '数量', type: 'number', required: true, placeholder: '例如：12' },
  {
    key: 'unit',
    label: '单位',
    type: 'select',
    options: ['件', '箱', '袋', '桶', '卷', '包', 'kg', '吨', 'L'],
    default: '件',
  },
  { key: 'producedAt', label: '生产日期', type: 'date' },
  { key: 'expiresAt', label: '有效期至', type: 'date' },
  { key: 'location', label: '存放位置', type: 'text', maxLength: 60, placeholder: '例如：A 区 3 号货架' },
  { key: 'operator', label: '经办人', type: 'text', maxLength: 30 },
  { key: 'note', label: '备注', type: 'textarea', maxLength: 500, placeholder: '可选备注' },
];

// 校验一份完整的字段定义（管理端保存时用）。返回 { fields, errors }。
// errors 非空时 fields 为空数组，调用方不应写库。
export function validateFieldDefs(input) {
  if (!Array.isArray(input)) return { fields: [], errors: ['fields 必须是数组'] };

  const errors = [];
  if (!input.length) errors.push('至少要保留一个字段');
  if (input.length > MAX_FIELDS) errors.push(`最多 ${MAX_FIELDS} 个字段`);

  const seen = new Set();
  const out = [];

  input.forEach((raw, i) => {
    const at = `第 ${i + 1} 行`;
    const src = raw && typeof raw === 'object' ? raw : {};
    const key = typeof src.key === 'string' ? src.key.trim() : '';
    const label = typeof src.label === 'string' ? src.label.trim() : '';
    const type = src.type;

    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) {
      errors.push(`${at}：key 需以字母开头，只含字母/数字/下划线，不超过 40 字符`);
    } else if (seen.has(key)) {
      errors.push(`${at}：key「${key}」重复`);
    } else {
      seen.add(key);
    }

    if (!label) errors.push(`${at}：显示名不能为空`);
    else if (label.length > 40) errors.push(`${at}：显示名最多 40 字`);
    if (!FIELD_TYPES.includes(type)) errors.push(`${at}：类型「${type}」不支持`);

    let options = [];
    if (type === 'select') {
      const rawOptions = Array.isArray(src.options) ? src.options : [];
      options = rawOptions.map((o) => String(o).trim()).filter(Boolean);
      if (!options.length) errors.push(`${at}：下拉字段至少要有一个选项`);
      else if (options.length > MAX_OPTIONS) errors.push(`${at}：选项最多 ${MAX_OPTIONS} 个`);
      else if (new Set(options).size !== options.length) errors.push(`${at}：选项有重复`);
    }

    let maxLength = null;
    const rawMax = src.maxLength;
    if (rawMax !== undefined && rawMax !== null && String(rawMax).trim() !== '') {
      const n = Number(rawMax);
      if (!Number.isInteger(n) || n < 1 || n > 2000) errors.push(`${at}：最大长度需为 1-2000 的整数`);
      else maxLength = n;
    }

    const fallback = typeof src.default === 'string' ? src.default.trim() : '';
    if (fallback) {
      if (maxLength && fallback.length > maxLength) errors.push(`${at}：默认值超过最大长度`);
      if (type === 'select' && options.length && !options.includes(fallback)) {
        errors.push(`${at}：默认值「${fallback}」不在选项里`);
      }
      if (type === 'number' && !/^\d+(\.\d+)?$/.test(fallback)) errors.push(`${at}：默认值不是数字`);
    }

    const placeholder = typeof src.placeholder === 'string' ? src.placeholder.trim().slice(0, 60) : '';

    out.push({ key, label, type, required: !!src.required, options, default: fallback, maxLength, placeholder });
  });

  return { fields: errors.length ? [] : out, errors };
}

// 按给定的字段定义校验并规整一次提交，返回 { data, errors }。
// data 里每个值都是去空格后的字符串，未填的可选字段为 ''。
export function validateRecord(input, fieldList = defaultFields) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const data = {};
  const errors = [];

  for (const f of fieldList) {
    let value = src[f.key];
    if (value === undefined || value === null) value = '';
    if (typeof value === 'number') value = String(value);

    if (typeof value !== 'string') {
      errors.push(`${f.label} 格式不正确`);
      continue;
    }
    value = value.trim();

    if (f.type === 'number' && value && !/^\d+(\.\d+)?$/.test(value)) {
      errors.push(`${f.label} 只能是数字`);
      continue;
    }
    if (f.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`${f.label} 需要 YYYY-MM-DD 格式`);
      continue;
    }
    if (f.type === 'select' && value && !f.options.includes(value)) {
      errors.push(`${f.label} 不在可选范围内`);
      continue;
    }
    if (f.maxLength && value.length > f.maxLength) {
      errors.push(`${f.label} 最多 ${f.maxLength} 个字符`);
      continue;
    }
    if (f.required && !value) {
      errors.push(`${f.label} 不能为空`);
      continue;
    }

    data[f.key] = value;
  }

  return { data, errors };
}
