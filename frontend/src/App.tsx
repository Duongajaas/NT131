import { useEffect, useState } from 'react';
import { OperatorDashboard } from './components/operator-dashboard';
import { decodeRoleFromToken, type FrontendRole } from './lib/auth';
import { useOperatorRealtime } from './hooks/use-operator-realtime';
import './App.css';

function App() {
	const [token, setToken] = useState('');
	const [activeRoleView, setActiveRoleView] = useState<FrontendRole>('operator');
	const [tokenRole, setTokenRole] = useState<FrontendRole | undefined>(undefined);

	useOperatorRealtime(token);

	useEffect(() => {
		const savedToken = window.localStorage.getItem('nt131.parking.token');
		if (savedToken) {
			setToken(savedToken);
		}
	}, []);

	useEffect(() => {
		if (token) {
			window.localStorage.setItem('nt131.parking.token', token);
			const decodedRole = decodeRoleFromToken(token);
			setTokenRole(decodedRole);
			if (decodedRole) {
				setActiveRoleView(decodedRole);
			}
			return;
		}

		setTokenRole(undefined);
		setActiveRoleView('operator');
		window.localStorage.removeItem('nt131.parking.token');
	}, [token]);

	const canSwitchRoleView = tokenRole === 'admin';

	return (
		<div className="shell-frame">
			<header className="topbar panel">
				<div>
					<p className="eyebrow">NT131 Smart Parking</p>
					<h1>Operator/Admin Console</h1>
					<p className="hero-sub">
						Single-page management workspace separated by role view.
					</p>
				</div>
				<div className="nav-tabs" aria-label="Role view">
					<button
						type="button"
						className={`nav-tab ${activeRoleView === 'operator' ? 'tab-active' : ''}`}
						onClick={() => setActiveRoleView('operator')}
					>
						Operator View
					</button>
					<button
						type="button"
						className={`nav-tab ${activeRoleView === 'admin' ? 'tab-active' : ''}`}
						onClick={() => setActiveRoleView('admin')}
						disabled={!canSwitchRoleView}
						title={canSwitchRoleView ? 'Switch to admin view' : 'Admin JWT is required'}
					>
						Admin View
					</button>
				</div>
			</header>

			<OperatorDashboard
				token={token}
				onTokenChange={setToken}
				roleView={activeRoleView}
			/>
		</div>
	);
}

export default App;
