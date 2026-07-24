// Imports the player app's bundled assets/data.json (26,000 pregenerated cards) into the
// `cartelas` reference collection, so the Admin app can look up a card's number layout
// during disputes without needing the Flutter asset. Run with: npm run import:cartelas
// Optional arg: path to data.json (defaults to the sibling bingo1020_tigray checkout).
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();
const Cartela = require('../src/models/Cartela');
const { MONGO_URI } = require('../src/config/env');

const defaultSource = path.resolve(__dirname, '../../bingo1020_tigray/assets/data.json');
const sourcePath = process.argv[2] || defaultSource;

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Cartela source file not found: ${sourcePath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  console.log(`[import:cartelas] read ${raw.length} cards from ${sourcePath}`);

  await mongoose.connect(MONGO_URI);

  const ops = raw.map((entry) => ({
    updateOne: {
      filter: { cartelaNo: entry.cartela_no },
      update: { $set: { cartelaNo: entry.cartela_no, bingoNumbers: entry.bingo_numbers } },
      upsert: true,
    },
  }));

  const BATCH = 2000;
  let written = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Cartela.bulkWrite(ops.slice(i, i + BATCH));
    written += result.upsertedCount + result.modifiedCount;
    console.log(`[import:cartelas] ${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }

  console.log(`[import:cartelas] done, ${written} documents written/updated`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
