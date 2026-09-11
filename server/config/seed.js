const bcrypt = require('bcryptjs');
const { query, transaction } = require('./database');
const crypto = require('crypto');

function generateUUID() {
  return crypto.randomUUID();
}

async function seedDatabase() {
  console.log('🌱 Seeding database...');
  
  try {
    // Check if already seeded
    const existing = await query('SELECT COUNT(*) as count FROM user_profiles');
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('Database already seeded, skipping...');
      return;
    }
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const hashedParentPassword = await bcrypt.hash('parent123', 10);
    
    // Create admin user
    const adminId = generateUUID();
    await query(
      `INSERT INTO auth_users (id, email, encrypted_password) VALUES ($1, $2, $3)`,
      [adminId, 'admin@yamzcafe.com', hashedPassword]
    );
    await query(
      `INSERT INTO user_profiles (id, email, full_name, role, password_set, permissions, account_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, 'admin@yamzcafe.com', 'Admin User', 'admin', true, JSON.stringify(["all"]), 'active']
    );
    
    // Create staff user
    const staffId = generateUUID();
    await query(
      `INSERT INTO auth_users (id, email, encrypted_password) VALUES ($1, $2, $3)`,
      [staffId, 'staff@yamzcafe.com', hashedPassword]
    );
    await query(
      `INSERT INTO user_profiles (id, email, full_name, role, password_set, permissions, account_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [staffId, 'staff@yamzcafe.com', 'Staff Member', 'staff', true, JSON.stringify(["manage_menu","manage_orders"]), 'active']
    );
    
    // Create cashier user
    const cashierId = generateUUID();
    await query(
      `INSERT INTO auth_users (id, email, encrypted_password) VALUES ($1, $2, $3)`,
      [cashierId, 'cashier@yamzcafe.com', hashedPassword]
    );
    await query(
      `INSERT INTO user_profiles (id, email, full_name, role, password_set, permissions, account_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [cashierId, 'cashier@yamzcafe.com', 'Cashier One', 'cashier', true, JSON.stringify(["process_transactions"]), 'active']
    );
    
    // Create parent user
    const parentId = generateUUID();
    await query(
      `INSERT INTO auth_users (id, email, encrypted_password) VALUES ($1, $2, $3)`,
      [parentId, 'parent@example.com', hashedParentPassword]
    );
    await query(
      `INSERT INTO user_profiles (id, email, full_name, role, phone_number, password_set, account_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [parentId, 'parent@example.com', 'Jane Smith', 'parent', '555-0101', true, 'active']
    );
    
    // Create students
    const students = [
      { studentId: 'STU001', name: 'Alex Smith', grade: '5th', balance: 25.50 },
      { studentId: 'STU002', name: 'Emma Johnson', grade: '4th', balance: 15.00 },
      { studentId: 'STU003', name: 'Liam Williams', grade: '6th', balance: 5.25 },
      { studentId: 'STU004', name: 'Sophia Brown', grade: '3rd', balance: 30.00 },
      { studentId: 'STU005', name: 'Noah Davis', grade: '5th', balance: 2.00 },
    ];
    
    const studentIds = [];
    for (const s of students) {
      const sId = generateUUID();
      studentIds.push(sId);
      await query(
        `INSERT INTO user_profiles (id, student_id, full_name, role, grade, balance, account_status, parent_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sId, s.studentId, s.name, 'student', s.grade, s.balance, 'active', parentId]
      );
      
      // Link parent to student
      await query(
        `INSERT INTO parent_students (parent_id, student_id) VALUES ($1, $2)`,
        [parentId, sId]
      );
    }
    
    // Create menu categories
    const categories = ['Breakfast', 'Lunch', 'Snacks', 'Beverages'];
    for (let i = 0; i < categories.length; i++) {
      await query(
        `INSERT INTO meal_categories (name, display_order) VALUES ($1, $2)`,
        [categories[i], i + 1]
      );
    }
    
    // Create menu items
    const menuItems = [
      { name: 'Pancakes', desc: 'Fluffy buttermilk pancakes with syrup', cat: 'Breakfast', price: 3.50, stock: 50 },
      { name: 'Scrambled Eggs', desc: 'Farm fresh scrambled eggs', cat: 'Breakfast', price: 2.50, stock: 40 },
      { name: 'Fruit Cup', desc: 'Fresh seasonal fruit mix', cat: 'Breakfast', price: 2.00, stock: 30 },
      { name: 'Chicken Sandwich', desc: 'Grilled chicken on whole wheat', cat: 'Lunch', price: 4.50, stock: 35 },
      { name: 'Pizza Slice', desc: 'Cheese pizza with marinara', cat: 'Lunch', price: 3.00, stock: 60 },
      { name: 'Garden Salad', desc: 'Mixed greens with ranch dressing', cat: 'Lunch', price: 3.50, stock: 25 },
      { name: 'Mac & Cheese', desc: 'Creamy macaroni and cheese', cat: 'Lunch', price: 3.00, stock: 45 },
      { name: 'Apple', desc: 'Fresh red apple', cat: 'Snacks', price: 1.00, stock: 100 },
      { name: 'Granola Bar', desc: 'Oats and honey granola bar', cat: 'Snacks', price: 1.50, stock: 80 },
      { name: 'Milk', desc: '8oz low-fat milk', cat: 'Beverages', price: 1.00, stock: 100 },
      { name: 'Juice Box', desc: 'Apple juice box', cat: 'Beverages', price: 1.25, stock: 75 },
      { name: 'Water', desc: 'Bottled water', cat: 'Beverages', price: 0.75, stock: 200 },
    ];
    
    const menuItemIds = [];
    for (const item of menuItems) {
      const result = await query(
        `INSERT INTO menu_items (name, description, category, price, is_available, stock_quantity) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [item.name, item.desc, item.cat, item.price, true, item.stock]
      );
      menuItemIds.push(result.rows[0].id);
    }
    
    // Create some sample transactions
    const txId1 = generateUUID();
    await query(
      `INSERT INTO transactions (id, student_id, type, amount, payment_method, status, processed_by, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [txId1, studentIds[0], 'purchase', 7.00, 'account', 'completed', cashierId, 'Lunch purchase']
    );
    
    await query(
      `INSERT INTO transaction_items (transaction_id, menu_item_id, item_name, quantity, price, unit_price) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [txId1, menuItemIds[3], 'Chicken Sandwich', 1, 4.50, 4.50]
    );
    await query(
      `INSERT INTO transaction_items (transaction_id, menu_item_id, item_name, quantity, price, unit_price) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [txId1, menuItemIds[9], 'Milk', 1, 1.00, 1.00]
    );
    
    const txId2 = generateUUID();
    await query(
      `INSERT INTO transactions (id, student_id, type, amount, payment_method, status, processed_by, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [txId2, studentIds[1], 'credit', 20.00, 'cash', 'completed', staffId, 'Balance top-up']
    );
    
    // Create dietary restriction templates
    const restrictions = [
      { name: 'Peanut Allergy', severity: 'high', desc: 'Allergic to peanuts and peanut products' },
      { name: 'Gluten Free', severity: 'medium', desc: 'Cannot consume gluten-containing foods' },
      { name: 'Lactose Intolerant', severity: 'medium', desc: 'Cannot digest lactose properly' },
      { name: 'Vegetarian', severity: 'low', desc: 'Does not eat meat' },
      { name: 'Vegan', severity: 'low', desc: 'Does not eat any animal products' },
    ];
    
    let firstRestrictionId = null;
    for (const r of restrictions) {
      const result = await query(
        `INSERT INTO dietary_restriction_templates (name, severity, description) VALUES ($1, $2, $3) RETURNING id`,
        [r.name, r.severity, r.desc]
      );
      if (!firstRestrictionId) firstRestrictionId = result.rows[0].id;
    }
    
    // Add a dietary restriction for a student
    await query(
      `INSERT INTO dietary_restrictions (student_id, restriction_id, parent_verified, status) VALUES ($1, $2, $3, $4)`,
      [studentIds[0], firstRestrictionId, true, 'active']
    );
    
    console.log('✅ Database seeded successfully!');
    console.log('');
    console.log('Demo accounts:');
    console.log('  Admin:   admin@yamzcafe.com / admin123');
    console.log('  Staff:   staff@yamzcafe.com / admin123');
    console.log('  Cashier: cashier@yamzcafe.com / admin123');
    console.log('  Parent:  parent@example.com / parent123');
    
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  }
}

module.exports = { seedDatabase };