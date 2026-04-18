import type { ReactNode } from 'react';
import type { UserRole } from '../types/contracts';

interface AppFrameProps {
	title: string;
	subtitle: string;
	role: UserRole;
	username: string;
	onLogout: () => void;
	children: ReactNode;
}

export const AppFrame = ({
	title,
	subtitle,
	role,
	username,
	onLogout,
	children
}: AppFrameProps) => {
	return (
		<div className="frame-root">
			<header className="frame-header">
				<div className="frame-title-block">
					<p className="frame-eyebrow">NT131 Smart Parking</p>
					<h1>{title}</h1>
					<p>{subtitle}</p>
				</div>
				<div className="frame-user-block">
					<p className="frame-user-role">{role.toUpperCase()}</p>
					<p className="frame-user-name">{username}</p>
					<button type="button" className="btn btn-secondary" onClick={onLogout}>
						Đăng xuất
					</button>
				</div>
			</header>

			<main className="frame-content">{children}</main>
		</div>
	);
};
