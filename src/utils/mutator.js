class CommentMutator {
  constructor() {
    this.emojis = ['😊', '👍', '❤️', '🔥', '💯', '👏', '🙌', '✨', '💪', '🎉', '😍', '🤩', '😎'];
    
    this.synonyms = {
      'nice': ['great', 'awesome', 'cool', 'amazing', 'fantastic', 'wonderful'],
      'good': ['excellent', 'superb', 'brilliant', 'outstanding', 'terrific'],
      'love': ['adore', 'enjoy', 'appreciate', 'like', 'dig'],
      'interesting': ['fascinating', 'intriguing', 'engaging', 'compelling', 'captivating'],
      'beautiful': ['stunning', 'gorgeous', 'lovely', 'pretty', 'attractive'],
      'great': ['excellent', 'wonderful', 'fantastic', 'amazing', 'superb'],
      'thanks': ['thank you', 'appreciate it', 'much appreciated', 'grateful'],
      'post': ['content', 'share', 'update', 'article', 'piece'],
      'information': ['info', 'details', 'knowledge', 'insights', 'data']
    };

    this.spacingVariations = [
      (text) => text,
      (text) => text + ' ',
      (text) => ' ' + text,
      (text) => text.replace(/\s+/g, '  ') // Double spaces
    ];
  }

  mutateComment(originalComment) {
    let mutated = originalComment;

    // Apply mutations in random order
    const mutations = [
      () => this.replaceSynonyms(mutated),
      () => this.addEmoji(mutated),
      () => this.changeCapitalization(mutated),
      () => this.addSpacing(mutated),
      () => this.addPunctuation(mutated)
    ];

    // Randomly apply 2-3 mutations
    const numMutations = Math.floor(Math.random() * 2) + 2;
    const shuffled = this.shuffleArray(mutations);

    for (let i = 0; i < numMutations && i < shuffled.length; i++) {
      mutated = shuffled[i]();
    }

    return mutated.trim();
  }

  replaceSynonyms(text) {
    let mutated = text;
    
    const words = text.toLowerCase().split(/\s+/);
    const synonymKeys = Object.keys(this.synonyms);

    for (const word of words) {
      const cleanWord = word.replace(/[.,!?]/g, '');
      
      if (synonymKeys.includes(cleanWord)) {
        const synonymList = this.synonyms[cleanWord];
        const replacement = synonymList[Math.floor(Math.random() * synonymList.length)];
        
        // Match original case
        const finalReplacement = this.matchCase(cleanWord, word, replacement);
        mutated = mutated.replace(new RegExp(`\\b${word}\\b`, 'i'), finalReplacement);
        break; // Only replace one word
      }
    }

    return mutated;
  }

  matchCase(original, wordWithPunc, replacement) {
    // Check if original word starts with capital
    if (original[0] === original[0].toUpperCase()) {
      replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    
    // Preserve punctuation
    const punc = wordWithPunc.replace(/[a-zA-Z]/g, '').trim();
    if (punc) {
      replacement += punc;
    }

    return replacement;
  }

  addEmoji(text) {
    // 60% chance to add emoji
    if (Math.random() < 0.6) {
      const emoji = this.emojis[Math.floor(Math.random() * this.emojis.length)];
      
      // Randomly add at beginning or end
      if (Math.random() < 0.5) {
        return emoji + ' ' + text;
      } else {
        return text + ' ' + emoji;
      }
    }
    
    return text;
  }

  changeCapitalization(text) {
    // Small chance to change capitalization
    if (Math.random() < 0.3) {
      // Capitalize first letter if not already
      if (text[0] === text[0].toLowerCase()) {
        return text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
    
    return text;
  }

  addSpacing(text) {
    // Sometimes add extra space or trim
    const variation = this.spacingVariations[Math.floor(Math.random() * this.spacingVariations.length)];
    return variation(text);
  }

  addPunctuation(text) {
    // Add or modify punctuation
    if (Math.random() < 0.4) {
      const lastChar = text[text.length - 1];
      
      if (lastChar !== '!' && lastChar !== '.' && lastChar !== '?') {
        const punctuations = ['!', '.', '!!', '...'];
        const punc = punctuations[Math.floor(Math.random() * punctuations.length)];
        return text + punc;
      }
    }
    
    return text;
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Generate multiple unique variations
  generateVariations(text, count = 5) {
    const variations = new Set();
    variations.add(text); // Include original

    let attempts = 0;
    while (variations.size < count && attempts < count * 3) {
      const mutated = this.mutateComment(text);
      variations.add(mutated);
      attempts++;
    }

    return Array.from(variations);
  }
}

module.exports = CommentMutator;
