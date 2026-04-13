import { useEffect, useState } from 'react';
import { SimulatorPanel } from './components/simulator-panel';
import './App.css';

function App() {
	const [token, setToken] = useState('');
	const [sessionId, setSessionId] = useState('');
	const [plateNumber, setPlateNumber] = useState('');

	useEffect(() => {
		const savedToken = window.localStorage.getItem('nt131.simulator.token');
		if (savedToken) {
			setToken(savedToken);
		}
	}, []);

	useEffect(() => {
		if (token) {
			window.localStorage.setItem('nt131.simulator.token', token);
			return;
		}

		window.localStorage.removeItem('nt131.simulator.token');
	}, [token]);

	return (
		<section className="app-shell">
			<header className="hero">
				<p className="eyebrow">NT131 Smart Parking</p>
				<h1>3D Vehicle Simulator</h1>
				<p className="hero-sub">
					Standalone simulator app for 3D entry/exit demo and realtime checkpoint socket events.
				</p>
			</header>

			<section className="panel">
				<header className="panel-head">
					<h2>Authentication</h2>
					<p>Use operator/admin token when calling protected parking APIs.</p>
				</header>
				<div className="field-row">
					<label className="field">
						<span>Access Token</span>
						<textarea
							value={token}
							onChange={(event) => setToken(event.target.value)}
							placeholder="Paste JWT access token"
							rows={3}
						/>
					</label>
					<div className="field">
						<span>Latest generated session</span>
						<input value={sessionId} readOnly placeholder="Session id from simulator" />
					</div>
				</div>
				<p className="event-meta">Current plate in simulation: {plateNumber || '-'}</p>
			</section>

			<SimulatorPanel
				token={token}
				onSessionCreated={(createdSessionId, createdPlateNumber) => {
					setSessionId(createdSessionId);
					setPlateNumber(createdPlateNumber);
				}}
			/>
		</section>
	);
}

export default App;
