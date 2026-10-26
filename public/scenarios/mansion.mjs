// シナリオ「霧ヶ丘の小さな屋敷」。サーバーと画面の両方がこのファイルを読む。
// ここには「誰が犯人か」は書かない（犯人と手がかりの置き場所は毎回サーバーがくじで決める）ので、画面に配ってよい。
//
// 地図の記号: # 壁 / + 扉（通れる）/ 英字 部屋（rooms のキー）
// 手がかりの仕組み: 人物はみな traits（利き手・靴・香り）を1つずつ持つ（公開）。
//   本物の手がかりは犯人の特徴を1つ示す。3つ全部そろうと犯人が1人に絞れる。

export default {
  id: 'mansion',
  title: '霧ヶ丘の小さな屋敷',
  level: 1,                 // 難しさ 1〜3（ロビーの星）
  theme: 'mansion',         // 3D の見た目（外の景色・壁・天気）
  exploreSec: 130,          // 探索の長さ（秒）。広い屋敷ほど長い
  lead: '雨の夜、屋敷の主人が書斎で倒れているのが見つかった。外は嵐で、屋敷にいたのはあなたたちだけ。',
  victim: '屋敷の主人 霧ヶ丘宗一郎',
  crimeTime: '21時40分ごろ',
  map: [
    '############',
    '#SSSS#BBBBB#',
    '#SSSS#BBBBB#',
    '#SSSS#BBBBB#',
    '##+####+####',
    '#HHHHHHHHHH#',
    '#HHHHHHHHHH#',
    '####+###+###',
    '#DDDDD#KKKK#',
    '#DDDDD+KKKK#',
    '#DDDDD#KKKK#',
    '##+#####+###',
    '#EEEE#GGGGG#',
    '#EEEE+GGGGG#',
    '#EEEE#GGGGG#',
    '############'
  ],
  rooms: { S: '書斎', B: '寝室', H: '廊下', D: '食堂', K: '台所', E: '玄関', G: '温室' },
  // 床の張り方（3D と 2D の床の絵）
  floors: { S: 'wood', B: 'carpet', H: 'rug', D: 'parquet', K: 'tile', E: 'stone', G: 'grass' },
  spawnRoom: 'E',
  crimeRoom: 'S',
  // x, y はマス（左上が 0,0）。icon は画面の描き分けに使う
  spots: [
    { id: 'body', x: 2, y: 2, name: '主人の遺体', icon: 'body', noClue: true, text: '主人は机の前に倒れていた。死亡は21時40分ごろ。凶器のペーパーナイフは床に落ちている' },
    { id: 'desk', x: 4, y: 1, name: '書斎の机', icon: 'desk', text: '書きかけの遺言書。相続人の名前の所だけ空いている' },
    { id: 'shelf', x: 1, y: 1, name: '本棚', icon: 'shelf', text: '古い植物図鑑が1冊だけ逆さに差してある。特に変わった所はない' },
    { id: 'bed', x: 9, y: 2, name: 'ベッド', icon: 'bed', text: 'シーツは整っている。今夜は誰も寝ていない' },
    { id: 'dresser', x: 7, y: 1, name: '鏡台', icon: 'dresser', text: '引き出しに古い写真。若い頃の主人が笑っている' },
    { id: 'vase', x: 1, y: 6, name: '花瓶', icon: 'vase', text: '白いユリが活けてある。水は替えたばかりだ' },
    { id: 'clock', x: 10, y: 5, name: '柱時計', icon: 'clock', text: '時計は正しく動いている。21時に一度鳴ったはずだ' },
    { id: 'table', x: 3, y: 9, name: '食卓', icon: 'table', text: '8人分の食器。デザートには誰も手をつけていない' },
    { id: 'cupboard', x: 1, y: 10, name: '食器棚', icon: 'cupboard', text: '銀のスプーンが1本足りない。でも前からだという' },
    { id: 'stove', x: 10, y: 8, name: 'かまど', icon: 'stove', text: '火は落ちている。灰はまだ少し温かい' },
    { id: 'sink', x: 10, y: 10, name: '流し', icon: 'sink', text: '洗った皿が積んである。ふきんは乾いている' },
    { id: 'umbrella', x: 1, y: 12, name: '傘立て', icon: 'umbrella', text: '濡れた傘が3本。今夜の嵐で使われたものだ' },
    { id: 'shoebox', x: 4, y: 14, name: '靴箱', icon: 'shoebox', text: '来客用のスリッパが並んでいる。数は合っている' },
    { id: 'pot', x: 9, y: 12, name: '植木鉢', icon: 'pot', text: 'ランの鉢。土は乾いていて、掘り返された跡はない' },
    { id: 'can', x: 7, y: 14, name: 'じょうろ置き', icon: 'can', text: 'じょうろが2つ。片方は空だ' }
  ],
  // 人物の肩書き。参加順ではなく毎回くじで割り当てる
  cast: ['執事', '料理人', '庭師', '家庭教師', '甥', '主治医', '画家', 'メイド'],
  // 肩書きごとの見た目（3D の帽子・小物と、似顔絵）
  looks: { 執事: 'tophat', 料理人: 'chef', 庭師: 'straw', 家庭教師: 'glasses', 甥: 'cap', 主治医: 'mirror', 画家: 'beret', メイド: 'maid' },
  // 特徴。clue は「犯人がその特徴を持つ」ことを示す手がかりの文
  traits: [
    {
      key: 'hand', label: '利き手', values: [
        { v: 'L', label: '左利き', clue: '血のついた左手用の手袋が片方だけ押し込まれている。利き手で凶器を握ったらしい' },
        { v: 'R', label: '右利き', clue: '血のついた右手用の手袋が片方だけ押し込まれている。利き手で凶器を握ったらしい' }
      ]
    },
    {
      key: 'shoe', label: '靴', values: [
        { v: 'boots', label: '長靴', clue: '泥のついた長靴の足跡が続いている' },
        { v: 'leather', label: '革靴', clue: '磨いた革靴のかかとの細い跡が続いている' }
      ]
    },
    {
      key: 'scent', label: '香り', values: [
        { v: 'lavender', label: 'ラベンダー', clue: 'ハンカチにラベンダーの香りが強く残っている' },
        { v: 'tobacco', label: '煙草', clue: '新しい煙草の灰が落ちている' },
        { v: 'mint', label: 'ミント', clue: 'ミントの飴の包み紙が落ちている' }
      ]
    }
  ],
  // 目撃者が「一緒にいた」場所として語る部屋
  alibiRoom: '食堂'
}
