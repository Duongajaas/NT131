import type { Request, Response } from 'express';
import * as pricingPolicyService from '../services/pricing-policy.service.ts';

export const create = async (req: Request, res: Response) => {
	const { vehicle_type, card_type, price_per_hour, free_minutes, is_active, effective_from } = req.body;
	const data = await pricingPolicyService.create({
		vehicle_type,
		card_type,
		price_per_hour,
		free_minutes,
		is_active,
		effective_from
	});

	return res.status(201).json({
		message: 'Pricing policy created successfully',
		data
	});
};

export const list = async (req: Request, res: Response) => {
	const { vehicle_type, card_type, is_active } = req.query;
	const data = await pricingPolicyService.list({
		vehicle_type: vehicle_type === 'motorbike' || vehicle_type === 'car' ? vehicle_type : undefined,
		card_type: card_type === 'monthly' || card_type === 'guest' ? card_type : undefined,
		is_active:
			typeof is_active === 'string'
				? is_active === 'true'
					? true
					: is_active === 'false'
						? false
						: undefined
				: undefined
	});

	return res.status(200).json({
		message: 'Pricing policies retrieved successfully',
		data
	});
};

export const getById = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const data = await pricingPolicyService.getById(id);

	return res.status(200).json({
		message: 'Pricing policy retrieved successfully',
		data
	});
};

export const update = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const { vehicle_type, card_type, price_per_hour, free_minutes, is_active, effective_from } = req.body;
	const data = await pricingPolicyService.update(id, {
		vehicle_type,
		card_type,
		price_per_hour,
		free_minutes,
		is_active,
		effective_from
	});

	return res.status(200).json({
		message: 'Pricing policy updated successfully',
		data
	});
};