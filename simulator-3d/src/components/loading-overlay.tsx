interface LoadingOverlayProps {
	title: string;
	description?: string;
	className?: string;
}

export const LoadingOverlay = ({ title, description, className }: LoadingOverlayProps) => {
	const overlayClassName = ['loading-overlay', className].filter(Boolean).join(' ');

	return (
		<div className={overlayClassName} role="status" aria-live="polite" aria-busy="true">
			<div className="loading-card">
				<span className="loading-spinner" aria-hidden="true" />
				<p className="loading-title">{title}</p>
				{description ? <p className="loading-description">{description}</p> : null}
			</div>
		</div>
	);
};