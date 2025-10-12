/**
 * QueueManager - optional queue helpers
 */
class QueueManager {
  constructor(logger) { this.logger = logger; this.queue = []; }
  add(item) { this.queue.push(item); }
  next() { return this.queue.shift(); }
  size() { return this.queue.length; }
}
module.exports = QueueManager;
