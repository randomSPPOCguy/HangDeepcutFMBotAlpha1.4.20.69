/**
 * Logger - Simple logging utility with verbosity control
 */
class Logger {
  constructor(verboseMode = false) {
    this.verboseMode = verboseMode;
  }

  log(message) {
    console.log(message);
  }

  info(message) {
    console.log(`ℹ️ ${message}`);
  }

  warn(message) {
    console.log(`⚠️ ${message}`);
  }

  error(message) {
    console.log(`❌ ${message}`);
  }

  debug(message) {
    if (this.verboseMode) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🔍 ${message}`);
    }
  }

  verbose(message) {
    if (this.verboseMode) {
      console.log(message);
    }
  }
}

module.exports = Logger;
