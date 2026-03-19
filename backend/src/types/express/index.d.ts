import { UserRole } from '../../models/user.models.ts';

declare global {
	namespace Express {
		interface Request {
			user?: {
				userId: string;
				username: string;
				role: UserRole;
			};
		}
	}
}

export {};
