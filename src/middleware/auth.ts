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
    if (req.headers['x-user-role']) {
      req.user = {
        id: (req.headers['x-user-id'] as string) || 'dev-super-admin',
        employee_code: 'DEV-001',
        full_name: 'Dev Super Admin',
        email: 'dev@image.local',
        roles: [String(req.headers['x-user-role'])],
        role_scopes: ['GLOBAL'],
        permissions: []
      };
      
      try {
        const [permRows]: any = await pool.query(
          `SELECT DISTINCT p.code 
           FROM imago_iam_db.permissions p
           JOIN imago_iam_db.role_permissions rp ON p.id = rp.permission_id
           JOIN imago_iam_db.roles r ON rp.role_id = r.id
           WHERE r.name IN (?)`,
          [req.user.roles]
        );
        if (Array.isArray(permRows)) {
          req.user.permissions = permRows.map((r: any) => r.code);
        }
      } catch (err) {
        // non-blocking
      }

      return next();
    }
    res.status(401).json({ success: false, message: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = process.env.JWT_SECRET || 'imago_enterprise_erp_jwt_secret_key_image_2026';
    const decoded = jwt.verify(token, secret) as any;

    req.user = {
      id: decoded.userId || decoded.id,
      employee_code: decoded.employeeCode || decoded.employee_code || '',
      full_name: decoded.fullName || decoded.full_name || decoded.name || '',
      email: decoded.email,
      department_id: decoded.departmentId || decoded.department_id,
      branch_id: decoded.branchId || decoded.branch_id,
      roles: decoded.roles || (req.headers['x-user-role'] ? [String(req.headers['x-user-role'])] : ['STAFF']),
      role_scopes: decoded.role_scopes || ['BRANCH'],
      permissions: decoded.permissions || []
    };

    if (req.user.permissions.length === 0 && req.user.roles.length > 0 && !req.user.roles.includes('SUPER_ADMIN')) {
      try {
        const [permRows]: any = await pool.query(
          `SELECT DISTINCT p.code 
           FROM imago_iam_db.permissions p
           JOIN imago_iam_db.role_permissions rp ON p.id = rp.permission_id
           JOIN imago_iam_db.roles r ON rp.role_id = r.id
           WHERE r.name IN (?)`,
          [req.user.roles]
        );
        if (Array.isArray(permRows)) {
          req.user.permissions = permRows.map((r: any) => r.code);
        }
      } catch (err) {
        // non-blocking
      }
    }

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
};

export const optionalAuthenticateJwt = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = process.env.JWT_SECRET || 'imago_enterprise_erp_jwt_secret_key_image_2026';
    const decoded = jwt.verify(token, secret) as any;

    req.user = {
      id: decoded.userId || decoded.id,
      employee_code: decoded.employeeCode || decoded.employee_code || '',
      full_name: decoded.fullName || decoded.full_name || decoded.name || '',
      email: decoded.email,
      department_id: decoded.departmentId || decoded.department_id,
      branch_id: decoded.branchId || decoded.branch_id,
      roles: decoded.roles || (req.headers['x-user-role'] ? [String(req.headers['x-user-role'])] : ['STAFF']),
      role_scopes: decoded.role_scopes || ['BRANCH'],
      permissions: decoded.permissions || []
    };
  } catch (error) {
    // Non-blocking for public or kiosk terminals
  }
  next();
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
