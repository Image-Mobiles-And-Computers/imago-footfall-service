import { PresenceService, FloorStaffStatus } from './presence.service';
import { pool } from '../../config/db';

export interface RoutingRequest {
  branch_id: string;
  category_id?: string;
  category_code?: string;
  requested_brand_id?: string;
  requested_brand_name?: string;
  customer_phone?: string;
  is_service_inquiry?: boolean;
}

export interface RoutingAlternative {
  employee_id: string;
  full_name: string;
  designation: string;
  employment_type: string;
  brand_name: string | null;
  current_status: string;
  reason: string;
}

export interface RoutingRecommendation {
  recommended_employee_id: string | null;
  recommended_employee_name: string | null;
  recommended_designation: string | null;
  recommended_floor_zone: string | null;
  routing_type: 'DIRECT_PROMOTER' | 'ROUND_ROBIN' | 'CUSTOMER_REQUEST' | 'QUEUE_TOKEN' | 'HO_CAMPAIGN_PRIORITY';
  confidence_score: number;
  reason: string;
  is_service_only: boolean;
  can_issue_queue_token: boolean;
  queue_token_prefix: string;
  estimated_wait_minutes: number;
  active_ho_campaign_headline?: string | null;
  available_alternatives: RoutingAlternative[];
}

export class RoutingEngine {
  /**
   * Evaluates the priority-weighted routing decision tree for an incoming walk-in shopper
   */
  public static async evaluateRouting(request: RoutingRequest): Promise<RoutingRecommendation> {
    const presence = await PresenceService.getBranchFloorPresence(request.branch_id);
    const availableStaff = presence.staff.filter(s => s.current_status === 'AVAILABLE');
    const engagedStaff = presence.staff.filter(s => s.current_status === 'ENGAGED');

    // 1. Check for Active HO Campaigns for this branch
    let hoCampaignHeadline: string | null = null;
    let hoPriorityBrandId: string | null = null;
    try {
      const [campaigns]: any = await pool.query(`
        SELECT welcome_headline, target_brand_priority_id 
        FROM retail_greeting_ho_campaigns 
        WHERE is_active = TRUE AND CURDATE() BETWEEN start_date AND end_date
        ORDER BY created_at DESC LIMIT 1
      `);
      if (campaigns.length > 0) {
        hoCampaignHeadline = campaigns[0].welcome_headline;
        hoPriorityBrandId = campaigns[0].target_brand_priority_id;
      }
    } catch (e) {
      // Fallback silently if campaigns table has no active record
    }

    // 2. Rule 1: Service / Warranty / Repair Inquiry
    const isService = Boolean(
      request.is_service_inquiry || 
      request.category_code === 'SERVICE_REPAIR' ||
      (request.category_id && request.category_id.includes('service'))
    );

    if (isService) {
      // Find dedicated repair technician or service desk lead
      const serviceStaff = availableStaff.find(s => 
        s.designation.toLowerCase().includes('technician') ||
        s.floor_zone?.toLowerCase().includes('service')
      ) || availableStaff[0] || presence.staff[0];

      return {
        recommended_employee_id: serviceStaff?.employee_id || null,
        recommended_employee_name: serviceStaff?.full_name || 'Customer Support Lead',
        recommended_designation: serviceStaff?.designation || 'Repair Technician',
        recommended_floor_zone: serviceStaff?.floor_zone || 'Customer Service & Repair Desk',
        routing_type: 'CUSTOMER_REQUEST',
        confidence_score: 95,
        reason: 'Service & Warranty Inquiry routed to Technical Desk (Excluded from Sales Conversion Metrics)',
        is_service_only: true,
        can_issue_queue_token: true,
        queue_token_prefix: 'S',
        estimated_wait_minutes: 0,
        active_ho_campaign_headline: hoCampaignHeadline,
        available_alternatives: availableStaff.map(s => ({
          employee_id: s.employee_id,
          full_name: s.full_name,
          designation: s.designation,
          employment_type: s.employment_type,
          brand_name: s.brand_name,
          current_status: s.current_status,
          reason: 'Alternative service associate'
        }))
      };
    }

    // 3. Rule 2: Specific Brand Requested (or HO campaign priority brand override)
    const effectiveBrandName = (request.requested_brand_name || '').trim().toLowerCase();
    
    if (effectiveBrandName && effectiveBrandName !== 'general') {
      // Look for Brand Promoter for this brand
      const matchingPromoters = presence.staff.filter(s => 
        s.employment_type === 'BRAND_PROMOTER' &&
        s.brand_name?.toLowerCase().includes(effectiveBrandName)
      );

      const availablePromoter = matchingPromoters.find(s => s.current_status === 'AVAILABLE');

      if (availablePromoter) {
        return {
          recommended_employee_id: availablePromoter.employee_id,
          recommended_employee_name: availablePromoter.full_name,
          recommended_designation: `${availablePromoter.brand_name} Brand Promoter`,
          recommended_floor_zone: availablePromoter.floor_zone,
          routing_type: 'DIRECT_PROMOTER',
          confidence_score: 98,
          reason: `Certified ${availablePromoter.brand_name} Promoter on duty and ready on the floor`,
          is_service_only: false,
          can_issue_queue_token: false,
          queue_token_prefix: effectiveBrandName.slice(0, 1).toUpperCase(),
          estimated_wait_minutes: 0,
          active_ho_campaign_headline: hoCampaignHeadline,
          available_alternatives: availableStaff
            .filter(s => s.employee_id !== availablePromoter.employee_id)
            .map(s => ({
              employee_id: s.employee_id,
              full_name: s.full_name,
              designation: s.designation,
              employment_type: s.employment_type,
              brand_name: s.brand_name,
              current_status: s.current_status,
              reason: 'General sales associate'
            }))
        };
      }

      // Promoter is on shift but ENGAGED with another customer
      const busyPromoter = matchingPromoters.find(s => s.current_status === 'ENGAGED');
      if (busyPromoter) {
        const estWait = Math.max(3, 15 - (busyPromoter.elapsed_minutes || 0));
        
        // Find general floor rep as backup
        const generalRep = availableStaff.find(s => s.employment_type !== 'BRAND_PROMOTER') || availableStaff[0];

        return {
          recommended_employee_id: generalRep?.employee_id || null,
          recommended_employee_name: generalRep?.full_name || null,
          recommended_designation: generalRep?.designation || 'Floor Sales Specialist',
          recommended_floor_zone: generalRep?.floor_zone || 'Floor Aisle',
          routing_type: 'ROUND_ROBIN',
          confidence_score: 75,
          reason: `${busyPromoter.brand_name} promoter is currently engaged (${busyPromoter.elapsed_minutes}m in). General associate recommended, or issue queue token for brand desk.`,
          is_service_only: false,
          can_issue_queue_token: true,
          queue_token_prefix: effectiveBrandName.slice(0, 1).toUpperCase(),
          estimated_wait_minutes: estWait,
          active_ho_campaign_headline: hoCampaignHeadline,
          available_alternatives: availableStaff.map(s => ({
            employee_id: s.employee_id,
            full_name: s.full_name,
            designation: s.designation,
            employment_type: s.employment_type,
            brand_name: s.brand_name,
            current_status: s.current_status,
            reason: s.brand_name ? `${s.brand_name} specialist` : 'General floor associate'
          }))
        };
      }
    }

    // 4. Rule 3: Category-Based Round-Robin Dispatch
    // Filter available associates by category focus (e.g. Laptops vs Phones vs Audio)
    let categoryFocused = availableStaff;
    const catCode = (request.category_code || '').toLowerCase();
    
    if (catCode.includes('laptop') || catCode.includes('computing')) {
      const laptopReps = availableStaff.filter(s => 
        s.floor_zone?.toLowerCase().includes('laptop') ||
        s.designation.toLowerCase().includes('laptop')
      );
      if (laptopReps.length > 0) categoryFocused = laptopReps;
    } else if (catCode.includes('audio') || catCode.includes('wearable')) {
      const audioReps = availableStaff.filter(s => 
        s.floor_zone?.toLowerCase().includes('audio')
      );
      if (audioReps.length > 0) categoryFocused = audioReps;
    }

    // Pick candidate with round-robin / lowest load (first available)
    const selected = categoryFocused[0] || availableStaff[0] || presence.staff[0];

    const canToken = availableStaff.length === 0;
    const estWait = canToken ? 8 : 0;

    return {
      recommended_employee_id: selected?.employee_id || null,
      recommended_employee_name: selected?.full_name || 'Next Available Associate',
      recommended_designation: selected?.designation || 'Sales Consultant',
      recommended_floor_zone: selected?.floor_zone || 'Main Showroom Floor',
      routing_type: 'ROUND_ROBIN',
      confidence_score: availableStaff.length > 0 ? 88 : 40,
      reason: availableStaff.length > 0 
        ? 'Balanced round-robin assignment among available floor associates' 
        : 'All floor staff currently engaged. Queue token recommended.',
      is_service_only: false,
      can_issue_queue_token: canToken || Boolean(request.requested_brand_name),
      queue_token_prefix: 'T',
      estimated_wait_minutes: estWait,
      active_ho_campaign_headline: hoCampaignHeadline,
      available_alternatives: availableStaff
        .filter(s => s.employee_id !== selected?.employee_id)
        .map(s => ({
          employee_id: s.employee_id,
          full_name: s.full_name,
          designation: s.designation,
          employment_type: s.employment_type,
          brand_name: s.brand_name,
          current_status: s.current_status,
          reason: 'Available sales associate'
        }))
    };
  }
}
