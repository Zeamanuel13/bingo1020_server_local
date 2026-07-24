// One-time bootstrap: create the first Admin user for this shop's local DB, since the
// Admin app has no self-registration (an install without any user could never log in).
// Usage: node scripts/createAdmin.js <username> <password> <name>
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('../src/models/User');
const { MONGO_URI, SHOP_ID } = require('../src/config/env');

async function main() {
  const [username, password, name] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Usage: node scripts/createAdmin.js <username> <password> [name]');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ shopId: SHOP_ID, username });
  if (existing) {
    console.error(`User "${username}" already exists for shop ${SHOP_ID}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    shopId: SHOP_ID,
    name: name || username,
    username,
    passwordHash,
    role: 'admin',
    status: 'active',
  });

  console.log(`Created admin "${admin.username}" for shop ${SHOP_ID}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
