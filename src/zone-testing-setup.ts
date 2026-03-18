/**
 * Load zone.js/testing after Jest is initialized so patchJest can access describe/it/etc.
 * Must be in setupFilesAfterEnv, not setupFiles.
 */
import 'zone.js/testing';
