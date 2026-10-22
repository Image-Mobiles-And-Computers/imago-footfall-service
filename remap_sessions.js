const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

async function remapAndSeed() {
  const footfallConn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'IMAGE@Local!2026',
    database: 'imago_footfall_db'
  });

  const orgConn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'IMAGE@Local!2026',
    database: 'imago_org_db'
  });

  const [users] = await orgConn.query(
    'SELECT u.id, u.full_name, u.employee_code, b.code as branch_code, b.id as branch_id ' +
    'FROM users u ' +
    'JOIN branches b ON u.branch_id = b.id ' +
    'JOIN departments d ON u.department_id = d.id ' +
    'WHERE d.code = "SALES"'
  );
  console.log('Real Sales Users in Org:', users.length);

  // 1. Remap fake IDs in Indiranagar
  const indiraBranch = 'c9832255-2791-401d-88b5-a3d2c870c533';
  const priya = users.find(u => u.employee_code === 'IMG-101');
  const arun = users.find(u => u.employee_code === 'IMG-102');
  const deepika = users.find(u => u.employee_code === 'IMG-103');
  const mohammed = users.find(u => u.employee_code === 'IMG-104');
  const ananya = users.find(u => u.employee_code === 'IMG-025');

  if (priya) {
    await footfallConn.query(
      'UPDATE retail_walkin_sessions SET assigned_employee_id = ?, assigned_employee_name = ? WHERE assigned_employee_id = "a1111111-2222-3333-4444-555555555555"',
      [priya.id, priya.full_name]
    );
  }
  if (arun) {
    await footfallConn.query(
      'UPDATE retail_walkin_sessions SET assigned_employee_id = ?, assigned_employee_name = ? WHERE assigned_employee_id = "b2222222-3333-4444-5555-666666666666"',
      [arun.id, arun.full_name]
    );
  }
  if (deepika) {
    await footfallConn.query(
      'UPDATE retail_walkin_sessions SET assigned_employee_id = ?, assigned_employee_name = ? WHERE assigned_employee_id = "c3333333-4444-5555-6666-777777777777"',
      [deepika.id, deepika.full_name]
    );
  }
  if (mohammed) {
    await footfallConn.query(
      'UPDATE retail_walkin_sessions SET assigned_employee_id = ?, assigned_employee_name = ? WHERE branch_id = ? AND (assigned_employee_name LIKE "%Sunil%" OR assigned_employee_name LIKE "%Technician%")',
      [mohammed.id, mohammed.full_name, indiraBranch]
    );
  }
  if (ananya) {
    await footfallConn.query(
      'UPDATE retail_walkin_sessions SET assigned_employee_name = ? WHERE assigned_employee_id = ?',
      [ananya.full_name, ananya.id]
    );
  }

  // Clear any sessions with null/desk
  await footfallConn.query(
    'UPDATE retail_walkin_sessions SET assigned_employee_id = NULL WHERE assigned_employee_name LIKE "%Desk%" OR assigned_employee_name LIKE "%Cashier%"'
  );

  // 2. Seed Koramangala sessions if needed
  const koraBranch = '830f08dd-12d9-49da-86e8-b52a55d2eda5';
  const [koraExisting] = await footfallConn.query(
    'SELECT COUNT(*) as n FROM retail_walkin_sessions WHERE branch_id = ?',
    [koraBranch]
  );
  if (koraExisting[0].n === 0) {
    console.log('Seeding walk-ins for Koramangala Showroom...');
    const koraStaff = users.filter(u => u.branch_code === 'BR-SH-KORA');
    for (const rep of koraStaff) {
      for (let i = 0; i < 4; i++) {
        const sId = uuidv4();
        const isConv = i < 2;
        const enteredAt = new Date(Date.now() - (i * 3600 * 1000 * 8));
        const engagedAt = new Date(enteredAt.getTime() + (2 * 60 * 1000));
        const exitedAt = new Date(enteredAt.getTime() + (25 * 60 * 1000));

        await footfallConn.query(
          'INSERT INTO retail_walkin_sessions ' +
          '(id, branch_id, session_number, customer_phone, customer_name, customer_type, primary_category_id, primary_category_name, assigned_employee_id, assigned_employee_name, status, entered_at, engaged_at, exited_at, dwell_duration_seconds) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            sId, koraBranch, 'WIN-KORA-' + Math.floor(1000 + Math.random() * 9000),
            '+9198765' + Math.floor(10000 + Math.random() * 90000), 'Walk-In Customer ' + rep.employee_code + '-' + i,
            'NEW', 'SMARTPHONES', 'Smartphones',
            rep.id, rep.full_name,
            isConv ? 'CONVERTED' : 'LOST',
            enteredAt, engagedAt, exitedAt, 1500
          ]
        );

        if (isConv) {
          await footfallConn.query(
            'INSERT INTO retail_conversions ' +
            '(id, session_id, branch_id, invoice_number, invoice_amount, payment_method, sales_employee_id, sales_employee_name, converted_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), sId, koraBranch, 'INV-KORA-' + Math.floor(10000 + Math.random() * 90000), 45000 + (i * 12000), 'UPI', rep.id, rep.full_name, exitedAt]
          );
        }
      }
    }
  }

  // 3. Seed Jayanagar sessions if needed
  const jayaBranch = 'b9b0ae39-54d9-4322-9448-0c917d79de93';
  const [jayaExisting] = await footfallConn.query(
    'SELECT COUNT(*) as n FROM retail_walkin_sessions WHERE branch_id = ?',
    [jayaBranch]
  );
  if (jayaExisting[0].n === 0) {
    console.log('Seeding walk-ins for Jayanagar Showroom...');
    const jayaStaff = users.filter(u => u.branch_code === 'BR-SH-JAYA');
    for (const rep of jayaStaff) {
      for (let i = 0; i < 4; i++) {
        const sId = uuidv4();
        const isConv = i < 2;
        const enteredAt = new Date(Date.now() - (i * 3600 * 1000 * 8));
        const engagedAt = new Date(enteredAt.getTime() + (2 * 60 * 1000));
        const exitedAt = new Date(enteredAt.getTime() + (25 * 60 * 1000));

        await footfallConn.query(
          'INSERT INTO retail_walkin_sessions ' +
          '(id, branch_id, session_number, customer_phone, customer_name, customer_type, primary_category_id, primary_category_name, assigned_employee_id, assigned_employee_name, status, entered_at, engaged_at, exited_at, dwell_duration_seconds) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            sId, jayaBranch, 'WIN-JAYA-' + Math.floor(1000 + Math.random() * 9000),
            '+9198765' + Math.floor(10000 + Math.random() * 90000), 'Walk-In Customer ' + rep.employee_code + '-' + i,
            'NEW', 'SMARTPHONES', 'Smartphones',
            rep.id, rep.full_name,
            isConv ? 'CONVERTED' : 'LOST',
            enteredAt, engagedAt, exitedAt, 1500
          ]
        );

        if (isConv) {
          await footfallConn.query(
            'INSERT INTO retail_conversions ' +
            '(id, session_id, branch_id, invoice_number, invoice_amount, payment_method, sales_employee_id, sales_employee_name, converted_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), sId, jayaBranch, 'INV-JAYA-' + Math.floor(10000 + Math.random() * 90000), 52000 + (i * 8000), 'CARD', rep.id, rep.full_name, exitedAt]
          );
        }
      }
    }
  }

  const [after] = await footfallConn.query(
    'SELECT s.branch_id, s.assigned_employee_id, s.assigned_employee_name, COUNT(*) as cnt ' +
    'FROM retail_walkin_sessions s ' +
    'GROUP BY s.branch_id, s.assigned_employee_id, s.assigned_employee_name'
  );
  console.log('After Remap & Seed:');
  console.table(after);

  await footfallConn.end();
  await orgConn.end();
}

remapAndSeed().catch(console.error);
