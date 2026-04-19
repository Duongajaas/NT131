import { useNavigate } from 'react-router-dom';
import { AppFrame } from '../components/app-frame';
import { OperatorDashboard } from '../components/operator-dashboard';
import { useOperatorRealtime } from '../hooks/use-operator-realtime';
import { useAuthStore } from '../store/auth-store';

export const OperatorPage = () => {
	const navigate = useNavigate();
	const token = useAuthStore((state) => state.token);
	const role = useAuthStore((state) => state.role);
	const user = useAuthStore((state) => state.user);
	const logout = useAuthStore((state) => state.logout);
	const safeToken = token ?? '';

	useOperatorRealtime(safeToken);

	if (!token || !role || !user) {
		return null;
	}

	const handleLogout = () => {
		logout();
		navigate('/login', { replace: true });
	};

	return (
		<AppFrame role={role} username={user.full_name || user.username} onLogout={handleLogout}>
			<OperatorDashboard token={safeToken} />
		</AppFrame>
	);
};
