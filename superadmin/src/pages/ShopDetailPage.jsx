import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";

function todayStr() {
	return new Date().toISOString().slice(0, 10);
}

export default function ShopDetailPage() {
	const { id } = useParams();
	const [shop, setShop] = useState(null);
	const [admins, setAdmins] = useState([]);
	const [cashiers, setCashiers] = useState([]);
	const [daily, setDaily] = useState(null);
	const [error, setError] = useState(null);
	const [showCreateAdmin, setShowCreateAdmin] = useState(false);
	const [createdAdminNote, setCreatedAdminNote] = useState(null);
	const [licenseExpiresInDays, setLicenseExpiresInDays] = useState("");
	const [licenseError, setLicenseError] = useState(null);
	const [generatingLicense, setGeneratingLicense] = useState(false);

	async function load() {
		try {
			const [shops, adminList, cashierList, dailyReport] = await Promise.all([
				api.get("/shops"),
				api.get(`/shops/${id}/admins`),
				api.get(`/shops/${id}/cashiers`),
				api.get(`/shops/${id}/reports/daily?date=${todayStr()}`),
			]);
			setShop(shops.find((s) => s.id === id));
			setAdmins(adminList);
			setCashiers(cashierList);
			setDaily(dailyReport);
		} catch (err) {
			setError(err.message);
		}
	}

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	async function toggleAdminStatus(admin) {
		const nextStatus = admin.status === "active" ? "disabled" : "active";
		await api.patch(`/shops/${id}/admins/${admin.id}`, { status: nextStatus });
		load();
	}

	async function generateLicense(e) {
		e.preventDefault();
		setGeneratingLicense(true);
		setLicenseError(null);
		try {
			const body = licenseExpiresInDays
				? { expiresInDays: Number(licenseExpiresInDays) }
				: {};
			await api.post(`/shops/${id}/license`, body);
			load();
		} catch (err) {
			setLicenseError(err.message);
		} finally {
			setGeneratingLicense(false);
		}
	}

	if (error) return <div className="error-banner">{error}</div>;
	if (!shop) return <p>Loading…</p>;

	return (
		<div>
			<p>
				<Link to="/shops">&larr; All shops</Link>
			</p>
			<h2 style={{ marginTop: 0 }}>{shop.name}</h2>
			<p style={{ color: "var(--text-muted)" }}>
				{shop.location} • {shop.contactPhone}
			</p>

			<div className="card">
				<h3 style={{ marginTop: 0 }}>Local server credentials</h3>
				<label>SHOP_ID</label>
				<div className="key-display">{shop.id}</div>
				<label>CLOUD_SYNC_API_KEY</label>
				<div className="key-display">{shop.syncApiKey}</div>
			</div>

			<div className="card">
				<h3 style={{ marginTop: 0 }}>License key</h3>

				{shop.licenseKey ? (
					<>
						<label>LICENSE_KEY</label>
						<div className="key-display">{shop.licenseKey}</div>
					</>
				) : (
					<p>No license key generated yet.</p>
				)}
				{licenseError && <div className="error-banner">{licenseError}</div>}
				<form
					onSubmit={generateLicense}
					style={{
						display: "flex",
						gap: 8,
						alignItems: "flex-end",
						marginTop: 12,
					}}
				>
					<div style={{ flex: 1 }}>
						<label>Expires in (days, blank = never)</label>
						<input
							type="number"
							min="1"
							value={licenseExpiresInDays}
							onChange={(e) => setLicenseExpiresInDays(e.target.value)}
						/>
					</div>
					<button className="btn btn-primary" disabled={generatingLicense}>
						{generatingLicense
							? "Generating…"
							: shop.licenseKey
								? "Regenerate"
								: "Generate license key"}
					</button>
				</form>
			</div>

			<div className="stat-grid">
				<div className="stat">
					<div className="value">{daily?.gamesPlayed ?? "-"}</div>
					<div className="label">Games today</div>
				</div>
				<div className="stat">
					<div className="value">{daily?.cardsSold ?? "-"}</div>
					<div className="label">Cards sold today</div>
				</div>
				<div className="stat">
					<div className="value">{daily?.totalRevenue ?? "-"}</div>
					<div className="label">Revenue today</div>
				</div>
				<div className="stat">
					<div className="value">{daily?.totalPrizePaid ?? "-"}</div>
					<div className="label">Prize paid today</div>
				</div>
			</div>

			<div className="card">
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<h3 style={{ margin: 0 }}>Admins</h3>
					<button
						className="btn btn-primary"
						onClick={() => setShowCreateAdmin(true)}
					>
						+ Add admin record
					</button>
				</div>
				<table style={{ marginTop: 12 }}>
					<thead>
						<tr>
							<th>Name</th>
							<th>Username</th>
							<th>Status</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{admins.map((a) => (
							<tr key={a.id}>
								<td>{a.name}</td>
								<td>{a.username}</td>
								<td>
									<span
										className={`badge ${a.status === "active" ? "badge-active" : "badge-suspended"}`}
									>
										{a.status}
									</span>
								</td>
								<td>
									<button className="btn" onClick={() => toggleAdminStatus(a)}>
										{a.status === "active" ? "Disable" : "Enable"}
									</button>
								</td>
							</tr>
						))}
						{admins.length === 0 && (
							<tr>
								<td colSpan={4}>No admins mirrored from this shop yet.</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div className="card">
				<h3 style={{ marginTop: 0 }}>Cashiers</h3>
				<table style={{ marginTop: 12 }}>
					<thead>
						<tr>
							<th>Name</th>
							<th>Username</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{cashiers.map((c) => (
							<tr key={c.id}>
								<td>{c.name}</td>
								<td>{c.username}</td>
								<td>
									<span
										className={`badge ${c.status === "active" ? "badge-active" : "badge-suspended"}`}
									>
										{c.status}
									</span>
								</td>
							</tr>
						))}
						{cashiers.length === 0 && (
							<tr>
								<td colSpan={3}>No cashiers mirrored from this shop yet.</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{showCreateAdmin && (
				<CreateAdminModal
					shopId={id}
					onClose={() => setShowCreateAdmin(false)}
					onCreated={(note) => {
						setShowCreateAdmin(false);
						setCreatedAdminNote(note);
						load();
					}}
				/>
			)}

			{createdAdminNote && (
				<div className="modal-backdrop">
					<div className="modal">
						<h3 style={{ marginTop: 0 }}>Admin record created</h3>
						<p>{createdAdminNote}</p>
						<div className="modal-actions">
							<button
								className="btn btn-primary"
								onClick={() => setCreatedAdminNote(null)}
							>
								Got it
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function CreateAdminModal({ shopId, onClose, onCreated }) {
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const [saving, setSaving] = useState(false);

	async function handleSubmit(e) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const result = await api.post(`/shops/${shopId}/admins`, {
				name,
				username,
				password,
			});
			onCreated(result.note);
		} catch (err) {
			setError(err.message);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="modal-backdrop">
			<form className="modal" onSubmit={handleSubmit}>
				<h3 style={{ marginTop: 0 }}>New admin record</h3>
				<div className="note-banner">
					This admin can log in locally with the password below as soon as this
					shop's local server next starts up or reconnects to the internet — not
					necessarily instant if the shop has limited connectivity. They'll be
					asked to change this password the first time they log in.
				</div>
				{error && <div className="error-banner">{error}</div>}
				<label>Name</label>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
				<label>Username</label>
				<input
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					required
					minLength={3}
				/>
				<label>Initial password</label>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					minLength={4}
				/>
				<div className="modal-actions">
					<button type="button" className="btn" onClick={onClose}>
						Cancel
					</button>
					<button className="btn btn-primary" disabled={saving}>
						{saving ? "Creating…" : "Create"}
					</button>
				</div>
			</form>
		</div>
	);
}
