export function gestaoWhatsapp(raw) {
  let phone = String(raw || '').replace(/\D/g, '');
  if (/^0055\d{10,11}$/.test(phone)) phone = phone.slice(2);
  if (/^\d{10,11}$/.test(phone)) phone = '55' + phone;
  return /^55[1-9]\d\d{8,9}$/.test(phone) ? phone : null;
}

export function gestaoWhatsappLabel(raw) {
  const phone = gestaoWhatsapp(raw);
  if (!phone) return raw || 'WhatsApp não informado';
  const national = phone.slice(2);
  return `(${national.slice(0, 2)}) ${national.slice(2, -4)}-${national.slice(-4)}`;
}

export function gestaoWhatsappUrl(raw, message = '') {
  const phone = gestaoWhatsapp(raw);
  return phone ? `https://wa.me/${phone}${message ? '?text=' + encodeURIComponent(message) : ''}` : null;
}

export function gestaoDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(value));
}
