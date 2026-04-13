import clsx from 'clsx';

type Tone = 'neutral' | 'good' | 'warn' | 'danger';

interface StatusCardProps {
	label: string;
	value: string | number;
	description?: string;
	tone?: Tone;
}

export const StatusCard = ({
	label,
	value,
	description,
	tone = 'neutral'
}: StatusCardProps) => {
	return (
		<article className={clsx('status-card', `tone-${tone}`)}>
			<p className="status-label">{label}</p>
			<p className="status-value">{value}</p>
			{description ? <p className="status-desc">{description}</p> : null}
		</article>
	);
};
