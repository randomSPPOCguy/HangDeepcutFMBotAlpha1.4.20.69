/**
 * HolidayDecorator - Detects current holiday and provides themed emojis
 */
class HolidayDecorator {
  constructor(logger) {
    this.logger = logger;
    this.currentHoliday = this.detectCurrentHoliday();
    this.holidayEmojis = this.getHolidayEmojis();
    
    if (this.currentHoliday !== 'none') {
      this.logger.log(`🎉 Holiday theme: ${this.currentHoliday} ${this.holidayEmojis.icon}`);
    }
  }

  detectCurrentHoliday() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();

    // Halloween (October)
    if (month === 10) {
      return 'halloween';
    }
    
    // Thanksgiving (November, US 4th Thursday)
    if (month === 11) {
      return 'thanksgiving';
    }
    
    // Christmas season (December)
    if (month === 12) {
      return 'christmas';
    }
    
    // New Year (January 1-7)
    if (month === 1 && day <= 7) {
      return 'newyear';
    }
    
    // Valentine's Day (February 14)
    if (month === 2 && day === 14) {
      return 'valentines';
    }
    
    // St. Patrick's Day (March 17)
    if (month === 3 && day === 17) {
      return 'stpatricks';
    }
    
    // 4th of July
    if (month === 7 && day === 4) {
      return 'july4th';
    }
    
    return 'none';
  }

  getHolidayEmojis() {
    const emojis = {
      halloween: {
        icon: '🎃',
        emojis: ['🎃', '👻', '🦇', '🕷️', '🕸️', '💀', '🧙', '🧛', '🧟', '🍬', '🍭']
      },
      thanksgiving: {
        icon: '🦃',
        emojis: ['🦃', '🍂', '🍁', '🌽', '🥧', '🍽️', '🙏']
      },
      christmas: {
        icon: '🎄',
        emojis: ['🎄', '🎅', '⛄', '🎁', '❄️', '🔔', '⭐', '🦌', '🤶', '🎀']
      },
      newyear: {
        icon: '🎉',
        emojis: ['🎉', '🎊', '🥳', '🍾', '🥂', '✨', '🎆', '🎇']
      },
      valentines: {
        icon: '💝',
        emojis: ['💝', '💖', '💗', '💓', '💕', '💘', '❤️', '🌹', '💐']
      },
      stpatricks: {
        icon: '☘️',
        emojis: ['☘️', '🍀', '💚', '🌈', '🎩']
      },
      july4th: {
        icon: '🎆',
        emojis: ['🎆', '🎇', '🇺🇸', '🗽', '🦅', '🎉']
      },
      none: {
        icon: '🎵',
        emojis: ['🎵', '🎶', '🎧', '🎸', '🎹', '🎤', '🎺', '🎷', '🥁']
      }
    };

    return emojis[this.currentHoliday] || emojis.none;
  }

  getRandomEmoji() {
    const emojis = this.holidayEmojis.emojis;
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  decorateMessage(message) {
    const emoji = this.getRandomEmoji();
    return `${emoji} ${message} ${emoji}`;
  }
}

module.exports = HolidayDecorator;
