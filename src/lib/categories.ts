// Pluggy category catalog (130 categories) translated EN → PT-BR.
// Keyed by Pluggy categoryId for stability across description tweaks.
// See https://docs.pluggy.ai/docs/categorization

const CATEGORY_PT_BY_ID: Record<string, string> = {
  // 01 — Income
  "01000000": "Receitas",
  "01010000": "Salário",
  "01020000": "Aposentadoria",
  "01030000": "Atividade empreendedora",
  "01040000": "Auxílio governamental",
  "01050000": "Receita não recorrente",

  // 02 — Loans and financing
  "02000000": "Empréstimos e financiamentos",
  "02010000": "Juros de mora e cheque especial",
  "02020000": "Juros cobrados",
  "02030000": "Financiamento",
  "02030001": "Financiamento imobiliário",
  "02030002": "Financiamento de veículo",
  "02030003": "Crédito estudantil",
  "02040000": "Empréstimos",

  // 03 — Investments
  "03000000": "Investimentos",
  "03010000": "Investimento automático",
  "03020000": "Renda fixa",
  "03030000": "Fundos de investimento",
  "03040000": "Renda variável",
  "03050000": "Margem",
  "03060000": "Rendimentos, juros e dividendos",
  "03070000": "Previdência",

  // 04 — Same person transfer
  "04000000": "Transferência entre contas próprias",
  "04010000": "Conta própria — Dinheiro",
  "04020000": "Conta própria — PIX",
  "04030000": "Conta própria — TED",

  // 05 — Transfers
  "05000000": "Transferências",
  "05010000": "Boleto",
  "05020000": "Saque/Depósito em dinheiro",
  "05030000": "Cheque",
  "05040000": "DOC",
  "05050000": "Câmbio",
  "05060000": "Transferência interna",
  "05070000": "PIX",
  "05080000": "TED",
  "05090000": "Transferência a terceiros",
  "05090001": "Terceiros — Boleto",
  "05090002": "Terceiros — Débito",
  "05090003": "Terceiros — DOC",
  "05090004": "Terceiros — PIX",
  "05090005": "Terceiros — TED",
  "05100000": "Pagamento de cartão",

  // 06 — Legal obligations
  "06000000": "Obrigações legais",
  "06010000": "Saldo bloqueado",
  "06020000": "Pensão alimentícia",

  // 07 — Services
  "07000000": "Serviços",
  "07010000": "Telecomunicações",
  "07010001": "Internet",
  "07010002": "Telefonia móvel",
  "07010003": "TV",
  "07020000": "Educação",
  "07020001": "Cursos online",
  "07020002": "Faculdade",
  "07020003": "Escola",
  "07020004": "Educação infantil",
  "07030000": "Bem-estar e fitness",
  "07030001": "Academia",
  "07030002": "Práticas esportivas",
  "07030003": "Bem-estar",
  "07040000": "Eventos e ingressos",
  "07040001": "Estádios e arenas",
  "07040002": "Pontos turísticos e museus",
  "07040003": "Cinema, teatro e shows",

  // 08 — Shopping
  "08000000": "Compras",
  "08010000": "Compras online",
  "08020000": "Eletrônicos",
  "08030000": "Pet shop e veterinário",
  "08040000": "Vestuário",
  "08050000": "Infantil e brinquedos",
  "08060000": "Livraria",
  "08070000": "Esportes",
  "08080000": "Material de escritório",
  "08090000": "Cashback",

  // 09 — Digital services
  "09000000": "Serviços digitais",
  "09010000": "Games",
  "09020000": "Streaming de vídeo",
  "09030000": "Streaming de música",

  // 10 — Groceries
  "10000000": "Mercado",

  // 11 — Food and drinks
  "11000000": "Alimentação",
  "11010000": "Restaurantes",
  "11020000": "Delivery",

  // 12 — Travel
  "12000000": "Viagem",
  "12010000": "Aeroporto e companhias aéreas",
  "12020000": "Hospedagem",
  "12030000": "Programas de milhas",
  "12040000": "Passagens rodoviárias",

  // 13 — Donations
  "13000000": "Doações",

  // 14 — Gambling
  "14000000": "Apostas",
  "14010000": "Loteria",
  "14020000": "Apostas online",

  // 15 — Taxes
  "15000000": "Impostos",
  "15010000": "Imposto de renda",
  "15020000": "Imposto sobre investimentos",
  "15030000": "IOF",

  // 16 — Bank fees
  "16000000": "Tarifas bancárias",
  "16010000": "Tarifa de conta",
  "16020000": "Tarifas de transferência e saque",
  "16030000": "Tarifas de cartão",

  // 17 — Housing
  "17000000": "Casa",
  "17010000": "Aluguel",
  "17020000": "Contas da casa",
  "17020001": "Água",
  "17020002": "Energia",
  "17020003": "Gás",
  "17030000": "Utilidades domésticas",
  "17040000": "IPTU",

  // 18 — Healthcare
  "18000000": "Saúde",
  "18010000": "Dentista",
  "18020000": "Farmácia",
  "18030000": "Ótica",
  "18040000": "Clínicas e laboratórios",

  // 19 — Transportation
  "19000000": "Transporte",
  "19010000": "Táxi e apps",
  "19020000": "Transporte público",
  "19030000": "Aluguel de carro",
  "19040000": "Bicicleta",
  "19050000": "Carro",
  "19050001": "Combustível",
  "19050002": "Estacionamento",
  "19050003": "Pedágio",
  "19050004": "IPVA e taxas do veículo",
  "19050005": "Manutenção do veículo",
  "19050006": "Multas",

  // 20 — Insurance
  "20000000": "Seguros",
  "200100000": "Seguro de vida",
  "200200000": "Seguro residencial",
  "200300000": "Plano de saúde",
  "200400000": "Seguro de veículo",

  // 21 — Leisure
  "21000000": "Lazer",

  // 99 — Other
  "99999999": "Outros",
};

// Fallback by English name (case-insensitive) for cases where id is missing/changed.
const CATEGORY_PT_BY_NAME: Record<string, string> = Object.fromEntries(
  // Build a denormalized mirror keyed by English description for resilience.
  // We don't have the English names typed here; instead provide a small
  // override list of well-known English names → PT for safety:
  Object.entries({
    Income: "Receitas",
    Salary: "Salário",
    "Same person transfer": "Transferência entre contas próprias",
    Transfers: "Transferências",
    "Transfer - PIX": "PIX",
    "Transfer - TED": "TED",
    "Credit card payment": "Pagamento de cartão",
    Services: "Serviços",
    Shopping: "Compras",
    "Online shopping": "Compras online",
    Electronics: "Eletrônicos",
    Clothing: "Vestuário",
    Bookstore: "Livraria",
    "Office supplies": "Material de escritório",
    "Sports goods": "Esportes",
    Cashback: "Cashback",
    "Digital services": "Serviços digitais",
    "Video streaming": "Streaming de vídeo",
    Groceries: "Mercado",
    "Food and drinks": "Alimentação",
    "Eating out": "Restaurantes",
    "Food delivery": "Delivery",
    Travel: "Viagem",
    Accomodation: "Hospedagem",
    "Mileage programs": "Programas de milhas",
    Gambling: "Apostas",
    Donations: "Doações",
    Taxes: "Impostos",
    "Tax on financial operations": "IOF",
    "Bank fees": "Tarifas bancárias",
    "Credit card fees": "Tarifas de cartão",
    Housing: "Casa",
    Rent: "Aluguel",
    Utilities: "Contas da casa",
    Electricity: "Energia",
    Houseware: "Utilidades domésticas",
    Healthcare: "Saúde",
    Pharmacy: "Farmácia",
    Dentist: "Dentista",
    "Hospital clinics and labs": "Clínicas e laboratórios",
    Transportation: "Transporte",
    "Taxi and ride-hailing": "Táxi e apps",
    "Car rental": "Aluguel de carro",
    Automotive: "Carro",
    "Gas stations": "Combustível",
    Parking: "Estacionamento",
    "Tolls and in vehicle payment": "Pedágio",
    "Vehicle ownership taxes and fees": "IPVA e taxas do veículo",
    "Vehicle maintenance": "Manutenção do veículo",
    Insurance: "Seguros",
    "Health insurance": "Plano de saúde",
    Leisure: "Lazer",
    Telecommunications: "Telecomunicações",
    Internet: "Internet",
    TV: "TV",
    School: "Escola",
    "Wellness and fitness": "Bem-estar e fitness",
    "Gyms and fitness centers": "Academia",
    Tickets: "Eventos e ingressos",
    Investments: "Investimentos",
    "Automatic investment": "Investimento automático",
    "Proceeds interests and dividends": "Rendimentos, juros e dividendos",
    "Loans and financing": "Empréstimos e financiamentos",
    "Late payment and overdraft costs": "Juros de mora e cheque especial",
    "Interests charged": "Juros cobrados",
    "Entrepreneurial activities": "Atividade empreendedora",
    Other: "Outros",
  }).map(([k, v]) => [k.toLowerCase(), v]),
);

/**
 * Translates a Pluggy category to PT-BR.
 * Prefers id-based lookup (stable), falls back to English-name match,
 * and finally returns the original string when unknown.
 */
export function translateCategory(
  id?: string | null,
  englishName?: string | null,
): string | null {
  if (id && CATEGORY_PT_BY_ID[id]) return CATEGORY_PT_BY_ID[id];
  if (englishName) {
    const hit = CATEGORY_PT_BY_NAME[englishName.trim().toLowerCase()];
    if (hit) return hit;
    return englishName;
  }
  return null;
}
