import { type ReactElement, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LoginPage } from './pages/login-page';
import { AdminPage } from './pages/admin-page';
import { OperatorPage } from './pages/operator-page';
import { useAuthStore } from './store/auth-store';
import './App.css';

type AppRole = 'admin' | 'operator';

const SessionSplash = () => <div className="app-splash">Đang khởi tạo phiên đăng nhập...</div>;

interface ProtectedRouteProps {
	allowRoles: AppRole[];
	children: ReactElement;
}

const ProtectedRoute = ({ allowRoles, children }: ProtectedRouteProps) => {
	const hydrated = useAuthStore((state) => state.isHydrated);
	const token = useAuthStore((state) => state.token);
	const role = useAuthStore((state) => state.role);

	if (!hydrated) {
		return <SessionSplash />;
	}

	if (!token || !role) {
		return <Navigate to="/login" replace />;
	}

	if (!allowRoles.includes(role as AppRole)) {
		return <Navigate to={role === 'admin' ? '/admin' : '/operator'} replace />;
	}

	return children;
};

const DefaultRedirect = () => {
	const hydrated = useAuthStore((state) => state.isHydrated);
	const token = useAuthStore((state) => state.token);
	const role = useAuthStore((state) => state.role);

	if (!hydrated) {
		return <SessionSplash />;
	}

	if (!token || !role) {
		return <Navigate to="/login" replace />;
	}

	return <Navigate to={role === 'admin' ? '/admin' : '/operator'} replace />;
};

function App() {
	const hydrate = useAuthStore((state) => state.hydrate);

	useEffect(() => {
		hydrate();
	}, [hydrate]);

	return (
		<>
			<Toaster
				position="top-right"
				gutter={12}
				toastOptions={{
					duration: 3800,
					style: {
						borderRadius: '14px',
						background: 'rgba(8, 15, 31, 0.96)',
						color: '#f8fafc',
						border: '1px solid rgba(148, 163, 184, 0.18)',
						boxShadow: '0 18px 45px rgba(2, 6, 23, 0.35)'
					},
					success: {
						style: {
							borderColor: 'rgba(34, 197, 94, 0.5)'
						}
					},
					error: {
						style: {
							borderColor: 'rgba(248, 113, 113, 0.5)'
						}
					}
				}}
			/>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route
					path="/operator"
					element={
						<ProtectedRoute allowRoles={['operator']}>
							<OperatorPage />
						</ProtectedRoute>
					}
				/>
				<Route
					path="/admin"
					element={
						<ProtectedRoute allowRoles={['admin']}>
							<AdminPage />
						</ProtectedRoute>
					}
				/>
				<Route path="*" element={<DefaultRedirect />} />
			</Routes>
		</>
	);
}

export default App;
