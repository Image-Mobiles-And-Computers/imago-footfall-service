import { pool } from '../../config/db';

export interface FloorStaffStatus {
  employee_id: string;
  employee_code: string;
  branch_id: string;
  branch_name?: string;
  full_name: string;
  designation: string;
  employment_type: string;
  brand_partner_id: string | null;
  brand_name: string | null;
  current_status: 'AVAILABLE' | 'ENGAGED' | 'ON_BREAK' | 'LOGGED_OUT';
  floor_zone: string | null;
  current_walkin_session_id: string | null;
  active_customer_name: string | null;
  active_session_number: string | null;
  status_updated_at: string;
  elapsed_minutes: number;
}

export interface PresenceSummary {
  branch_id: string;
  branch_name?: string;
  total_on_duty: number;
  available_count: number;
  engaged_count: number;
  on_break_count: number;
  logged_out_count: number;
  smartphone_promoters_available: number;
  laptop_specialists_available: number;
  audio_reps_available: number;
  service_techs_available: number;
  staff: FloorStaffStatus[];
}

export class PresenceService {
  /**
   * Retrieves real-time floor staff presence for a branch (or all branches) by synthesizing
   * HR on-duty records with footfall floor status and active walk-in sessions.
   */
  public static async getBranchFloorPresence(branchId?: string | null): Promise<PresenceSummary> {
    const connection = await pool.getConnection();
    try {
      const isSpecificBranch = branchId && branchId !== 'ALL' && branchId !== 'undefined' && branchId !== 'null';
      let branchWhere = '';
      const params: any[] = [];
      if (isSpecificBranch) {
        branchWhere = 'AND e.branch_id = ?';
        params.push(branchId);
      }

      // 1. Fetch retail employees from imago_hr_db + user identity + branch
      const [hrRows]: any = await connection.query(`
        SELECT 
          e.id as employee_id,
          e.employee_code,
          e.branch_id,
          COALESCE(b.name, 'Showroom Branch') as branch_name,
          e.designation,
          e.employment_type,
          e.brand_partner_id,
          bp.brand_name,
          u.full_name,
          u.email as user_email,
          COALESCE(sfs.current_status, 'AVAILABLE') as current_status,
          COALESCE(sfs.floor_zone, 'Main Showroom Floor') as floor_zone,
          sfs.current_walkin_session_id,
          sfs.status_updated_at,
          ws.customer_name as active_customer_name,
          ws.session_number as active_session_number,
          TIMESTAMPDIFF(MINUTE, COALESCE(ws.engaged_at, sfs.status_updated_at, NOW()), NOW()) as elapsed_minutes
        FROM imago_hr_db.hr_employees e
        LEFT JOIN imago_iam_db.users u ON e.user_id = u.id
        LEFT JOIN imago_org_db.branches b ON e.branch_id = b.id
        LEFT JOIN imago_hr_db.hr_brand_partners bp ON e.brand_partner_id = bp.id
        LEFT JOIN retail_staff_floor_status sfs ON e.id = sfs.employee_id
        LEFT JOIN retail_walkin_sessions ws ON sfs.current_walkin_session_id = ws.id AND ws.status = 'ENGAGED'
        WHERE e.division = 'RETAIL' AND e.status = 'ACTIVE' ${branchWhere}
        ORDER BY 
          b.name ASC,
          CASE 
            WHEN e.employment_type = 'BRAND_PROMOTER' THEN 1
            WHEN e.designation LIKE '%Sales%' THEN 2
            WHEN e.designation LIKE '%Technician%' THEN 3
            ELSE 4
          END,
          u.full_name ASC
      `, params);

      const staffList: FloorStaffStatus[] = hrRows.map((r: any) => {
        let status = r.current_status || 'AVAILABLE';
        // If an active session is linked and status is not ON_BREAK, mark as ENGAGED
        if (r.current_walkin_session_id && r.active_session_number && status !== 'ON_BREAK') {
          status = 'ENGAGED';
        }

        return {
          employee_id: r.employee_id,
          employee_code: r.employee_code || 'EMP',
          branch_id: r.branch_id,
          branch_name: r.branch_name,
          full_name: r.full_name || 'Staff Member',
          designation: r.designation || 'Sales Associate',
          employment_type: r.employment_type || 'FULL_TIME_INTERNAL',
          brand_partner_id: r.brand_partner_id || null,
          brand_name: r.brand_name || null,
          current_status: status,
          floor_zone: r.floor_zone || 'Floor Aisle',
          current_walkin_session_id: r.current_walkin_session_id || null,
          active_customer_name: r.active_customer_name || null,
          active_session_number: r.active_session_number || null,
          status_updated_at: r.status_updated_at || new Date().toISOString(),
          elapsed_minutes: Math.max(0, Number(r.elapsed_minutes) || 0)
        };
      });

      // 2. Compute aggregate metrics
      const available = staffList.filter(s => s.current_status === 'AVAILABLE');
      const engaged = staffList.filter(s => s.current_status === 'ENGAGED');
      const onBreak = staffList.filter(s => s.current_status === 'ON_BREAK');
      const loggedOut = staffList.filter(s => s.current_status === 'LOGGED_OUT');

      const smartphonePromotersAvailable = available.filter(s => 
        s.employment_type === 'BRAND_PROMOTER' || s.floor_zone?.toLowerCase().includes('phone')
      ).length;

      const laptopSpecialistsAvailable = available.filter(s => 
        s.floor_zone?.toLowerCase().includes('laptop') || s.designation.toLowerCase().includes('laptop')
      ).length;

      const audioRepsAvailable = available.filter(s => 
        s.floor_zone?.toLowerCase().includes('audio')
      ).length;

      const serviceTechsAvailable = available.filter(s => 
        s.designation.toLowerCase().includes('technician') || s.floor_zone?.toLowerCase().includes('service')
      ).length;

      return {
        branch_id: branchId || 'ALL',
        branch_name: isSpecificBranch ? (staffList[0]?.branch_name || 'Showroom Branch') : 'All Showrooms',
        total_on_duty: staffList.length,
        available_count: available.length,
        engaged_count: engaged.length,
        on_break_count: onBreak.length,
        logged_out_count: loggedOut.length,
        smartphone_promoters_available: smartphonePromotersAvailable,
        laptop_specialists_available: laptopSpecialistsAvailable,
        audio_reps_available: audioRepsAvailable,
        service_techs_available: serviceTechsAvailable,
        staff: staffList
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Manually updates the floor presence status of a staff member
   */
  public static async updateStaffStatus(
    employeeId: string,
    branchId: string,
    status: 'AVAILABLE' | 'ENGAGED' | 'ON_BREAK' | 'LOGGED_OUT',
    walkinSessionId?: string | null,
    floorZone?: string | null
  ): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        INSERT INTO retail_staff_floor_status (
          employee_id, branch_id, current_status, current_walkin_session_id, floor_zone
        ) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          current_status = VALUES(current_status),
          current_walkin_session_id = VALUES(current_walkin_session_id),
          floor_zone = COALESCE(VALUES(floor_zone), floor_zone),
          status_updated_at = NOW()
      `, [
        employeeId,
        branchId,
        status,
        walkinSessionId || null,
        floorZone || null
      ]);
    } finally {
      connection.release();
    }
  }
}
