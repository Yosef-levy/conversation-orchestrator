import type { MessageNode, UUID } from "../api/types";

export type LayoutNode = { id: UUID; x: number; y: number; depth: number };

export function computeDepths(messages: MessageNode[]): Map<UUID, number> {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const memo = new Map<UUID, number>();

  const depthOf = (id: UUID): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const msg = byId.get(id);
    if (!msg) return 0;
    if (msg.parent_id == null) {
      memo.set(id, 0);
      return 0;
    }
    const d = depthOf(msg.parent_id) + 1;
    memo.set(id, d);
    return d;
  };

  for (const m of messages) depthOf(m.id);
  return memo;
}

export function simpleVerticalLayout(messages: MessageNode[]): LayoutNode[] {
  const depths = computeDepths(messages);
  const byDepth = new Map<number, MessageNode[]>();

  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const m of sorted) {
    const d = depths.get(m.id) ?? 0;
    const arr = byDepth.get(d) ?? [];
    arr.push(m);
    byDepth.set(d, arr);
  }

  const xGap = 280;
  const yGap = 160;
  const positions = new Map<UUID, { x: number; y: number }>();
  const depthOrder = [...byDepth.entries()].sort((a, b) => a[0] - b[0]);

  for (const [depth, arr] of depthOrder) {
    let toPlace: MessageNode[];
    if (depth === 0) {
      toPlace = [...arr];
    } else {
      // Order by parent's x then created_at so edges don't cross:
      // children of the left parent stay left of children of the right parent.
      toPlace = [...arr].sort((a, b) => {
        const parentXa = a.parent_id != null ? positions.get(a.parent_id)?.x ?? 0 : 0;
        const parentXb = b.parent_id != null ? positions.get(b.parent_id)?.x ?? 0 : 0;
        if (parentXa !== parentXb) return parentXa - parentXb;
        return a.created_at.localeCompare(b.created_at);
      });
    }
    toPlace.forEach((m, idx) => {
      positions.set(m.id, { x: idx * xGap, y: depth * yGap });
    });
  }

  return messages.map((m) => {
    const pos = positions.get(m.id)!;
    return {
      id: m.id,
      x: pos.x,
      y: pos.y,
      depth: depths.get(m.id) ?? 0,
    };
  });
}

export function buildParentMap(messages: MessageNode[]): Map<UUID, UUID | null> {
  return new Map(messages.map((m) => [m.id, m.parent_id]));
}

/** Path from root to the given node (inclusive), following parent_id. */
export function pathFromRoot(
  messages: MessageNode[],
  toNodeId: UUID
): MessageNode[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const path: MessageNode[] = [];
  let cur: MessageNode | undefined = byId.get(toNodeId);
  while (cur) {
    path.push(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  path.reverse();
  return path;
}

export function lca(parent: Map<UUID, UUID | null>, a: UUID, b: UUID): UUID | null {
  const ancestors = new Set<UUID>();
  let cur: UUID | null = a;
  while (cur) {
    ancestors.add(cur);
    cur = parent.get(cur) ?? null;
  }
  cur = b;
  while (cur) {
    if (ancestors.has(cur)) return cur;
    cur = parent.get(cur) ?? null;
  }
  return null;
}

