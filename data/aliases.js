// Distribuidoras conhecidas: slug amigável (usado por apps) -> sigla da ANEEL (SigAgente) e nome de exibição.
// A ANEEL registra a Energisa Paraíba como "EPB", por exemplo. Quem não está aqui usa a sigla da ANEEL como slug.
// `apelidos` aceitam outras grafias de slug na consulta.
export default [
  { slug: 'energisa-pb', sigla: 'EPB', nome: 'Energisa Paraíba', apelidos: ['energisa-paraiba'] },
  { slug: 'energisa-ms', sigla: 'EMS', nome: 'Energisa Mato Grosso do Sul', apelidos: ['energisa-mato-grosso-do-sul'] },
  { slug: 'energisa-mt', sigla: 'EMT', nome: 'Energisa Mato Grosso', apelidos: ['energisa-mato-grosso'] },
  { slug: 'energisa-ro', sigla: 'ERO', nome: 'Energisa Rondônia', apelidos: ['energisa-rondonia'] },
  { slug: 'energisa-ac', sigla: 'EAC', nome: 'Energisa Acre', apelidos: ['energisa-acre'] },
  { slug: 'energisa-se', sigla: 'ESE', nome: 'Energisa Sergipe', apelidos: ['energisa-sergipe'] },
  { slug: 'energisa-to', sigla: 'ETO', nome: 'Energisa Tocantins', apelidos: ['energisa-tocantins'] },
  { slug: 'energisa-sul-sudeste', sigla: 'ESS', nome: 'Energisa Sul-Sudeste', apelidos: [] },
  { slug: 'energisa-mg', sigla: 'EMR', nome: 'Energisa Minas Rio', apelidos: ['energisa-minas-rio'] },
  { slug: 'cemig', sigla: 'CEMIG-D', nome: 'Cemig', apelidos: ['cemig-d'] },
  { slug: 'enel-sp', sigla: 'ELETROPAULO', nome: 'Enel São Paulo', apelidos: ['eletropaulo'] },
  { slug: 'enel-rj', sigla: 'ENEL RJ', nome: 'Enel Rio', apelidos: [] },
  { slug: 'enel-ce', sigla: 'ENEL CE', nome: 'Enel Ceará', apelidos: [] },
  { slug: 'light', sigla: 'LIGHT SESA', nome: 'Light', apelidos: ['light-sesa'] },
  { slug: 'cpfl-paulista', sigla: 'CPFL-PAULISTA', nome: 'CPFL Paulista', apelidos: [] },
  { slug: 'copel', sigla: 'COPEL-DIS', nome: 'Copel', apelidos: ['copel-dis'] },
  { slug: 'celesc', sigla: 'CELESC', nome: 'Celesc', apelidos: [] },
  { slug: 'coelba', sigla: 'COELBA', nome: 'Neoenergia Coelba', apelidos: [] },
  { slug: 'celpe', sigla: 'Neoenergia PE', nome: 'Neoenergia Pernambuco', apelidos: ['neoenergia-pe'] },
  { slug: 'cosern', sigla: 'COSERN', nome: 'Neoenergia Cosern', apelidos: [] },
  { slug: 'neoenergia-brasilia', sigla: 'Neoenergia Brasília', nome: 'Neoenergia Brasília', apelidos: [] },
  { slug: 'equatorial-pa', sigla: 'EQUATORIAL PA', nome: 'Equatorial Pará', apelidos: [] },
  { slug: 'equatorial-ma', sigla: 'EQUATORIAL MA', nome: 'Equatorial Maranhão', apelidos: [] },
  { slug: 'rge', sigla: 'RGE', nome: 'RGE Sul', apelidos: [] },
];
