(function initPromptCatalog(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PromptCatalog = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const SINGLE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').map((char, index) => ({
    id: `letter_${index + 1}`,
    text: char.toUpperCase(),
    reading: char,
    category: 'alphabet_single'
  }));

  const LETTER_TRIPLETS = [
    'asd', 'fgh', 'jkl', 'qwe', 'rty', 'uio', 'zxc', 'vbn', 'mno', 'tap',
    'run', 'key', 'sun', 'map', 'pen', 'red', 'cat', 'dog', 'box', 'jet',
    'win', 'fun', 'hat', 'car', 'web', 'mix', 'top', 'bag', 'cup', 'net'
  ].map((value, index) => ({
    id: `triple_${index + 1}`,
    text: value.toUpperCase(),
    reading: value,
    category: 'alphabet_triple'
  }));

  const ENGLISH_WORDS = [
    'apple', 'basic', 'class', 'clean', 'clock', 'dream', 'focus', 'friend',
    'guide', 'happy', 'input', 'keyboard', 'lesson', 'lunch', 'memory', 'music',
    'notice', 'pencil', 'planet', 'practice', 'report', 'review', 'school',
    'screen', 'smile', 'speech', 'station', 'study', 'tablet', 'typing',
    'agenda', 'answer', 'archive', 'article', 'backup', 'badge', 'biology', 'camera',
    'campus', 'channel', 'chapter', 'charger', 'chemistry', 'clubroom', 'coding', 'contest',
    'course', 'deadline', 'device', 'drawing', 'essay', 'folder', 'formula', 'gallery',
    'homework', 'journal', 'library', 'locker', 'meeting', 'message', 'notebook', 'online',
    'outline', 'password', 'planner', 'podcast', 'project', 'quiz', 'reading', 'research',
    'schedule', 'science', 'semester', 'service', 'sharing', 'speaker', 'stadium', 'teacher',
    'teamwork', 'ticket', 'uniform', 'update', 'video', 'volunteer', 'worksheet', 'yearbook',
    'advisor', 'commute', 'debate', 'recycle'
  ].map((value, index) => ({
    id: `eword_${index + 1}`,
    text: value,
    reading: value,
    category: 'english_word'
  }));

  const JAPANESE_WORDS = [
    { text: '学校', reading: 'がっこう' },
    { text: '教室', reading: 'きょうしつ' },
    { text: '友達', reading: 'ともだち' },
    { text: '部活', reading: 'ぶかつ' },
    { text: '文化祭', reading: 'ぶんかさい' },
    { text: '昼休み', reading: 'ひるやすみ' },
    { text: '通学路', reading: 'つうがくろ' },
    { text: '図書室', reading: 'としょしつ' },
    { text: '宿題', reading: 'しゅくだい' },
    { text: '発表', reading: 'はっぴょう' },
    { text: '探究', reading: 'たんきゅう' },
    { text: '委員会', reading: 'いいんかい' },
    { text: '体育館', reading: 'たいいくかん' },
    { text: '連絡帳', reading: 'れんらくちょう' },
    { text: '時間割', reading: 'じかんわり' },
    { text: '集中力', reading: 'しゅうちゅうりょく' },
    { text: '放課後', reading: 'ほうかご' },
    { text: '音楽室', reading: 'おんがくしつ' },
    { text: '黒板', reading: 'こくばん' },
    { text: '学食', reading: 'がくしょく' },
    { text: '保健室', reading: 'ほけんしつ' },
    { text: '生徒会', reading: 'せいとかい' },
    { text: '購買部', reading: 'こうばいぶ' },
    { text: '進路室', reading: 'しんろしつ' },
    { text: '自習室', reading: 'じしゅうしつ' },
    { text: '美術室', reading: 'びじゅつしつ' },
    { text: '理科室', reading: 'りかしつ' },
    { text: '校庭', reading: 'こうてい' },
    { text: '朝練', reading: 'あされん' },
    { text: '終礼', reading: 'しゅうれい' },
    { text: '小テスト', reading: 'しょうてすと' },
    { text: '提出物', reading: 'ていしゅつぶつ' },
    { text: '参考書', reading: 'さんこうしょ' },
    { text: '単語帳', reading: 'たんごちょう' },
    { text: '復習', reading: 'ふくしゅう' },
    { text: '予習', reading: 'よしゅう' },
    { text: '自主学習', reading: 'じしゅがくしゅう' },
    { text: '進路希望', reading: 'しんろきぼう' },
    { text: '面談', reading: 'めんだん' },
    { text: '球技大会', reading: 'きゅうぎたいかい' },
    { text: '修学旅行', reading: 'しゅうがくりょこう' },
    { text: '遠足', reading: 'えんそく' },
    { text: '模擬店', reading: 'もぎてん' },
    { text: '合唱祭', reading: 'がっしょうさい' },
    { text: '体育祭', reading: 'たいいくさい' },
    { text: '文化部', reading: 'ぶんかぶ' },
    { text: '運動部', reading: 'うんどうぶ' },
    { text: '先輩', reading: 'せんぱい' },
    { text: '後輩', reading: 'こうはい' },
    { text: '登校日', reading: 'とうこうび' },
    { text: '下校時刻', reading: 'げこうじこく' },
    { text: '学年主任', reading: 'がくねんしゅにん' },
    { text: '黒板消し', reading: 'こくばんけし' },
    { text: '出欠簿', reading: 'しゅっけつぼ' },
    { text: '連絡事項', reading: 'れんらくじこう' },
    { text: '校内放送', reading: 'こうないほうそう' },
    { text: '委員長', reading: 'いいんちょう' },
    { text: '当番表', reading: 'とうばんひょう' },
    { text: '反省会', reading: 'はんせいかい' },
    { text: 'グループ学習', reading: 'ぐるーぷがくしゅう' }
  ].map((item, index) => ({
    id: `jword_${index + 1}`,
    text: item.text,
    reading: item.reading,
    category: 'japanese_word'
  }));

  const SENTENCE_BASE_PROMPTS = [
    { id: 'p001', text: '朝のホームルームで予定を確認する', reading: 'あさのほーむるーむでよていをかくにんする', category: 'school' },
    { id: 'p002', text: '通学中に好きな音楽を聞く', reading: 'つうがくちゅうにすきなおんがくをきく', category: 'school' },
    { id: 'p003', text: '昼休みに友だちとおしゃべりする', reading: 'ひるやすみにともだちとおしゃべりする', category: 'friends' },
    { id: 'p004', text: '放課後に図書室でレポートを書く', reading: 'ほうかごにとしょしつでれぽーとをかく', category: 'school' },
    { id: 'p005', text: '次のテスト範囲をノートにまとめる', reading: 'つぎのてすとはんいをのーとにまとめる', category: 'study' },
    { id: 'p006', text: '文化祭の準備でポスターを作る', reading: 'ぶんかさいのじゅんびでぽすたーをつくる', category: 'event' },
    { id: 'p007', text: '体育館で部活動のミーティングをする', reading: 'たいいくかんでぶかつどうのみーてぃんぐをする', category: 'club' },
    { id: 'p008', text: '授業で調べた内容を発表する', reading: 'じゅぎょうでしらべたないようをはっぴょうする', category: 'study' },
    { id: 'p009', text: '友だちにおすすめのゲームを聞く', reading: 'ともだちにおすすめのげーむをきく', category: 'friends' },
    { id: 'p010', text: '帰り道で明日の時間割を確認する', reading: 'かえりみちであしたのじかんわりをかくにんする', category: 'school' },
    { id: 'p011', text: 'タブレットで探究活動の資料を読む', reading: 'たぶれっとでたんきゅうかつどうのしりょうをよむ', category: 'inquiry' },
    { id: 'p012', text: 'クラスのみんなで目標を決める', reading: 'くらすのみんなでもくひょうをきめる', category: 'school' },
    { id: 'p013', text: '情報モラルのルールを話し合う', reading: 'じょうほうもらるのるーるをはなしあう', category: 'morals' },
    { id: 'p014', text: 'スマホの通知を切って勉強に集中する', reading: 'すまほのつうちをきってべんきょうにしゅうちゅうする', category: 'study' },
    { id: 'p015', text: '放送委員が昼の音楽を流す', reading: 'ほうそういいんがひるのおんがくをながす', category: 'school' },
    { id: 'p016', text: '掃除の時間に教室をきれいにする', reading: 'そうじのじかんにきょうしつをきれいにする', category: 'school' },
    { id: 'p017', text: '雨の日は図書館で静かに過ごす', reading: 'あめのひはとしょかんでしずかにすごす', category: 'school' },
    { id: 'p018', text: '体育祭のリレー順を確認する', reading: 'たいいくさいのりれーじゅんをかくにんする', category: 'event' },
    { id: 'p019', text: '部活の先輩に練習方法を相談する', reading: 'ぶかつのせんぱいにれんしゅうほうほうをそうだんする', category: 'club' },
    { id: 'p020', text: '課題の締切をカレンダーに入力する', reading: 'かだいのしめきりをかれんだーににゅうりょくする', category: 'study' },
    { id: 'p021', text: '英単語を毎日少しずつ覚える', reading: 'えいたんごをまいにちすこしずつおぼえる', category: 'study' },
    { id: 'p022', text: '数学の公式を声に出して確認する', reading: 'すうがくのこうしきをこえにだしてかくにんする', category: 'study' },
    { id: 'p023', text: '移動教室の前に持ち物をそろえる', reading: 'いどうきょうしつのまえにもちものをそろえる', category: 'school' },
    { id: 'p024', text: '放課後に友だちと自習室へ行く', reading: 'ほうかごにともだちとじしゅうしつへいく', category: 'friends' },
    { id: 'p025', text: '班活動で役割分担を決める', reading: 'はんかつどうでやくわりぶんたんをきめる', category: 'school' },
    { id: 'p026', text: '学年集会で先生の話を聞く', reading: 'がくねんしゅうかいでせんせいのはなしをきく', category: 'school' },
    { id: 'p027', text: '写真を共有するときは公開範囲を確認する', reading: 'しゃしんをきょうゆうするときはこうかいはんいをかくにんする', category: 'morals' },
    { id: 'p028', text: 'うわさ話はそのまま拡散しない', reading: 'うわさばなしはそのままかくさんしない', category: 'morals' },
    { id: 'p029', text: '探究のテーマに身近な課題を選ぶ', reading: 'たんきゅうのてーまにみぢかなかだいをえらぶ', category: 'inquiry' },
    { id: 'p030', text: '発表スライドは図と文字を整理する', reading: 'はっぴょうすらいどはずともじをせいりする', category: 'inquiry' },
    { id: 'p031', text: '昼休みにバスケットボールを楽しむ', reading: 'ひるやすみにばすけっとぼーるをたのしむ', category: 'club' },
    { id: 'p032', text: '校舎の階段はあわてずに歩く', reading: 'こうしゃのかいだんはあわてずにあるく', category: 'school' },
    { id: 'p033', text: '連絡アプリの通知をこまめに確認する', reading: 'れんらくあぷりのつうちをこまめにかくにんする', category: 'tech' },
    { id: 'p034', text: 'イヤホンの音量は上げすぎない', reading: 'いやほんのおんりょうはあげすぎない', category: 'tech' },
    { id: 'p035', text: '昼食後に眠くても授業に集中する', reading: 'ちゅうしょくごにねむくてもじゅぎょうにしゅうちゅうする', category: 'school' },
    { id: 'p036', text: '係の仕事を期限までに終わらせる', reading: 'かかりのしごとをきげんまでにおわらせる', category: 'school' },
    { id: 'p037', text: '文化祭でクラス企画を協力して進める', reading: 'ぶんかさいでくらすきかくをきょうりょくしてすすめる', category: 'event' },
    { id: 'p038', text: '朝の読書時間に小説を読む', reading: 'あさのどくしょじかんにしょうせつをよむ', category: 'school' },
    { id: 'p039', text: '質問があるときは遠慮せず手を挙げる', reading: 'しつもんがあるときはえんりょせずてをあげる', category: 'school' },
    { id: 'p040', text: '休み時間に次の授業の準備をする', reading: 'やすみじかんにつぎのじゅぎょうのじゅんびをする', category: 'school' },
    { id: 'p041', text: '委員会で校内掲示を作り直す', reading: 'いいんかいでこうないけいじをつくりなおす', category: 'school' },
    { id: 'p042', text: '仲間と協力して課題を解決する', reading: 'なかまときょうりょくしてかだいをかいけつする', category: 'inquiry' },
    { id: 'p043', text: 'タイピング練習で正確さを意識する', reading: 'たいぴんぐれんしゅうでせいかくさをいしきする', category: 'tech' },
    { id: 'p044', text: 'プレゼン前に発音と間の取り方を確認する', reading: 'ぷれぜんまえにはつおんとまのとりかたをかくにんする', category: 'inquiry' },
    { id: 'p045', text: 'SNSに投稿する前に内容を見直す', reading: 'えすえぬえすにとうこうするまえにないようをみなおす', category: 'morals' },
    { id: 'p046', text: 'メッセージは相手が読みやすい文にする', reading: 'めっせーじはあいてがよみやすいぶんにする', category: 'morals' },
    { id: 'p047', text: '学習記録を振り返って次の目標を立てる', reading: 'がくしゅうきろくをふりかえってつぎのもくひょうをたてる', category: 'study' },
    { id: 'p048', text: '試験前は睡眠時間をしっかり確保する', reading: 'しけんまえはすいみんじかんをしっかりかくほする', category: 'study' },
    { id: 'p049', text: '朝練のあとに水分補給をする', reading: 'あされんのあとにすいぶんほきゅうをする', category: 'club' },
    { id: 'p050', text: '図書委員が返却期限を案内する', reading: 'としょいいんがへんきゃくきげんをあんないする', category: 'school' },
    { id: 'p051', text: '教科書のしおりで今日のページを開く', reading: 'きょうかしょのしおりできょうのぺーじをひらく', category: 'school' },
    { id: 'p052', text: '休み時間に提出物の最終確認をする', reading: 'やすみじかんにていしゅつぶつのさいしゅうかくにんをする', category: 'school' },
    { id: 'p053', text: '先生の説明を聞きながら大事な所に印を付ける', reading: 'せんせいのせつめいをききながらだいじなところにしるしをつける', category: 'study' },
    { id: 'p054', text: '学習アプリで英単語の復習を進める', reading: 'がくしゅうあぷりでえいたんごのふくしゅうをすすめる', category: 'tech' },
    { id: 'p055', text: '放課後の面談に向けて質問を整理する', reading: 'ほうかごのめんだんにむけてしつもんをせいりする', category: 'school' },
    { id: 'p056', text: 'クラスの係が配布物を順番に配る', reading: 'くらすのかかりがはいふぶつをじゅんばんにくばる', category: 'school' },
    { id: 'p057', text: '友だちと次の小テストの対策を相談する', reading: 'ともだちとつぎのしょうてすとのたいさくをそうだんする', category: 'friends' },
    { id: 'p058', text: '図書委員が新しいおすすめの本を紹介する', reading: 'としょいいんがあたらしいおすすめのほんをしょうかいする', category: 'school' },
    { id: 'p059', text: '体育祭の係で必要な道具を並べる', reading: 'たいいくさいのかかりでひつようなどうぐをならべる', category: 'event' },
    { id: 'p060', text: '修学旅行の班で見学順を決める', reading: 'しゅうがくりょこうのはんでけんがくじゅんをきめる', category: 'event' },
    { id: 'p061', text: '理科の実験で手順を声に出して確認する', reading: 'りかのじっけんでてじゅんをこえにだしてかくにんする', category: 'study' },
    { id: 'p062', text: '美術の作品に使う色の組み合わせを考える', reading: 'びじゅつのさくひんにつかういろのくみあわせをかんがえる', category: 'school' },
    { id: 'p063', text: '学級日誌に今日の出来事をまとめる', reading: 'がっきゅうにっしにきょうのできごとをまとめる', category: 'school' },
    { id: 'p064', text: '登校前に忘れ物がないかかばんを見直す', reading: 'とうこうまえにわすれものがないかかばんをみなおす', category: 'school' },
    { id: 'p065', text: '昼食後に保健室で少し休んでから戻る', reading: 'ちゅうしょくごにほけんしつですこしやすんでからもどる', category: 'school' },
    { id: 'p066', text: '放送当番が昼の案内を落ち着いて読む', reading: 'ほうそうとうばんがひるのあんないをおちついてよむ', category: 'school' },
    { id: 'p067', text: 'オンライン教材の締切をカレンダーに入れる', reading: 'おんらいんきょうざいのしめきりをかれんだーにいれる', category: 'tech' },
    { id: 'p068', text: 'ノートの余白に次回の課題を書き足す', reading: 'のーとのよはくにじかいのかだいをかきたす', category: 'study' },
    { id: 'p069', text: '部活動の練習前にストレッチを丁寧に行う', reading: 'ぶかつどうのれんしゅうまえにすとれっちをていねいにおこなう', category: 'club' },
    { id: 'p070', text: '球技大会の作戦を黒板の前で確認する', reading: 'きゅうぎたいかいのさくせんをこくばんのまえでかくにんする', category: 'event' },
    { id: 'p071', text: 'クラス写真を撮る前に服装を整える', reading: 'くらすしゃしんをとるまえにふくそうをととのえる', category: 'school' },
    { id: 'p072', text: '先輩の助言を聞いてフォームを修正する', reading: 'せんぱいのじょげんをきいてふぉーむをしゅうせいする', category: 'club' },
    { id: 'p073', text: '文化部の展示で説明カードを書き直す', reading: 'ぶんかぶのてんじでせつめいかーどをかきなおす', category: 'club' },
    { id: 'p074', text: '運動部の記録を表にして共有する', reading: 'うんどうぶのきろくをひょうにしてきょうゆうする', category: 'club' },
    { id: 'p075', text: '情報の出どころを確かめてから発表に使う', reading: 'じょうほうのでどころをたしかめてからはっぴょうにつかう', category: 'morals' },
    { id: 'p076', text: '投稿前に写真の写り込みがないか確認する', reading: 'とうこうまえにしゃしんのうつりこみがないかかくにんする', category: 'morals' },
    { id: 'p077', text: 'グループ学習で役割ごとの進み具合を話す', reading: 'ぐるーぷがくしゅうでやくわりごとのすすみぐあいをはなす', category: 'inquiry' },
    { id: 'p078', text: '朝の挨拶をすると教室の空気が明るくなる', reading: 'あさのあいさつをするときょうしつのくうきがあかるくなる', category: 'school' },
    { id: 'p079', text: '予習した内容を授業中にすばやく思い出す', reading: 'よしゅうしたないようをじゅぎょうちゅうにすばやくおもいだす', category: 'study' },
    { id: 'p080', text: '参考書の例題を解いてから応用問題に進む', reading: 'さんこうしょのれいだいをといてからおうようもんだいにすすむ', category: 'study' },
    { id: 'p081', text: '自習室では周りに合わせて静かに学ぶ', reading: 'じしゅうしつではまわりにあわせてしずかにまなぶ', category: 'study' },
    { id: 'p082', text: '文化祭当日は時間を見ながら持ち場を守る', reading: 'ぶんかさいとうじつはじかんをみながらもちばをまもる', category: 'event' },
    { id: 'p083', text: '生徒会が集めた意見を全校に伝える', reading: 'せいとかいがあつめたいけんをぜんこうにつたえる', category: 'school' },
    { id: 'p084', text: 'クラス目標を見直して今月の行動を決める', reading: 'くらすもくひょうをみなおしてこんげつのこうどうをきめる', category: 'school' },
    { id: 'p085', text: 'タイピング練習の結果を次の目標に生かす', reading: 'たいぴんぐれんしゅうのけっかをつぎのもくひょうにいかす', category: 'tech' },
    { id: 'p086', text: '遅刻しそうなときは早めに連絡を入れる', reading: 'ちこくしそうなときははやめにれんらくをいれる', category: 'school' },
    { id: 'p087', text: '休日の課題は計画を立てて少しずつ進める', reading: 'きゅうじつのかだいはけいかくをたててすこしずつすすめる', category: 'study' },
    { id: 'p088', text: '配信された資料を学習用のフォルダに保存する', reading: 'はいしんされたしりょうをがくしゅうようのふぉるだにほぞんする', category: 'tech' },
    { id: 'p089', text: '友だちの発表の良かった点をメモに残す', reading: 'ともだちのはっぴょうのよかったてんをめもにのこす', category: 'friends' },
    { id: 'p090', text: '当番表を確認して掃除道具を準備する', reading: 'とうばんひょうをかくにんしてそうじどうぐをじゅんびする', category: 'school' },
    { id: 'p091', text: '進路希望の紙に今の考えを丁寧に書く', reading: 'しんろきぼうのかみにいまのかんがえをていねいにかく', category: 'school' },
    { id: 'p092', text: '英語の音読で区切り方と強弱を意識する', reading: 'えいごのおんどくでくぎりかたときょうじゃくをいしきする', category: 'study' },
    { id: 'p093', text: '数学の途中式を省かずにノートへ残す', reading: 'すうがくのとちゅうしきをはぶかずにのーとへのこす', category: 'study' },
    { id: 'p094', text: '家庭科の実習で片付けまで協力して行う', reading: 'かていかのじっしゅうでかたづけまできょうりょくしておこなう', category: 'school' },
    { id: 'p095', text: '次の授業へ移動する前に机の上を整える', reading: 'つぎのじゅぎょうへいどうするまえにつくえのうえをととのえる', category: 'school' },
    { id: 'p096', text: 'テスト返却後に間違えた理由を振り返る', reading: 'てすとへんきゃくごにまちがえたりゆうをふりかえる', category: 'study' },
    { id: 'p097', text: '連絡事項はメモ帳とアプリの両方に残す', reading: 'れんらくじこうはめもちょうとあぷりのりょうほうにのこす', category: 'tech' },
    { id: 'p098', text: '雨の日の登校では足元に気を付けて歩く', reading: 'あめのひのとうこうではあしもとにきをつけてあるく', category: 'school' },
    { id: 'p099', text: '修学旅行のしおりを読み返して集合時刻を確認する', reading: 'しゅうがくりょこうのしおりをよみかえしてしゅうごうじこくをかくにんする', category: 'event' },
    { id: 'p100', text: '調べ学習の引用元は最後にまとめて書く', reading: 'しらべがくしゅうのいんようもとはさいごにまとめてかく', category: 'inquiry' },
    { id: 'p101', text: '学習動画を止めながら要点をノートに写す', reading: 'がくしゅうどうがをとめながらようてんをのーとにうつす', category: 'tech' },
    { id: 'p102', text: '電池残量を確認してからタブレットを持ち出す', reading: 'でんちざんりょうをかくにんしてからたぶれっとをもちだす', category: 'tech' },
    { id: 'p103', text: '帰宅後は制服を整えてから机に向かう', reading: 'きたくごはせいふくをととのえてからつくえにむかう', category: 'school' },
    { id: 'p104', text: '教室の掲示を見て今週の予定を確認する', reading: 'きょうしつのけいじをみてこんしゅうのよていをかくにんする', category: 'school' },
    { id: 'p105', text: '面談前に伝えたいことを箇条書きにする', reading: 'めんだんまえにつたえたいことをかじょうがきにする', category: 'school' },
    { id: 'p106', text: '委員長が話し合いの順番を落ち着いて進める', reading: 'いいんちょうがはなしあいのじゅんばんをおちついてすすめる', category: 'school' },
    { id: 'p107', text: '学年集会で配られた資料に目を通す', reading: 'がくねんしゅうかいでくばられたしりょうにめをとおす', category: 'school' },
    { id: 'p108', text: '部室の使い方を後輩にも分かるように伝える', reading: 'ぶしつのつかいかたをこうはいにもわかるようにつたえる', category: 'club' },
    { id: 'p109', text: 'おすすめの本を読んだ感想をクラスで共有する', reading: 'おすすめのほんをよんだかんそうをくらすできょうゆうする', category: 'friends' },
    { id: 'p110', text: '文化祭の招待状を読みやすい文で仕上げる', reading: 'ぶんかさいのしょうたいじょうをよみやすいぶんでしあげる', category: 'event' },
    { id: 'p111', text: '保護者向けの案内文を先生と一緒に見直す', reading: 'ほごしゃむけのあんないぶんをせんせいといっしょにみなおす', category: 'school' },
    { id: 'p112', text: '体育の準備運動は号令に合わせて丁寧に行う', reading: 'たいいくのじゅんびうんどうはごうれいにあわせてていねいにおこなう', category: 'school' },
    { id: 'p113', text: '模擬店の値札を見やすい位置に貼り直す', reading: 'もぎてんのねふだをみやすいいちにはりなおす', category: 'event' },
    { id: 'p114', text: '朝練前に水筒の中身を確認する', reading: 'あされんまえにすいとうのなかみをかくにんする', category: 'club' },
    { id: 'p115', text: '授業の終わりに次回の持ち物を確認する', reading: 'じゅぎょうのおわりにじかいのもちものをかくにんする', category: 'school' },
    { id: 'p116', text: '調理実習では手洗いをしてから作業に入る', reading: 'ちょうりじっしゅうではてあらいをしてからさぎょうにはいる', category: 'school' },
    { id: 'p117', text: '写真の共有先は相手を確かめてから選ぶ', reading: 'しゃしんのきょうゆうさきはあいてをたしかめてからえらぶ', category: 'morals' },
    { id: 'p118', text: '寝る前に明日の提出物を玄関にそろえる', reading: 'ねるまえにあしたのていしゅつぶつをげんかんにそろえる', category: 'school' },
    { id: 'p119', text: 'クラス替えのあとも新しい友だちに声をかける', reading: 'くらすがえのあともあたらしいともだちにこえをかける', category: 'friends' },
    { id: 'p120', text: '理科室の器具は名前を覚えて正しく扱う', reading: 'りかしつのきぐはなまえをおぼえてただしくあつかう', category: 'study' },
    { id: 'p121', text: '進路の調べ学習で複数の資料を比べる', reading: 'しんろのしらべがくしゅうでふくすうのしりょうをくらべる', category: 'inquiry' },
    { id: 'p122', text: '漢字の小テストへ向けて書き順も確認する', reading: 'かんじのしょうてすとへむけてかきじゅんもかくにんする', category: 'study' },
    { id: 'p123', text: '図書室の返却箱へ本を丁寧に入れる', reading: 'としょしつのへんきゃくばこへほんをていねいにいれる', category: 'school' },
    { id: 'p124', text: 'イヤホンを外して友だちの話をしっかり聞く', reading: 'いやほんをはずしてともだちのはなしをしっかりきく', category: 'friends' },
    { id: 'p125', text: '探究発表の練習で時間配分を確かめる', reading: 'たんきゅうはっぴょうのれんしゅうでじかんはいぶんをたしかめる', category: 'inquiry' },
    { id: 'p126', text: '日直が今日の連絡をはっきり読み上げる', reading: 'にっちょくがきょうのれんらくをはっきりよみあげる', category: 'school' },
    { id: 'p127', text: '遠足の班ごとに集合場所を確認する', reading: 'えんそくのはんごとにしゅうごうばしょをかくにんする', category: 'event' },
    { id: 'p128', text: '美術室の片付けで筆をしっかり洗う', reading: 'びじゅつしつのかたづけでふでをしっかりあらう', category: 'school' },
    { id: 'p129', text: '部活動の反省会で次の練習目標を決める', reading: 'ぶかつどうのはんせいかいでつぎのれんしゅうもくひょうをきめる', category: 'club' },
    { id: 'p130', text: '授業で使う動画の再生位置を先生が合わせる', reading: 'じゅぎょうでつかうどうがのさいせいいちをせんせいがあわせる', category: 'school' },
    { id: 'p131', text: '帰りの会で明日の予定変更を共有する', reading: 'かえりのかいであしたのよていへんこうをきょうゆうする', category: 'school' },
    { id: 'p132', text: '友だちと問題を出し合って暗記を進める', reading: 'ともだちともんだいをだしあってあんきをすすめる', category: 'friends' },
    { id: 'p133', text: '校内放送の原稿を読みやすい順に並べる', reading: 'こうないほうそうのげんこうをよみやすいじゅんにならべる', category: 'school' },
    { id: 'p134', text: '宿題の質問は早めに先生へ相談する', reading: 'しゅくだいのしつもんははやめにせんせいへそうだんする', category: 'study' },
    { id: 'p135', text: '委員会の活動内容を掲示用にまとめる', reading: 'いいんかいのかつどうないようをけいじようにまとめる', category: 'school' },
    { id: 'p136', text: '教室の時計を見て次の行動を考える', reading: 'きょうしつのとけいをみてつぎのこうどうをかんがえる', category: 'school' },
    { id: 'p137', text: '学食の列では順番を守って静かに待つ', reading: 'がくしょくのれつではじゅんばんをまもってしずかにまつ', category: 'school' },
    { id: 'p138', text: '進路室で先輩の体験談を読んで参考にする', reading: 'しんろしつでせんぱいのたいけんだんをよんでさんこうにする', category: 'school' },
    { id: 'p139', text: 'グループ発表の担当部分を何度も練習する', reading: 'ぐるーぷはっぴょうのたんとうぶぶんをなんどもれんしゅうする', category: 'inquiry' },
    { id: 'p140', text: '学級目標の掲示を見て気持ちを整える', reading: 'がっきゅうもくひょうのけいじをみてきもちをととのえる', category: 'school' },
    { id: 'p141', text: '休日の部活では集合時間より少し早めに着く', reading: 'きゅうじつのぶかつではしゅうごうじかんよりすこしはやめにつく', category: 'club' },
    { id: 'p142', text: '配布されたプリントは教科ごとに分けてしまう', reading: 'はいふされたぷりんとはきょうかごとにわけてしまう', category: 'study' },
    { id: 'p143', text: '理由を添えて自分の意見を落ち着いて伝える', reading: 'りゆうをそえてじぶんのいけんをおちついてつたえる', category: 'inquiry' },
    { id: 'p144', text: '雑談のあとで勉強へ切り替える合図を決める', reading: 'ざつだんのあとでべんきょうへきりかえるあいずをきめる', category: 'friends' },
    { id: 'p145', text: 'タブレットの充電器を使い終わったら元に戻す', reading: 'たぶれっとのじゅうでんきをつかいおわったらもとにもどす', category: 'tech' },
    { id: 'p146', text: '文化祭の片付けまで笑顔で協力する', reading: 'ぶんかさいのかたづけまでえがおできょうりょくする', category: 'event' },
    { id: 'p147', text: '黒板消しの粉を落としてから次の授業を始める', reading: 'こくばんけしのこなをおとしてからつぎのじゅぎょうをはじめる', category: 'school' },
    { id: 'p148', text: '学習計画を立ててから動画視聴を始める', reading: 'がくしゅうけいかくをたててからどうがしちょうをはじめる', category: 'tech' },
    { id: 'p149', text: '発表後の質問にも分かりやすく答える', reading: 'はっぴょうごのしつもんにもわかりやすくこたえる', category: 'inquiry' },
    { id: 'p150', text: '今週の目標達成へ向けて毎日少しずつ続ける', reading: 'こんしゅうのもくひょうたっせいへむけてまいにちすこしずつつづける', category: 'study' }
  ];

  const JAPANESE_SENTENCES = SENTENCE_BASE_PROMPTS.map((item, index) => ({
    id: `jsentence_${index + 1}`,
    text: item.text.endsWith('。') ? item.text : `${item.text}。`,
    reading: item.reading.endsWith('。') ? item.reading : `${item.reading}。`,
    category: item.category
  }));

  const STAGE_THRESHOLDS = [30, 80, 150, 300];
  const STAGE_LABELS = [
    'alphabet_single',
    'alphabet_triple',
    'english_word',
    'japanese_word',
    'japanese_sentence'
  ];
  const PROMPT_POOLS = [
    SINGLE_LETTERS,
    LETTER_TRIPLETS,
    ENGLISH_WORDS,
    JAPANESE_WORDS,
    JAPANESE_SENTENCES
  ];
  const stageOrderCache = new Map();
  const promptById = new Map();
  const promptByText = new Map();
  const promptByStageText = new Map();

  function toHiragana(input) {
    return Array.from(String(input || '')).map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x30A1 && code <= 0x30F6) {
        return String.fromCharCode(code - 0x60);
      }
      return char;
    }).join('');
  }

  function normalizeReading(reading) {
    return toHiragana(String(reading || '').trim());
  }

  function normalizedStage(stage) {
    const value = Math.floor(Number(stage) || 0);
    return Math.max(0, Math.min(PROMPT_POOLS.length - 1, value));
  }

  function getStageByCombo(combo) {
    const value = Math.floor(Number(combo) || 0);
    if (value >= STAGE_THRESHOLDS[3]) return 4;
    if (value >= STAGE_THRESHOLDS[2]) return 3;
    if (value >= STAGE_THRESHOLDS[1]) return 2;
    if (value >= STAGE_THRESHOLDS[0]) return 1;
    return 0;
  }

  function createSeededRandom(seed) {
    let value = Math.floor(Math.abs(Number(seed) || 1)) % 2_147_483_647;
    if (value === 0) value = 1;
    return () => {
      value = (value * 16_807) % 2_147_483_647;
      return (value - 1) / 2_147_483_646;
    };
  }

  function getStageOrder(seed, stage, length) {
    const cacheKey = `${Math.floor(Number(seed) || 0)}|${stage}|${length}`;
    if (stageOrderCache.has(cacheKey)) return stageOrderCache.get(cacheKey);
    const random = createSeededRandom((Number(seed) || 1) + (stage + 1) * 104729);
    const order = Array.from({ length }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    stageOrderCache.set(cacheKey, order);
    return order;
  }

  function isUsableJapaneseReading(reading) {
    return /^[ぁ-んー、。！？・「」 ]+$/.test(normalizeReading(reading));
  }

  function registerCanonicalPrompts() {
    PROMPT_POOLS.forEach((pool, stage) => {
      pool.forEach((prompt) => {
        if (prompt && prompt.id) {
          promptById.set(String(prompt.id), prompt);
        }
        if (prompt && prompt.text && !promptByText.has(String(prompt.text))) {
          promptByText.set(String(prompt.text), prompt);
        }
        if (prompt && prompt.text) {
          promptByStageText.set(`${stage}|${String(prompt.text)}`, prompt);
        }
      });
    });
  }

  function resolveCanonicalPrompt(prompt, stage) {
    const normalizedPrompt = prompt && typeof prompt === 'object' ? prompt : {};
    const promptId = String(normalizedPrompt.id || '').trim();
    const promptText = String(normalizedPrompt.text || '').trim();
    if (promptId && promptById.has(promptId)) {
      return promptById.get(promptId);
    }
    const stageTextKey = `${normalizedStage(stage)}|${promptText}`;
    if (promptText && promptByStageText.has(stageTextKey)) {
      return promptByStageText.get(stageTextKey);
    }
    if (promptText && promptByText.has(promptText)) {
      return promptByText.get(promptText);
    }
    return null;
  }

  function normalizePrompt(prompt, stage) {
    const requestedPrompt = prompt && typeof prompt === 'object' ? prompt : {};
    const normalizedStageValue = normalizedStage(stage == null ? requestedPrompt.stage : stage);
    const canonicalPrompt = resolveCanonicalPrompt(requestedPrompt, normalizedStageValue);
    const sourcePrompt = canonicalPrompt || requestedPrompt;
    let reading = normalizeReading(
      requestedPrompt.reading
      || sourcePrompt.reading
      || requestedPrompt.text
      || sourcePrompt.text
      || ''
    );

    if (normalizedStageValue >= 3 && !isUsableJapaneseReading(reading) && canonicalPrompt && canonicalPrompt.reading) {
      reading = normalizeReading(canonicalPrompt.reading);
    }

    return {
      id: String(sourcePrompt.id || requestedPrompt.id || ''),
      text: String(sourcePrompt.text || requestedPrompt.text || ''),
      reading,
      category: sourcePrompt.category || requestedPrompt.category,
      stage: normalizedStageValue,
      stageLabel: STAGE_LABELS[normalizedStageValue]
    };
  }

  function clonePrompt(prompt, stage) {
    return normalizePrompt(prompt, stage);
  }

  function getPromptPool(stage) {
    return PROMPT_POOLS[normalizedStage(stage)] || PROMPT_POOLS[0];
  }

  function pickPrompt(options = {}) {
    const stage = normalizedStage(options.stage);
    const index = Math.max(0, Math.floor(Number(options.index) || 0));
    const seed = Number.isFinite(options.seed) ? Number(options.seed) : Date.now();
    const pool = getPromptPool(stage);
    const order = getStageOrder(seed, stage, pool.length);
    const selected = pool[order[index % order.length]];
    return clonePrompt(selected, stage);
  }

  function buildPromptQueue(options = {}) {
    const count = Number.isInteger(options.count) && options.count > 0 ? options.count : 120;
    const stage = normalizedStage(options.stage == null ? 4 : options.stage);
    const seed = Number.isFinite(options.seed) ? Number(options.seed) : Date.now();
    const prompts = [];

    for (let index = 0; index < count; index += 1) {
      prompts.push(pickPrompt({ stage, index, seed }));
    }

    return {
      seed,
      prompts
    };
  }

  registerCanonicalPrompts();

  return {
    PROMPTS: JAPANESE_SENTENCES,
    PROMPT_POOLS,
    STAGE_THRESHOLDS,
    STAGE_LABELS,
    getStageByCombo,
    normalizePrompt,
    pickPrompt,
    buildPromptQueue
  };
}));
