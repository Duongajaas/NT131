import type { ReactNode } from 'react';
import type { UserRole } from '../types/contracts';

interface AppFrameProps {
	role: UserRole;
	username: string;
	onLogout: () => void;
	children: ReactNode;
}

export const AppFrame = ({ role, username, onLogout, children }: AppFrameProps) => {
	return (
		<div className="frame-root">
			<header className="frame-header">
				<div className="frame-user-summary">
					<p className="frame-user-role">{role.toUpperCase()}</p>
					<p className="frame-user-name">{username}</p>
				</div>
				<button type="button" className="btn btn-secondary" onClick={onLogout}>
					Đăng xuất
				</button>
			</header>

			<main className="frame-content">{children}</main>
		</div>
	);
};
