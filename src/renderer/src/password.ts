import { N_ } from './i18n.ts'

// The passwords Palique accepts: at least 8 characters, with a lowercase and an uppercase
// letter, a digit and a symbol. The server enforces the same (mod_palique_passwords), with
// Lua's plain ASCII classes: letters like ñ or á count as symbols in both.
// Translated where it's shown: _(PASSWORD_RULE).
export const PASSWORD_RULE = N_(
  'Al menos 8 caracteres, con mayúscula, minúscula, número y símbolo.'
)

export const strongPassword = (password: string): boolean =>
  [...password].length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[0-9]/.test(password) &&
  /[^A-Za-z0-9]/.test(password)
