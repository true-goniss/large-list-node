// singleton..
class Logger {
    constructor() {
        if (Logger.instance) {
            return Logger.instance;
        }

        Logger.instance = this;
        return this;
    }

    Log(...args) {
        const loggingEnabled = args[args.length - 1];
        if (typeof loggingEnabled === 'boolean' && loggingEnabled) {
            console.log(...args.slice(0, -1));
        }
    }
}

module.exports = new Logger();