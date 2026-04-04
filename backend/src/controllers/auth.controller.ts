import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.ts';

export const register = async (req: Request, res: Response) => {
	const { username, password, full_name, role } = req.body;

	const data = await authService.register({
		username,
		password,
		full_name,
		role
	});

	return res.status(201).json({
		message: 'User registered successfully',
		data
	});
};

export const login = async (req: Request, res: Response) => {
	const { username, password } = req.body;

	const data = await authService.login({ username, password });

	return res.status(200).json({
		message: 'Login successful',
		data
	});
};
