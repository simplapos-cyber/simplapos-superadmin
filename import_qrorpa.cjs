const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL fehlt!'); process.exit(1); }
  
  console.log('Verbinde...');
  const pool = mysql.createPool({ uri: dbUrl, connectionLimit: 4, connectTimeout: 15000 });
  const conn = await pool.getConnection();
  console.log('Verbunden!');
  
  const orders = JSON.parse(fs.readFileSync('/home/ubuntu/qrorpa_archive/passagino/bestelldaten_komplett.json', 'utf8'));
  console.log(`Zu importieren: ${orders.length} Bestellungen`);
  
  const batchSize = 200;
  let inserted = 0;
  
  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    const values = batch.map(o => {
      const iso = (o.iso_datum || '').replace('T', ' ');
      return [
        o.id, o.datum, o.uhrzeit, iso,
        o.wochentag || '', o.woche || 0,
        o.monat, o.monat_name || '',
        o.quartal || 1, o.jahr,
        o.tisch || '', (o.produkte || '').substring(0, 2000),
        o.mitarbeiter || '', parseFloat(o.betrag_chf) || 0,
        o.zahlungsmethode || '', o.status || ''
      ];
    });
    const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const flat = values.flat();
    try {
      const [result] = await conn.execute(
        `INSERT IGNORE INTO qrorpa_orders 
         (id, datum, uhrzeit, iso_datum, wochentag, woche, monat, monat_name, 
          quartal, jahr, tisch, produkte, mitarbeiter, betrag_chf, zahlungsmethode, status)
         VALUES ${placeholders}`, flat
      );
      inserted += result.affectedRows;
      if (i % 1000 === 0 || i + batchSize >= orders.length) {
        console.log(`  [${Math.min(i + batchSize, orders.length)}/${orders.length}] ${inserted} eingefügt`);
      }
    } catch (e) {
      console.error(`  Fehler bei Batch ${i}: ${e.message}`);
    }
  }
  
  const [rows] = await conn.execute(`
    SELECT monat, jahr, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
    FROM qrorpa_orders GROUP BY jahr, monat ORDER BY jahr, monat
  `);
  
  console.log('\n=== Monats-Übersicht ===');
  let gesamtUmsatz = 0, gesamtAnzahl = 0;
  for (const row of rows) {
    const u = parseFloat(row.umsatz);
    const n = parseInt(row.anzahl);
    gesamtUmsatz += u; gesamtAnzahl += n;
    console.log(`  ${String(row.monat).padStart(2,'0')}/${row.jahr}: ${n} Bestellungen, CHF ${u.toFixed(2)}`);
  }
  console.log(`\nGESAMT: ${gesamtAnzahl} Bestellungen, CHF ${gesamtUmsatz.toFixed(2)}`);
  
  conn.release();
  await pool.end();
  console.log('\nFERTIG!');
}

main().catch(e => { console.error(e); process.exit(1); });
