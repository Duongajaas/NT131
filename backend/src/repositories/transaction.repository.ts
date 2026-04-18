import Transaction, { type ITransaction, type PaymentStatus } from '../models/transaction.models.ts';

export interface CreateTransactionInput {
	session_id: string;
	vehicle_id: string;
	rfid_card_id: string;
	pricing_policy_id?: string;
	amount: number;
	final_amount: number;
	payment_status?: PaymentStatus;
}

export interface RevenueFilter {
	from_date?: Date;
	to_date?: Date;
}

export interface RevenueSummary {
	total_transactions: number;
	total_revenue: number;
	paid_transactions: number;
	pending_transactions: number;
	failed_transactions: number;
	waived_transactions: number;
}

const buildDateFilter = (filter: RevenueFilter) => {
	if (!filter.from_date && !filter.to_date) {
		return undefined;
	}

	const createdAt: { $gte?: Date; $lte?: Date } = {};
	if (filter.from_date) {
		createdAt.$gte = filter.from_date;
	}

	if (filter.to_date) {
		createdAt.$lte = filter.to_date;
	}

	return { created_at: createdAt };
};

export const findTransactionBySessionId = async (
	sessionId: string
): Promise<ITransaction | null> => {
	return Transaction.findOne({ session_id: sessionId });
};

export const createTransaction = async (
	input: CreateTransactionInput
): Promise<ITransaction> => {
	return Transaction.create({
		session_id: input.session_id,
		vehicle_id: input.vehicle_id,
		rfid_card_id: input.rfid_card_id,
		pricing_policy_id: input.pricing_policy_id,
		amount: input.amount,
		final_amount: input.final_amount,
		payment_status: input.payment_status ?? 'pending',
		paid_at: input.payment_status === 'paid' ? new Date() : undefined
	});
};

export const listTransactions = async (
	filter: RevenueFilter,
	limit = 30
): Promise<ITransaction[]> => {
	const dateFilter = buildDateFilter(filter);
	return Transaction.find(dateFilter ?? {}).sort({ created_at: -1 }).limit(limit);
};

export const getRevenueSummary = async (
	filter: RevenueFilter
): Promise<RevenueSummary> => {
	const dateFilter = buildDateFilter(filter);
	const [summary] = await Transaction.aggregate<RevenueSummary>([
		...(dateFilter ? [{ $match: dateFilter }] : []),
		{
			$group: {
				_id: null,
				total_transactions: { $sum: 1 },
				total_revenue: {
					$sum: {
						$cond: [{ $eq: ['$payment_status', 'paid'] }, '$final_amount', 0]
					}
				},
				paid_transactions: {
					$sum: { $cond: [{ $eq: ['$payment_status', 'paid'] }, 1, 0] }
				},
				pending_transactions: {
					$sum: { $cond: [{ $eq: ['$payment_status', 'pending'] }, 1, 0] }
				},
				failed_transactions: {
					$sum: { $cond: [{ $eq: ['$payment_status', 'failed'] }, 1, 0] }
				},
				waived_transactions: {
					$sum: { $cond: [{ $eq: ['$payment_status', 'waived'] }, 1, 0] }
				}
			}
		}
	]);

	return (
		summary ?? {
			total_transactions: 0,
			total_revenue: 0,
			paid_transactions: 0,
			pending_transactions: 0,
			failed_transactions: 0,
			waived_transactions: 0
		}
	);
};
