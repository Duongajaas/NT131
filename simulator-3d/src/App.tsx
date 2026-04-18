import { useState } from 'react';
import { SimulatorPanel } from './components/simulator-panel';
import './App.css';

function App() {
	const [sessionId, setSessionId] = useState('');
	const [plateNumber, setPlateNumber] = useState('');

	return (
		<section className="app-shell">
			<header className="hero">
				<p className="eyebrow">NT131 Smart Parking</p>
				<h1>3D Vehicle Simulator</h1>
				<p className="hero-sub">
					Standalone simulator app for 3D entry/exit demo with real backend persistence and realtime socket sync.
				</p>
			</header>

			<section className="panel">
				<header className="panel-head">
					<h2>Simulation Overview</h2>
					<p>When backend REST and Socket.IO are reachable, the simulator creates real vehicle, RFID, session, and slot records while syncing realtime plates and gate states from the operator console.</p>
				</header>
				<div className="field">
					<span>Latest generated session</span>
					<input value={sessionId} readOnly placeholder="Session id from simulator" />
				</div>
				<p className="event-meta">Current plate in simulation: {plateNumber || '-'}</p>
			</section>

			<SimulatorPanel
				onSessionCreated={(createdSessionId, createdPlateNumber) => {
					setSessionId(createdSessionId);
					setPlateNumber(createdPlateNumber);
				}}
			/>
		</section>
	);
}

export default App;
