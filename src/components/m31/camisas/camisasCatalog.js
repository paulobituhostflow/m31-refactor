// Catálogo compartilhado da Lojinha de Camisas — usado pela página pública
// e pelos blocos modulares (padrão Landing Page Builder).
export const MODELOS = [
  { id: 'milagres', nome: 'Milagres', frase: 'Hoje é um excelente dia para viver milagres.', cor_nome: 'Rosa', cor_hex: '#D99AA7', foto: '/assets/94af469c1_IMG_4182.png' },
  { id: 'jesus', nome: 'Jesus', frase: 'Aquele que te guarda não dorme.', foto: '/assets/943aab7e5_IMG_4181.png' },
  { id: 'filhas', nome: 'Filhas', frase: 'Eu sou filha. Eu sou amada. Eu sou escolhida.', cor_nome: 'Off-white', cor_hex: '#F3EEE7', foto: '/assets/b1844477d_IMG_4180.png',
    galeria: [
      '/assets/02b08d789_1C3079BE-EC98-43EE-827F-EEB520171806.png',
      '/assets/d6784c339_2C960CCB-D5E7-4AF9-9D27-2849D5305F67.png',
      '/assets/43f95c1f9_DCBB9F40-F6D7-49D7-B53D-BE40105E6BBE.png',
    ] },
];
export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
export const WHATSAPP_DULCE = '5581994060437';
export const MODELO_NOMES = { milagres: 'Milagres', jesus: 'Jesus', filhas: 'Filhas' };
export const CORES_LABELS = { preta: 'Preta', cereja: 'Cereja' };

export function nomeModelo(item) {
  const nome = MODELO_NOMES[item?.modelo] || item?.modelo || '';
  return item?.modelo === 'jesus' && item?.cor ? `${nome} (${CORES_LABELS[item.cor] || item.cor})` : nome;
}

export function maskPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Celular brasileiro válido: DDD (11–99) + 9 dígitos começando com 9.
// Valida os dígitos efetivamente informados, não a aparência da máscara.
export function whatsappValido(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 11 && Number(d.slice(0, 2)) >= 11 && d[2] === '9';
}

export function maskCpf(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

export function cpfValido(raw) {
  const cpf = String(raw || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (fat) => {
    let soma = 0, peso = fat;
    for (let i = 0; i < fat - 1; i++) soma += Number(cpf[i]) * peso--;
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(10) === Number(cpf[9]) && dv(11) === Number(cpf[10]);
}