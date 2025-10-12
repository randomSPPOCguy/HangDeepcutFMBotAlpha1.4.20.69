/**
 * PokerGame - 3-card poker game utilities.
 * TODO: Port startGame(), dealHands(), evaluateHand(), compareHands(), generateCardImage()
 */
class PokerGame {
  constructor(statsManager, logger) {
    this.statsManager = statsManager;
    this.logger = logger;
    this.active = false;
  }
  startGame() { this.active = true; this.logger.info('Poker game started (placeholder)'); }
}
module.exports = PokerGame;
