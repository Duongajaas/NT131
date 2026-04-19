import AppError from '../utills/app-error.ts';
import {
	createPricingPolicy,
	findPricingPolicyById,
	listPricingPolicies,
	updatePricingPolicyById,
	type CreatePricingPolicyInput,
	type ListPricingPoliciesFilter,
	type UpdatePricingPolicyInput
} from '../repositories/pricing-policy.repository.ts';

export const create = async (input: CreatePricingPolicyInput) => {
	return createPricingPolicy(input);
};

export const list = async (input: ListPricingPoliciesFilter) => {
	return listPricingPolicies(input);
};

export const getById = async (pricingPolicyId: string) => {
	const pricingPolicy = await findPricingPolicyById(pricingPolicyId);
	if (!pricingPolicy) {
		throw new AppError('Pricing policy not found', 404);
	}

	return pricingPolicy;
};

export const update = async (pricingPolicyId: string, input: UpdatePricingPolicyInput) => {
	const existingPricingPolicy = await findPricingPolicyById(pricingPolicyId);
	if (!existingPricingPolicy) {
		throw new AppError('Pricing policy not found', 404);
	}

	const updatedPricingPolicy = await updatePricingPolicyById(pricingPolicyId, input);
	if (!updatedPricingPolicy) {
		throw new AppError('Failed to update pricing policy', 500);
	}

	return updatedPricingPolicy;
};