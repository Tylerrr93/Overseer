// ============================================================
//  src/engine/core/GameConfig.ts
//  All magic numbers live here.  Change values here to tune
//  the game without hunting through engine code.
// ============================================================

export const GameConfig = Object.freeze({
  // Grid
  TILE_SIZE:          32,      // px per tile
  CHUNK_SIZE:         16,      // tiles per chunk edge
  RENDER_CHUNK_RADIUS: 4,      // chunks around player to render

  // Timing
  TARGET_FPS:            60,
  DEFAULT_DOODAD_TICK_MS: 500, // ms between doodad logic ticks

  // Belt
  BELT_ITEMS_PER_SECOND: 2,    // items a belt moves per second

  // Player
  PLAYER_SPEED_PX_S:   160,    // px/s base move speed
  PLAYER_INV_SLOTS:      24,

  // Persistence
  SAVE_KEY:           "digitized_overseer_save",
  SAVE_VERSION:       2,  // bumped: fuel slot added to iron_extractor
});
