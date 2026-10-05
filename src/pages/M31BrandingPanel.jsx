import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { M31Logo, invalidateBrandCache } from '@/components/M31Logo';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';

export default function M31BrandingPanel() {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    logo_url: '',
    logo_dark_url: '',
    logo_alt: 'M31 Filhas',
  });

  useEffect(() => {
    loadBrand();
  }, []);

  async function loadBrand() {
    setLoading(true);
    try {
      const items = await base44.entities.BrandSettings.list();
      if (items?.length > 0) {
        setCurrent(items[0]);
        setForm({
          logo_url: items[0].logo_url || '',
          logo_dark_url: items[0].logo_dark_url || '',
          logo_alt: items[0].logo_alt || 'M31 Filhas',
        });
      }
    } catch (e) {
      console.error('Erro ao carregar BrandSettings', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e, field) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação frontend
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo excede 2MB');
      return;
    }

    const allowedTypes = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formatos permitidos: SVG, PNG, JPG, WebP');
      return;
    }

    try {
      setSaving(true);
      const result = await base44.integrations.Core.UploadFile({ file, public: true, purpose: 'branding' });
      if (result?.file_url) {
        setForm(f => ({ ...f, [field]: result.file_url }));
        toast.success('Arquivo enviado com sucesso');
      }
    } catch (error) {
      toast.error('Erro ao fazer upload');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!form.logo_url.trim()) {
      toast.error('Logo principal é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const user = await base44.auth.me();
      const data = {
        ...form,
        updated_by_id: user.id,
      };

      // AJUSTE #3: UPSERT (singleton enforcement)
      if (current?.id) {
        await base44.entities.BrandSettings.update(current.id, data);
      } else {
        await base44.entities.BrandSettings.create(data);
      }

      // AJUSTE #5: Invalidar cache e disparar evento
      invalidateBrandCache();
      window.dispatchEvent(new CustomEvent('m31-brand-updated', { detail: { logoUrl: form.logo_url } }));

      toast.success('Branding atualizado com sucesso!');
      loadBrand();
    } catch (error) {
      toast.error('Erro ao salvar branding');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '20px' }}>
      <h1>Gerenciamento de Branding M31</h1>

      {/* SEÇÃO 1: Logo Principal */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2>Logo Principal</h2>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '12px', textAlign: 'center', border: '1px solid #e0e0e0' }}>
          {form.logo_url ? (
            <M31Logo size="xl" />
          ) : (
            <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Sem logo
            </div>
          )}
        </div>

        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          Selecionar novo logo:
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#8B1A2B', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'Inter, sans-serif', marginBottom: '8px', position: 'relative' }}>
          <Upload size={15} /> {saving ? 'Enviando...' : 'Escolher arquivo'}
          <input
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp"
            onChange={e => handleUpload(e, 'logo_url')}
            disabled={saving}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
        <small style={{ color: '#666', display: 'block' }}>Formatos: SVG, PNG, JPG, WebP (máx. 2MB)</small>
      </div>

      {/* SEÇÃO 2: Logo Dark */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2>Logo Dark (Opcional)</h2>
        <div style={{ background: '#333', padding: '20px', borderRadius: '8px', marginBottom: '12px', textAlign: 'center', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {form.logo_dark_url ? (
            <M31Logo size="lg" variant="dark" />
          ) : (
            <div style={{ color: '#999' }}>Sem logo dark</div>
          )}
        </div>

        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          Selecionar novo logo dark:
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#8B1A2B', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'Inter, sans-serif', marginBottom: '8px', position: 'relative' }}>
          <Upload size={15} /> {saving ? 'Enviando...' : 'Escolher arquivo'}
          <input
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp"
            onChange={e => handleUpload(e, 'logo_dark_url')}
            disabled={saving}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
      </div>

      {/* SEÇÃO 3: Alt Text */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2>Texto Alternativo (Acessibilidade)</h2>
        <input
          type="text"
          value={form.logo_alt}
          onChange={e => setForm(f => ({ ...f, logo_alt: e.target.value }))}
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
          placeholder="M31 Filhas"
        />
        <small style={{ color: '#666', display: 'block', marginTop: '6px' }}>Usado em leitores de tela</small>
      </div>

      {/* SEÇÃO 4: Histórico */}
      {current && (
        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
          <h2>Informações</h2>
          <p style={{ margin: '6px 0', fontSize: '14px', color: '#666' }}>
            <strong>ID:</strong> {current.id}
          </p>
          <p style={{ margin: '6px 0', fontSize: '14px', color: '#666' }}>
            <strong>Última atualização:</strong> {new Date(current.updated_date).toLocaleString('pt-BR')}
          </p>
          {current.updated_by_id && (
            <p style={{ margin: '6px 0', fontSize: '14px', color: '#666' }}>
              <strong>Atualizado por:</strong> {current.updated_by_id}
            </p>
          )}
        </div>
      )}

      {/* BOTÕES */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#8B1A2B',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Salvando...' : '✓ Salvar'}
        </button>
        <button
          onClick={loadBrand}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#e0e0e0',
            color: '#333',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          ⟲ Cancelar
        </button>
      </div>
    </div>
  );
}