// シナリオの一覧（やさしい順）。新しいシナリオは mansion.mjs と同じ形のファイルを作り、ここに1行足す。
import mansion from './mansion.mjs'
import ship from './ship.mjs'
import lodge from './lodge.mjs'

export const SCENARIOS = [mansion, ship, lodge]
export const byId = id => SCENARIOS.find(s => s.id === id) || SCENARIOS[0]
