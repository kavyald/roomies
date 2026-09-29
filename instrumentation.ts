import { checkConfigAtStartup } from './lib/config'

export function register() {
  checkConfigAtStartup()
}
