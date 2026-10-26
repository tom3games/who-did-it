// シナリオ「豪華客船オーロラ号」。中級: 部屋が8つ、甲板が広い。形は mansion.mjs と同じ。
export default {
  id: 'ship',
  title: '豪華客船オーロラ号',
  level: 2,
  theme: 'ship',
  exploreSec: 145,
  lead: '夜の航海の途中、船長が船長室で倒れているのが見つかった。港まではあと半日。犯人はまだ船の上にいる。',
  victim: '船長 海堂丈二',
  crimeTime: '23時10分ごろ',
  map: [
    '################',
    '#CCCC#AAAA#PPPP#',
    '#CCCC#AAAA#PPPP#',
    '#CCCC#AAAA#PPPP#',
    '###+####+###+###',
    '#LLLLLLLLLLLLLL#',
    '#LLLLLLLLLLLLLL#',
    '##+#####+####+##',
    '#RRRRR#KKKK#MMM#',
    '#RRRRR+KKKK#MMM#',
    '#RRRRR#KKKK#MMM#',
    '###+#########+##',
    '#DDDDDDDDDDDDDD#',
    '#DDDDDDDDDDDDDD#',
    '#DDDDDDDDDDDDDD#',
    '################'
  ],
  rooms: { C: '船長室', A: '客室', P: '舞踏室', L: '通路', R: '食堂', K: '厨房', M: '機関室', D: '甲板' },
  floors: { C: 'wood', A: 'carpet', P: 'parquet', L: 'rug', R: 'carpet', K: 'tile', M: 'metal', D: 'deck' },
  spawnRoom: 'D',
  crimeRoom: 'C',
  spots: [
    { id: 'body', x: 2, y: 2, name: '船長の遺体', icon: 'body', noClue: true, text: '船長は舵輪の模型のそばに倒れていた。死亡は23時10分ごろ。手には航海日誌の切れ端' },
    { id: 'chart', x: 4, y: 1, name: '海図の机', icon: 'desk', text: '海図に赤い丸が1つ。予定の航路から少し外れている' },
    { id: 'safe', x: 1, y: 1, name: '金庫', icon: 'safe', text: '金庫は閉まっている。ダイヤルに指紋は残っていない' },
    { id: 'bunk', x: 6, y: 1, name: '二段ベッド', icon: 'bed', text: '上の段に読みかけの小説。しおりは最後のページに挟まっている' },
    { id: 'trunk', x: 9, y: 2, name: '旅行かばん', icon: 'trunk', text: '中身は替えのシャツと双眼鏡。荷札には外国の港の名前' },
    { id: 'piano', x: 14, y: 1, name: 'グランドピアノ', icon: 'piano', text: '楽譜は「月光」。最後の小節に鉛筆の書き込みがある' },
    { id: 'bar', x: 11, y: 2, name: 'バーカウンター', icon: 'counter', text: 'グラスが6つ。1つだけ口紅の跡がない' },
    { id: 'buoy', x: 14, y: 6, name: '浮き輪', icon: 'buoy', text: '「AURORA」と書かれた浮き輪。かけ金は固い' },
    { id: 'sofa', x: 5, y: 5, name: 'ソファ', icon: 'sofa', text: 'クッションの下から乗船券が1枚。日付は今日だ' },
    { id: 'table', x: 2, y: 9, name: '丸テーブル', icon: 'table', text: '食べかけのケーキ。フォークが1本足りない' },
    { id: 'wine', x: 4, y: 8, name: 'ワイン棚', icon: 'shelf', text: '一番高いワインが空になっている。誰かが祝っていたらしい' },
    { id: 'stove', x: 10, y: 8, name: 'コンロ', icon: 'stove', text: 'スープの鍋はまだ温かい。味は少し塩辛い' },
    { id: 'fridge', x: 9, y: 10, name: '冷蔵庫', icon: 'cupboard', text: '氷がたっぷり。魚の箱には「明朝の分」と書いてある' },
    { id: 'boiler', x: 14, y: 9, name: 'ボイラー', icon: 'boiler', text: '針は正常。ゴウンゴウンと大きな音がしている' },
    { id: 'toolbox', x: 12, y: 8, name: '工具箱', icon: 'shoebox', text: 'スパナとロープ。油で真っ黒だ' },
    { id: 'chair', x: 5, y: 13, name: 'デッキチェア', icon: 'deckchair', text: '濡れたタオルがかかっている。夜風で冷たい' },
    { id: 'barrel', x: 9, y: 14, name: '樽', icon: 'barrel', text: '中は真水。ふたに手形がうっすら残る' },
    { id: 'boat', x: 14, y: 13, name: '救命ボート', icon: 'boat', text: 'カバーがかかったまま。誰も逃げ出してはいない' },
    { id: 'crate', x: 1, y: 14, name: '木箱', icon: 'crate', text: 'リンゴがぎっしり。1つだけかじってある' }
  ],
  cast: ['航海士', '料理長', '機関士', '歌手', '富豪', '記者', '船医', '給仕'],
  looks: { 航海士: 'captain', 料理長: 'chef', 機関士: 'helmet', 歌手: 'ribbon', 富豪: 'tophat', 記者: 'cap', 船医: 'mirror', 給仕: 'bowtie' },
  traits: [
    {
      key: 'hand', label: '利き手', values: [
        { v: 'L', label: '左利き', clue: '航海日誌の切れ端に、左手でこすったようなインクのにじみ' },
        { v: 'R', label: '右利き', clue: '航海日誌の切れ端に、右手でこすったようなインクのにじみ' }
      ]
    },
    {
      key: 'shoe', label: '靴', values: [
        { v: 'sneaker', label: 'スニーカー', clue: 'ゴム底のギザギザの足跡が濡れて残っている' },
        { v: 'heel', label: 'ヒール', clue: '細いかかとで床を突いた小さな穴が点々と続いている' }
      ]
    },
    {
      key: 'scent', label: '香り', values: [
        { v: 'sea', label: '潮', clue: '潮の香りが染みたハンカチが落ちている' },
        { v: 'perfume', label: '香水', clue: '甘い香水の香りがふわっと残っている' },
        { v: 'cigar', label: '葉巻', clue: '葉巻の吸いさしが灰皿の外に落ちている' }
      ]
    }
  ],
  alibiRoom: '舞踏室'
}
