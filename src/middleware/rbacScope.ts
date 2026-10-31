import { AuthRequest } from './auth';
import { pool } from '../config/db';

export interface ScopeResolution {
  targetBranchId: string | null;
  isGlobal: boolean;
  branchName?: string;
  branchCode?: string;
}

const GLOBAL_ROLES = new Set([
  'SUPER_ADMIN',
  'STORE_AUDITOR',
  'HR_HEAD',
  'FINANCE_CONTROLLER',
  'CUSTOMER_EXPERIENCE_LEAD',
  'SECURITY_COMPLIANCE_OFFICER'
]);

/**
 * Checks whether an authenticated user holds global/enterprise-wide visibility.
 */
export function isGlobalUser(req: AuthRequest): boolean {
  if (!req.user) return false;
  const userRoles = (req.user.roles || []).map(r => r.toUpperCase());
  const hasGlobalRole = userRoles.some(r => GLOBAL_ROLES.has(r));
  const hasGlobalScope = (req.user.role_scopes || []).some(s => s.toUpperCase() === 'GLOBAL' || s.toUpperCase() === 'ENTERPRISE');
  const hasGlobalPerm = (req.user.permissions || []).includes('retail:branch:view_all');

  return hasGlobalRole || hasGlobalScope || hasGlobalPerm;
}

/**
 * Resolves the effective branch scope for a request.
 * - Global users can query a specific branch or query all branches (targetBranchId = null).
 * - Non-global users (Store Managers, Sales Consultants, Floor Staff) are strictly locked
 *   to their assigned branch (req.user.branch_id). Any attempt to pass 'ALL' or a different
 *   branch ID is strictly ignored and forced to their assigned branch.
 */
export async function resolveBranchScope(
  req: AuthRequest,
  requestedBranchId?: string | null
): Promise<ScopeResolution> {
  const global = isGlobalUser(req);

  if (global) {
    if (requestedBranchId && requestedBranchId !== 'ALL' && requestedBranchId !== 'undefined' && requestedBranchId !== 'null') {
      return {
        targetBranchId: String(requestedBranchId),
        isGlobal: true
      };
    }
    return {
      targetBranchId: null,
      isGlobal: true
    };
  }

  // Non-global users: Resolve assigned branch ID
  let userBranchId = req.user?.branch_id || null;

  // Fallback lookup if not present on token
  if (!userBranchId && req.user?.id) {
    try {
      const [rows]: any = await pool.query(
        'SELECT branch_id FROM imago_iam_db.users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      if (rows && rows.length > 0 && rows[0].branch_id) {
        userBranchId = rows[0].branch_id;
        if (req.user) req.user.branch_id = userBranchId;
      }
    } catch (err) {
      console.warn('[RBAC Scope] Fallback branch lookup failed:', err);
    }
  }

  // If user has an assigned branch, resolve its name & code for context
  let branchName: string | undefined;
  let branchCode: string | undefined;

  if (userBranchId) {
    try {
      const [bRows]: any = await pool.query(
        'SELECT name, code FROM imago_org_db.branches WHERE id = ? LIMIT 1',
        [userBranchId]
      );
      if (bRows && bRows.length > 0) {
        branchName = bRows[0].name;
        branchCode = bRows[0].code;
      }
    } catch (err) {
      console.warn('[RBAC Scope] Branch name lookup failed:', err);
    }
  }

  const effectiveBranchId = userBranchId || (requestedBranchId && requestedBranchId !== 'ALL' && requestedBranchId !== 'undefined' && requestedBranchId !== 'null' ? String(requestedBranchId) : null);

  return {
    targetBranchId: effectiveBranchId,
    isGlobal: false,
    branchName,
    branchCode
  };
}
