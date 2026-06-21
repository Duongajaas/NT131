import { type ReactElement, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { refreshAuthToken } from './api/auth.api';
import { LoginPage } from './pages/login-page';
import { AdminPage } from './pages/admin-page';
import { OperatorPage } from './pages/operator-page';
import { getTokenExpiryMs, isTokenExpired } from './lib/auth';
import { notifyInfo } from './lib/toast';
import { useAuthStore } from './store/auth-store';
import './App.css';

type AppRole = 'admin' | 'operator';

const MAX_SESSION_TIMER_MS = 2_147_000_000;

const SessionSplash = () => <div className="app-splash">Đang khởi tạo phiên đăng nhập...</div>;

interface ProtectedRouteProps {
	allowRoles: AppRole[];
	children: ReactElement;
}

const ProtectedRoute = ({ allowRoles, children }: ProtectedRouteProps) => {
	const hydrated = useAuthStore((state) => state.isHydrated);
	const token = useAuthStore((state) => state.token);
	const refreshToken = useAuthStore((state) => state.refreshToken);
	const role = useAuthStore((state) => state.role);

	if (!hydrated) {
		return <SessionSplash />;
	}

	if (!token || !refreshToken || !role || isTokenExpired(refreshToken)) {
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
	const refreshToken = useAuthStore((state) => state.refreshToken);
	const role = useAuthStore((state) => state.role);

	if (!hydrated) {
		return <SessionSplash />;
	}

	if (!token || !refreshToken || !role || isTokenExpired(refreshToken)) {
		return <Navigate to="/login" replace />;
	}

	return <Navigate to={role === 'admin' ? '/admin' : '/operator'} replace />;
};

const AuthSessionWatcher = () => {
	const navigate = useNavigate();
	const hydrated = useAuthStore((state) => state.isHydrated);
	const token = useAuthStore((state) => state.token);
	const refreshToken = useAuthStore((state) => state.refreshToken);
	const setSession = useAuthStore((state) => state.setSession);
	const logout = useAuthStore((state) => state.logout);

	useEffect(() => {
		if (!hydrated || !token || !refreshToken) {
			return;
		}

		let cancelled = false;
		const accessExpiryMs = getTokenExpiryMs(token);
		const refreshExpiryMs = getTokenExpiryMs(refreshToken);

		const endSession = (showMessage = true) => {
			if (cancelled) {
				return;
			}

			logout();
			if (showMessage) {
				notifyInfo('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
			}
			navigate('/login', { replace: true });
		};

		if (!refreshExpiryMs || refreshExpiryMs <= Date.now()) {
			endSession();
			return;
		}

		const refreshSession = async () => {
			if (cancelled) {
				return;
			}

			if (isTokenExpired(refreshToken)) {
				endSession();
				return;
			}

			try {
				const refreshedSession = await refreshAuthToken(refreshToken);
				if (!cancelled) {
					setSession(refreshedSession);
				}
			} catch {
				endSession();
			}
		};

		let refreshExpiryTimer: number | undefined;
		const scheduleRefreshExpiryCheck = () => {
			if (cancelled) {
				return;
			}

			const remainingMs = refreshExpiryMs - Date.now();
			if (remainingMs <= 0) {
				endSession();
				return;
			}

			refreshExpiryTimer = window.setTimeout(
				scheduleRefreshExpiryCheck,
				Math.min(remainingMs, MAX_SESSION_TIMER_MS)
			);
		};

		scheduleRefreshExpiryCheck();

		const shouldRefreshNow = !accessExpiryMs || accessExpiryMs <= Date.now() + 30_000;
		const accessTimerMs = accessExpiryMs
			? Math.min(Math.max(accessExpiryMs - Date.now() - 30_000, 0), MAX_SESSION_TIMER_MS)
			: 0;
		const accessRefreshTimer = shouldRefreshNow
			? window.setTimeout(() => void refreshSession(), 0)
			: window.setTimeout(() => void refreshSession(), accessTimerMs);

		return () => {
			cancelled = true;
			if (refreshExpiryTimer !== undefined) {
				window.clearTimeout(refreshExpiryTimer);
			}
			window.clearTimeout(accessRefreshTimer);
		};
	}, [hydrated, token, refreshToken, setSession, logout, navigate]);

	return null;
};

function App() {
	const hydrate = useAuthStore((state) => state.hydrate);

	useEffect(() => {
		hydrate();
	}, [hydrate]);

	return (
		<>
			<AuthSessionWatcher />
			<Toaster
				position="top-center"
				gutter={10}
				toastOptions={{
					style: {
						maxWidth: 'min(420px, calc(100vw - 24px))',
						padding: '12px 14px',
						borderRadius: '12px',
						background: 'rgba(255, 255, 255, 0.98)',
						color: '#1a2724',
						border: '1px solid rgba(32, 73, 62, 0.16)',
						boxShadow: '0 16px 36px rgba(12, 34, 28, 0.18)',
						fontSize: '0.9rem',
						lineHeight: '1.35'
					},
					success: {
						style: {
							borderColor: 'rgba(22, 163, 74, 0.42)',
							background: '#f0fdf4'
						}
					},
					error: {
						style: {
							borderColor: 'rgba(220, 38, 38, 0.42)',
							background: '#fff1f2'
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
