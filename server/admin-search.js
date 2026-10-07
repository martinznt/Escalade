// Recherche commune : uniquement les collections ouvertes par les rôles vérifiés du compte.
const fold = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const allowed = (user, role) => user?.isAdmin && user.roles?.some((r) => r === 'super' || r === role);
const sqlFold = (column) => {
  let expression = `LOWER(${column})`;
  for (const [letters, replacement] of [['éèêëÉÈÊË','e'],['àâäÀÂÄ','a'],['îïÎÏ','i'],['ôöÔÖ','o'],['ùûüÙÛÜ','u'],['çÇ','c']]) for (const letter of letters) expression = `REPLACE(${expression},'${letter}','${replacement}')`;
  return expression;
};
export async function searchAdmin(env, user, query, { library = [], catalog = [], faq = [] } = {}) {
  const words = fold(String(query || '').slice(0, 80)).split(' ').filter(Boolean).slice(0, 6);
  if (!words.length || words.join('').length < 2) return [];
  const results = [], matches = (text) => words.every((word) => fold(text).includes(word));
  const read = async (table, columns, expression, suffix = '') => {
    const sql = `SELECT ${columns} FROM ${table} WHERE ${words.map(() => `${sqlFold(expression)} LIKE ?`).join(' AND ')} ${suffix} LIMIT 20`;
    return (await env.DB.prepare(sql).bind(...words.map((word) => '%' + word + '%')).all()).results || [];
  };
  const add = (kind, id, title, detail = '') => results.push({ kind, id, title: String(title || id).slice(0, 180), detail: String(detail || '').slice(0, 180) });
  if (allowed(user, 'content')) {
    for (const row of await read('global_content', 'kind,id,data_json,hidden', "kind || ' ' || id || ' ' || data_json")) {
      let data = {}; try { data = JSON.parse(row.data_json); } catch { /* ancienne fiche mal formée */ }
      add('content', row.kind + ':' + row.id, data.name || data.label || data.title || data.q || row.id, row.kind + (row.hidden ? ' · masqué' : ' · publié'));
    }
    for (const row of await read('change_sets', 'id,title,status', "title || ' ' || note", 'ORDER BY updated_at DESC')) add('studio', row.id, row.title, row.status);
    for (const row of await read('proposals', 'id,label,kind,status', "label || ' ' || detail", 'ORDER BY created_at DESC')) add('proposal', row.id, row.label, row.kind + ' · ' + row.status);
    for (const row of library) if (!row.hidden && matches([row.name, row.group, ...(row.muscles || [])].join(' '))) add('exercise', row.id, row.name, 'Exercice de la bibliothèque');
    for (const row of catalog) if (matches([row.name, row.why, ...(row.goals || [])].join(' '))) add('catalog', row.id, row.name, 'Séance prête');
    for (const row of faq) if (matches(row.join(' '))) add('help', String(faq.indexOf(row)), row[0], 'Aide');
  }
  if (allowed(user, 'technical')) for (const row of await read('bug_reports', 'id,title,page,status', "title || ' ' || description || ' ' || page", 'ORDER BY created_at DESC')) add('bug', row.id, row.title, row.page + ' · ' + row.status);
  if (allowed(user, 'users')) for (const row of await read('users', 'id,username', 'username', 'ORDER BY created_at DESC')) add('user', row.id, row.username, 'Compte');
  const counts = {};
  return results.filter((row) => { counts[row.kind] = (counts[row.kind] || 0) + 1; return counts[row.kind] <= 12; }).slice(0, 100);
}
