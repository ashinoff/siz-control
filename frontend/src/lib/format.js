// Centralized domain vocabulary (Russian) and formatting helpers.

export const ITEM_TYPE_LABEL = {
  ppe: "СИЗ",
  material: "Материал",
  equipment: "Оборудование",
};

export const INV_STATUS_LABEL = {
  in_stock: "На складе",
  issued: "У сотрудника",
  to_writeoff: "К списанию",
  written_off: "Списано",
};

export const INV_STATUS_BADGE = {
  in_stock: "badge-blue",
  issued: "badge-green",
  to_writeoff: "badge-amber",
  written_off: "badge-gray",
};

export const DEADLINE_LABEL = {
  in_date: "В сроке",
  expiring: "Истекает",
  expired: "Просрочено",
  not_started: "Не начата",
  not_applicable: "—",
};

export const DEADLINE_BADGE = {
  in_date: "badge-green",
  expiring: "badge-amber",
  expired: "badge-red",
  not_started: "badge-gray",
  not_applicable: "badge-gray",
};

export const VERIF_LABEL = {
  in_date: "В сроке",
  expiring: "Истекает",
  expired: "Просрочено",
  not_required: "Не требуется",
};

export const VERIF_BADGE = {
  in_date: "badge-green",
  expiring: "badge-amber",
  expired: "badge-red",
  not_required: "badge-gray",
};

export const LIFE_UNIT_LABEL = {
  days: "дн.",
  months: "мес.",
  years: "лет",
};

export const LIFE_UNIT_OPTIONS = [
  { value: "days", label: "Дней" },
  { value: "months", label: "Месяцев" },
  { value: "years", label: "Лет" },
];

// Unit of measure (единица измерения) for catalog items.
export const MEASURE_UNIT_OPTIONS = [
  { value: "шт", label: "шт" },
  { value: "пара", label: "пара" },
  { value: "комплект", label: "комплект" },
  { value: "пол", label: "пол" },
];

export const EMPLOYEE_STATUS_LABEL = {
  working: "Работает",
  dismissed: "Уволен",
  inactive: "Неактивен",
};

export const EMPLOYEE_STATUS_BADGE = {
  working: "badge-green",
  dismissed: "badge-gray",
  inactive: "badge-amber",
};

export const RETURN_CONDITION_OPTIONS = [
  { value: "good", label: "Исправно — на склад" },
  { value: "needs_check", label: "Требует проверки — на склад" },
  { value: "needs_writeoff", label: "Требует списания — к списанию" },
  { value: "lost", label: "Утеряно — списать" },
];

export const VERIF_RESULT_OPTIONS = [
  { value: "passed", label: "Годно" },
  { value: "failed", label: "Не годно (к списанию)" },
  { value: "repair", label: "Требуется ремонт" },
];

export const VERIF_RESULT_LABEL = {
  passed: "Годно",
  failed: "Не годно",
  repair: "Ремонт",
};

export const OPERATION_LABEL = {
  create: "Создание",
  update: "Редактирование",
  issue: "Выдача",
  return: "Возврат",
  move: "Перемещение",
  writeoff: "Списание",
  verify: "Поверка",
  delete: "Удаление",
};

export const OPERATION_BADGE = {
  create: "badge-blue",
  update: "badge-gray",
  issue: "badge-green",
  return: "badge-blue",
  move: "badge-amber",
  writeoff: "badge-red",
  verify: "badge-blue",
  delete: "badge-red",
};

export const ROLE_LABEL = {
  admin: "Администратор",
  lab: "Лаборатория",
  sue: "Служба учета",
  res_user: "Пользователь РЭС",
};

// --- Formatting ---

export function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtLife(value, unit) {
  if (value == null || !unit) return "—";
  return `${value} ${LIFE_UNIT_LABEL[unit] || unit}`;
}

export function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

export function daysLeft(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
