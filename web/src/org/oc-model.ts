// Общая модель схемы: дерево, цвета подразделений, пути. Не реактивная — пересоздаётся при смене данных или языка.
export interface OcPerson { id: number; name: string; position: string; employment: string; avatar_v: number; on_leave: boolean }
export interface OcNode {
  id: number; parent_id: number | null; kind: string; name_ru: string; name_uz: string; sort: number; division: number;
  head: { id: number; name: string; position: string; avatar_v: number } | null; people: OcPerson[]; direct: number; total: number; mine: boolean;
}
export const PALETTE = ['#3CF686', '#FFD95C', '#25CFE8', '#FF8E7D', '#B8A8FF', '#F9A8D4', '#FDBA74', '#A3A3AD'];

export function buildModel(nodes: OcNode[], lang: string) {
  const byId = new Map<number, OcNode>(nodes.map((n) => [n.id, n]));
  const nm = (n: OcNode) => (lang === 'uz' && n.name_uz) || n.name_ru;
  const kids = new Map<number | null, OcNode[]>();
  for (const n of nodes) {
    const key = n.parent_id != null && byId.has(n.parent_id) ? n.parent_id : null; // потерявшие родителя становятся корнями
    kids.set(key, [...(kids.get(key) ?? []), n]);
  }
  for (const a of kids.values()) a.sort((x, y) => x.sort - y.sort || x.id - y.id);
  const roots = kids.get(null) ?? [];
  const rootNode = roots.find((n) => n.kind === 'root') ?? null;
  const divisions = rootNode ? kids.get(rootNode.id) ?? [] : roots;
  const color = new Map<number, string>(divisions.map((d, i) => [d.id, PALETTE[i % PALETTE.length]]));
  const colorOf = (n: OcNode) => color.get(n.division) ?? color.get(n.id) ?? '#A3A3AD';
  const pathOf = (n: OcNode): string => {
    const out: string[] = [];
    for (let c: OcNode | undefined = n; c; c = c.parent_id != null ? byId.get(c.parent_id) : undefined) if (c.kind !== 'root') out.unshift(nm(c));
    return out.join(' / ');
  };
  const sub = (id: number): OcNode[] => { const out: OcNode[] = []; const walk = (x: number) => { const n = byId.get(x); if (!n) return; out.push(n); (kids.get(x) ?? []).forEach((k) => walk(k.id)); }; walk(id); return out; };
  return { nodes, byId, nm, kids, roots, rootNode, divisions, colorOf, pathOf, sub };
}
export type OcModel = ReturnType<typeof buildModel>;

export const matches = (p: OcPerson, q: string) => { const s = q.trim().toLowerCase(); return !!s && (p.name.toLowerCase().includes(s) || (p.position ?? '').toLowerCase().includes(s)); };
