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
