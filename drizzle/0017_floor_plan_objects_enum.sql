-- Migration 0017: floor_plan_objects type Enum erweitert
-- Fügt alle fehlenden Objekt-Typen hinzu die im FloorPlanDesigner verwendet werden
ALTER TABLE `floor_plan_objects` MODIFY COLUMN `type` ENUM(
  'table_round','table_square','table_rect','table_long','table_high','table_banquet','table_custom',
  'table_oval','table_corner','table_booth',
  'chair','barstool','bench','sofa','lounge_chair','outdoor_chair','highchair',
  'bar','bar_corner','kitchen','cashier','buffet','salad_bar','reception',
  'wardrobe','wine_rack','coffee_machine','ice_cream','display_case','serving_station',
  'wall','wall_thick','door','door_double','door_sliding',
  'window','window_large','stairs','elevator','emergency_exit',
  'column','pillar_rect','toilet','toilet_disabled',
  'parasol','awning','planter','fence','heater','fountain','playground',
  'plant','plant_large','divider','divider_glass','decoration',
  'aquarium','fireplace','stage','dance_floor','dj_booth'
) NOT NULL;
