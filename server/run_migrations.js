const fs = require('fs');
const path = require('path');

// Load .env from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('./config/database');

(async () => {
  const output = [];
  try {
    await db.getDB();
    output.push('DB initialized with migrations');
    
    const result = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'pre_orders' ORDER BY ordinal_position");
    output.push('pre_orders columns: ' + result.rows.map(r => r.column_name).join(', '));
    
    const smResult = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'scheduled_menus' ORDER BY ordinal_position");
    output.push('scheduled_menus columns: ' + smResult.rows.map(r => r.column_name).join(', '));
    
    fs.writeFileSync('/tmp/migration_output.txt', output.join('\n'));
    console.log(output.join('\n'));
    process.exit(0);
  } catch (err) {
    const errMsg = 'Error: ' + err.message;
    fs.writeFileSync('/tmp/migration_output.txt', errMsg);
    console.error(errMsg);
    process.exit(1);
  }
})();