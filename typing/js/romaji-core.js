(function initRomajiCore(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RomajiCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const DIGRAPHS = {
    'きゃ': ['kya'],
    'きゅ': ['kyu'],
    'きょ': ['kyo'],
    'ぎゃ': ['gya'],
    'ぎゅ': ['gyu'],
    'ぎょ': ['gyo'],
    'しゃ': ['sha', 'sya'],
    'しゅ': ['shu', 'syu'],
    'しょ': ['sho', 'syo'],
    'じゃ': ['ja', 'jya', 'zya'],
    'じゅ': ['ju', 'jyu', 'zyu'],
    'じょ': ['jo', 'jyo', 'zyo'],
    'ちゃ': ['cha', 'cya', 'tya'],
    'ちゅ': ['chu', 'cyu', 'tyu'],
    'ちょ': ['cho', 'cyo', 'tyo'],
    'ぢゃ': ['dya'],
    'ぢゅ': ['dyu'],
    'ぢょ': ['dyo'],
    'にゃ': ['nya'],
    'にゅ': ['nyu'],
    'にょ': ['nyo'],
    'ひゃ': ['hya'],
    'ひゅ': ['hyu'],
    'ひょ': ['hyo'],
    'びゃ': ['bya'],
    'びゅ': ['byu'],
    'びょ': ['byo'],
    'ぴゃ': ['pya'],
    'ぴゅ': ['pyu'],
    'ぴょ': ['pyo'],
    'みゃ': ['mya'],
    'みゅ': ['myu'],
    'みょ': ['myo'],
    'りゃ': ['rya'],
    'りゅ': ['ryu'],
    'りょ': ['ryo'],
    'ふぁ': ['fa'],
    'ふぃ': ['fi'],
    'ふぇ': ['fe'],
    'ふぉ': ['fo'],
    'ふゅ': ['fyu'],
    'てぃ': ['thi'],
    'でぃ': ['dhi'],
    'とぅ': ['twu'],
    'どぅ': ['dwu'],
    'しぇ': ['she', 'sye'],
    'ちぇ': ['che', 'cye', 'tye'],
    'じぇ': ['je', 'jye', 'zye'],
    'うぃ': ['wi'],
    'うぇ': ['we'],
    'うぉ': ['wo'],
    'ゔぁ': ['va'],
    'ゔぃ': ['vi'],
    'ゔぇ': ['ve'],
    'ゔぉ': ['vo'],
    'ゔゅ': ['vyu']
  };

  const MONOGRAPHS = {
    'あ': ['a'],
    'い': ['i'],
    'う': ['u'],
    'え': ['e'],
    'お': ['o'],
    'か': ['ka'],
    'き': ['ki'],
    'く': ['ku'],
    'け': ['ke'],
    'こ': ['ko'],
    'さ': ['sa'],
    'し': ['shi', 'si'],
    'す': ['su'],
    'せ': ['se'],
    'そ': ['so'],
    'た': ['ta'],
    'ち': ['chi', 'ti'],
    'つ': ['tsu', 'tu'],
    'て': ['te'],
    'と': ['to'],
    'な': ['na'],
    'に': ['ni'],
    'ぬ': ['nu'],
    'ね': ['ne'],
    'の': ['no'],
    'は': ['ha'],
    'ひ': ['hi'],
    'ふ': ['fu', 'hu'],
    'へ': ['he'],
    'ほ': ['ho'],
    'ま': ['ma'],
    'み': ['mi'],
    'む': ['mu'],
    'め': ['me'],
    'も': ['mo'],
    'や': ['ya'],
    'ゆ': ['yu'],
    'よ': ['yo'],
    'ら': ['ra'],
    'り': ['ri'],
    'る': ['ru'],
    'れ': ['re'],
    'ろ': ['ro'],
    'わ': ['wa'],
    'を': ['wo'],
    'ん': ['n'],
    'が': ['ga'],
    'ぎ': ['gi'],
    'ぐ': ['gu'],
    'げ': ['ge'],
    'ご': ['go'],
    'ざ': ['za'],
    'じ': ['ji', 'zi'],
    'ず': ['zu'],
    'ぜ': ['ze'],
    'ぞ': ['zo'],
    'だ': ['da'],
    'ぢ': ['di'],
    'づ': ['du', 'zu'],
    'で': ['de'],
    'ど': ['do'],
    'ば': ['ba'],
    'び': ['bi'],
    'ぶ': ['bu'],
    'べ': ['be'],
    'ぼ': ['bo'],
    'ぱ': ['pa'],
    'ぴ': ['pi'],
    'ぷ': ['pu'],
    'ぺ': ['pe'],
    'ぽ': ['po'],
    'ゔ': ['vu'],
    'ぁ': ['xa', 'la'],
    'ぃ': ['xi', 'li'],
    'ぅ': ['xu', 'lu'],
    'ぇ': ['xe', 'le'],
    'ぉ': ['xo', 'lo'],
    'ゃ': ['xya', 'lya'],
    'ゅ': ['xyu', 'lyu'],
    'ょ': ['xyo', 'lyo'],
    'ゎ': ['xwa', 'lwa'],
    'っ': ['xtu', 'ltu'],
    'ー': ['-'],
    '、': [','],
    '。': ['.'],
    '！': ['!'],
    '？': ['?'],
    '・': ['/'],
    '「': ['['],
    '」': [']'],
    '　': [' '],
    ' ': [' ']
  };

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

  function normalizeInputKey(rawKey) {
    if (!rawKey) {
      return '';
    }
    if (rawKey === ' ' || rawKey === 'Spacebar') {
      return ' ';
    }
    if (rawKey.length === 1) {
      return rawKey.toLowerCase();
    }

    const aliases = {
      Minus: '-',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Semicolon: ';',
      Quote: "'",
      Backslash: '\\\\',
      BracketLeft: '[',
      BracketRight: ']',
      Backquote: '`'
    };

    return aliases[rawKey] || '';
  }

  function isConsonant(char) {
    return /^[bcdfghjklmnpqrstvwxyz]$/i.test(char);
  }

  function uniq(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function buildSplitDigraphOptions(token) {
    const chars = Array.from(String(token || ''));
    if (chars.length !== 2) {
      return [];
    }
    const headOptions = MONOGRAPHS[chars[0]];
    const tailOptions = MONOGRAPHS[chars[1]];
    if (!headOptions || !tailOptions) {
      return [];
    }
    return uniq(headOptions.flatMap((head) => tailOptions.map((tail) => `${head}${tail}`)));
  }

  function tokenizeKana(reading) {
    const normalized = normalizeReading(reading);
    const chars = Array.from(normalized);
    const tokens = [];

    for (let i = 0; i < chars.length; i += 1) {
      const pair = `${chars[i]}${chars[i + 1] || ''}`;
      if (DIGRAPHS[pair]) {
        tokens.push(pair);
        i += 1;
      } else {
        tokens.push(chars[i]);
      }
    }

    return tokens;
  }

  function getTokenOptions(tokens, index, cache) {
    if (index >= tokens.length) {
      return [''];
    }

    if (cache[index]) {
      return cache[index];
    }

    const token = tokens[index];
    let options;

    if (token === 'っ') {
      const nextOptions = index + 1 < tokens.length
        ? getTokenOptions(tokens, index + 1, cache).filter(Boolean)
        : [];

      const doubled = uniq(nextOptions
        .map((option) => option[0])
        .filter((char) => isConsonant(char)));

      options = uniq([...doubled, 'xtu', 'ltu', 'xtsu', 'ltsu']);
    } else if (token === 'ん') {
      const nextOptions = index + 1 < tokens.length
        ? getTokenOptions(tokens, index + 1, cache).filter(Boolean)
        : [];

      const needDoubleN = nextOptions.some((option) => /^[aiueoyn]/.test(option));
      options = needDoubleN ? ['nn', 'xn'] : ['n', 'nn', 'xn'];
    } else if (DIGRAPHS[token]) {
      options = uniq([...DIGRAPHS[token], ...buildSplitDigraphOptions(token)]);
    } else if (MONOGRAPHS[token]) {
      options = MONOGRAPHS[token];
    } else {
      options = [token.toLowerCase()];
    }

    cache[index] = uniq(options.map((item) => String(item || '').toLowerCase()));
    return cache[index];
  }

  function createNode() {
    return {
      terminal: false,
      children: Object.create(null)
    };
  }

  function addPath(node, text) {
    let current = node;
    for (const char of text) {
      if (!current.children[char]) {
        current.children[char] = createNode();
      }
      current = current.children[char];
    }
    return current;
  }

  function buildRomajiTrie(reading) {
    const tokens = tokenizeKana(reading);
    const root = createNode();
    const cache = Object.create(null);

    function visit(index, node) {
      if (index >= tokens.length) {
        node.terminal = true;
        return;
      }

      const options = getTokenOptions(tokens, index, cache);
      for (const option of options) {
        if (!option) {
          continue;
        }
        const tail = addPath(node, option);
        visit(index + 1, tail);
      }
    }

    visit(0, root);
    if (tokens.length === 0) {
      root.terminal = true;
    }

    return {
      root,
      tokens,
      reading: normalizeReading(reading)
    };
  }

  function getShortestSuffix(startNode, depthLimit = 96) {
    const queue = [{ node: startNode, suffix: '' }];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      if (current.node.terminal) {
        return current.suffix;
      }

      if (current.suffix.length >= depthLimit) {
        continue;
      }

      const keys = Object.keys(current.node.children).sort();
      for (const key of keys) {
        queue.push({
          node: current.node.children[key],
          suffix: `${current.suffix}${key}`
        });
      }
    }

    return '';
  }

  function createTypingSession(reading) {
    let trie = buildRomajiTrie(reading);
    let current = trie.root;
    let typed = '';
    let miss = 0;

    function getNextKeys() {
      return Object.keys(current.children).sort();
    }

    function getPrimaryNextKey() {
      const keys = getNextKeys();
      return keys[0] || '';
    }

    function isComplete() {
      return current.terminal;
    }

    function getGuide() {
      const remaining = getShortestSuffix(current);
      return {
        typed,
        remaining,
        candidate: `${typed}${remaining}`
      };
    }

    function reset(nextReading) {
      if (typeof nextReading === 'string') {
        trie = buildRomajiTrie(nextReading);
      }
      current = trie.root;
      typed = '';
      miss = 0;
    }

    function inputKey(rawKey) {
      const key = normalizeInputKey(rawKey);
      const expected = getNextKeys();

      if (!key) {
        return {
          accepted: false,
          key: '',
          expected,
          completed: current.terminal,
          typed
        };
      }

      if (!current.children[key]) {
        miss += 1;
        return {
          accepted: false,
          key,
          expected,
          completed: current.terminal,
          typed
        };
      }

      current = current.children[key];
      typed += key;

      return {
        accepted: true,
        key,
        expected: getNextKeys(),
        completed: current.terminal,
        typed
      };
    }

    return {
      inputKey,
      reset,
      isComplete,
      getNextKeys,
      getPrimaryNextKey,
      getGuide,
      getTyped: () => typed,
      getMissCount: () => miss,
      getReading: () => trie.reading,
      getTokens: () => trie.tokens.slice()
    };
  }

  return {
    DIGRAPHS,
    MONOGRAPHS,
    normalizeReading,
    normalizeInputKey,
    tokenizeKana,
    buildRomajiTrie,
    createTypingSession
  };
}));
