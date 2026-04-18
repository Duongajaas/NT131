import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth.api';
import { useAuthStore } from '../store/auth-store';

const roleRouteMap: Record<'admin' | 'operator', '/admin' | '/operator'> = {
	admin: '/admin',
	operator: '/operator'
};

export const LoginPage = () => {
	const navigate = useNavigate();
	const setSession = useAuthStore((state) => state.setSession);
	const isHydrated = useAuthStore((state) => state.isHydrated);
	const token = useAuthStore((state) => state.token);
	const role = useAuthStore((state) => state.role);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!isHydrated || !token || !role) {
			return;
		}

		navigate(roleRouteMap[role], { replace: true });
	}, [isHydrated, navigate, role, token]);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		setBusy(true);

		try {
			const payload = await login({ username, password });
			setSession(payload);
			navigate(roleRouteMap[payload.user.role], { replace: true });
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : 'Đăng nhập thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="login-root">
			<section className="login-panel">
				<header>
					<h1>Đăng nhập hệ thống bãi xe</h1>
					<p>Nhập tài khoản để truy cập đúng màn hình theo role.</p>
				</header>

				<form className="login-form" onSubmit={submit}>
					<label className="field">
						<span>Tài khoản</span>
						<input
							autoFocus
							value={username}
							onChange={(event) => setUsername(event.target.value)}
							placeholder="username"
							required
						/>
					</label>

					<label className="field">
						<span>Mật khẩu</span>
						<input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="password"
							required
						/>
					</label>

					<button type="submit" className="btn" disabled={busy}>
						{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
					</button>
				</form>

				{error ? <p className="form-error">{error}</p> : null}
			</section>
		</div>
	);
};
