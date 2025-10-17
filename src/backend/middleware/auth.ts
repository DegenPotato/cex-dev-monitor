/**
 * Authentication Middleware
 * JWT token verification for protected routes
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

interface JWTPayload {
  id: number;
  wallet_address: string;
  username: string;
  role: string;
}

/**
 * Middleware to authenticate JWT token
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
      });
    }

    // Verify token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      // Attach user data to request
      (req as any).user = decoded as JWTPayload;
      next();
    });
  } catch (error) {
    console.error('❌ Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as JWTPayload;

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }

  next();
};

/**
 * Middleware to check if user is super admin
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as JWTPayload;

  if (user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Super admin access required',
    });
  }

  next();
};
