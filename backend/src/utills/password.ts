import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

export interface JwtPayload {
    userId: string;  
    email: string;
    role: string;
}

export const hashPassword = async (password: string): Promise<string> => {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
};

export const comparePassword = async (
    password: string,
    hashedPassword: string
): Promise<boolean> => {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
};

export const generateToken = (payload: JwtPayload): string => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in environment variables');
    }

    const options: SignOptions = {
        expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any
    };

    const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        options
    );
    return token;
};

export const generateRefreshToken = (payload: JwtPayload): string => {
    if (!process.env.JWT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
    }

    const options: SignOptions = {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any
    };

    const refreshToken = jwt.sign(
        payload,
        process.env.JWT_REFRESH_SECRET,
        options
    );
    return refreshToken;
};

export const verifyToken = (token: string): any => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
        return decoded;
    } catch (error) {
        throw new Error('Invalid token');
    }
};

export const verifyRefreshToken = (token: string): any => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET as string);
        return decoded;
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
};

export const generateRandomToken = (length: number = 32): string => {
    return crypto.randomBytes(length).toString('hex');
};

export const generatePasswordResetToken = (userId: string): string => {
    const token = jwt.sign(
        { userId, type: 'password_reset' },
        process.env.JWT_SECRET as string,
        { expiresIn: '1h' }
    );
    return token;
};

export const isTokenExpired = (token: string): boolean => {
    try {
        const decoded: any = jwt.decode(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        const currentTime = Math.floor(Date.now() / 1000);
        return decoded.exp < currentTime;
    } catch (error) {
        return true;
    }
};