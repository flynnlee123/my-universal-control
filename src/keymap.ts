// uiohook keycode (Virtual) to macOS Hardware Keycode
// Source for uiohook: uiohook.h
// Source for macOS: Carbon/HIToolbox/Events.h

export const UIOHOOK_TO_MAC_MAP: Record<number, number> = {
  // --- Functional Keys ---
  0x0001: 0x35, // VC_ESCAPE (1) -> kVK_Escape (53)
  0x000E: 0x33, // VC_BACKSPACE (14) -> kVK_Delete (51)
  0x000F: 0x30, // VC_TAB (15) -> kVK_Tab (48)
  0x001C: 0x24, // VC_ENTER (28) -> kVK_Return (36)
  0x0039: 0x31, // VC_SPACE (57) -> kVK_Space (49)
  
  // --- Modifiers (Left) ---
  0x002A: 0x38, // VC_SHIFT_L -> kVK_Shift
  0x001D: 0x3B, // VC_CONTROL_L -> kVK_Control
  0x0038: 0x3A, // VC_ALT_L (Option) -> kVK_Option
  0x0E5B: 0x37, // VC_META_L (Command) -> kVK_Command
  
  // --- Modifiers (Right) ---
  0x0036: 0x3C, // VC_SHIFT_R -> kVK_RightShift
  0x0E1D: 0x3E, // VC_CONTROL_R -> kVK_RightControl
  0x0E38: 0x3D, // VC_ALT_R (Option) -> kVK_RightOption
  0x0E5C: 0x36, // VC_META_R (Command) -> kVK_RightCommand

  // --- Arrows ---
  0xE048: 0x7E, // VC_UP -> kVK_UpArrow
  0xE050: 0x7D, // VC_DOWN -> kVK_DownArrow
  0xE04B: 0x7B, // VC_LEFT -> kVK_LeftArrow
  0xE04D: 0x7C, // VC_RIGHT -> kVK_RightArrow

  // --- Numbers (Main Keyboard) ---
  0x000B: 0x1D, // 0 -> kVK_ANSI_0
  0x0002: 0x12, // 1 -> kVK_ANSI_1
  0x0003: 0x13, // 2 -> kVK_ANSI_2
  0x0004: 0x14, // 3 -> kVK_ANSI_3
  0x0005: 0x15, // 4 -> kVK_ANSI_4
  0x0006: 0x17, // 5 -> kVK_ANSI_5
  0x0007: 0x16, // 6 -> kVK_ANSI_6
  0x0008: 0x1A, // 7 -> kVK_ANSI_7
  0x0009: 0x1C, // 8 -> kVK_ANSI_8
  0x000A: 0x19, // 9 -> kVK_ANSI_9

  // --- Letters ---
  0x001E: 0x00, // A -> kVK_ANSI_A
  0x0030: 0x0B, // B -> kVK_ANSI_B
  0x002E: 0x08, // C -> kVK_ANSI_C
  0x0020: 0x02, // D -> kVK_ANSI_D
  0x0012: 0x0E, // E -> kVK_ANSI_E
  0x0021: 0x03, // F -> kVK_ANSI_F
  0x0022: 0x05, // G -> kVK_ANSI_G
  0x0023: 0x04, // H -> kVK_ANSI_H
  0x0017: 0x22, // I -> kVK_ANSI_I
  0x0024: 0x26, // J -> kVK_ANSI_J
  0x0025: 0x28, // K -> kVK_ANSI_K
  0x0026: 0x25, // L -> kVK_ANSI_L
  0x0032: 0x2E, // M -> kVK_ANSI_M
  0x0031: 0x2D, // N -> kVK_ANSI_N
  0x0018: 0x1F, // O -> kVK_ANSI_O
  0x0019: 0x23, // P -> kVK_ANSI_P
  0x0010: 0x0C, // Q -> kVK_ANSI_Q
  0x0013: 0x0F, // R -> kVK_ANSI_R
  0x001F: 0x01, // S -> kVK_ANSI_S
  0x0014: 0x11, // T -> kVK_ANSI_T
  0x0016: 0x20, // U -> kVK_ANSI_U
  0x002F: 0x09, // V -> kVK_ANSI_V
  0x0011: 0x0D, // W -> kVK_ANSI_W
  0x002D: 0x07, // X -> kVK_ANSI_X
  0x0015: 0x10, // Y -> kVK_ANSI_Y
  0x002C: 0x06, // Z -> kVK_ANSI_Z

  // --- Symbols ---
  0x000C: 0x1B, // VC_MINUS (-) -> kVK_ANSI_Minus
  0x000D: 0x18, // VC_EQUALS (=) -> kVK_ANSI_Equal
  0x001A: 0x21, // VC_OPEN_BRACKET ([) -> kVK_ANSI_LeftBracket
  0x001B: 0x1E, // VC_CLOSE_BRACKET (]) -> kVK_ANSI_RightBracket
  0x002B: 0x2A, // VC_BACK_SLASH (\) -> kVK_ANSI_Backslash
  0x0027: 0x29, // VC_SEMICOLON (;) -> kVK_ANSI_Semicolon
  0x0028: 0x27, // VC_QUOTE (') -> kVK_ANSI_Quote
  0x0033: 0x2B, // VC_COMMA (,) -> kVK_ANSI_Comma
  0x0034: 0x2F, // VC_PERIOD (.) -> kVK_ANSI_Period
  0x0035: 0x2C, // VC_SLASH (/) -> kVK_ANSI_Slash
  0x0029: 0x32, // VC_BACKQUOTE (`) -> kVK_ANSI_Grave
};