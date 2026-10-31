import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export async function seedGreetingConcierge(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    console.log('[Greeting Seed] Seeding greeting concierge master records...');
    await connection.beginTransaction();

    // 1. Showroom branch IDs from imago_org_db
    const [branches]: any = await connection.query(`
      SELECT id, name, code FROM imago_org_db.branches 
      WHERE code LIKE 'BR-SH-%' OR id = 'c9832255-2791-401d-88b5-a3d2c870c533'
    `);

    const indiranagarId = 'c9832255-2791-401d-88b5-a3d2c870c533';
    const koramangalaId = '830f08dd-12d9-49da-86e8-b52a55d2eda5';
    const jayanagarId   = 'b9b0ae39-54d9-4322-9448-0c917d79de93';

    // 2. Seed HO Sales Campaigns
    const campaignId1 = 'ho-camp-diwali-2026';
    const campaignId2 = 'ho-camp-apple-flagship';

    await connection.query(`
      INSERT INTO retail_greeting_ho_campaigns (
        id, campaign_name, welcome_headline, intake_questions_json, target_brand_priority_id,
        target_branch_scope, start_date, end_date, is_active, created_by_ho_user_id
      ) VALUES 
      (
        ?,
        'Diwali Mega Exchange Welcome Blitz',
        'Welcome to Image Mobiles! Ask our hosts about ₹10,000 Extra Exchange Bonus on any smartphone upgrade today!',
        ?,
        '4d6225fa-cd2e-11f1-88c3-fb786697c513',
        'ALL_STORES',
        '2026-10-01',
        '2026-11-15',
        TRUE,
        'usr-ho-sales-director'
      ),
      (
        ?,
        'Apple iPhone 16 Pro Flagship Showcase',
        'Welcome to Image Mobiles! Experience iPhone 16 Pro Apple Intelligence with No-Cost EMI up to 24 Months.',
        ?,
        '4d620db8-cd2e-11f1-88c3-fb786697c513',
        'KARNATAKA_ONLY',
        '2026-10-15',
        '2026-11-30',
        TRUE,
        'usr-ho-sales-director'
      )
      ON DUPLICATE KEY UPDATE 
        welcome_headline = VALUES(welcome_headline),
        is_active = VALUES(is_active)
    `, [
      campaignId1,
      JSON.stringify([
        { id: 'trade_in_interest', label: 'Considering Old Phone Trade-In?', type: 'boolean', default: false },
        { id: 'preferred_financing', label: 'Payment Preference', type: 'select', options: ['Instant UPI', 'Credit Card EMI', 'Bajaj Finance No-Cost EMI'] }
      ]),
      campaignId2,
      JSON.stringify([
        { id: 'apple_care_interest', label: 'Interested in AppleCare+ Bundle?', type: 'boolean', default: true }
      ])
    ]);

    // 3. Seed Terminals
    const terminals = [
      {
        id: 'term-indira-01',
        branch_id: indiranagarId,
        terminal_code: 'IND-GREET-01',
        device_name: 'Entrance Host iPad Pro 13"',
        ip_address: '192.168.10.150',
        ho_fleet_group: 'FLAGSHIP_STORES',
        active_ho_campaign_id: campaignId1
      },
      {
        id: 'term-kora-01',
        branch_id: koramangalaId,
        terminal_code: 'KOR-GREET-01',
        device_name: 'Entrance Greeter iPad Air',
        ip_address: '192.168.20.150',
        ho_fleet_group: 'STANDARD_SHOWROOMS',
        active_ho_campaign_id: campaignId1
      },
      {
        id: 'term-jaya-01',
        branch_id: jayanagarId,
        terminal_code: 'JAY-GREET-01',
        device_name: 'Entrance Host Touch Terminal',
        ip_address: '192.168.30.150',
        ho_fleet_group: 'STANDARD_SHOWROOMS',
        active_ho_campaign_id: campaignId2
      }
    ];

    for (const t of terminals) {
      await connection.query(`
        INSERT INTO retail_greeting_terminals (
          id, branch_id, terminal_code, device_name, ip_address, ho_fleet_group, active_ho_campaign_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE
          device_name = VALUES(device_name),
          active_ho_campaign_id = VALUES(active_ho_campaign_id),
          is_active = TRUE
      `, [t.id, t.branch_id, t.terminal_code, t.device_name, t.ip_address, t.ho_fleet_group, t.active_ho_campaign_id]);
    }

    // 4. Seed Floor Presence for Showroom Staff
    const [allRetailStaff]: any = await connection.query(`
      SELECT e.id as employee_id, e.branch_id, e.designation, e.employment_type, bp.brand_name
      FROM imago_hr_db.hr_employees e
      LEFT JOIN imago_hr_db.hr_brand_partners bp ON e.brand_partner_id = bp.id
      WHERE e.division = 'RETAIL' AND e.status = 'ACTIVE'
    `);

    for (let i = 0; i < allRetailStaff.length; i++) {
      const emp = allRetailStaff[i];
      let status = 'AVAILABLE';
      let zone = 'General Sales Floor';

      if (emp.brand_name?.includes('Samsung')) {
        zone = 'Samsung Experience Zone';
      } else if (emp.designation?.includes('Technician')) {
        zone = 'Service & Repairs Counter';
      } else if (i % 5 === 0) {
        status = 'ENGAGED';
        zone = 'Flagship Smartphone Counter';
      } else if (i % 7 === 0) {
        status = 'ON_BREAK';
        zone = 'Staff Lounge';
      } else if (i % 2 === 0) {
        zone = 'Laptops & Computing Hub';
      } else {
        zone = 'Smartphones & Audio Aisle';
      }

      await connection.query(`
        INSERT INTO retail_staff_floor_status (
          employee_id, branch_id, current_status, floor_zone
        ) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          branch_id = VALUES(branch_id),
          current_status = VALUES(current_status),
          floor_zone = VALUES(floor_zone)
      `, [emp.employee_id, emp.branch_id, status, zone]);
    }

    await connection.commit();
    console.log('[Greeting Seed] ✅ Successfully seeded greeting concierge data!');
  } catch (err) {
    await connection.rollback();
    console.error('[Greeting Seed] ❌ Failed to seed greeting concierge data:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  seedGreetingConcierge()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch(() => process.exit(1));
}
