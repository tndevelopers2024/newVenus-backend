/**
 * MongoDB Database Backup Script — uses Mongoose (same TLS config as the app)
 * Exports every collection to a separate JSON file.
 * Safe to run — does NOT delete or modify any data.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

// Backup folder: venus-backend/db-backup/YYYY-MM-DD_HH-MM-SS/
const timestamp = new Date()
  .toISOString()
  .replace(/T/, '_')
  .replace(/:/g, '-')
  .replace(/\..+/, '');
const BACKUP_DIR = path.join(__dirname, 'db-backup', timestamp);
// ───────────────────────────────────────────────────────────────────────────

async function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  console.log('\n🔌 Connecting to MongoDB Atlas…');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.\n');

  const db = mongoose.connection.db;

  // Discover all collections automatically
  const collectionInfos = await db.listCollections().toArray();
  const collectionNames = collectionInfos.map((c) => c.name).sort();

  if (collectionNames.length === 0) {
    console.log('⚠️  No collections found in the database.');
    await mongoose.disconnect();
    return;
  }

  console.log(`📦 Found ${collectionNames.length} collection(s): ${collectionNames.join(', ')}\n`);

  const summary = [];

  for (const name of collectionNames) {
    process.stdout.write(`  ⏳ Backing up "${name}"… `);
    const docs = await db.collection(name).find({}).toArray();
    const filePath = path.join(BACKUP_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
    console.log(`✔  ${docs.length} document(s)  →  ${name}.json`);
    summary.push({ collection: name, documents: docs.length, file: `${name}.json` });
  }

  // Write a summary manifest
  const manifest = {
    database: db.databaseName,
    backupAt: new Date().toISOString(),
    totalCollections: collectionNames.length,
    totalDocuments: summary.reduce((s, r) => s + r.documents, 0),
    collections: summary,
  };
  fs.writeFileSync(
    path.join(BACKUP_DIR, '_manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log('\n──────────────────────────────────────────────');
  console.log(`✅ Backup complete!`);
  console.log(`📁 Location       : ${BACKUP_DIR}`);
  console.log(`📊 Collections    : ${manifest.totalCollections}`);
  console.log(`📄 Total documents: ${manifest.totalDocuments}`);
  console.log('──────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

backup().catch((err) => {
  console.error('\n❌ Backup failed:', err.message);
  process.exit(1);
});
