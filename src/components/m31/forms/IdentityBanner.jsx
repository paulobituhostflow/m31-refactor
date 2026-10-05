
const BANNER_IMG = '/assets/0a854e687_IMG_9066.jpg';

/**
 * IdentityBanner — banner de identidade visual "filhas" no topo dos formulários públicos.
 */
export default function IdentityBanner() {
  return (
    <div style={{ margin: '0 0 16px', borderRadius: 10, overflow: 'hidden' }}>
      <img
        src={BANNER_IMG}
        alt="M31 Filhas — Imersão"
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  );
}