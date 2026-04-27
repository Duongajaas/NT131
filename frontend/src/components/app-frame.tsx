import type { ReactNode } from 'react';
import type { UserRole } from '../types/contracts';

interface AppFrameProps {
	role: UserRole;
	username: string;
	onLogout: () => void;
	children: ReactNode;
	title?: string;
}

export const AppFrame = ({ role, username, onLogout, children, title }: AppFrameProps) => {
	const getTitle = () => {
		if (title) return title;
		return role === 'admin' ? 'Admin Dashboard' : 'Operator Dashboard';
	};

	return (
		<div className="dashboard-root">
			<header className="dashboard-header">
				<h1 className="dashboard-title">{getTitle()}</h1>
				<div className="dashboard-user-info">
					<p className="dashboard-user-role">{role.toUpperCase()}</p>
					<p className="dashboard-user-name">{username}</p>
					<button type="button" className="btn btn-secondary" onClick={onLogout}>
						Đăng xuất
					</button>
				</div>
			</header>

			<main className="dashboard-main">{children}</main>
		</div>
	);
};
