// シナリオ「雪山の山荘」。上級: 部屋が9つ、細い廊下、手がかりが4つ（特徴が4つ）。形は mansion.mjs と同じ。
export default {
  id: 'lodge',
  title: '雪山の山荘',
  level: 3,
  theme: 'lodge',
  exploreSec: 160,
  lead: '吹雪で山荘に閉じ込められた夜、オーナーが書庫で倒れていた。電話線は切られている。犯人はこの中にいる。',
  victim: '山荘のオーナー 白峰冬彦',
  crimeTime: '22時30分ごろ',
  map: [
    '#################',
    '#BBBB#NNNN#TTTTT#',
    '#BBBB#NNNN#TTTTT#',
    '#BBBB#NNNN#TTTTT#',
    '##+####+#####+###',
    '#HHHHHHHHHHHHHHH#',
    '####+#####+###+##',
    '#WWWWWWW#LLL#SSS#',
    '#WWWWWWW+LLL#SSS#',
    '#WWWWWWW#LLL#SSS#',
    '#WWWWWWW#LLL+SSS#',
    '###+###+######+##',
    '#KKKKK#EEEEEEEEE#',
    '#KKKKK+EEEEEEEEE#',
    '#KKKKK#EEEEEEEEE#',
    '#################'
  ],
  rooms: { B: '青の客間', N: '赤の客間', T: '遊戯室', H: '廊下', W: '暖炉の間', L: '書庫', S: '乾燥室', K: '台所', E: '玄関ホール' },
  floors: { B: 'carpet', N: 'carpet', T: 'parquet', H: 'wood', W: 'rug', L: 'wood', S: 'stone', K: 'tile', E: 'stone' },
  spawnRoom: 'E',
  crimeRoom: 'L',
  spots: [
    { id: 'body', x: 10, y: 9, name: 'オーナーの遺体', icon: 'body', noClue: true, text: 'オーナーは本棚の前で倒れていた。死亡は22時30分ごろ。床に分厚い辞書が落ちている' },
    { id: 'bookshelf', x: 11, y: 7, name: '本棚', icon: 'shelf', text: '登山の本がずらり。1冊だけ新しい本が混ざっている' },
    { id: 'desk', x: 9, y: 10, name: '読書机', icon: 'desk', text: 'ランプがついたまま。宿泊名簿が開いてある' },
    { id: 'fireplace', x: 2, y: 7, name: '暖炉', icon: 'fireplace', text: '薪がぱちぱち燃えている。灰の中に燃え残った紙はない' },
    { id: 'sofa', x: 4, y: 9, name: 'ソファ', icon: 'sofa', text: '毛布が丸めてある。まだ少し温かい' },
    { id: 'chess', x: 6, y: 8, name: 'チェス盤', icon: 'table', text: '白の番で止まっている。黒のキングが1つ足りない' },
    { id: 'bed', x: 1, y: 1, name: '青いベッド', icon: 'bed', text: '枕元に目覚まし時計。5時にセットされている' },
    { id: 'dresser', x: 4, y: 2, name: '化粧台', icon: 'dresser', text: '鏡が少し曇っている。くしに長い髪が1本' },
    { id: 'bed2', x: 9, y: 1, name: '赤いベッド', icon: 'bed', text: 'シーツはしわだらけ。誰かが寝返りを打ったばかりだ' },
    { id: 'trunk', x: 6, y: 2, name: 'スーツケース', icon: 'trunk', text: '鍵がかかっている。持ち手のタグは空港のもの' },
    { id: 'billiard', x: 14, y: 2, name: 'ビリヤード台', icon: 'billiard', text: '8番の球だけがポケットに落ちている' },
    { id: 'toybox', x: 11, y: 1, name: 'おもちゃ箱', icon: 'crate', text: 'トランプとすごろく。トランプのジョーカーが無い' },
    { id: 'skis', x: 15, y: 7, name: 'スキー板の棚', icon: 'skis', text: 'スキー板が5組。1組だけ雪がついている' },
    { id: 'dryer', x: 13, y: 9, name: '靴の乾燥機', icon: 'dryer', text: '温風がごうごう。中は空っぽだ' },
    { id: 'stove', x: 1, y: 12, name: '薪ストーブ', icon: 'stove', text: 'やかんがしゅんしゅん鳴っている' },
    { id: 'sink', x: 2, y: 14, name: '流し', icon: 'sink', text: 'マグカップが2つ洗ってある。まだ濡れている' },
    { id: 'pantry', x: 5, y: 12, name: '食料庫', icon: 'cupboard', text: '缶詰とパン。3日分はありそうだ' },
    { id: 'coat', x: 15, y: 12, name: 'コート掛け', icon: 'coat', text: 'コートが8着。1着だけ雪で濡れている' },
    { id: 'shoebox', x: 10, y: 14, name: '靴箱', icon: 'shoebox', text: '靴が並んでいる。数は泊まり客の人数と合う' },
    { id: 'clock', x: 12, y: 12, name: '柱時計', icon: 'clock', text: '22時15分で止まっている。ねじが切れたらしい' }
  ],
  cast: ['登山家', 'シェフ', 'スキー講師', '作家', '写真家', '医者', '管理人', '学生'],
  looks: { 登山家: 'knit', シェフ: 'chef', スキー講師: 'helmet', 作家: 'glasses', 写真家: 'beret', 医者: 'mirror', 管理人: 'cap', 学生: 'ribbon' },
  traits: [
    {
      key: 'hand', label: '利き手', values: [
        { v: 'L', label: '左利き', clue: '辞書の背に、左手でつかんだ指の跡がくっきり' },
        { v: 'R', label: '右利き', clue: '辞書の背に、右手でつかんだ指の跡がくっきり' }
      ]
    },
    {
      key: 'shoe', label: '靴', values: [
        { v: 'snowboot', label: 'スノーブーツ', clue: '雪の溶けた大きなブーツの跡が続いている' },
        { v: 'slipper', label: 'スリッパ', clue: 'ぺたぺたとスリッパの平たい跡が続いている' }
      ]
    },
    {
      key: 'scent', label: '香り', values: [
        { v: 'smoke', label: '薪の煙', clue: '薪の煙のにおいがしみた毛糸くずが落ちている' },
        { v: 'cocoa', label: 'ココア', clue: '甘いココアのしみがついた紙ナプキンが落ちている' },
        { v: 'mint', label: 'ハッカ', clue: 'ハッカ飴の包み紙が落ちている' }
      ]
    },
    {
      key: 'glove', label: '手袋', values: [
        { v: 'wool', label: '毛糸の手袋', clue: '本棚の角に、毛糸の手袋の毛玉が引っかかっている' },
        { v: 'leather', label: '革の手袋', clue: '本棚の角に、革の手袋でこすれた黒い跡がある' }
      ]
    }
  ],
  alibiRoom: '暖炉の間'
}
