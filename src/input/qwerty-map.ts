// QWERTY bindings. Each raw value is the key as typed: a bare digit or
// lower-case letter, 'S+X' for Shift+X, 'C+X' for Ctrl+X. The renderer formats
// these into key labels (see theory/labels.ts); input maps them back to keys.

export const QWERTY_LABEL_MAP: Record<number, string> = {
    21: 'C+1', 22: 'C+2', 23: 'C+3', 24: 'C+4', 25: 'C+5', 26: 'C+6', 27: 'C+7', 28: 'C+8',
    29: 'C+9', 30: 'C+0', 31: 'C+Q', 32: 'S+3', 33: 'C+E', 34: 'S+7', 35: 'S+0', 36: '1',
    37: 'S+1', 38: '2', 39: 'S+2', 40: '3', 41: '4', 42: 'S+4', 43: '5', 44: 'S+5',
    45: '6', 46: 'S+6', 47: '7', 48: '8', 49: 'S+8', 50: '9', 51: 'S+9', 52: '0',
    53: 'q', 54: 'S+Q', 55: 'w', 56: 'S+W', 57: 'e', 58: 'S+E', 59: 'r', 60: 't',
    61: 'S+T', 62: 'y', 63: 'S+Y', 64: 'u', 65: 'i', 66: 'S+I', 67: 'o', 68: 'S+O',
    69: 'p', 70: 'S+P', 71: 'a', 72: 's', 73: 'S+S', 74: 'd', 75: 'S+D', 76: 'f',
    77: 'g', 78: 'S+G', 79: 'h', 80: 'S+H', 81: 'j', 82: 'S+J', 83: 'k', 84: 'l',
    85: 'S+L', 86: 'z', 87: 'S+Z', 88: 'x', 89: 'c', 90: 'S+C', 91: 'v', 92: 'S+V',
    93: 'b', 94: 'S+B', 95: 'n', 96: 'm', 97: 'C+Y', 98: 'C+U', 99: 'C+I', 100: 'C+O',
    101: 'S+R', 102: 'S+U', 103: 'S+A', 104: 'S+F', 105: 'S+K', 106: 'S+X', 107: 'S+N', 108: 'S+M',
};

/** Raw QWERTY token ('q', 'S+Q', 'C+1', ...) -> key midi. */
export const QWERTY_INPUT_MAP: ReadonlyMap<string, number> = new Map(
    Object.entries(QWERTY_LABEL_MAP).map(([midi, raw]) => [raw, Number(midi)]),
);
