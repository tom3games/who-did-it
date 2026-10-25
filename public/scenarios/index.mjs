// シナリオの一覧。新しいシナリオは mansion.mjs と同じ形のファイルを作り、ここに1行足す。
import mansion from './mansion.mjs'

export const SCENARIOS = [mansion]
export const byId = id => SCENARIOS.find(s => s.id === id) || SCENARIOS[0]
