// pathlinks.js — les indications écrites comme « Paramètres › Notifications et rappels » ou « Profil › Mes lieux »
// deviennent des liens colorés : un toucher emmène sur la page. Chaque partie de l'app déclare ses pages
// (registerPaths) ; seules les pages connues sont liées, le texte reste identique. Les boutons, liens, champs et
// titres de rubrique (<summary>) ne sont jamais touchés.
const SECTIONS = new Map();
/** section : libellé écrit (« Paramètres ») ; tab : onglet ; pages : [[libellé de la page, sous-page], …]. */
export function registerPaths(section, tab, pages) {
  SECTIONS.set(section, { tab, pages: pages.filter(([label, sub]) => label && sub).sort((a, b) => b[0].length - a[0].length) });
}
const SKIP = 'a,button,summary,label,option,select,textarea,input,code,pre,.pathlink,[contenteditable],script,style,.tour-copy';
const pattern = () => new RegExp(`(${[...SECTIONS.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}) › `, 'g');
/** Transforme les indications de chemin d'un écran en liens (à appeler après chaque rendu). */
export function linkPaths(root) {
  if (!root || !SECTIONS.size || typeof document === 'undefined') return 0;
  const test = pattern(), nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { test.lastIndex = 0; return test.test(n.nodeValue) && !n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let made = 0;
  for (const node of nodes) {
    const text = node.nodeValue, rx = pattern(), frag = document.createDocumentFragment();
    let from = 0, m, changed = false;
    while ((m = rx.exec(text))) {
      const sec = SECTIONS.get(m[1]), rest = text.slice(m.index + m[0].length), page = sec.pages.find(([label]) => rest.startsWith(label));
      if (!page) continue;
      frag.append(text.slice(from, m.index));
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pathlink'; b.dataset.act = 'goPath'; b.dataset.to = `${sec.tab}/${page[1]}`;
      b.textContent = m[0] + page[0]; b.title = 'Ouvrir cette page';
      frag.append(b); from = m.index + m[0].length + page[0].length; rx.lastIndex = from; changed = true; made++;
    }
    if (!changed) continue;
    frag.append(text.slice(from)); node.replaceWith(frag);
  }
  return made;
}
