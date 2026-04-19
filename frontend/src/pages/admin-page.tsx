import { useNavigate } from 'react-router-dom';
import { AppFrame } from '../components/app-frame';
import { AdminDashboard } from '../components/admin-dashboard';
import { useAuthStore } from '../store/auth-store';

export const AdminPage = () => {
	const navigate = useNavigate();
	const token = useAuthStore((state) => state.token);
	const role = useAuthStore((state) => state.role);
	const user = useAuthStore((state) => state.user);
	const logout = useAuthStore((state) => state.logout);

	if (!token || !role || !user) {
		return null;
	}

	const handleLogout = () => {
		logout();
		navigate('/login', { replace: true });
	};

	return (
		<AppFrame role={role} username={user.full_name || user.username} onLogout={handleLogout}>
			<AdminDashboard token={token} />
		</AppFrame>
	);
};
