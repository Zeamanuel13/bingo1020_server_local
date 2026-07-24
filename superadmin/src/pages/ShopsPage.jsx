import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const STALE_AFTER_HOURS = 24;

function isStale(shop) {
  if (!shop.lastSyncAt) return true;
  const hours = (Date.now() - new Date(shop.lastSyncAt).getTime()) / 3600000;
  return hours > STALE_AFTER_HOURS;
}

export default function ShopsPage() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdShop, setCreatedShop] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setShops(await api.get('/shops'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(shop) {
    const nextStatus = shop.status === 'active' ? 'suspended' : 'active';
    if (nextStatus === 'suspended' && !confirm(`Suspend ${shop.name}? Its local server will stop being able to sync uploads (its local data keeps working normally).`)) {
      return;
    }
    await api.patch(`/shops/${shop.id}`, { status: nextStatus });
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Shops</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New shop</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td><Link to={`/shops/${shop.id}`}>{shop.name}</Link></td>
                  <td>{shop.location}</td>
                  <td>{shop.contactPhone}</td>
                  <td>
                    <span className={`badge ${shop.status === 'active' ? 'badge-active' : 'badge-suspended'}`}>
                      {shop.status}
                    </span>
                  </td>
                  <td>
                    {shop.lastSyncAt ? new Date(shop.lastSyncAt).toLocaleString() : 'Never'}
                    {isStale(shop) && <span className="badge badge-stale" style={{ marginLeft: 6 }}>stale</span>}
                  </td>
                  <td>
                    <button className="btn" onClick={() => toggleStatus(shop)}>
                      {shop.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr><td colSpan={6}>No shops yet — create one to get started.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateShopModal
          onClose={() => setShowCreate(false)}
          onCreated={(shop) => {
            setShowCreate(false);
            setCreatedShop(shop);
            load();
          }}
        />
      )}

      {createdShop && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Shop created: {createdShop.name}</h3>
            <p>Give these to whoever is setting up this shop's local server (its <code>.env</code> file). This key is shown only once.</p>
            <label>SHOP_ID</label>
            <div className="key-display">{createdShop.id}</div>
            <label>CLOUD_SYNC_API_KEY</label>
            <div className="key-display">{createdShop.syncApiKey}</div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setCreatedShop(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateShopModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const shop = await api.post('/shops', { name, location, contactPhone });
      onCreated(shop);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={handleSubmit}>
        <h3 style={{ marginTop: 0 }}>New shop</h3>
        {error && <div className="error-banner">{error}</div>}
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <label>Location</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
        <label>Contact phone</label>
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
