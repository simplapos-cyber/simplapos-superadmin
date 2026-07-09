import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL fehlt"); process.exit(1); }

const conn = await mysql.createConnection(url);

try {
  // Spalten einzeln hinzufügen (ignoriert Fehler wenn bereits vorhanden)
  const alterations = [
    "ALTER TABLE marketing_posts ADD COLUMN videoUrl TEXT NULL AFTER imageKey",
    "ALTER TABLE marketing_posts ADD COLUMN videoKey VARCHAR(512) NULL AFTER videoUrl",
    "ALTER TABLE marketing_posts ADD COLUMN mediaType ENUM('image', 'video') NOT NULL DEFAULT 'image' AFTER videoKey",
  ];

  for (const sql of alterations) {
    try {
      await conn.query(sql);
      console.log("OK:", sql.substring(0, 60));
    } catch (err) {
      if (err.code === "ER_DUP_FIELDNAME") {
        console.log("Bereits vorhanden:", sql.substring(40, 80));
      } else {
        throw err;
      }
    }
  }
  console.log("Migration abgeschlossen.");
} catch (err) {
  console.error("Migration fehlgeschlagen:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
