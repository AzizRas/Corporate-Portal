// На телефоне таблицы `.table` показываются карточками: каждая строка — карточка, подпись колонки — перед значением.
// Подписи берутся из заголовка таблицы автоматически, поэтому в разметке страниц ничего менять не нужно.

/** Подписи для ячеек строки: по числу ячеек и заголовкам; null — таблицу в карточки превращать нельзя (объединённые ячейки, нет заголовка, не совпало число колонок). */
export function labelsFor(headers: string[], cells: number, hasSpan: boolean): string[] | null {
  if (hasSpan || !headers.length || headers.length !== cells) return null;
  return headers.map((h) => h.trim());
}

/** Размечает все таблицы `.table` внутри root: data-label у ячеек и класс cardify. Повторный вызов безопасен. */
export function enhanceTables(root: ParentNode) {
  for (const t of root.querySelectorAll<HTMLTableElement>('table.table')) {
    const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent ?? '');
    const rows = [...t.querySelectorAll('tbody tr')];
    const first = rows[0];
    const hasSpan = !!t.querySelector('[colspan], [rowspan]');
    const labels = first ? labelsFor(heads, first.querySelectorAll(':scope > td, :scope > th').length, hasSpan) : null;
    if (!labels) { t.classList.remove('cardify'); continue; }
    for (const r of rows) [...r.querySelectorAll(':scope > td')].forEach((td, i) => { if (td.getAttribute('data-label') !== labels[i]) td.setAttribute('data-label', labels[i]); });
    t.classList.add('cardify');
  }
}
