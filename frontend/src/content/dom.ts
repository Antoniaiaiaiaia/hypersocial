type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...kids: SVGElement[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
}

/** Leaf element whose trimmed text is exactly `label`. */
export function findLeaf(label: string, root: ParentNode = document.body): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue?.trim() === label) {
      const el = n.parentElement;
      if (el && !el.closest('[data-hypersocial]')) return el;
    }
  }
  return null;
}

/**
 * HL tab bar: find the tab element for `a` such that a sibling contains `b`.
 * Returns { tab (an existing tab for `a`), bar (their parent) }.
 */
export function findTabBar(a: string, b: string): { tab: HTMLElement; bar: HTMLElement } | null {
  const leaf = findLeaf(a);
  if (!leaf) return null;
  for (let tab: HTMLElement | null = leaf; tab && tab.parentElement; tab = tab.parentElement) {
    const bar = tab.parentElement;
    if ([...bar.children].some((c) => c !== tab && c.textContent?.trim() === b)) return { tab, bar };
    if (tab.getBoundingClientRect().height > 80) break;
  }
  return null;
}

/**
 * Coin on screen. HL's `/trade` (no coin in the path) shows the last-used coin, so the URL alone is
 * not enough: read the tab title first ("68.695 | HYPE | Hyperliquid"), then the path.
 */
export function coinFromPage(): string | null {
  const t = /\|\s*([^|]+?)\s*\|\s*Hyperliquid\s*$/i.exec(document.title);
  if (t) return t[1].split(/[/-]/)[0].trim().toUpperCase();
  const m = /\/trade\/([^/?#]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]).split(/[/-]/)[0].toUpperCase() : null;
}

/** "HYPERLIQUID:HYPEUSD" -> "HYPE" */
export function coinFromSymbol(sym: string): string {
  return (sym.split(':').pop() ?? '').replace(/USDC?$|USDT$|-PERP$/i, '').toUpperCase();
}
