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
  SAVE_KEY:              "digitized_overseer_save",
  SAVE_TS_KEY:           "digitized_overseer_save_ts",   // unix-ms timestamp of last save
  SAVE_VERSION:          3,   // v3: terrain overhaul — ore tiles replaced by FeatureState system
  AUTOSAVE_INTERVAL_MS:  60_000,

  // Resource generation (Bobiverse post-apocalyptic scarcity)
  /**
   * Noise threshold above which a feature is considered present.
   * Higher = sparser. Range 0–1; 0.92 gives ~8% coverage before cluster check.
   */
  RESOURCE_SPARSITY:          0.92,
  /**
   * Maximum tile radius around a noise peak that remains part of the
   * same deposit cluster. Larger = bigger patches.
   */
  RESOURCE_CLUSTER_SIZE:      3,
  /** Starting yield for a finite resource feature node. */
  RESOURCE_BASE_YIELD:        400,
  /**
   * When true, extractors consume remainingYield each cycle and destroy
   * the feature when it reaches 0.  When false, features are infinite.
   */
  RESOURCE_DEPLETION_ENABLED: true,

  // UI
  UI_SCALE_KEY:          "digitized_overseer_ui_scale",
  UI_SCALE_MIN:          0.6,
  UI_SCALE_MAX:          1.6,
  UI_SCALE_DEFAULT:      1.0,
});
