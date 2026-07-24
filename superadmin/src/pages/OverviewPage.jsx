import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const STALE_AFTER_HOURS = 24;

function isStale(shop) {
  if (!shop.lastSyncAt) return true;
  const hours = (Date.now() - new Date(shop.lastSyncAt).getTime()) / 3600000;
  return hours > STALE_AFTER_HOURS;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get(`/reports/overview?from=${from}&to=${to}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const staleShops = (data?.perShop || []).filter(isStale);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Cross-shop Reports</h2>

      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="value">{data.totals.gamesPlayed}</div><div className="label">Games played</div></div>
            <div className="stat"><div className="value">{data.totals.cardsSold}</div><div className="label">Cards sold</div></div>
            <div className="stat"><div className="value">{data.totals.totalRevenue}</div><div className="label">Revenue</div></div>
            <div className="stat"><div className="value">{data.totals.totalPrizePaid}</div><div className="label">Prize paid</div></div>
          </div>

          {staleShops.length > 0 && (
            <div className="note-banner">
              {staleShops.length} shop{staleShops.length === 1 ? '' : 's'} haven't synced in over {STALE_AFTER_HOURS}h —
              worth a follow-up call if it's been longer than expected: {staleShops.map((s) => s.shopName).join(', ')}.
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Per-shop breakdown</h3>
            <table>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Games</th>
                  <th>Cards sold</th>
                  <th>Revenue</th>
                  <th>Prize paid</th>
                  <th>Last sync</th>
                </tr>
              </thead>
              <tbody>
                {data.perShop.map((s) => (
                  <tr key={s.shopId}>
                    <td><Link to={`/shops/${s.shopId}`}>{s.shopName}</Link></td>
                    <td>{s.gamesPlayed}</td>
                    <td>{s.cardsSold}</td>
                    <td>{s.totalRevenue}</td>
                    <td>{s.totalPrizePaid}</td>
                    <td>
                      {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never'}
                      {isStale(s) && <span className="badge badge-stale" style={{ marginLeft: 6 }}>stale</span>}
                    </td>
                  </tr>
                ))}
                {data.perShop.length === 0 && <tr><td colSpan={6}>No shops yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
