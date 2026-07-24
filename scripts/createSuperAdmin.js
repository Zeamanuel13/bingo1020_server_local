// One-time bootstrap: create the first super_admin in the CLOUD database.
// Usage: node scripts/createSuperAdmin.js <username> <password> [name]
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('../src/models/User');
const { MONGO_URI } = require('../src/config/env');

async function main() {
  const [username, password, name] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Usage: node scripts/createSuperAdmin.js <username> <password> [name]');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ username, role: 'super_admin' });
  if (existing) {
    console.error(`Super admin "${username}" already exists`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    shopId: 'cloud',
    name: name || username,
    username,
    passwordHash,
    role: 'super_admin',
    status: 'active',
  });

  console.log(`Created super admin "${admin.username}"`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
