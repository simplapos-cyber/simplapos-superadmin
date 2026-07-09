/**
 * seed-cola.mjs
 * Erstellt das Coca-Cola Beispiel:
 * 1. Prüft welche Restaurants vorhanden sind
 * 2. Prüft ob "Coca-Cola" bereits als Menüartikel existiert
 * 3. Erstellt Lagerartikel "Coca-Cola 33cl" mit 10 Stück
 * 4. Verknüpft Menüartikel mit Lagerartikel via Rezeptur (1 Stück pro Verkauf)
 * Spaltenbezeichnungen: camelCase (restaurantId, menuItemId, etc.)
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // 1. Restaurants prüfen
  const [restaurants] = await conn.execute('SELECT id, name FROM restaurants LIMIT 5');
  console.log('Restaurants:', JSON.stringify(restaurants));

  if (!restaurants.length) {
    console.error('Keine Restaurants gefunden.');
    process.exit(1);
  }

  const restaurantId = restaurants[0].id;
  console.log(`\nVerwende Restaurant ID: ${restaurantId} (${restaurants[0].name})\n`);

  // 2. Prüfe ob Coca-Cola Menüartikel existiert
  const [existingMenuItems] = await conn.execute(
    "SELECT id, name FROM menu_items WHERE restaurantId = ? AND name LIKE '%Cola%' LIMIT 5",
    [restaurantId]
  );
  console.log('Bestehende Cola-Menüartikel:', JSON.stringify(existingMenuItems));

  let menuItemId;
  if (existingMenuItems.length > 0) {
    menuItemId = existingMenuItems[0].id;
    console.log(`✓ Verwende bestehenden Menüartikel ID: ${menuItemId} (${existingMenuItems[0].name})`);
  } else {
    // Kategorie prüfen/erstellen
    const [categories] = await conn.execute(
      'SELECT id FROM menu_categories WHERE restaurantId = ? LIMIT 1',
      [restaurantId]
    );

    let categoryId;
    if (categories.length > 0) {
      categoryId = categories[0].id;
      console.log(`✓ Verwende bestehende Kategorie ID: ${categoryId}`);
    } else {
      const [catResult] = await conn.execute(
        "INSERT INTO menu_categories (restaurantId, name, sortOrder, isActive) VALUES (?, 'Getränke', 1, 1)",
        [restaurantId]
      );
      categoryId = catResult.insertId;
      console.log(`✓ Kategorie 'Getränke' erstellt (ID: ${categoryId})`);
    }

    // Menüartikel erstellen
    const [menuResult] = await conn.execute(
      `INSERT INTO menu_items (restaurantId, categoryId, name, description, price, itemType, isActive, isAvailable, sortOrder, totalSold)
       VALUES (?, ?, 'Coca-Cola 33cl', 'Klassische Coca-Cola, 33cl gekühlt', 4.50, 'beverage', 1, 1, 1, 0)`,
      [restaurantId, categoryId]
    );
    menuItemId = menuResult.insertId;
    console.log(`✓ Menüartikel 'Coca-Cola 33cl' erstellt (ID: ${menuItemId}, CHF 4.50)`);
  }

  // 3. Prüfe ob Lagerartikel bereits existiert
  const [existingInventory] = await conn.execute(
    "SELECT id, name, currentStock FROM inventory_items WHERE restaurantId = ? AND name LIKE '%Cola%' LIMIT 5",
    [restaurantId]
  );
  console.log('Bestehende Cola-Lagerartikel:', JSON.stringify(existingInventory));

  let inventoryItemId;
  if (existingInventory.length > 0) {
    inventoryItemId = existingInventory[0].id;
    // Bestand auf 10 setzen
    await conn.execute(
      'UPDATE inventory_items SET currentStock = 10 WHERE id = ?',
      [inventoryItemId]
    );
    console.log(`✓ Lagerartikel ID ${inventoryItemId} aktualisiert: Bestand = 10 Stück`);
  } else {
    // Lagerartikel erstellen
    const [invResult] = await conn.execute(
      `INSERT INTO inventory_items 
       (restaurantId, name, description, unit, currentStock, minStock, maxStock, costPerUnit, category, isActive)
       VALUES (?, 'Coca-Cola 33cl', 'Coca-Cola Dose 33cl', 'Stück', 10, 5, 200, 0.85, 'Getränke', 1)`,
      [restaurantId]
    );
    inventoryItemId = invResult.insertId;
    console.log(`✓ Lagerartikel 'Coca-Cola 33cl' erstellt (ID: ${inventoryItemId}), Bestand: 10 Stück`);

    // Lagerbewegung für Anfangsbestand
    await conn.execute(
      `INSERT INTO inventory_stock_movements 
       (restaurantId, itemId, type, quantity, stockAfter, notes)
       VALUES (?, ?, 'purchase', 10, 10, 'Anfangsbestand (Demo-Setup)')`,
      [restaurantId, inventoryItemId]
    );
    console.log(`✓ Lagerbewegung "Anfangsbestand +10" eingetragen`);
  }

  // 4. Rezeptur verknüpfen
  const [existingRecipe] = await conn.execute(
    'SELECT id FROM inventory_recipes WHERE menuItemId = ? AND inventoryItemId = ?',
    [menuItemId, inventoryItemId]
  );

  if (existingRecipe.length > 0) {
    await conn.execute(
      'UPDATE inventory_recipes SET quantity = 1 WHERE menuItemId = ? AND inventoryItemId = ?',
      [menuItemId, inventoryItemId]
    );
    console.log(`✓ Rezeptur aktualisiert (ID: ${existingRecipe[0].id}): 1 Stück pro Verkauf`);
  } else {
    const [recipeResult] = await conn.execute(
      `INSERT INTO inventory_recipes (restaurantId, menuItemId, inventoryItemId, quantity, unit, conversionFactor)
       VALUES (?, ?, ?, 1, 'Stück', 1)`,
      [restaurantId, menuItemId, inventoryItemId]
    );
    console.log(`✓ Rezeptur erstellt (ID: ${recipeResult.insertId}): Menüartikel ${menuItemId} → Lagerartikel ${inventoryItemId}, 1 Stück pro Verkauf`);
  }

  // 5. Abschluss-Prüfung
  const [finalStock] = await conn.execute(
    'SELECT id, name, currentStock, unit FROM inventory_items WHERE id = ?',
    [inventoryItemId]
  );
  const [finalRecipe] = await conn.execute(
    'SELECT r.id, r.quantity, r.unit, m.name as menuName, i.name as itemName FROM inventory_recipes r JOIN menu_items m ON m.id = r.menuItemId JOIN inventory_items i ON i.id = r.inventoryItemId WHERE r.menuItemId = ? AND r.inventoryItemId = ?',
    [menuItemId, inventoryItemId]
  );

  console.log('\n========== ERGEBNIS ==========');
  console.log(`Restaurant:    ID ${restaurantId} – "${restaurants[0].name}"`);
  console.log(`Menüartikel:   ID ${menuItemId} – "Coca-Cola 33cl" (CHF 4.50)`);
  console.log(`Lagerartikel:  ID ${inventoryItemId} – "${finalStock[0].name}", Bestand: ${finalStock[0].currentStock} ${finalStock[0].unit}`);
  if (finalRecipe.length > 0) {
    console.log(`Rezeptur:      "${finalRecipe[0].menuName}" → ${finalRecipe[0].quantity} ${finalRecipe[0].unit} "${finalRecipe[0].itemName}"`);
  }
  console.log('==============================');
  console.log('');
  console.log('✅ BEREIT! Ablauf beim Verkauf:');
  console.log('   Kellner bestellt "Coca-Cola 33cl"');
  console.log('   → closeOrder() wird aufgerufen');
  console.log('   → deductStockFromOrder() liest Rezeptur');
  console.log('   → Lagerbestand: 10 → 9 Stück');
  console.log('   → Bewegungseintrag: type="sale", quantity=-1');

} catch (err) {
  console.error('Fehler:', err.message);
  console.error(err.stack);
} finally {
  await conn.end();
}
