-- Custom SQL migration file, put your code below! --

-- Menu Tax Classes
CREATE TABLE IF NOT EXISTS `menu_tax_classes` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `rate` decimal(5,2) NOT NULL,
  `isDefault` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Menu Categories
CREATE TABLE IF NOT EXISTS `menu_categories` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `parentId` int,
  `name` varchar(128) NOT NULL,
  `nameTranslations` json,
  `description` text,
  `imageUrl` text,
  `color` varchar(16),
  `icon` varchar(64),
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `isVisible` boolean NOT NULL DEFAULT true,
  `availabilityType` enum('always','scheduled','manual') NOT NULL DEFAULT 'always',
  `availabilitySchedule` json,
  `defaultCourseNumber` int DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Menu Modifier Groups
CREATE TABLE IF NOT EXISTS `menu_modifier_groups` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `nameTranslations` json,
  `selectionType` enum('single','multiple','quantity') NOT NULL DEFAULT 'multiple',
  `isRequired` boolean NOT NULL DEFAULT false,
  `minSelections` int NOT NULL DEFAULT 0,
  `maxSelections` int,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Menu Modifiers
CREATE TABLE IF NOT EXISTS `menu_modifiers` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `groupId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `nameTranslations` json,
  `priceAdjustment` decimal(10,2) NOT NULL DEFAULT '0.00',
  `isDefault` boolean NOT NULL DEFAULT false,
  `isActive` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `allergens` json,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Menu Items
CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `categoryId` int,
  `taxClassId` int,
  `name` varchar(255) NOT NULL,
  `nameTranslations` json,
  `description` text,
  `descriptionTranslations` json,
  `shortDescription` varchar(255),
  `price` decimal(10,2) NOT NULL,
  `priceType` enum('fixed','variable','from') NOT NULL DEFAULT 'fixed',
  `costPrice` decimal(10,2),
  `imageUrl` text,
  `itemType` enum('food','beverage','dessert','set_menu','other') NOT NULL DEFAULT 'food',
  `courseNumber` int DEFAULT 1,
  `allergens` json,
  `labels` json,
  `isActive` boolean NOT NULL DEFAULT true,
  `isAvailable` boolean NOT NULL DEFAULT true,
  `availabilityType` enum('always','scheduled','manual') NOT NULL DEFAULT 'always',
  `availabilitySchedule` json,
  `preparationTime` int,
  `kitchenStation` varchar(64),
  `kdsNote` text,
  `sortOrder` int NOT NULL DEFAULT 0,
  `totalSold` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Menu Item Variant Groups
CREATE TABLE IF NOT EXISTS `menu_item_variant_groups` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `menuItemId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `nameTranslations` json,
  `isRequired` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Menu Item Variant Options
CREATE TABLE IF NOT EXISTS `menu_item_variant_options` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `variantGroupId` int NOT NULL,
  `menuItemId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `nameTranslations` json,
  `priceAdjustment` decimal(10,2) NOT NULL DEFAULT '0.00',
  `isDefault` boolean NOT NULL DEFAULT false,
  `isActive` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Menu Item Modifier Group Links
CREATE TABLE IF NOT EXISTS `menu_item_modifier_groups` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `menuItemId` int NOT NULL,
  `modifierGroupId` int NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0
);

-- Menu Sets
CREATE TABLE IF NOT EXISTS `menu_sets` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `categoryId` int,
  `name` varchar(255) NOT NULL,
  `nameTranslations` json,
  `description` text,
  `price` decimal(10,2) NOT NULL,
  `imageUrl` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `availabilityType` enum('always','scheduled','manual') NOT NULL DEFAULT 'always',
  `availabilitySchedule` json,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Menu Set Courses
CREATE TABLE IF NOT EXISTS `menu_set_courses` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `menuSetId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `nameTranslations` json,
  `courseNumber` int NOT NULL,
  `minChoices` int NOT NULL DEFAULT 1,
  `maxChoices` int NOT NULL DEFAULT 1,
  `menuItemIds` json NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Drop old simple tables (replaced by new menu_ tables)
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `extras`;