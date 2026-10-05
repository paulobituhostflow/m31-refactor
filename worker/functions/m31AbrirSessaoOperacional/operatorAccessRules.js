const INTERNAL_SCOPES = [
  { aliases: ['thaysa', 'thaisa videres', 'thaysa videres'], operations: ['inscritas', 'caravanas'] },
  { aliases: ['thalita', 'talita', 'paulo'], operations: ['inscritas', 'voluntarias', 'caravanas', 'camisas'] },
  { aliases: ['dulce'], operations: ['camisas'] },
  { aliases: ['edilandia'], operations: ['voluntarias'] },
];

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function resolveOperationalScope(name) {
  const normalized = normalizeName(name);
  const match = INTERNAL_SCOPES.find(({ aliases }) =>
    aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `)),
  );
  return match ? [...match.operations] : [];
}