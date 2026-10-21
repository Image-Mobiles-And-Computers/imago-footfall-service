import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

export interface AuthenticatedUser {
  id: string;
  employee_code?: string;
  full_name?: string;
  email: string;
  department_id?: string | null;
  branch_id?: string | null;
  roles: string[];
  role_scopes?: string[];
  permissions: string[];
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export const authenticateJwt = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = process.env.JWT_SECRET || 'imago_enterprise_erp_jwt_secret_key_image_2026';
    const decoded = jwt.verify(token, secret) as any;

    req.user = {
      id: decoded.userId || decoded.id,
      employee_code: decoded.employeeCode || '',
      full_name: decoded.fullName || decoded.name || '',
      email: decoded.email,
      department_id: decoded.departmentId,
      branch_id: decoded.branchId,
      roles: decoded.roles || (req.headers['x-user-role'] ? [String(req.headers['x-user-role'])] : ['STAFF']),
      role_scopes: decoded.role_scopes || ['BRANCH'],
      permissions: decoded.permissions || []
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
};

export const requirePermission = (permissionCode: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated.' });
      return;
    }

    // Super Admin global privilege bypass
    if (req.user.roles.includes('SUPER_ADMIN')) {
      next();
      return;
    }

    if (req.user.permissions && req.user.permissions.includes(permissionCode)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      message: `Forbidden. Missing required privilege: [${permissionCode}]`
    });
  };
};
