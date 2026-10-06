// Переносит узел в <body>: панели, которые должны быть поверх всего интерфейса и не обрезаться прокруткой или blur боковой колонки.
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return { destroy() { node.remove(); } };
}
