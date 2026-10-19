// UI entry point: panels, settings controls, presets.

import { initPanels } from './panels.js';
import { initControls } from './controls.js';
import { initKeyCount } from './keyCount.js';
import { initPerfHud } from './perfHud.js';
import { initBackground } from './background.js';
import { initPresets, applyBootDefaults } from './presets.js';
import { initOrientation } from './orientation.js';
import { initPianoReferences } from './actions.js';
import { mountColorPad, updateColorPadValue } from './color.js';
import { bindChordColorControls } from '../input/index.js';

export { toggle, openLinkedPanel, openSfPanelTab, setSettingsTab, setVisualPanelPage, closeAllPanels, isUiLayoutLocked } from './panels.js';
export { changeTranspose } from './controls.js';
export { applySettings, getCurrentSettings, applyFactoryDefaults, resetDefaultsFromMemory } from './presets.js';
export { normalizePianoHeightPercent, getPianoMaxHeightPx } from './actions.js';
export { keyInkFor, normalizeHexColor } from './color.js';
export { whiteCountToTuts } from './keyCount.js';

export function initUI(): void {
    applyBootDefaults();
    initPianoReferences();
    initPanels();
    initControls();
    // Chord colour pads: the chord display owns their behaviour, we provide the widget.
    bindChordColorControls({ mount: mountColorPad, update: updateColorPadValue });
    initKeyCount();
    initPerfHud();
    initBackground();
    initPresets();
    initOrientation();
}
