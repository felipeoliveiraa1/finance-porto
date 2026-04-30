// Auto-categorization rules — derived from Milena's spreadsheet taxonomy
// (`fatura_compras_MI.xlsx`, all monthly tabs). Each rule maps a merchant
// pattern (or a description pattern) to a `Category` name. The engine runs
// rules in order and picks the first match — order matters when more specific
// rules should win over generic ones (e.g. "MERCADO LIVRE - BERÇO" → HELENA
// before the generic "MERCADO LIVRE" → SHOPEE rule).
//
// We keep rules in code rather than in the DB so they're easy to review,
// version, and tweak. The rule engine is also pure — call `categorizeOne()`
// without DB access for testing.

import { db } from "./db";

export type CategoryDef = {
  name: string;
  emoji: string;
  // Optional Pluggy categoryId hint for cross-linking; informational only.
  pluggyHint?: string;
};

// Categories — the household taxonomy. Names are PT-BR; emojis match each
// theme so the dashboard chips are visually distinguishable.
export const CATEGORIES: CategoryDef[] = [
  { name: "Moradia", emoji: "🏠", pluggyHint: "13" },
  { name: "Alimentação", emoji: "🍽️", pluggyHint: "08010000" },
  { name: "Mercado", emoji: "🛒", pluggyHint: "08020000" },
  { name: "Saúde", emoji: "🏥", pluggyHint: "11" },
  { name: "Farmácia", emoji: "💊" },
  { name: "Dentista", emoji: "🦷" },
  { name: "Helena", emoji: "👶" },
  { name: "Escolar", emoji: "📚" },
  { name: "Vestuário", emoji: "👕" },
  { name: "Beleza", emoji: "💅" },
  { name: "Casa", emoji: "🛋️" },
  { name: "Móveis", emoji: "🛏️" },
  { name: "Tecnologia", emoji: "💻" },
  { name: "Assinatura", emoji: "🔁" },
  { name: "Shopee", emoji: "🛍️" },
  { name: "Mercado Livre", emoji: "📦" },
  { name: "Combustível", emoji: "⛽" },
  { name: "Transporte", emoji: "🚗" },
  { name: "Carro", emoji: "🚘" },
  { name: "PS5/Jogos", emoji: "🎮" },
  { name: "Empréstimo", emoji: "💳" },
  { name: "MEI", emoji: "📑" },
  { name: "Convênio", emoji: "🩺" },
  { name: "Energia", emoji: "💡" },
  { name: "Internet", emoji: "📶" },
  { name: "Hospital", emoji: "🚑" },
  { name: "Lazer", emoji: "🎬" },
  { name: "Viagem", emoji: "✈️" },
  { name: "Taxa Cartão", emoji: "💸" },
  { name: "Outros", emoji: "📌" },
];

type Rule = {
  // Display name of the matched category (must exist in CATEGORIES above).
  category: string;
  // Regex applied case-insensitively against `${description} ${merchantName}`.
  match: RegExp;
};

// Order: more specific FIRST. The engine returns on first match.
// Style notes:
//   - We use `\b<token>` at the START only, not at the end, because Pluggy
//     concatenates merchant data into camelCase strings ("SayuriComercioDe")
//     where a trailing `\b` would fail. Substrings starting at a word boundary
//     are precise enough to avoid false positives.
const RULES: Rule[] = [
  // --- People / aliases ---
  { category: "Moradia", match: /\bnoratha/i },

  // --- Internal transfers (Felipe ↔ Milena) — categorize for completeness;
  //     these are also filtered out of KPIs by internal-transfer.ts ---
  { category: "Outros", match: /pix\s+enviado.*(felipe porto|milena.*generoz|generozo.*milena)/i },
  { category: "Outros", match: /transfer[eê]ncia\s+enviada.*(felipe porto|milena.*generoz)/i },

  // --- Helena (baby items) — match before generic clothing/marketplace rules ---
  { category: "Helena", match: /\b(duda e co|satikocomercio|lellis baby|flor de abril|michely presentes|saida maternidade|bercin?o|ber[çc]o|carrinho beb|trocador|saidinha|lojinha bb|loja bebe|enxoval|chupeta|fralda|babador|baby ?center|maternidade)/i },
  { category: "Helena", match: /\bhelena/i },

  // --- Saúde / Hospital / Dentista (specific before generic) ---
  { category: "Hospital", match: /\b(lavoisier|hospitallis|hospitalis|syn solu)/i },
  { category: "Dentista", match: /\b(dentista|evo\s*uai|evo\*uai|odontologia|odonto)/i },
  { category: "Saúde", match: /\b(dr consulta|consulta m[eé]dica|ortop|cardio|gineco|laborat[oó]rio|delboni)/i },
  { category: "Farmácia", match: /\b(droga|drogasil|pacheco|raia|drogaria|unimed farm|farm[aá]cia|panvel|pague menos|sao joao|onofre)/i },

  // --- Convênio / saúde recorrente — keep before "saúde" generic ---
  { category: "Convênio", match: /\b(unimed|amil|sulamerica|sul am[eé]rica|hapvida|conv[eê]nio|porto seguro saude|bradesco saude)/i },

  // --- Telecom / utilities ---
  { category: "Internet", match: /\b(claro\b|vivo\b|tim\s|tim\b|oi fibra|oi tv|net\b|net combo|internet|live\s*tim|nextel)/i },
  { category: "Energia", match: /\b(enel|eletropaulo|energia el[eé]trica|cpfl|eletro pau|comgas|sabesp|copel|cemig|light)/i },

  // --- Tecnologia / serviços digitais ---
  { category: "Tecnologia", match: /\b(canva|hostinger|paypal\s*\*?\s*contabo|aws|google|github|notion|figma|replicate|claude|chat\s*gpt|openai|cursor\b|linear\b|vercel|nordvpn|expressvpn|cloudflare|namecheap|godaddy|registro\.br)/i },
  // Apple = subscription bills; Amazon = shopping (split intentionally — Amazon
  // is too broad to be just "tecnologia").
  { category: "Assinatura", match: /\b(spotify|netflix|disney plus|hbo max|apple\.com\/bill|apple servic|apple\b|prime video|youtube premium|deezer|globoplay|paramount)/i },

  // --- Combustível / Carro ---
  { category: "Combustível", match: /\b(posto\s|posto\b|shell|ipiranga|petrobr[aá]s|petrobras|combust|gasolina|alesat|raizen|br mania|am pm)/i },
  { category: "Carro", match: /\b(estacionamento|estacion|pedágio|pedagio|sem parar|veloe|conectcar|move mais|ipva|licenciamento|detran|seguro auto|oficina|mec[aâ]nico|z park|park|zona azul|cetzul|estap)/i },
  { category: "Transporte", match: /\b(uber|99\s*pop|99app|99\s*tax|cabify|bilhete [uú]nico|metr[oô]|cptm|emtu|9\d\s*fast)/i },

  // --- Móveis (lojas departamento + grandes) — antes de "Casa" e "Mercado" ---
  { category: "Móveis", match: /\b(casas bahia|casasbahia|magazine luiza|magalu|ponto frio|americanas|submarino|fastshop|leroy|tok&stok|tokstok|etna|havan|colch[aã]o|sof[aá]\b|mesa\b)/i },

  // --- Casa (artigos pra casa, supermercado de bairro) ---
  { category: "Casa", match: /\b(super\s*big|superbig|leroy merlin|casa\s*&\s*v[ií]deo|casa\s*v[ií]deo|amig[aã]o|polish|tudo aqui)/i },

  // --- Mercado / supermercado (cadeia + bairro) ---
  { category: "Mercado", match: /\b(assa[ií]|sams club|carrefour|p[aã]o de a[cç][uú]car|extra\b|big bompre[cç]o|atacad[aã]o|st\s*marche|sondas?|mambo|hortifruti|barbosa|ael\s*merc|aelmerc|mercado boa vista|imperatriz carnes|imperatrizcarnes|seara aliment|seara\b|minuto\s*pa\b|minuto\s*pa|casotti|casottisouza|frangolandia|hirota|natural da terra|seccazzini|rio negro derivados|conveniencia\b)/i },

  // --- Alimentação (delivery / restaurantes / bares / cafés / sorveteria) ---
  { category: "Alimentação", match: /\b(ifd\*|ifd_|ifood|i\*food|99food|rappi|burger king|mc\s*donald|mcdonald|subway|outback|spoleto|china in box|coco bambu|madero|habibs|giraffas|pizz|temaki|sush|hambur|alpha beer|deli\b|rio negro grill|brasaria|burger|pizzeria|restaurante|rotisserie|bar do|alpha center servicos|gourmet express|bacio di latte|cafe\s|caf[eé]\b|cafeteria|sorveteria|sorvete|dona pimenta|cafe pele|arfco|adeniltonlima|adenilton lima|market4u|mercado4u|lepok)/i },

  // --- Beleza / Perfumaria — antes de Vestuário ---
  { category: "Beleza", match: /\b(mahogany|natura|granado|boticario|o\s*boticario|sephora|spa|cabeleireiro|sal[aã]o|esmalte|maquiagem|perfumaria|ricardo cosmeticos|ricardo comesticos|anelita|lejah|jequiti|eudora|avon)/i },

  // --- Vestuário (lojas e marcas) ---
  { category: "Vestuário", match: /\b(c\s*pernambucanas|pernambucanas|zara\b|renner|c\s*&\s*a\b|c\s*e\s*a\b|caedu|aninhastore|aninha\s*store|tunoda|sayuri|confortmax|riachuelo|hering|polo wear|forever 21|melissa|nike\s*store|adidas\s*store|loja 41|dona bacana|fio trama|terno|youcom|le lis blanc)/i },

  // --- Educação ---
  { category: "Escolar", match: /\b(grupo mari|livro facil|material escolar|kalunga|papelaria|mapa\s*livro|escola helena)/i },

  // --- Marketplaces — depois das categorias específicas ---
  { category: "Shopee", match: /\bshopee/i },
  { category: "Mercado Livre", match: /\b(mercado\s*livre|mercadolivre|mercadolibre|meli\b|mercadopago)/i },

  // --- Lazer / Viagem ---
  { category: "Lazer", match: /\b(cinemark|cinepolis|kinoplex|ingresso|ticketmaster|sympla|eventim)/i },
  { category: "Viagem", match: /\b(latam|gol\s*linhas|azul\s*linhas|cvc\b|decolar|booking|airbnb|hotel\b|hospedagem|aeroporto|hertz|localiza|movida|99rentcar)/i },

  // --- PS5/Jogos ---
  { category: "PS5/Jogos", match: /\b(playstation|psn|sony entertainment|steam|jogos?\s*ps|xbox\b|nintendo|aliexpress.*teclado|epic games)/i },

  // --- MEI / Empréstimo / Impostos ---
  { category: "MEI", match: /\b(mei\s+simples|simples nacional|sefaz|receita federal|ministerio da fazenda|prefeitura)/i },
  { category: "Empréstimo", match: /\b(empr[eé]stimo|cred lar|crefisa|bmg|caixa cred)/i },

  // --- Taxa Cartão / IOF / tarifas bancárias ---
  { category: "Taxa Cartão", match: /\b(anuidade|taxa\s+cart[aã]o|tarifa\s*cesta|tarifa\s*manuten[cç][aã]o|iof\b|imposto operacoes financeiras|compra internacional)/i },

  // --- Bill payments / IPTU / impostos municipais ---
  // Categorize as "Outros" so they're not blank in the UI; bill payments are
  // already filtered out of expense KPIs by internal-transfer.ts.
  { category: "Outros", match: /\bpagamento\s+de\s+(fatura|boleto)/i },
  { category: "Outros", match: /\bdebito\s+aut\b.*fat/i },
  { category: "Taxa Cartão", match: /\biptu|prefeitura|munic[ií]pio de|municipio de/i },

  // --- Pagamento de fatura / boleto / outros não-categorizáveis ---
  // Demais casos viram "Sem categoria" no dashboard. Usuário edita manualmente.
];

/**
 * Returns the matched category name or null. Used for rule-engine tests and
 * for the "preview" mode of the recategorize script.
 */
export function categorizeOne(opts: {
  description: string;
  merchantName?: string | null;
  pluggyCategoryId?: string | null;
}): string | null {
  const haystack = `${opts.description ?? ""} ${opts.merchantName ?? ""}`;
  for (const r of RULES) {
    if (r.match.test(haystack)) return r.category;
  }
  return null;
}

/**
 * Idempotent: ensures every CATEGORIES entry exists in the DB and returns
 * a name → id map. Safe to run on every sync.
 */
export async function ensureCategories(): Promise<Record<string, string>> {
  const existing = await db.category.findMany();
  const byName = new Map(existing.map((c) => [c.name, c.id]));

  for (const def of CATEGORIES) {
    if (!byName.has(def.name)) {
      const created = await db.category.create({
        data: { name: def.name, emoji: def.emoji },
      });
      byName.set(def.name, created.id);
    }
  }
  return Object.fromEntries(byName);
}
